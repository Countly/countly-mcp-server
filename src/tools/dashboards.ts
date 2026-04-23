/**
 * Dashboards Tools
 * 
 * Tools for managing custom dashboards with KPI widgets.
 * 
 * Requires: dashboards plugin
 */

import { z } from 'zod';
import { safeApiCall } from '../lib/error-handler.js';
import type { ToolContext } from './types.js';

/**
 * Tool: dashboards_list
 * List all available dashboards for the current user
 */
export const listDashboardsTool = {
  name: 'dashboards_list',
  description: 'List custom dashboards accessible to the current user via /o/dashboards/all. Requires the dashboards plugin. For widgets and live data of one dashboard use dashboards_data.',
  inputSchema: z.object({
    just_schema: z.boolean()
      .optional()
      .default(true)
      .describe('When true, return dashboard metadata and widget layout without running widget queries (faster). Defaults to true.'),
  }),
};

async function handleListDashboards(args: z.infer<typeof listDashboardsTool.inputSchema>, context: ToolContext) {
  const params = {
    ...context.getAuthParams(),
    just_schema: args.just_schema ? 'true' : 'false',
  };

  const response = await safeApiCall(
    () => context.httpClient.get('/o/dashboards/all', { params }),
    'Failed to list dashboards'
  );

  return {
    content: [
      {
        type: 'text' as const,
        text: `Available dashboards:\n\n${JSON.stringify(response.data, null, 2)}`,
      },
    ],
  };
}

/**
 * Tool: dashboards_data
 * Get widgets and data for a specific dashboard
 */
export const getDashboardDataTool = {
  name: 'dashboards_data',
  description: 'Get a dashboard including its widgets and computed data for the given period via /o/dashboards. Requires the dashboards plugin. To list dashboards use dashboards_list.',
  inputSchema: z.object({
    dashboard_id: z.string()
      .describe('Dashboard identifier to retrieve. Obtain it from dashboards_list.'),
    period: z.string()
      .optional()
      .default('30days')
      .describe('Time period. One of "month", "60days", "30days", "7days", "yesterday", "hour", or a custom range as [startMilliseconds,endMilliseconds]. Defaults to "30days".'),
    action: z.string()
      .optional()
      .default('')
      .describe('Optional action passthrough (e.g. "refresh"). Defaults to empty string.'),
  }),
};

async function handleGetDashboardData(args: z.infer<typeof getDashboardDataTool.inputSchema>, context: ToolContext) {
  const params = {
    ...context.getAuthParams(),
    dashboard_id: args.dashboard_id,
    period: args.period,
    action: args.action,
  };

  const response = await safeApiCall(
    () => context.httpClient.get('/o/dashboards', { params }),
    `Failed to get dashboard data: ${args.dashboard_id}`
  );

  return {
    content: [
      {
        type: 'text' as const,
        text: `Dashboard data for ${args.dashboard_id} (period: ${args.period}):\n\n${JSON.stringify(response.data, null, 2)}`,
      },
    ],
  };
}

/**
 * Tool: dashboards_create
 * Create a new dashboard
 */
export const createDashboardTool = {
  name: 'dashboards_create',
  description: 'Create an empty custom dashboard via /i/dashboards/create. Requires the dashboards plugin. Add widgets afterwards with dashboards_widget_add.',
  inputSchema: z.object({
    name: z.string()
      .describe('Display name for the dashboard.'),
    share_with: z.string()
      .optional()
      .default('all-users')
      .describe('Sharing mode: "all-users" (everyone), "selected-users" (specific accounts), or "none" (creator only). Defaults to "all-users".'),
    send_email_invitation: z.boolean()
      .optional()
      .default(false)
      .describe('When true, email shared users about the new dashboard. Defaults to false.'),
    use_refresh_rate: z.boolean()
      .optional()
      .default(true)
      .describe('When true, auto-refresh widgets on the interval in refreshRate. Defaults to true.'),
    refreshRate: z.number()
      .optional()
      .default(30)
      .describe('Auto-refresh interval in seconds (used when use_refresh_rate=true). Defaults to 30.'),
    theme: z.number()
      .optional()
      .default(0)
      .describe('Theme index (0 = default). Defaults to 0.'),
  }),
};

