/**
 * App cache management for Countly MCP Server
 * Handles caching of Countly apps for performance
 */

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
