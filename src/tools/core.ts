import { ToolContext, ToolResult } from './types.js';
import { safeApiCall } from '../lib/error-handler.js';

// ============================================================================
// PING TOOL
// ============================================================================

export const pingToolDefinition = {
  name: 'ping',
  description: 'Ping the Countly server (/o/ping) to verify it is reachable and responding. Takes no arguments. Use as a quick liveness check before running other tools.',
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
  description: 'Return the Countly server version string and edition via /o/system/version. Takes no arguments.',
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
  description: 'List plugins currently enabled on the Countly server via /o/system/plugins. Takes no arguments. Use this to confirm a plugin is available before calling tools that require it (e.g. drill, crashes, cohorts).',
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
// JOBS TOOLS
// ============================================================================

export const listJobsToolDefinition = {
  name: 'jobs_list',
  description: 'List background/scheduled jobs known to the Countly server (name, schedule, last run, status) via /o?method=jobs. For per-job run history use job_runs.',
  inputSchema: {
    type: 'object',
    properties: {
      app_id: {
        type: 'string',
        description: 'Application ID. Either app_id or app_name must be provided; call apps_list first if you do not know it.',
      },
      app_name: {
        type: 'string',
        description: 'Application name (alternative to app_id). Must match an existing app exactly; call apps_list to find valid names.',
      },
      skip: {
        type: 'number',
        description: 'Number of records to skip for pagination (maps to iDisplayStart). Defaults to 0.',
        default: 0,
      },
      limit: {
        type: 'number',
        description: 'Maximum number of records to return (maps to iDisplayLength). Defaults to 10.',
        default: 10,
      },
      sort_column: {
        type: 'number',
        description: 'Zero-based column index to sort by (maps to iSortCol_0). Defaults to 0.',
        default: 0,
      },
      sort_direction: {
        type: 'string',
        description: 'Sort direction (maps to sSortDir_0). Defaults to "asc".',
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
  name: 'job_runs',
  description: 'Get run history (start, end, status, duration) for a specific background job by name via /o?method=jobs. To discover job names use jobs_list.',
  inputSchema: {
    type: 'object',
    properties: {
      app_id: {
        type: 'string',
        description: 'Application ID. Either app_id or app_name must be provided; call apps_list first if you do not know it.',
      },
      app_name: {
        type: 'string',
        description: 'Application name (alternative to app_id). Must match an existing app exactly; call apps_list to find valid names.',
      },
      job_name: {
        type: 'string',
        description: 'Exact job name to fetch runs for (e.g. "active_users:generate_active_users"). Obtain it from jobs_list.',
      },
      skip: {
        type: 'number',
        description: 'Number of records to skip for pagination (maps to iDisplayStart). Defaults to 0.',
        default: 0,
      },
      limit: {
        type: 'number',
        description: 'Maximum number of records to return (maps to iDisplayLength). Defaults to 10.',
        default: 10,
      },
      sort_column: {
        type: 'number',
        description: 'Zero-based column index to sort by (maps to iSortCol_0). Defaults to 2.',
        default: 2,
      },
      sort_direction: {
        type: 'string',
        description: 'Sort direction (maps to sSortDir_0). Defaults to "desc".',
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
  listJobsToolDefinition,
  getJobRunsToolDefinition,
];

export const coreToolHandlers = {
  'ping': 'ping',
  'get_version': 'get_version',
  'get_plugins': 'get_plugins',
  'jobs_list': 'jobs_list',
  'job_runs': 'job_runs',
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

  async jobs_list(args: any): Promise<ToolResult> {
    return handleListJobs(this.context, args);
  }

  async job_runs(args: any): Promise<ToolResult> {
    return handleGetJobRuns(this.context, args);
  }
}

// Metadata for dynamic routing (must be after class declaration)
export const coreToolMetadata = {
  instanceKey: 'core',
  toolClass: CoreTools,
  handlers: coreToolHandlers,
} as const;