async function handleCreateDashboard(args: z.infer<typeof createDashboardTool.inputSchema>, context: ToolContext) {
  const params: Record<string, string> = {
    ...context.getAuthParams(),
    name: args.name,
    share_with: args.share_with || 'all-users',
    send_email_invitation: args.send_email_invitation ? 'true' : 'false',
    use_refresh_rate: args.use_refresh_rate ? 'true' : 'false',
    theme: (args.theme ?? 0).toString(),
  };

  if (args.refreshRate !== undefined) {
    params.refreshRate = args.refreshRate.toString();
  }

  const response = await safeApiCall(
    () => context.httpClient.get('/i/dashboards/create', { params }),
    'Failed to create dashboard'
  );

  return {
    content: [
      {
        type: 'text' as const,
        text: `Dashboard created successfully:\n\n${JSON.stringify(response.data, null, 2)}`,
      },
    ],
  };
}

/**
 * Tool: dashboards_update
 * Update an existing dashboard
 */
export const updateDashboardTool = {
  name: 'dashboards_update',
  description: 'Update settings on an existing dashboard (name, sharing, theme, refresh) via /i/dashboards/update. Only supplied fields change. Requires the dashboards plugin. For widget changes use dashboards_widget_update.',
  inputSchema: z.object({
    dashboard_id: z.string()
      .describe('Dashboard identifier to update. Obtain it from dashboards_list.'),
    name: z.string()
      .optional()
      .describe('New display name. Omit to keep current.'),
    share_with: z.string()
      .optional()
      .describe('New sharing mode: "all-users", "selected-users", or "none". Omit to keep current.'),
    theme: z.number()
      .optional()
      .describe('New theme index. Omit to keep current.'),
    use_refresh_rate: z.boolean()
      .optional()
      .describe('Enable or disable auto-refresh. Omit to keep current.'),
    refreshRate: z.number()
      .optional()
      .describe('New auto-refresh interval in seconds. Omit to keep current.'),
  }),
};

async function handleUpdateDashboard(args: z.infer<typeof updateDashboardTool.inputSchema>, context: ToolContext) {
  const params: Record<string, string> = {
    ...context.getAuthParams(),
    dashboard_id: args.dashboard_id,
  };

  if (args.name !== undefined) {
    params.name = args.name;
  }
  if (args.share_with !== undefined) {
    params.share_with = args.share_with;
  }
  if (args.theme !== undefined) {
    params.theme = args.theme.toString();
  }
  if (args.use_refresh_rate !== undefined) {
    params.use_refresh_rate = args.use_refresh_rate ? 'true' : 'false';
  }
  if (args.refreshRate !== undefined) {
    params.refreshRate = args.refreshRate.toString();
  }

  const response = await safeApiCall(
    () => context.httpClient.get('/i/dashboards/update', { params }),
    `Failed to update dashboard: ${args.dashboard_id}`
  );

  return {
    content: [
      {
        type: 'text' as const,
        text: `Dashboard updated successfully:\n\n${JSON.stringify(response.data, null, 2)}`,
      },
    ],
  };
}

/**
 * Tool: dashboards_delete
 * Delete a dashboard
 */
export const deleteDashboardTool = {
  name: 'dashboards_delete',
  description: 'Delete a custom dashboard and all its widgets via /i/dashboards/delete. Requires the dashboards plugin. WARNING: irreversible.',
  inputSchema: z.object({
    dashboard_id: z.string()
      .describe('Dashboard identifier to delete. Obtain it from dashboards_list.'),
  }),
};

async function handleDeleteDashboard(args: z.infer<typeof deleteDashboardTool.inputSchema>, context: ToolContext) {
  const params = {
    ...context.getAuthParams(),
    dashboard_id: args.dashboard_id,
  };

  const response = await safeApiCall(
    () => context.httpClient.get('/i/dashboards/delete', { params }),
    `Failed to delete dashboard: ${args.dashboard_id}`
  );

  return {
    content: [
      {
        type: 'text' as const,
        text: `Dashboard deleted successfully:\n\n${JSON.stringify(response.data, null, 2)}`,
      },
    ],
  };
}

/**
 * Tool: dashboards_widget_add
 * Add a widget to a dashboard
 */
