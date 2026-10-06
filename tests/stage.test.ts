import { describe, it, expect, vi } from 'vitest';

import { getToolAnnotations } from '../src/lib/tool-annotations.js';
import { isToolPermitted, TOOL_GUARDS } from '../src/lib/tool-guards.js';
import { isToolSupported, V2_ONLY_TOOLS } from '../src/lib/tools-config.js';
import { parseMember } from '../src/lib/user-permissions.js';
import {
  applySceneFields,
  publicLinks,
  isSlug,
  slugify,
  stageToolDefinitions,
  StageTools,
  summariseScene,
} from '../src/tools/stage.js';

/** Context of a Platform server whose /v2 answers come from `v2` */
function platformContext(v2: (method: string, url: string, params: any, body: any) => { status: number; data: any }) {
  const request = vi.fn(async ({ method, url, params, data }: any) => v2(method, url, params, data));
  return {
    context: {
      httpClient: { request, defaults: { baseURL: 'https://countly.example/' } } as any,
      getAuthParams: () => ({}),
      resolveAppId: async (args: any) => args.app_id,
      getApps: async () => [],
      getServerCapabilities: async () => ({ v2: true }) as any,
    } as any,
    request,
  };
}
const ok = (data: unknown) => ({ status: 200, data: { data } });
const text = (res: any) => res.content[0].text as string;
const json = (res: any) => JSON.parse(text(res).slice(text(res).indexOf('\n') + 1));

const SCENE_ID = '0123456789abcdef01234567';
const STATUS = { host: { serving: true, publicHost: 'stage.count.ly', reason: null } };

describe('stage registration', () => {
  it('every tool is v2-only, needs the stage plugin and has a guard', () => {
    for (const tool of stageToolDefinitions) {
      expect(V2_ONLY_TOOLS.has(tool.name)).toBe(true);
      expect(TOOL_GUARDS[tool.name]).toBeDefined();
      expect(isToolSupported(tool.name, ['stage'], false)).toBe(false);
      expect(isToolSupported(tool.name, ['drill'], true)).toBe(false);
      expect(isToolSupported(tool.name, ['stage'], true)).toBe(true);
    }
  });

  it('publishing is annotated destructive, reads read-only', () => {
    expect(getToolAnnotations('stage_scenes_publish')).toMatchObject({ readOnlyHint: false, destructiveHint: true });
    expect(getToolAnnotations('stage_scenes_list')).toMatchObject({ readOnlyHint: true });
    expect(getToolAnnotations('stage_scenes_unpublish')).toMatchObject({ destructiveHint: true, idempotentHint: true });
  });
});

describe('stage permissions', () => {
  const member = (permission: any, extra: any = {}) => parseMember({ global_admin: false, permission, ...extra });

  it('reads the server-wide level from permission.stage, literal true only', () => {
    expect(member({ stage: { view: true } })!.stage).toBe('view');
    expect(member({ stage: { view: true, edit: true } })!.stage).toBe('edit');
    expect(member({ stage: { edit: 'true' } })!.stage).toBeNull();
    expect(member({ stage: 'edit' })!.stage).toBeNull();
    expect(member({})!.stage).toBeNull();
  });

  it('view reads, edit writes; app rights grant nothing', () => {
    const viewer = member({ stage: { view: true } });
    expect(isToolPermitted('stage_scenes_list', viewer)).toBe(true);
    expect(isToolPermitted('stage_scenes_publish', viewer)).toBe(false);

    const editor = member({ stage: { view: true, edit: true } });
    expect(isToolPermitted('stage_scenes_publish', editor)).toBe(true);

    const appAdmin = member({ _: { a: ['app1'], u: [] }, c: {}, r: {}, u: {}, d: {} });
    expect(isToolPermitted('stage_scenes_list', appAdmin)).toBe(false);
    expect(isToolPermitted('stage_reference', appAdmin)).toBe(false);

    const admin = parseMember({ global_admin: true, permission: {} });
    expect(isToolPermitted('stage_scenes_delete', admin)).toBe(true);
  });
});

