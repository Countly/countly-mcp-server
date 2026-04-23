import { ToolContext, ToolResult } from './types.js';
import { safeApiCall } from '../lib/error-handler.js';

// ============================================================================
// GET_LIVE_USERS TOOL
// ============================================================================

export const getLiveUsersToolDefinition = {
  name: 'live_users',
  description: 'Get the current online user count and current new-user count (a single snapshot) via /o?method=concurrent&mode=0. Requires the concurrent_users plugin. For country/device/carrier breakdown use live_metrics.',
  inputSchema: {
    type: 'object',
    properties: {
      app_id: { type: 'string', description: 'Application ID. Either app_id or app_name must be provided; call apps_list first if you do not know it.' },
      app_name: { type: 'string', description: 'Application name (alternative to app_id). Must match an existing app exactly; call apps_list to find valid names.' },
    },
  },
};

export async function handleGetLiveUsers(context: ToolContext, args: any): Promise<ToolResult> {
  const app_id = await context.resolveAppId(args);

  const params = {
    ...context.getAuthParams(),
    app_id,
    method: 'concurrent',
    mode: 0,
    r_apps: JSON.stringify([app_id]),
  };

  const response = await safeApiCall(
    () => context.httpClient.get('/o', { params }),
    'Failed to get live users'
  );

  let resultText = `Live users for app ${app_id}:\n\n`;
  resultText += `**Current Moment:**\n`;
  resultText += `- Online Users: Currently active users\n`;
  resultText += `- New Users Online: First-time users currently active\n\n`;
  resultText += `**Results:**\n`;
  resultText += JSON.stringify(response.data, null, 2);

  return {
    content: [
      {
        type: 'text',
        text: resultText,
      },
    ],
  };
}

// ============================================================================
// GET_LIVE_METRICS TOOL
// ============================================================================

export const getLiveMetricsToolDefinition = {
  name: 'live_metrics',
  description: 'Get the country/device/carrier breakdown of users currently online via /o?method=concurrent&mode=1. Requires the concurrent_users plugin. For the simple total use live_users.',
  inputSchema: {
    type: 'object',
    properties: {
      app_id: { type: 'string', description: 'Application ID. Either app_id or app_name must be provided; call apps_list first if you do not know it.' },
      app_name: { type: 'string', description: 'Application name (alternative to app_id). Must match an existing app exactly; call apps_list to find valid names.' },
    },
  },
};

export async function handleGetLiveMetrics(context: ToolContext, args: any): Promise<ToolResult> {
  const app_id = await context.resolveAppId(args);

  const params = {
    ...context.getAuthParams(),
    app_id,
    method: 'concurrent',
    mode: 1,
    r_apps: JSON.stringify([app_id]),
  };

  const response = await safeApiCall(
    () => context.httpClient.get('/o', { params }),
    'Failed to get live metrics'
  );

  let resultText = `Live user metrics for app ${app_id}:\n\n`;
  resultText += `**Breakdown:**\n`;
  resultText += `- Countries: Geographic distribution of online users\n`;
  resultText += `- Devices: Device types being used\n`;
  resultText += `- Carriers: Mobile carrier distribution\n\n`;
  resultText += `**Results:**\n`;
  resultText += JSON.stringify(response.data, null, 2);

  return {
    content: [
      {
        type: 'text',
        text: resultText,
      },
    ],
  };
}

// ============================================================================
// GET_LIVE_LAST_HOUR TOOL
// ============================================================================

export const getLiveLastHourToolDefinition = {
  name: 'live_last_hour',
  description: 'Get per-minute online/new-user counts for the last 60 minutes (60 data points) via /o?method=concurrent&mode=2. Requires the concurrent_users plugin. For longer windows use live_last_day or live_last_30_days.',
  inputSchema: {
    type: 'object',
    properties: {
      app_id: { type: 'string', description: 'Application ID. Either app_id or app_name must be provided; call apps_list first if you do not know it.' },
      app_name: { type: 'string', description: 'Application name (alternative to app_id). Must match an existing app exactly; call apps_list to find valid names.' },
    },
  },
};

export async function handleGetLiveLastHour(context: ToolContext, args: any): Promise<ToolResult> {
  const app_id = await context.resolveAppId(args);

  const params = {
    ...context.getAuthParams(),
    app_id,
    method: 'concurrent',
    mode: 2,
    r_apps: JSON.stringify([app_id]),
  };

  const response = await safeApiCall(
    () => context.httpClient.get('/o', { params }),
    'Failed to get live data for last hour'
  );

  let resultText = `Live user data for last hour - app ${app_id}:\n\n`;
  resultText += `**Time Range:** Last 60 minutes\n`;
  resultText += `**Resolution:** 1 data point per minute\n`;
  resultText += `**Metrics:** Online users and new users for each minute\n\n`;
  resultText += `**Results:**\n`;
  resultText += JSON.stringify(response.data, null, 2);

  return {
    content: [
      {
        type: 'text',
        text: resultText,
      },
    ],
  };
}

// ============================================================================
// GET_LIVE_LAST_DAY TOOL
// ============================================================================

export const getLiveLastDayToolDefinition = {
  name: 'live_last_day',
  description: 'Get per-hour online/new-user counts for the last 24 hours (24 data points) via /o?method=concurrent&mode=3. Requires the concurrent_users plugin. For finer resolution use live_last_hour; for longer use live_last_30_days.',
  inputSchema: {
    type: 'object',
    properties: {
      app_id: { type: 'string', description: 'Application ID. Either app_id or app_name must be provided; call apps_list first if you do not know it.' },
      app_name: { type: 'string', description: 'Application name (alternative to app_id). Must match an existing app exactly; call apps_list to find valid names.' },
    },
  },
};

