/**
 * What every tools/list and tools/call goes through, in both the standalone
 * modes (src/index.ts) and library mode (src/library.ts). Each mode supplies
 * only what differs between them: the Countly client and its credentials,
 * the tools configuration (from env vars, or from a library grant's
 * operations), extra filters (library mode's admin-only and host plugin
 * checks) and how a call is reported. Everything else lives here once, so a
 * fix to how tools are listed, refused, routed or run applies to both.
 *
 * Importing this module has no side effects.
 */

import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import type { AxiosInstance } from 'axios';

import { getAllToolDefinitions, getAllToolMetadata, getV2ToolDefinitionOverrides } from '../tools/index.js';
import type { ToolContext, ToolResult } from '../tools/types.js';
import { AppCache, parseAppsMineResponse, resolveAppIdentifier, type CountlyApp } from './app-cache.js';
import { describeCapabilities, type ServerCapabilities } from './server-capabilities.js';
import { withAnnotations } from './tool-annotations.js';
import { describeGuard, isToolPermitted } from './tool-guards.js';
import {
  filterTools,
  filterToolsByServer,
  getArgumentRefusal,
  getToolRequiredPlugin,
  isToolCallAllowed,
  isToolSupported,
  restrictToolArguments,
  TOOL_CATEGORIES,
  V2_ONLY_TOOLS,
  type CrudOperation,
  type ToolsConfig,
} from './tools-config.js';

/** One request's view of the Countly server, as each mode builds it. */
export interface ToolRequest {
  /** Axios client for this request's server and credentials. */
  client: AxiosInstance;
  /** This caller's app list cache. */
  appCache: AppCache;
  /** Query parameters a request needs for auth (standalone `auth_token`; none in library mode). */
  authParams: () => Record<string, string>;
  /** Detected server capabilities; null when unknown or detection is off. */
  capabilities: () => Promise<ServerCapabilities | null>;
  /** Whether detection is on. Off: an unknown server hides nothing. */
  autoDetect: boolean;
  /** Allowed operations per category (COUNTLY_TOOLS_*, or a library grant). */
  config: ToolsConfig;
  /** Extra filter applied on top: true hides the tool (library: admin-only, host plugins, unclassified). */
  hidden?: (name: string) => boolean;
}

/**
 * A tools configuration that allows the same operations in every category:
 * how library mode expresses a grant's operations, so both modes run the same
 * configuration checks.
 * @param operations - the operations allowed
 * @returns the configuration
 */
export function configForOperations(operations: readonly CrudOperation[]): ToolsConfig {
  const config: ToolsConfig = {};
  for (const category of Object.keys(TOOL_CATEGORIES)) {
    config[category] = new Set(operations);
  }
  return config;
}

/**
 * The apps this caller can see, from the cache or /o/apps/mine.
 * @param request - the request
 * @returns the apps
 */
export async function getApps(request: ToolRequest): Promise<CountlyApp[]> {
  if (!request.appCache.isExpired()) {
    return request.appCache.getAll();
  }
  const response = await request.client.get('/o/apps/mine', { params: request.authParams() });
  const apps = parseAppsMineResponse(response.data);
  request.appCache.update(apps);
  return apps;
}

/**
 * The context a tool instance runs with.
 * @param request - the request
 * @param onAppResolved - told the app id each resolveAppId call settles on
 * @returns the context
 */
export function toolContext(request: ToolRequest, onAppResolved?: (appId: string) => void): ToolContext {
  return {
    httpClient: request.client,
    appCache: request.appCache,
    getAuthParams: request.authParams,
    getApps: () => getApps(request),
    getServerCapabilities: request.capabilities,
    resolveAppId: async (args: any) => {
      const appId = args?.app_id ? String(args.app_id) : resolveAppIdentifier(args ?? {}, await getApps(request));
      onAppResolved?.(String(appId));
      return String(appId);
    },
  };
}

/**
 * tools/list: the configured tools, narrowed to what this server and user
 * support, with the /v2 definitions on Platform and the annotations.
 * @param request - the request
 * @returns the tool definitions to list
 */
