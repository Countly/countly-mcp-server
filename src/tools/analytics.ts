import { ToolContext, ToolResult } from './types.js';
import { safeApiCall } from '../lib/error-handler.js';

// ============================================================================
// GET_ANALYTICS_DATA TOOL
// ============================================================================

export const getAnalyticsDataToolDefinition = {
  name: 'get_analytics_data',
  description: 'Get analytics data using the main /o endpoint with various methods (sessions, users, locations, etc.)',
  inputSchema: {
    type: 'object',
    properties: {
      app_id: { type: 'string', description: 'Application ID (optional if app_name is provided)' },
      app_name: { type: 'string', description: 'Application name (alternative to app_id)' },
      method: {
        type: 'string',
        enum: [
          'locations', 'sessions', 'users', 'carriers',
          'devices', 'device_details', 'app_versions', 'cities', 'get_events',
          'browser', 'consents', 'density', 
          'langs', 'logs', 'sdks', 'sources', 'systemlogs', 'times-of-day', 'ab-testing', 
          'get_cohorts', 'live', 'get_funnels', 'retention', 'user_details'
        ],
        description: 'Data retrieval method'
      },
      period: { 
        type: 'string', 
        description: 'Time period for data. Possible values: "month", "60days", "30days", "7days", "yesterday", "hour", or custom range as [startMilliseconds,endMilliseconds] (e.g., "[1417730400000,1420149600000]")'
      },
      event: { type: 'string', description: 'Event key for event-specific methods' },
      segmentation: { type: 'string', description: 'Segmentation parameter for events' },
    },
    required: ['method'],
    anyOf: [
      { required: ['app_id'] },
      { required: ['app_name'] }
    ],
  },
};

export async function handleGetAnalyticsData(context: ToolContext, args: any): Promise<ToolResult> {
  const app_id = await context.resolveAppId(args);
  const { method, period, event, segmentation } = args;
  
  const params: any = {
    ...context.getAuthParams(),
    app_id,
    method,
  };
  
  if (period) {
params.period = period;
}
  if (event) {
params.event = event;
}
  if (segmentation) {
params.segmentation = segmentation;
}

  const response = await safeApiCall(


    () => context.httpClient.get('/o', { params }),


    'Failed to execute request to /o'


  );
  
  return {
    content: [
      {
        type: 'text',
        text: `Analytics data for ${method}:\n${JSON.stringify(response.data, null, 2)}`,
      },
    ],
  };
}

// ============================================================================
// GET_DASHBOARD_DATA TOOL
// ============================================================================

export const getDashboardDataToolDefinition = {
  name: 'get_dashboard_data',
  description: 'Get aggregated dashboard data for an app. If no app is specified, will show available apps to choose from.',
  inputSchema: {
    type: 'object',
    properties: {
      app_id: { type: 'string', description: 'Application ID (optional - if not provided, will show available apps)' },
      app_name: { type: 'string', description: 'Application name (optional - if not provided, will show available apps)' },
      period: { 
        type: 'string', 
        description: 'Time period for data. Possible values: "month", "60days", "30days", "7days", "yesterday", "hour", or custom range as [startMilliseconds,endMilliseconds] (e.g., "[1417730400000,1420149600000]")'
      },
    },
    required: [],
  },
};

export async function handleGetDashboardData(context: ToolContext, args: any): Promise<ToolResult> {
  const app_id = await context.resolveAppId(args);
  const { period } = args;
  
  const params: any = {
    ...context.getAuthParams(),
    app_id,
  };
  
  if (period) {
params.period = period;
}

  const response = await safeApiCall(


    () => context.httpClient.get('/o/analytics/dashboard', { params }),


    'Failed to execute request to /o/analytics/dashboard'


  );
  
  return {
    content: [
      {
        type: 'text',
        text: `Dashboard data for app ${app_id}:\n${JSON.stringify(response.data, null, 2)}`,
      },
    ],
  };
}

// ============================================================================
// GET_EVENTS_DATA TOOL
// ============================================================================

export const getEventsDataToolDefinition = {
  name: 'get_events_data',
  description: 'Get events analytics data. If no app is specified, will show available apps to choose from.',
  inputSchema: {
    type: 'object',
    properties: {
      app_id: { type: 'string', description: 'Application ID (optional - if not provided, will show available apps)' },
      app_name: { type: 'string', description: 'Application name (optional - if not provided, will show available apps)' },
      period: { 
        type: 'string', 
        description: 'Time period for data. Possible values: "month", "60days", "30days", "7days", "yesterday", "hour", or custom range as [startMilliseconds,endMilliseconds] (e.g., "[1417730400000,1420149600000]")'
      },
      event: { type: 'string', description: 'Specific event key to filter by' },
    },
    required: [],
  },
};

