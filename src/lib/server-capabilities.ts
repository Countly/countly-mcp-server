/**
 * Server capability detection
 *
 * Figures out what kind of Countly backend a server URL + token points at so
 * the MCP server can expose only the tools that backend actually supports:
 *
 * - `lite`       countly-server without enterprise plugins
 * - `enterprise` countly-server with countly-enterprise-plugins
 * - `platform`   countly-platform (new architecture, serves the /v2 API)
 *
 * Detection only uses read endpoints and is cached per server + token.
 * Anything that cannot be determined is reported as unknown, and callers
 * must fail open (show tools) rather than hide tools on a guess.
 */

import { createHash } from 'crypto';

import { AxiosInstance, AxiosResponse } from 'axios';

import { parseAppsMineResponse } from './app-cache.js';
import { fetchMemberPermissions, type MemberPermissions } from './user-permissions.js';
import { ENTERPRISE_DEFAULT_PLUGINS, LITE_DEFAULT_PLUGINS, PLATFORM_DEFAULT_PLUGINS } from './default-plugins.js';

export type ServerArchitecture = 'legacy' | 'platform' | 'unknown';
export type ServerFlavor = 'lite' | 'enterprise' | 'platform' | 'unknown';

export interface ServerCapabilities {
  architecture: ServerArchitecture;
  flavor: ServerFlavor;
  /** Version string from /o/system/version, when readable */
  version?: string;
  /** Enabled plugin codes; null only when the flavor itself is unknown */
  plugins: string[] | null;
  /**
   * True when `plugins` is the flavor's default plugin set because the token
   * may not read the real list (non-admin on countly-server)
   */
  pluginsAssumed: boolean;
  /** The connected user's permissions (/o/users/me); null when unreadable */
  member: MemberPermissions | null;
  detectedAt: number;
}

/**
 * Plugins that only ship with Countly Enterprise (or Platform). Seeing any of
 * them on a countly-server instance means it runs the enterprise plugins.
 */
export const ENTERPRISE_ONLY_PLUGINS = [
  'drill', 'funnels', 'cohorts', 'formulas', 'users', 'block', 'ab-testing',
  'retention_segments', 'concurrent_users', 'flows', 'journey_engine',
  'content', 'license', 'revenue', 'surveys',
];

/** Plugins that only exist on Countly Platform (new architecture) */
export const PLATFORM_ONLY_PLUGINS = ['kafka', 'clickhouse'];

const DEFAULT_PLUGINS: Record<Exclude<ServerFlavor, 'unknown'>, string[]> = {
  lite: LITE_DEFAULT_PLUGINS,
  enterprise: ENTERPRISE_DEFAULT_PLUGINS,
  platform: PLATFORM_DEFAULT_PLUGINS,
};

/** Real plugin list when readable, otherwise the flavor's default set */
function resolvePlugins(flavor: ServerFlavor, plugins: string[] | null): Pick<ServerCapabilities, 'plugins' | 'pluginsAssumed'> {
  if (plugins || flavor === 'unknown') {
    return { plugins, pluginsAssumed: false };
  }
  return { plugins: [...DEFAULT_PLUGINS[flavor]], pluginsAssumed: true };
}

const UNKNOWN: Omit<ServerCapabilities, 'detectedAt'> = {
  architecture: 'unknown',
  flavor: 'unknown',
  plugins: null,
  pluginsAssumed: false,
  member: null,
};

function isJsonObject(response: AxiosResponse | undefined): boolean {
  if (!response || typeof response.data !== 'object' || response.data === null) {
    return false;
  }
  const contentType = String(response.headers?.['content-type'] || '');
  return contentType === '' || contentType.includes('json');
}

/**
 * Platform's /v2 router answers JSON shaped `{data: ...}` on success and
 * `{error: {code, message}}` on failure. countly-server has no /v2 routes, so
 * the request falls through to the dashboard and returns an HTML 404.
 */
export function isPlatformV2Response(response: AxiosResponse | undefined): boolean {
  if (!isJsonObject(response)) {
    return false;
  }
  const body = response!.data;
  return 'data' in body || (typeof body.error === 'object' && body.error !== null && 'code' in body.error);
}

function pluginList(value: unknown): string[] | null {
  return Array.isArray(value) && value.every((p) => typeof p === 'string') ? value : null;
}

export function classifyFlavor(
  architecture: ServerArchitecture,
  plugins: string[] | null,
  hasDrill?: boolean
): ServerFlavor {
  if (architecture === 'platform') {
    return 'platform';
  }
  if (architecture !== 'legacy') {
    return 'unknown';
  }
  if (plugins) {
    return plugins.some((p) => ENTERPRISE_ONLY_PLUGINS.includes(p)) ? 'enterprise' : 'lite';
  }
  if (hasDrill === undefined) {
    return 'unknown';
  }
  return hasDrill ? 'enterprise' : 'lite';
}

/**
 * Probe a server and work out its architecture, flavor and plugin set.
 * Never throws: network or permission failures degrade to `unknown`.
 */
