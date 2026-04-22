/**
 * Server Logs Tools
 * 
 * Tools for viewing server log files and their contents.
 * Only available in non-Docker deployments.
 * 
 * Requires: errorlogs plugin
 */

import { z } from 'zod';
import { safeApiCall } from '../lib/error-handler.js';
import type { ToolContext } from './types.js';

/**
 * Tool: server_logs_files_list
 * List available server log files
 */
export const listServerLogFilesTool = {
  name: 'server_logs_files_list',
  description: 'List server-side log files available via /o/errorlogs (api, dashboard, jobs, etc.) on non-Docker Countly deployments. Requires the errorlogs plugin. To read a log, use server_logs_contents.',
  inputSchema: z.object({
    app_id: z.string()
      .optional()
      .describe('Application ID. Either app_id or app_name must be provided; call apps_list first if you do not know it.'),
    app_name: z.string()
      .optional()
      .describe('Application name (alternative to app_id). Must match an existing app exactly; call apps_list to find valid names.'),
  }),
};

async function handleListServerLogFiles(args: z.infer<typeof listServerLogFilesTool.inputSchema>, context: ToolContext) {
  const app_id = await context.resolveAppId(args);

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
        type: 'text' as const,
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
  inputSchema: z.object({
    app_id: z.string()
      .optional()
      .describe('Application ID. Either app_id or app_name must be provided; call apps_list first if you do not know it.'),
    app_name: z.string()
      .optional()
      .describe('Application name (alternative to app_id). Must match an existing app exactly; call apps_list to find valid names.'),
    log: z.string()
      .describe('Log file name, e.g. "api", "dashboard", "jobs". Discover valid names via server_logs_files_list.'),
    bytes: z.number()
      .optional()
      .default(100000)
      .describe('Number of trailing bytes to return. Defaults to 100000. Larger values return more log history.'),
  }),
};

async function handleGetServerLogContents(args: z.infer<typeof getServerLogContentsTool.inputSchema>, context: ToolContext) {
  const app_id = await context.resolveAppId(args);

  const params = {
    ...context.getAuthParams(),
    app_id,
    log: args.log,
    bytes: args.bytes.toString(),
  };

  const response = await safeApiCall(
    () => context.httpClient.get('/o/errorlogs', { params }),
    `Failed to get contents of log file: ${args.log}`
  );

  return {
    content: [
      {
        type: 'text' as const,
        text: `Contents of log file "${args.log}" (${args.bytes} bytes) for app ${app_id}:\n\n${JSON.stringify(response.data, null, 2)}`,
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
  async listServerLogFiles(args: z.infer<typeof listServerLogFilesTool.inputSchema>) {
    return handleListServerLogFiles(args, this.context);
  }

  /**
   * Get contents of a specific server log file
   */
  async getServerLogContents(args: z.infer<typeof getServerLogContentsTool.inputSchema>) {
    return handleGetServerLogContents(args, this.context);
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
