import { describe, it, expect, vi } from 'vitest';

import { DashboardsTools } from '../src/tools/dashboards.js';
import {
  compactWidgetData,
  periodToRange,
  widgetWindow,
} from '../src/tools/dashboards-v2.js';
import { getV2ToolDefinitionOverrides } from '../src/tools/index.js';

const NOW = Date.UTC(2026, 9, 6, 12, 0, 0); // 2026-10-06T12:00Z
const DAY = 86_400_000;

describe('periodToRange', () => {
  it('resolves day-count keywords to whole UTC days ending today', () => {
    const { from, to } = periodToRange('7days', NOW);
    expect(new Date(from).toISOString()).toBe('2026-09-30T00:00:00.000Z');
    expect(new Date(to).toISOString()).toBe('2026-10-06T23:59:59.999Z');
  });

  it('handles yesterday, month and custom ranges', () => {
    expect(periodToRange('yesterday', NOW)).toEqual({ from: Date.UTC(2026, 9, 5), to: Date.UTC(2026, 9, 6) - 1 });
    expect(periodToRange('month', NOW).from).toBe(Date.UTC(2026, 9, 1));
    expect(periodToRange([1, 2], NOW)).toEqual({ from: 1, to: 2 });
    expect(periodToRange({ from: 3, to: 4 }, NOW)).toEqual({ from: 3, to: 4 });
  });

  it('defaults to 30 days', () => {
    const { from, to } = periodToRange(undefined, NOW);
    expect((to + 1 - from) / DAY).toBe(30);
  });
});

describe('widgetWindow', () => {
  it('sends ISO from/to for drill widgets', () => {
    const w = widgetWindow({ kind: 'drill' }, '7days');
    expect(w.from).toMatch(/^\d{4}-\d\d-\d\dT00:00:00.000Z$/);
    expect(w.to).toMatch(/T23:59:59.999Z$/);
  });

  it('passes period keywords through for funnels and active profiles', () => {
    expect(widgetWindow({ kind: 'funnel' }, '7days')).toEqual({ period: '7days' });
    expect(widgetWindow({ kind: 'active-profiles' }, [1, 2])).toEqual({ period: '[1,2]' });
  });

  it('uses range only for custom retention windows', () => {
    expect(widgetWindow({ kind: 'retention' }, '30days')).toEqual({});
    expect(widgetWindow({ kind: 'retention' }, [1, 2])).toEqual({ range: '[1,2]' });
  });

  it('lets the widget period override the board period', () => {
    expect(widgetWindow({ kind: 'funnel', period: '60days' }, '7days')).toEqual({ period: '60days' });
  });

  it('sends nothing for profile tiles', () => {
    expect(widgetWindow({ kind: 'profiles' }, '7days')).toEqual({});
    expect(widgetWindow({ kind: 'online-profiles' }, '7days')).toEqual({});
  });
});

describe('compactWidgetData', () => {
  it('strips drill SQL', () => {
    const out = compactWidgetData('drill', { results: { total: [] }, meta: { computeTimeMs: 3, queries: [{ sql: 'SELECT' }] } });
    expect(out).toEqual({ results: { total: [] }, meta: { computeTimeMs: 3 } });
  });

  it('reports computing tasks and estimates', () => {
    expect(compactWidgetData('funnel', { task_id: 't1' })).toMatchObject({ status: 'computing', task_id: 't1' });
    expect(compactWidgetData('funnel', { heavy: true, estimate: { data: 5, fraction: 0.1 } }))
      .toMatchObject({ status: 'estimate', estimate: 5, estimateFraction: 0.1 });
  });

  it('keeps only recent per-minute online samples', () => {
    const perMinute = Array.from({ length: 60 }, (_, i) => ({ t: i, value: i }));
    const out = compactWidgetData('online-profiles', { historical: { perMinute } });
    expect(out.historical.perMinute).toHaveLength(10);
  });
});

/** Fake Platform server holding one board in memory */
function platformContext(board: any) {
  const request = vi.fn(async ({ method, url, data }: any) => {
    const ok = (body: unknown) => ({ status: 200, data: { data: body } });
    if (method === 'get' && url === `/v2/dashboards/${board.id}`) {
      return ok(board);
    }
    if (method === 'put' && url === `/v2/dashboards/${board.id}`) {
      Object.assign(board, data);
      return ok(board);
    }
    if (method === 'post' && url.endsWith('/data')) {
      return ok({ total: 42, window: data });
    }
    return { status: 404, data: { error: { code: 'NOT_FOUND', message: 'Dashboard not found' } } };
  });
  return {
    context: {
      httpClient: { request } as any,
      getAuthParams: () => ({ auth_token: 't' }),
      getServerCapabilities: async () => ({ v2: true }) as any,
    } as any,
    request,
  };
}

describe('dashboards tools on Platform', () => {
  const freshBoard = () => ({
    id: 'b1',
    name: 'Board',
    rows: [{ id: 'r1', height: 'auto', widgets: [{ id: 'w1', kind: 'profiles', appIds: ['a1'], size: '1/3' }] }],
  });

  it('switches tool definitions to the v2 variants', () => {
    const overrides = getV2ToolDefinitionOverrides();
    expect(Object.keys(overrides).sort()).toEqual([
      'dashboards_create', 'dashboards_data', 'dashboards_delete', 'dashboards_list',
      'dashboards_update', 'dashboards_widget_add', 'dashboards_widget_remove', 'dashboards_widget_update',
    ]);
  });

  it('returns widgets with their data', async () => {
    const { context } = platformContext(freshBoard());
    const res = await new DashboardsTools(context).getDashboardData({ dashboard_id: 'b1' });
    expect(res.content[0].text).toContain('"total": 42');
  });

  it('adds a widget to a new row and generates an id', async () => {
    const board = freshBoard();
    const { context } = platformContext(board);
    const res = await new DashboardsTools(context).addDashboardWidget({
      dashboard_id: 'b1',
      widget: { kind: 'online-profiles', appIds: ['a1'] },
    });
    expect(res.content[0].text).toMatch(/added in new row/);
    expect(board.rows).toHaveLength(2);
    expect(board.rows[1].widgets[0]).toMatchObject({ kind: 'online-profiles', size: '1/3' });
    expect(board.rows[1].widgets[0].id).toBeTruthy();
  });

  it('merges widget updates and refuses kind changes', async () => {
    const board = freshBoard();
    const { context } = platformContext(board);
    const tools = new DashboardsTools(context);
    await tools.updateDashboardWidget({ dashboard_id: 'b1', widget_id: 'w1', widget: { title: 'Users' } });
    expect(board.rows[0].widgets[0]).toMatchObject({ id: 'w1', kind: 'profiles', title: 'Users' });
    const refused = await tools.updateDashboardWidget({ dashboard_id: 'b1', widget_id: 'w1', widget: { kind: 'drill' } });
    expect((refused as any).isError).toBe(true);
  });

  it('removes a widget and its now-empty row', async () => {
    const board = freshBoard();
    const { context } = platformContext(board);
    await new DashboardsTools(context).removeDashboardWidget({ dashboard_id: 'b1', widget_id: 'w1' });
    expect(board.rows).toEqual([]);
  });

  it('surfaces v2 error messages', async () => {
    const { context } = platformContext(freshBoard());
    const res = await new DashboardsTools(context).getDashboardData({ dashboard_id: 'missing' });
    expect((res as any).isError).toBe(true);
    expect(res.content[0].text).toContain('Dashboard not found');
  });
});
