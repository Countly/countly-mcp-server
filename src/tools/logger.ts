import { ToolContext, ToolResult } from './types.js';
import { safeApiCall } from '../lib/error-handler.js';

// ============================================================================
// LIST_SDK_LOGS TOOL
// ============================================================================

export const listSDKLogsToolDefinition = {
  name: 'list_sdk_logs',
  description: 'List incoming data logs sent by SDK to the server. Shows raw SDK requests and responses for debugging and monitoring purposes.',
  inputSchema: {
    type: 'object',
    properties: {
      app_id: { type: 'string', description: 'Application ID (optional if app_name is provided)' },
      app_name: { type: 'string', description: 'Application name (alternative to app_id)' },
      filter: { 
        type: 'object', 
        description: 'MongoDB query filter as object (optional). Example: {"device_id": "user123"} to filter by device, {"timestamp": {"$gte": 1234567890}} for time range',
        default: {}
      },
    },
    anyOf: [
      { required: ['app_id'] },
      { required: ['app_name'] }
    ],
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
  list_sdk_logs: handleListSDKLogs,
};

// ============================================================================
// TOOL CLASS
// ============================================================================

export class LoggerTools {
  constructor(private context: ToolContext) {}

  async list_sdk_logs(args: any): Promise<ToolResult> {
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
