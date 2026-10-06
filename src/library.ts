/**
 * Library entry point: host the Countly MCP tools inside another process.
 *
 * Published as `countly-mcp-server/library`. A host (Countly itself, mounting
 * the tools at /v2/mcp) does all authentication and hands this module, per
 * request, the Countly API token to use and what the caller's grant allows.
 *
 * Differences from the stdio and standalone HTTP modes in src/index.ts, which
 * are unaffected by this module:
 * - Credentials and the Countly URL come only from `context.upstreamToken` and
 *   `options.countlyUrl`. Environment variables, the X-Countly-Auth-Token and
 *   X-Countly-Server-Url headers, the auth_token/server_url query parameters,
 *   MCP `_meta` and the `countly_auth_token` tool argument are never read; the
 *   argument is stripped before a tool runs.
 * - The token is sent only as the `countly-token` header, never as a query
 *   parameter, so it does not end up in access logs.
 * - Tools are filtered per request by CRUD operation, admin rights and
 *   (optionally) enabled plugins, and an unclassified tool is never exposed.
 *   Each call is checked against the operations its arguments need
 *   (TOOL_OPERATION_RULES), not only the tool's static operation.
 * - With an app allow-list, every app id in the arguments is validated at any
 *   depth, and tools not provably confined to the named app (TOOL_APP_SCOPE
 *   "unscoped") are hidden.
 * - Stateless: every request gets its own MCP server and transport, and the
 *   app cache is keyed by grant id.
 * - Resources are not exposed (they would read apps outside `context.apps`);
 *   tools and the static prompts are.
 *
 * Importing this module has no side effects: it does not load .env, start
 * analytics or read process.env.
 */

import { HostAnalytics, type HostAnalyticsOptions } from './lib/host-analytics.js';
import type { IncomingMessage, ServerResponse } from 'http';
import { createRequire } from 'module';

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  GetPromptRequestSchema,
  ListPromptsRequestSchema,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import axios, { AxiosInstance } from 'axios';

import { AppCache, type CountlyApp } from './lib/app-cache.js';
import { getPrompt, listPrompts } from './lib/prompts.js';
import {
  ADMIN_ONLY_TOOLS,
  getEffectiveOperations,
  getPossibleOperations,
  TOOL_APP_SCOPE,
  TOOL_AREAS,
  TOOL_CATEGORIES,
  type CrudOperation,
  type ToolAppScope,
} from './lib/tools-config.js';
import { getAllToolDefinitions, getAllToolMetadata } from './tools/index.js';
import type { ToolContext } from './tools/types.js';

export type { CrudOperation, ToolAppScope } from './lib/tools-config.js';
export type { HostAnalyticsOptions } from './lib/host-analytics.js';
export { DEFAULT_ANALYTICS_APP_KEY, DEFAULT_ANALYTICS_URL } from './lib/host-analytics.js';

const require = createRequire(import.meta.url);
const { version: PACKAGE_VERSION } = require('../package.json') as { version: string };

// ============================================================================
// PUBLIC TYPES
// ============================================================================

export interface McpRequestContext {
  /** Countly API token; sent as the `countly-token` header on every Countly call. */
  upstreamToken: string;
  /** Stable per connection; keys the app cache instead of the token. */
  grantId: string;
  /**
   * Allowed operations. A tool is listed only when its plainest call is
   * allowed, and each call is checked against the operations its arguments
   * need (see ToolInfo.possibleOperations and requiredOperations).
   */
  operations: CrudOperation[];
  /** When false, tools marked adminOnly are not listed and cannot be called. */
  admin: boolean;
  /**
   * Optional app id allow-list. When set, every app id in a call's arguments
   * (at any depth) must be in it, app lists and app-name resolution are
   * limited to it, and tools that are not provably limited to the named app
   * (ToolInfo.appScope "unscoped") are not listed and cannot be called.
   */
  apps?: string[];
}