export const addDashboardWidgetTool = {
  name: 'dashboards_widget_add',
  description: 'Add a widget (analytics, events, crashes, drill, SDK, cohorts, formulas, push, funnels, revenue, times-of-day, retention, users, or note) to a dashboard via /i/dashboards/add-widget. Requires the dashboards plugin. The widget object must be complete for its widget_type; see the widget.description examples.',
  inputSchema: z.object({
    dashboard_id: z.string()
      .describe('Dashboard identifier to add the widget to. Obtain it from dashboards_list.'),
    widget: z.object({
      title: z.string()
        .describe('Widget title (can be empty string)'),
      feature: z.string()
        .describe('Feature type: "core" (analytics/sessions), "events" (event data), "crashes" (crash analytics), "drill" (custom queries), "sdk" (SDK stats), "cohorts" (user cohorts), "formulas" (custom formulas), "push" (push notifications), "funnels" (conversion funnels), "revenue" (revenue tracking), "times_of_day" (session timing), "retention_segments" (retention analysis), "users" (user profiles)'),
      widget_type: z.string()
        .describe('Widget type: "analytics" (session/user metrics), "events" (event tracking), "drill" (custom drill queries), "sdk" (SDK statistics), "cohorts" (cohort visualization), "formulas" (formula results), "note" (text note), "push" (push message stats), "funnels" (funnel visualization), "revenue" (revenue charts), "times-of-day" (time-based heatmap), "retention_segments" (retention charts), "crashes" (crash metrics), "users" (user table)'),
      app_count: z.string()
        .optional()
        .describe('App count type: "single" (one app) or "multiple" (multiple apps). Required for analytics, events, crashes widgets.'),
      data_type: z.string()
        .optional()
        .describe('Data type: "session" (session metrics), "user" (user metrics), "event" (event metrics), "sdk" (SDK statistics). Required for analytics/sdk widgets.'),
      metrics: z.array(z.string())
        .optional()
        .describe('Metrics array. Analytics: ["t"] (total), ["u"] (unique users), ["n"] (new users), ["d"] (duration), ["e"] (events). Events: ["c"] (count), ["s"] (sum), ["dur"] (duration). Crashes: ["crf"] (crash-free rate), ["crnf"] (crash-free new users), ["cruf"] (unique crashes). Push: ["sent"], ["actioned"]. Can combine multiple.'),
      apps: z.array(z.string())
        .optional()
        .describe('Array of app IDs. Use ["*"] for all apps. Required for most widgets except note widgets.'),
      visualization: z.string()
        .optional()
        .describe('Visualization: "time-series" (line chart over time), "bar" (bar chart), "pie" (pie chart), "number" (single number), "table" (data table), "line" (simple line), "series" (for formulas), "punchcard" (heatmap for times_of_day), "over-time" (for cohorts).'),
      custom_period: z.string().nullable()
        .optional()
        .describe('Time period: "30days", "7days", "60days", "yesterday", "month", "hour", null (dashboard default), "false" (no override), "true" (use query period), or empty string "".'),
      position: z.array(z.number())
        .optional()
        .describe('Widget position [x, y] in dashboard grid. Auto-positioned if not specified. Examples: [0, 0] (top-left), [4, 0] (second column), [0, 4] (first column, second row).'),
      size: z.array(z.number())
        .optional()
        .describe('Widget size [width, height] in grid units. Default [4, 4]. Common: [4, 4] (small square), [6, 4] (wide), [8, 4] (extra wide), [4, 6] (tall), [2, 4] (narrow), [1, 3] (note). Max width usually 12.'),
      // SDK widget specific
      displaytype: z.string()
        .optional()
        .describe('SDK widget display: "percentage" (show as %), "number" (show as count). Only for widget_type="sdk".'),
      selectedSDK: z.string()
        .optional()
        .describe('Selected SDK: "javascript_native_web", "java-native-android", "ios", etc. Only for widget_type="sdk".'),
      // Drill widget specific
      drill_query: z.array(z.object({
        _id: z.string().optional(),
        period: z.string().optional(),
      }))
        .optional()
        .describe('Drill query config. Array with {_id: "bookmark_id", period: "true"/"false" as string}. Only for widget_type="drill".'),
      drill_report: z.array(z.string())
        .optional()
        .describe('Drill report IDs array. Only for widget_type="drill" or "users".'),
      metric: z.array(z.string())
        .optional()
        .describe('Metric array for drill: ["users"], ["times"], ["sum"]. Only for widget_type="drill".'),
      bucket: z.string()
        .optional()
        .describe('Bucket interval: "daily", "weekly", "monthly". Only for widget_type="drill".'),
      comparison: z.string()
        .optional()
        .describe('Comparison type (usually empty string ""). Only for drill/formulas widgets.'),
      bar_color: z.number()
        .optional()
        .describe('Bar color index (1-10). Only for drill/funnels widgets.'),
      isPluginWidget: z.boolean()
        .optional()
        .describe('True for plugin widgets (drill, cohorts, formulas, push, funnels, revenue, times_of_day, retention_segments, users).'),
      // Events widget specific
      events: z.array(z.string())
        .optional()
        .describe('Event keys in format "app_id***Event Name". Only for widget_type="events".'),
      // Cohorts widget specific
      cohorts: z.array(z.string())
        .optional()
        .describe('Cohort IDs array. Only for widget_type="cohorts".'),
      visualitionType: z.string()
        .optional()
        .describe('Cohort visualization: "over-time". Only for widget_type="cohorts".'),
      barChartTotalUsers: z.string()
        .optional()
        .describe('Bar chart total users setting (e.g., "1"). Only for widget_type="cohorts".'),
      selectedPeriod: z.string()
        .optional()
        .describe('Selected period (e.g., "30days"). Only for widget_type="cohorts".'),
      // Formulas widget specific
      cmetric_refs: z.array(z.object({
        _id: z.string().optional(),
        period: z.string().optional(),
        bucket: z.string().optional(),
        previous: z.boolean().optional(),
      }))
        .optional()
        .describe('Formula metric references. Array with {_id: "formula_id", period: "true" as string, bucket: "daily", previous: false}. Only for widget_type="formulas".'),
      cmetricName: z.string()
        .optional()
        .describe('Custom metric name (can be empty). Only for widget_type="formulas".'),
      cmetrics: z.array(z.string())
        .optional()
        .describe('Custom metric IDs array. Only for widget_type="formulas".'),
      statsMetric: z.string()
        .optional()
        .describe('Stats metric (usually empty). Only for widget_type="formulas".'),
      allowPeriodOverride: z.boolean()
        .optional()
        .describe('Allow period override. For drill/formulas/users widgets.'),
      // Note widget specific
      contenthtml: z.string()
        .optional()
        .describe('HTML content for note. Only for widget_type="note". Example: "&lt;p&gt;This is a note&lt;/p&gt;".'),
      // Funnels widget specific
      funnel_type: z.array(z.string())
        .optional()
        .describe('Funnel type IDs in format "app_id***funnel_id". Only for widget_type="funnels".'),
      funnel_view_type: z.string()
        .optional()
        .describe('Funnel view type (e.g., "1"). Only for widget_type="funnels".'),
      client_fetch: z.boolean()
        .optional()
        .describe('Client fetch flag. Only for widget_type="funnels".'),
      filter_id: z.string()
        .optional()
        .describe('Filter ID ("0" or filter ID string). Only for widget_type="funnels".'),
      // Revenue widget specific
      revenue_type: z.string()
        .optional()
        .describe('Revenue type: "revenue", "iap", etc. Only for widget_type="revenue".'),
      revenue_types: z.array(z.string())
        .optional()
        .describe('Revenue types array (can be empty). Only for widget_type="revenue".'),
      metric_compare_type: z.string()
        .optional()
        .describe('Metric compare: "prev_period", "none". Only for widget_type="revenue".'),
      // Times of day widget specific
      period: z.string()
        .optional()
        .describe('Period for times_of_day/retention_segments: "current", "d30". Only for widget_type="times-of-day"/"retention_segments".'),
      visualization_graph_type: z.string()
        .optional()
        .describe('Graph type: "graph1". Only for widget_type="retention_segments".'),
      // Retention widget specific
      retention_data_type: z.string()
        .optional()
        .describe('Retention data type: "[CLY]_session", event key. Only for widget_type="retention_segments".'),
      retention_type: z.string()
        .optional()
        .describe('Retention type: "full", "classic", "rolling". Only for widget_type="retention_segments".'),
      interval: z.string()
        .optional()
        .describe('Interval: "adaily", "aweekly", "amonthly". Only for widget_type="retention_segments".'),
      visualization_type: z.string()
        .optional()
        .describe('Visualization type for retention: "time-series", "table". Only for widget_type="retention_segments".'),
      selected_span: z.number()
        .optional()
        .describe('Selected span (e.g., 30). Only for widget_type="retention_segments".'),
      // Users widget specific
      numberOfResults: z.number()
        .optional()
        .describe('Number of results to show (e.g., 10). Only for widget_type="users".'),
      selectedQueries: z.array(z.string())
        .optional()
        .describe('Selected query IDs for user filtering. Only for widget_type="users".'),
      visibleColumns: z.array(z.string())
        .optional()
        .describe('Visible columns: ["name", "cc", "d", "p", "sc", "picture"]. Only for widget_type="users".'),
      status: z.string()
        .optional()
        .describe('Widget status: "completed". Auto-managed by system.'),
      allowBuckets: z.boolean()
        .optional()
        .describe('Allow buckets. For drill widgets.'),
    }).passthrough()
      .describe('Widget configuration object. Different widget types require different fields.\n\n**Analytics (Session) - Basic:**\n{"title": "Sessions", "feature": "core", "widget_type": "analytics", "app_count": "single", "data_type": "session", "metrics": ["t", "u", "n"], "apps": ["app_id"], "visualization": "time-series", "custom_period": "30days", "position": [0, 0], "size": [4, 4]}\n\n**Events Widget:**\n{"title": "", "feature": "events", "widget_type": "events", "app_count": "single", "apps": ["app_id"], "visualization": "time-series", "events": ["app_id***Event Name"], "metrics": ["c", "s", "dur"], "custom_period": null, "position": [4, 0], "size": [4, 4]}\n\n**SDK Widget:**\n{"title": "", "feature": "sdk", "widget_type": "sdk", "data_type": "sdk", "metrics": ["t"], "apps": ["app_id"], "visualization": "time-series", "displaytype": "percentage", "selectedSDK": "java-native-android", "custom_period": null, "position": [0, 4], "size": [4, 4]}\n\n**Cohorts Widget:**\n{"title": "", "feature": "cohorts", "widget_type": "cohorts", "apps": ["app_id"], "cohorts": ["cohort_id"], "visualitionType": "over-time", "barChartTotalUsers": "1", "selectedPeriod": "30days", "isPluginWidget": true, "position": [0, 4], "size": [2, 4]}\n\n**Formulas Widget:**\n{"title": "", "feature": "formulas", "apps": ["app_id"], "cmetric_refs": [{"_id": "formula_id", "period": true, "bucket": "daily", "previous": false}], "widget_type": "formulas", "cmetricName": "", "comparison": "none", "visualization": "series", "statsMetric": "", "bucket": "daily", "custom_period": false, "isPluginWidget": true, "cmetrics": ["metric_hash"], "position": [2, 4], "size": [4, 4], "allowPeriodOverride": true}\n\n**Note Widget:**\n{"widget_type": "note", "feature": "core", "apps": "*", "contenthtml": "&lt;p&gt;This is a note&lt;/p&gt;", "position": [6, 4], "size": [1, 3]}\n\n**Push Widget:**\n{"title": "", "feature": "push", "widget_type": "push", "isPluginWidget": true, "apps": ["app_id"], "app_count": "single", "visualization": "time-series", "metrics": ["sent", "actioned"], "position": [7, 4], "size": [4, 4]}\n\n**Funnels Widget:**\n{"feature": "funnels", "widget_type": "funnels", "apps": ["app_id"], "funnel_type": ["app_id***funnel_id"], "funnel_view_type": "1", "bar_color": 1, "client_fetch": true, "isPluginWidget": true, "custom_period": "", "title": "", "filter_id": 0, "position": [0, 10], "size": [4, 6]}\n\n**Revenue Widget:**\n{"feature": "revenue", "widget_type": "revenue", "isPluginWidget": true, "title": "", "apps": ["app_id"], "custom_period": "", "revenue_type": "revenue", "revenue_types": [], "metric_compare_type": "prev_period", "events": [], "visualization": "time-series", "position": [4, 8], "size": [2, 4]}\n\n**Times of Day Widget:**\n{"title": "", "feature": "times_of_day", "widget_type": "times-of-day", "isPluginWidget": true, "apps": ["app_id"], "data_type": "session", "period": "current", "visualization": "punchcard", "position": [6, 8], "size": [4, 4]}\n\n**Retention Segments Widget:**\n{"feature": "retention_segments", "widget_type": "retention_segments", "apps": ["app_id"], "retention_data_type": "[CLY]_session", "retention_type": "full", "bar_color": 1, "title": "", "interval": "adaily", "visualization_graph_type": "graph1", "period": "d30", "visualization_type": "time-series", "isPluginWidget": true, "selected_span": 30, "position": [4, 14], "size": [4, 6]}\n\n**Crashes Widget:**\n{"title": "", "feature": "crashes", "widget_type": "crashes", "app_count": "single", "apps": ["app_id"], "metrics": ["crf", "crnf", "cruf"], "visualization": "time-series", "isPluginWidget": true, "position": [8, 12], "size": [4, 4]}\n\n**Users Widget:**\n{"title": "", "feature": "users", "widget_type": "users", "app_count": "single", "apps": ["app_id"], "numberOfResults": 10, "selectedQueries": ["query_id"], "visualization": "table", "isPluginWidget": true, "visibleColumns": ["name", "cc", "d", "p", "sc", "picture"], "drill_report": ["report_id"], "position": [8, 16], "size": [4, 6], "status": "completed", "allowPeriodOverride": false}\n\n**Drill Widget (Advanced):**\n{"feature": "drill", "widget_type": "drill", "apps": ["app_id"], "drill_query": [{"_id": "bookmark_id", "period": true}], "visualization": "line", "metric": ["users", "times"], "comparison": "", "bucket": "daily", "custom_period": false, "title": "", "isPluginWidget": true, "bar_color": 1, "drill_report": ["report_id"], "position": [8, 0], "size": [4, 4], "status": "completed", "allowPeriodOverride": true, "allowBuckets": true}'),
  }),
};

