/**
 * Times of Day Tools
 * 
 * Tools for analyzing user behavior patterns in their local time for events.
 * 
 * Requires: times-of-day plugin
 */

import { z } from 'zod';
import { safeApiCall } from '../lib/error-handler.js';
import type { ToolContext } from './types.js';

/**
 * Tool: get_times_of_day
 * Get user behavior patterns in their local time for a specific event
 */
export const getTimesOfDayTool = {
  name: 'get_times_of_day',
  description: 'Get user behavior patterns in their local time for a specific event. Shows when users are most active throughout the day (by hour) and week (by day). Useful for understanding optimal engagement times and scheduling.',
  inputSchema: z.object({
    app_id: z.string()
      .optional()
      .describe('Application ID (optional if app_name is provided)'),
    app_name: z.string()
      .optional()
      .describe('Application name (alternative to app_id)'),
    event_key: z.string()
      .optional()
      .describe('Event key to analyze. Use "[CLY]_session" for session data, or any custom event key.'),
    period: z.string()
      .optional()
      .describe('Time period for data. Possible values: "month", "60days", "30days", "7days", "yesterday", "hour", or custom range as [startMilliseconds,endMilliseconds] (e.g., "[1417730400000,1420149600000]")'),
  }),
};

async function handleGetTimesOfDay(args: z.infer<typeof getTimesOfDayTool.inputSchema>, context: ToolContext) {
  const app_id = await context.resolveAppId(args);

  const params: Record<string, string> = {
    ...context.getAuthParams(),
    app_id,
    method: 'times-of-day',
  };

  // Add event key if provided
  if (args.event_key) {
    params.tod_type = args.event_key;
  }

  // Add period if provided
  if (args.period) {
    params.period = args.period;
  }

  const response = await safeApiCall(
    () => context.httpClient.get('/o', { params }),
    'Failed to get times of day data'
  );

  return {
    content: [
      {
        type: 'text' as const,
        text: `Times of day pattern for app ${app_id}${args.event_key ? ` (event: ${args.event_key})` : ''}:\n\n${JSON.stringify(response.data, null, 2)}`,
      },
    ],
  };
}

// Export tools array
export const timesOfDayTools = [
  getTimesOfDayTool,
];

// Export handlers map
export const timesOfDayHandlers = {
  get_times_of_day: handleGetTimesOfDay,
};