export interface ToolCallReport {
  tool: string;
  category: string;
  /** The tool's static operation (as in the catalog). */
  operation: CrudOperation;
  /** What this call needed, from its arguments; see requiredOperations. */
  operations: CrudOperation[];
  area: string;
  /**
   * `no_access` when Countly answered 401/403, or when the call was refused
   * here because the grant does not allow the tool or names an app outside
   * `context.apps`. `failed` for any other error.
   */
  outcome: 'success' | 'failed' | 'no_access';
  durationMs: number;
  appId?: string;
  grantId: string;
}

export interface CreateMcpHandlerOptions {
  /** Base URL of the Countly API, e.g. http://127.0.0.1:3001. Trusted: never SSRF-checked. */
  countlyUrl: string;
  /** Called after every tool call. Errors it throws (or rejects with) are swallowed. */
  onToolCall?: (report: ToolCallReport) => void;
  /** Timeout for each Countly API request. Default 30000 ms. */
  timeoutMs?: number;
  serverName?: string;
  serverVersion?: string;
  /**
   * Optional plugin check. When given, tools whose category requires a plugin
   * are listed and callable only if this returns true for that plugin. When
   * omitted, no plugin filtering is applied (as in the standalone modes) and
   * a tool whose plugin is missing fails when Countly rejects the call.
   */
  isPluginEnabled?: (plugin: string) => boolean;
  /**
   * Optional usage analytics to the MCP app on stats.count.ly, driven by the
   * host (src/lib/host-analytics.ts): the host decides when reporting is
   * allowed and which device id to report under. Without it, nothing is
   * reported. The standalone modes' own analytics module is never loaded.
   */
  analytics?: HostAnalyticsOptions;
}

export interface McpHandler {
  /**
   * Handle one MCP streamable-HTTP request (stateless). `parsedBody` is the
   * already-parsed JSON body.
   */
  handle(req: IncomingMessage, res: ServerResponse, parsedBody: unknown, context: McpRequestContext): Promise<void>;
}

export interface ToolInfo {
  name: string;
  category: string;
  /** Static operation, used for grouping and display. */
  operation: CrudOperation;
  /**
   * Every operation the tool can perform. Wider than `operation` for tools
   * whose arguments can make a call write (e.g. formulas_run saving a
   * formula); what one call needs comes from requiredOperations.
   */
  possibleOperations: CrudOperation[];
  area: string;
  adminOnly: boolean;
  /**
   * How the tool relates to an app allow-list (context.apps): "app" - limited
   * to the app its validated app argument names; "safe" - exposes no app data
   * or filters its output to the allowed apps; "unscoped" - can reach other
   * apps' data, so it is hidden whenever context.apps is set.
   */
  appScope: ToolAppScope;
  requiresPlugin?: string;
}

/** One operation a `tools/call` in a request body needs. */
export interface RequiredOperation {
  tool: string;
  operation: CrudOperation;
  adminOnly: boolean;
}

// ============================================================================
// CATALOG
// ============================================================================

const CRUD_OPERATIONS: ReadonlySet<string> = new Set(['C', 'R', 'U', 'D']);
const KNOWN_AREAS: ReadonlySet<string> = new Set<string>(TOOL_AREAS);
const APP_SCOPES: ReadonlySet<string> = new Set<string>(['app', 'safe', 'unscoped']);

/**
 * Classify one tool from TOOL_CATEGORIES and TOOL_APP_SCOPE. Returns undefined
 * when the tool has no category, no valid operation, no valid area or no app
 * scope; such a tool is never listed or callable in library mode (fail closed).
 */
function classify(name: string): ToolInfo | undefined {
  for (const [category, data] of Object.entries(TOOL_CATEGORIES)) {
    if (!Object.prototype.hasOwnProperty.call(data.operations, name)) {
      continue;
    }
    const operation = data.operations[name];
    const possibleOperations = getPossibleOperations(name);
    const appScope = Object.prototype.hasOwnProperty.call(TOOL_APP_SCOPE, name) ? TOOL_APP_SCOPE[name] : undefined;
    if (
      !CRUD_OPERATIONS.has(operation) ||
      !KNOWN_AREAS.has(data.area) ||
      !possibleOperations ||
      !appScope ||
      !APP_SCOPES.has(appScope)
    ) {
      return undefined;
    }
    const info: ToolInfo = {
      name,
      category,
      operation,
      possibleOperations,
      area: data.area,
      adminOnly: ADMIN_ONLY_TOOLS.has(name),
      appScope,
    };
    if (data.availableByDefault === false && data.requiresPlugin) {
      info.requiresPlugin = data.requiresPlugin;
    }
    return info;
  }
  return undefined;
}