async function handleAddDashboardWidget(args: z.infer<typeof addDashboardWidgetTool.inputSchema>, context: ToolContext) {
  const params = {
    ...context.getAuthParams(),
    dashboard_id: args.dashboard_id,
    widget: JSON.stringify(args.widget),
  };

  const response = await safeApiCall(
    () => context.httpClient.get('/i/dashboards/add-widget', { params }),
    `Failed to add widget to dashboard: ${args.dashboard_id}`
  );

  return {
    content: [
      {
        type: 'text' as const,
        text: `Widget added successfully:\n\n${JSON.stringify(response.data, null, 2)}`,
      },
    ],
  };
}

/**
 * Tool: dashboards_widget_update
 * Update a widget in a dashboard
 */
export const updateDashboardWidgetTool = {
  name: 'dashboards_widget_update',
  description: 'Update fields on an existing dashboard widget (commonly position, size, or config) via /i/dashboards/update-widget. Requires the dashboards plugin. To remove a widget use dashboards_widget_remove.',
  inputSchema: z.object({
    dashboard_id: z.string()
      .describe('Dashboard identifier that owns the widget. Obtain it from dashboards_list.'),
    widget_id: z.string()
      .describe('Widget identifier to update. Obtain it from dashboards_data.'),
    widget: z.object({
      position: z.array(z.number()).optional().describe('New [x, y] position in the dashboard grid.'),
      size: z.array(z.number()).optional().describe('New [width, height] in grid units.'),
    }).passthrough().describe('Partial widget object with the fields to change (e.g. position, size, visualization, metrics). Other widget-config fields are accepted passthrough.'),
  }),
};

