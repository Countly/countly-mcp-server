import { ToolContext, ToolResult } from './types.js';
import { safeApiCall } from '../lib/error-handler.js';

// ============================================================================
// PING TOOL
// ============================================================================

export const pingToolDefinition = {
  name: 'ping',
  description: 'Check if Countly server is healthy and reachable',
  inputSchema: {
    type: 'object',
    properties: {},
    required: [],
  },
};

export async function handlePing(context: ToolContext, _args: any): Promise<ToolResult> {
  const response = await safeApiCall(
    () => context.httpClient.get('/o/ping'),
    'Failed to ping server'
  );

  return {
    content: [
      {
        type: 'text',
        text: `Server ping response:\n${JSON.stringify(response.data, null, 2)}`,
      },
    ],
  };
}

// ============================================================================
// VERSION TOOL
// ============================================================================

export const versionToolDefinition = {
  name: 'get_version',
  description: 'Check what version of Countly is running on the server',
  inputSchema: {
    type: 'object',
    properties: {},
    required: [],
  },
};

export async function handleGetVersion(context: ToolContext, _args: any): Promise<ToolResult> {
  const response = await safeApiCall(
    () => context.httpClient.get('/o/system/version'),
    'Failed to get server version'
  );

  return {
    content: [
      {
        type: 'text',
        text: `Server version:\n${JSON.stringify(response.data, null, 2)}`,
      },
    ],
  };
}

// ============================================================================
// PLUGINS TOOL
// ============================================================================

export const pluginsToolDefinition = {
  name: 'get_plugins',
  description: 'Check what plugins are enabled on the Countly server',
  inputSchema: {
    type: 'object',
    properties: {},
    required: [],
  },
};

export async function handleGetPlugins(context: ToolContext, _args: any): Promise<ToolResult> {
  const response = await safeApiCall(
    () => context.httpClient.get('/o/system/plugins'),
    'Failed to get server plugins'
  );

  return {
    content: [
      {
        type: 'text',
        text: `Enabled plugins:\n${JSON.stringify(response.data, null, 2)}`,
      },
    ],
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export const coreToolDefinitions = [
  pingToolDefinition,
  versionToolDefinition,
  pluginsToolDefinition,
];

export const coreToolHandlers = {
  'ping': 'ping',
  'get_version': 'get_version',
  'get_plugins': 'get_plugins',
} as const;

export class CoreTools {
  constructor(private context: ToolContext) {}

  async ping(args: any): Promise<ToolResult> {
    return handlePing(this.context, args);
  }

  async get_version(args: any): Promise<ToolResult> {
    return handleGetVersion(this.context, args);
  }

  async get_plugins(args: any): Promise<ToolResult> {
    return handleGetPlugins(this.context, args);
  }
}

// Metadata for dynamic routing (must be after class declaration)
export const coreToolMetadata = {
  instanceKey: 'core',
  toolClass: CoreTools,
  handlers: coreToolHandlers,
} as const;
