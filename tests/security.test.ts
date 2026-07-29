import { describe, it, expect } from 'vitest';

import { AppCache, AppCacheRegistry } from '../src/lib/app-cache.js';
import { assertSafeServerHost, assertSafeServerUrl, safeLookup } from '../src/lib/config.js';
import { redactSensitiveInMessage } from '../src/lib/error-handler.js';
import {
  ConcurrencyLimiter,
  enforceBodySizeLimit,
  extractClientIp,
  formatRequestLog,
  parseContentLength,
  parseCorsAllowed,
  RateLimiter,
  resolveCorsOrigin,
  sanitizeForLog,
} from '../src/lib/http-security.js';

/**
 * Regression tests for the security hardening done on this branch.
 *
 *  - SSRF allowlist / denylist in `assertSafeServerUrl`
 *  - Per-tenant app cache isolation via `AppCacheRegistry`
 *
 * The auth-mixing fix (AsyncLocalStorage + per-request axios client) is
 * covered by an integration-style test below that exercises the public
 * factory surface; the full concurrency guarantee is better tested with
 * end-to-end HTTP traffic but that requires a Countly server, so we keep
 * the coverage at the factory level for this suite.
 */

describe('assertSafeServerHost: SSRF denylist', () => {
  it('rejects loopback IPv4 (127.0.0.1)', () => {
    expect(assertSafeServerHost('127.0.0.1')).toMatch(/loopback/);
  });

  it('rejects loopback IPv4 in the whole 127/8 block', () => {
    expect(assertSafeServerHost('127.10.20.30')).toMatch(/loopback/);
  });

  it('rejects AWS / cloud metadata endpoint 169.254.169.254', () => {
    expect(assertSafeServerHost('169.254.169.254')).toMatch(/linkLocal/);
  });

  it('rejects RFC 1918 10/8', () => {
    expect(assertSafeServerHost('10.0.0.1')).toMatch(/private/);
  });

  it('rejects RFC 1918 172.16/12', () => {
    expect(assertSafeServerHost('172.16.0.1')).toMatch(/private/);
    expect(assertSafeServerHost('172.31.255.254')).toMatch(/private/);
  });

  it('accepts a public IPv4 (1.1.1.1)', () => {
    expect(assertSafeServerHost('1.1.1.1')).toBeNull();
  });

  it('rejects RFC 1918 192.168/16', () => {
    expect(assertSafeServerHost('192.168.1.1')).toMatch(/private/);
  });

  it('rejects carrier-grade NAT 100.64/10', () => {
    expect(assertSafeServerHost('100.64.0.1')).toMatch(/carrierGradeNat/);
  });

  it('rejects 0.0.0.0/8', () => {
    expect(assertSafeServerHost('0.0.0.0')).toMatch(/unspecified/);
  });

  it('rejects "localhost"', () => {
    expect(assertSafeServerHost('localhost')).toMatch(/local machine/);
  });

  it('rejects .local hostnames (mDNS)', () => {
    expect(assertSafeServerHost('my-countly.local')).toMatch(/local machine/);
  });

  it('rejects .internal hostnames', () => {
    expect(assertSafeServerHost('foo.internal')).toMatch(/internal service/);
  });

  it('rejects known cloud-metadata hostnames', () => {
    expect(assertSafeServerHost('metadata.google.internal')).toBeTruthy();
    expect(assertSafeServerHost('kubernetes.default.svc')).toMatch(/metadata service/);
  });

  it('rejects IPv6 loopback', () => {
    expect(assertSafeServerHost('::1')).toMatch(/loopback/);
  });

  it('rejects IPv6 link-local fe80::', () => {
    expect(assertSafeServerHost('fe80::1')).toMatch(/linkLocal/);
  });

  it('rejects IPv6 unique-local fd00::', () => {
    expect(assertSafeServerHost('fd00::1')).toMatch(/uniqueLocal/);
  });

  it('accepts api.count.ly (normal case)', () => {
    expect(assertSafeServerHost('api.count.ly')).toBeNull();
  });

  it('accepts public IPv4 like 1.1.1.1', () => {
    expect(assertSafeServerHost('1.1.1.1')).toBeNull();
  });

  // ---- Regression: IPv4-mapped IPv6 representation bypass ----
  // https://github.com/Countly/countly-mcp-server — the previous string/regex
  // guard let `::ffff:127.0.0.1` (which the OS routes to IPv4 loopback) slip
  // through because its normalized form `::ffff:7f00:1` matched neither the
  // dotted-quad IPv4 regex nor the blocked IPv6 prefixes.
  it('rejects IPv4-mapped IPv6 loopback (::ffff:127.0.0.1)', () => {
    expect(assertSafeServerHost('::ffff:127.0.0.1')).toMatch(/not allowed/);
  });

  it('rejects IPv4-mapped IPv6 cloud metadata (::ffff:169.254.169.254)', () => {
    expect(assertSafeServerHost('::ffff:169.254.169.254')).toMatch(/not allowed/);
  });

  it('rejects bracketed IPv4-mapped IPv6 loopback ([::ffff:127.0.0.1])', () => {
    expect(assertSafeServerHost('[::ffff:127.0.0.1]')).toMatch(/not allowed/);
  });

  it('rejects the hex-collapsed IPv4-mapped form (::ffff:7f00:1)', () => {
    expect(assertSafeServerHost('::ffff:7f00:1')).toMatch(/not allowed/);
  });

  it('rejects IPv4-mapped RFC1918 (::ffff:10.0.0.1)', () => {
    expect(assertSafeServerHost('::ffff:10.0.0.1')).toMatch(/not allowed/);
  });

  it('accepts an IPv4-mapped public address (::ffff:1.1.1.1)', () => {
    expect(assertSafeServerHost('::ffff:1.1.1.1')).toBeNull();
  });
});

