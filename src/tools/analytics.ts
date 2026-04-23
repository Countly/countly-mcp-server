import { ToolContext, ToolResult } from './types.js';
import { safeApiCall } from '../lib/error-handler.js';

// ============================================================================
// QUERY_DATA TOOL (COMBINED)
// ============================================================================



// ============================================================================
// GET_ANALYTICS_APP_SUMMARY TOOL
// ============================================================================

export const getAnalyticsAppSummaryToolDefinition = {
  name: 'app_analytics_summary',
  description: 'Get a high-level analytics overview for a specific app (sessions, users, events, and retention for the chosen period). Use this when the user already has an app in mind and wants a quick health check (e.g. "how is MyApp doing?"). To discover which apps exist in the account, use apps_list — this tool requires an app identifier and does not list apps.',
  inputSchema: {
    type: 'object',
    properties: {
      app_id: { type: 'string', description: 'Application ID. Either app_id or app_name must be provided; call apps_list first if you do not know it.' },
      app_name: { type: 'string', description: 'Application name (alternative to app_id). Must match an existing app exactly; call apps_list to find valid names.' },
      period: {
        type: 'string',
        description: 'Time period for data. One of "month", "60days", "30days", "7days", "yesterday", "hour", or a custom range as [startMilliseconds,endMilliseconds] (e.g. "[1417730400000,1420149600000]"). Defaults to "30days".'
      },
    },
    required: [],
  },
};

export async function handleGetAnalyticsAppSummary(context: ToolContext, args: any): Promise<ToolResult> {
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
        text: `App summary data for app ${app_id}:\n${JSON.stringify(response.data, null, 2)}`,
      },
    ],
  };
}

// ============================================================================
// GET_SLIPPING_AWAY_USERS TOOL
// ============================================================================

