/**
 * Library mode must never load the standalone modes' analytics module
 * (src/lib/analytics.ts), which initializes the global Countly SDK: a host
 * such as Countly already uses that SDK for its own telemetry. Library-mode
 * usage goes only through the host-driven `analytics` option
 * (src/lib/host-analytics.ts). This holds even with ENABLE_ANALYTICS=true.
 */
import { describe, expect, it, vi } from 'vitest';

const loaded = { analytics: false };

vi.mock('../src/lib/analytics.js', () => {
  loaded.analytics = true;
  return { analytics: { trackEvent: () => {}, isEnabled: () => true } };
});

describe('library mode telemetry', () => {
  it('never loads the usage analytics module, even with ENABLE_ANALYTICS=true', async () => {
    process.env.ENABLE_ANALYTICS = 'true';
    try {
      const lib = await import('../src/library.js');
      lib.createMcpHandler({ countlyUrl: 'http://127.0.0.1:1' });
      lib.getToolCatalog();
      expect(loaded.analytics).toBe(false);
    } finally {
      delete process.env.ENABLE_ANALYTICS;
    }
  });
});
