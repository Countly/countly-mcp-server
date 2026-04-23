/**
 * App cache management for Countly MCP Server
 * Handles caching of Countly apps for performance
 */

import { createHash } from 'crypto';

export interface CountlyApp {
  _id: string;
  name: string;
  key: string;
  created_at: number;
  timezone: string;
  category?: string;
}

/**
 * App cache with expiry logic
 */
export class AppCache {
  private apps: CountlyApp[] = [];
  private expiryTime: number = 0;
  private readonly cacheDuration: number;

  constructor(cacheDurationMs = 300000) {
    // Default: 5 minutes (300000 ms)
    this.cacheDuration = cacheDurationMs;
  }

  /**
   * Check if cache is expired
   */
  isExpired(): boolean {
    return Date.now() > this.expiryTime;
  }

  /**
   * Update cache with new apps list
   */
  update(apps: CountlyApp[]): void {
    this.apps = apps;
    this.expiryTime = Date.now() + this.cacheDuration;
  }

  /**
   * Get all cached apps
   */
  getAll(): CountlyApp[] {
    return [...this.apps];
  }

  /**
   * Find app by ID
   */
  findById(appId: string): CountlyApp | undefined {
    return this.apps.find((app) => app._id === appId);
  }

  /**
   * Find app by name
   */
  findByName(name: string): CountlyApp | undefined {
    return this.apps.find((app) => app.name === name);
  }

  /**
   * Resolve app name to app ID
   * Throws error if app not found
   */
  resolveAppName(name: string): string {
    const app = this.findByName(name);

    if (!app) {
      const availableApps = this.apps.map((a) => a.name).join(', ');
      throw new Error(
        `App not found: ${name}\n` +
        `Available apps: ${availableApps || 'none'}`
      );
    }

    return app._id;
  }

  /**
   * Clear the cache
   */
  clear(): void {
    this.apps = [];
    this.expiryTime = 0;
  }

  /**
   * Get cache size
   */
  size(): number {
    return this.apps.length;
  }
}

/**
 * Per-tenant cache registry.
 *
 * The MCP server is used as a multi-tenant HTTP proxy: one running process
 * can serve multiple clients, each with their own Countly auth token. A
 * single shared AppCache would leak tenant A's apps to tenant B's requests,
 * and (combined with the cached resolveAppId path) would route tenant B's
 * mutations against tenant A's app IDs. To prevent that, store one AppCache
 * per auth token (keyed by a SHA-256 hash so the raw token never lives as a
 * Map key or appears in heap-snapshots / crash reports).
 *
 * `for(token)` returns the cache for a specific tenant. An empty token
 * (stdio mode with no token yet) maps to a dedicated "anonymous" bucket so
 * it cannot collide with authenticated callers.
 */
export class AppCacheRegistry {
  private readonly caches = new Map<string, AppCache>();
  private readonly cacheDurationMs: number;

  constructor(cacheDurationMs = 300000) {
    this.cacheDurationMs = cacheDurationMs;
  }

  /**
   * Get or create the AppCache for the given token. Tokens are hashed with
   * SHA-256 before use as a map key — we never store the raw token here.
   */
  for(token: string | undefined): AppCache {
    const key = token ? createHash('sha256').update(token).digest('hex') : '__anonymous__';
    let cache = this.caches.get(key);
    if (!cache) {
      cache = new AppCache(this.cacheDurationMs);
      this.caches.set(key, cache);
    }
    return cache;
  }

  /**
   * Drop a tenant's cache (e.g. on error, credential rotation).
   */
  invalidate(token: string | undefined): void {
    const key = token ? createHash('sha256').update(token).digest('hex') : '__anonymous__';
    this.caches.delete(key);
  }

  /**
   * Total number of tenant caches currently held.
   */
  size(): number {
    return this.caches.size;
  }
}

/**
 * Resolve app_id or app_name to app_id
 * Pure function version for testing
 */
export function resolveAppIdentifier(
  args: { app_id?: string; app_name?: string },
  apps: CountlyApp[]
): string {
  if (args.app_id) {
    return args.app_id;
  }

  if (args.app_name) {
    const app = apps.find((a) => a.name === args.app_name);

    if (!app) {
      const availableApps = apps.map((a) => a.name).join(', ');
      throw new Error(
        `App not found: ${args.app_name}\n` +
        `Available apps: ${availableApps || 'none'}`
      );
    }

    return app._id;
  }

  throw new Error(
    'Either app_id or app_name must be provided.\n' +
    'Example: { app_id: "abc123" } or { app_name: "MyApp" }'
  );
}
