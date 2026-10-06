/**
 * A Map with a size cap (least recently used goes first) and an optional
 * time to live. Every cache that lives as long as the process uses it, so a
 * long-running server (one that serves many tokens, grants or tenants) holds
 * at most `maxEntries` of each, however many it has seen.
 */
export class BoundedCache<K, V> {
  private readonly entries = new Map<K, { value: V; expiresAt: number }>();

  /**
   * @param maxEntries - most entries held; the least recently used is dropped first
   * @param ttlMs - how long an entry stays valid; Infinity for no expiry
   */
  constructor(private readonly maxEntries: number, private readonly ttlMs = Infinity) {
    if (!(maxEntries >= 1)) {
      throw new RangeError('BoundedCache: maxEntries must be at least 1');
    }
  }

  /** @returns the value, or undefined when missing or expired (a hit counts as a use) */
  get(key: K): V | undefined {
    const entry = this.entries.get(key);
    if (!entry) {
      return undefined;
    }
    if (entry.expiresAt <= Date.now()) {
      this.entries.delete(key);
      return undefined;
    }
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.value;
  }

  /**
   * @param key - the key
   * @param value - the value
   * @param ttlMs - this entry's time to live, when it differs from the cache's
   */
  set(key: K, value: V, ttlMs = this.ttlMs): void {
    this.entries.delete(key);
    this.entries.set(key, { value, expiresAt: ttlMs === Infinity ? Infinity : Date.now() + ttlMs });
    while (this.entries.size > this.maxEntries) {
      this.entries.delete(this.entries.keys().next().value as K);
    }
  }

  delete(key: K): void {
    this.entries.delete(key);
  }

  clear(): void {
    this.entries.clear();
  }

  get size(): number {
    return this.entries.size;
  }
}