export const getSlippingAwayUsersToolDefinition = {
  name: 'slipping_users',
  description: 'List app users who have not returned within a given inactivity window (churn-risk cohort) via /o/slipping. Use this to identify re-engagement targets; for generic user listings use user_profiles_query instead.',
  inputSchema: {
    type: 'object',
    properties: {
      app_id: { type: 'string', description: 'Application ID. Either app_id or app_name must be provided; call apps_list first if you do not know it.' },
      app_name: { type: 'string', description: 'Application name (alternative to app_id). Must match an existing app exactly; call apps_list to find valid names.' },
      period: {
        type: 'number',
        enum: [7, 14, 30, 60, 90],
        description: 'Inactivity threshold in days. Users whose last session is older than this are returned. Defaults to 7.',
        default: 7
      },
      limit: { type: 'number', description: 'Maximum number of users to return. Defaults to 50.', default: 50 },
      skip: { type: 'number', description: 'Number of users to skip for pagination. Defaults to 0.', default: 0 },
    },
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
  name: 'session_frequency',
  description: 'Get the session-frequency distribution for an app via /o/analytics/frequency: how many sessions occurred at each return-interval bucket (f=0 first, f=1 1-24h, f=2 1d, f=3 2d, f=4 3d, f=5 4d, f=6 5d, f=7 6d, f=8 7d, f=9 8-14d, f=10 15-30d, f=11 30+d). For duration-based distributions use session_durations.',
  inputSchema: {
    type: 'object',
    properties: {
      app_id: {
        type: 'string',
        description: 'Application ID. Either app_id or app_name must be provided; call apps_list first if you do not know it.'
      },
      app_name: {
        type: 'string',
        description: 'Application name (alternative to app_id). Must match an existing app exactly; call apps_list to find valid names.'
      },
      period: {
        type: 'string',
        description: 'Time period. One of "month", "60days", "30days", "7days", "yesterday", "hour", or a custom range as [startMilliseconds,endMilliseconds] (e.g. "[1417730400000,1420149600000]"). Defaults to "30days" when omitted.',
        default: '30days'
      },
    },
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
  name: 'user_loyalty',
  description: 'Get the user-loyalty distribution for an app via /o/app_users/loyalty: counts of users bucketed by lifetime session count (1, 2, 3-5, 6-9, 10-19, 20-49, 50-99, 100-499, 500+). For session-timing breakdowns use session_frequency.',
  inputSchema: {
    type: 'object',
    properties: {
      app_id: { type: 'string', description: 'Application ID. Either app_id or app_name must be provided; call apps_list first if you do not know it.' },
      app_name: { type: 'string', description: 'Application name (alternative to app_id). Must match an existing app exactly; call apps_list to find valid names.' },
      query: {
        type: 'string',
        description: 'MongoDB query as a JSON string to filter the user set (e.g. \'{"country":"US"}\'). Defaults to \'{}\' (all users).'
      },
    },
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
  name: 'session_durations',
  description: 'Get the session-duration distribution for an app via /o/analytics/durations: counts of sessions bucketed by length (0-10s, 11-30s, 31-60s, 1-3m, 3-10m, 10-30m, 30-60m, 1h+). For session-return cadence use session_frequency.',
  inputSchema: {
    type: 'object',
    properties: {
      app_id: { type: 'string', description: 'Application ID. Either app_id or app_name must be provided; call apps_list first if you do not know it.' },
      app_name: { type: 'string', description: 'Application name (alternative to app_id). Must match an existing app exactly; call apps_list to find valid names.' },
      period: {
        type: 'string',
        description: 'Time period. One of "month", "60days", "30days", "7days", "yesterday", "hour", or a custom range as [startMilliseconds,endMilliseconds] (e.g. "[1417730400000,1420149600000]"). Defaults to "30days" when omitted.'
      },
    },
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
// QUERY_DATA TOOL (COMBINED)
// ============================================================================

export const queryDataToolDefinition = {
  name: 'query_data',
  description: 'Query analytics data in one of three modes selected by query_type: "analytics" for built-in breakdowns (locations, devices, carriers, app versions, etc.), "events" for event totals via /o/analytics/events, or "drill" for custom segment filtering (drill plugin, with bucket + projection). For the single-call app overview use app_analytics_summary; for event key management use events_list.',
  inputSchema: {
    type: 'object',
    properties: {
      app_id: { type: 'string', description: 'Application ID. Either app_id or app_name must be provided; call apps_list first if you do not know it.' },
      app_name: { type: 'string', description: 'Application name (alternative to app_id). Must match an existing app exactly; call apps_list to find valid names.' },
      query_type: {
        type: 'string',
        enum: ['analytics', 'events', 'drill'],
        description: 'Which query mode to run: "analytics" (predefined breakdown, requires method), "events" (event totals, optional event key), or "drill" (segmentation via drill plugin; requires query_object).'
      },
      // Analytics-specific
      method: {
        type: 'string',
        enum: [
          'locations', 'sessions', 'users', 'carriers',
          'devices', 'device_details', 'app_versions', 'cities',
          'browser', 'density', 'langs', 'sources'
        ],
        description: 'Analytics breakdown method. Required when query_type is "analytics"; ignored otherwise.'
      },
      segmentation: { type: 'string', description: 'Event segmentation key to break results by. Used when query_type is "analytics".' },
      // Events-specific
      event: { type: 'string', description: 'Event key to query. Used when query_type is "events" or "drill".' },
      // Drill-specific
      query_object: {
        type: 'string',
        description: 'MongoDB-style query as a JSON string for drill filtering. Required when query_type is "drill". Use field prefixes listed by queriable_fields_list.'
      },
      bucket: {
        type: 'string',
        description: 'Time bucket granularity for drill results. Defaults to "daily" when query_type is "drill".',
        enum: ['hourly', 'daily', 'weekly', 'monthly'],
      },
      projection_key: {
        type: 'array',
        description: 'Segment keys to break the drill result down by. Used when query_type is "drill".',
        items: { type: 'string' }
      },
      // Common
      period: {
        type: 'string',
        description: 'Time period. One of "month", "60days", "30days", "7days", "yesterday", "hour", or a custom range as [startMilliseconds,endMilliseconds] (e.g. "[1417730400000,1420149600000]"). Server default applies when omitted.'
      },
    },
    required: ['query_type'],
    // Note: Conditional validation (method required for analytics, query_object for drill)
    // is handled in handleQueryData() to avoid Claude API schema limitations
  },
};

export async function handleQueryData(context: ToolContext, args: any): Promise<ToolResult> {
  const appId = await context.resolveAppId(args);
  const { query_type, method, period, event, segmentation, query_object, bucket, projection_key } = args;

  if (query_type === 'drill') {
    // Check drill availability
    const drillAvailable = await checkDrillAvailability(context, appId);
    if (!drillAvailable) {
      return {
        content: [
          {
            type: 'text',
            text: 'Drill plugin not available on this server. Use analytics or events query types.',
          },
        ],
      };
    }
  }

  const params: any = {
    ...context.getAuthParams(),
    app_id: appId,
  };

  if (period) {
    params.period = period;
  }

  let endpoint = '/o';
  let resultPrefix = '';

  if (query_type === 'analytics') {
    params.method = method;
    if (event) {
      params.event = event;
    }
    if (segmentation) {
      params.segmentation = segmentation;
    }
    resultPrefix = `Analytics data for ${method}`;
  } else if (query_type === 'events') {
    endpoint = '/o/analytics/events';
    if (event) {
      params.event = event;
    }
    resultPrefix = `Events data for app ${appId}`;
  } else if (query_type === 'drill') {
    params.method = 'segmentation';
    params.queryObject = query_object || '{}';
    params.bucket = bucket || 'daily';
    if (event) {
      params.event = event;
    }
    if (projection_key) {
      params.projectionKey = projection_key;
    }
    resultPrefix = 'Drill query results';
  }

  const response = await safeApiCall(
    () => context.httpClient.get(endpoint, { params }),
    `Failed to execute ${query_type} query`
  );

  return {
    content: [
      {
        type: 'text',
        text: `${resultPrefix}:\n${JSON.stringify(response.data, null, 2)}`,
      },
    ],
  };
}

async function checkDrillAvailability(context: ToolContext, appId: string): Promise<boolean> {
  try {
    const params = {
      ...context.getAuthParams(),
      app_id: appId,
      method: 'segmentation_meta',
    };
    await context.httpClient.get('/o', { params });
    return true;
  } catch {
    return false;
  }
}

// ============================================================================

export const analyticsToolDefinitions = [
  queryDataToolDefinition,
  getAnalyticsAppSummaryToolDefinition,
  getSlippingAwayUsersToolDefinition,
  getSessionFrequencyToolDefinition,
  getUserLoyaltyToolDefinition,
  getSessionDurationsToolDefinition,
];

export const analyticsToolHandlers = {
  'query_data': 'queryData',
  'app_analytics_summary': 'getAnalyticsAppSummary',
  'slipping_users': 'getSlippingAwayUsers',
  'session_frequency': 'getSessionFrequency',
  'user_loyalty': 'getUserLoyalty',
  'session_durations': 'getSessionDurations',
} as const;

export class AnalyticsTools {
  constructor(private context: ToolContext) {}

  async queryData(args: any): Promise<ToolResult> {
    return handleQueryData(this.context, args);
  }

  async getAnalyticsAppSummary(args: any): Promise<ToolResult> {
    return handleGetAnalyticsAppSummary(this.context, args);
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

// Metadata for dynamic routing (must be after class declaration)
export const analyticsToolMetadata = {
  instanceKey: 'analytics',
  toolClass: AnalyticsTools,
  handlers: analyticsToolHandlers,
} as const;
