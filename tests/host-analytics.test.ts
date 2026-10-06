/**
 * Library-mode usage analytics (src/lib/host-analytics.ts): reported to the
 * MCP app on stats.count.ly only while the host allows it, under the host's
 * device id, with the standalone event names and no messages, URLs or
 * arguments.
 */
import { describe, expect, it, vi } from 'vitest';

import { DEFAULT_ANALYTICS_APP_KEY, HostAnalytics } from '../src/lib/host-analytics.js';

function fakeFetch() {
  const calls: { url: string; body: URLSearchParams }[] = [];
  const fn = vi.fn(async (url: string, init: { body: string }) => {
    calls.push({ url, body: new URLSearchParams(init.body) });
    return { ok: true, status: 200 };
  });
  return { fn, calls };
}

const call = { tool: 'apps_list', category: 'apps', outcome: 'success' as const, durationMs: 120 };

describe('HostAnalytics', () => {
  it('sends nothing while the host does not allow it', async () => {
    const f = fakeFetch();
    const a = new HostAnalytics({ isEnabled: () => false, deviceId: () => 'countly.example.com' }, f.fn);
    a.toolCall(call);
    await a.flush();
    expect(f.fn).not.toHaveBeenCalled();
  });

  it('sends nothing without a device id', async () => {
    const f = fakeFetch();
    const a = new HostAnalytics({ isEnabled: () => true, deviceId: () => '' }, f.fn);
    a.toolCall(call);
    await a.flush();
    expect(f.fn).not.toHaveBeenCalled();
  });

  it("reports under the host's device id to the MCP app, with the standalone event names", async () => {
    const f = fakeFetch();
    const a = new HostAnalytics({ isEnabled: () => true, deviceId: () => 'countly.example.com', host: 'countly' }, f.fn);
    a.toolCall(call);
    a.toolCall({ ...call, tool: 'events_list', outcome: 'failed' });
    await a.flush();
    expect(f.calls).toHaveLength(1);
    const { url, body } = f.calls[0];
    expect(url).toBe('https://stats.count.ly/i');
    expect(body.get('app_key')).toBe(DEFAULT_ANALYTICS_APP_KEY);
    expect(body.get('device_id')).toBe('countly.example.com');
    const events = JSON.parse(body.get('events') as string) as { key: string; segmentation: Record<string, unknown> }[];
    const keys = events.map((e) => e.key);
    expect(keys.filter((k) => k === 'server_started')).toHaveLength(1);
    expect(keys).toContain('transport_used');
    expect(keys.filter((k) => k === 'tool_executed')).toHaveLength(2);
    expect(keys).toContain('tool_category_used');
    const error = events.find((e) => e.key === 'error_occurred');
    expect(error?.segmentation).toEqual({ error_type: 'failed', error_message: 'failed', tool: 'events_list' });
    expect(events.find((e) => e.key === 'server_started')?.segmentation.host).toBe('countly');
  });

  it('drops queued events when the host opts out before they are sent', async () => {
    const f = fakeFetch();
    let on = true;
    const a = new HostAnalytics({ isEnabled: () => on, deviceId: () => 'countly.example.com' }, f.fn);
    a.toolCall(call);
    on = false;
    await a.flush();
    expect(f.fn).not.toHaveBeenCalled();
  });

  it('never throws, even when the host callbacks or the network do', async () => {
    const a = new HostAnalytics({ isEnabled: () => {
 throw new Error('x'); 
}, deviceId: () => 'd' }, async () => {
 throw new Error('down'); 
});
    expect(() => a.toolCall(call)).not.toThrow();
    const b = new HostAnalytics({ isEnabled: () => true, deviceId: () => 'd' }, async () => {
 throw new Error('down'); 
});
    b.toolCall(call);
    await expect(b.flush()).resolves.toBeUndefined();
  });
});