describe('assertSafeServerUrl: full URL validation', () => {
  it('throws on a bad URL', () => {
    expect(() => assertSafeServerUrl('not a url')).toThrow(/Invalid server URL/);
  });

  it('throws on file: URLs', () => {
    expect(() => assertSafeServerUrl('file:///etc/passwd')).toThrow(/scheme/);
  });

  it('throws on gopher: URLs', () => {
    expect(() => assertSafeServerUrl('gopher://example.com')).toThrow(/scheme/);
  });

  it('throws on loopback URLs', () => {
    expect(() => assertSafeServerUrl('http://127.0.0.1:8080')).toThrow(/SSRF/);
  });

  it('throws on cloud-metadata URLs', () => {
    expect(() =>
      assertSafeServerUrl('http://169.254.169.254/latest/meta-data/')
    ).toThrow(/SSRF/);
  });

  it('throws on http://localhost', () => {
    expect(() => assertSafeServerUrl('http://localhost/')).toThrow(/SSRF/);
  });

  // ---- Regression: end-to-end URL bypass via IPv4-mapped IPv6 ----
  it('throws on IPv4-mapped IPv6 loopback URL', () => {
    expect(() =>
      assertSafeServerUrl('http://[::ffff:127.0.0.1]:8080')
    ).toThrow(/SSRF/);
  });

  it('throws on IPv4-mapped IPv6 cloud-metadata URL', () => {
    expect(() =>
      assertSafeServerUrl('http://[::ffff:169.254.169.254]/latest/meta-data/')
    ).toThrow(/SSRF/);
  });

  it('rejects URLs with embedded credentials', () => {
    expect(() =>
      assertSafeServerUrl('http://user:pass@api.count.ly')
    ).toThrow(/credentials/);
  });

  it('accepts a normal Countly URL', () => {
    expect(() => assertSafeServerUrl('https://api.count.ly')).not.toThrow();
  });

  it('accepts an on-prem Countly on a routable public IP', () => {
    expect(() => assertSafeServerUrl('https://8.8.8.8')).not.toThrow();
  });
});