async function handleUpdateDashboardWidget(args: z.infer<typeof updateDashboardWidgetTool.inputSchema>, context: ToolContext) {
  const params = {
    ...context.getAuthParams(),
    dashboard_id: args.dashboard_id,
    widget_id: args.widget_id,
    widget: JSON.stringify(args.widget),
  };

  const response = await safeApiCall(
    () => context.httpClient.get('/i/dashboards/update-widget', { params }),
    `Failed to update widget ${args.widget_id} in dashboard ${args.dashboard_id}`
  );

  return {
    content: [
      {
        type: 'text' as const,
        text: `Widget updated successfully:\n\n${JSON.stringify(response.data, null, 2)}`,
      },
    ],
  };
}

/**
 * Tool: dashboards_widget_remove
 * Remove a widget from a dashboard
 */
export const removeDashboardWidgetTool = {
  name: 'dashboards_widget_remove',
  description: 'Remove a single widget from a dashboard via /i/dashboards/remove-widget. Requires the dashboards plugin. WARNING: irreversible. To delete the whole dashboard use dashboards_delete.',
  inputSchema: z.object({
    dashboard_id: z.string()
      .describe('Dashboard identifier that owns the widget. Obtain it from dashboards_list.'),
    widget_id: z.string()
      .describe('Widget identifier to remove. Obtain it from dashboards_data.'),
  }),
};

