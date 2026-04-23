import { ToolContext, ToolResult } from './types.js';
import { safeApiCall } from '../lib/error-handler.js';

// ============================================================================
// LIST_SDK_LOGS TOOL
// ============================================================================

export const listSDKLogsToolDefinition = {
  name: 'sdk_logs_list',
  description: 'List raw incoming SDK request/response log entries for an app via /o?method=logs. Used for debugging SDK payloads (device_id, timestamp, payload). Requires the logger plugin. For server-side errors use server_logs_files_list.',
  inputSchema: {
    type: 'object',
    properties: {
      app_id: { type: 'string', description: 'Application ID. Either app_id or app_name must be provided; call apps_list first if you do not know it.' },
      app_name: { type: 'string', description: 'Application name (alternative to app_id). Must match an existing app exactly; call apps_list to find valid names.' },
      filter: {
        type: 'object',
        description: 'MongoDB query to filter logs. Examples: {"device_id":"user123"}, {"timestamp":{"$gte":1234567890}}. Defaults to {} (no filter).',
        default: {}
      },
    },
  },
};

export async function handleListSDKLogs(context: ToolContext, args: any): Promise<ToolResult> {
  const app_id = await context.resolveAppId(args);
  
  // Default to empty filter if not provided
  const filter = args.filter || {};

  const params = {
    ...context.getAuthParams(),
    app_id,
    method: 'logs',
    filter: JSON.stringify(filter),
  };

  const response = await safeApiCall(
    () => context.httpClient.get('/o', { params }),
    'Failed to list SDK logs'
  );

  return {
    content: [
      {
        type: 'text',
        text: `SDK logs for app ${app_id}:\n\n${JSON.stringify(response.data, null, 2)}`,
      },
    ],
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export const loggerToolDefinitions = [
  listSDKLogsToolDefinition,
];

export const loggerToolHandlers = {
  'sdk_logs_list': 'sdk_logs_list',
} as const;

// ============================================================================
// TOOL CLASS
// ============================================================================

export class LoggerTools {
  constructor(private context: ToolContext) {}

  async sdk_logs_list(args: any): Promise<ToolResult> {
    return handleListSDKLogs(this.context, args);
  }
}

// ============================================================================
// METADATA
// ============================================================================

export const loggerToolMetadata = {
  instanceKey: 'logger',
  toolClass: LoggerTools,
  handlers: loggerToolHandlers,
} as const;
