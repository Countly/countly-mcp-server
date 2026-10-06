import { describe, it, expect, vi } from 'vitest';

import { AppManagementTools } from '../src/tools/app-management.js';
import { CrashAnalyticsTools } from '../src/tools/crash-analytics.js';
import { DashboardUsersTools } from '../src/tools/dashboard-users.js';
import { EventsTools } from '../src/tools/events.js';
import { NotesTools } from '../src/tools/notes.js';
import { UserProfilesTools } from '../src/tools/user-profiles.js';
import { getV2ToolDefinitionOverrides } from '../src/tools/index.js';
import { V2_ONLY_TOOLS } from '../src/lib/tools-config.js';
import { compactMember } from '../src/tools/v2/apps.js';

type Reply = { status: number; data: any };

/** Server context: v2 requests go to `v2`, legacy GETs to `legacy` */
function serverContext(
  v2: (method: string, url: string, params: any, body: any) => Reply,
  legacy: (url: string, params: any) => any = () => ({}),
  isPlatform = true
) {
  const request = vi.fn(async ({ method, url, params, data }: any) => v2(method, url, params, data));
  const get = vi.fn(async (url: string, opts: any) => ({ data: legacy(url, opts?.params) }));
  return {
    context: {
      httpClient: { request, get } as any,
      getAuthParams: () => ({ auth_token: 't' }),
      resolveAppId: async (args: any) => args.app_id,
      getApps: async () => [{ _id: 'a1', name: 'Legacy App' }],
      getServerCapabilities: async () => ({ v2: isPlatform }) as any,
    } as any,
    request,
    get,
  };
}
const ok = (data: unknown): Reply => ({ status: 200, data: { data } });
const fail = (status: number): Reply => ({ status, data: { error: { code: 'X', message: `failed ${status}` } } });
const text = (res: any) => res.content[0].text as string;
const json = (res: any) => JSON.parse(text(res).split(':\n').slice(1).join(':\n'));

