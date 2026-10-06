import { describe, it, expect, vi } from 'vitest';

import { CrashAnalyticsTools } from '../src/tools/crash-analytics.js';
import { FunnelsTools } from '../src/tools/funnels.js';
import { LoggerTools } from '../src/tools/logger.js';
import { summariseFunnel } from '../src/tools/v2/funnels.js';

/** Context of a Platform server: v2 requests go to `v2`, legacy GETs to `legacy` */
function platformContext(v2: (method: string, url: string, params: any, body: any) => { status: number; data: any }) {
  const request = vi.fn(async ({ method, url, params, data }: any) => v2(method, url, params, data));
  const get = vi.fn(async () => ({ data: ['legacy-uid'] }));
  return {
    context: {
      httpClient: { request, get } as any,
      getAuthParams: () => ({ auth_token: 't' }),
      resolveAppId: async (args: any) => args.app_id,
      getServerCapabilities: async () => ({ v2: true }) as any,
    } as any,
    request,
    get,
  };
}
const ok = (data: unknown) => ({ status: 200, data: { data } });
const text = (res: any) => res.content[0].text as string;

describe('crash_groups_list on Platform', () => {
  it('maps paging and filters, and shortens stack traces', async () => {
    const { context, request } = platformContext(() => ok({
      rows: [{ _id: 'c1', name: 'NPE', error: 'a\nb\nc\nd\ne\nf', reports: 3, users: 2, lastTs: 0 }],
      total: 7, limit: 1, offset: 5,
    }));
    const res = await new CrashAnalyticsTools(context).listCrashGroups({
      app_id: 'app', skip: 5, limit: 1, query: '{"is_resolved":false}', sort_by: 'reports', search: 'NPE',
    });
    expect(request.mock.calls[0][0].params).toMatchObject({
      app_id: 'app', offset: 5, limit: 1, query: '{"is_resolved":false}', sort_by: 'reports', search: 'NPE',
    });
    expect(text(res)).toContain('7 total');
    expect(text(res)).toContain('… (2 more lines)');
  });
});

describe('funnels on Platform', () => {
  it('computes conversion figures from v2 funnel data', () => {
    const out = summariseFunnel({
      steps: [
        { step: 'A', users: 200, times: 250, query: {} },
        { step: 'B', users: 50, times: 60, averageTimeSpend: 12_000, p50TimeSpend: 9_000, p95TimeSpend: 30_000 },
      ],
      success_users: 50, success_rate: 25, users_in_first_step: 200,
    });
    expect(out.steps[0]).toMatchObject({ conversionFromFirstPct: 100, droppedFromPrevious: 0 });
    expect(out.steps[0].query).toBeUndefined();
    expect(out.steps[1]).toMatchObject({
      conversionFromFirstPct: 25, conversionFromPreviousPct: 25, droppedFromPrevious: 150,
      avgTimeFromPreviousSec: 12, medianTimeFromPreviousSec: 9, p95TimeFromPreviousSec: 30,
    });
  });

  it('converts skip/limit to v2 pages', async () => {
    const { context, request } = platformContext(() => ok({ funnels: [], total: 0 }));
    await new FunnelsTools(context).funnels_list({ app_id: 'app', skip: 20, limit: 10 });
    expect(request.mock.calls[0][0].params).toMatchObject({ page: 3, pageSize: 10 });
  });

  it('returns step users with profiles via drill', async () => {
    const { context, request } = platformContext(() => ok({ rows: [{ uid: 'u1', name: 'Ann' }], meta: { total: 1, hasMore: false } }));
    const res = await new FunnelsTools(context).funnels_step_users({ app_id: 'app', funnel_id: 'f', step: 1 });
    expect(request.mock.calls[0][0].data.funnelQuery).toMatchObject({ funnel: 'f', users_for_step: '1' });
    expect(text(res)).toContain('"name": "Ann"');
  });

  it('falls back to legacy uids when drill profiles are unavailable', async () => {
    const { context, get } = platformContext(() => ({ status: 503, data: { error: { code: 'SERVICE_UNAVAILABLE', message: 'ClickHouse service unavailable' } } }));
    const res = await new FunnelsTools(context).funnels_dropoff_users({ app_id: 'app', funnel_id: 'f', from_step: 0, to_step: 1 });
    expect(get).toHaveBeenCalled();
    expect(text(res)).toContain('legacy-uid');
  });

  it('uses legacy when a user filter is given', async () => {
    const { context, request, get } = platformContext(() => ok({}));
    await new FunnelsTools(context).funnels_step_users({ app_id: 'app', funnel_id: 'f', step: 0, filter: '{"up.cc":"DE"}' });
    expect(request).not.toHaveBeenCalled();
    expect(get).toHaveBeenCalled();
  });
});

describe('sdk_logs_list on Platform', () => {
  it('passes filters and strips request headers', async () => {
    const { context, request } = platformContext(() => ok({
      rows: [{ _id: 'r1', reqts: 0, h: { 'x-forwarded-for': '1.2.3.4' }, p: [] }],
      total: 1, page: 1, pageSize: 10, state: 'on',
    }));
    const res = await new LoggerTools(context).sdk_logs_list({ app_id: 'app', types: ['events', 'crash'], has_problems: true, sdk_name: 'ios' });
    expect(request.mock.calls[0][0].params).toMatchObject({ types: 'events,crash', hasProblems: 'true', sdkName: 'ios', order: 'desc' });
    expect(text(res)).not.toContain('x-forwarded-for');
  });
});