export async function handleGetEventsData(context: ToolContext, args: any): Promise<ToolResult> {
  const app_id = await context.resolveAppId(args);
  const { period, event } = args;
  
  const params: any = {
    ...context.getAuthParams(),
    app_id,
  };
  
  if (period) {
params.period = period;
}
  if (event) {
params.event = event;
}

  const response = await safeApiCall(


    () => context.httpClient.get('/o/analytics/events', { params }),


    'Failed to execute request to /o/analytics/events'


  );
  
  return {
    content: [
      {
        type: 'text',
        text: `Events data for app ${app_id}:\n${JSON.stringify(response.data, null, 2)}`,
      },
    ],
  };
}

// ============================================================================
// GET_EVENTS_OVERVIEW TOOL
// ============================================================================

export const getEventsOverviewToolDefinition = {
  name: 'get_events_overview',
  description: 'Get overview of events data with total counts and segments',
  inputSchema: {
    type: 'object',
    properties: {
      app_id: { type: 'string', description: 'Application ID (optional if app_name is provided)' },
      app_name: { type: 'string', description: 'Application name (alternative to app_id)' },
      period: { 
        type: 'string', 
        description: 'Time period for data. Possible values: "month", "60days", "30days", "7days", "yesterday", "hour", or custom range as [startMilliseconds,endMilliseconds] (e.g., "[1417730400000,1420149600000]")'
      },
    },
    anyOf: [
      { required: ['app_id'] },
      { required: ['app_name'] }
    ],
  },
};

export async function handleGetEventsOverview(context: ToolContext, args: any): Promise<ToolResult> {
  const app_id = await context.resolveAppId(args);
  const { period } = args;
  
  const params: any = {
    ...context.getAuthParams(),
    app_id,
  };
  
  if (period) {
params.period = period;
}

  const response = await safeApiCall(


    () => context.httpClient.get('/o/analytics/events/overview', { params }),


    'Failed to execute request to /o/analytics/events/overview'


  );
  
  return {
    content: [
      {
        type: 'text',
        text: `Events overview for app ${app_id}:\n${JSON.stringify(response.data, null, 2)}`,
      },
    ],
  };
}

// ============================================================================
// GET_TOP_EVENTS TOOL
// ============================================================================

export const getTopEventsToolDefinition = {
  name: 'get_top_events',
  description: 'Get the most frequently occurring events',
  inputSchema: {
    type: 'object',
    properties: {
      app_id: { type: 'string', description: 'Application ID (optional if app_name is provided)' },
      app_name: { type: 'string', description: 'Application name (alternative to app_id)' },
      period: { 
        type: 'string', 
        description: 'Time period for data. Possible values: "month", "60days", "30days", "7days", "yesterday", "hour", or custom range as [startMilliseconds,endMilliseconds] (e.g., "[1417730400000,1420149600000]")'
      },
      limit: { type: 'number', description: 'Number of top events to retrieve', default: 10 },
    },
    anyOf: [
      { required: ['app_id'] },
      { required: ['app_name'] }
    ],
  },
};

export async function handleGetTopEvents(context: ToolContext, args: any): Promise<ToolResult> {
  const app_id = await context.resolveAppId(args);
  const { period, limit = 10 } = args;
  
  const params: any = {
    ...context.getAuthParams(),
    app_id,
    limit,
  };
  
  if (period) {
params.period = period;
}

  const response = await safeApiCall(


    () => context.httpClient.get('/o/analytics/events/top', { params }),


    'Failed to execute request to /o/analytics/events/top'


  );
  
  return {
    content: [
      {
        type: 'text',
        text: `Top ${limit} events for app ${app_id}:\n${JSON.stringify(response.data, null, 2)}`,
      },
    ],
  };
}

// ============================================================================
// GET_SLIPPING_AWAY_USERS TOOL
// ============================================================================

export const getSlippingAwayUsersToolDefinition = {
  name: 'get_slipping_away_users',
  description: 'Get users who are slipping away based on inactivity period',
  inputSchema: {
    type: 'object',
    properties: {
      app_id: { type: 'string', description: 'Application ID (optional if app_name is provided)' },
      app_name: { type: 'string', description: 'Application name (alternative to app_id)' },
      period: { 
        type: 'number', 
        enum: [7, 14, 30, 60, 90], 
        description: 'Time period to check for (days)',
        default: 7
      },
      limit: { type: 'number', description: 'Maximum number of users to return', default: 50 },
      skip: { type: 'number', description: 'Number of users to skip for pagination', default: 0 },
    },
    anyOf: [
      { required: ['app_id'] },
      { required: ['app_name'] }
    ],
  },
};