async function handleRemoveDashboardWidget(args: z.infer<typeof removeDashboardWidgetTool.inputSchema>, context: ToolContext) {
  const params = {
    ...context.getAuthParams(),
    dashboard_id: args.dashboard_id,
    widget_id: args.widget_id,
  };

  const response = await safeApiCall(
    () => context.httpClient.get('/i/dashboards/remove-widget', { params }),
    `Failed to remove widget ${args.widget_id} from dashboard ${args.dashboard_id}`
  );

  return {
    content: [
      {
        type: 'text' as const,
        text: `Widget removed successfully:\n\n${JSON.stringify(response.data, null, 2)}`,
      },
    ],
  };
}

/**
 * Export all dashboards tool definitions
 */
export const dashboardsToolDefinitions = [
  listDashboardsTool,
  getDashboardDataTool,
  createDashboardTool,
  updateDashboardTool,
  deleteDashboardTool,
  addDashboardWidgetTool,
  updateDashboardWidgetTool,
  removeDashboardWidgetTool,
];

/**
 * Export tool handlers map
 */
export const dashboardsToolHandlers = {
  'dashboards_list': 'listDashboards',
  'dashboards_data': 'getDashboardData',
  'dashboards_create': 'createDashboard',
  'dashboards_update': 'updateDashboard',
  'dashboards_delete': 'deleteDashboard',
  'dashboards_widget_add': 'addDashboardWidget',
  'dashboards_widget_update': 'updateDashboardWidget',
  'dashboards_widget_remove': 'removeDashboardWidget',
} as const;

