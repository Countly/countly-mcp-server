import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { ToolContext, ToolResult } from './types.js';

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
  
  if (period) params.period = period;
  if (event) params.event = event;
  if (segmentation) params.segmentation = segmentation;

  const response = await context.httpClient.get('/o', { params });
  
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
  
  if (period) params.period = period;

  const response = await context.httpClient.get('/o/analytics/dashboard', { params });
  
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
  
  if (period) params.period = period;
  if (event) params.event = event;

  const response = await context.httpClient.get('/o/analytics/events', { params });
  
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
  
  if (period) params.period = period;

  const response = await context.httpClient.get('/o/analytics/events/overview', { params });
  
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
  
  if (period) params.period = period;

  const response = await context.httpClient.get('/o/analytics/events/top', { params });
  
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

  const response = await context.httpClient.get('/o/slipping', { params });
  
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
// EXPORTS
// ============================================================================

export const analyticsToolDefinitions = [
  getAnalyticsDataToolDefinition,
  getDashboardDataToolDefinition,
  getEventsDataToolDefinition,
  getEventsOverviewToolDefinition,
  getTopEventsToolDefinition,
  getSlippingAwayUsersToolDefinition,
];

export const analyticsToolHandlers = {
  'get_analytics_data': 'getAnalyticsData',
  'get_dashboard_data': 'getDashboardData',
  'get_events_data': 'getEventsData',
  'get_events_overview': 'getEventsOverview',
  'get_top_events': 'getTopEvents',
  'get_slipping_away_users': 'getSlippingAwayUsers',
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
}

// Metadata for dynamic routing (must be after class declaration)
export const analyticsToolMetadata = {
  instanceKey: 'analytics',
  toolClass: AnalyticsTools,
  handlers: analyticsToolHandlers,
} as const;