export async function handleGetSlippingAwayUsers(context: ToolContext, args: any): Promise<ToolResult> {
  const app_id = await context.resolveAppId(args);
  const { period = 7, limit = 50, skip = 0 } = args;
  
  const params = {
    ...context.getAuthParams(),
    app_id,
    period,
    limit,
    skip,
  };

  const response = await safeApiCall(


    () => context.httpClient.get('/o/slipping', { params }),


    'Failed to execute request to /o/slipping'


  );
  
  return {
    content: [
      {
        type: 'text',
        text: `Slipping away users for app ${app_id} (${period} days):\n${JSON.stringify(response.data, null, 2)}`,
      },
    ],
  };
}

// ============================================================================
// GET_SESSION_FREQUENCY TOOL
// ============================================================================

export const getSessionFrequencyToolDefinition = {
  name: 'get_session_frequency',
  description: 'Get session frequency distribution showing how many sessions fall into different time buckets. Buckets: f=0 (first session), f=1 (1-24 hours), f=2 (1 day), f=3 (2 days), f=4 (3 days), f=5 (4 days), f=6 (5 days), f=7 (6 days), f=8 (7 days), f=9 (8-14 days), f=10 (15-30 days), f=11 (30+ days)',
  inputSchema: {
    type: 'object',
    properties: {
      app_id: { 
        type: 'string', 
        description: 'Application ID (optional if app_name is provided)' 
      },
      app_name: { 
        type: 'string', 
        description: 'Application name (alternative to app_id)' 
      },
      period: { 
        type: 'string', 
        description: 'Time period for data. Possible values: "month", "60days", "30days", "7days", "yesterday", "hour", or custom range',
        default: '30days'
      },
    },
    anyOf: [
      { required: ['app_id'] },
      { required: ['app_name'] }
    ],
  },
};

