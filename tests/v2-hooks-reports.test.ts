import { describe, it, expect, vi } from 'vitest';

import { HooksTools } from '../src/tools/hooks.js';
import { EmailReportsTools } from '../src/tools/email-reports.js';
import { htmlToText } from '../src/tools/v2/email-reports.js';

type Handler = (method: string, url: string, params: any, body: any) => { status: number; data: any };

/** Context of a Platform server: v2 requests go to `v2`, legacy GETs to `legacy` */
function platformContext(v2: Handler, v2Enabled = true) {
  const request = vi.fn(async ({ method, url, params, data }: any) => v2(method, url, params, data));
  const get = vi.fn(async () => ({ data: { hooksList: [] } }));
  const resolveAppId = vi.fn(async (args: any) => args.app_id ?? 'resolved-app');
  return {
    context: {
      httpClient: { request, get } as any,
      getAuthParams: () => ({ auth_token: 't' }),
      resolveAppId,
      getServerCapabilities: async () => ({ v2: v2Enabled }) as any,
    } as any,
    request,
    get,
    resolveAppId,
  };
}
const ok = (data: unknown) => ({ status: 200, data: { data } });
const text = (res: any) => res.content[0].text as string;
const json = (res: any) => JSON.parse(text(res).slice(text(res).indexOf('\n') + 1));

const storedHook = {
  _id: 'h1',
  name: 'Hook',
  description: '',
  apps: ['app'],
  trigger: { type: 'APIEndPointTrigger', configuration: { path: 'p' } },
  effects: [{ type: 'CustomCodeEffect', configuration: { code: 'x' } }],
  enabled: true,
  createdBy: 'm1',
  createdByUser: 'Ann',
  created_at: 1_700_000_000_000,
  lastTriggerTimestamp: 1_700_000_100_000,
  triggerCount: 3,
  appNameList: 'App',
  created_at_string: '2 days ago',
};