describe('notes on Platform', () => {
  const v2Note = {
    id: 'n1', appId: 'app', note: 'Release', ts: 1_700_000_000_000, color: 3, visibility: 'shared',
    sharing: { users: ['a@example.invalid'], userGroups: [] }, owner: 'm1', ownerName: 'Ann',
    version: 2, scope: { event: 'Buy' }, canEdit: true, createdAt: 1,
  };

  it('lists notes for a period window and compacts them', async () => {
    const { context, request, get } = serverContext(() => ok({ notes: [v2Note] }));
    const res = await new NotesTools(context).listNotes({ app_id: 'app', period: '[1000,2000]' });
    expect(request.mock.calls[0][0]).toMatchObject({ method: 'get', url: '/v2/notes', params: { app_id: 'app', from: 1000, to: 2000 } });
    expect(get).not.toHaveBeenCalled();
    const [note] = json(res);
    expect(note).toMatchObject({ id: 'n1', color: 'orange', visibility: 'shared', shared_with: ['a@example.invalid'], event: 'Buy', owner: 'Ann' });
    expect(note.time).toBe(new Date(1_700_000_000_000).toISOString());
  });

  it('creates a note: seconds to ms, color name to code, legacy noteType mapped', async () => {
    const { context, request } = serverContext(() => ok(v2Note));
    await new NotesTools(context).createNote({ app_id: 'app', note: 'x', ts: 1_700_000_000, color: 'pink', noteType: 'public', event: 'Buy' });
    const call = request.mock.calls[0][0];
    expect(call).toMatchObject({ method: 'post', url: '/v2/notes', params: { app_id: 'app' } });
    expect(call.data).toEqual({
      note: 'x', ts: 1_700_000_000_000, color: 4, visibility: 'global',
      sharing: { users: [], userGroups: [] }, scope: { event: 'Buy' },
    });
  });

  it('updates a note by merging onto the current version', async () => {
    const { context, request } = serverContext((method) => (method === 'get' ? ok({ notes: [v2Note] }) : ok({ ...v2Note, note: 'New' })));
    const res = await new NotesTools(context).updateNote({ app_id: 'app', note_id: 'n1', note: 'New', event: '' });
    const put = request.mock.calls[1][0];
    expect(put).toMatchObject({ method: 'put', url: '/v2/notes/n1' });
    expect(put.data).toEqual({
      note: 'New', ts: v2Note.ts, color: 3, visibility: 'shared',
      sharing: { users: ['a@example.invalid'], userGroups: [] },
    });
    expect(text(res)).toContain('updated');
  });

  it('reports a missing note on update without calling PUT', async () => {
    const { context, request } = serverContext(() => ok({ notes: [] }));
    const res: any = await new NotesTools(context).updateNote({ app_id: 'app', note_id: 'nope', note: 'x' });
    expect(res.isError).toBe(true);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('deletes through DELETE /v2/notes/:id', async () => {
    const { context, request } = serverContext(() => ok({ deleted: true }));
    await new NotesTools(context).deleteNote({ note_id: 'n1' });
    expect(request.mock.calls[0][0]).toMatchObject({ method: 'delete', url: '/v2/notes/n1' });
  });

  it('keeps legacy notes endpoints and refuses notes_update without /v2', async () => {
    const { context, request, get } = serverContext(() => ok({}), () => ({ aaData: [] }), false);
    await new NotesTools(context).listNotes({ app_id: 'app' });
    expect(get.mock.calls[0][0]).toBe('/o');
    const res: any = await new NotesTools(context).updateNote({ app_id: 'app', note_id: 'n1' });
    expect(res.isError).toBe(true);
    expect(request).not.toHaveBeenCalled();
  });

  it('is Platform-only and has a v2 create schema', () => {
    expect(V2_ONLY_TOOLS.has('notes_update')).toBe(true);
    const props = getV2ToolDefinitionOverrides().notes_create.inputSchema.properties;
    expect(props.visibility.enum).toEqual(['private', 'shared', 'global']);
  });
});

describe('crash group state changes on Platform', () => {
  it.each([
    ['resolveCrash', 'resolve'],
    ['unresolveCrash', 'unresolve'],
    ['hideCrash', 'hide'],
    ['showCrash', 'show'],
  ])('%s sends action=%s', async (method, action) => {
    const { context, request, get } = serverContext(() => ok({ _id: 'g1', action, is_resolved: action === 'resolve', is_hidden: action === 'hide' }));
    const res = await (new CrashAnalyticsTools(context) as any)[method]({ app_id: 'app', crash_id: 'g1' });
    expect(request.mock.calls[0][0]).toMatchObject({ method: 'put', url: '/v2/crashes/crashgroups/g1', params: { app_id: 'app' }, data: { app_id: 'app', action } });
    expect(get).not.toHaveBeenCalled();
    expect(json(res).id).toBe('g1');
  });

  it('uses legacy /i/crashes without /v2', async () => {
    const { context, request, get } = serverContext(() => ok({}), () => ({ result: 'Success' }), false);
    await new CrashAnalyticsTools(context).resolveCrash({ app_id: 'app', crash_id: 'g1' });
    expect(request).not.toHaveBeenCalled();
    expect(get.mock.calls[0][0]).toBe('/i/crashes/resolve');
  });
});

describe('apps and members on Platform', () => {
  const apps = [
    { _id: 'a1', name: 'Shop', role: 'admin', timezone: 'Europe/Riga', key: 'k', salt: '', created_at: 1_700_000_000 },
    { _id: 'a2', name: 'Web', role: 'user', timezone: 'UTC', key: 'k2' },
  ];

  it('lists apps with the caller role', async () => {
    const { context, request } = serverContext(() => ok(apps));
    const res = await new AppManagementTools(context).apps_list({});
    expect(request.mock.calls[0][0].url).toBe('/v2/apps');
    expect(text(res)).toContain('Web (ID: a2, role: user');
  });

  it('gets an app by name case-insensitively, with ISO times', async () => {
    const { context } = serverContext(() => ok(apps));
    const res = await new AppManagementTools(context).apps_get_by_name({ app_name: 'shop' });
    expect(json(res)).toMatchObject({ _id: 'a1', role: 'admin', created: new Date(1_700_000_000_000).toISOString() });
    expect(json(res).salt).toBeUndefined();
    await expect(new AppManagementTools(context).apps_get_by_name({ app_name: 'nope' })).rejects.toThrow(/not found/);
  });

  it('keeps legacy app listing without /v2', async () => {
    const { context, request } = serverContext(() => ok([]), () => ({}), false);
    const res = await new AppManagementTools(context).apps_list({});
    expect(request).not.toHaveBeenCalled();
    expect(text(res)).toContain('Legacy App');
  });

  it('compacts members and drops secrets', () => {
    const out = compactMember({
      _id: 'm1', full_name: 'Ann', username: 'ann', email: 'ann@example.invalid', password: 'hash', api_key: 'secret',
      global_admin: false, permission: { _: { a: ['a1'], u: [['a1', 'a2']] } }, created_at: 1_700_000_000, last_login: 0,
      settings: { big: true },
    });
    expect(out).toMatchObject({ id: 'm1', admin_of: ['a1'], user_of: ['a2'], global_admin: false });
    expect(JSON.stringify(out)).not.toContain('hash');
    expect(JSON.stringify(out)).not.toContain('secret');
    expect(out.last_login).toBeUndefined();
  });

  it('dashboard_users reads /v2/members', async () => {
    const { context, request } = serverContext(() => ok([{ _id: 'm1', username: 'ann', global_admin: true, api_key: 'secret' }]));
    const res = await new DashboardUsersTools(context).getAllDashboardUsers({});
    expect(request.mock.calls[0][0].url).toBe('/v2/members');
    expect(text(res)).not.toContain('secret');
  });
});

describe('events_list on Platform', () => {
  const legacyDoc = {
    list: ['Buy', 'View', '[CLY]_view'],
    segments: { Buy: ['plan', null], '[CLY]_view': ['custom_seg'] },
    map: { Buy: { name: 'Purchase', description: 'paid', category: 'c1' } },
  };

  it('pages the drill catalog and adds legacy segments and metadata', async () => {
    const { context, request } = serverContext(
      () => ok({ events: [{ key: 'Buy', name: 'Purchase', metricLabels: { sum: 'Revenue' } }], total: 3 }),
      () => legacyDoc
    );
    const res = await new EventsTools(context).getEventsAndSegments({ app_id: 'app', search: 'b', limit: 1 });
    expect(request.mock.calls[0][0]).toMatchObject({ url: '/v2/drill/events', params: { app_id: 'app', search: 'b', limit: 1, skip: 0 } });
    const out = json(res);
    expect(out.events[0]).toEqual({
      key: 'Buy', name: 'Purchase', description: 'paid', category: 'c1', metric_labels: { sum: 'Revenue' }, segments: ['plan'],
    });
    expect(out.next_skip).toBe(1);
    expect(out.internal_events).toEqual([]); // "b" matches no [CLY]_ key
  });

  it('lists internal events with their segments on the first page', async () => {
    const { context } = serverContext(() => ok({ events: [], total: 0 }), () => legacyDoc);
    const out = json(await new EventsTools(context).getEventsAndSegments({ app_id: 'app' }));
    const view = out.internal_events.find((e: any) => e.key === '[CLY]_view');
    expect(view.segments).toEqual(expect.arrayContaining(['start', 'custom_seg']));
  });

  it('falls back to the legacy list when drill is unavailable', async () => {
    const { context } = serverContext(() => fail(404), () => legacyDoc);
    const res = await new EventsTools(context).getEventsAndSegments({ app_id: 'app', search: 'V', include_internal: false });
    const out = json(res);
    expect(text(res)).toContain('drill unavailable');
    expect(out.events.map((e: any) => e.key)).toEqual(['View']);
    expect(out.internal_events).toBeUndefined();
  });

  it('reports other drill errors', async () => {
    const { context } = serverContext(() => fail(500), () => legacyDoc);
    const res: any = await new EventsTools(context).getEventsAndSegments({ app_id: 'app' });
    expect(res.isError).toBe(true);
  });
});

describe('user_profiles_breakdown on Platform', () => {
  it('accepts a plain key or a JSON array and adds shares', async () => {
    const { context, request } = serverContext(() => ok({
      breakDownData: [{ _id: 'US', sum: 30 }, { _id: '', sum: 10 }], filtered: 40, total: 100, projectionKey: 'cc', lastRefresh: '2026-01-01T00:00:00Z',
    }));
    const res = await new UserProfilesTools(context).user_profiles_breakdown({ app_id: 'app', projection_key: '["cc"]', query: '{"p":"iOS"}', limit: 2 });
    expect(request.mock.calls[0][0]).toMatchObject({ url: '/v2/users/breakdown', params: { app_id: 'app', projectionKey: 'cc', limit: 2, query: '{"p":"iOS"}' } });
    expect(json(res)).toMatchObject({
      property: 'cc', matching_users: 40, total_users: 100,
      values: [{ value: 'US', users: 30, pct: 75 }, { value: '(not set)', users: 10, pct: 25 }],
    });
  });

  it('omits an empty filter and defaults the limit', async () => {
    const { context, request } = serverContext(() => ok({ breakDownData: [], filtered: 0, total: 0 }));
    await new UserProfilesTools(context).user_profiles_breakdown({ app_id: 'app', projection_key: 'p', query: '{}' });
    expect(request.mock.calls[0][0].params).toEqual({ app_id: 'app', projectionKey: 'p', limit: 50 });
  });

  it('falls back to legacy user_details when the users route is unavailable', async () => {
    const { context, get } = serverContext(() => fail(404), () => ({ breakDownData: [] }));
    await new UserProfilesTools(context).user_profiles_breakdown({ app_id: 'app', projection_key: 'cc' });
    expect(get.mock.calls[0][1].params).toMatchObject({ method: 'user_details', projectionKey: '["cc"]' });
  });
});

describe('legacy notes_list count', () => {
  it('counts DataTables rows instead of envelope keys', async () => {
    const { handleListNotes } = await import('../src/tools/notes.js');
    const context: any = {
      httpClient: { get: async () => ({ data: { aaData: [], iTotalDisplayRecords: 0, iTotalRecords: 0, sEcho: 1 } }) },
      getAuthParams: () => ({}),
      resolveAppId: async () => 'app',
    };
    const res = await handleListNotes(context, { app_id: 'app', period: '30days' });
    expect(res.content[0].text).toContain('Found 0 note(s)');
  });
});