describe('scene helpers', () => {
  it('applies paper, delivery and removals', () => {
    const scene = applySceneFields(
      { version: 1, layers: [], width: 1440, height: 900, delivery: { mode: 'autoplay', click: { arrows: false } }, lang: 'de', pinLang: true },
      { paper: 'a4', delivery_mode: 'click', lang: '', look: 'web' }
    );
    expect(scene).toMatchObject({ width: 794, height: 1123, look: 'web', delivery: { mode: 'click', click: { arrows: false } } });
    expect(scene.lang).toBeUndefined();
    expect(scene.pinLang).toBeUndefined();
    expect(() => applySceneFields({}, { company: 'Not A Slug' })).toThrow(/company/);
  });

  it('slug rule and slugify match the builder', () => {
    expect(slugify('Launch hero! Über')).toBe('launch-hero-uber');
    expect(isSlug('launch-hero')).toBe(true);
    expect(isSlug('index')).toBe(false);
    expect(isSlug('a--b')).toBe(false);
  });

  it('outlines a current scene and a first-format one', () => {
    const outline = summariseScene({
      version: 1, name: 'Deck', width: 816, height: 1056, look: 'web', theme: 'light',
      delivery: { mode: 'click' },
      layers: [{ id: 'l1', piece: 'text-block', x: 0, y: 0, w: 100, h: 50 }, { id: 'l2', piece: 'text-block', x: 1, y: 2, w: 3, h: 4, build: 1 }],
      steps: [{ id: 's1', name: 'Intro', layers: ['l1', 'l2'], hold: 4000, dark: true }],
    })!;
    expect(outline).toMatchObject({ paper: 'letter', delivery: 'click', transition: 'fade', pieces: { 'text-block': 2 } });
    expect(outline.steps).toEqual([{ id: 's1', name: 'Intro', layers: 2, hold: 4000, dark: true }]);

    const legacy = summariseScene({ version: 1, layers: [], slides: [{ id: 'a', name: 'A', layers: [] }], deck: {} })!;
    expect(legacy).toMatchObject({ look: 'product', delivery: 'click (legacy deck)' });
    expect(legacy.legacyFormat).toMatch(/slides/);
  });
});

