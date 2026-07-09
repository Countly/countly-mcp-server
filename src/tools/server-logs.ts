/**
 * Server Logs Tools
 *
 * Tools for viewing server log files and their contents.
 * Only available in non-Docker deployments.
 *
 * Requires: errorlogs plugin
 */

import { safeApiCall } from '../lib/error-handler.js';
import { withDefault } from '../lib/validation.js';
import type { ToolContext, ToolResult } from './types.js';

/**
 * Tool: server_logs_files_list
 * List available server log files
 */
export const listServerLogFilesTool = {
  name: 'server_logs_files_list',
  description: 'List server-side log files available via /o/errorlogs (api, dashboard, jobs, etc.) on non-Docker Countly deployments. Requires the errorlogs plugin. To read a log, use server_logs_contents.',
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
    },
  },
};

export async function handleListServerLogFiles(
  context: ToolContext,
  input: Record<string, unknown>
): Promise<ToolResult> {
  const app_id = await context.resolveAppId(input);

  const params = {
    ...context.getAuthParams(),
    app_id,
    bytes: '1', // Minimal bytes to just get the list of available log files
  };

  const response = await safeApiCall(
    () => context.httpClient.get('/o/errorlogs', { params }),
    'Failed to list server log files'
  );

  return {
    content: [
      {
        type: 'text',
        text: `Available server log files for app ${app_id}:\n\n${JSON.stringify(response.data, null, 2)}`,
      },
    ],
  };
}

/**
 * Tool: server_logs_contents
 * Get contents of a specific server log file
 */
export const getServerLogContentsTool = {
  name: 'server_logs_contents',
  description: 'Read the tail of a Countly server log file via /o/errorlogs. Returns up to "bytes" bytes for debugging. Requires the errorlogs plugin (non-Docker deployments only). Not to be confused with sdk_logs_list (SDK request logs).',
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
      log: {
        type: 'string',
        description: 'Log file name, e.g. "api", "dashboard", "jobs". Discover valid names via server_logs_files_list.',
      },
      bytes: {
        type: 'number',
        description: 'Number of trailing bytes to return. Defaults to 100000. Larger values return more log history.',
        default: 100000,
      },
    },
    required: ['log'],
  },
};

export async function handleGetServerLogContents(
  context: ToolContext,
  input: Record<string, unknown>
): Promise<ToolResult> {
  const log = input.log as string;
  const bytes = withDefault(input.bytes as number | undefined, 100000);

  const app_id = await context.resolveAppId(input);

  const params = {
    ...context.getAuthParams(),
    app_id,
    log,
    bytes: bytes.toString(),
  };

  const response = await safeApiCall(
    () => context.httpClient.get('/o/errorlogs', { params }),
    `Failed to get contents of log file: ${log}`
  );

  return {
    content: [
      {
        type: 'text',
        text: `Contents of log file "${log}" (${bytes} bytes) for app ${app_id}:\n\n${JSON.stringify(response.data, null, 2)}`,
      },
    ],
  };
}

/**
 * Export all server logs tool definitions
 */
export const serverLogsToolDefinitions = [
  listServerLogFilesTool,
  getServerLogContentsTool,
];

/**
 * Export tool handlers map
 */
export const serverLogsToolHandlers = {
  'server_logs_files_list': 'listServerLogFiles',
  'server_logs_contents': 'getServerLogContents',
} as const;

/**
 * Server Logs Tools Class
 * Provides methods for viewing server log files
 */
export class ServerLogsTools {
  constructor(private context: ToolContext) {}

  /**
   * List available server log files
   */
  async listServerLogFiles(args: any): Promise<ToolResult> {
    return handleListServerLogFiles(this.context, args);
  }

  /**
   * Get contents of a specific server log file
   */
  async getServerLogContents(args: any): Promise<ToolResult> {
    return handleGetServerLogContents(this.context, args);
  }
}

/**
 * Export metadata for dynamic tool routing
 */
export const serverLogsToolMetadata = {
  instanceKey: 'server_logs',
  toolClass: ServerLogsTools,
  handlers: serverLogsToolHandlers,
};
