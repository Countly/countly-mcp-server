/**
 * Usage analytics for library mode, driven by the host.
 *
 * The standalone modes report to the Countly server telemetry app on
 * stats.count.ly (src/lib/analytics.ts), under the Countly server's domain. An embedding
 * host such as Countly already reports its own server telemetry to
 * stats.count.ly through the same SDK, so library mode never touches that
 * global SDK instance (initializing it again would replace the host's).
 * Instead the host passes:
 *
 *   - `isEnabled()`: whether the host allows usage reporting right now
 *     (Countly: its tracker is on and `tracking.server_events` is set);
 *   - `deviceId()`: the identity to report under (Countly: the same device id
 *     its server telemetry uses), so MCP usage lines up with the
 *     host's own telemetry.
 *
 * Events and segments mirror the standalone ones (server_started,
 * transport_used, tool_executed, tool_execution_time, tool_category_used,
 * error_occurred).  No raw URLs, tokens,
 * arguments or error messages are sent. Events are batched and sent in the
 * background over plain HTTP; a failure drops the batch and never affects a
 * tool call.
 */

import { createRequire } from 'module';

import { stripTrailingSlashes } from './url.js';

const require = createRequire(import.meta.url);

export const DEFAULT_ANALYTICS_URL = 'https://stats.count.ly';
/** The Countly server telemetry app on stats.count.ly; the same key the standalone modes use. */
export const DEFAULT_ANALYTICS_APP_KEY = '9c28c347849f2c03caf1b091ec7be8def435e85e';

const FLUSH_EVERY_MS = 10_000;
const FLUSH_AT = 50;
const MAX_QUEUE = 1000;
const SEND_TIMEOUT_MS = 5000;

export interface HostAnalyticsOptions {
  /** Whether usage may be reported right now. Read before every event. */
  isEnabled: () => boolean;
  /** The device id to report under; nothing is sent while it is empty. */
  deviceId: () => string | undefined | null;
  /** Stats server base URL. Default https://stats.count.ly. */
  url?: string;
  /** App key on the stats server. Default: the Countly server telemetry app. */
  appKey?: string;
  /** Label for the embedding host, sent as a segment (e.g. "countly"). */
  host?: string;
}

interface QueuedEvent {
  key: string;
  count: number;
  dur?: number;
  timestamp: number;
  segmentation: Record<string, string | number>;
}

type Fetch = (url: string, init: { method: string; headers: Record<string, string>; body: string; signal: AbortSignal }) => Promise<{ ok: boolean; status: number }>;

/**
 * @returns the package version, or "unknown"
 */
function packageVersion(): string {
  try {
    return (require('../../package.json') as { version?: string }).version ?? 'unknown';
  } catch {
    return 'unknown';
  }
}

export class HostAnalytics {
  private readonly options: HostAnalyticsOptions;
  private readonly url: string;
  private readonly appKey: string;
  private readonly fetchImpl: Fetch;
  private queue: QueuedEvent[] = [];
  private timer: NodeJS.Timeout | null = null;
  private started = false;

  constructor(options: HostAnalyticsOptions, fetchImpl?: Fetch) {
    this.options = options;
    this.url = stripTrailingSlashes(options.url ?? DEFAULT_ANALYTICS_URL);
    this.appKey = options.appKey ?? DEFAULT_ANALYTICS_APP_KEY;
    this.fetchImpl = fetchImpl ?? (globalThis.fetch as unknown as Fetch);
  }

  /** @returns whether an event may be recorded now */
  private allowed(): boolean {
    try {
      return this.options.isEnabled() === true && !!this.options.deviceId();
    } catch {
      return false;
    }
  }

  private push(key: string, segmentation: Record<string, string | number>, dur?: number): void {
    const event: QueuedEvent = { key, count: 1, timestamp: Date.now(), segmentation };
    if (dur !== undefined) {
      event.dur = dur;
    }
    if (this.queue.length >= MAX_QUEUE) {
      this.queue.shift();
    }
    this.queue.push(event);
    if (this.queue.length >= FLUSH_AT) {
      void this.flush();
    } else if (!this.timer) {
      this.timer = setTimeout(() => void this.flush(), FLUSH_EVERY_MS);
      this.timer.unref?.();
    }
  }

  /** server_started and transport_used, once per process, on the first event. */
  private ensureStarted(): void {
    if (this.started) {
      return;
    }
    this.started = true;
    const host = this.options.host ?? 'embedded';
    this.push('server_started', {
      platform: process.platform,
      node_version: process.version,
      transport: 'library',
      host,
      version: packageVersion(),
    });
    this.push('transport_used', { type: 'library', host });
  }

  /**
   * Records one tool call. Never throws.
   * @param call - tool, category, outcome and duration
   */
  toolCall(call: { tool: string; category: string; outcome: 'success' | 'failed' | 'no_access'; durationMs: number }): void {
    try {
      if (!this.allowed()) {
        return;
      }
      this.ensureStarted();
      const success = call.outcome === 'success';
      const duration = Math.max(0, Math.round(call.durationMs));
      this.push('tool_executed', { tool: call.tool, success: success ? 1 : 0, duration });
      if (duration) {
        this.push('tool_execution_time', { tool: call.tool }, duration);
      }
      this.push('tool_category_used', { category: call.category });
      if (!success) {
        // The outcome only: no error message leaves the host.
        this.push('error_occurred', { error_type: call.outcome, error_message: call.outcome, tool: call.tool });
      }
    } catch {
      // Analytics must never affect a tool call.
    }
  }

  /**
   * Sends everything queued, in one request. Never throws.
   */
  async flush(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.queue.length === 0) {
      return;
    }
    const events = this.queue.splice(0, this.queue.length);
    let deviceId: string | undefined | null;
    try {
      deviceId = this.options.isEnabled() === true ? this.options.deviceId() : null;
    } catch {
      deviceId = null;
    }
    if (!deviceId) {
      return; // opted out (or lost identity) since the events were queued
    }
    const body = new URLSearchParams({
      app_key: this.appKey,
      device_id: deviceId,
      events: JSON.stringify(events),
      sdk_name: 'countly-mcp-server-library',
      sdk_version: packageVersion(),
    }).toString();
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), SEND_TIMEOUT_MS);
    try {
      await this.fetchImpl(this.url + '/i', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body,
        signal: abort.signal,
      });
    } catch {
      // Dropped: stats delivery is best effort.
    } finally {
      clearTimeout(timer);
    }
  }
}
