import { describe, it, expect, vi } from 'vitest';

import { isToolSupported, V2_ONLY_TOOLS } from '../src/lib/tools-config.js';
import { TOOL_GUARDS } from '../src/lib/tool-guards.js';
import {
  compactPayload,
  periodToRange,
  platformExtrasToolDefinitions,
  PlatformExtrasTools,
  summariseFlowData,
  toDropoffStep,
} from '../src/tools/platform-extras.js';

/** Context of a Platform server whose /v2 answers come from `v2` */
function platformContext(v2: (method: string, url: string, params: any, body: any) => { status: number; data: any }) {
  const request = vi.fn(async ({ method, url, params, data }: any) => v2(method, url, params, data));
  return {
    context: {
      httpClient: { request } as any,
      getAuthParams: () => ({ auth_token: 't' }),
      resolveAppId: async (args: any) => args.app_id,
      getServerCapabilities: async () => ({ v2: true }) as any,
    } as any,
    request,
  };
}
const ok = (data: unknown) => ({ status: 200, data: { data } });
const text = (res: any) => res.content[0].text as string;
const json = (res: any) => JSON.parse(text(res).slice(text(res).indexOf('\n') + 1));

describe('platform extras registration', () => {
  it('every tool is v2-only and has a permission guard', () => {
    for (const tool of platformExtrasToolDefinitions) {
      expect(V2_ONLY_TOOLS.has(tool.name)).toBe(true);
      expect(TOOL_GUARDS[tool.name]).toBeDefined();
      expect(isToolSupported(tool.name, null, false)).toBe(false);
      expect(isToolSupported(tool.name, null, true)).toBe(true);
    }
  });

  it('plugin-backed tools are hidden when the plugin is off', () => {
    expect(isToolSupported('flows_list', ['drill'], true)).toBe(false);
    expect(isToolSupported('flows_list', ['flows'], true)).toBe(true);
    expect(isToolSupported('ratings_stats', ['star-rating'], true)).toBe(true);
    expect(isToolSupported('tasks_list', [], true)).toBe(true);
  });
});

describe('flows', () => {
  it('lists flows with paging and unescaped names', async () => {
    const { context, request } = platformContext(() => ok({
      iTotalDisplayRecords: 4,
      aaData: [{ id: 'a_1', name: 'It&#39;s &quot;x&quot;', status: 'ready', definition: { anchorId: { e: '[CLY]_session' }, direction: 'forward', excludedEventIds: ['a', 'b'] }, runAt: '2026-01-01T00:00:00Z' }],
    }));
    const res = await new PlatformExtrasTools(context).flows_list({ app_id: 'a', search: 'x', skip: 5, limit: 1 });
    expect(request.mock.calls[0][0]).toMatchObject({ url: '/v2/flows', params: { app_id: 'a', sSearch: 'x', iDisplayStart: 5, iDisplayLength: 1 } });
    expect(json(res)[0]).toMatchObject({ name: 'It\'s "x"', excludedEvents: 2, anchor: { e: '[CLY]_session' } });
  });

  it('summarises the graph per step from the anchor', () => {
    const out = summariseFlowData({
      graph: {
        anchorColumn: 0, total: 100, direction: 'forward',
        nodes: [
          { id: 's0', label: 'Session', column: 0, value: 100, valuePct: 100, kind: 'session' },
          { id: 'a1', label: 'A', column: 1, value: 60, valuePct: 60, kind: 'event' },
          { id: 'b1', label: 'B', column: 1, value: 30, valuePct: 30, kind: 'event' },
          { id: 'c1', label: 'C', column: 1, value: 10, valuePct: 10, kind: 'event' },
          { id: 'x9', label: 'Far', column: 9, value: 5, valuePct: 5, kind: 'event' },
        ],
        links: [
          { source: 's0', target: 'a1', value: 60, valuePct: 60 },
          { source: 's0', target: 'c1', value: 10, valuePct: 10 },
        ],
      },
      paths: [],
      anchor: { label: 'Session', volume: 100 },
      sampling: { sampled: false },
      version: 'v2',
    }, 3, 2);
    expect(out.steps).toHaveLength(2);
    expect(out.steps[1]).toMatchObject({ step: 1, otherEvents: 1 });
    expect(out.steps[1].events.map((e: any) => e.event)).toEqual(['A', 'B']);
    expect(out.topTransitions).toEqual([{ from: 'Session (step 0)', to: 'A (step 1)', users: 60, pct: 60 }]);
    expect(out.sampling).toBeUndefined();
  });

  it('maps drop-off steps to drill step queries', async () => {
    expect(toDropoffStep('Purchase')).toEqual({ e: '[CLY]_custom', n: 'Purchase' });
    expect(toDropoffStep('[CLY]_session')).toEqual({ e: '[CLY]_session' });
    expect(toDropoffStep('{"e":"[CLY]_view","n":"Home"}')).toEqual({ e: '[CLY]_view', n: 'Home' });
    const { context, request } = platformContext(() => ok({ destinations: [{ event: 'x_1', label: 'Home', users: 3, occurrences: 4 }], sampling: { sampled: false } }));
    const res = await new PlatformExtrasTools(context).flows_dropoff({ app_id: 'a', steps: ['A'], missing_step: 'B', distance: 1 });
    expect(request.mock.calls[0][0]).toMatchObject({
      method: 'post', url: '/v2/flows/dropoff', params: { app_id: 'a' },
      data: { events: [{ e: '[CLY]_custom', n: 'A' }, { e: '[CLY]_custom', n: 'B' }], distance: 1, period: '30days' },
    });
    expect(json(res)).toEqual({ destinations: [{ event: 'Home', users: 3, occurrences: 4 }] });
  });
});