describe('hooks on Platform', () => {
  it('lists with filters and paging, and compacts rows', async () => {
    const { context, request } = platformContext(() => ok({ items: [storedHook], page: 2, pageSize: 5, total: 6 }));
    const res = await new HooksTools(context).hooks_list({ app_id: 'app', enabled: false, search: 'x', page: 2, page_size: 5 });
    const call = request.mock.calls[0][0];
    expect(call).toMatchObject({ method: 'get', url: '/v2/hooks' });
    expect(call.params).toMatchObject({ app_id: 'app', enabled: 'false', search: 'x', page: 2, pageSize: 5 });
    expect(text(res)).toContain('6 total');
    const [row] = json(res);
    expect(row).toMatchObject({ id: 'h1', createdBy: 'Ann', triggerCount: 3, lastTriggered: new Date(1_700_000_100_000).toISOString() });
    expect(row.appNameList).toBeUndefined();
    expect(row.created_at_string).toBeUndefined();
  });

  it('lists hooks of all apps when no app is given', async () => {
    const { context, request, resolveAppId } = platformContext(() => ok({ items: [], page: 1, pageSize: 20, total: 0 }));
    await new HooksTools(context).hooks_list({});
    expect(resolveAppId).not.toHaveBeenCalled();
    expect(request.mock.calls[0][0].params.app_id).toBeUndefined();
  });

  it('gets one hook with error logs newest first', async () => {
    const { context, request } = platformContext(() => ok({
      ...storedHook,
      error_logs: [{ e: 'old', timestamp: 1 }, { e: 'new', timestamp: 2, effectStep: 0, params: { a: 1 } }],
    }));
    const res = await new HooksTools(context).hooks_get({ hook_id: 'h1' });
    expect(request.mock.calls[0][0].url).toBe('/v2/hooks/h1');
    expect(json(res).errorLogs.map((l: any) => l.error)).toEqual(['new', 'old']);
  });

  it('creates with parsed trigger and effects, enabled by default', async () => {
    const { context, request } = platformContext(() => ok(storedHook));
    await new HooksTools(context).hooks_create({
      app_id: 'app', name: 'N', description: 'D', apps: ['app'],
      trigger_type: 'ScheduledTrigger', trigger_config: '{"cron":"0 6 * * *","timezone2":"UTC"}',
      effects: '[{"type":"HTTPEffect","configuration":{"url":"https://example.invalid","method":"get"}}]',
    });
    const call = request.mock.calls[0][0];
    expect(call).toMatchObject({ method: 'post', url: '/v2/hooks' });
    expect(call.data).toEqual({
      name: 'N', description: 'D', apps: ['app'], enabled: true,
      trigger: { type: 'ScheduledTrigger', configuration: { cron: '0 6 * * *', timezone2: 'UTC' } },
      effects: [{ type: 'HTTPEffect', configuration: { url: 'https://example.invalid', method: 'get' } }],
    });
  });

  it('patches only the supplied fields', async () => {
    const { context, request, get } = platformContext(() => ok(storedHook));
    await new HooksTools(context).hooks_update({ app_id: 'app', hook_id: 'h1', name: 'New', enabled: false });
    expect(get).not.toHaveBeenCalled();
    expect(request.mock.calls[0][0]).toMatchObject({ method: 'patch', url: '/v2/hooks/h1', data: { name: 'New', enabled: false } });
  });

  it('uses the status route when only enabled changes', async () => {
    const { context, request } = platformContext(() => ok(storedHook));
    await new HooksTools(context).hooks_update({ app_id: 'app', hook_id: 'h1', enabled: true });
    expect(request.mock.calls[0][0]).toMatchObject({ method: 'put', url: '/v2/hooks/h1/status', data: { enabled: true } });
  });

  it('requires trigger_type and trigger_config together', async () => {
    const { context, request } = platformContext(() => ok(storedHook));
    await expect(new HooksTools(context).hooks_update({ app_id: 'app', hook_id: 'h1', trigger_type: 'ScheduledTrigger' }))
      .rejects.toThrow(/must be provided together/);
    expect(request).not.toHaveBeenCalled();
  });

  it('dry-runs a config, filling apps and enabled, and drops echoed config', async () => {
    const { context, request } = platformContext(() => ok([
      { params: { a: 1 }, rule: { huge: true } },
      { params: { a: 1, b: 2 }, effect: { type: 'CustomCodeEffect' }, effectStep: 0, logs: ['hi'] },
    ]));
    const res = await new HooksTools(context).hooks_test({
      app_id: 'app',
      hook_config: '{"name":"T","trigger":{"type":"APIEndPointTrigger","configuration":{"path":"p"}},"effects":[{"type":"CustomCodeEffect","configuration":{"code":"x"}}]}',
      mock_data: '{"paths":["","o","hooks","p"]}',
    });
    const body = request.mock.calls[0][0].data;
    expect(request.mock.calls[0][0].url).toBe('/v2/hooks/test');
    expect(body.hook).toMatchObject({ name: 'T', apps: ['app'], enabled: true, description: '' });
    expect(body.mockData).toEqual({ paths: ['', 'o', 'hooks', 'p'] });
    const out = json(res);
    expect(out.matched).toBe(true);
    expect(out.steps[1]).toEqual({ step: 'effect 0 (CustomCodeEffect)', params: { a: 1, b: 2 }, logs: ['hi'] });
    expect(text(res)).not.toContain('huge');
  });

  it('reports a dry run whose trigger did not match', async () => {
    const { context } = platformContext(() => ok([]));
    const res = await new HooksTools(context).hooks_test({ app_id: 'app', hook_config: '{"trigger":{},"effects":[]}' });
    expect(json(res).matched).toBe(false);
  });

  it('surfaces v2 errors as tool errors', async () => {
    const { context } = platformContext(() => ({ status: 404, data: { error: { code: 'NOT_FOUND', message: 'Hook not found' } } }));
    const res = await new HooksTools(context).hooks_delete({ app_id: 'app', hook_id: 'nope' });
    expect(res.isError).toBe(true);
    expect(text(res)).toContain('Hook not found');
  });

  it('stays on the legacy API without /v2, and reads the {hooksList} answer', async () => {
    const { context, request, get } = platformContext(() => ok(null), false);
    get.mockResolvedValueOnce({ data: { hooksList: [{ ...storedHook, _id: 'h1' }] } });
    get.mockResolvedValueOnce({ data: { result: 'ok' } });
    const res = await new HooksTools(context).hooks_update({ app_id: 'app', hook_id: 'h1', name: 'N' });
    expect(request).not.toHaveBeenCalled();
    expect(get.mock.calls[1][0]).toBe('/i/hook/save');
    expect(text(res)).toContain('updated successfully');
  });
});

