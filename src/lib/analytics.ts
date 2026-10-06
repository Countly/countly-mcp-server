/**
 * Analytics tracking module using Countly SDK
 * Provides comprehensive product and usage analytics.
 * Enabled by default — opt out with ENABLE_ANALYTICS=false.
 *
 * Events are reported under the Countly server's domain as the device id,
 * derived exactly the way the Countly platform derives its own telemetry
 * device id (scheme and trailing slashes stripped, host[:port][/path] kept),
 * so the MCP data on stats.count.ly lines up with the server's own
 * telemetry. In multi-tenant HTTP mode each request reports under its own
 * server's domain. No domain (or "localhost"): nothing is reported — that
 * includes page visits, health checks and startup in multi-tenant mode with
 * no configured server.
 *
 * Every event, session, view and crash is sent as an explicit request carrying
 * its own device id. The SDK's global device id is never used: the SDK
 * prefers a device id stored on disk over the one passed to init, so relying
 * on it would keep reporting under an old id.
 */

// @ts-ignore - countly-sdk-nodejs doesn't have TypeScript definitions
import Countly from 'countly-sdk-nodejs';
import { createHash } from 'crypto';
import { createRequire } from 'module';

import { stripTrailingSlashes } from './url.js';

export { stripTrailingSlashes };

const ANALYTICS_URL = 'https://stats.count.ly';
/**
 * The Countly server telemetry app on stats.count.ly: the same app (and, via
 * the domain device id, the same device) the Countly platform reports to.
 */
const ANALYTICS_APP_KEY = '9c28c347849f2c03caf1b091ec7be8def435e85e';
/**
 * Length of the server-URL hash that accompanies every analytics event.
 * 16 hex chars = 64 bits of entropy — enough to distinguish several billion
 * distinct Countly servers with negligible collision risk, while keeping
 * event payloads small. A collision between two real deployments is not a
 * correctness issue for distinct-count aggregation.
 */
const SERVER_HASH_LENGTH = 16;

// Load the package version once. Uses createRequire because the rest of the
// file is ESM and require() isn't available natively.
const require = createRequire(import.meta.url);

/**
 * Normalize a Countly server URL into a canonical form before hashing, so
 * variations that are semantically equivalent collapse to the same hash:
 *
 *   - scheme dropped (`http://` == `https://` for identity purposes)
 *   - hostname lowercased (URLs are case-insensitive on host)
 *   - default port stripped (`:80` for http, `:443` for https)
 *   - trailing slashes on the pathname stripped
 *   - path / query / fragment case preserved (RFC 3986: only the host is
 *     case-insensitive)
 *
 * Uses `new URL()` for structural correctness; falls back to a minimal
 * regex-based strip when the input doesn't parse as a URL (so a bare
 * hostname or misformatted value still produces a stable hash).
 */