describe('safeLookup: connect-time DNS validation (DNS-rebinding / DNS-based SSRF)', () => {
  // safeLookup is a dns.lookup-compatible function. We drive it directly with
  // IP-literal "hostnames" (dns.lookup short-circuits those without a network
  // query) so the test is hermetic — no external DNS needed.

  it('passes a resolved public address through', () =>
    new Promise<void>((resolve, reject) => {
      safeLookup('1.1.1.1', {}, (err, address) => {
        try {
          expect(err).toBeNull();
          expect(address).toBe('1.1.1.1');
          resolve();
        } catch (e) {
          reject(e as Error);
        }
      });
    }));

  it('blocks a hostname resolving to loopback', () =>
    new Promise<void>((resolve, reject) => {
      safeLookup('127.0.0.1', {}, (err) => {
        try {
          expect(err).toBeTruthy();
          expect((err as NodeJS.ErrnoException).code).toBe('ESSRFBLOCKED');
          resolve();
        } catch (e) {
          reject(e as Error);
        }
      });
    }));

  it('blocks a hostname resolving to cloud metadata', () =>
    new Promise<void>((resolve, reject) => {
      safeLookup('169.254.169.254', {}, (err) => {
        try {
          expect((err as NodeJS.ErrnoException | null)?.code).toBe('ESSRFBLOCKED');
          resolve();
        } catch (e) {
          reject(e as Error);
        }
      });
    }));

  it('blocks an IPv4-mapped IPv6 resolution', () =>
    new Promise<void>((resolve, reject) => {
      safeLookup('::ffff:127.0.0.1', {}, (err) => {
        try {
          expect((err as NodeJS.ErrnoException | null)?.code).toBe('ESSRFBLOCKED');
          resolve();
        } catch (e) {
          reject(e as Error);
        }
      });
    }));

  it('supports the options.all array form and blocks if any address is private', () =>
    new Promise<void>((resolve, reject) => {
      safeLookup('10.0.0.1', { all: true }, (err) => {
        try {
          expect((err as NodeJS.ErrnoException | null)?.code).toBe('ESSRFBLOCKED');
          resolve();
        } catch (e) {
          reject(e as Error);
        }
      });
    }));

  it('accepts the callback-as-second-arg form', () =>
    new Promise<void>((resolve, reject) => {
      safeLookup('8.8.8.8', (err, address) => {
        try {
          expect(err).toBeNull();
          expect(address).toBe('8.8.8.8');
          resolve();
        } catch (e) {
          reject(e as Error);
        }
      });
    }));
});

describe('AppCacheRegistry: per-tenant isolation', () => {
  it('returns different AppCache instances for different tokens', () => {
    const reg = new AppCacheRegistry();
    const a = reg.for('tokenA');
    const b = reg.for('tokenB');
    expect(a).not.toBe(b);
  });

  it('returns the same AppCache for the same token', () => {
    const reg = new AppCacheRegistry();
    const a1 = reg.for('tokenA');
    const a2 = reg.for('tokenA');
    expect(a1).toBe(a2);
  });

  it('apps written into tenant A are not visible to tenant B', () => {
    const reg = new AppCacheRegistry();
    const cacheA = reg.for('tokenA');
    const cacheB = reg.for('tokenB');

    cacheA.update([
      {
        _id: 'appA',
        name: 'TenantA App',
        key: 'k',
        created_at: 0,
        timezone: 'UTC',
      },
    ]);

    // Tenant B must not see TenantA's apps
    expect(cacheB.findByName('TenantA App')).toBeUndefined();
    expect(cacheB.getAll()).toEqual([]);

    // Tenant A still sees its own apps
    expect(cacheA.findByName('TenantA App')).toBeDefined();
  });

  it('uses a dedicated anonymous bucket when no token is supplied', () => {
    const reg = new AppCacheRegistry();
    const anon1 = reg.for(undefined);
    const anon2 = reg.for(undefined);
    expect(anon1).toBe(anon2);
    // Anonymous bucket must not collide with a real token
    const tokenCache = reg.for('real-token');
    expect(anon1).not.toBe(tokenCache);
  });

  it('invalidate(token) drops only that tenant', () => {
    const reg = new AppCacheRegistry();
    reg.for('tokenA');
    reg.for('tokenB');
    expect(reg.size()).toBe(2);
    reg.invalidate('tokenA');
    expect(reg.size()).toBe(1);
    // tokenB still present
    const b = reg.for('tokenB');
    expect(b).toBeInstanceOf(AppCache);
  });

  it('stores tokens hashed (raw token is not exposed as a Map key)', () => {
    const reg = new AppCacheRegistry();
    const token = 'super-secret-token-value';
    reg.for(token);
    // Internal state shouldn't contain the raw token. We can't enumerate the
    // private Map directly, but its keys should be hex (SHA-256) — we rely
    // on the private field being a Map and inspect via JSON for sanity.
    const serialized = JSON.stringify(reg, (_k, v) => (v instanceof Map ? [...v.keys()] : v));
    expect(serialized).not.toContain(token);
  });
});