describe('scene tools', () => {
  it('lists with search and state filters', async () => {
    const { context } = platformContext(() => ok({
      scenes: [
        { id: 'a', name: 'Hero', rev: 1, latest: 2, versions: [1, 2], slug: 'hero' },
        { id: 'b', name: 'Hero draft', rev: 3, latest: null },
        { id: 'c', name: 'Old', rev: 1, latest: 1, unpublished: true, slug: 'old' },
      ],
    }));
    const res = await new StageTools(context).stage_scenes_list({ search: 'hero', published: 'draft' });
    expect(json(res)).toEqual([{ id: 'b', name: 'Hero draft', rev: 3, state: 'draft' }]);
  });

  it('get returns an outline by default and links when published', async () => {
    const { context } = platformContext((_m, url) => url === '/v2/stage/status' ? ok(STATUS) : ok({
      id: SCENE_ID, name: 'Hero', rev: 4, slug: 'hero', latest: 2, versions: [1, 2],
      scene: { version: 1, name: 'Hero', width: 1440, height: 900, layers: [] },
      versionDetails: [{ version: 2, title: 'Hero', publishedAt: 'x', publishedBy: { id: '1', name: 'Ann' } }],
    }));
    const out = json(await new StageTools(context).stage_scenes_get({ scene_id: SCENE_ID }));
    expect(out.outline).toMatchObject({ name: 'Hero', look: 'product' });
    expect(out.scene).toBeUndefined();
    expect(out.public.pinned_url).toBe('https://stage.count.ly/v2/stage/host/scenes/hero@2.json');
    expect(out.public.embed_snippet).toContain('<countly-stage scene="hero">');
    expect(out.versionDetails[0].publishedBy).toBe('Ann');
  });

  it('refuses a malformed scene id before calling the server', async () => {
    const { context, request } = platformContext(() => ok({}));
    const res: any = await new StageTools(context).stage_scenes_get({ scene_id: 'hero' });
    expect(res.isError).toBe(true);
    expect(request).not.toHaveBeenCalled();
  });

  it('creates an empty scene with defaults', async () => {
    const { context, request } = platformContext(() => ok({ id: SCENE_ID, rev: 1 }));
    await new StageTools(context).stage_scenes_create({ name: 'One-pager', paper: 'a4', look: 'web' });
    expect(request.mock.calls[0][0]).toMatchObject({
      method: 'post',
      url: '/v2/stage/scenes',
      data: { scene: { version: 1, layers: [], name: 'One-pager', width: 794, height: 1123, look: 'web' } },
    });
  });

  it('partial update reads the stored scene and its rev, then saves', async () => {
    const { context, request } = platformContext((method) => method === 'get'
      ? ok({ id: SCENE_ID, rev: 7, scene: { version: 1, name: 'A', layers: [{ id: 'l' }], theme: 'light' } })
      : ok({ rev: 8 }));
    const res = await new StageTools(context).stage_scenes_update({ scene_id: SCENE_ID, theme: 'dark' });
    expect(request.mock.calls[1][0]).toMatchObject({
      method: 'put',
      url: `/v2/stage/scenes/${SCENE_ID}`,
      data: { rev: 7, scene: { name: 'A', theme: 'dark', layers: [{ id: 'l' }] } },
    });
    expect(json(res)).toEqual({ id: SCENE_ID, rev: 8 });
  });

  it('update refuses a whole scene without the revision it was read at', async () => {
    const { context, request } = platformContext(() => ok({ id: SCENE_ID, rev: 9, scene: {} }));
    const res: any = await new StageTools(context).stage_scenes_update({ scene_id: SCENE_ID, scene: { version: 1, layers: [] } });
    expect(res.isError).toBe(true);
    expect(text(res)).toContain('pass rev with scene');
    expect(request).not.toHaveBeenCalled();
  });

  it('update with scene and rev sends them as given, and surfaces a conflict', async () => {
    const { context, request } = platformContext(() => ({ status: 409, data: { error: { code: 'CONFLICT', message: 'Someone saved this scene since you opened it (now rev 9); reload it' } } }));
    const res: any = await new StageTools(context).stage_scenes_update({ scene_id: SCENE_ID, rev: 5, scene: { version: 1, layers: [] } });
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0][0].data).toEqual({ rev: 5, scene: { version: 1, layers: [] } });
    expect(res.isError).toBe(true);
    expect(text(res)).toContain('now rev 9');
  });

  it('first publish sends a slug from the name and returns the links', async () => {
    const { context, request } = platformContext((method, url) => {
      if (url === '/v2/stage/status') {
        return ok(STATUS);
      }
      return method === 'get'
        ? ok({ id: SCENE_ID, name: 'Launch Hero', rev: 3, slug: null, scene: { name: 'Launch Hero' } })
        : ok({ slug: 'launch-hero', version: 1 });
    });
    const res = await new StageTools(context).stage_scenes_publish({ scene_id: SCENE_ID });
    expect(request.mock.calls[1][0]).toMatchObject({ method: 'post', url: `/v2/stage/scenes/${SCENE_ID}/versions`, data: { rev: 3, slug: 'launch-hero' } });
    expect(json(res).public.latest_url).toBe('https://stage.count.ly/v2/stage/host/scenes/launch-hero.json');
  });

  it('a later publish sends no slug and notes an unpublished scene', async () => {
    const { context, request } = platformContext((method, url) => {
      if (url === '/v2/stage/status') {
        return ok({ host: { serving: false, publicHost: null, reason: 'no host build' } });
      }
      return method === 'get'
        ? ok({ id: SCENE_ID, name: 'X', rev: 2, slug: 'x', latest: 1, unpublished: true })
        : ok({ slug: 'x', version: 2 });
    });
    const res = await new StageTools(context).stage_scenes_publish({ scene_id: SCENE_ID, slug: 'ignored' });
    expect(request.mock.calls[1][0].data).toEqual({ rev: 2 });
    expect(text(res)).toContain('stage_scenes_restore');
    expect(json(res).host).toContain('no host build');
  });

  it('rollback, unpublish and restore patch the publish state', async () => {
    const { context, request } = platformContext(() => ok({ slug: 'x', latest: 1, unpublished: false }));
    const tools = new StageTools(context);
    await tools.stage_scenes_set_latest({ scene_id: SCENE_ID, version: 1 });
    await tools.stage_scenes_unpublish({ scene_id: SCENE_ID });
    await tools.stage_scenes_restore({ scene_id: SCENE_ID });
    expect(request.mock.calls.map((c) => [c[0].method, c[0].data])).toEqual([
      ['patch', { latest: 1 }],
      ['patch', { unpublished: true }],
      ['patch', { unpublished: false }],
    ]);
  });
});