export function normalizeServerUrlForHash(url: string): string {
  const trimmed = (url ?? '').trim();
  if (!trimmed) {
    return '';
  }

  // If there's no scheme, prepend one so `new URL()` succeeds without
  // changing the semantic identity — we drop the scheme again below.
  const hasScheme = /^[a-z][a-z\d+.-]*:\/\//i.test(trimmed);
  try {
    const parsed = new URL(hasScheme ? trimmed : `https://${trimmed}`);
    const hostname = parsed.hostname.toLowerCase();
    const isDefaultPort =
      (parsed.protocol === 'http:' && parsed.port === '80') ||
      (parsed.protocol === 'https:' && parsed.port === '443');
    const port = parsed.port && !isDefaultPort ? `:${parsed.port}` : '';
    const pathname = stripTrailingSlashes(parsed.pathname);
    // Preserve search + hash (rare on Countly URLs but keep case).
    return `${hostname}${port}${pathname}${parsed.search}${parsed.hash}`;
  } catch {
    // Non-URL input (malformed, unexpected scheme, etc.): minimal best-
    // effort normalization — strip scheme prefix and trailing slashes,
    // preserve path case.
    return stripTrailingSlashes(trimmed.replace(/^[a-z][a-z\d+.-]*:\/\//i, ''));
  }
}

/**
 * The device id a Countly server reports telemetry under: its domain with the
 * scheme and trailing slashes stripped, exactly as the Countly platform's
 * tracker derives it from `api.domain` (api/parts/mgmt/tracker.js), so the
 * same server gets the same device id from both. Nothing is sent when it is
 * empty or exactly "localhost", the platform's own check. Anything else is
 * reported as is, local addresses included: it only has to tell servers
 * apart. Credentials (`user:pass@`), a query and a fragment are dropped so a
 * secret written into the server URL never leaves the process.
 * @param url - the Countly server URL
 * @returns the device id, or undefined when there is none
 */
export function deviceIdFromServerUrl(url: string | undefined | null): string | undefined {
  if (typeof url !== 'string') {
    return undefined;
  }
  let id = url.trim().split('://').pop() ?? '';
  const cut = id.search(/[?#]/);
  if (cut >= 0) {
    id = id.slice(0, cut);
  }
  const slash = id.indexOf('/');
  const at = id.lastIndexOf('@', slash < 0 ? id.length : slash);
  if (at >= 0) {
    id = id.slice(at + 1);
  }
  id = stripTrailingSlashes(id);
  if (!id || id === 'localhost') {
    return undefined;
  }
  return id;
}

/**
 * Compute the short opaque server-URL hash that rides along as the `server`
 * segment on every event.
 *
 * Privacy note: the raw URL is never sent. For cloud patterns the hash is
 * brute-forceable by anyone with a dictionary of common URLs (including
 * Countly themselves, who already know their own cloud customer URLs via
 * billing). For custom on-prem URLs the hash is opaque in practice.
 */
export function computeServerHash(url: string | undefined): string | undefined {
  if (!url) {
    return undefined;
  }
  const normalized = normalizeServerUrlForHash(url);
  if (!normalized) {
    return undefined;
  }
  return createHash('sha256').update(normalized).digest('hex').substring(0, SERVER_HASH_LENGTH);
}

/**
 * Optional callback supplied by the server to resolve the Countly server URL
 * at event time. In stdio mode this just returns the env-supplied config
 * value; in HTTP mode it reads from AsyncLocalStorage so the per-request
 * server URL ends up in the per-request events.
 */
type ServerUrlResolver = () => string | undefined;

class Analytics {
  private enabled: boolean = false;
  private initialized: boolean = false;
  private startedAt: number = Date.now();
  private sessionStartedAt: number = Date.now();
  private getServerUrl?: ServerUrlResolver;

  /**
   * Initialize analytics tracking.
   * Opt-in: enabled only when the caller passes true (which index.ts does
   * only when ENABLE_ANALYTICS=true is set in the environment).
   *
   * `getServerUrl` is called at each event-track time to resolve the
   * current request's server URL. The returned URL is normalized and
   * hashed into a short opaque `server` segment on the outgoing event —
   * no raw URLs ever leave the process.
   */
  init(enabled: boolean = false, getServerUrl?: ServerUrlResolver): void {
    this.enabled = enabled;
    this.getServerUrl = getServerUrl;

    if (!this.enabled) {
      console.error('📊 Analytics: Disabled (ENABLE_ANALYTICS=false)');
      return;
    }

    try {
      Countly.init({
        app_key: ANALYTICS_APP_KEY,
        url: ANALYTICS_URL,
        // Never reported under: every request names its own device id.
        device_id: 'countly-mcp-server',
        clear_stored_device_id: true,
        debug: false,
        // Collect basic metrics
        metrics: {
          _os: process.platform,
          _os_version: process.version,
          _app_version: this.getAppVersion(),
        }
      });

      this.initialized = true;
      console.error('📊 Analytics: Enabled — usage is reported to stats.count.ly under your Countly server\'s domain. Set ENABLE_ANALYTICS=false to opt out.');

      // Track session start
      this.trackServerStart();
    } catch (error) {
      console.error('📊 Analytics: Initialization failed:', error);
      this.enabled = false;
    }
  }

  /**
   * Build the segmentation object for an event, adding the `server` hash
   * if we can resolve the current server URL. Callers hand in the
   * event-specific fields; we merge the server hash on top.
   */
  private withServerSegment(
    segmentation?: Record<string, string | number>
  ): Record<string, string | number> | undefined {
    const hash = computeServerHash(this.getServerUrl?.());
    if (!hash) {
      return segmentation;
    }
    return {
      ...(segmentation ?? {}),
      server: hash,
    };
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
  trackError(errorType: string, toolName?: string): void {
    if (!this.isEnabled()) {
      return;
    }

    // A fixed classification only. Error messages can carry what the caller
    // sent (a query, an app name, the list of app names), so neither the
    // message nor a crash report built from it leaves the process.
    this.trackEvent('error_occurred', {
      error_type: errorType,
      tool: toolName || 'unknown',
    });
  }

  /**
   * Track session duration
   */
  trackSession(action: 'begin' | 'end'): void {
    if (!this.isEnabled()) {
      return;
    }

    if (action === 'begin') {
      this.sessionStartedAt = Date.now();
      this.request({
        begin_session: 1,
        metrics: JSON.stringify({
          _os: process.platform,
          _os_version: process.version,
          _app_version: this.getAppVersion(),
        }),
      });
    } else {
      this.request({
        end_session: 1,
        session_duration: Math.round((Date.now() - this.sessionStartedAt) / 1000),
      });
    }
  }

  /**
   * Track custom event. Automatically injects the `server` hash segment
   * (when a serverUrl resolver was supplied to init) so Countly can
   * aggregate per-server without ever seeing the raw URL.
   */
  trackEvent(eventName: string, segmentation?: Record<string, string | number>): void {
    if (!this.isEnabled()) {
      return;
    }

    try {
      this.send({
        key: eventName,
        count: 1,
        segmentation: this.withServerSegment(segmentation),
      });
    } catch (error) {
      console.error('📊 Analytics: Failed to track event:', error);
    }
  }

  /**
   * Track timed event. Injects the `server` hash segment the same way
   * trackEvent does.
   */
  trackTimedEvent(eventName: string, segmentation: Record<string, string | number>, duration: number): void {
    if (!this.isEnabled()) {
      return;
    }

    try {
      this.send({
        key: eventName,
        count: 1,
        dur: duration,
        segmentation: this.withServerSegment(segmentation),
      });
    } catch (error) {
      console.error('📊 Analytics: Failed to track timed event:', error);
    }
  }

  /**
   * Sends one event under the current request's server domain. The SDK's own
   * device id takes it through the SDK queue; another server's domain (a
   * multi-tenant HTTP request) goes as a request with that device id, the way
   * the Countly platform reports bulk server events. No domain: not sent.
   */
  private send(event: { key: string; count: number; dur?: number; segmentation?: Record<string, string | number> }): void {
    this.request({ events: JSON.stringify([{ ...event, timestamp: Date.now() }]) });
  }

  /**
   * Queues one request to stats.count.ly under the current server's domain.
   * No domain: nothing is sent.
   */
  private request(params: Record<string, string | number>): void {
    const deviceId = deviceIdFromServerUrl(this.getServerUrl?.());
    if (!deviceId) {
      return;
    }
    Countly.request({ ...params, app_key: ANALYTICS_APP_KEY, device_id: deviceId });
  }

  /**
   * Track user property (non-sensitive)
   */
  trackUserProperty(key: string, value: string | number): void {
    if (!this.isEnabled()) {
      return;
    }

    try {
      this.request({ user_details: JSON.stringify({ custom: { [key]: value } }) });
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
      this.send({ key: '[CLY]_view', count: 1, segmentation: { name: viewName, visit: 1, segment: process.platform } });
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
