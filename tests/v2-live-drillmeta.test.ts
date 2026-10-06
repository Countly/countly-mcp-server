import { describe, it, expect, vi } from 'vitest';

import { LiveTools } from '../src/tools/live.js';
import { DrillTools } from '../src/tools/drill.js';
import { PlatformInsightsTools } from '../src/tools/platform-insights.js';
import { foldToHours } from '../src/tools/v2/live.js';
import { buildSaveBody, describeFilterTree, toFilterTree, toSavedDateRange } from '../src/tools/v2/drill-queries.js';
import { getV2ToolDefinitionOverrides } from '../src/tools/index.js';

type Handler = (method: string, url: string, params: any, body: any) => { status: number; data: any };

/** Server context: v2 requests go to `v2`, legacy GETs return `legacyData` */
function serverContext(v2: Handler, { platform = true, legacyData = { legacy: true } as any } = {}) {
  const request = vi.fn(async ({ method, url, params, data }: any) => v2(method, url, params, data));
  const get = vi.fn(async () => ({ data: legacyData }));
  return {
    context: {
      httpClient: { request, get } as any,
      getAuthParams: () => ({ auth_token: 't' }),
      resolveAppId: async (args: any) => args.app_id,
      getServerCapabilities: async () => ({ v2: platform }) as any,
    } as any,
    request,
    get,
  };
}
const ok = (data: unknown) => ({ status: 200, data: { data } });
const fail = (status: number) => ({ status, data: { error: { code: 'X', message: `status ${status}` } } });
const text = (res: any) => res.content[0].text as string;
const json = (res: any) => JSON.parse(text(res).slice(text(res).indexOf('\n') + 1));

describe('live tools', () => {
  it('stay on legacy /o?method=concurrent without /v2', async () => {
    const { context, request, get } = serverContext(() => ok({}), { platform: false });
    await new LiveTools(context).getLiveUsers({ app_id: 'app' });
    expect(request).not.toHaveBeenCalled();
    expect((get.mock.calls[0] as any[])[1].params).toMatchObject({ method: 'concurrent', mode: 0 });
  });

  it('live_users maps the v2 snapshot', async () => {
    const { context, request } = serverContext(() => ok({ total: 7, newProfiles: 2, cutoffSec: 1_700_000_000, windowSec: 180 }));
    const res = await new LiveTools(context).getLiveUsers({ app_id: 'app' });
    expect(request.mock.calls[0][0]).toMatchObject({ method: 'get', url: '/v2/concurrent_users/snapshot', params: { app_id: 'app' } });
    expect(json(res)).toEqual({ online: 7, newOnline: 2, onlineWindowSec: 180, activeSince: '2023-11-14T22:13:20.000Z' });
  });

  it('live_last_day folds half-hour points into 24 hourly maxima', async () => {
    const start = Date.UTC(2026, 9, 5, 10);
    const perHour = Array.from({ length: 48 }, (_, i) => ({ t: start + i * 1_800_000, value: i, newValue: i % 2 }));
    const folded = foldToHours(perHour);
    expect(folded).toHaveLength(24);
    expect(folded[0]).toEqual({ t: start, value: 1, newValue: 1 });
    const { context } = serverContext(() => ok({ perMinute: [], perHour, perDay: [], allTimeMax: { value: 0, newValue: 0 } }));
    const out = json(await new LiveTools(context).getLiveLastDay({ app_id: 'app' }));
    expect(out.online).toHaveLength(24);
    expect(out.peak).toEqual({ online: 47, at: new Date(start + 23 * 3_600_000).toISOString() });
    expect(out.from).toBe('2026-10-05T10:00:00.000Z');
  });

  it('live_last_30_days labels days from their end-of-day timestamps', async () => {
    // end of 2026-09-06 in UTC+2 and in UTC-5
    const perDay = [{ t: Date.UTC(2026, 8, 6, 21, 59, 59, 999), value: 3, newValue: 1 }, { t: Date.UTC(2026, 8, 8, 4, 59, 59, 999), value: 0, newValue: 0 }];
    const { context } = serverContext(() => ok({ perMinute: [], perHour: [], perDay, allTimeMax: { value: 3, newValue: 1 } }));
    const out = json(await new LiveTools(context).getLiveLast30Days({ app_id: 'app' }));
    expect(out).toMatchObject({ from: '2026-09-06', to: '2026-09-07', online: [3, 0], new: [1, 0], peak: { online: 3, at: '2026-09-06' } });
  });

  it('falls back to legacy when the v2 route is not available to the user', async () => {
    const { context, get } = serverContext(() => fail(401));
    const res = await new LiveTools(context).getLiveLastHour({ app_id: 'app' });
    expect((get.mock.calls[0] as any[])[1].params).toMatchObject({ mode: 2 });
    expect(text(res)).toContain('"legacy": true');
  });

  it('live_overall and live_metrics stay legacy on Platform', async () => {
    const { context, request } = serverContext(() => ok({}));
    await new LiveTools(context).getLiveOverall({ app_id: 'app' });
    await new LiveTools(context).getLiveMetrics({ app_id: 'app' });
    expect(request).not.toHaveBeenCalled();
  });
});