describe('piece tools', () => {
  const CATALOG = {
    categories: [{ id: 'charts', label: 'Charts' }, { id: 'text', label: 'Text' }],
    pieces: [
      { id: 'trend-chart', label: 'Trend', category: 'charts', description: 'A line chart over days.', defaultSize: { w: 640, h: 360 }, data: true },
      { id: 'caption', label: 'Caption', category: 'text', description: 'A headline block.', defaultSize: { w: 720, h: 180 } },
    ],
  };
  const notFound = { status: 404, data: { error: { code: 'NOT_FOUND', message: 'Not found' } } };

  it('lists the server catalog, filtered', async () => {
    const { context } = platformContext(() => ok(CATALOG));
    const out = json(await new StageTools(context).stage_pieces_list({ category: 'charts' }));
    expect(out.categories).toHaveLength(2);
    expect(out.pieces).toEqual([{ id: 'trend-chart', label: 'Trend', category: 'charts', description: 'A line chart over days.', size: '640x360', data: true }]);
    const found = json(await new StageTools(context).stage_pieces_list({ search: 'HEADLINE' }));
    expect(found.pieces.map((p: any) => p.id)).toEqual(['caption']);
  });

  it('falls back to the built-in ids on a server without the route', async () => {
    const { context } = platformContext(() => notFound);
    const res: any = await new StageTools(context).stage_pieces_list({});
    expect(res.isError).toBeUndefined();
    expect(text(res)).toContain('predates');
    expect(json(res)).toContain('trend-chart');
  });

  it('gets one piece, or several', async () => {
    const { context, request } = platformContext((_m, url) => ok({ id: url.split('/').pop(), fields: [] }));
    const one = json(await new StageTools(context).stage_pieces_get({ piece: 'trend-chart' }));
    expect(one).toEqual({ id: 'trend-chart', fields: [] });
    const many = json(await new StageTools(context).stage_pieces_get({ piece: 'caption, badge' }));
    expect(many.map((p: any) => p.id)).toEqual(['caption', 'badge']);
    expect(request.mock.calls[0][0].url).toBe('/v2/stage/pieces/trend-chart');
  });

  it('marks an unknown piece, and explains an old server', async () => {
    const live = platformContext((_m, url) => (url === '/v2/stage/pieces' ? ok(CATALOG) : notFound));
    const out = json(await new StageTools(live.context).stage_pieces_get({ piece: 'nope' }));
    expect(out.error).toContain('no such piece');

    const old = platformContext(() => notFound);
    const res: any = await new StageTools(old.context).stage_pieces_get({ piece: 'trend-chart' });
    expect(res.isError).toBe(true);
    expect(text(res)).toContain('predates');
  });

  it('refuses malformed ids before calling the server', async () => {
    const { context, request } = platformContext(() => ok({}));
    const res: any = await new StageTools(context).stage_pieces_get({ piece: '../scenes' });
    expect(res.isError).toBe(true);
    expect(request).not.toHaveBeenCalled();
  });

  it('the reference lists the server pieces when it has them', async () => {
    const live = platformContext(() => ok(CATALOG));
    const out = json(await new StageTools(live.context).stage_reference({}));
    expect(out.pieces).toEqual(['trend-chart', 'caption']);
    const old = platformContext(() => notFound);
    const fallback = json(await new StageTools(old.context).stage_reference({}));
    expect(fallback.pieces.length).toBeGreaterThan(50);
    expect(fallback.piecesSource).toContain('built-in');
  });
});