export async function handleGetSessionFrequency(context: ToolContext, args: any): Promise<ToolResult> {
  const app_id = await context.resolveAppId(args);
  const period = args.period || '30days';

  const params = {
    ...context.getAuthParams(),
    app_id,
    period,
  };

  const response = await safeApiCall(
    () => context.httpClient.get('/o/analytics/frequency', { params }),
    'Failed to get session frequency'
  );

  // Add helpful description of frequency buckets
  let resultText = `Session frequency distribution for app ${app_id} (${period}):\n\n`;
  resultText += `**Frequency Buckets:**\n`;
  resultText += `- f=0: First session\n`;
  resultText += `- f=1: Every 1-24 hours\n`;
  resultText += `- f=2: Every 1 day\n`;
  resultText += `- f=3: Every 2 days\n`;
  resultText += `- f=4: Every 3 days\n`;
  resultText += `- f=5: Every 4 days\n`;
  resultText += `- f=6: Every 5 days\n`;
  resultText += `- f=7: Every 6 days\n`;
  resultText += `- f=8: Every 7 days\n`;
  resultText += `- f=9: Every 8-14 days\n`;
  resultText += `- f=10: Every 15-30 days\n`;
  resultText += `- f=11: Every 30+ days\n\n`;
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
// GET_USER_LOYALTY TOOL
// ============================================================================

export const getUserLoyaltyToolDefinition = {
  name: 'get_user_loyalty',
  description: 'Get user loyalty data showing how many sessions users have had. Results are divided into loyalty buckets: 1 session, 2 sessions, 3-5, 6-9, 10-19, 20-49, 50-99, 100-499, and 500+ sessions.',
  inputSchema: {
    type: 'object',
    properties: {
      app_id: { type: 'string', description: 'Application ID (optional if app_name is provided)' },
      app_name: { type: 'string', description: 'Application name (alternative to app_id)' },
      query: { 
        type: 'string', 
        description: 'Optional MongoDB query as JSON string to filter users (e.g., \'{"country":"US"}\' or \'{}\'). Defaults to \'{}\' (all users).' 
      },
    },
    anyOf: [
      { required: ['app_id'] },
      { required: ['app_name'] }
    ],
  },
};

export async function handleGetUserLoyalty(context: ToolContext, args: any): Promise<ToolResult> {
  const app_id = await context.resolveAppId(args);
  const query = args.query || '{}';

  const params = {
    ...context.getAuthParams(),
    app_id,
    query,
  };

  const response = await safeApiCall(
    () => context.httpClient.get('/o/app_users/loyalty', { params }),
    'Failed to get user loyalty data'
  );

  // Add helpful description of loyalty buckets
  let resultText = `User loyalty data for app ${app_id}:\n\n`;
  resultText += `**Loyalty Buckets (Session Counts):**\n`;
  resultText += `- Bucket 0: 1 session\n`;
  resultText += `- Bucket 1: 2 sessions\n`;
  resultText += `- Bucket 2: 3-5 sessions\n`;
  resultText += `- Bucket 3: 6-9 sessions\n`;
  resultText += `- Bucket 4: 10-19 sessions\n`;
  resultText += `- Bucket 5: 20-49 sessions\n`;
  resultText += `- Bucket 6: 50-99 sessions\n`;
  resultText += `- Bucket 7: 100-499 sessions\n`;
  resultText += `- Bucket 8: 500+ sessions\n\n`;
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
// GET_SESSION_DURATIONS TOOL
// ============================================================================

export const getSessionDurationsToolDefinition = {
  name: 'get_session_durations',
  description: 'Get session duration distribution showing how long user sessions lasted. Results are divided into duration buckets: 0-10 seconds, 11-30 seconds, 31-60 seconds, 1-3 minutes, 3-10 minutes, 10-30 minutes, 30-60 minutes, and over 1 hour.',
  inputSchema: {
    type: 'object',
    properties: {
      app_id: { type: 'string', description: 'Application ID (optional if app_name is provided)' },
      app_name: { type: 'string', description: 'Application name (alternative to app_id)' },
      period: { 
        type: 'string', 
        description: 'Time period for data. Possible values: "month", "60days", "30days", "7days", "yesterday", "hour", or custom range as [startMilliseconds,endMilliseconds] (e.g., "[1417730400000,1420149600000]"). Defaults to "30days".'
      },
    },
    anyOf: [
      { required: ['app_id'] },
      { required: ['app_name'] }
    ],
  },
};

export async function handleGetSessionDurations(context: ToolContext, args: any): Promise<ToolResult> {
  const app_id = await context.resolveAppId(args);
  const period = args.period || '30days';

  const params = {
    ...context.getAuthParams(),
    app_id,
    period,
  };

  const response = await safeApiCall(
    () => context.httpClient.get('/o/analytics/durations', { params }),
    'Failed to get session durations'
  );

  // Add helpful description of duration buckets
  let resultText = `Session duration distribution for app ${app_id} (${period}):\n\n`;
  resultText += `**Duration Buckets:**\n`;
  resultText += `- Bucket 0: 0-10 seconds\n`;
  resultText += `- Bucket 1: 11-30 seconds\n`;
  resultText += `- Bucket 2: 31-60 seconds\n`;
  resultText += `- Bucket 3: 1-3 minutes\n`;
  resultText += `- Bucket 4: 3-10 minutes\n`;
  resultText += `- Bucket 5: 10-30 minutes\n`;
  resultText += `- Bucket 6: 30-60 minutes\n`;
  resultText += `- Bucket 7: Over 1 hour\n\n`;
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

export const analyticsToolDefinitions = [
  getAnalyticsDataToolDefinition,
  getDashboardDataToolDefinition,
  getEventsDataToolDefinition,
  getEventsOverviewToolDefinition,
  getTopEventsToolDefinition,
  getSlippingAwayUsersToolDefinition,
  getSessionFrequencyToolDefinition,
  getUserLoyaltyToolDefinition,
  getSessionDurationsToolDefinition,
];

export const analyticsToolHandlers = {
  'get_analytics_data': 'getAnalyticsData',
  'get_dashboard_data': 'getDashboardData',
  'get_events_data': 'getEventsData',
  'get_events_overview': 'getEventsOverview',
  'get_top_events': 'getTopEvents',
  'get_slipping_away_users': 'getSlippingAwayUsers',
  'get_session_frequency': 'getSessionFrequency',
  'get_user_loyalty': 'getUserLoyalty',
  'get_session_durations': 'getSessionDurations',
} as const;

export class AnalyticsTools {
  constructor(private context: ToolContext) {}

  async getAnalyticsData(args: any): Promise<ToolResult> {
    return handleGetAnalyticsData(this.context, args);
  }

  async getDashboardData(args: any): Promise<ToolResult> {
    return handleGetDashboardData(this.context, args);
  }

  async getEventsData(args: any): Promise<ToolResult> {
    return handleGetEventsData(this.context, args);
  }

  async getEventsOverview(args: any): Promise<ToolResult> {
    return handleGetEventsOverview(this.context, args);
  }

  async getTopEvents(args: any): Promise<ToolResult> {
    return handleGetTopEvents(this.context, args);
  }

  async getSlippingAwayUsers(args: any): Promise<ToolResult> {
    return handleGetSlippingAwayUsers(this.context, args);
  }

  async getSessionFrequency(args: any): Promise<ToolResult> {
    return handleGetSessionFrequency(this.context, args);
  }

  async getUserLoyalty(args: any): Promise<ToolResult> {
    return handleGetUserLoyalty(this.context, args);
  }

  async getSessionDurations(args: any): Promise<ToolResult> {
    return handleGetSessionDurations(this.context, args);
  }
}

// Metadata for dynamic routing (must be after class declaration)// Metadata for dynamic routing (must be after class declaration)
export const analyticsToolMetadata = {
  instanceKey: 'analytics',
  toolClass: AnalyticsTools,
  handlers: analyticsToolHandlers,
} as const;
