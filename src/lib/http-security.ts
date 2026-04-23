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