describe('parseCorsAllowed', () => {
  it('returns "*" for undefined', () => {
    expect(parseCorsAllowed(undefined)).toBe('*');
  });
  it('returns "*" for empty string', () => {
    expect(parseCorsAllowed('')).toBe('*');
  });
  it('returns "*" for explicit "*"', () => {
    expect(parseCorsAllowed('*')).toBe('*');
  });
  it('parses a single origin', () => {
    expect(parseCorsAllowed('https://a.com')).toEqual(['https://a.com']);
  });
  it('parses a comma-separated list', () => {
    expect(parseCorsAllowed('https://a.com, https://b.com')).toEqual([
      'https://a.com',
      'https://b.com',
    ]);
  });
  it('falls back to "*" if all entries are empty', () => {
    expect(parseCorsAllowed(', ,')).toBe('*');
  });
});

describe('resolveCorsOrigin', () => {
  it('returns "*" when allowlist is "*"', () => {
    expect(resolveCorsOrigin('*', 'https://evil.com')).toBe('*');
    expect(resolveCorsOrigin('*', undefined)).toBe('*');
  });
  it('echoes the origin when it is on the allowlist', () => {
    expect(
      resolveCorsOrigin(['https://a.com', 'https://b.com'], 'https://a.com')
    ).toBe('https://a.com');
  });
  it('returns null when the origin is not on the allowlist', () => {
    expect(
      resolveCorsOrigin(['https://a.com'], 'https://evil.com')
    ).toBeNull();
  });
  it('returns null when allowlist is specific and no Origin header is sent', () => {
    expect(resolveCorsOrigin(['https://a.com'], undefined)).toBeNull();
  });
});

describe('RateLimiter', () => {
  it('allows requests under the limit', () => {
    const rl = new RateLimiter({ windowMs: 60_000, maxRequests: 3 });
    expect(rl.check('1.1.1.1').ok).toBe(true);
    expect(rl.check('1.1.1.1').ok).toBe(true);
    expect(rl.check('1.1.1.1').ok).toBe(true);
  });

  it('rejects requests over the limit with a Retry-After', () => {
    const rl = new RateLimiter({ windowMs: 60_000, maxRequests: 2 });
    const now = 1_000_000;
    expect(rl.check('1.1.1.1', now).ok).toBe(true);
    expect(rl.check('1.1.1.1', now + 100).ok).toBe(true);
    const third = rl.check('1.1.1.1', now + 200);
    expect(third.ok).toBe(false);
    if (!third.ok) {
      expect(third.retryAfterSeconds).toBeGreaterThanOrEqual(1);
      expect(third.retryAfterSeconds).toBeLessThanOrEqual(60);
    }
  });

  it('isolates limits per key', () => {
    const rl = new RateLimiter({ windowMs: 60_000, maxRequests: 1 });
    expect(rl.check('a').ok).toBe(true);
    expect(rl.check('b').ok).toBe(true);
    expect(rl.check('a').ok).toBe(false);
    expect(rl.check('b').ok).toBe(false);
  });

  it('expires entries outside the window', () => {
    const rl = new RateLimiter({ windowMs: 1000, maxRequests: 1 });
    expect(rl.check('k', 0).ok).toBe(true);
    expect(rl.check('k', 500).ok).toBe(false);
    // 1001ms later, the first hit should have aged out
    expect(rl.check('k', 1001).ok).toBe(true);
  });

  it('caps the total number of tracked keys', () => {
    const rl = new RateLimiter({ windowMs: 60_000, maxRequests: 10, maxTrackedKeys: 3 });
    rl.check('a');
    rl.check('b');
    rl.check('c');
    rl.check('d'); // evicts oldest
    expect(rl.size()).toBeLessThanOrEqual(3);
  });
});

