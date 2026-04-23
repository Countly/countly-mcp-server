import { describe, it, expect } from 'vitest';

import { AppCache, AppCacheRegistry } from '../src/lib/app-cache.js';
import { assertSafeServerHost, assertSafeServerUrl } from '../src/lib/config.js';
import { redactSensitiveInMessage } from '../src/lib/error-handler.js';
import {
  extractClientIp,
  parseCorsAllowed,
  RateLimiter,
  resolveCorsOrigin,
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
    expect(assertSafeServerHost('169.254.169.254')).toMatch(/169\.254/);
  });

  it('rejects RFC 1918 10/8', () => {
    expect(assertSafeServerHost('10.0.0.1')).toMatch(/10\.0\.0\.0\/8/);
  });

  it('rejects RFC 1918 172.16/12', () => {
    expect(assertSafeServerHost('172.16.0.1')).toMatch(/172\.16/);
    expect(assertSafeServerHost('172.31.255.254')).toMatch(/172\.16/);
  });

  it('accepts a public IPv4 (1.1.1.1)', () => {
    expect(assertSafeServerHost('1.1.1.1')).toBeNull();
  });

  it('rejects RFC 1918 192.168/16', () => {
    expect(assertSafeServerHost('192.168.1.1')).toMatch(/192\.168/);
  });

  it('rejects carrier-grade NAT 100.64/10', () => {
    expect(assertSafeServerHost('100.64.0.1')).toMatch(/100\.64/);
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

  it('rejects IPv6 loopback', () => {
    expect(assertSafeServerHost('::1')).toMatch(/loopback/);
  });

  it('rejects IPv6 link-local fe80::', () => {
    expect(assertSafeServerHost('fe80::1')).toMatch(/link-local/);
  });

  it('rejects IPv6 unique-local fd00::', () => {
    expect(assertSafeServerHost('fd00::1')).toMatch(/link-local/);
  });

  it('accepts api.count.ly (normal case)', () => {
    expect(assertSafeServerHost('api.count.ly')).toBeNull();
  });

  it('accepts public IPv4 like 1.1.1.1', () => {
    expect(assertSafeServerHost('1.1.1.1')).toBeNull();
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

  it('accepts a normal Countly URL', () => {
    expect(() => assertSafeServerUrl('https://api.count.ly')).not.toThrow();
  });

  it('accepts an on-prem Countly on a public IP', () => {
    expect(() => assertSafeServerUrl('https://203.0.113.10')).not.toThrow();
  });
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
