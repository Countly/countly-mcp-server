import { ToolContext, ToolResult } from './types.js';
import { safeApiCall } from '../lib/error-handler.js';

// ============================================================================
// GET_SDK_STATS TOOL
// ============================================================================

export const getSDKStatsToolDefinition = {
  name: 'get_sdk_stats',
  description: 'Get statistics about SDKs sending data to the server. Shows SDK names, versions, request type breakdown, and health check information.',
  inputSchema: {
    type: 'object',
    properties: {
      app_id: { type: 'string', description: 'Application ID (optional if app_name is provided)' },
      app_name: { type: 'string', description: 'Application name (alternative to app_id)' },
      period: { 
        type: 'string', 
        description: 'Time period for data. Possible values: "month", "60days", "30days", "7days", "yesterday", "hour", or custom range as [startMilliseconds,endMilliseconds]',
        default: '30days'
      },
    },
    anyOf: [
      { required: ['app_id'] },
      { required: ['app_name'] }
    ],
  },
};

export async function handleGetSDKStats(context: ToolContext, args: any): Promise<ToolResult> {
  const app_id = await context.resolveAppId(args);
  const period = args.period || '30days';

  const params = {
    ...context.getAuthParams(),
    app_id,
    method: 'sdks',
    period,
  };

  const response = await safeApiCall(
    () => context.httpClient.get('/o', { params }),
    'Failed to get SDK statistics'
  );

  return {
    content: [
      {
        type: 'text',
        text: `SDK statistics for app ${app_id} (period: ${period}):\n\n${JSON.stringify(response.data, null, 2)}`,
      },
    ],
  };
}

// ============================================================================
// GET_SDK_CONFIG TOOL
// ============================================================================

export const getSDKConfigToolDefinition = {
  name: 'get_sdk_config',
  description: 'Get SDK configuration settings passed to SDKs to control their behavior. Shows enabled features, tracking settings, and other SDK control parameters.',
  inputSchema: {
    type: 'object',
    properties: {
      app_id: { type: 'string', description: 'Application ID (optional if app_name is provided)' },
      app_name: { type: 'string', description: 'Application name (alternative to app_id)' },
    },
    anyOf: [
      { required: ['app_id'] },
      { required: ['app_name'] }
    ],
  },
};

export async function handleGetSDKConfig(context: ToolContext, args: any): Promise<ToolResult> {
  const app_id = await context.resolveAppId(args);

  const params = {
    ...context.getAuthParams(),
    app_id,
    method: 'sdk-config',
  };

  const response = await safeApiCall(
    () => context.httpClient.get('/o', { params }),
    'Failed to get SDK configuration'
  );

  return {
    content: [
      {
        type: 'text',
        text: `SDK configuration for app ${app_id}:\n\n${JSON.stringify(response.data, null, 2)}`,
      },
    ],
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export const sdksToolDefinitions = [
  getSDKStatsToolDefinition,
  getSDKConfigToolDefinition,
];

export const sdksToolHandlers = {
  get_sdk_stats: handleGetSDKStats,
  get_sdk_config: handleGetSDKConfig,
};

// ============================================================================
// TOOL CLASS
// ============================================================================

export class SDKsTools {
  constructor(private context: ToolContext) {}

  async get_sdk_stats(args: any): Promise<ToolResult> {
    return handleGetSDKStats(this.context, args);
  }

  async get_sdk_config(args: any): Promise<ToolResult> {
    return handleGetSDKConfig(this.context, args);
  }
}

// ============================================================================
// METADATA
// ============================================================================

export const sdksToolMetadata = {
  instanceKey: 'sdks',
  toolClass: SDKsTools,
  handlers: sdksToolHandlers,
} as const;
