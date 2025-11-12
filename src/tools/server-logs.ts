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
 * Tool: list_server_log_files
 * List available server log files
 */
export const listServerLogFilesTool = {
  name: 'list_server_log_files',
  description: 'List available server log files. Only available in non-Docker deployments. Returns list of log files that can be viewed.',
  inputSchema: z.object({
    app_id: z.string()
      .optional()
      .describe('Application ID (optional if app_name is provided)'),
    app_name: z.string()
      .optional()
      .describe('Application name (alternative to app_id)'),
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
 * Tool: get_server_log_contents
 * Get contents of a specific server log file
 */
export const getServerLogContentsTool = {
  name: 'get_server_log_contents',
  description: 'Get contents of a specific server log file. Only available in non-Docker deployments. Retrieve log entries for debugging and monitoring.',
  inputSchema: z.object({
    app_id: z.string()
      .optional()
      .describe('Application ID (optional if app_name is provided)'),
    app_name: z.string()
      .optional()
      .describe('Application name (alternative to app_id)'),
    log: z.string()
      .describe('Log file name to retrieve (e.g., "api", "dashboard", "jobs"). Use list_server_log_files to see available logs.'),
    bytes: z.number()
      .optional()
      .default(100000)
      .describe('Number of bytes to retrieve from the log file (default: 100000). Larger values return more log content.'),
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
  [listServerLogFilesTool.name]: handleListServerLogFiles,
  [getServerLogContentsTool.name]: handleGetServerLogContents,
};

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