describe('templates, scenarios, validate and edit', () => {
  const notFound = { status: 404, data: { error: { code: 'NOT_FOUND', message: 'Not found' } } };
  const SCENE = {
    version: 1, name: 'Deck', width: 1920, height: 1080, look: 'web', layers: [{ id: 't', piece: 'caption', x: 0, y: 0, w: 10, h: 10, props: {} }],
    steps: [{ id: 's1', name: 'One', layers: ['t'], hold: 4000 }], delivery: { mode: 'click' },
  };

  it('lists templates with format facts, filtered', async () => {
    const { context } = platformContext(() => ok({ templates: [
      { id: 'starter/deck', kind: 'starter', label: 'Deck', description: 'A deck.', look: 'web', theme: 'light', width: 1920, height: 1080, delivery: 'click', steps: 8 },
      { id: 'example/responsive-hero', kind: 'pattern', label: 'Hero', description: 'A hero.', look: 'web', theme: 'dark', width: 1920, height: 760, delivery: 'autoplay', steps: 1, responsive: true, breakpoints: 2, scenarios: ['funnel-create'] },
    ] }));
    const out = json(await new StageTools(context).stage_templates_list({ kind: 'pattern' }));
    expect(out).toEqual([{ id: 'example/responsive-hero', kind: 'pattern', label: 'Hero', description: 'A hero.', format: 'web/dark, 1920x760', delivery: 'autoplay', steps: 1, responsive: 'yes, 2 breakpoint(s)', scenarios: ['funnel-create'] }]);
  });

  it('creates a scene from a template, with a preview link', async () => {
    const { context, request } = platformContext((method, url) => url.startsWith('/v2/stage/templates/')
      ? ok({ id: 'starter/deck', scene: SCENE })
      : ok({ id: SCENE_ID, rev: 1 }));
    const out = json(await new StageTools(context).stage_scenes_create({ template: 'starter/deck', name: 'Acme QBR' }));
    expect(request.mock.calls[0][0].url).toBe('/v2/stage/templates/starter/deck');
    expect(request.mock.calls[1][0].data.scene).toMatchObject({ name: 'Acme QBR', delivery: { mode: 'click' }, steps: [{ id: 's1' }] });
    expect(out).toMatchObject({ id: SCENE_ID, template: 'starter/deck', preview_url: `https://countly.example/stage/${SCENE_ID}` });
    expect(out.outline.steps).toHaveLength(1);
  });

  it('refuses a malformed template id before calling the server', async () => {
    const { context, request } = platformContext(() => ok({}));
    const res: any = await new StageTools(context).stage_scenes_create({ template: '../scenes' });
    expect(res.isError).toBe(true);
    expect(request).not.toHaveBeenCalled();
  });

  it('lists scenarios with their chapters, and gets one without steps unless asked', async () => {
    const doc = { id: 'drill-query', label: 'Drill', kind: 'overview', description: 'Build a query.', start: { page: '/drill' }, project: 'automotive', chapters: [{ id: 'run', label: 'Run', steps: [{ hold: 1 }] }] };
    const { context } = platformContext((_m, url) => (url === '/v2/stage/scenarios' ? ok({ scenarios: [{ ...doc, chapters: [{ id: 'run', label: 'Run' }] }] }) : ok(doc)));
    const list = json(await new StageTools(context).stage_scenarios_list({ search: '/drill' }));
    expect(list).toEqual([{ id: 'drill-query', label: 'Drill', kind: 'overview', description: 'Build a query.', starts: '/drill', project: 'automotive', chapters: ['run: Run'] }]);
    const one = json(await new StageTools(context).stage_scenarios_get({ scenario: 'drill-query' }));
    expect(one.chapters[0]).toEqual({ id: 'run', label: 'Run', stepCount: 1 });
    const full = json(await new StageTools(context).stage_scenarios_get({ scenario: 'drill-query', include_steps: true }));
    expect(full.chapters[0].steps).toEqual([{ hold: 1 }]);
  });

  it('validates a scene, and says when the server cannot', async () => {
    const { context, request } = platformContext(() => ok({ valid: true, publishable: false, publishError: 'Scene has no layers', changes: [], props: [] }));
    const res = await new StageTools(context).stage_scenes_validate({ scene: { version: 1, layers: [] } });
    expect(request.mock.calls[0][0]).toMatchObject({ method: 'post', url: '/v2/stage/validate' });
    expect(text(res)).toContain('publishing would fail: Scene has no layers');
    const old = platformContext(() => notFound);
    const res2: any = await new StageTools(old.context).stage_scenes_validate({ scene: { version: 1, layers: [] } });
    expect(res2.isError).toBe(true);
    expect(text(res2)).toContain('predates');
  });

  it('edit applies operations, fetches new pieces, checks, then saves', async () => {
    const { context, request } = platformContext((method, url) => {
      if (method === 'get' && url === `/v2/stage/scenes/${SCENE_ID}`) {
        return ok({ id: SCENE_ID, rev: 3, scene: SCENE });
      }
      if (url === '/v2/stage/pieces/badge') {
        return ok({ id: 'badge', defaultSize: { w: 120, h: 120 }, startProps: { label: 'New' } });
      }
      if (url === '/v2/stage/validate') {
        return ok({ valid: true, publishable: true, changes: [], props: [{ layer: 'b', piece: 'badge', key: 'zzz', issue: 'not a prop of this piece: ignored' }] });
      }
      return ok({ rev: 4 });
    });
    const out = json(await new StageTools(context).stage_scenes_edit({
      scene_id: SCENE_ID,
      ops: [{ op: 'set_layer', id: 'b', piece: 'badge', steps: ['s1'], props: { zzz: 1 } }, { op: 'set_step', id: 's1', name: 'Renamed' }],
    }));
    const put = request.mock.calls.find((c) => c[0].method === 'put')![0];
    expect(put.data.rev).toBe(3);
    expect(put.data.scene.layers[1]).toMatchObject({ id: 'b', w: 120, props: { label: 'New', zzz: 1 } });
    expect(put.data.scene.steps[0]).toMatchObject({ name: 'Renamed', layers: ['t', 'b'] });
    expect(out).toMatchObject({ rev: 4, preview_url: `https://countly.example/stage/${SCENE_ID}`, notes: { publishable: true } });
    expect(out.notes.ignored_props[0].key).toBe('zzz');
  });

  it('edit does not save what the server would refuse, nor a dry run', async () => {
    const refused = platformContext((method, url) => {
      if (method === 'get') {
        return ok({ id: SCENE_ID, rev: 3, scene: SCENE });
      }
      return url === '/v2/stage/validate' ? ok({ valid: false, error: 'Layers were dropped (unknown or invalid): nope', props: [] }) : ok({ rev: 4 });
    });
    const res: any = await new StageTools(refused.context).stage_scenes_edit({ scene_id: SCENE_ID, ops: [{ op: 'set_layer', id: 'x', piece: 'nope' }] });
    expect(res.isError).toBe(true);
    expect(text(res)).toContain('Not saved');
    expect(refused.request.mock.calls.some((c) => c[0].method === 'put')).toBe(false);

    const dry = platformContext((method, url) => (method === 'get' ? ok({ id: SCENE_ID, rev: 3, scene: SCENE }) : url === '/v2/stage/validate' ? ok({ valid: true, publishable: true, changes: [], props: [] }) : ok({ rev: 4 })));
    const out = await new StageTools(dry.context).stage_scenes_edit({ scene_id: SCENE_ID, ops: [{ op: 'set_scene', theme: 'dark' }], dry_run: true });
    expect(text(out)).toContain('Dry run');
    expect(dry.request.mock.calls.some((c) => c[0].method === 'put')).toBe(false);
  });

  it('edit still saves on a server without the dry run', async () => {
    const { context, request } = platformContext((method, url) => (method === 'get' ? ok({ id: SCENE_ID, rev: 3, scene: SCENE }) : url === '/v2/stage/validate' ? notFound : ok({ rev: 4 })));
    const out = json(await new StageTools(context).stage_scenes_edit({ scene_id: SCENE_ID, ops: [{ op: 'set_scene', theme: 'dark' }] }));
    expect(out.rev).toBe(4);
    expect(out.notes).toBeUndefined();
    expect(request.mock.calls.some((c) => c[0].method === 'put')).toBe(true);
  });

  it('an unpublished scene gets pinned links only', () => {
    const links = publicLinks({ serving: true, publicHost: 'stage.count.ly' }, 'deck', 3, { scene: SCENE, unpublished: true })!;
    expect(links.latest_url).toBeUndefined();
    expect(links.pinned_url).toBe('https://stage.count.ly/v2/stage/host/scenes/deck@3.json');
    expect(links.embed_snippet).toContain('scene="deck@3"');
    expect(links.embed_by_delivery.player).toContain('scene="deck@3" delivery="player"');
  });

  it('get gives delivery hints only when the draft is the latest version', async () => {
    const row = { id: SCENE_ID, name: 'Deck', rev: 4, slug: 'deck', latest: 2, versions: [1, 2], scene: SCENE };
    const edited = platformContext((_m, url) => url === '/v2/stage/status' ? ok({ host: { serving: true, publicHost: 'stage.count.ly' } }) : ok({
      ...row, updatedAt: '2026-10-06T12:00:00.000Z', versionDetails: [{ version: 2, publishedAt: '2026-10-06T10:00:00.000Z' }],
    }));
    const out = json(await new StageTools(edited.context).stage_scenes_get({ scene_id: SCENE_ID }));
    expect(out.public.embed_by_delivery).toBeUndefined();
    expect(out.public.latest_url).toBeDefined();
    expect(out.draft_note).toContain('version 2');

    const same = platformContext((_m, url) => url === '/v2/stage/status' ? ok({ host: { serving: true, publicHost: 'stage.count.ly' } }) : ok({
      ...row, updatedAt: '2026-10-06T09:00:00.000Z', versionDetails: [{ version: 2, publishedAt: '2026-10-06T10:00:00.000Z' }],
    }));
    const out2 = json(await new StageTools(same.context).stage_scenes_get({ scene_id: SCENE_ID }));
    expect(out2.public.embed_by_delivery.presentation).toBeDefined();
    expect(out2.draft_note).toBeUndefined();
  });

  it('a published scene gets an embed per delivery its sequence offers', () => {
    const links = publicLinks({ serving: true, publicHost: 'stage.count.ly' }, 'deck', 2, { scene: SCENE })!;
    expect(links.embed_by_delivery.presentation).toContain('<countly-stage scene="deck"></countly-stage>');
    expect(links.embed_by_delivery.player).toContain('delivery="player"');
    expect(links.embed_by_delivery.single_page).toContain('delivery="autoplay"');
    const { steps: _s, ...still } = SCENE;
    const section = publicLinks({ serving: true, publicHost: 'stage.count.ly' }, 'hero', 1, { scene: { ...still, delivery: undefined, fit: { minHeight: 400, maxHeight: 700, minText: 13 } } })!;
    expect(Object.keys(section.embed_by_delivery)).toEqual(['single_page']);
    expect(section.embed_note).toContain('Responsive');
  });
});

