import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { ToolContext, ToolResult } from './types.js';

// ============================================================================
// CREATE_ALERT TOOL
// ============================================================================

export const createAlertToolDefinition = {
  name: 'create_alert',
  description: 'Create or update an alert configuration. Supports various alert types including crashes, sessions, users, events, views, and more.',
  inputSchema: {
    type: 'object',
    properties: {
      app_id: { type: 'string', description: 'Target app ID of the alert (optional if app_name is provided)' },
      app_name: { type: 'string', description: 'Application name (alternative to app_id)' },
      alert_config: { 
        type: 'object',
        description: 'Alert configuration object',
        properties: {
          _id: { 
            type: ['string', 'null'], 
            description: 'Alert ID for updates, null for new alerts' 
          },
          alertName: { 
            type: 'string', 
            description: 'Name of the alert' 
          },
          alertDataType: { 
            type: 'string',
            enum: ['crashes', 'sessions', 'users', 'events', 'views', 'cohorts', 'dataPoints', 'nps', 'onlineUsers', 'profile_groups', 'rating', 'revenue', 'survey'],
            description: 'Type of data to monitor. Options: crashes (Crash analytics), sessions (Session analytics), users (User analytics), events (Custom events), views (View/screen analytics), cohorts (Cohort monitoring), dataPoints (Data point usage), nps (NPS survey), onlineUsers (Concurrent users), profile_groups (Profile group analytics), rating (Rating widget), revenue (Revenue tracking), survey (Survey responses)'
          },
          alertDataSubType: { 
            type: 'string',
            description: 'Specific metric to monitor. For crashes: "# of crashes/errors", "non-fatal crashes/errors per session", "fatal crashes/errors per session", "new crash/error". For sessions: "average session duration", "# of sessions". For users: "# of users", "# of new users". For events: "count", "sum", "duration", "average sum", "average duration". For views: "bounce rate", "# of page views". For cohorts: "# of users in the cohort". For profile_groups: "# of users in the profile group". For dataPoints: "total data points". For onlineUsers: "t" (# of online users), "o" (overall record), "m" (30-day record). For nps/rating/survey: "# of responses", "new NPS response", "new rating response", "new survey response". For revenue: "total revenue", "average revenue per user", "average revenue per paying user", "# of paying users"'
          },
          alertDataSubType2: { 
            type: ['string', 'null'], 
            description: 'Additional subtype ID when applicable. Required for: events (event key), views (view ID), cohorts (cohort ID), profile_groups (group ID), survey (widget ID), nps (widget ID), rating (widget ID)' 
          },
          compareType: { 
            type: ['string', 'null'],
            enum: ['increased', 'decreased', 'more', 'less', null],
            description: 'Comparison operator. Use "increased"/"decreased" for percentage changes over time periods. Use "more"/"less" for absolute value comparisons (especially for onlineUsers). Set to null for metrics like "new crash/error" that don\'t support comparison'
          },
          period: { 
            type: ['string', 'null'],
            enum: ['daily', 'monthly', 'hourly', null],
            description: 'Time period for comparison. "daily" (last day), "monthly" (last month), "hourly" (last hour). Set to null for metrics like "new crash/error", onlineUsers records (o, m) that don\'t use periods. Note: hourly not available when filters are applied'
          },
          compareValue: { 
            type: ['string', 'null'], 
            description: 'Threshold value or percentage for the alert. For percentage comparisons (increased/decreased): use "10" for 10%. For absolute comparisons (more/less): use actual number like "100". Set to null for metrics without comparison' 
          },
          compareValue2: {
            type: ['string', 'null'],
            description: 'Secondary value for onlineUsers type "t" - represents minutes for the condition'
          },
          selectedApps: { 
            type: 'array',
            items: { type: 'string' },
            description: 'Array of app IDs to monitor. Use single app ID in array for most alerts. Can use "all" for dataPoints type if user is global admin' 
          },
          filterKey: { 
            type: ['string', 'null'], 
            description: 'Optional filter key. For crashes: "App Version". For events: custom segment name. For rating: "Rating". For nps: "NPS scale". Set to null if no filter' 
          },
          filterValue: { 
            type: ['string', 'array', 'null'], 
            description: 'Optional filter value. For crashes: array of version strings (e.g. ["22:02:0"]). For rating: array of numbers 1-5. For nps: "detractor"/"passive"/"promoter". For events: string value. Set to null if no filter' 
          },
          alertBy: { 
            type: 'string',
            enum: ['email', 'hook'],
            description: 'How to deliver the alert. "email" for email notifications, "hook" for webhooks' 
          },
          enabled: { 
            type: 'boolean', 
            description: 'Whether the alert is active' 
          },
          compareDescribe: { 
            type: 'string', 
            description: 'Human-readable description of the alert condition. Will be auto-generated based on other fields if not provided' 
          },
          alertValues: { 
            type: 'array',
            items: { type: 'string', format: 'email' },
            description: 'IMPORTANT: Email addresses to send alerts to. MUST be valid email addresses (e.g., "user@example.com"). Required when alertBy is "email". For webhooks (alertBy="hook"), provide webhook URLs instead. Do not use placeholder or random emails - always specify actual recipient email addresses.',
            minItems: 1
          },
          allGroups: {
            type: 'array',
            items: { type: 'string' },
            description: 'Optional array of user group IDs to notify (requires groups plugin). Use instead of alertValues when sending to groups. Must have at least one email in alertValues OR one group in allGroups.'
          }
        },
        required: ['alertName', 'alertDataType', 'alertDataSubType', 'selectedApps', 'alertBy', 'enabled', 'compareDescribe', 'alertValues']
      },
    },
    anyOf: [
      { required: ['app_id', 'alert_config'] },
      { required: ['app_name', 'alert_config'] }
    ],
  },
};

