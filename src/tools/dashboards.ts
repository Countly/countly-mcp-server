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
 * Tool: list_dashboards
 * List all available dashboards for the current user
 */
export const listDashboardsTool = {
  name: 'list_dashboards',
  description: 'List all available dashboards for the current user',
  inputSchema: z.object({
    just_schema: z.boolean()
      .optional()
      .default(true)
      .describe('Whether to return just the schema without data'),
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
 * Tool: get_dashboard_data
 * Get widgets and data for a specific dashboard
 */
export const getDashboardDataTool = {
  name: 'get_dashboard_data',
  description: 'Get widgets and data for a specific dashboard with optional period filtering',
  inputSchema: z.object({
    dashboard_id: z.string()
      .describe('Dashboard ID to retrieve'),
    period: z.string()
      .optional()
      .default('30days')
      .describe('Time period for data. Possible values: "month", "60days", "30days", "7days", "yesterday", "hour", or custom range as [startMilliseconds,endMilliseconds]'),
    action: z.string()
      .optional()
      .default('')
      .describe('Optional action parameter'),
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
 * Tool: create_dashboard
 * Create a new dashboard
 */
export const createDashboardTool = {
  name: 'create_dashboard',
  description: 'Create a new dashboard with specified settings',
  inputSchema: z.object({
    name: z.string()
      .describe('Dashboard name'),
    share_with: z.string()
      .optional()
      .default('all-users')
      .describe('Sharing settings: "all-users", "selected-users", or "none"'),
    send_email_invitation: z.boolean()
      .optional()
      .default(false)
      .describe('Whether to send email invitations to shared users'),
    use_refresh_rate: z.boolean()
      .optional()
      .default(true)
      .describe('Whether to enable auto-refresh'),
    refreshRate: z.number()
      .optional()
      .default(30)
      .describe('Auto-refresh rate in seconds'),
    theme: z.number()
      .optional()
      .default(0)
      .describe('Dashboard theme (0 for default)'),
  }),
};

async function handleCreateDashboard(args: z.infer<typeof createDashboardTool.inputSchema>, context: ToolContext) {
  const params = {
    ...context.getAuthParams(),
    name: args.name,
    share_with: args.share_with,
    send_email_invitation: args.send_email_invitation ? 'true' : 'false',
    use_refresh_rate: args.use_refresh_rate ? 'true' : 'false',
    refreshRate: args.refreshRate.toString(),
    theme: args.theme.toString(),
  };

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
 * Tool: update_dashboard
 * Update an existing dashboard
 */
export const updateDashboardTool = {
  name: 'update_dashboard',
  description: 'Update an existing dashboard configuration',
  inputSchema: z.object({
    dashboard_id: z.string()
      .describe('Dashboard ID to update'),
    name: z.string()
      .optional()
      .describe('Dashboard name'),
    share_with: z.string()
      .optional()
      .describe('Sharing settings: "all-users", "selected-users", or "none"'),
    theme: z.number()
      .optional()
      .describe('Dashboard theme'),
    use_refresh_rate: z.boolean()
      .optional()
      .describe('Whether to enable auto-refresh'),
    refreshRate: z.number()
      .optional()
      .describe('Auto-refresh rate in seconds'),
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
 * Tool: delete_dashboard
 * Delete a dashboard
 */
export const deleteDashboardTool = {
  name: 'delete_dashboard',
  description: 'Delete a dashboard',
  inputSchema: z.object({
    dashboard_id: z.string()
      .describe('Dashboard ID to delete'),
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
 * Tool: add_dashboard_widget
 * Add a widget to a dashboard
 */
export const addDashboardWidgetTool = {
  name: 'add_dashboard_widget',
  description: 'Add a widget to a dashboard. Widgets can display various metrics like analytics, events, or custom data.',
  inputSchema: z.object({
    dashboard_id: z.string()
      .describe('Dashboard ID to add widget to'),
    widget: z.object({
      title: z.string().describe('Widget title'),
      feature: z.string().describe('Feature type (e.g., "core", "events", "crashes")'),
      widget_type: z.string().describe('Widget type (e.g., "analytics", "events", "top-events")'),
      app_count: z.string().optional().describe('App count type: "single" or "multiple"'),
      data_type: z.string().optional().describe('Data type (e.g., "session", "user", "event")'),
      metrics: z.array(z.string()).optional().describe('Metrics to display (e.g., ["t"] for total sessions, ["u"] for users)'),
      apps: z.array(z.string()).optional().describe('Array of app IDs to include'),
      visualization: z.string().optional().describe('Visualization type (e.g., "time-series", "bar", "pie", "number")'),
      custom_period: z.string().optional().describe('Custom period if different from dashboard period'),
    }).passthrough().describe('Widget configuration object'),
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
 * Tool: update_dashboard_widget
 * Update a widget in a dashboard
 */
export const updateDashboardWidgetTool = {
  name: 'update_dashboard_widget',
  description: 'Update a widget in a dashboard (e.g., change position, size, or configuration)',
  inputSchema: z.object({
    dashboard_id: z.string()
      .describe('Dashboard ID containing the widget'),
    widget_id: z.string()
      .describe('Widget ID to update'),
    widget: z.object({
      position: z.array(z.number()).optional().describe('Widget position [x, y] in grid'),
      size: z.array(z.number()).optional().describe('Widget size [width, height] in grid units'),
    }).passthrough().describe('Widget update data (position, size, or other properties)'),
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
 * Tool: remove_dashboard_widget
 * Remove a widget from a dashboard
 */
export const removeDashboardWidgetTool = {
  name: 'remove_dashboard_widget',
  description: 'Remove a widget from a dashboard',
  inputSchema: z.object({
    dashboard_id: z.string()
      .describe('Dashboard ID containing the widget'),
    widget_id: z.string()
      .describe('Widget ID to remove'),
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
  [listDashboardsTool.name]: handleListDashboards,
  [getDashboardDataTool.name]: handleGetDashboardData,
  [createDashboardTool.name]: handleCreateDashboard,
  [updateDashboardTool.name]: handleUpdateDashboard,
  [deleteDashboardTool.name]: handleDeleteDashboard,
  [addDashboardWidgetTool.name]: handleAddDashboardWidget,
  [updateDashboardWidgetTool.name]: handleUpdateDashboardWidget,
  [removeDashboardWidgetTool.name]: handleRemoveDashboardWidget,
};

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
