import { describe, it, expect, vi } from 'vitest';

import { fetchByOffset } from '../src/lib/v2-api.js';
import { handleJourneyBlockReference } from '../src/tools/journeys.js';
import { handleGetMetadataV2 } from '../src/tools/v2/drill-meta.js';
import { handleDeleteEmailReportV2 } from '../src/tools/v2/email-reports.js';
import { handleListFunnelsV2 } from '../src/tools/v2/funnels.js';
import { handleDeleteHookV2, handleUpdateHookV2 } from '../src/tools/v2/hooks.js';
import { handleUpdateJourneyV2 } from '../src/tools/v2/journeys.js';
import { dayOf } from '../src/tools/v2/live.js';

const ok = (data: unknown) => ({ status: 200, data: { data } });

function ctx(route: (method: string, url: string, params: any, body: any) => any, v2 = true) {
  const request = vi.fn(async ({ method, url, params, data }: any) => route(method, url, params, data));
  const resolveAppId = vi.fn(async (args: any) => args.app_id);
  return {
    context: {
      httpClient: { request } as any,
      getAuthParams: () => ({}),
      resolveAppId,
      getApps: async () => [{ _id: 'a1', timezone: 'Pacific/Kiritimati' }],
      getServerCapabilities: async () => ({ v2 }) as any,
    } as any,
    request,
    resolveAppId,
  };
}

describe('fetchByOffset', () => {
  const rows = Array.from({ length: 30 }, (_, i) => i);
  const page = vi.fn(async (p: number, size: number) => ({ items: rows.slice((p - 1) * size, p * size), total: 30 }));

  it('returns the exact window for unaligned offsets', async () => {
    expect((await fetchByOffset(5, 10, page)).items).toEqual(rows.slice(5, 15));
    expect((await fetchByOffset(25, 10, page)).items).toEqual(rows.slice(25, 30));
  });

  it('uses a single page when aligned', async () => {
    page.mockClear();
    expect((await fetchByOffset(10, 10, page)).items).toEqual(rows.slice(10, 20));
    expect(page).toHaveBeenCalledTimes(1);
  });
});

describe('funnels_list on Platform', () => {
  it('returns the stored step query as filter and the label as filterText', async () => {
    const { context } = ctx(() => ok({ funnels: [{ _id: 'f', steps: ['A', 'B'], queries: ['{}', '{"up.cc":"DE"}'], queryTexts: ['', 'Country = DE'] }], total: 1 }));
    const res: any = await handleListFunnelsV2(context, { app_id: 'a1' });
    const [funnel] = JSON.parse(res.content[0].text.slice(res.content[0].text.indexOf('\n') + 1));
    expect(funnel.steps[0]).toEqual({ event: 'A' });
    expect(funnel.steps[1]).toEqual({ event: 'B', filter: '{"up.cc":"DE"}', filterText: 'Country = DE' });
  });
});

describe('metadata_get on Platform', () => {
  it('reads custom events from the paginated envelope', async () => {
    const { context, request } = ctx((method, url) => {
      if (url === '/v2/drill/events') {
        return ok({ events: [{ key: 'Purchase', name: 'Purchase' }], total: 1 });
      }
      return ok({ results: [] });
    });
    await handleGetMetadataV2(context, { app_id: 'a1' }, async () => ({ content: [] }));
    const batch = request.mock.calls.find((c: any) => c[0].url === '/v2/drill/segmentation_meta/batch');
    expect((batch as any)[0].data.pairs.map((p: any) => p.eventKey)).toContain('Purchase');
  });
});

describe('live day labels', () => {
  it('uses the app time zone, including UTC+14', () => {
    const endOfOct6InKiritimati = Date.UTC(2026, 9, 6, 9, 59, 59, 999);
    expect(dayOf(endOfOct6InKiritimati, 'Pacific/Kiritimati')).toBe('2026-10-06');
    expect(dayOf(Date.UTC(2026, 9, 6, 23, 59, 59, 999))).toBe('2026-10-06');
  });
});

describe('id-only hook and report mutations on Platform', () => {
  it('do not require an app', async () => {
    const { context, resolveAppId } = ctx(() => ok({ _id: 'h1', name: 'x' }));
    expect((await handleUpdateHookV2(context, { hook_id: 'h1', name: 'renamed' }) as any).isError).toBeFalsy();
    expect((await handleDeleteHookV2(context, { hook_id: 'h1' }) as any).isError).toBeFalsy();
    expect((await handleDeleteEmailReportV2(context, { report_id: 'r1' }) as any).isError).toBeFalsy();
    expect(resolveAppId).not.toHaveBeenCalled();
  });
});

describe('journeys_update on Platform', () => {
  it('keeps the current goal window when only the goal event changes', async () => {
    const { context, request } = ctx((method) => (method === 'get'
      ? ok({ _id: 'j1', goal: { eventKey: 'Old', window: '7d' } })
      : ok({ _id: 'j1', goal: { eventKey: 'New', window: '7d' } })));
    await handleUpdateJourneyV2(context, { app_id: 'a1', journey_id: 'j1', goal_event_key: 'New' });
    const patch = request.mock.calls.find((c: any) => c[0].method === 'patch');
    expect((patch as any)[0].data.goal).toEqual({ eventKey: 'New', window: '7d' });
  });
});

describe('journeys_block_reference', () => {
  it('serves the legacy guide on Enterprise and the Platform guide on /v2', async () => {
    const legacy: any = await handleJourneyBlockReference(ctx(() => ok({}), false).context, {});
    const platform: any = await handleJourneyBlockReference(ctx(() => ok({}), true).context, {});
    expect(legacy.content[0].text).toContain('expiration_type');
    expect(legacy.content[0].text).not.toContain('"expiry" (object');
    expect(platform.content[0].text).toContain('"expiry" (object');
  });
});
