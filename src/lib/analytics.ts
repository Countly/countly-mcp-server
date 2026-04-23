/**
 * Analytics tracking module using Countly SDK
 * Provides comprehensive product and usage analytics.
 * Disabled by default — opt in with ENABLE_ANALYTICS=true.
 */

// @ts-ignore - countly-sdk-nodejs doesn't have TypeScript definitions
import Countly from 'countly-sdk-nodejs';
import { createHash } from 'crypto';
import { createRequire } from 'module';

const ANALYTICS_URL = 'https://stats.count.ly';
const ANALYTICS_APP_KEY = '5a106dec46bf2e2d4d23c2cd3cf7490b12c22fc7';

// Load the package version once. Uses createRequire because the rest of the
// file is ESM and require() isn't available natively.
const require = createRequire(import.meta.url);

class Analytics {
  private enabled: boolean = false;
  private initialized: boolean = false;
  private deviceId: string = 'mcp';

  /**
   * Initialize analytics tracking.
   * Opt-in: enabled only when the caller passes true (which index.ts does
   * only when ENABLE_ANALYTICS=true is set in the environment).
   */
  init(enabled: boolean = false): void {
    this.enabled = enabled;

    if (!this.enabled) {
      console.error('📊 Analytics: Disabled (set ENABLE_ANALYTICS=true to opt in)');
      return;
    }

    try {
      Countly.init({
        app_key: ANALYTICS_APP_KEY,
        url: ANALYTICS_URL,
        device_id: this.deviceId,
        debug: false,
        // Collect basic metrics
        metrics: {
          _os: process.platform,
          _os_version: process.version,
          _app_version: this.getAppVersion(),
        }
      });

      this.initialized = true;
      console.error('📊 Analytics: Enabled and initialized');
      
      // Track session start
      this.trackServerStart();
    } catch (error) {
      console.error('📊 Analytics: Initialization failed:', error);
      this.enabled = false;
    }
  }

  /**
   * Hash server URL to create anonymous device ID
   * Does NOT include auth tokens
   */
  private hashServerUrl(url: string): string {
    // Remove protocol and trailing slashes for consistency
    const cleanUrl = url.replace(/^https?:\/\//, '').replace(/\/+$/, '');
    return createHash('sha256').update(cleanUrl).digest('hex').substring(0, 32);
  }

  /**
   * Get app version from package.json. Shared with the MCP handshake /
   * manifest version in index.ts — there is no compile-time wiring, just
   * the single JSON source of truth.
   */
  private getAppVersion(): string {
    try {
      const pkg = require('../../package.json') as { version?: string };
      return pkg.version || '0.0.0';
    } catch {
      return '0.0.0';
    }
  }

  /**
   * Track server start event
   */
  private trackServerStart(): void {
    if (!this.isEnabled()) {
      return;
    }

    this.trackEvent('server_started', {
      platform: process.platform,
      node_version: process.version,
      transport: process.env.MCP_TRANSPORT || 'stdio',
    });
  }

  /**
   * Track transport type usage
   */
  trackTransport(type: 'stdio' | 'http'): void {
    if (!this.isEnabled()) {
      return;
    }

    this.trackEvent('transport_used', {
      type,
      timestamp: Date.now(),
    });
  }

  /**
   * Track tool execution
   */
  trackToolExecution(toolName: string, success: boolean, duration?: number): void {
    if (!this.isEnabled()) {
      return;
    }

    this.trackEvent('tool_executed', {
      tool: toolName,
      success: success ? 1 : 0,
      duration: duration || 0,
    });

    // Also track as timed event if duration is provided
    if (duration) {
      this.trackTimedEvent('tool_execution_time', {
        tool: toolName,
      }, duration);
    }
  }

  /**
   * Track tool category usage
   */
  trackToolCategory(category: string): void {
    if (!this.isEnabled()) {
      return;
    }

    this.trackEvent('tool_category_used', {
      category,
    });
  }

  /**
   * Track authentication method
   */
  trackAuthMethod(method: 'env' | 'file' | 'headers' | 'metadata' | 'args'): void {
    if (!this.isEnabled()) {
      return;
    }

    this.trackEvent('auth_method', {
      method,
    });
  }

  /**
   * Track API endpoint usage
   */
  trackApiEndpoint(endpoint: string, method: string, statusCode: number): void {
    if (!this.isEnabled()) {
      return;
    }

    this.trackEvent('api_endpoint', {
      endpoint,
      method,
      status: statusCode,
    });
  }

  /**
   * Track HTTP request to MCP endpoint
   */
  trackHttpRequest(path: string, method: string): void {
    if (!this.isEnabled()) {
      return;
    }

    this.trackEvent('http_request', {
      path,
      method,
    });
  }

  /**
   * Track error occurrence
   */
  trackError(errorType: string, errorMessage: string, toolName?: string): void {
    if (!this.isEnabled()) {
      return;
    }

    this.trackEvent('error_occurred', {
      error_type: errorType,
      error_message: errorMessage.substring(0, 100), // Limit length
      tool: toolName || 'unknown',
    });

    // Also record as crash for visibility
    Countly.log_error(new Error(`${errorType}: ${errorMessage}`));
  }

  /**
   * Track session duration
   */
  trackSession(action: 'begin' | 'end'): void {
    if (!this.isEnabled()) {
      return;
    }

    if (action === 'begin') {
      Countly.begin_session();
    } else {
      Countly.end_session();
    }
  }

  /**
   * Track custom event
   */
  trackEvent(eventName: string, segmentation?: Record<string, string | number>): void {
    if (!this.isEnabled()) {
      return;
    }

    try {
      Countly.add_event({
        key: eventName,
        count: 1,
        segmentation,
      });
    } catch (error) {
      console.error('📊 Analytics: Failed to track event:', error);
    }
  }

  /**
   * Track timed event
   */
  trackTimedEvent(eventName: string, segmentation: Record<string, string | number>, duration: number): void {
    if (!this.isEnabled()) {
      return;
    }

    try {
      Countly.add_event({
        key: eventName,
        count: 1,
        dur: duration,
        segmentation,
      });
    } catch (error) {
      console.error('📊 Analytics: Failed to track timed event:', error);
    }
  }

  /**
   * Track user property (non-sensitive)
   */
  trackUserProperty(key: string, value: string | number): void {
    if (!this.isEnabled()) {
      return;
    }

    try {
      Countly.user_details({
        custom: {
          [key]: value,
        },
      });
    } catch (error) {
      console.error('📊 Analytics: Failed to track user property:', error);
    }
  }

  /**
   * Track view (page view equivalent)
   */
  trackView(viewName: string): void {
    if (!this.isEnabled()) {
      return;
    }

    try {
      Countly.track_view(viewName);
    } catch (error) {
      console.error('📊 Analytics: Failed to track view:', error);
    }
  }

  /**
   * Check if analytics is enabled and initialized
   */
  isEnabled(): boolean {
    return this.enabled && this.initialized;
  }

  /**
   * Flush any pending events
   */
  flush(): void {
    if (!this.isEnabled()) {
      return;
    }

    try {
      // Countly SDK auto-flushes, but we can manually trigger if needed
      console.error('📊 Analytics: Flushing events');
    } catch (error) {
      console.error('📊 Analytics: Failed to flush:', error);
    }
  }
}

// Export singleton instance
export const analytics = new Analytics();
