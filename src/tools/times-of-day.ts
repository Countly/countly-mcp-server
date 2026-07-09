import { ToolContext, ToolResult } from './types.js';
import { safeApiCall } from '../lib/error-handler.js';

/**
 * Times of Day Module
 *
 * Tools for analyzing user behavior patterns in their local time for events.
 * Requires the 'times-of-day' plugin to be installed on the Countly server.
 */

// ============================================================================
// TIMES OF DAY TOOL
// ============================================================================

export const getTimesOfDayToolDefinition = {
  name: 'times_of_day',
  description: 'Get a weekday x hour heatmap of user activity in users\' local time for a given event via /o?method=times-of-day. Requires the times-of-day plugin. Distinct from datapoints_punch_card (which measures server data-point volume, not user activity).',
  inputSchema: {
    type: 'object',
    properties: {
      app_id: {
        type: 'string',
        description: 'Application ID. Either app_id or app_name must be provided; call apps_list first if you do not know it.',
      },
      app_name: {
        type: 'string',
        description: 'Application name (alternative to app_id). Must match an existing app exactly; call apps_list to find valid names.',
      },
      event_key: {
        type: 'string',
        description: 'Event key to analyze. Use "[CLY]_session" for sessions, or any custom event key. Omit for the server default.',
      },
      period: {
        type: 'string',
        description: 'Time period. One of "month", "60days", "30days", "7days", "yesterday", "hour", or a custom range as [startMilliseconds,endMilliseconds] (e.g. "[1417730400000,1420149600000]"). Server default applies when omitted.',
      },
    },
  },
};

export async function handleGetTimesOfDay(
  context: ToolContext,
  input: Record<string, unknown>
): Promise<ToolResult> {
  const event_key = input.event_key as string | undefined;
  const period = input.period as string | undefined;

  const app_id = await context.resolveAppId(input);

  const params: Record<string, string> = {
    ...context.getAuthParams(),
    app_id,
    method: 'times-of-day',
  };

  // Add event key if provided
  if (event_key) {
    params.tod_type = event_key;
  }

  // Add period if provided
  if (period) {
    params.period = period;
  }

  const response = await safeApiCall(
    () => context.httpClient.get('/o', { params }),
    'Failed to get times of day data'
  );

  return {
    content: [
      {
        type: 'text',
        text: `Times of day pattern for app ${app_id}${event_key ? ` (event: ${event_key})` : ''}:\n\n${JSON.stringify(response.data, null, 2)}`,
      },
    ],
  };
}

// ============================================================================
// Export Combined Arrays
// ============================================================================

export const timesOfDayToolDefinitions = [
  getTimesOfDayToolDefinition,
];

export const timesOfDayToolHandlers = {
  'times_of_day': 'times_of_day',
} as const;

export class TimesOfDayTools {
  constructor(private context: ToolContext) {}

  async times_of_day(args: any): Promise<ToolResult> {
    return handleGetTimesOfDay(this.context, args);
  }
}

export const timesOfDayToolMetadata = {
  instanceKey: 'timesOfDay',
  toolClass: TimesOfDayTools,
  handlers: timesOfDayToolHandlers,
} as const;
