/**
 * Datapoint Tools
 * 
 * Tools for monitoring data point collection and server statistics.
 * Data points are a measure of collected data and are often tied to server specs and billing.
 * 
 * Requires: server-stats plugin
 */

import { z } from 'zod';
import { safeApiCall } from '../lib/error-handler.js';
import type { ToolContext } from './types.js';

/**
 * Tool: datapoints_stats
 * Get amount of data points collected per app per datapoint type
 */
export const getDatapointStatisticsTool = {
  name: 'datapoints_stats',
  description: 'Get data-point counts per app per datapoint type (the billing/usage metric) via /o/server-stats/data-points. Requires the server-stats plugin. For a ranked view use datapoints_top_apps; for hourly load pattern use datapoints_punch_card.',
  inputSchema: z.object({
    period: z.string()
      .optional()
      .default('30days')
      .describe('Time period. One of "month", "60days", "30days", "7days", "yesterday", "hour", or a custom range as [startMilliseconds,endMilliseconds] (e.g. "[1417730400000,1420149600000]"). Defaults to "30days".'),
    selected_app: z.string()
      .optional()
      .describe('Optional comma-separated app IDs to restrict results (e.g. "app_id1,app_id2"). Omit for all apps the caller can see.'),
  }),
};

async function handleGetDatapointStatistics(args: z.infer<typeof getDatapointStatisticsTool.inputSchema>, context: ToolContext) {
  const params: Record<string, string> = {
    ...context.getAuthParams(),
    period: args.period,
  };

  if (args.selected_app) {
    params.selected_app = args.selected_app;
  }

  const response = await safeApiCall(
    () => context.httpClient.get('/o/server-stats/data-points', { params }),
    'Failed to get datapoint statistics'
  );

  return {
    content: [
      {
        type: 'text' as const,
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
  inputSchema: z.object({
    period: z.string()
      .optional()
      .default('30days')
      .describe('Time period. One of "month", "60days", "30days", "7days", "yesterday", "hour", or a custom range as [startMilliseconds,endMilliseconds]. Defaults to "30days".'),
  }),
};

async function handleGetTopDatapointApps(args: z.infer<typeof getTopDatapointAppsTool.inputSchema>, context: ToolContext) {
  const params = {
    ...context.getAuthParams(),
    period: args.period,
  };

  const response = await safeApiCall(
    () => context.httpClient.get('/o/server-stats/top', { params }),
    'Failed to get top datapoint apps'
  );

  return {
    content: [
      {
        type: 'text' as const,
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
  inputSchema: z.object({
    period: z.string()
      .optional()
      .default('30days')
      .describe('Time period. One of "month", "60days", "30days", "7days", "yesterday", "hour", or a custom range as [startMilliseconds,endMilliseconds]. Defaults to "30days".'),
  }),
};

async function handleGetDatapointPunchCard(args: z.infer<typeof getDatapointPunchCardTool.inputSchema>, context: ToolContext) {
  const params = {
    ...context.getAuthParams(),
    period: args.period,
  };

  const response = await safeApiCall(
    () => context.httpClient.get('/o/server-stats/punch-card', { params }),
    'Failed to get datapoint punch card'
  );

  return {
    content: [
      {
        type: 'text' as const,
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
  async getDatapointStatistics(args: z.infer<typeof getDatapointStatisticsTool.inputSchema>) {
    return handleGetDatapointStatistics(args, this.context);
  }

  /**
   * Get top apps by data point collection
   */
  async getTopDatapointApps(args: z.infer<typeof getTopDatapointAppsTool.inputSchema>) {
    return handleGetTopDatapointApps(args, this.context);
  }

  /**
   * Get hourly datapoint breakdown punchcard
   */
  async getDatapointPunchCard(args: z.infer<typeof getDatapointPunchCardTool.inputSchema>) {
    return handleGetDatapointPunchCard(args, this.context);
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
