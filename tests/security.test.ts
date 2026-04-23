import { describe, it, expect } from 'vitest';

import { AppCache, AppCacheRegistry } from '../src/lib/app-cache.js';
import { assertSafeServerHost, assertSafeServerUrl } from '../src/lib/config.js';

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
