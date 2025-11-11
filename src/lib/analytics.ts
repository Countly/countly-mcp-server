/**
 * Analytics tracking module using Countly SDK
 * Provides comprehensive product and usage analytics
 * Disabled by default, enabled via ENABLE_ANALYTICS=true environment variable
 */

// @ts-ignore - countly-sdk-nodejs doesn't have TypeScript definitions
import Countly from 'countly-sdk-nodejs';
import { createHash } from 'crypto';

const ANALYTICS_URL = 'https://stats.count.ly';
const ANALYTICS_APP_KEY = '5a106dec46bf2e2d4d23c2cd3cf7490b12c22fc7';

class Analytics {
  private enabled: boolean = false;
  private initialized: boolean = false;
  private deviceId: string = 'mcp';

  /**
   * Initialize analytics tracking
   * @param enabled - Whether analytics is enabled (from ENABLE_ANALYTICS env var)
   */
  init(enabled: boolean = false): void {
    this.enabled = enabled;

    if (!this.enabled) {
      console.error('📊 Analytics: Disabled (set ENABLE_ANALYTICS=true to enable)');
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
   * Get app version from package.json
   */
  private getAppVersion(): string {
    try {
      const pkg = require('../../package.json');
      return pkg.version || '1.0.0';
    } catch {
      return '1.0.0';
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
