/**
 * HTTP-transport security helpers.
 *
 * - Configurable CORS allowlist (defaults to "*", but can be locked down via
 *   COUNTLY_CORS_ALLOWED_ORIGINS).
 * - In-memory per-IP rate limiter on the `/mcp` endpoint (bounded memory,
 *   sliding window, no external dependency).
 */

/**
 * Parse the `COUNTLY_CORS_ALLOWED_ORIGINS` env var.
 *
 * - `undefined` / empty / `"*"` → `"*"` sentinel (wide-open, current default)
 * - `"https://a.com,https://b.com"` → array of trimmed non-empty origins
 */
export type CorsAllowed = '*' | string[];

export function parseCorsAllowed(raw: string | undefined): CorsAllowed {
  const trimmed = (raw ?? '').trim();
  if (trimmed === '' || trimmed === '*') {
    return '*';
  }
  const origins = trimmed
    .split(',')
    .map((o) => o.trim())
    .filter((o) => o.length > 0);
  return origins.length > 0 ? origins : '*';
}

/**
 * Decide the value of the `Access-Control-Allow-Origin` header to return
 * for an incoming request, or `null` to omit it entirely (i.e. forbid the
 * cross-origin request).
 */
export function resolveCorsOrigin(
  allowed: CorsAllowed,
  requestOrigin: string | undefined
): string | null {
  if (allowed === '*') {
    return '*';
  }
  if (!requestOrigin) {
    // No Origin header (e.g. server-to-server): we don't need to emit CORS
    // headers at all.
    return null;
  }
  return allowed.includes(requestOrigin) ? requestOrigin : null;
}

/**
 * Simple in-memory sliding-window rate limiter, keyed by client IP.
 *
 * Each IP may make at most `maxRequests` requests per `windowMs` milliseconds.
 * State is an array of recent timestamps per IP. Entries older than the
 * window are pruned on every call, and the whole map is capped so a flood of
 * unique IPs cannot use unlimited memory.
 *
 * This is intentionally lightweight — not a replacement for a CDN/WAF on a
 * production-exposed deployment, but it removes the "anyone can trivially
 * DoS the MCP server" primitive.
 */
export interface RateLimiterOptions {
  windowMs?: number;
  maxRequests?: number;
  maxTrackedKeys?: number;
}

export class RateLimiter {
  private readonly windowMs: number;
  private readonly maxRequests: number;
  private readonly maxTrackedKeys: number;
  private readonly hits = new Map<string, number[]>();

  constructor(opts: RateLimiterOptions = {}) {
    this.windowMs = opts.windowMs ?? 60_000; // 1 minute default
    this.maxRequests = opts.maxRequests ?? 120; // 120 req/min default
    this.maxTrackedKeys = opts.maxTrackedKeys ?? 10_000;
  }

  /**
   * Register a hit for `key`. Returns `{ok: true}` if the request is under
   * the limit, or `{ok: false, retryAfterSeconds}` if over.
   */
  check(key: string, now: number = Date.now()): { ok: true } | { ok: false; retryAfterSeconds: number } {
    // Prune oldest single entry if we're at capacity and this is a new key
    if (!this.hits.has(key) && this.hits.size >= this.maxTrackedKeys) {
      const oldest = this.hits.keys().next().value;
      if (oldest !== undefined) {
        this.hits.delete(oldest);
      }
    }

    const cutoff = now - this.windowMs;
    const arr = this.hits.get(key) ?? [];
    // Drop timestamps outside the window
    let firstFresh = 0;
    while (firstFresh < arr.length && arr[firstFresh] < cutoff) {
      firstFresh++;
    }
    const windowed = firstFresh > 0 ? arr.slice(firstFresh) : arr;

    if (windowed.length >= this.maxRequests) {
      // Retry-After is the number of seconds until the oldest in-window hit expires
      const retryAfterMs = windowed[0] + this.windowMs - now;
      const retryAfterSeconds = Math.max(1, Math.ceil(retryAfterMs / 1000));
      this.hits.set(key, windowed);
      return { ok: false, retryAfterSeconds };
    }

    windowed.push(now);
    this.hits.set(key, windowed);
    return { ok: true };
  }

  /** Current number of tracked keys. Exposed for testing. */
  size(): number {
    return this.hits.size;
  }

  /** Drop all state (testing / graceful reset). */
  reset(): void {
    this.hits.clear();
  }
}

/**
 * Best-effort client IP extraction for rate-limiting keys.
 *
 * Prefers the last-hop value from X-Forwarded-For when an explicit
 * `trustedProxies` env is set; otherwise uses the raw socket address. We do
 * NOT trust arbitrary XFF headers by default (clients can forge them) —
 * operators must opt in via `COUNTLY_TRUST_PROXY=true`.
 */
