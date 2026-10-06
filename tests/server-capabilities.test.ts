import { describe, it, expect, vi } from 'vitest';

import {
  classifyFlavor,
  detectServerCapabilities,
  isPlatformV2Response,
  ServerCapabilitiesCache,
  type ServerCapabilities,
} from '../src/lib/server-capabilities.js';
import { filterToolsByServer, isToolSupported, loadToolsConfig } from '../src/lib/tools-config.js';

type Reply = { status: number; data: any; headers?: Record<string, string> };

const json = (status: number, data: any): Reply => ({ status, data, headers: { 'content-type': 'application/json' } });
const html404 = (path: string): Reply => ({
  status: 404,
  data: `<!DOCTYPE html><html><body><pre>Cannot GET ${path}</pre></body></html>`,
  headers: { 'content-type': 'text/html; charset=utf-8' },
});

/**
 * Fake axios instance answering like a real Countly server. Responses are
 * keyed by path, or by `path?method=x` for /o method dispatch.
 */
function fakeClient(routes: Record<string, Reply>) {
  return {
    get: vi.fn(async (url: string, config: any = {}) => {
      const method = config.params?.method;
      const reply = routes[method ? `${url}?method=${method}` : url] ?? json(400, { result: 'Invalid path' });
      const validate = config.validateStatus ?? ((s: number) => s >= 200 && s < 300);
      if (!validate(reply.status)) {
        throw Object.assign(new Error(`HTTP ${reply.status}`), { response: reply });
      }
      return { ...reply, headers: reply.headers ?? {} };
    }),
  } as any;
}

// Responses captured from real servers (Oct 2026)
const LITE_PLUGINS = ['mobile', 'web', 'views', 'crashes', 'alerts', 'sdk', 'dbviewer', 'errorlogs', 'hooks'];
const EE_PLUGINS = [...LITE_PLUGINS, 'drill', 'cohorts', 'funnels', 'users', 'block'];
const PLATFORM_PLUGINS = [...EE_PLUGINS, 'journey_engine', 'content', 'kafka', 'clickhouse'].filter((p) => p !== 'errorlogs');

const legacyBase = (version: string): Record<string, Reply> => ({
  '/v2/countly_version': html404('/v2/countly_version'),
  '/o/system/version': json(200, { version }),
  '/o/apps/mine': json(200, { admin_of: {}, user_of: { app1: { _id: 'app1' } } }),
});

describe('server capability detection', () => {
  it('detects Lite from the admin plugin list', async () => {
    const client = fakeClient({ ...legacyBase('25.03'), '/o/system/plugins': json(200, LITE_PLUGINS) });
    const caps = await detectServerCapabilities(client, 'token');
    expect(caps).toMatchObject({ architecture: 'legacy', flavor: 'lite', version: '25.03', plugins: LITE_PLUGINS });
  });

  it('detects Enterprise from the admin plugin list', async () => {
    const client = fakeClient({ ...legacyBase('25.03'), '/o/system/plugins': json(200, EE_PLUGINS) });
    const caps = await detectServerCapabilities(client, 'token');
    expect(caps).toMatchObject({ architecture: 'legacy', flavor: 'enterprise', plugins: EE_PLUGINS });
  });

  it('falls back to a drill probe when a non-admin cannot list plugins (Lite)', async () => {
    const client = fakeClient({
      ...legacyBase('25.03'),
      '/o/system/plugins': json(401, { result: 'User does not have right' }),
      '/o?method=drill_bookmarks': json(400, { result: 'Invalid method' }),
    });
    const caps = await detectServerCapabilities(client, 'token');
    expect(caps).toMatchObject({ architecture: 'legacy', flavor: 'lite', plugins: null });
    expect(caps.unavailablePlugins).toContain('drill');
    expect(caps.unavailablePlugins).toContain('cohorts');
  });

  it('falls back to a drill probe when a non-admin cannot list plugins (Enterprise)', async () => {
    const client = fakeClient({
      ...legacyBase('26.01'),
      '/o/system/plugins': json(401, { result: 'User does not have right' }),
      '/o?method=drill_bookmarks': json(200, []),
    });
    const caps = await detectServerCapabilities(client, 'token');
    expect(caps).toMatchObject({ architecture: 'legacy', flavor: 'enterprise', plugins: null, unavailablePlugins: [] });
  });

  it('detects Platform from the /v2 API and reads plugins for non-admins', async () => {
    const client = fakeClient({
      '/v2/countly_version': json(200, { data: { fs: [], db: [] } }),
      '/o/system/version': json(200, { version: '26.01' }),
      '/v2/plugins/enabled': json(200, { data: PLATFORM_PLUGINS }),
    });
    const caps = await detectServerCapabilities(client, 'token');
    expect(caps).toMatchObject({ architecture: 'platform', flavor: 'platform', version: '26.01', plugins: PLATFORM_PLUGINS });
  });

  it('detects Platform even when the token is rejected by /v2', async () => {
    const client = fakeClient({
      '/v2/countly_version': json(400, { error: { code: 'BAD_REQUEST', message: 'Missing parameter' } }),
      '/o/system/version': json(400, { result: 'Missing parameter' }),
      '/v2/plugins/enabled': json(400, { error: { code: 'BAD_REQUEST', message: 'Missing parameter' } }),
    });
    const caps = await detectServerCapabilities(client, 'bad');
    expect(caps).toMatchObject({ architecture: 'platform', flavor: 'platform', plugins: null });
  });

  it('detects Platform without the /v2 API from Platform-only plugins (admin)', async () => {
    const client = fakeClient({ ...legacyBase('26.01'), '/o/system/plugins': json(200, PLATFORM_PLUGINS) });
    const caps = await detectServerCapabilities(client, 'token');
    expect(caps).toMatchObject({ architecture: 'platform', flavor: 'platform', plugins: PLATFORM_PLUGINS });
  });

  it('detects Platform without the /v2 API from /o/system/observability (non-admin)', async () => {
    const client = fakeClient({
      ...legacyBase('26.01'),
      '/o/system/plugins': json(401, { result: 'User does not have right' }),
      '/o/system/observability': json(200, [{ provider: 'mutation', healthy: true }]),
    });
    const caps = await detectServerCapabilities(client, 'token');
    expect(caps).toMatchObject({ architecture: 'platform', flavor: 'platform', plugins: null, unavailablePlugins: ['errorlogs'] });
  });

  it('does not treat a JSON "Invalid path" on /v2 as Platform', () => {
    expect(isPlatformV2Response(json(400, { result: 'Invalid path' }) as any)).toBe(false);
    expect(isPlatformV2Response(html404('/v2/x') as any)).toBe(false);
  });

  it('reports unknown when the server is unreachable', async () => {
    const client = { get: vi.fn(async () => {
 throw new Error('ECONNREFUSED'); 
}) } as any;
    const caps = await detectServerCapabilities(client, 'token');
    expect(caps).toMatchObject({ architecture: 'unknown', flavor: 'unknown', plugins: null, unavailablePlugins: [] });
  });

  it('reports unknown flavor for a rejected legacy token', async () => {
    const client = fakeClient({
      '/v2/countly_version': html404('/v2/countly_version'),
      '/o/system/version': json(401, { result: 'Token not valid' }),
    });
    const caps = await detectServerCapabilities(client, 'bad');
    expect(caps.flavor).toBe('unknown');
  });

  it('classifies flavors', () => {
    expect(classifyFlavor('platform', null)).toBe('platform');
    expect(classifyFlavor('legacy', ['mobile', 'drill'])).toBe('enterprise');
    expect(classifyFlavor('legacy', ['mobile'])).toBe('lite');
    expect(classifyFlavor('legacy', null)).toBe('unknown');
    expect(classifyFlavor('unknown', ['drill'])).toBe('unknown');
  });
});

