/**
 * Library mode must never load the package's own usage analytics
 * (src/lib/analytics.ts, which reports to stats.count.ly): a host such as
 * Countly embeds the tools and owns all reporting. This holds even with
 * ENABLE_ANALYTICS=true in the host's environment.
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
