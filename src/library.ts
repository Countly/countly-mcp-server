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
 * - Listing and calling tools go through the same pipeline as the standalone
 *   modes (lib/tool-pipeline.ts): the grant's operations become a tools
 *   configuration, the server's capabilities are detected once per grant (so
 *   tools take their Platform /v2 paths), and each call is checked against
 *   the operations its arguments need (TOOL_OPERATION_RULES). Library mode
 *   adds admin-only tools, the host's plugin check, and never exposes an
 *   unclassified tool. A refusal or failure is an isError result.
 * - Every per-grant cache is bounded, so a long-running host holds a fixed
 *   number of entries however many grants it has seen.
 * - Apps are not limited here: the upstream token carries the caller's own
 *   rights, and Countly enforces them on every request.
 * - Stateless: every request gets its own MCP server and transport, and the
 *   app cache is keyed by grant id.
 * - Resources are not exposed; tools and the static prompts are.
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

import { AppCache } from './lib/app-cache.js';
import { BoundedCache } from './lib/bounded-cache.js';
import { callTool, configForOperations, listTools, toolContext, type ToolRequest } from './lib/tool-pipeline.js';
import { getPrompt, listPrompts } from './lib/prompts.js';
import { detectServerCapabilities, ServerCapabilitiesCache, type ServerCapabilities } from './lib/server-capabilities.js';
import {
  ADMIN_ONLY_TOOLS,
  getEffectiveOperations,
  getPossibleOperations,
  TOOL_AREAS,
  TOOL_CATEGORIES,
  type CrudOperation,
} from './lib/tools-config.js';
import { getAllToolDefinitions, getAllToolMetadata } from './tools/index.js';
import type { ToolContext } from './tools/types.js';

export type { CrudOperation } from './lib/tools-config.js';
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
   * here because the grant does not allow the tool or the call.
   * `failed` for any other error.
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
   * Optional usage analytics to the Countly server telemetry app on stats.count.ly, driven by the
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

/**
 * Classify one tool from TOOL_CATEGORIES. Returns undefined when the tool has
 * no category, no valid operation or no valid area; such a tool is never listed or callable in library mode (fail closed).
 */
function classify(name: string): ToolInfo | undefined {
  for (const [category, data] of Object.entries(TOOL_CATEGORIES)) {
    if (!Object.prototype.hasOwnProperty.call(data.operations, name)) {
      continue;
    }
    const operation = data.operations[name];
    const possibleOperations = getPossibleOperations(name);
    if (
      !CRUD_OPERATIONS.has(operation) ||
      !KNOWN_AREAS.has(data.area) ||
      !possibleOperations
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
  // Operations are checked by the shared pipeline (configForOperations);
  // these are library mode's own filters.
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



// ============================================================================
// APP CACHE (keyed by grant id)
// ============================================================================

/** Tools that change the app list a grant's cache holds. */
const APP_MUTATIONS: ReadonlySet<string> = new Set(['apps_create', 'apps_update', 'apps_delete']);

const MAX_CACHED_GRANTS = 1000;

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
  // Per grant, bounded: a long-running host keeps at most MAX_CACHED_GRANTS.
  const appCaches = new BoundedCache<string, AppCache>(MAX_CACHED_GRANTS);
  // What the server is (Platform /v2 or not), its enabled plugins and the
  // member's permissions, detected once per grant as the standalone modes do,
  // so tools take their /v2 paths on Platform and unsupported ones are hidden.
  const capabilitiesCache = new ServerCapabilitiesCache(undefined, MAX_CACHED_GRANTS);
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
    const grant = context.grantId;
    const appCache = (() => {
      let cache = appCaches.get(grant);
      if (!cache) {
        cache = new AppCache();
        appCaches.set(grant, cache);
      }
      return cache;
    })();
    let capabilities: Promise<ServerCapabilities | null> | undefined;
    const getCapabilities = (): Promise<ServerCapabilities | null> => {
      capabilities ??= capabilitiesCache
        .get(countlyUrl, grant, () => detectServerCapabilities(createClient(context.upstreamToken, () => {}), undefined))
        .catch(() => null);
      return capabilities;
    };
    // Library mode's additions to the shared pipeline: only classified tools,
    // admin-only tools for admin grants, and the host's plugin check.
    const hidden = (name: string): boolean => {
      const info = state.byName.get(name);
      return !info || !isToolAllowedFor(info, context, isPluginEnabled);
    };
    const request = (client: AxiosInstance): ToolRequest => ({
      client,
      appCache,
      authParams: () => ({}),
      capabilities: getCapabilities,
      autoDetect: true,
      config: configForOperations(context.operations),
      hidden,
    });

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
      tools: await listTools(request(createClient(context.upstreamToken, () => {}))),
    }));

    server.setRequestHandler(CallToolRequestSchema, async (request_) => {
      // Timed from the start, so detection and checks count toward the call.
      const started = performance.now();
      const name = request_.params.name;
      const known = state.byName.get(name);
      const args = sanitizeArgs(request_.params.arguments);
      let appId = typeof args.app_id === 'string' && args.app_id !== '' ? args.app_id : undefined;
      const finish = (outcome: ToolCallReport['outcome']) => {
        if (!known) {
          return;
        }
        const entry: ToolCallReport = {
          tool: known.name,
          category: known.category,
          operation: known.operation,
          operations: [...operationsForCall(known, args)],
          area: known.area,
          outcome,
          durationMs: Math.max(0, performance.now() - started),
          grantId: grant,
        };
        if (appId) {
          entry.appId = appId;
        }
        report(entry);
      };

      let noAccess = false;
      const toolRequest = request(createClient(context.upstreamToken, () => {
        noAccess = true;
      }));
      let call;
      try {
        call = await callTool(toolRequest, name, args, toolContext(toolRequest, (id) => {
          appId = id;
        }));
      } catch (error) {
        // Unknown or hidden tool: same answer either way, so the error does
        // not reveal which tools exist beyond the caller's grant.
        finish('no_access');
        throw error;
      }
      if (call.outcome === 'success' && APP_MUTATIONS.has(name)) {
        // The grant's app list changed: the next lookup reads it again.
        appCache.clear();
      }
      finish(call.outcome === 'success' ? 'success' : call.outcome === 'refused' || noAccess ? 'no_access' : 'failed');
      return call.result as any;
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