interface ToolRoute {
  instanceKey: string;
  methodName: string;
  toolClass: new (context: ToolContext) => any;
}

interface CatalogState {
  infos: ToolInfo[];
  byName: Map<string, ToolInfo>;
  definitions: Map<string, { name: string }>;
  routes: Map<string, ToolRoute>;
}

let catalogState: CatalogState | undefined;

function getCatalogState(): CatalogState {
  if (catalogState) {
    return catalogState;
  }
  const routes = new Map<string, ToolRoute>();
  for (const metadata of getAllToolMetadata()) {
    for (const [toolName, methodName] of Object.entries(metadata.handlers)) {
      routes.set(toolName, {
        instanceKey: metadata.instanceKey,
        methodName: methodName as string,
        toolClass: metadata.toolClass as unknown as new (context: ToolContext) => any,
      });
    }
  }
  const infos: ToolInfo[] = [];
  const byName = new Map<string, ToolInfo>();
  const definitions = new Map<string, { name: string }>();
  for (const definition of getAllToolDefinitions()) {
    const info = classify(definition.name);
    // A tool with no handler cannot run; a tool with no classification is
    // hidden. Either way it is left out of the catalog.
    if (!info || !routes.has(definition.name) || byName.has(definition.name)) {
      continue;
    }
    infos.push(info);
    byName.set(info.name, info);
    definitions.set(info.name, definition);
  }
  catalogState = { infos, byName, definitions, routes };
  return catalogState;
}

/**
 * Static metadata for every tool library mode can expose. Tools that are not
 * fully classified are left out (and so are never exposed).
 */
export function getToolCatalog(): ToolInfo[] {
  return getCatalogState().infos.map((info) => ({ ...info, possibleOperations: [...info.possibleOperations] }));
}

/**
 * Names of registered tools that are missing a category, operation, area, app
 * scope or handler. Library mode hides them; the unit tests require this to be empty.
 */
export function getUnclassifiedTools(): string[] {
  const { byName } = getCatalogState();
  return getAllToolDefinitions()
    .map((t) => t.name)
    .filter((name) => !byName.has(name));
}

/**
 * Which tools a JSON-RPC body calls. Handles single messages and batches;
 * anything that is not a well-formed `tools/call` request is ignored. Lets a
 * host answer 403 insufficient_scope before handing the request over.
 */
export function toolsCalledIn(parsedBody: unknown): string[] {
  const names: string[] = [];
  for (const call of toolCallsIn(parsedBody)) {
    if (!names.includes(call.name)) {
      names.push(call.name);
    }
  }
  return names;
}

function toolCallsIn(parsedBody: unknown): Array<{ name: string; args: unknown }> {
  const messages = Array.isArray(parsedBody) ? parsedBody : [parsedBody];
  const calls: Array<{ name: string; args: unknown }> = [];
  for (const message of messages) {
    if (!message || typeof message !== 'object') {
      continue;
    }
    const { method, params } = message as { method?: unknown; params?: unknown };
    if (method !== 'tools/call' || !params || typeof params !== 'object') {
      continue;
    }
    const { name, arguments: args } = params as { name?: unknown; arguments?: unknown };
    if (typeof name === 'string') {
      calls.push({ name, args });
    }
  }
  return calls;
}

/**
 * The operations the `tools/call` requests in a JSON-RPC body need, derived
 * from each call's arguments (a formulas_run that saves needs C as well as
 * R, an alerts_create with an `_id` needs U, ...). One entry per tool and
 * operation, deduplicated; tools library mode does not expose are left out
 * (the call fails as an unknown tool). A host compares these with the grant
 * to answer HTTP 403 insufficient_scope before handing the request over; the
 * handler enforces the same check per call.
 */
