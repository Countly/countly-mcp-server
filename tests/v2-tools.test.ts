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

describe('drill_query', () => {
  it('maps custom events to [CLY]_custom + eventNames and keeps system events', async () => {
    const { toSlimMetrics } = await import('../src/tools/v2/drill.js');
    const [m] = toSlimMetrics([{ events: ['Purchase', '[CLY]_session'], aggregation: 'count' }], undefined);
    expect(m).toMatchObject({ id: 'A', events: ['[CLY]_session', '[CLY]_custom'], eventNames: ['Purchase'] });
    const [sys] = toSlimMetrics([{ events: ['[CLY]_view'] }], undefined);
    expect(sys.events).toEqual(['[CLY]_view']);
    expect(sys.eventNames).toBeUndefined();
  });

  it('assigns ids around explicit ones, defaults unique to uid and ANDs filters', async () => {
    const { toSlimMetrics } = await import('../src/tools/v2/drill.js');
    const out = toSlimMetrics([
      { events: ['E'], aggregation: 'unique', filter: { 'up.cc': 'DE' } },
      { id: 'A', events: ['E'] },
      { cohort_id: 'c1' },
      { formula: 'A / B', name: 'ratio' },
    ], { 'up.p': 'iOS' });
    expect(out.map((m: any) => m.id)).toEqual(['B', 'A', 'C', 'D']);
    expect(out[0]).toMatchObject({ field: 'uid', filter: { $and: [{ 'up.p': 'iOS' }, { 'up.cc': 'DE' }] } });
    expect(out[1].filter).toEqual({ 'up.p': 'iOS' });
    expect(out[2]).toMatchObject({ cohortId: 'c1', filter: { 'up.p': 'iOS' } });
    expect(out[3]).toEqual({ id: 'D', formula: 'A / B', name: 'ratio' });
  });

  it('rejects metrics without events, cohort or formula', async () => {
    const { toSlimMetrics } = await import('../src/tools/v2/drill.js');
    expect(() => toSlimMetrics([{ aggregation: 'count' }], undefined)).toThrow(/give "events"/);
    expect(() => toSlimMetrics([], undefined)).toThrow(/non-empty/);
  });

  it('sends calendar days, outputs, sort and cursor', async () => {
    const { handleDrillQuery } = await import('../src/tools/v2/drill.js');
    const { context, request } = platformContext(() => ok({ results: { total: [{ A: 1 }] }, meta: { hasMore: true, nextCursor: 'N' } }));
    const res = await handleDrillQuery(context, {
      app_id: 'app', period: '[1767225600000,1769817600000]', metrics: [{ events: ['E'] }],
      output: ['total', 'daily'], sort: { by: 'A' }, limit: 5, cursor: 'C', breakdowns: ['up.cc'],
    });
    const body = request.mock.calls[0][0].data;
    expect(body.scope).toEqual({ appIds: ['app'], dateRange: { from: '2026-01-01', to: '2026-01-31' } });
    expect(body).toMatchObject({ outputs: ['total', 'daily'], sort: { by: 'A', dir: 'desc' }, page: { limit: 5, cursor: 'C' }, breakdowns: ['up.cc'] });
    expect(text(res)).toContain('"nextCursor": "N"');
  });
});

describe('user_profiles_query on Platform', () => {
  it('searches, sorts and pages profiles', async () => {
    const { UserProfilesTools } = await import('../src/tools/user-profiles.js');
    const { context, request } = platformContext(() => ok({ rows: [{ uid: 'u1' }], meta: { total: 42, hasMore: true } }));
    const res = await new UserProfilesTools(context).user_profiles_query({ app_id: 'app', query: '{"cc":"US"}', search: 'ann', sort_by: 'sc', offset: 20 });
    expect(request.mock.calls[0][0].data).toMatchObject({
      profileFilter: { cc: 'US' }, search: 'ann', sort: { column: 'sc', dir: 'desc' }, offset: 20, limit: 20,
    });
    expect(text(res)).toContain('42 total');
  });

  it('falls back to legacy when profiles are unavailable', async () => {
    const { UserProfilesTools } = await import('../src/tools/user-profiles.js');
    const { context, get } = platformContext(() => ({ status: 503, data: { error: { code: 'SERVICE_UNAVAILABLE', message: 'x' } } }));
    await new UserProfilesTools(context).user_profiles_query({ app_id: 'app', query: '{}' });
    expect(get).toHaveBeenCalled();
  });
});