describe('ratings', () => {
  it('maps widget list filters and computes the average', async () => {
    const { context, request } = platformContext(() => ok({ items: [{ _id: 'w', popup_header_text: 'Q?', status: true, ratingsCount: 4, ratingsSum: 14, timesShown: 9 }], total: 1, page: 2 }));
    const res = await new PlatformExtrasTools(context).ratings_widgets_list({ app_id: 'a', active: false, page: 2, limit: 10 });
    expect(request.mock.calls[0][0].params).toMatchObject({ app_id: 'a', status: false, page: 2, pageSize: 10 });
    expect(json(res)[0]).toMatchObject({ id: 'w', name: 'Q?', active: true, responses: 4, avgRating: 3.5 });
  });

  it('turns the distribution into a score map', async () => {
    const { context, request } = platformContext(() => ok({ period: '7days', responses: 3, avgRating: 2.333333, timesShown: 5, distribution: [{ rating: 1, count: 2 }, { rating: 5, count: 1 }] }));
    const res = await new PlatformExtrasTools(context).ratings_stats({ app_id: 'a', widget_id: 'w', period: '7days' });
    expect(request.mock.calls[0][0].url).toBe('/v2/star-rating/widgets/w/stats');
    expect(json(res)).toMatchObject({ avgRating: 2.33, distribution: { 1: 2, 5: 1 } });
  });
});

describe('campaigns', () => {
  it('lists per channel when the mixed list fails server-side', async () => {
    const { context, request } = platformContext((_m, _u, params) => {
      if (!params.channel || params.channel === 'rating') {
        return { status: 500, data: { error: { code: 'INTERNAL_ERROR', message: 'Unexpected error' } } };
      }
      return ok({ items: params.channel === 'push' ? [{ _id: 'c', name: 'P', channel: 'push', status: 'sent', trigger: { kind: 'one-time' }, result: { sent: 2, errors: {} } }] : [], total: params.channel === 'push' ? 1 : 0, page: 1 });
    });
    const res = await new PlatformExtrasTools(context).campaigns_list({ app_id: 'a' });
    expect(request).toHaveBeenCalledTimes(5);
    expect(text(res)).toContain('failed to list channel rating');
    expect(json(res).push.campaigns[0]).toEqual({ id: 'c', name: 'P', channel: 'push', status: 'sent', trigger: 'one-time', result: { sent: 2 } });
  });

  it('does not retry a filtered list', async () => {
    const { context, request } = platformContext(() => ({ status: 500, data: { error: { code: 'INTERNAL_ERROR', message: 'boom' } } }));
    const res: any = await new PlatformExtrasTools(context).campaigns_list({ app_id: 'a', channel: 'rating' });
    expect(res.isError).toBe(true);
    expect(request).toHaveBeenCalledTimes(1);
  });
});