export async function detectServerCapabilities(
  client: AxiosInstance,
  authToken: string | undefined,
  timeoutMs = 5000
): Promise<ServerCapabilities> {
  const params: Record<string, string> = authToken ? { auth_token: authToken } : {};
  const get = (url: string, extra: Record<string, string> = {}) =>
    client
      .get(url, { params: { ...params, ...extra }, timeout: timeoutMs, validateStatus: () => true })
      .catch(() => undefined);

  const [v2Version, systemVersion, member] = await Promise.all([
    get('/v2/countly_version'),
    get('/o/system/version'),
    fetchMemberPermissions(client, params, timeoutMs),
  ]);

  const version = isJsonObject(systemVersion) && typeof systemVersion!.data.version === 'string'
    ? systemVersion!.data.version
    : undefined;

  if (isPlatformV2Response(v2Version)) {
    const enabled = await get('/v2/plugins/enabled');
    const plugins = enabled?.status === 200 && isJsonObject(enabled) ? pluginList(enabled.data.data) : null;
    return {
      architecture: 'platform',
      flavor: 'platform',
      version,
      ...resolvePlugins('platform', plugins),
      member,
      detectedAt: Date.now(),
    };
  }

  // Without a successful version read we cannot tell what this is (server
  // down, wrong URL, rejected token).
  if (systemVersion?.status !== 200 || !version) {
    return { ...UNKNOWN, version, detectedAt: Date.now() };
  }

  const [systemPlugins, observability] = await Promise.all([
    get('/o/system/plugins'),
    get('/o/system/observability'),
  ]);
  const plugins = systemPlugins?.status === 200 ? pluginList(systemPlugins.data) : null;

  // Platform builds without the new UI ship no /v2 API, but still serve
  // Platform-only legacy endpoints such as /o/system/observability (any
  // management-read user). countly-server answers "Invalid path".
  if (
    (observability?.status === 200 && Array.isArray(observability.data))
    || plugins?.some((p) => PLATFORM_ONLY_PLUGINS.includes(p))
  ) {
    return {
      architecture: 'platform',
      flavor: 'platform',
      version,
      ...resolvePlugins('platform', plugins),
      member,
      detectedAt: Date.now(),
    };
  }

  // countly-server restricts /o/system/plugins to global admins. For other
  // tokens, check for drill (shipped with every enterprise install) via a
  // cheap read method: core answers "Invalid method" when no plugin owns it.
  let hasDrill: boolean | undefined;
  if (!plugins) {
    hasDrill = await probeDrill(client, params, timeoutMs);
  }

  const flavor = classifyFlavor('legacy', plugins, hasDrill);
  return {
    architecture: 'legacy',
    flavor,
    version,
    ...resolvePlugins(flavor, plugins),
    member,
    detectedAt: Date.now(),
  };
}

async function probeDrill(
  client: AxiosInstance,
  params: Record<string, string>,
  timeoutMs: number
): Promise<boolean | undefined> {
  try {
    const apps = await client.get('/o/apps/mine', { params, timeout: timeoutMs });
    const appId = parseAppsMineResponse(apps.data).map((app) => app?._id).find(Boolean);
    if (!appId) {
      return undefined;
    }
    const res = await client.get('/o', {
      params: { ...params, app_id: appId, method: 'drill_bookmarks' },
      timeout: timeoutMs,
      validateStatus: () => true,
    });
    if (res.status === 200) {
      return true;
    }
    if (isJsonObject(res) && res.data.result === 'Invalid method') {
      return false;
    }
    return undefined;
  } catch {
    return undefined;
  }
}

/**
 * Per server + token cache with in-flight de-duplication, so a burst of
 * tools/list and tools/call requests triggers a single detection.
 */
export class ServerCapabilitiesCache {
  private entries = new Map<string, { promise: Promise<ServerCapabilities>; expiresAt: number }>();

  constructor(private readonly ttlMs = 10 * 60 * 1000) {}

  private key(serverUrl: string, authToken: string | undefined): string {
    const token = authToken ? createHash('sha256').update(authToken).digest('hex') : '__anonymous__';
    return `${serverUrl}\n${token}`;
  }

  get(
    serverUrl: string,
    authToken: string | undefined,
    detect: () => Promise<ServerCapabilities>
  ): Promise<ServerCapabilities> {
    const key = this.key(serverUrl, authToken);
    const now = Date.now();
    const cached = this.entries.get(key);
    if (cached && cached.expiresAt > now) {
      return cached.promise;
    }
    const promise = detect().then((caps) => {
      // Don't keep inconclusive results for the full TTL; retry soon.
      if (caps.architecture === 'unknown' || caps.flavor === 'unknown' || caps.plugins === null) {
        const entry = this.entries.get(key);
        if (entry) {
          entry.expiresAt = Math.min(entry.expiresAt, Date.now() + 30_000);
        }
      }
      return caps;
    });
    this.entries.set(key, { promise, expiresAt: now + this.ttlMs });
    return promise;
  }

  clear(): void {
    this.entries.clear();
  }
}

export function describeCapabilities(caps: ServerCapabilities): string {
  const names: Record<ServerFlavor, string> = {
    lite: 'Countly Lite',
    enterprise: 'Countly Enterprise',
    platform: 'Countly Platform',
    unknown: 'unknown Countly flavor',
  };
  return `${names[caps.flavor]}${caps.version ? ` ${caps.version}` : ''}`;
}