export function requiredOperations(parsedBody: unknown): RequiredOperation[] {
  const { byName } = getCatalogState();
  const out: RequiredOperation[] = [];
  for (const call of toolCallsIn(parsedBody)) {
    const info = byName.get(call.name);
    if (!info) {
      continue;
    }
    for (const operation of operationsForCall(info, call.args)) {
      if (!out.some((r) => r.tool === info.name && r.operation === operation)) {
        out.push({ tool: info.name, operation, adminOnly: info.adminOnly });
      }
    }
  }
  return out;
}

function operationsForCall(info: ToolInfo, args: unknown): CrudOperation[] {
  return getEffectiveOperations(info.name, sanitizeArgs(args)) ?? info.possibleOperations;
}

// ============================================================================
// PER-REQUEST FILTERING
// ============================================================================

function isToolAllowedFor(
  info: ToolInfo,
  context: McpRequestContext,
  isPluginEnabled: ((plugin: string) => boolean) | undefined
): boolean {
  // Listed when the plainest call (no arguments) is allowed; each call is
  // then checked against what its own arguments need.
  if (!operationsForCall(info, {}).every((op) => context.operations.includes(op))) {
    return false;
  }
  if (context.apps && info.appScope === 'unscoped') {
    return false;
  }
  if (info.adminOnly && context.admin !== true) {
    return false;
  }
  if (info.requiresPlugin && isPluginEnabled) {
    try {
      return isPluginEnabled(info.requiresPlugin) === true;
    } catch {
      return false;
    }
  }
  return true;
}

/**
 * Arguments that carry credentials in the standalone modes. Never honoured in
 * library mode, and removed so a tool cannot pass them on.
 */
const STRIPPED_ARGS = ['countly_auth_token'];

function sanitizeArgs(args: unknown): Record<string, unknown> {
  if (!args || typeof args !== 'object' || Array.isArray(args)) {
    return {};
  }
  const out: Record<string, unknown> = { ...(args as Record<string, unknown>) };
  for (const key of STRIPPED_ARGS) {
    delete out[key];
  }
  return out;
}

class AppScopeError extends McpError {
  constructor(appId: string) {
    super(ErrorCode.InvalidParams, `App ${appId} is not available to this connection`);
  }
}

/**
 * Argument keys that carry app ids, compared after lower-casing and dropping
 * `_` and `-`: app_id, appId, app, apps, app_ids, appIds, selectedApps,
 * selected_app, selected_apps.
 *
 * Audit of every input schema in src/tools/*.ts (2026-10) for app-bearing
 * fields, at any depth and inside JSON-string arguments:
 * - top level `app_id`: nearly every tool (`app_name` is resolved through
 *   resolveAppId, which is limited separately).
 * - `apps`: email_reports_core_create, hooks_create, hooks_update.
 * - `selected_app` (comma-separated): datapoints_stats.
 * - nested `widget.apps`: dashboards_widget_add.
 * - nested `alert_config.selectedApps`: alerts_create (object or JSON string).
 * - inside JSON strings: hooks_test `hook_config.apps`, and any raw-field
 *   escape hatch such as email_reports_update `report_data` (`apps`).
 * - `<appId>***<eventKey>` composite keys: email_reports_core_create
 *   `selectedEvents`, dashboards_widget_add `widget.events`, hook trigger
 *   event lists. These are matched by value pattern, not by key.
 * No tool uses another spelling, so no per-tool list is needed beyond this.
 */
const APP_KEYS: ReadonlySet<string> = new Set([
  'app',
  'apps',
  'appid',
  'appids',
  'selectedapp',
  'selectedapps',
]);

/** Values in an app field that mean "every app"; refused under an allow-list. */
const APP_WILDCARDS: ReadonlySet<string> = new Set(['*', 'all', 'all_apps', 'allapps']);

/** An event or segment key prefixed with its app id: `<24-hex id>***key`. */
const APP_PREFIXED_KEY = /^([0-9a-fA-F]{24})\*\*\*/;

/** Nesting deeper than this is refused rather than left unchecked. */
const MAX_ARG_DEPTH = 32;