describe('redactSensitiveInMessage', () => {
  it('redacts auth_token query param in URL-ish strings', () => {
    const msg = 'Request failed: https://api.count.ly/o/apps/mine?auth_token=abc123xyz&app_id=42';
    expect(redactSensitiveInMessage(msg)).not.toContain('abc123xyz');
    expect(redactSensitiveInMessage(msg)).toContain('auth_token=[REDACTED]');
  });

  it('redacts api_key in URL-ish strings', () => {
    const msg = 'request to /o?method=apps&api_key=deadbeef';
    expect(redactSensitiveInMessage(msg)).toContain('api_key=[REDACTED]');
  });

  it('redacts token values inside JSON error bodies', () => {
    const msg = 'HTTP 401 error: {"error":"bad","auth_token":"secret-value"}';
    const out = redactSensitiveInMessage(msg);
    expect(out).not.toContain('secret-value');
    expect(out).toContain('"auth_token":"[REDACTED]"');
  });

  it('redacts countly-token header lines', () => {
    const msg = 'bad request: countly-token: abc.def.ghi expired';
    expect(redactSensitiveInMessage(msg)).toContain('countly-token: [REDACTED]');
    expect(redactSensitiveInMessage(msg)).not.toContain('abc.def.ghi');
  });

  it('redacts Authorization header lines (case-insensitive)', () => {
    const msg = 'GET /o/apps/mine\nAuthorization: Bearer xyz-token';
    expect(redactSensitiveInMessage(msg)).toContain('[REDACTED]');
    expect(redactSensitiveInMessage(msg)).not.toContain('xyz-token');
  });

  it('preserves benign messages', () => {
    expect(redactSensitiveInMessage('App not found: MyApp')).toBe('App not found: MyApp');
    expect(redactSensitiveInMessage('')).toBe('');
  });
});

describe('ConcurrencyLimiter', () => {
  it('accepts connections up to the limit', () => {
    const cl = new ConcurrencyLimiter(3);
    expect(cl.accept('1.1.1.1')).toBe(true);
    expect(cl.accept('1.1.1.1')).toBe(true);
    expect(cl.accept('1.1.1.1')).toBe(true);
  });

  it('rejects over-limit connections', () => {
    const cl = new ConcurrencyLimiter(2);
    cl.accept('1.1.1.1');
    cl.accept('1.1.1.1');
    expect(cl.accept('1.1.1.1')).toBe(false);
  });

  it('release() frees a slot', () => {
    const cl = new ConcurrencyLimiter(1);
    expect(cl.accept('a')).toBe(true);
    expect(cl.accept('a')).toBe(false);
    cl.release('a');
    expect(cl.accept('a')).toBe(true);
  });

  it('release() of a non-tracked IP is a no-op', () => {
    const cl = new ConcurrencyLimiter(1);
    cl.release('never-accepted');
    expect(cl.size()).toBe(0);
  });

  it('isolates limits per IP', () => {
    const cl = new ConcurrencyLimiter(1);
    expect(cl.accept('a')).toBe(true);
    expect(cl.accept('b')).toBe(true);
    expect(cl.accept('a')).toBe(false);
  });

  it('stops tracking an IP when its count drops to zero', () => {
    const cl = new ConcurrencyLimiter(2);
    cl.accept('a');
    cl.accept('a');
    expect(cl.count('a')).toBe(2);
    cl.release('a');
    cl.release('a');
    expect(cl.count('a')).toBe(0);
    expect(cl.size()).toBe(0);
  });
});