describe('saved drill query translation', () => {
  it('turns a Mongo-style filter into a condition tree', () => {
    const tree = toFilterTree({ 'up.p': { $in: ['iOS'] }, 'up.sc': { $gte: 2, $lt: 9 }, $or: [{ 'up.cc': 'US' }, { 'sg.plan': { rgxcn: ['pro'] } }] });
    expect(tree!.gaps).toEqual(['and', 'and', 'and']);
    expect(tree!.nodes[0]).toMatchObject({ property: { id: 'up.p' }, picked: { operator: 'in', value: ['iOS'] } });
    expect(tree!.nodes[2].picked).toEqual({ operator: 'lt', value: 9 });
    expect(tree!.nodes[3]).toMatchObject({ kind: 'group', gaps: ['or'] });
    expect(tree!.nodes[3].children[1].picked).toEqual({ operator: 'contains', value: 'pro' });
    expect(describeFilterTree(tree)).toBe('up.p in ["iOS"] and up.sc gte 2 and up.sc lt 9 and (up.cc = "US" or sg.plan contains "pro")');
    expect(toFilterTree({})).toBeUndefined();
  });

  it('rejects filters it cannot store faithfully', () => {
    expect(() => toFilterTree({ 'up.p': { $exists: true } })).toThrow(/\$exists/);
    expect(() => toFilterTree({ $where: 'x' })).toThrow(/\$where/);
    expect(() => toFilterTree({ 'up.p': ['a', 'b'] })).toThrow(/\$in/);
  });

  it('saves drill_query metrics as descriptor metrics', () => {
    const body: any = buildSaveBody({
      name: 'q', global: true, period: '[1756684800000,1791331199999]', breakdowns: ['up.cc'], output: ['total', 'daily'],
      filter: { 'up.p': 'iOS' },
      metrics: [
        { id: 'S', events: ['[CLY]_session'], aggregation: 'count' },
        { events: ['Purchase'], aggregation: 'unique', name: 'Buyers' },
        { cohort_id: 'c1' },
        { id: 'R', formula: 'S / A' },
      ],
    }, 'app');
    expect(body).toMatchObject({ name: 'q', visibility: 'global', description: '' });
    expect(body.query.scope).toEqual({ appIds: ['app'], dateRange: { from: '2025-09-01', to: '2026-10-06' } });
    expect(body.query.breakdowns).toEqual([{ id: 'up.cc', label: 'up.cc' }]);
    expect(body.query.outputs).toEqual(['total', 'daily']);
    const [s, a, c, r] = body.query.metrics;
    expect(s).toMatchObject({ letter: 'S', kind: 'custom', aggregation: 'count', events: ['[CLY]_session', '[CLY]_session_begin'] });
    expect(s.filter.nodes[0]).toMatchObject({ property: { id: 'up.p' }, picked: { operator: 'eq', value: 'iOS' } });
    expect(a).toMatchObject({ letter: 'A', kind: 'custom', events: ['[CLY]_custom'], eventNames: ['Purchase'], field: { id: 'uid', label: 'uid' }, name: 'Buyers' });
    expect(c).toMatchObject({ letter: 'B', kind: 'cohort', cohortId: 'c1' });
    expect(r).toEqual({ letter: 'R', kind: 'formula', expression: 'S / A' });
  });

  it('saves a classic event_key bookmark as a count metric', () => {
    const body: any = buildSaveBody({ name: 'b', event_key: 'Purchase', query_obj: '{"sg.x":{"$in":["y"]}}', by_val: '["sg.x"]', desc: 'd' }, 'app');
    expect(body).toMatchObject({ visibility: 'private', description: 'd' });
    expect(body.query.scope.dateRange).toEqual({ period: '30days' });
    expect(body.query.metrics[0]).toMatchObject({ letter: 'A', aggregation: 'count', eventNames: ['Purchase'] });
    expect(body.query.metrics[0].filter.nodes).toHaveLength(1);
    expect(body.query.breakdowns).toEqual([{ id: 'sg.x', label: 'sg.x' }]);
    expect(() => buildSaveBody({ name: 'x' }, 'app')).toThrow(/metrics/);
  });

  it('keeps rolling periods relative', () => {
    expect(toSavedDateRange('7days')).toEqual({ period: '7days' });
    expect(toSavedDateRange(undefined)).toEqual({ period: '30days' });
  });
});