export async function listTools(request: ToolRequest): Promise<any[]> {
  const configured = filterTools(getAllToolDefinitions(), request.config)
    .filter((tool) => !request.hidden?.(tool.name))
    .map((tool) => restrictToolArguments(tool, request.config));
  const caps = await request.capabilities();
  if (!caps) {
    // Detection off: every configured tool, as documented. Detection on but
    // inconclusive: hide only tools that certainly need the Platform /v2 API.
    return (request.autoDetect ? filterToolsByServer(configured, request.config, { plugins: null }) : configured)
      .map((tool) => withAnnotations(tool, request.config));
  }
  const overrides = caps.v2 ? getV2ToolDefinitionOverrides() : {};
  return filterToolsByServer(configured, request.config, caps).map((tool) => withAnnotations(
    overrides[tool.name] ? restrictToolArguments(overrides[tool.name], request.config) : tool,
    request.config
  ));
}

/** How a tools/call ended, for the caller's reporting. */
export type CallOutcome = 'success' | 'failed' | 'refused';

export interface CallResult {
  result: ToolResult;
  outcome: CallOutcome;
}

const refusal = (text: string): CallResult => ({ result: { content: [{ type: 'text', text }], isError: true }, outcome: 'refused' });

/**
 * Whether a tool is offered to this request at all (configured, not hidden).
 * @param request - the request
 * @param name - the tool
 * @returns true when it is
 */
export function isOffered(request: ToolRequest, name: string): boolean {
  return !request.hidden?.(name) && filterTools([{ name }], request.config).length === 1 && findRoute(name) !== undefined;
}

function findRoute(name: string): { toolClass: new (context: ToolContext) => any; methodName: string } | undefined {
  for (const metadata of getAllToolMetadata()) {
    const methodName = (metadata.handlers as Record<string, string>)[name];
    if (methodName) {
      return { toolClass: metadata.toolClass as unknown as new (context: ToolContext) => any, methodName };
    }
  }
  return undefined;
}

/**
 * tools/call: refuses what this server, user or configuration does not allow
 * (as an isError result the model can act on), then runs the tool. A tool
 * failure comes back as an isError result, as the MCP spec asks; only an
 * unknown (or hidden) tool is a protocol error.
 * @param request - the request
 * @param name - the tool
 * @param args - its arguments
 * @param context - from toolContext()
 * @returns the result and how it ended
 */
export async function callTool(
  request: ToolRequest,
  name: string,
  args: Record<string, unknown>,
  context: ToolContext
): Promise<CallResult> {
  if (!isOffered(request, name)) {
    throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
  }
  const caps = await request.capabilities();
  if (caps && !isToolPermitted(name, caps.member, caps.v2)) {
    return refusal(
      `Tool "${name}" is not available: it requires ${describeGuard(name, caps.v2)}, ` +
      'which the connected Countly user does not have.'
    );
  }
  if (request.autoDetect && V2_ONLY_TOOLS.has(name) && !caps?.v2) {
    return refusal(
      `Tool "${name}" is not available: it needs the Countly Platform /v2 API, ` +
      `which this server does not serve${caps ? ` (${describeCapabilities(caps)})` : ''}.`
    );
  }
  const requiredPlugin = getToolRequiredPlugin(name);
  if (requiredPlugin && caps && !isToolSupported(name, caps.plugins, caps.v2)) {
    return refusal(
      `Tool "${name}" is not available: it requires the "${requiredPlugin}" plugin, ` +
      (caps.pluginsAssumed
        ? `which is not in the default plugin set of ${describeCapabilities(caps)} ` +
          '(this token cannot list the server\'s plugins).'
        : `which is not enabled on this server (${describeCapabilities(caps)}).`)
    );
  }
  // Some arguments change what an allowed tool does (formulas_run with mode
  // "saved" persists the formula), so check them against the configuration.
  const argumentRefusal = getArgumentRefusal(name, args, request.config);
  if (argumentRefusal) {
    return refusal(argumentRefusal);
  }
  if (!isToolCallAllowed(name, args, request.config)) {
    return refusal(`Tool ${name} with these arguments needs an operation this connection does not allow.`);
  }

  const route = findRoute(name)!;
  try {
    const result: ToolResult = await new route.toolClass(context)[route.methodName](args);
    return { result, outcome: result && result.isError === true ? 'failed' : 'success' };
  } catch (error) {
    return {
      result: {
        content: [{ type: 'text', text: `Error executing tool ${name}: ${error instanceof Error ? error.message : String(error)}` }],
        isError: true,
      },
      outcome: 'failed',
    };
  }
}