const coreReport = {
  _id: 'r1', report_type: 'core', title: 'Weekly', emails: ['a@example.invalid'], apps: ['app'],
  metrics: { analytics: true, crash: false }, frequency: 'weekly', day: 1, hour: 7, minute: 5, timezone: 'Europe/Riga',
  r_day: 1, r_hour: 4, r_minute: 5, user: 'm1', userName: 'Ann', visibility: { mode: 'private', sharedEmails: [], sharedUserGroupIds: [] },
  isOwner: true, editable: true, enabled: true,
};
const dashReport = {
  _id: 'r2', report_type: 'dashboards', title: 'Board', emails: ['b@example.invalid'], apps: [], dashboards: 'd1',
  date_range: '7days', frequency: 'daily', day: 0, hour: 6, minute: 0, timezone: 'Etc/GMT', isValid: false,
};

describe('email reports on Platform', () => {
  it('lists, filtered by app and title, and compacts rows', async () => {
    const other = { ...coreReport, _id: 'r3', apps: ['other'] };
    const { context, request } = platformContext(() => ok([coreReport, dashReport, other]));
    const res = await new EmailReportsTools(context).listEmailReports({ app_id: 'app' });
    expect(request.mock.calls[0][0]).toMatchObject({ method: 'get', url: '/v2/reports' });
    const rows = json(res);
    expect(rows.map((r: any) => r.id)).toEqual(['r1', 'r2']);
    expect(rows[0]).toMatchObject({ metrics: ['analytics'], schedule: 'weekly on Monday at 07:05 Europe/Riga', owner: 'Ann' });
    expect(rows[0].r_hour).toBeUndefined();
    expect(rows[1]).toMatchObject({ type: 'dashboards', dashboard: 'd1', dateRange: '7days', isValid: false });

    const searched = await new EmailReportsTools(context).listEmailReports({ search: 'board' });
    expect(json(searched).map((r: any) => r.id)).toEqual(['r2']);
  });

  it('creates a core report as JSON', async () => {
    const { context, request } = platformContext(() => ok(coreReport));
    await new EmailReportsTools(context).createCoreEmailReport({
      app_id: 'app', title: 'T', apps: ['app'], emails: ['a@example.invalid'], metrics: { analytics: true },
      frequency: 'weekly', day: 2, timezone: 'UTC', hour: 7,
    });
    const call = request.mock.calls[0][0];
    expect(call).toMatchObject({ method: 'post', url: '/v2/reports' });
    expect(call.data).toEqual({
      report_type: 'core', title: 'T', apps: ['app'], emails: ['a@example.invalid'], metrics: { analytics: true },
      selectedEvents: [], frequency: 'weekly', day: 2, timezone: 'UTC', hour: 7, minute: 0, sendPdf: true,
    });
  });

  it('creates a dashboard report referencing the dashboard id', async () => {
    const { context, request } = platformContext(() => ok(dashReport));
    await new EmailReportsTools(context).createDashboardEmailReport({
      app_id: 'app', title: 'B', emails: ['b@example.invalid'], dashboards: 'd1', date_range: '7days',
      frequency: 'daily', timezone: 'UTC', hour: 6, sendPdf: false,
    });
    expect(request.mock.calls[0][0].data).toMatchObject({ report_type: 'dashboards', dashboards: 'd1', date_range: '7days', sendPdf: false });
    expect(request.mock.calls[0][0].data.apps).toBeUndefined();
  });

  it('patches with the stored schedule carried over', async () => {
    const { context, request } = platformContext((method) => ok(method === 'get' ? coreReport : { ...coreReport, hour: 9 }));
    await new EmailReportsTools(context).updateEmailReport({
      app_id: 'app', report_id: 'r1', hour: 9, report_data: { selectedEvents: ['Buy'], _id: 'evil' },
    });
    const patch = request.mock.calls[1][0];
    expect(patch).toMatchObject({ method: 'patch', url: '/v2/reports/r1' });
    expect(patch.data).toEqual({
      selectedEvents: ['Buy'], hour: 9, frequency: 'weekly', timezone: 'Europe/Riga', day: 1, minute: 5,
    });
  });

  it('renders the preview HTML as text', async () => {
    const html = `<!DOCTYPE html><html><head><title>R</title><style>.x{}</style></head><body>
      <h1>Your Weekly Report</h1>
      <table><tr class="desktop-table"><td>
        <table align="left"><tr><td><table><tr><td>Total Sessions</td></tr></table></td></tr></table>
        <table align="left"><tr><td>7</td></tr></table>
        <table align="right"><tr><td>600%</td></tr></table>
      </td></tr>
      <tr class="mobile-table" style="display: none;"><td>Total Sessions mobile</td></tr></table>
      <a href="https://example.invalid/dash">Go &amp; see</a></body></html>`;
    const { context, request } = platformContext(() => ({ status: 200, data: html }));
    const res = await new EmailReportsTools(context).previewEmailReport({ app_id: 'app', report_id: 'r1' });
    expect(request.mock.calls[0][0].url).toBe('/v2/reports/r1/preview');
    expect(text(res)).toContain('Your Weekly Report\nTotal Sessions | 7 | 600%\nGo & see (https://example.invalid/dash)');
    expect(text(res)).not.toContain('mobile');
  });

  it('passes "No data to report" through', async () => {
    const { context } = platformContext(() => ok('No data to report'));
    const res = await new EmailReportsTools(context).previewEmailReport({ app_id: 'app', report_id: 'r1' });
    expect(text(res)).toBe('Email report preview: No data to report');
  });

  it('truncates very long previews', async () => {
    expect(htmlToText(`<p>${'word '.repeat(5000)}</p>`).length).toBeGreaterThan(8000);
    const { context } = platformContext(() => ({ status: 200, data: `<p>${'word '.repeat(5000)}</p>` }));
    const res = await new EmailReportsTools(context).previewEmailReport({ app_id: 'app', report_id: 'r1' });
    expect(text(res)).toMatch(/truncated, \d+ more chars/);
    expect(text(res).length).toBeLessThan(8200);
  });

  it('sends now and reports the recipient count', async () => {
    const { context, request } = platformContext(() => ok({ sent: 1 }));
    const res = await new EmailReportsTools(context).sendEmailReport({ app_id: 'app', report_id: 'r1' });
    expect(request.mock.calls[0][0]).toMatchObject({ method: 'post', url: '/v2/reports/r1/send' });
    expect(text(res)).toContain('"sent": 1');
  });

  it('flags a send the server declined as an error', async () => {
    const { context } = platformContext(() => ok('No recipients'));
    const res = await new EmailReportsTools(context).sendEmailReport({ app_id: 'app', report_id: 'r1' });
    expect(text(res)).toContain('Email report not sent: No recipients');
    expect(res.isError).toBe(true);
  });

  it('deletes by id', async () => {
    const { context, request } = platformContext(() => ok({ ok: true, _id: 'r1' }));
    await new EmailReportsTools(context).deleteEmailReport({ app_id: 'app', report_id: 'r1' });
    expect(request.mock.calls[0][0]).toMatchObject({ method: 'delete', url: '/v2/reports/r1' });
  });

  it('stays on the legacy API without /v2', async () => {
    const { context, request, get } = platformContext(() => ok(null), false);
    get.mockResolvedValueOnce({ data: [] } as any);
    await new EmailReportsTools(context).listEmailReports({ app_id: 'app' });
    expect(request).not.toHaveBeenCalled();
    expect(get.mock.calls[0][0]).toBe('/o/reports/all');
  });
});