describe('drill bookmarks on Platform', () => {
  const stored = (id: string, events: string[], extra: any = {}) => ({
    _id: id, name: id, visibility: 'private', appIds: ['app'], updatedAt: '2026-01-01',
    query: { scope: { appIds: ['app'], dateRange: { period: '30days' } }, metrics: [{ letter: 'A', kind: 'custom', aggregation: 'count', events }], breakdowns: [], outputs: ['total'] },
    ...extra,
  });

  it('lists saved queries, filtered by event', async () => {
    const { context, request } = serverContext(() => ok([
      stored('q1', ['[CLY]_session', '[CLY]_session_begin'], { origin: 'legacy', unsupported: { code: 'filter', detail: '$or' } }),
      stored('q2', ['[CLY]_custom'], {}),
    ]));
    const res = await new DrillTools(context).drill_bookmarks_list({ app_id: 'app', event_key: '[CLY]_session' });
    expect(request.mock.calls[0][0]).toMatchObject({ url: '/v2/drill/queries', params: { app_id: 'app' } });
    const list = json(res);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: 'q1', savedIn: 'old drill UI', runnable: false, window: '30days', metrics: [{ events: ['[CLY]_session'] }] });
  });

  it('lists across apps with scope "mine"', async () => {
    const { context, request } = serverContext(() => ok([]));
    await new DrillTools(context).drill_bookmarks_list({ scope: 'mine' });
    expect(request.mock.calls[0][0].params).toMatchObject({ scope: 'mine' });
    expect(request.mock.calls[0][0].params.app_id).toBeUndefined();
  });

  it('falls back to legacy bookmarks when saved queries are unavailable', async () => {
    const { context, get } = serverContext(() => fail(404), { legacyData: [] });
    const res = await new DrillTools(context).drill_bookmarks_list({ app_id: 'app' });
    expect((get.mock.calls[0] as any[])[1].params).toMatchObject({ method: 'drill_bookmarks' });
    expect(text(res)).toContain('No bookmarks found');
  });

  it('creates through POST /v2/drill/queries', async () => {
    const { context, request } = serverContext((_m, _u, _p, body) => ok({ ...body, _id: 'new', appIds: ['app'] }));
    const res = await new DrillTools(context).drill_bookmarks_create({ app_id: 'app', name: 'n', metrics: [{ events: ['E'] }] });
    expect(request.mock.calls[0][0]).toMatchObject({ method: 'post', url: '/v2/drill/queries' });
    expect(json(res)).toMatchObject({ id: 'new', name: 'n' });
  });

  it('deletes old-UI bookmarks through the legacy endpoint (v2 answers 404)', async () => {
    const { context, request, get } = serverContext(() => fail(404), { legacyData: { result: 'Success' } });
    await new DrillTools(context).drill_bookmarks_delete({ app_id: 'app', bookmark_id: 'b1' });
    expect(request.mock.calls[0][0]).toMatchObject({ method: 'delete', url: '/v2/drill/queries/b1' });
    expect((get.mock.calls[0] as any[])[0]).toBe('/i/drill/delete_bookmark');
  });

  it('does not fall back when v2 refuses the delete', async () => {
    const { context, get } = serverContext(() => fail(403));
    const res: any = await new DrillTools(context).drill_bookmarks_delete({ app_id: 'app', bookmark_id: 'b1' });
    expect(get).not.toHaveBeenCalled();
    expect(res.isError).toBe(true);
  });

  it('runs a saved query, resolving a relative window to days', async () => {
    const { context, request } = serverContext((method) => (method === 'get'
      ? ok(stored('q1', ['E']))
      : ok({ results: { total: [{ A: 5 }] }, meta: { hasMore: false } })));
    const res = await new DrillTools(context).drill_saved_query_run({ query_id: 'q1' });
    const body = request.mock.calls[1][0].data;
    expect(request.mock.calls[1][0].url).toBe('/v2/drill/queries/q1/data');
    expect(body.from).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(body.page).toBeUndefined();
    expect(json(res).results).toEqual({ total: [{ A: 5 }] });
  });

  it('pages runs of queries with breakdowns, and keeps an absolute saved window', async () => {
    const doc = stored('q1', ['E']);
    doc.query.breakdowns = [{ id: 'up.cc', label: 'up.cc' }] as any;
    (doc.query.scope as any).dateRange = { from: '2026-01-01', to: '2026-01-31' };
    const { context, request } = serverContext((method) => (method === 'get' ? ok(doc) : ok({ results: {}, meta: { hasMore: true, nextCursor: 'c2' } })));
    const res = await new DrillTools(context).drill_saved_query_run({ query_id: 'q1', limit: 5, sort: { by: 'A' } });
    const body = request.mock.calls[1][0].data;
    expect(body).toEqual({ page: { limit: 5 }, sort: { by: 'A', dir: 'desc' } });
    expect(text(res)).toContain('2026-01-01 to 2026-01-31');
    expect(json(res).nextCursor).toBe('c2');
  });

  it('refuses to run an old-UI query Platform cannot reproduce', async () => {
    const { context, request } = serverContext(() => ok(stored('q1', ['E'], { unsupported: { code: 'filter', detail: '$or' } })));
    const res: any = await new DrillTools(context).drill_saved_query_run({ query_id: 'q1' });
    expect(res.isError).toBe(true);
    expect(request).toHaveBeenCalledTimes(1);
  });
});