export async function handleCreateAlert(context: ToolContext, args: any): Promise<ToolResult> {
  const app_id = await context.resolveAppId(args);
  const { alert_config } = args;
  
  const params = {
    ...context.getAuthParams(),
    app_id,
    alert_config: typeof alert_config === 'string' ? alert_config : JSON.stringify(alert_config),
  };

  const response = await context.httpClient.get('/i/alert/save', { params });
  
  return {
    content: [
      {
        type: 'text',
        text: `Alert created/updated for app ${app_id}:\n${JSON.stringify(response.data, null, 2)}`,
      },
    ],
  };
}

// ============================================================================
// DELETE_ALERT TOOL
// ============================================================================

export const deleteAlertToolDefinition = {
  name: 'delete_alert',
  description: 'Delete an alert',
  inputSchema: {
    type: 'object',
    properties: {
      app_id: { type: 'string', description: 'Application ID (optional if app_name is provided)' },
      app_name: { type: 'string', description: 'Application name (alternative to app_id)' },
      alert_id: { type: 'string', description: 'Alert ID to delete' },
    },
    anyOf: [
      { required: ['app_id', 'alert_id'] },
      { required: ['app_name', 'alert_id'] }
    ],
  },
};

export async function handleDeleteAlert(context: ToolContext, args: any): Promise<ToolResult> {
  const app_id = await context.resolveAppId(args);
  const { alert_id } = args;
  
  const params = {
    ...context.getAuthParams(),
    app_id,
    alertID: alert_id,
  };

  const response = await context.httpClient.get('/i/alert/delete', { params });
  
  return {
    content: [
      {
        type: 'text',
        text: `Alert ${alert_id} deleted from app ${app_id}:\n${JSON.stringify(response.data, null, 2)}`,
      },
    ],
  };
}

// ============================================================================
// LIST_ALERTS TOOL
// ============================================================================

export const listAlertsToolDefinition = {
  name: 'list_alerts',
  description: 'List all alerts for an application',
  inputSchema: {
    type: 'object',
    properties: {
      app_id: { type: 'string', description: 'Application ID (optional if app_name is provided)' },
      app_name: { type: 'string', description: 'Application name (alternative to app_id)' },
    },
    anyOf: [
      { required: ['app_id'] },
      { required: ['app_name'] }
    ],
  },
};

export async function handleListAlerts(context: ToolContext, args: any): Promise<ToolResult> {
  const app_id = await context.resolveAppId(args);
  
  const params = {
    ...context.getAuthParams(),
    app_id,
  };

  const response = await context.httpClient.get('/o/alert/list', { params });
  
  return {
    content: [
      {
        type: 'text',
        text: `Alerts for app ${app_id}:\n${JSON.stringify(response.data, null, 2)}`,
      },
    ],
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export const alertsToolDefinitions = [
  createAlertToolDefinition,
  deleteAlertToolDefinition,
  listAlertsToolDefinition,
];

export const alertsToolHandlers = {
  'create_alert': 'createAlert',
  'delete_alert': 'deleteAlert',
  'list_alerts': 'listAlerts',
} as const;

export class AlertsTools {
  constructor(private context: ToolContext) {}

  async createAlert(args: any): Promise<ToolResult> {
    return handleCreateAlert(this.context, args);
  }

  async deleteAlert(args: any): Promise<ToolResult> {
    return handleDeleteAlert(this.context, args);
  }

  async listAlerts(args: any): Promise<ToolResult> {
    return handleListAlerts(this.context, args);
  }
}

// Metadata for dynamic routing (must be after class declaration)
export const alertsToolMetadata = {
  instanceKey: 'alerts',
  toolClass: AlertsTools,
  handlers: alertsToolHandlers,
} as const;
