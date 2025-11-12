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
// JOBS TOOLS
// ============================================================================

export const listJobsToolDefinition = {
  name: 'list_jobs',
  description: 'List all background jobs running on the Countly server with pagination and sorting options',
  inputSchema: {
    type: 'object',
    properties: {
      app_id: {
        type: 'string',
        description: 'Application ID (optional if app_name is provided)',
      },
      app_name: {
        type: 'string',
        description: 'Application name (alternative to app_id)',
      },
      skip: {
        type: 'number',
        description: 'Number of records to skip for pagination (iDisplayStart)',
        default: 0,
      },
      limit: {
        type: 'number',
        description: 'Maximum number of records to return (iDisplayLength)',
        default: 10,
      },
      sort_column: {
        type: 'number',
        description: 'Column index to sort by (iSortCol_0)',
        default: 0,
      },
      sort_direction: {
        type: 'string',
        description: 'Sort direction: "asc" or "desc" (sSortDir_0)',
        enum: ['asc', 'desc'],
        default: 'asc',
      },
    },
    required: [],
  },
};

export async function handleListJobs(context: ToolContext, args: any): Promise<ToolResult> {
  const app_id = await context.resolveAppId(args);

  const params = {
    ...context.getAuthParams(),
    app_id,
    method: 'jobs',
    iDisplayStart: args.skip || 0,
    iDisplayLength: args.limit || 10,
    iSortCol_0: args.sort_column || 0,
    sSortDir_0: args.sort_direction || 'asc',
    ready: 'true',
    sEcho: '0',
  };

  const response = await safeApiCall(
    () => context.httpClient.get('/o', { params }),
    'Failed to list jobs'
  );

  return {
    content: [
      {
        type: 'text',
        text: `Jobs for app ${app_id}:\n\n${JSON.stringify(response.data, null, 2)}`,
      },
    ],
  };
}

export const getJobRunsToolDefinition = {
  name: 'get_job_runs',
  description: 'Get run history and details for a specific background job by name',
  inputSchema: {
    type: 'object',
    properties: {
      app_id: {
        type: 'string',
        description: 'Application ID (optional if app_name is provided)',
      },
      app_name: {
        type: 'string',
        description: 'Application name (alternative to app_id)',
      },
      job_name: {
        type: 'string',
        description: 'Job name to get run history for (e.g., "active_users:generate_active_users")',
      },
      skip: {
        type: 'number',
        description: 'Number of records to skip for pagination (iDisplayStart)',
        default: 0,
      },
      limit: {
        type: 'number',
        description: 'Maximum number of records to return (iDisplayLength)',
        default: 10,
      },
      sort_column: {
        type: 'number',
        description: 'Column index to sort by (iSortCol_0)',
        default: 2,
      },
      sort_direction: {
        type: 'string',
        description: 'Sort direction: "asc" or "desc" (sSortDir_0)',
        enum: ['asc', 'desc'],
        default: 'desc',
      },
    },
    required: ['job_name'],
  },
};

export async function handleGetJobRuns(context: ToolContext, args: any): Promise<ToolResult> {
  const app_id = await context.resolveAppId(args);

  const params = {
    ...context.getAuthParams(),
    app_id,
    method: 'jobs',
    name: args.job_name,
    iDisplayStart: args.skip || 0,
    iDisplayLength: args.limit || 10,
    iSortCol_0: args.sort_column !== undefined ? args.sort_column : 2,
    sSortDir_0: args.sort_direction || 'desc',
    ready: 'true',
    sEcho: '0',
  };

  const response = await safeApiCall(
    () => context.httpClient.get('/o', { params }),
    `Failed to get runs for job: ${args.job_name}`
  );

  return {
    content: [
      {
        type: 'text',
        text: `Run history for job "${args.job_name}" (app ${app_id}):\n\n${JSON.stringify(response.data, null, 2)}`,
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
  listJobsToolDefinition,
  getJobRunsToolDefinition,
];

export const coreToolHandlers = {
  'ping': 'handlePing',
  'get_version': 'handleGetVersion',
  'get_plugins': 'handleGetPlugins',
  'search': 'handleSearch',
  'fetch': 'handleFetch',
  'list_jobs': 'handleListJobs',
  'get_job_runs': 'handleGetJobRuns',
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

  async list_jobs(args: any): Promise<ToolResult> {
    return handleListJobs(this.context, args);
  }

  async get_job_runs(args: any): Promise<ToolResult> {
    return handleGetJobRuns(this.context, args);
  }
}

// Metadata for dynamic routing (must be after class declaration)
export const coreToolMetadata = {
  instanceKey: 'core',
  toolClass: CoreTools,
  handlers: coreToolHandlers,
} as const;
