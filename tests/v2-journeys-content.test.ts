import { describe, it, expect, vi } from 'vitest';

import { JourneysTools } from '../src/tools/journeys.js';
import { ContentTools } from '../src/tools/content.js';
import { messageBody } from '../src/tools/v2/content.js';
import { pickVersion } from '../src/tools/v2/journeys.js';

type Handler = (method: string, url: string, params: any, body: any) => { status: number; data: any };

/** Context of a Platform server (v2 = true) or a classic one; v2 requests go to `v2`, legacy calls to get/post */
function makeContext(v2: Handler, { platform = true, legacyGet = {} as any } = {}) {
  const request = vi.fn(async ({ method, url, params, data }: any) => v2(method, url, params, data));
  const get = vi.fn(async () => ({ data: legacyGet }));
  const post = vi.fn(async () => ({ data: { result: 'legacy-ok' } }));
  return {
    context: {
      httpClient: { request, get, post, defaults: { baseURL: 'https://c.example/' } } as any,
      getAuthParams: () => ({ auth_token: 't' }),
      resolveAppId: async (args: any) => args.app_id,
      getServerCapabilities: async () => ({ v2: platform }) as any,
    } as any,
    request,
    get,
    post,
  };
}
const ok = (data: unknown) => ({ status: 200, data: { data } });
const notFound = { status: 404, data: { error: { code: 'NOT_FOUND', message: 'Not found' } } };
const text = (res: any) => res.content[0].text as string;

const detail = {
  _id: 'j1', name: 'J', status: 'active', activeVersionId: 'v1', created: 0, updated: 1_700_000_000_000,
  version: { _id: 'v2', status: 'draft', blocks: [], created: 0 },
  versions: [{ _id: 'v1', version: 1, status: 'active' }, { _id: 'v2', version: 2, status: 'draft' }],
};