export async function handleGetLiveLastDay(context: ToolContext, args: any): Promise<ToolResult> {
  const app_id = await context.resolveAppId(args);

  const params = {
    ...context.getAuthParams(),
    app_id,
    method: 'concurrent',
    mode: 3,
    r_apps: JSON.stringify([app_id]),
  };

  const response = await safeApiCall(
    () => context.httpClient.get('/o', { params }),
    'Failed to get live data for last day'
  );

  let resultText = `Live user data for last day - app ${app_id}:\n\n`;
  resultText += `**Time Range:** Last 24 hours\n`;
  resultText += `**Resolution:** 1 data point per hour\n`;
  resultText += `**Metrics:** Online users and new users for each hour\n\n`;
  resultText += `**Results:**\n`;
  resultText += JSON.stringify(response.data, null, 2);

  return {
    content: [
      {
        type: 'text',
        text: resultText,
      },
    ],
  };
}

// ============================================================================
// GET_LIVE_LAST_30_DAYS TOOL
// ============================================================================

export const getLiveLast30DaysToolDefinition = {
  name: 'live_last_30_days',
  description: 'Get per-day online/new-user counts for the last 30 days (30 data points) via /o?method=concurrent&mode=4. Requires the concurrent_users plugin. For peak records use live_overall.',
  inputSchema: {
    type: 'object',
    properties: {
      app_id: { type: 'string', description: 'Application ID. Either app_id or app_name must be provided; call apps_list first if you do not know it.' },
      app_name: { type: 'string', description: 'Application name (alternative to app_id). Must match an existing app exactly; call apps_list to find valid names.' },
    },
  },
};

export async function handleGetLiveLast30Days(context: ToolContext, args: any): Promise<ToolResult> {
  const app_id = await context.resolveAppId(args);

  const params = {
    ...context.getAuthParams(),
    app_id,
    method: 'concurrent',
    mode: 4,
    r_apps: JSON.stringify([app_id]),
  };

  const response = await safeApiCall(
    () => context.httpClient.get('/o', { params }),
    'Failed to get live data for last 30 days'
  );

  let resultText = `Live user data for last 30 days - app ${app_id}:\n\n`;
  resultText += `**Time Range:** Last 30 days\n`;
  resultText += `**Resolution:** 1 data point per day\n`;
  resultText += `**Metrics:** Online users and new users for each day\n\n`;
  resultText += `**Results:**\n`;
  resultText += JSON.stringify(response.data, null, 2);

  return {
    content: [
      {
        type: 'text',
        text: resultText,
      },
    ],
  };
}

// ============================================================================
// GET_LIVE_OVERALL TOOL
// ============================================================================

export const getLiveOverallToolDefinition = {
  name: 'live_overall',
  description: 'Get the all-time peak concurrent online-users and peak new-users records for an app via /o?method=concurrent&mode=5. Requires the concurrent_users plugin.',
  inputSchema: {
    type: 'object',
    properties: {
      app_id: { type: 'string', description: 'Application ID. Either app_id or app_name must be provided; call apps_list first if you do not know it.' },
      app_name: { type: 'string', description: 'Application name (alternative to app_id). Must match an existing app exactly; call apps_list to find valid names.' },
    },
  },
};

export async function handleGetLiveOverall(context: ToolContext, args: any): Promise<ToolResult> {
  const app_id = await context.resolveAppId(args);

  const params = {
    ...context.getAuthParams(),
    app_id,
    method: 'concurrent',
    mode: 5,
    r_apps: JSON.stringify([app_id]),
  };

  const response = await safeApiCall(
    () => context.httpClient.get('/o', { params }),
    'Failed to get live overall data'
  );

  let resultText = `Live user overall statistics for app ${app_id}:\n\n`;
  resultText += `**Peak Records:**\n`;
  resultText += `- Max Online Users: Highest concurrent user count ever recorded\n`;
  resultText += `- Max New Users: Highest concurrent new user count ever recorded\n\n`;
  resultText += `**Results:**\n`;
  resultText += JSON.stringify(response.data, null, 2);

  return {
    content: [
      {
        type: 'text',
        text: resultText,
      },
    ],
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export const liveToolDefinitions = [
  getLiveUsersToolDefinition,
  getLiveMetricsToolDefinition,
  getLiveLastHourToolDefinition,
  getLiveLastDayToolDefinition,
  getLiveLast30DaysToolDefinition,
  getLiveOverallToolDefinition,
];

export const liveToolHandlers = {
  'live_users': 'getLiveUsers',
  'live_metrics': 'getLiveMetrics',
  'live_last_hour': 'getLiveLastHour',
  'live_last_day': 'getLiveLastDay',
  'live_last_30_days': 'getLiveLast30Days',
  'live_overall': 'getLiveOverall',
} as const;

export class LiveTools {
  constructor(private context: ToolContext) {}

  async getLiveUsers(args: any): Promise<ToolResult> {
    return handleGetLiveUsers(this.context, args);
  }

  async getLiveMetrics(args: any): Promise<ToolResult> {
    return handleGetLiveMetrics(this.context, args);
  }

  async getLiveLastHour(args: any): Promise<ToolResult> {
    return handleGetLiveLastHour(this.context, args);
  }

  async getLiveLastDay(args: any): Promise<ToolResult> {
    return handleGetLiveLastDay(this.context, args);
  }

  async getLiveLast30Days(args: any): Promise<ToolResult> {
    return handleGetLiveLast30Days(this.context, args);
  }

  async getLiveOverall(args: any): Promise<ToolResult> {
    return handleGetLiveOverall(this.context, args);
  }
}

// Metadata for dynamic routing (must be after class declaration)
export const liveToolMetadata = {
  instanceKey: 'live',
  toolClass: LiveTools,
  handlers: liveToolHandlers,
} as const;