describe('tool filtering by server', () => {
  const tools = ['ping', 'apps_list', 'cohorts_list', 'journeys_list', 'server_logs_files_list', 'sdk_stats_get', 'filtering_rules_list']
    .map((name) => ({ name }));
  const config = loadToolsConfig({});
  const names = (plugins: string[] | null, unavailable: string[] = []) =>
    filterToolsByServer(tools, config, plugins, unavailable).map((t) => t.name);

  it('hides enterprise tools on Lite', () => {
    expect(names(LITE_PLUGINS)).toEqual(['ping', 'apps_list', 'server_logs_files_list', 'sdk_stats_get']);
  });

  it('shows enterprise tools on Enterprise but not Platform-era ones', () => {
    expect(names(EE_PLUGINS)).toEqual(['ping', 'apps_list', 'cohorts_list', 'server_logs_files_list', 'sdk_stats_get', 'filtering_rules_list']);
  });

  it('hides errorlogs-based tools on Platform', () => {
    expect(names(PLATFORM_PLUGINS)).not.toContain('server_logs_files_list');
    expect(names(PLATFORM_PLUGINS)).toContain('journeys_list');
  });

  it('keeps everything when the plugin list is unknown', () => {
    expect(names(null)).toHaveLength(tools.length);
  });

  it('respects known-missing plugins when the list is unknown', () => {
    expect(isToolSupported('cohorts_list', null, ['cohorts'])).toBe(false);
    expect(isToolSupported('apps_list', null, ['cohorts'])).toBe(true);
  });
});

describe('ServerCapabilitiesCache', () => {
  const caps = (architecture: ServerCapabilities['architecture']): ServerCapabilities => ({
    architecture,
    flavor: architecture === 'platform' ? 'platform' : 'unknown',
    plugins: null,
    unavailablePlugins: [],
    detectedAt: Date.now(),
  });

  it('runs detection once per server + token, including concurrent callers', async () => {
    const cache = new ServerCapabilitiesCache();
    const detect = vi.fn(async () => caps('platform'));
    await Promise.all([cache.get('https://a', 't', detect), cache.get('https://a', 't', detect)]);
    await cache.get('https://a', 't', detect);
    expect(detect).toHaveBeenCalledTimes(1);
  });

  it('keeps tenants apart', async () => {
    const cache = new ServerCapabilitiesCache();
    const detect = vi.fn(async () => caps('platform'));
    await cache.get('https://a', 't1', detect);
    await cache.get('https://a', 't2', detect);
    await cache.get('https://b', 't1', detect);
    expect(detect).toHaveBeenCalledTimes(3);
  });

  it('retries inconclusive detections sooner than the TTL', async () => {
    vi.useFakeTimers();
    try {
      const cache = new ServerCapabilitiesCache(60 * 60 * 1000);
      const detect = vi.fn(async () => caps('unknown'));
      await cache.get('https://a', 't', detect);
      vi.advanceTimersByTime(31_000);
      await cache.get('https://a', 't', detect);
      expect(detect).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
