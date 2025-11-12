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
// SEARCH TOOL
// ============================================================================

export const searchToolDefinition = {
  name: 'search',
  description: 'Search for relevant content in Countly data sources (required for ChatGPT Connectors)',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Search query string' },
    },
    required: ['query'],
  },
};

export async function handleSearch(context: ToolContext, args: any): Promise<ToolResult> {
  const { query } = args;
  
  // Search across multiple Countly data sources
  const apps = context.appCache.getAll();
  const appResults = apps.filter(app => 
    app.name.toLowerCase().includes(query.toLowerCase())
  );
  
  return {
    content: [
      {
        type: 'text',
        text: `Search results for "${query}":\n${JSON.stringify({ apps: appResults }, null, 2)}`,
      },
    ],
  };
}

// ============================================================================
// FETCH TOOL
// ============================================================================

export const fetchToolDefinition = {
  name: 'fetch',
  description: 'Retrieve the full contents of a specific document or data item (required for ChatGPT Connectors)',
  inputSchema: {
    type: 'object',
    properties: {
      id: { type: 'string', description: 'Unique identifier for the document or data item' },
    },
    required: ['id'],
  },
};

export async function handleFetch(context: ToolContext, args: any): Promise<ToolResult> {
  const { id } = args;
  
  // Fetch specific document by ID
  const apps = context.appCache.getAll();
  const app = apps.find(a => a._id === id);
  
  if (!app) {
    return {
      content: [
        {
          type: 'text',
          text: `Document with ID "${id}" not found`,
        },
      ],
    };
  }
  
  return {
    content: [
      {
        type: 'text',
        text: `Document ${id}:\n${JSON.stringify(app, null, 2)}`,
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
  searchToolDefinition,
  fetchToolDefinition,
];

export const coreToolHandlers = {
  'ping': 'handlePing',
  'get_version': 'handleGetVersion',
  'get_plugins': 'handleGetPlugins',
  'search': 'handleSearch',
  'fetch': 'handleFetch',
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

  async search(args: any): Promise<ToolResult> {
    return handleSearch(this.context, args);
  }

  async fetch(args: any): Promise<ToolResult> {
    return handleFetch(this.context, args);
  }
}

// Metadata for dynamic routing (must be after class declaration)
export const coreToolMetadata = {
  instanceKey: 'core',
  toolClass: CoreTools,
  handlers: coreToolHandlers,
} as const;