describe('drill metadata on Platform', () => {
  const meta = { up: { cc: { type: 'l' } }, custom: { tier: { type: 's' } }, cmp: {}, sg: { plan: { type: 'l' } } };

  it('queriable_fields_list reads v2 segmentation_meta', async () => {
    const { context, request } = serverContext(() => ok(meta));
    const res = await new DrillTools(context).queriable_fields_list({ app_id: 'app' });
    expect(request.mock.calls[0][0]).toMatchObject({ url: '/v2/drill/segmentation_meta', params: { app_id: 'app', event: '[CLY]_session' } });
    expect(text(res)).toContain('up.cc: list');
    expect(text(res)).toContain('custom.tier: string');
    expect(text(res)).not.toContain('sg.plan');
    const withEvent = await new DrillTools(context).queriable_fields_list({ app_id: 'app', event: 'Buy' });
    expect(text(withEvent)).toContain('sg.plan: list');
  });

  it('queriable_fields_list falls back to legacy without drill rights', async () => {
    const { context, get } = serverContext(() => fail(403), { legacyData: { up: { av: 'l' } } });
    const res = await new DrillTools(context).queriable_fields_list({ app_id: 'app' });
    expect((get.mock.calls[0] as any[])[1].params).toMatchObject({ method: 'segmentation_meta' });
    expect(text(res)).toContain('up.av');
  });

  it('metadata_get fetches all event segments in one batch call', async () => {
    const { context, request } = serverContext((method, url, _p, body) => {
      if (url === '/v2/drill/events') {
        return ok([{ key: 'Buy', name: 'Purchase' }]);
      }
      return ok({ results: body.pairs.map((p: any) => ({ appId: p.appId, eventKey: p.eventKey, meta: p.eventKey === 'Buy' ? meta : { ...meta, sg: {} } })) });
    });
    const res = await new DrillTools(context).metadata_get({ app_id: 'app' });
    expect(request).toHaveBeenCalledTimes(2);
    expect(request.mock.calls[1][0].data.pairs.map((p: any) => p.eventKey)).toEqual(['Buy', '[CLY]_session', '[CLY]_view', '[CLY]_crash', '[CLY]_push_action']);
    expect(text(res)).toContain('**Buy** (Purchase)\nSegments: plan (list)');
    expect(text(res)).toContain('1 custom events');
  });

  it('drill_property_values validates the property and maps the window', async () => {
    const { context, request } = serverContext(() => ok(['US', 'DE']));
    const tools = new DrillTools(context);
    expect(((await tools.drill_property_values({ app_id: 'app', property: 'cc' })) as any).isError).toBe(true);
    expect(((await tools.drill_property_values({ app_id: 'app', property: 'sg.plan' })) as any).isError).toBe(true);
    const res = await tools.drill_property_values({ app_id: 'app', property: 'up.cc', search: 'U', period: '[1000,2000]' });
    expect(request.mock.calls[0][0]).toMatchObject({ url: '/v2/drill/segmentation_big_meta', params: { app_id: 'app', event: '[CLY]_session', prop: 'up.cc', search: 'U', from: 1000, to: 2000 } });
    expect(json(res)).toEqual(['US', 'DE']);
  });
});