export function extractClientIp(
  headers: Record<string, string | string[] | undefined>,
  socketRemoteAddress: string | undefined,
  trustProxy: boolean
): string {
  if (trustProxy) {
    const xff = headers['x-forwarded-for'];
    const xffStr = Array.isArray(xff) ? xff[0] : xff;
    if (xffStr) {
      // X-Forwarded-For: client, proxy1, proxy2 → first is originating client
      const first = xffStr.split(',')[0].trim();
      if (first) {
        return first;
      }
    }
  }
  return socketRemoteAddress ?? 'unknown';
}

/**
 * Per-IP concurrent-connection limiter.
 *
 * Node's raw http.createServer has no per-IP cap. A single client can open
 * thousands of TCP connections — slow-loris and connection-exhaustion
 * territory. Track in-flight sockets per IP and reject new ones above the
 * threshold by destroying the socket before it handshakes anything
 * application-level.
 *
 * Used as a `server.on('connection', ...)` listener.
 */
export class ConcurrencyLimiter {
  private readonly counts = new Map<string, number>();
  private readonly max: number;

  constructor(maxPerIp: number) {
    this.max = maxPerIp;
  }

  /**
   * Register a new connection. Returns true if the connection is accepted,
   * false if it should be rejected (socket destroyed by caller).
   */
  accept(ip: string): boolean {
    const current = this.counts.get(ip) ?? 0;
    if (current >= this.max) {
      return false;
    }
    this.counts.set(ip, current + 1);
    return true;
  }

  release(ip: string): void {
    const current = this.counts.get(ip) ?? 0;
    if (current <= 1) {
      this.counts.delete(ip);
    } else {
      this.counts.set(ip, current - 1);
    }
  }

  /** Current live connection count for an IP (for testing). */
  count(ip: string): number {
    return this.counts.get(ip) ?? 0;
  }

  /** Total number of tracked IPs (for testing). */
  size(): number {
    return this.counts.size;
  }
}

/**
 * Parse a Content-Length header safely. Returns null when missing or
 * unparseable (which means the caller will have to rely on a streaming
 * check or a request timeout). A Content-Length of 0 is returned as 0,
 * not null.
 */
export function parseContentLength(raw: string | string[] | undefined): number | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const n = parseInt(value, 10);
  if (!Number.isFinite(n) || n < 0 || String(n) !== value.trim()) {
    return null;
  }
  return n;
}

/**
 * Enforce a maximum request body size.
 *
 * 1. Reject upfront if the caller's Content-Length header already exceeds
 *    the limit (or if the header is missing and we're strict about it).
 * 2. Attach a streaming data listener that destroys the request if bytes
 *    received exceed the limit. This catches chunked transfers and clients
 *    that lie about Content-Length.
 *
 * Returns true if the request is under the limit (keep processing) or false
 * if it was already rejected (caller should stop).
 */
export function enforceBodySizeLimit(
  req: {
    headers: Record<string, string | string[] | undefined>;
    on: (event: 'data' | 'aborted' | 'end', handler: (arg?: unknown) => void) => unknown;
    destroy: (err?: Error) => void;
  },
  res: { writeHead: (code: number, headers?: Record<string, string>) => unknown; end: (body?: string) => unknown; headersSent?: boolean },
  maxBytes: number
): boolean {
  const declared = parseContentLength(req.headers['content-length']);
  if (declared !== null && declared > maxBytes) {
    res.writeHead(413, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      error: 'Payload too large',
      max_bytes: maxBytes,
      declared_content_length: declared,
    }));
    // Also close the socket so a malicious client can't keep sending bytes.
    req.destroy();
    return false;
  }

  let received = 0;
  let killed = false;
  req.on('data', (chunk: unknown) => {
    if (killed) {
      return;
    }
    // Chunks are Buffers or strings in practice.
    const len = chunk && typeof chunk === 'object' && 'length' in chunk
      ? (chunk as { length: number }).length
      : typeof chunk === 'string'
        ? (chunk as string).length
        : 0;
    received += len;
    if (received > maxBytes) {
      killed = true;
      if (!res.headersSent) {
        res.writeHead(413, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          error: 'Payload too large',
          max_bytes: maxBytes,
        }));
      }
      req.destroy();
    }
  });
  return true;
}

/**
 * Fields logged per request when structured request logging is enabled.
 */
export interface RequestLogEntry {
  ts: string;
  ip: string;
  method: string;
  path: string;
  status: number;
  durationMs: number;
  rateLimitHit?: boolean;
  bodyBytes?: number;
}

/**
 * Format a request log entry as a single NDJSON line.
 *
 * Operators can tail stderr and pipe into their log aggregator. We emit
 * only the fields listed in RequestLogEntry — no headers, no bodies, no
 * token material.
 */
export function formatRequestLog(entry: RequestLogEntry): string {
  return JSON.stringify(entry);
}