/**
 * Dashboards Tools Class
 * Provides methods for managing dashboards
 */
export class DashboardsTools {
  constructor(private context: ToolContext) {}

  /**
   * List all available dashboards
   */
  async listDashboards(args: z.infer<typeof listDashboardsTool.inputSchema>) {
    return handleListDashboards(args, this.context);
  }

  /**
   * Get dashboard data
   */
  async getDashboardData(args: z.infer<typeof getDashboardDataTool.inputSchema>) {
    return handleGetDashboardData(args, this.context);
  }

  /**
   * Create a dashboard
   */
  async createDashboard(args: z.infer<typeof createDashboardTool.inputSchema>) {
    return handleCreateDashboard(args, this.context);
  }

  /**
   * Update a dashboard
   */
  async updateDashboard(args: z.infer<typeof updateDashboardTool.inputSchema>) {
    return handleUpdateDashboard(args, this.context);
  }

  /**
   * Delete a dashboard
   */
  async deleteDashboard(args: z.infer<typeof deleteDashboardTool.inputSchema>) {
    return handleDeleteDashboard(args, this.context);
  }

  /**
   * Add widget to dashboard
   */
  async addDashboardWidget(args: z.infer<typeof addDashboardWidgetTool.inputSchema>) {
    return handleAddDashboardWidget(args, this.context);
  }

  /**
   * Update dashboard widget
   */
  async updateDashboardWidget(args: z.infer<typeof updateDashboardWidgetTool.inputSchema>) {
    return handleUpdateDashboardWidget(args, this.context);
  }

  /**
   * Remove dashboard widget
   */
  async removeDashboardWidget(args: z.infer<typeof removeDashboardWidgetTool.inputSchema>) {
    return handleRemoveDashboardWidget(args, this.context);
  }
}

/**
 * Export metadata for dynamic tool routing
 */
export const dashboardsToolMetadata = {
  instanceKey: 'dashboards',
  toolClass: DashboardsTools,
  handlers: dashboardsToolHandlers,
};
