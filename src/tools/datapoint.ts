/**
 * Datapoint Tools
 *
 * Tools for monitoring data point collection and server statistics.
 * Data points are a measure of collected data and are often tied to server specs and billing.
 *
 * Requires: server-stats plugin
 */

import { safeApiCall } from '../lib/error-handler.js';
import { withDefault } from '../lib/validation.js';
import type { ToolContext, ToolResult } from './types.js';

/**
 * Tool: datapoints_stats
 * Get amount of data points collected per app per datapoint type
 */
export const getDatapointStatisticsTool = {
  name: 'datapoints_stats',
  description: 'Get data-point counts per app per datapoint type (the billing/usage metric) via /o/server-stats/data-points. Requires the server-stats plugin. For a ranked view use datapoints_top_apps; for hourly load pattern use datapoints_punch_card.',
  inputSchema: {
    type: 'object',
    properties: {
      period: {
        type: 'string',
        description: 'Time period. One of "month", "60days", "30days", "7days", "yesterday", "hour", or a custom range as [startMilliseconds,endMilliseconds] (e.g. "[1417730400000,1420149600000]"). Defaults to "30days".',
        default: '30days',
      },
      selected_app: {
        type: 'string',
        description: 'Optional comma-separated app IDs to restrict results (e.g. "app_id1,app_id2"). Omit for all apps the caller can see.',
      },
    },
  },
};

export async function handleGetDatapointStatistics(
  context: ToolContext,
  input: Record<string, unknown>
): Promise<ToolResult> {
  const period = withDefault(input.period as string | undefined, '30days');
  const selected_app = input.selected_app as string | undefined;

  const params: Record<string, string> = {
    ...context.getAuthParams(),
    period,
  };

  if (selected_app) {
    params.selected_app = selected_app;
  }

  const response = await safeApiCall(
    () => context.httpClient.get('/o/server-stats/data-points', { params }),
    'Failed to get datapoint statistics'
  );

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(response.data, null, 2),
      },
    ],
  };
}

/**
 * Tool: datapoints_top_apps
 * Get top apps with their data points
 */
export const getTopDatapointAppsTool = {
  name: 'datapoints_top_apps',
  description: 'Rank apps by data-point volume over a period via /o/server-stats/top. Requires the server-stats plugin. For the full per-type breakdown use datapoints_stats.',
  inputSchema: {
    type: 'object',
    properties: {
      period: {
        type: 'string',
        description: 'Time period. One of "month", "60days", "30days", "7days", "yesterday", "hour", or a custom range as [startMilliseconds,endMilliseconds]. Defaults to "30days".',
        default: '30days',
      },
    },
  },
};

export async function handleGetTopDatapointApps(
  context: ToolContext,
  input: Record<string, unknown>
): Promise<ToolResult> {
  const period = withDefault(input.period as string | undefined, '30days');

  const params = {
    ...context.getAuthParams(),
    period,
  };

  const response = await safeApiCall(
    () => context.httpClient.get('/o/server-stats/top', { params }),
    'Failed to get top datapoint apps'
  );

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(response.data, null, 2),
      },
    ],
  };
}

/**
 * Tool: datapoints_punch_card
 * Get hourly datapoint breakdown punchcard to check for server load patterns
 */
export const getDatapointPunchCardTool = {
  name: 'datapoints_punch_card',
  description: 'Get a weekday x hour punch-card of data-point volume (load distribution across the week) via /o/server-stats/punch-card. Requires the server-stats plugin. Useful for spotting peak hours.',
  inputSchema: {
    type: 'object',
    properties: {
      period: {
        type: 'string',
        description: 'Time period. One of "month", "60days", "30days", "7days", "yesterday", "hour", or a custom range as [startMilliseconds,endMilliseconds]. Defaults to "30days".',
        default: '30days',
      },
    },
  },
};

export async function handleGetDatapointPunchCard(
  context: ToolContext,
  input: Record<string, unknown>
): Promise<ToolResult> {
  const period = withDefault(input.period as string | undefined, '30days');

  const params = {
    ...context.getAuthParams(),
    period,
  };

  const response = await safeApiCall(
    () => context.httpClient.get('/o/server-stats/punch-card', { params }),
    'Failed to get datapoint punch card'
  );

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(response.data, null, 2),
      },
    ],
  };
}

/**
 * Export all datapoint tool definitions
 */
export const datapointToolDefinitions = [
  getDatapointStatisticsTool,
  getTopDatapointAppsTool,
  getDatapointPunchCardTool,
];

/**
 * Export tool handlers map
 */
export const datapointToolHandlers = {
  'datapoints_stats': 'getDatapointStatistics',
  'datapoints_top_apps': 'getTopDatapointApps',
  'datapoints_punch_card': 'getDatapointPunchCard',
} as const;

/**
 * Datapoint Tools Class
 * Provides methods for monitoring data point collection and server load
 */
export class DatapointTools {
  constructor(private context: ToolContext) {}

  /**
   * Get data points collected per app per datapoint type
   */
  async getDatapointStatistics(args: any): Promise<ToolResult> {
    return handleGetDatapointStatistics(this.context, args);
  }

  /**
   * Get top apps by data point collection
   */
  async getTopDatapointApps(args: any): Promise<ToolResult> {
    return handleGetTopDatapointApps(this.context, args);
  }

  /**
   * Get hourly datapoint breakdown punchcard
   */
  async getDatapointPunchCard(args: any): Promise<ToolResult> {
    return handleGetDatapointPunchCard(this.context, args);
  }
}

/**
 * Export metadata for dynamic tool routing
 */
export const datapointToolMetadata = {
  instanceKey: 'datapoint',
  toolClass: DatapointTools,
  handlers: datapointToolHandlers,
};