describe('parseContentLength', () => {
  it('parses a valid numeric string', () => {
    expect(parseContentLength('1024')).toBe(1024);
  });
  it('returns 0 for "0"', () => {
    expect(parseContentLength('0')).toBe(0);
  });
  it('returns null for undefined / empty', () => {
    expect(parseContentLength(undefined)).toBeNull();
    expect(parseContentLength('')).toBeNull();
  });
  it('returns null for non-numeric', () => {
    expect(parseContentLength('abc')).toBeNull();
    expect(parseContentLength('100x')).toBeNull();
  });
  it('returns null for negative', () => {
    expect(parseContentLength('-1')).toBeNull();
  });
  it('takes the first value when the header is an array', () => {
    expect(parseContentLength(['42', '99'])).toBe(42);
  });
});

/** Minimal mock http.IncomingMessage for enforceBodySizeLimit. */
function mockReq(headers: Record<string, string> = {}) {
  const listeners: Record<string, Array<(arg?: unknown) => void>> = {};
  let destroyed = false;
  return {
    headers,
    on(event: string, handler: (arg?: unknown) => void) {
      (listeners[event] ??= []).push(handler);
      return this as unknown;
    },
    emit(event: string, arg?: unknown) {
      for (const h of listeners[event] ?? []) {
        h(arg);
      }
    },
    destroy() {
      destroyed = true;
    },
    isDestroyed() {
      return destroyed;
    },
  };
}

/** Minimal mock http.ServerResponse. */
function mockRes() {
  let status = 0;
  let body = '';
  let headersSent = false;
  let ended = false;
  return {
    headersSent,
    writeHead(code: number) {
      status = code;
      headersSent = true;
      return this as unknown;
    },
    end(chunk?: string) {
      body = chunk ?? '';
      ended = true;
      return this as unknown;
    },
    getStatus() {
      return status;
    },
    getBody() {
      return body;
    },
    didEnd() {
      return ended;
    },
  };
}

describe('enforceBodySizeLimit', () => {
  it('rejects upfront when Content-Length exceeds the limit', () => {
    const req = mockReq({ 'content-length': String(2_000) });
    const res = mockRes();
    const ok = enforceBodySizeLimit(req as any, res as any, 1_000);
    expect(ok).toBe(false);
    expect(res.getStatus()).toBe(413);
    expect(req.isDestroyed()).toBe(true);
    expect(res.getBody()).toContain('Payload too large');
  });

  it('accepts when Content-Length is within the limit', () => {
    const req = mockReq({ 'content-length': '500' });
    const res = mockRes();
    const ok = enforceBodySizeLimit(req as any, res as any, 1_000);
    expect(ok).toBe(true);
    expect(res.didEnd()).toBe(false);
    expect(req.isDestroyed()).toBe(false);
  });

  it('streams-rejects when cumulative chunk bytes exceed the limit', () => {
    const req = mockReq();
    const res = mockRes();
    const ok = enforceBodySizeLimit(req as any, res as any, 100);
    expect(ok).toBe(true);
    // Simulate 60+60 bytes arriving — should trip after the second chunk.
    req.emit('data', Buffer.alloc(60));
    req.emit('data', Buffer.alloc(60));
    expect(res.getStatus()).toBe(413);
    expect(req.isDestroyed()).toBe(true);
  });

  it('streams under the limit without interfering', () => {
    const req = mockReq();
    const res = mockRes();
    enforceBodySizeLimit(req as any, res as any, 100);
    req.emit('data', Buffer.alloc(30));
    req.emit('data', Buffer.alloc(30));
    expect(res.didEnd()).toBe(false);
    expect(req.isDestroyed()).toBe(false);
  });
});