function isAppKey(key: string): boolean {
  return APP_KEYS.has(key.toLowerCase().replace(/[_-]/g, ''));
}

function parseJsonString(value: string): { ok: true; value: unknown } | { ok: false } {
  const trimmed = value.trim();
  if (!(trimmed.startsWith('{') || trimmed.startsWith('['))) {
    return { ok: false };
  }
  try {
    return { ok: true, value: JSON.parse(trimmed) };
  } catch {
    return { ok: false };
  }
}

/**
 * Reject a call whose arguments name an app outside `context.apps`, wherever
 * the app appears: any app-bearing key (see APP_KEYS) at any depth, inside
 * arrays and inside arguments that are JSON strings, comma-separated lists,
 * and `<appId>***key` composite keys. A wildcard ("*", "all") is refused, and
 * so is an app field holding something that is not an id (an object, a
 * boolean) or nesting too deep to check. Countly still applies the token's
 * own rights on every call.
 */
function assertAppsInScope(args: Record<string, unknown>, allowed: ReadonlySet<string> | undefined): void {
  if (!allowed) {
    return;
  }
  const checkId = (raw: string) => {
    const id = raw.trim();
    if (id === '') {
      return;
    }
    if (APP_WILDCARDS.has(id.toLowerCase())) {
      throw new McpError(ErrorCode.InvalidParams, 'Every-app wildcards are not available to this connection');
    }
    if (!allowed.has(id)) {
      throw new AppScopeError(id);
    }
  };
  const checkAppValue = (value: unknown, depth: number): void => {
    if (depth > MAX_ARG_DEPTH) {
      throw new McpError(ErrorCode.InvalidParams, 'Arguments are nested too deeply to check');
    }
    if (value === undefined || value === null) {
      return;
    }
    if (typeof value === 'string') {
      const parsed = parseJsonString(value);
      if (parsed.ok) {
        checkAppValue(parsed.value, depth + 1);
        return;
      }
      value.split(',').forEach(checkId);
      return;
    }
    if (typeof value === 'number') {
      checkId(String(value));
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((item) => checkAppValue(item, depth + 1));
      return;
    }
    throw new McpError(ErrorCode.InvalidParams, 'Unsupported app reference in arguments');
  };
  const walk = (value: unknown, depth: number): void => {
    if (depth > MAX_ARG_DEPTH) {
      throw new McpError(ErrorCode.InvalidParams, 'Arguments are nested too deeply to check');
    }
    if (typeof value === 'string') {
      const prefixed = APP_PREFIXED_KEY.exec(value);
      if (prefixed) {
        checkId(prefixed[1]);
      }
      const parsed = parseJsonString(value);
      if (parsed.ok) {
        walk(parsed.value, depth + 1);
      }
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((item) => walk(item, depth + 1));
      return;
    }
    if (value && typeof value === 'object') {
      for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
        if (isAppKey(key)) {
          checkAppValue(child, depth + 1);
        }
        walk(child, depth + 1);
      }
    }
  };
  walk(args, 0);
}

// ============================================================================
// APP CACHE (keyed by grant id)
// ============================================================================

const MAX_CACHED_GRANTS = 1000;

class GrantAppCaches {
  private readonly caches = new Map<string, AppCache>();

  for(grantId: string): AppCache {
    let cache = this.caches.get(grantId);
    if (cache) {
      // Refresh recency so the least recently used grant is evicted first.
      this.caches.delete(grantId);
    } else {
      cache = new AppCache();
    }
    this.caches.set(grantId, cache);
    while (this.caches.size > MAX_CACHED_GRANTS) {
      const oldest = this.caches.keys().next().value as string;
      this.caches.delete(oldest);
    }
    return cache;
  }
}

async function fetchApps(client: AxiosInstance, cache: AppCache): Promise<CountlyApp[]> {
  if (!cache.isExpired()) {
    return cache.getAll();
  }
  const response = await client.get('/o/apps/mine');
  let apps: CountlyApp[];
  if (response.data && Array.isArray(response.data)) {
    apps = response.data;
  } else if (response.data && response.data.admin_of) {
    apps = Object.values(response.data.admin_of) as CountlyApp[];
  } else if (response.data && response.data.apps) {
    apps = response.data.apps;
  } else {
    apps = [];
  }
  cache.update(apps);
  return apps;
}