describe('AI assistants analytics', () => {
  it('converts the period to epoch-ms bounds', () => {
    const now = Date.UTC(2026, 9, 6, 12);
    expect(periodToRange('7days', now)).toEqual({ from: Date.UTC(2026, 8, 30), to: now });
    expect(periodToRange('[1,2]', now)).toEqual({ from: 1, to: 2 });
    expect(periodToRange('yesterday', now)).toEqual({ from: Date.UTC(2026, 9, 5), to: Date.UTC(2026, 9, 6) - 1 });
    expect(() => periodToRange('forever', now)).toThrow();
  });

  it('caps lists and folds daily series', () => {
    expect(compactPayload({ rows: [1, 2, 3], byDay: [{ date: 'd1', value: 0 }, { date: 'd2', value: 4 }] }, 2))
      .toEqual({ rows: [1, 2, '… 1 more'], byDay: { d2: 4 } });
  });

  it('passes tab, thread and property', async () => {
    const { context, request } = platformContext(() => ok({ kpis: {} }));
    await new PlatformExtrasTools(context).ai_assistants_analytics({ app_id: 'a', tab: 'composition', property: 'cc', period: '[10,20]' });
    expect(request.mock.calls[0][0].params).toMatchObject({ app_id: 'a', tab: 'composition', property: 'cc', from: 10, to: 20 });
  });
});

describe('tasks and misc', () => {
  it('builds the task query and compacts rows', async () => {
    const { context, request } = platformContext(() => ok({
      tasks: [{ _id: 't', report_name: 'R', type: 'drill', status: 'completed', meta: '{"event":"e"}', request: '{"huge":true}', ts: 0, end: 1700000000000, subtasks: { a: { status: 'errored' }, b: {} } }],
      total: 1,
    }));
    const res = await new PlatformExtrasTools(context).tasks_list({ app_id: 'a', type: 'drill', all_apps: true });
    expect(request.mock.calls[0][0].params).toMatchObject({ app_id: 'a', data_source: 'all', query: '{"type":"drill"}', skip: 0, limit: 20 });
    const row = json(res)[0];
    expect(row).toMatchObject({ id: 't', name: 'R', meta: { event: 'e' }, subtasks: 2, erroredSubtasks: 1, finished: '2023-11-14T22:13:20.000Z' });
    expect(row.request).toBeUndefined();
  });

  it('truncates very large task results', async () => {
    const { context } = platformContext(() => ok({ status: 'completed', errormsg: null, data: { blob: 'x'.repeat(40_000) } }));
    const res = await new PlatformExtrasTools(context).task_result({ app_id: 'a', task_id: 't' });
    expect(text(res)).toContain('output truncated');
    expect(text(res).length).toBeLessThan(31_000);
  });

  it('reads notifications without an app', async () => {
    const { context, request } = platformContext(() => ok({ items: [{ _id: 'n', category: 'c', title: 'T', ts: 0, read: false }], unreadCount: 1 }));
    const res = await new PlatformExtrasTools(context).notifications_list({});
    expect(request.mock.calls[0][0].params).toEqual({ auth_token: 't', limit: 20 });
    expect(text(res)).toContain('1 unread');
  });

  it('joins crash ids for Jira lookup', async () => {
    const { context, request } = platformContext(() => ok({ rows: [{ crashgroup_id: 'c1', issue_key: 'J-1', url: 'u', created: 1700000000000, last_checked: null }] }));
    const res = await new PlatformExtrasTools(context).crash_jira_issues({ app_id: 'a', crash_ids: ['c1', ' c2 '] });
    expect(request.mock.calls[0][0].params.crashgroup_ids).toBe('c1,c2');
    expect(json(res)).toEqual([{ crash_id: 'c1', issue: 'J-1', url: 'u', linked: '2023-11-14T22:13:20.000Z' }]);
  });
});