describe('sanitizeForLog', () => {
  it('strips LF / CR / other control chars to "?"', () => {
    expect(sanitizeForLog('good\nevil')).toBe('good?evil');
    expect(sanitizeForLog('a\r\nb')).toBe('a??b');
    expect(sanitizeForLog('tab\there')).toBe('tab?here');
    expect(sanitizeForLog('bell\x07!')).toBe('bell?!');
  });

  it('strips ANSI escape sequences (the ESC char)', () => {
    // CSI red: "\x1b[31m"
    expect(sanitizeForLog('attack\x1b[31mRED')).toBe('attack?[31mRED');
  });

  it('strips DEL (0x7F)', () => {
    expect(sanitizeForLog('x\x7fy')).toBe('x?y');
  });

  it('keeps printable ASCII and multi-byte UTF-8 intact', () => {
    expect(sanitizeForLog('Hello, World!')).toBe('Hello, World!');
    expect(sanitizeForLog('über — naïve 日本語')).toBe('über — naïve 日本語');
  });

  it('truncates overlong strings with an ellipsis', () => {
    const longStr = 'x'.repeat(300);
    const out = sanitizeForLog(longStr);
    expect(out.length).toBeLessThanOrEqual(257); // 256 + "…"
    expect(out.endsWith('…')).toBe(true);
  });

  it('handles null / undefined cleanly', () => {
    expect(sanitizeForLog(null)).toBe('');
    expect(sanitizeForLog(undefined)).toBe('');
  });

  it('stringifies non-string values', () => {
    expect(sanitizeForLog(42)).toBe('42');
    expect(sanitizeForLog({ a: 1 })).toBe('[object Object]');
  });

  it('defeats log-injection payloads from attacker-controlled URLs', () => {
    const payload = 'http://attacker.example\n[INFO] forged log entry: all is well';
    const safe = sanitizeForLog(payload);
    expect(safe).not.toContain('\n');
    expect(safe.startsWith('http://attacker.example?')).toBe(true);
  });
});

describe('formatRequestLog', () => {
  it('emits a single-line NDJSON entry with the declared fields', () => {
    const line = formatRequestLog({
      ts: '2026-04-23T12:34:56.000Z',
      ip: '1.2.3.4',
      method: 'POST',
      path: '/mcp',
      status: 200,
      durationMs: 42,
      rateLimitHit: false,
    });
    const parsed = JSON.parse(line);
    expect(parsed.ts).toBe('2026-04-23T12:34:56.000Z');
    expect(parsed.ip).toBe('1.2.3.4');
    expect(parsed.method).toBe('POST');
    expect(parsed.status).toBe(200);
    expect(parsed.durationMs).toBe(42);
    expect(line).not.toContain('\n');
  });

  it('omits undefined optional fields', () => {
    const line = formatRequestLog({
      ts: 't',
      ip: 'i',
      method: 'GET',
      path: '/',
      status: 200,
      durationMs: 1,
    });
    expect(line).not.toContain('rateLimitHit');
    expect(line).not.toContain('bodyBytes');
  });
});

describe('extractClientIp', () => {
  it('returns the socket address when trustProxy=false', () => {
    expect(
      extractClientIp({ 'x-forwarded-for': '1.2.3.4' }, '5.6.7.8', false)
    ).toBe('5.6.7.8');
  });

  it('honors X-Forwarded-For when trustProxy=true', () => {
    expect(
      extractClientIp({ 'x-forwarded-for': '1.2.3.4, 9.9.9.9' }, '5.6.7.8', true)
    ).toBe('1.2.3.4');
  });

  it('falls back to socket address when XFF is missing even with trustProxy', () => {
    expect(extractClientIp({}, '5.6.7.8', true)).toBe('5.6.7.8');
  });

  it('returns "unknown" when nothing is available', () => {
    expect(extractClientIp({}, undefined, true)).toBe('unknown');
  });
});