describe('journeys on Platform', () => {
  it('maps list paging and filters, and compacts rows', async () => {
    const { context, request } = makeContext(() => ok({
      items: [{ _id: 'j1', name: 'J', status: 'active', created: 1_700_000_000_000, updated: 0, channels: [], metrics: { usersEntered: 3 } }],
      page: 2, pageSize: 5, total: 6, counts: { total: 6 },
    }));
    const res = await new JourneysTools(context).journeys_list({ app_id: 'app', status: 'active,paused', page: 2, page_size: 5 });
    expect(request.mock.calls[0][0]).toMatchObject({ method: 'get', url: '/v2/journey_engine/journeys' });
    expect(request.mock.calls[0][0].params).toMatchObject({ app_id: 'app', status: 'active,paused', page: 2, pageSize: 5 });
    expect(text(res)).toContain('6 total');
    expect(text(res)).toContain('"created": "2023-11-14T22:13:20.000Z"');
    expect(text(res)).not.toContain('"channels"');
  });

  it('creates with a nested version and goal', async () => {
    const { context, request } = makeContext(() => ok({ _id: 'j1', name: 'n', status: 'draft', version: { _id: 'v1' }, versions: [] }));
    await new JourneysTools(context).journeys_create({ app_id: 'app', name: 'n', blocks: '[{"id":"b1"}]', goal_event_key: 'Buy' });
    expect(request.mock.calls[0][0].data).toEqual({ app_id: 'app', name: 'n', goal: { eventKey: 'Buy', window: 'none' }, version: { blocks: [{ id: 'b1' }] } });
  });

  it('rejects invalid blocks JSON', async () => {
    const { context, request } = makeContext(() => ok({}));
    const res = await new JourneysTools(context).journeys_create({ app_id: 'app', name: 'n', blocks: '{"id":1}' });
    expect(res.isError).toBe(true);
    expect(request).not.toHaveBeenCalled();
  });

  it('updates blocks of the editing version and clears the goal', async () => {
    const { context, request } = makeContext((method) => ok(method === 'get' ? detail : { ...detail, version: { ...detail.version, blocks: [{}] } }));
    await new JourneysTools(context).journeys_update({ app_id: 'app', journey_id: 'j1', blocks: '[]', goal_event_key: '' });
    const patch = request.mock.calls[1][0];
    expect(patch).toMatchObject({ method: 'patch', url: '/v2/journey_engine/journeys/j1' });
    expect(patch.data).toEqual({ goal: null, version: { _id: 'v2', blocks: [] } });
  });

  it('picks the version for lifecycle actions', async () => {
    const { context, request } = makeContext((method) => ok(method === 'get' ? detail : { outcome: 'ok', status: 'active' }));
    const tools = new JourneysTools(context);
    await tools.journeys_publish({ app_id: 'app', journey_id: 'j1' });
    expect(request.mock.calls[1][0]).toMatchObject({ url: '/v2/journey_engine/journeys/j1/publish', data: { versionId: 'v2' } });
    await tools.journeys_pause({ app_id: 'app', journey_id: 'j1' });
    expect(request.mock.calls[3][0]).toMatchObject({ url: '/v2/journey_engine/journeys/j1/pause', data: { versionId: 'v1' } });
    const res = await tools.journeys_resume({ app_id: 'app', journey_id: 'j1' });
    expect(res.isError).toBe(true);
    expect(text(res)).toContain('version_id: v1');
  });

  it('explains that Platform cannot unpublish to draft', async () => {
    const { context, request } = makeContext(() => ok({}));
    const res = await new JourneysTools(context).journeys_publish({ app_id: 'app', journey_id: 'j1', version_id: 'v1', status: 'draft' });
    expect(res.isError).toBe(true);
    expect(request).not.toHaveBeenCalled();
  });

  it('pickVersion prefers an explicit id, then a sole version', () => {
    expect(pickVersion(detail, 'x', ['draft'])).toEqual({ id: 'x' });
    expect(pickVersion({ versions: [{ _id: 'only', status: 'active' }] }, undefined, ['paused'])).toEqual({ id: 'only' });
  });

  it('pages instances with skip/limit and converts times', async () => {
    const { context, request } = makeContext(() => ok({
      rows: [{ appUserId: 'u1', status: 'running', startTime: 0, userDetails: { lac: 1_700_000_000 } }], total: 30, page: 3, pageSize: 10,
    }));
    const res = await new JourneysTools(context).journeys_stats_table({ app_id: 'app', journey_id: 'j1', skip: 20, limit: 10, status: 'running' });
    expect(request.mock.calls[0][0].url).toBe('/v2/journey_engine/journeys/j1/instances');
    expect(request.mock.calls[0][0].params).toMatchObject({ page: 3, pageSize: 10, status: 'running', period: '30days' });
    expect(text(res)).toContain('"lastSeen": "2023-11-14T22:13:20.000Z"');
  });

  it('truncates uids and sorts the performance series', async () => {
    const { context } = makeContext((_m, url) => ok(url.endsWith('uids')
      ? { uids: ['a', 'b', 'c'], total: 3 }
      : { '2026.01.02': { usersEntered: 2 }, '2026.01.01': { usersEntered: 1 } }));
    const tools = new JourneysTools(context);
    const uids = text(await tools.journeys_stats_uids({ app_id: 'app', journey_id: 'j1', uid_type: 'users_entered', limit: 2 }));
    expect(uids).toContain('first 2 shown');
    expect(uids).not.toContain('"c"');
    const perf = text(await tools.journeys_stats_performance({ app_id: 'app', journey_id: 'j1' }));
    expect(perf.indexOf('2026-01-01')).toBeLessThan(perf.indexOf('2026-01-02'));
  });

  it('stays on the legacy API when the server has no /v2', async () => {
    const { context, request, get } = makeContext(() => ok({}), { platform: false, legacyGet: [] });
    await new JourneysTools(context).journeys_list({ app_id: 'app' });
    expect(request).not.toHaveBeenCalled();
    expect(get).toHaveBeenCalledWith('/o/journey-engine/list', expect.anything());
  });
});