describe('drill_query paging', () => {
  it('only pages and sorts breakdown rows', async () => {
    const { context, request } = serverContext(() => ok({ results: { total: [{ A: 1 }] }, meta: {} }));
    const tools = new PlatformInsightsTools(context);
    await tools.drill_query({ app_id: 'app', metrics: [{ events: ['E'] }], sort: { by: 'A' } });
    expect(request.mock.calls[0][0].data.page).toBeUndefined();
    expect(request.mock.calls[0][0].data.sort).toBeUndefined();
    await tools.drill_query({ app_id: 'app', metrics: [{ events: ['E'] }], breakdowns: ['up.cc'], limit: 3 });
    expect(request.mock.calls[1][0].data.page).toEqual({ limit: 3 });
  });
});

describe('Platform schema overrides', () => {
  it('replace live, bookmark and query_data descriptions', () => {
    const overrides = getV2ToolDefinitionOverrides();
    for (const name of ['live_users', 'live_last_hour', 'live_last_day', 'live_last_30_days', 'drill_bookmarks_list', 'drill_bookmarks_create', 'query_data']) {
      expect(overrides[name]?.name).toBe(name);
    }
    expect(overrides.query_data.description).toContain('drill_query');
    expect(overrides.live_overall).toBeUndefined();
  });
});

describe('Platform insights default period', () => {
  // /v2/views/top rejects requests without a period ("Missing required
  // parameter: period"); the schema documents 30days as the default.
  it.each(['views_top', 'events_summary', 'events_top', 'events_movers'] as const)(
    '%s sends period=30days when none is given',
    async (tool) => {
      const { context, request } = serverContext(() => ok([]));
      await (new PlatformInsightsTools(context) as any)[tool]({ app_id: 'a1' });
      expect(request.mock.calls[0][0].params.period).toBe('30days');
    }
  );
});