// ============================================================================
// HANDLER
// ============================================================================

function trimTrailingSlashes(value: string): string {
  let out = value;
  while (out.endsWith('/')) {
    out = out.slice(0, -1);
  }
  return out;
}

function validateContext(context: McpRequestContext): void {
  if (!context || typeof context !== 'object') {
    throw new TypeError('countly-mcp-server: context is required');
  }
  if (typeof context.upstreamToken !== 'string' || context.upstreamToken === '') {
    throw new TypeError('countly-mcp-server: context.upstreamToken must be a non-empty string');
  }
  if (typeof context.grantId !== 'string' || context.grantId === '') {
    throw new TypeError('countly-mcp-server: context.grantId must be a non-empty string');
  }
  if (!Array.isArray(context.operations)) {
    throw new TypeError('countly-mcp-server: context.operations must be an array');
  }
  if (context.apps !== undefined && !Array.isArray(context.apps)) {
    throw new TypeError('countly-mcp-server: context.apps must be an array when set');
  }
}

export function createMcpHandler(options: CreateMcpHandlerOptions): McpHandler {
  if (!options || typeof options.countlyUrl !== 'string' || options.countlyUrl === '') {
    throw new TypeError('countly-mcp-server: options.countlyUrl is required');
  }
  const countlyUrl = trimTrailingSlashes(options.countlyUrl);
  const timeoutMs = options.timeoutMs ?? 30000;
  const serverName = options.serverName ?? 'countly-mcp-server';
  const serverVersion = options.serverVersion ?? PACKAGE_VERSION;
  const isPluginEnabled = options.isPluginEnabled;
  const appCaches = new GrantAppCaches();
  const hostAnalytics = options.analytics ? new HostAnalytics(options.analytics) : null;

  const report = (entry: ToolCallReport): void => {
    hostAnalytics?.toolCall(entry);
    if (!options.onToolCall) {
      return;
    }
    try {
      const result: unknown = options.onToolCall(entry);
      if (result && typeof (result as Promise<unknown>).catch === 'function') {
        (result as Promise<unknown>).catch(() => undefined);
      }
    } catch {
      // A reporting failure must never affect the response.
    }
  };

  /**
   * A fresh axios client per tool call: the token lives only in this
   * instance's headers, and the interceptor records whether Countly refused
   * the call (401/403) so the report can say no_access.
   */
  const createClient = (token: string, onNoAccess: () => void): AxiosInstance => {
    const client = axios.create({
      baseURL: countlyUrl,
      timeout: timeoutMs,
      headers: { 'countly-token': token },
      // The host's own API: never route it (and the token) through an
      // environment-configured proxy, and never follow a redirect that would
      // carry the countly-token header to another host.
      proxy: false,
      maxRedirects: 0,
    });
    client.interceptors.response.use(undefined, (error) => {
      const status = error?.response?.status;
      if (status === 401 || status === 403) {
        onNoAccess();
      }
      return Promise.reject(error);
    });
    return client;
  };

  const buildServer = (context: McpRequestContext): Server => {
    const state = getCatalogState();
    const allowedApps = context.apps ? new Set(context.apps.map(String)) : undefined;
    const allowed = (name: string): ToolInfo | undefined => {
      const info = state.byName.get(name);
      return info && isToolAllowedFor(info, context, isPluginEnabled) ? info : undefined;
    };

    const server = new Server(
      { name: serverName, version: serverVersion },
      {
        capabilities: {
          tools: { listChanged: false },
          prompts: { listChanged: false },
        },
      }
    );

    server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: state.infos
        .filter((info) => allowed(info.name))
        .map((info) => state.definitions.get(info.name)) as any[],
    }));

    server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const name = request.params.name;
      const known = state.byName.get(name);
      const info = allowed(name);
      const started = performance.now();
      const args = sanitizeArgs(request.params.arguments);
      const callOperations = known ? operationsForCall(known, args) : [];
      const finish = (outcome: ToolCallReport['outcome'], appId?: string) => {
        if (!known) {
          return;
        }
        const entry: ToolCallReport = {
          tool: known.name,
          category: known.category,
          operation: known.operation,
          operations: [...callOperations],
          area: known.area,
          outcome,
          durationMs: Math.max(0, performance.now() - started),
          grantId: context.grantId,
        };
        if (appId) {
          entry.appId = appId;
        }
        report(entry);
      };

      if (!info) {
        finish('no_access');
        // Same answer for an unknown tool and a filtered one, so the error
        // does not reveal which tools exist beyond the caller's grant.
        throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
      }

      let appId = typeof args.app_id === 'string' && args.app_id !== '' ? args.app_id : undefined;

      const missing = callOperations.filter((op) => !context.operations.includes(op));
      if (missing.length > 0) {
        finish('no_access', appId);
        throw new McpError(
          ErrorCode.InvalidParams,
          `insufficient_scope: this call of ${name} needs operation ${missing.join(', ')}, which this connection does not allow`
        );
      }

      try {
        assertAppsInScope(args, allowedApps);
      } catch (error) {
        finish('no_access', appId);
        throw error;
      }

      let noAccess = false;
      const client = createClient(context.upstreamToken, () => {
        noAccess = true;
      });
      const cache = appCaches.for(context.grantId);
      const getApps = async (): Promise<CountlyApp[]> => {
        const apps = await fetchApps(client, cache);
        return allowedApps ? apps.filter((a) => allowedApps.has(String(a._id))) : apps;
      };
      const toolContext: ToolContext = {
        httpClient: client,
        appCache: cache,
        getAuthParams: () => ({}),
        getApps,
        resolveAppId: async (a: any) => {
          const requestedId = a?.app_id;
          if (requestedId) {
            if (allowedApps && !allowedApps.has(String(requestedId))) {
              throw new AppScopeError(String(requestedId));
            }
            appId = String(requestedId);
            return appId;
          }
          if (a?.app_name) {
            const app = (await getApps()).find((x) => x.name === a.app_name);
            if (!app) {
              throw new McpError(ErrorCode.InvalidParams, `App not found: ${a.app_name}`);
            }
            appId = String(app._id);
            return appId;
          }
          throw new McpError(
            ErrorCode.InvalidParams,
            'Either app_id or app_name must be provided.\n' +
            'Example: { app_id: "abc123" } or { app_name: "MyApp" }'
          );
        },
      };

      const route = state.routes.get(name) as ToolRoute;
      try {
        const instance = new route.toolClass(toolContext);
        const result = await instance[route.methodName](args);
        const failedResult = !!(result && typeof result === 'object' && (result as any).isError === true);
        finish(failedResult ? (noAccess ? 'no_access' : 'failed') : 'success', appId);
        return result;
      } catch (error) {
        const scopeError = error instanceof AppScopeError;
        finish(noAccess || scopeError ? 'no_access' : 'failed', appId);
        if (error instanceof McpError) {
          throw error;
        }
        throw new McpError(
          ErrorCode.InternalError,
          `Error executing tool ${name}: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    });

    server.setRequestHandler(ListPromptsRequestSchema, async () => ({ prompts: listPrompts() }));

    server.setRequestHandler(GetPromptRequestSchema, async (request) => {
      try {
        const result = getPrompt(request.params.name, request.params.arguments || {});
        return { description: result.description, messages: result.messages };
      } catch (error) {
        throw new McpError(
          ErrorCode.InvalidParams,
          error instanceof Error ? error.message : String(error)
        );
      }
    });

    return server;
  };

  return {
    async handle(req, res, parsedBody, context) {
      validateContext(context);
      const server = buildServer(context);
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
      let closed = false;
      const cleanup = () => {
        if (closed) {
          return;
        }
        closed = true;
        void transport.close().catch(() => undefined);
        void server.close().catch(() => undefined);
      };
      res.on('close', cleanup);
      try {
        await server.connect(transport);
        await transport.handleRequest(req, res, parsedBody);
      } catch (error) {
        cleanup();
        throw error;
      }
    },
  };
}