describe('company tools', () => {
  it('creates with an id from the name and defaults', async () => {
    const { context, request } = platformContext(() => ok({ id: 'acme-logistics' }));
    await new StageTools(context).stage_companies_create({ name: 'Acme Logistics', base: 'ecommerce', primary: '#112233' });
    expect(request.mock.calls[0][0].data).toEqual({
      company: { id: 'acme-logistics', name: 'Acme Logistics', base: 'ecommerce', primary: '#112233', renames: {}, volumeScale: 1 },
    });
  });

  it('update merges onto the stored company and removes emptied fields', async () => {
    const stored = { id: 'acme', name: 'Acme', base: 'gaming', renames: {}, volumeScale: 1, logo: 'data:image/png;base64,AAAA', public: true };
    const { context, request } = platformContext((method) => method === 'get' ? ok({ id: 'acme', company: stored }) : ok({ id: 'acme' }));
    await new StageTools(context).stage_companies_update({ company_id: 'acme', logo: '', public: false, volume_scale: 2 });
    expect(request.mock.calls[1][0]).toMatchObject({ method: 'put', url: '/v2/stage/companies/acme' });
    expect(request.mock.calls[1][0].data).toEqual({ company: { id: 'acme', name: 'Acme', base: 'gaming', renames: {}, volumeScale: 2 } });
  });

  it('get shortens the logo unless asked', async () => {
    const logo = `data:image/png;base64,${'A'.repeat(4000)}`;
    const { context } = platformContext(() => ok({ id: 'acme', public: true, referenced: true, company: { id: 'acme', logo } }));
    const short = json(await new StageTools(context).stage_companies_get({ company_id: 'acme' }));
    expect(short.company.logo.length).toBeLessThan(100);
    const full = json(await new StageTools(context).stage_companies_get({ company_id: 'acme', include_logo: true }));
    expect(full.company.logo).toBe(logo);
  });
});
