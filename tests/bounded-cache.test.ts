/**
 * Every process-lifetime cache is bounded (src/lib/bounded-cache.ts), so a
 * long-running server that sees many tokens, grants or tenants holds at most
 * a fixed number of entries.
 */
import { describe, expect, it, vi } from 'vitest';

import { AppCacheRegistry } from '../src/lib/app-cache.js';
import { BoundedCache } from '../src/lib/bounded-cache.js';
import { ServerCapabilitiesCache, type ServerCapabilities } from '../src/lib/server-capabilities.js';

const caps = (): ServerCapabilities => ({
  architecture: 'new', flavor: 'platform', v2: true, plugins: [], pluginsAssumed: false, member: null, detectedAt: Date.now(),
} as unknown as ServerCapabilities);

describe('BoundedCache', () => {
  it('drops the least recently used entry beyond its size', () => {
    const c = new BoundedCache<string, number>(2);
    c.set('a', 1);
    c.set('b', 2);
    expect(c.get('a')).toBe(1); // a is now the most recently used
    c.set('c', 3);
    expect(c.size).toBe(2);
    expect(c.get('b')).toBeUndefined();
    expect(c.get('a')).toBe(1);
    expect(c.get('c')).toBe(3);
  });

  it('expires entries after their time to live', () => {
    vi.useFakeTimers();
    try {
      const c = new BoundedCache<string, number>(10, 1000);
      c.set('a', 1);
      c.set('b', 2, 5000);
      vi.advanceTimersByTime(1500);
      expect(c.get('a')).toBeUndefined();
      expect(c.get('b')).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('ServerCapabilitiesCache', () => {
  it('holds at most maxEntries detections, however many tokens it sees', async () => {
    const cache = new ServerCapabilitiesCache(60_000, 50);
    for (let i = 0; i < 500; i++) {
      await cache.get('https://countly.example.com', 'token-' + i, async () => caps());
    }
    expect(cache.size).toBe(50);
  });

  it('detects once per key while cached, and does not keep a failed detection', async () => {
    const cache = new ServerCapabilitiesCache();
    const detect = vi.fn(async () => caps());
    await cache.get('u', 't', detect);
    await cache.get('u', 't', detect);
    expect(detect).toHaveBeenCalledTimes(1);

    const failing = vi.fn(async () => {
      throw new Error('down');
    });
    await expect(cache.get('u', 'other', failing)).rejects.toThrow('down');
    await expect(cache.get('u', 'other', failing)).rejects.toThrow('down');
    expect(failing).toHaveBeenCalledTimes(2);
  });
});

describe('AppCacheRegistry', () => {
  it('keeps at most maxTenants app caches', () => {
    const registry = new AppCacheRegistry(300_000, 20);
    for (let i = 0; i < 200; i++) {
      registry.for('token-' + i);
    }
    expect(registry.size()).toBe(20);
  });
});
