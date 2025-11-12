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
 * Tool: get_datapoint_statistics
 * Get amount of data points collected per app per datapoint type
 */
export const getDatapointStatisticsTool = {
  name: 'get_datapoint_statistics',
  description: 'Get data points collected per app per datapoint type. Data points are a measure of collected data, often tied to server specs and billing. Optionally filter by specific apps.',
  inputSchema: z.object({
    period: z.string()
      .optional()
      .default('30days')
      .describe('Time period for data. Possible values: "month", "60days", "30days", "7days", "yesterday", "hour", or custom range as [startMilliseconds,endMilliseconds] (e.g., "[1417730400000,1420149600000]")'),
    selected_app: z.string()
      .optional()
      .describe('Optional comma-separated list of app IDs to filter results (e.g., "app_id1,app_id2")'),
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
 * Tool: get_top_datapoint_apps
 * Get top apps with their data points
 */
export const getTopDatapointAppsTool = {
  name: 'get_top_datapoint_apps',
  description: 'Get top apps ranked by data point collection. Shows which apps are generating the most data points, useful for understanding data usage and billing.',
  inputSchema: z.object({
    period: z.string()
      .optional()
      .default('30days')
      .describe('Time period for data. Possible values: "month", "60days", "30days", "7days", "yesterday", "hour", or custom range as [startMilliseconds,endMilliseconds] (e.g., "[1417730400000,1420149600000]")'),
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
 * Tool: get_datapoint_punch_card
 * Get hourly datapoint breakdown punchcard to check for server load patterns
 */
export const getDatapointPunchCardTool = {
  name: 'get_datapoint_punch_card',
  description: 'Get hourly data point breakdown punchcard showing server load patterns throughout the day and week. Useful for capacity planning and identifying peak usage times.',
  inputSchema: z.object({
    period: z.string()
      .optional()
      .default('30days')
      .describe('Time period for data. Possible values: "month", "60days", "30days", "7days", "yesterday", "hour", or custom range as [startMilliseconds,endMilliseconds] (e.g., "[1417730400000,1420149600000]")'),
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
  [getDatapointStatisticsTool.name]: handleGetDatapointStatistics,
  [getTopDatapointAppsTool.name]: handleGetTopDatapointApps,
  [getDatapointPunchCardTool.name]: handleGetDatapointPunchCard,
};

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
