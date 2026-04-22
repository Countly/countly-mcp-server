import { ToolContext, ToolResult } from './types.js';
import { safeApiCall } from '../lib/error-handler.js';

// ============================================================================
// GET_SDK_STATS TOOL
// ============================================================================

export const getSDKStatsToolDefinition = {
  name: 'sdk_stats_get',
  description: 'Get per-SDK usage statistics for an app (SDK names, versions, request-type breakdown, health checks) via /o?method=sdks. Requires the sdks plugin. For the SDK configuration sent back to clients use sdk_config_get.',
  inputSchema: {
    type: 'object',
    properties: {
      app_id: { type: 'string', description: 'Application ID. Either app_id or app_name must be provided; call apps_list first if you do not know it.' },
      app_name: { type: 'string', description: 'Application name (alternative to app_id). Must match an existing app exactly; call apps_list to find valid names.' },
      period: {
        type: 'string',
        description: 'Time period. One of "month", "60days", "30days", "7days", "yesterday", "hour", or a custom range as [startMilliseconds,endMilliseconds]. Defaults to "30days".',
        default: '30days'
      },
    },
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
  name: 'sdk_config_get',
  description: 'Get the SDK configuration object Countly serves to client SDKs for this app (feature flags, tracking toggles, rate limits) via /o?method=sdk-config. Requires the sdks plugin. For per-SDK traffic stats use sdk_stats_get.',
  inputSchema: {
    type: 'object',
    properties: {
      app_id: { type: 'string', description: 'Application ID. Either app_id or app_name must be provided; call apps_list first if you do not know it.' },
      app_name: { type: 'string', description: 'Application name (alternative to app_id). Must match an existing app exactly; call apps_list to find valid names.' },
    },
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
  'sdk_stats_get': 'sdk_stats_get',
  'sdk_config_get': 'sdk_config_get',
} as const;

// ============================================================================
// TOOL CLASS
// ============================================================================

export class SDKsTools {
  constructor(private context: ToolContext) {}

  async sdk_stats_get(args: any): Promise<ToolResult> {
    return handleGetSDKStats(this.context, args);
  }

  async sdk_config_get(args: any): Promise<ToolResult> {
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