describe('content on Platform', () => {
  it('maps list filters and flags legacy rows', async () => {
    const { context, request } = makeContext(() => ok({
      items: [{ _id: 'm1', name: 'Old', messageFormat: 'popup', platform: null, status: 'ready', legacy: true, usedIn: [] }],
      page: 1, pageSize: 20, total: 1, counts: {},
    }));
    const res = await new ContentTools(context).content_blocks_list({ app_id: 'app', message_format: 'popup,banner', search: 'x' });
    expect(request.mock.calls[0][0].params).toMatchObject({ app_id: 'app', messageFormat: 'popup,banner', search: 'x', page: 1, pageSize: 20 });
    expect(text(res)).toContain('"legacy": true');
    expect(text(res)).not.toContain('"platform"');
  });

  it('falls back to the legacy block when no message has the id', async () => {
    const { context, get } = makeContext(() => notFound, { legacyGet: { _id: 'old', type: 'Banner' } });
    const res = await new ContentTools(context).content_blocks_get({ app_id: 'app', content_id: 'old' });
    expect(get).toHaveBeenCalledWith('/o/content/by-id', { params: { app_id: 'app', _id: 'old' } });
    expect(text(res)).toContain('Legacy content block old');
  });

  it('maps create args to a message body', () => {
    expect(messageBody({ name: 'n', message_format: 'popup', platform: 'web', slides: '[]', styling: '{"cardRadius":4}' }))
      .toEqual({ name: 'n', messageFormat: 'popup', platform: 'web', slides: [], styling: { cardRadius: 4 } });
    expect(() => messageBody({ slides: '{}' })).toThrow('must be an array');
  });

  it('refuses to edit a legacy block', async () => {
    const { context } = makeContext(() => notFound, { legacyGet: { _id: 'old' } });
    const res = await new ContentTools(context).content_blocks_update({ app_id: 'app', content_id: 'old', name: 'x' });
    expect(res.isError).toBe(true);
    expect(text(res)).toContain('legacy content block');
  });

  it('builds the v2 render URL and skips push messages', async () => {
    const { context } = makeContext(() => ok({ _id: 'm1', name: 'N', messageFormat: 'popup', platform: 'web' }));
    expect(text(await new ContentTools(context).content_blocks_preview({ app_id: 'app', content_id: 'm1' })))
      .toContain('https://c.example/v2/content/messages/app/m1/render');
    const push = makeContext(() => ok({ _id: 'm1', name: 'N', messageFormat: 'push' }));
    expect((await new ContentTools(push.context).content_blocks_preview({ app_id: 'app', content_id: 'm1' })).isError).toBe(true);
  });

  it('refuses to delete content in use, and deletes legacy blocks via the classic API', async () => {
    const used = makeContext(() => ok({ inUse: true, usedIn: [{ type: 'campaign', id: 'c1', name: 'Promo' }], legacyJourney: false }));
    const res = await new ContentTools(used.context).content_blocks_delete({ app_id: 'app', content_id: 'm1' });
    expect(res.isError).toBe(true);
    expect(text(res)).toContain('campaign Promo');
    expect(used.request).toHaveBeenCalledTimes(1);

    const legacy = makeContext((method) => (method === 'get' ? ok({ inUse: false, usedIn: [], legacyJourney: false }) : notFound));
    await new ContentTools(legacy.context).content_blocks_delete({ app_id: 'app', content_id: 'old' });
    expect(legacy.post).toHaveBeenCalledWith('/i/content/delete', null, { params: { app_id: 'app', _id: 'old' } });
  });

  it('uploads assets as multipart with the app connected', async () => {
    const { context, request } = makeContext(() => ok({ _id: 'a1', name: 'x.png', src: '/v2/content/assets/a1/serve' }));
    const res = await new ContentTools(context).content_assets_upload({
      app_id: 'app', file_name: 'x.png', file_base64: Buffer.from('png').toString('base64'), mime_type: 'image/png', tags: ['t'],
    });
    const form = request.mock.calls[0][0].data as FormData;
    expect(form.get('appIds')).toBe('["app"]');
    expect(form.get('tags')).toBe('["t"]');
    expect((form.get('asset') as File).name).toBe('x.png');
    expect(text(res)).toContain('https://c.example/v2/content/assets/a1/serve');
  });

  it('reports assets in use on delete', async () => {
    const { context } = makeContext(() => ({ status: 409, data: { error: 'asset_in_use', usedIn: [] } }));
    const res = await new ContentTools(context).content_assets_delete({ app_id: 'app', asset_id: 'a1' });
    expect(res.isError).toBe(true);
    expect(text(res)).toContain('still used');
  });

  it('stays on the legacy API when the server has no /v2', async () => {
    const { context, request, get } = makeContext(() => ok({}), { platform: false, legacyGet: [] });
    await new ContentTools(context).content_assets_list({ app_id: 'app' });
    expect(request).not.toHaveBeenCalled();
    expect(get).toHaveBeenCalledWith('/o/content/assets', expect.anything());
  });
});
