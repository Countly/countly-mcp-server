/**
 * Email Reports Tools
 *
 * Tools for creating and managing periodic email reports of metrics.
 *
 * Requires: reports plugin
 */

import { safeApiCall } from '../lib/error-handler.js';
import { withDefault } from '../lib/validation.js';
import type { ToolContext, ToolResult } from './types.js';

/**
 * Tool: email_reports_list
 * List all email reports
 */
export const listEmailReportsTool = {
  name: 'email_reports_list',
  description: 'List scheduled email reports (core and dashboard) configured for an app via /o/reports/all. Requires the reports plugin. To create new reports use email_reports_core_create or email_reports_dashboard_create.',
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
    },
  },
};

export async function handleListEmailReports(
  context: ToolContext,
  input: Record<string, unknown>
): Promise<ToolResult> {
  const app_id = await context.resolveAppId(input);

  const params = {
    ...context.getAuthParams(),
    app_id,
  };

  const response = await safeApiCall(
    () => context.httpClient.get('/o/reports/all', { params }),
    'Failed to list email reports'
  );

  return {
    content: [
      {
        type: 'text',
        text: `Email reports for app ${app_id}:\n\n${JSON.stringify(response.data, null, 2)}`,
      },
    ],
  };
}

/**
 * Tool: email_reports_core_create
 * Create a core email report with metrics like analytics, events, crashes
 */
export const createCoreEmailReportTool = {
  name: 'email_reports_core_create',
  description: 'Create a scheduled "core" email report covering analytics, events, crashes, and star-rating for one or more apps via /i/reports/create?report_type=core. Requires the reports plugin. For dashboard-based reports use email_reports_dashboard_create.',
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
      title: {
        type: 'string',
        description: 'Human-readable report title.',
      },
      apps: {
        type: 'array',
        items: { type: 'string' },
        description: 'App IDs to include as data sources in the report (can include apps beyond the one scheduling the report).',
      },
      emails: {
        type: 'array',
        items: { type: 'string' },
        description: 'Recipient email addresses.',
      },
      metrics: {
        type: 'object',
        description: 'Which sections to include. Set each flag to true to include.',
        properties: {
          analytics: {
            type: 'boolean',
            description: 'Include analytics section (sessions, users).',
          },
          events: {
            type: 'boolean',
            description: 'Include events section.',
          },
          crash: {
            type: 'boolean',
            description: 'Include crashes section.',
          },
          'star-rating': {
            type: 'boolean',
            description: 'Include star-rating/feedback section.',
          },
        },
      },
      frequency: {
        type: 'string',
        enum: ['daily', 'weekly', 'monthly'],
        description: 'Send cadence.',
      },
      timezone: {
        type: 'string',
        description: 'IANA timezone used to schedule delivery (e.g. "America/New_York", "Europe/London").',
      },
      day: {
        type: 'number',
        description: 'For "weekly": day of week 0-6 (Sun-Sat). For "monthly": day of month 1-31. Ignored for "daily".',
      },
      hour: {
        type: 'number',
        description: 'Hour of day 0-23 when the report should be sent (in the given timezone).',
      },
      minute: {
        type: 'number',
        description: 'Minute of hour 0-59. Defaults to 0.',
        default: 0,
      },
      selectedEvents: {
        type: 'array',
        items: { type: 'string' },
        description: 'Event keys to highlight, each formatted "app_id***event_key". Used with metrics.events.',
      },
      sendPdf: {
        type: 'boolean',
        description: 'Attach a PDF rendering of the report. Defaults to true.',
        default: true,
      },
    },
    required: ['title', 'apps', 'emails', 'metrics', 'frequency', 'timezone', 'hour'],
  },
};

export async function handleCreateCoreEmailReport(
  context: ToolContext,
  input: Record<string, unknown>
): Promise<ToolResult> {
  const app_id = await context.resolveAppId(input);

  const minute = withDefault(input.minute as number | undefined, 0);
  const sendPdf = withDefault(input.sendPdf as boolean | undefined, true);

  const reportArgs = {
    _id: null,
    title: input.title as string,
    report_type: 'core',
    apps: input.apps as string[],
    emails: input.emails as string[],
    metrics: input.metrics as Record<string, boolean>,
    metricsArray: [],
    frequency: input.frequency as string,
    timezone: input.timezone as string,
    day: (input.day as number | undefined) || null,
    hour: input.hour as number,
    minute,
    dashboards: null,
    date_range: null,
    sendPdf,
    selectedEvents: (input.selectedEvents as string[] | undefined) || [],
  };

  const params = {
    ...context.getAuthParams(),
    app_id,
    args: JSON.stringify(reportArgs),
  };

  const response = await safeApiCall(
    () => context.httpClient.get('/i/reports/create', { params }),
    'Failed to create core email report'
  );

  return {
    content: [
      {
        type: 'text',
        text: `Core email report created successfully:\n\n${JSON.stringify(response.data, null, 2)}`,
      },
    ],
  };
}

/**
 * Tool: email_reports_dashboard_create
 * Create a dashboard email report
 */
export const createDashboardEmailReportTool = {
  name: 'email_reports_dashboard_create',
  description: 'Create a scheduled email report built from a specific custom dashboard via /i/reports/create?report_type=dashboards. Requires the reports plugin (and typically the dashboards plugin for the referenced dashboard). For metric-based reports use email_reports_core_create.',
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
      title: {
        type: 'string',
        description: 'Human-readable report title.',
      },
      emails: {
        type: 'array',
        items: { type: 'string' },
        description: 'Recipient email addresses.',
      },
      dashboards: {
        type: 'string',
        description: 'Dashboard identifier to render. Obtain it from dashboards_list.',
      },
      date_range: {
        type: 'string',
        description: 'Date range evaluated when the report runs (e.g. "7days", "30days", "60days").',
      },
      frequency: {
        type: 'string',
        enum: ['daily', 'weekly', 'monthly'],
        description: 'Send cadence.',
      },
      timezone: {
        type: 'string',
        description: 'IANA timezone for delivery scheduling (e.g. "America/New_York").',
      },
      day: {
        type: 'number',
        description: 'For "weekly": day of week 0-6 (Sun-Sat). For "monthly": day of month 1-31. Ignored for "daily".',
      },
      hour: {
        type: 'number',
        description: 'Hour of day 0-23 when the report should be sent.',
      },
      minute: {
        type: 'number',
        description: 'Minute of hour 0-59. Defaults to 0.',
        default: 0,
      },
      sendPdf: {
        type: 'boolean',
        description: 'Attach a PDF rendering of the dashboard. Defaults to true.',
        default: true,
      },
    },
    required: ['title', 'emails', 'dashboards', 'date_range', 'frequency', 'timezone', 'hour'],
  },
};

export async function handleCreateDashboardEmailReport(
  context: ToolContext,
  input: Record<string, unknown>
): Promise<ToolResult> {
  const app_id = await context.resolveAppId(input);

  const minute = withDefault(input.minute as number | undefined, 0);
  const sendPdf = withDefault(input.sendPdf as boolean | undefined, true);

  const reportArgs = {
    _id: null,
    title: input.title as string,
    report_type: 'dashboards',
    apps: [],
    emails: input.emails as string[],
    metrics: {},
    metricsArray: [],
    frequency: input.frequency as string,
    timezone: input.timezone as string,
    day: (input.day as number | undefined) || null,
    hour: input.hour as number,
    minute,
    dashboards: input.dashboards as string,
    date_range: input.date_range as string,
    sendPdf,
  };

  const params = {
    ...context.getAuthParams(),
    app_id,
    args: JSON.stringify(reportArgs),
  };

  const response = await safeApiCall(
    () => context.httpClient.get('/i/reports/create', { params }),
    'Failed to create dashboard email report'
  );

  return {
    content: [
      {
        type: 'text',
        text: `Dashboard email report created successfully:\n\n${JSON.stringify(response.data, null, 2)}`,
      },
    ],
  };
}

/**
 * Tool: email_reports_update
 * Update an existing email report
 */
export const updateEmailReportTool = {
  name: 'email_reports_update',
  description: 'Update fields on an existing email report (schedule, recipients, toggle enabled, etc.) via /i/reports/update. Only supplied fields change. Requires the reports plugin.',
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
      report_id: {
        type: 'string',
        description: 'Report identifier (_id) to update. Obtain it from email_reports_list.',
      },
      title: {
        type: 'string',
        description: 'New report title.',
      },
      emails: {
        type: 'array',
        items: { type: 'string' },
        description: 'New recipient email list (replaces existing).',
      },
      frequency: {
        type: 'string',
        enum: ['daily', 'weekly', 'monthly'],
        description: 'New send cadence.',
      },
      timezone: {
        type: 'string',
        description: 'New IANA timezone for scheduling.',
      },
      day: {
        type: 'number',
        description: 'New day-of-week (0-6) for weekly or day-of-month (1-31) for monthly.',
      },
      hour: {
        type: 'number',
        description: 'New hour of day 0-23.',
      },
      minute: {
        type: 'number',
        description: 'New minute of hour 0-59.',
      },
      enabled: {
        type: 'boolean',
        description: 'Enable or disable the schedule without deleting the report.',
      },
      sendPdf: {
        type: 'boolean',
        description: 'Toggle PDF attachment.',
      },
      report_data: {
        type: 'object',
        description: 'Extra raw fields to merge into the update payload (escape hatch for fields not covered above).',
        additionalProperties: true,
      },
    },
    required: ['report_id'],
  },
};

export async function handleUpdateEmailReport(
  context: ToolContext,
  input: Record<string, unknown>
): Promise<ToolResult> {
  const app_id = await context.resolveAppId(input);
  const report_id = input.report_id as string;

  // Build update object with only provided fields
  const updateArgs: Record<string, any> = {
    _id: report_id,
  };

  if (input.title !== undefined) {
    updateArgs.title = input.title;
  }
  if (input.emails !== undefined) {
    updateArgs.emails = input.emails;
  }
  if (input.frequency !== undefined) {
    updateArgs.frequency = input.frequency;
  }
  if (input.timezone !== undefined) {
    updateArgs.timezone = input.timezone;
  }
  if (input.day !== undefined) {
    updateArgs.day = input.day;
  }
  if (input.hour !== undefined) {
    updateArgs.hour = input.hour;
  }
  if (input.minute !== undefined) {
    updateArgs.minute = input.minute;
  }
  if (input.enabled !== undefined) {
    updateArgs.enabled = input.enabled;
  }
  if (input.sendPdf !== undefined) {
    updateArgs.sendPdf = input.sendPdf;
  }
  if (input.report_data) {
    Object.assign(updateArgs, input.report_data as Record<string, unknown>);
  }

  const params = {
    ...context.getAuthParams(),
    app_id,
    args: JSON.stringify(updateArgs),
  };

  const response = await safeApiCall(
    () => context.httpClient.get('/i/reports/update', { params }),
    `Failed to update email report: ${report_id}`
  );

  return {
    content: [
      {
        type: 'text',
        text: `Email report updated successfully:\n\n${JSON.stringify(response.data, null, 2)}`,
      },
    ],
  };
}

/**
 * Tool: email_reports_preview
 * Preview an email report before sending
 */
export const previewEmailReportTool = {
  name: 'email_reports_preview',
  description: 'Render an email report preview without delivering it (for inspection) via /i/reports/preview. Requires the reports plugin. To actually send use email_reports_send.',
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
      report_id: {
        type: 'string',
        description: 'Report identifier (_id) to preview. Obtain it from email_reports_list.',
      },
    },
    required: ['report_id'],
  },
};

export async function handlePreviewEmailReport(
  context: ToolContext,
  input: Record<string, unknown>
): Promise<ToolResult> {
  const app_id = await context.resolveAppId(input);
  const report_id = input.report_id as string;

  const params = {
    ...context.getAuthParams(),
    app_id,
    args: JSON.stringify({ _id: report_id }),
  };

  const response = await safeApiCall(
    () => context.httpClient.get('/i/reports/preview', { params }),
    `Failed to preview email report: ${report_id}`
  );

  return {
    content: [
      {
        type: 'text',
        text: `Email report preview:\n\n${JSON.stringify(response.data, null, 2)}`,
      },
    ],
  };
}

/**
 * Tool: email_reports_send
 * Manually trigger sending an email report
 */
export const sendEmailReportTool = {
  name: 'email_reports_send',
  description: 'Send an email report to its configured recipients immediately (outside its normal schedule) via /i/reports/send. Requires the reports plugin. To see it without sending use email_reports_preview.',
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
      report_id: {
        type: 'string',
        description: 'Report identifier (_id) to send now. Obtain it from email_reports_list.',
      },
    },
    required: ['report_id'],
  },
};

export async function handleSendEmailReport(
  context: ToolContext,
  input: Record<string, unknown>
): Promise<ToolResult> {
  const app_id = await context.resolveAppId(input);
  const report_id = input.report_id as string;

  const params = {
    ...context.getAuthParams(),
    app_id,
    args: JSON.stringify({ _id: report_id }),
  };

  const response = await safeApiCall(
    () => context.httpClient.get('/i/reports/send', { params }),
    `Failed to send email report: ${report_id}`
  );

  return {
    content: [
      {
        type: 'text',
        text: `Email report sent successfully:\n\n${JSON.stringify(response.data, null, 2)}`,
      },
    ],
  };
}

/**
 * Tool: email_reports_delete
 * Delete an email report
 */
export const deleteEmailReportTool = {
  name: 'email_reports_delete',
  description: 'Delete an email report configuration via /i/reports/delete. Requires the reports plugin. WARNING: irreversible. To disable temporarily set enabled=false via email_reports_update instead.',
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
      report_id: {
        type: 'string',
        description: 'Report identifier (_id) to delete. Obtain it from email_reports_list.',
      },
    },
    required: ['report_id'],
  },
};

export async function handleDeleteEmailReport(
  context: ToolContext,
  input: Record<string, unknown>
): Promise<ToolResult> {
  const app_id = await context.resolveAppId(input);
  const report_id = input.report_id as string;

  const params = {
    ...context.getAuthParams(),
    app_id,
    args: JSON.stringify({ _id: report_id }),
  };

  const response = await safeApiCall(
    () => context.httpClient.get('/i/reports/delete', { params }),
    `Failed to delete email report: ${report_id}`
  );

  return {
    content: [
      {
        type: 'text',
        text: `Email report deleted successfully:\n\n${JSON.stringify(response.data, null, 2)}`,
      },
    ],
  };
}

/**
 * Export all email reports tool definitions
 */
export const emailReportsToolDefinitions = [
  listEmailReportsTool,
  createCoreEmailReportTool,
  createDashboardEmailReportTool,
  updateEmailReportTool,
  previewEmailReportTool,
  sendEmailReportTool,
  deleteEmailReportTool,
];

/**
 * Export tool handlers map
 */
export const emailReportsToolHandlers = {
  'email_reports_list': 'listEmailReports',
  'email_reports_core_create': 'createCoreEmailReport',
  'email_reports_dashboard_create': 'createDashboardEmailReport',
  'email_reports_update': 'updateEmailReport',
  'email_reports_preview': 'previewEmailReport',
  'email_reports_send': 'sendEmailReport',
  'email_reports_delete': 'deleteEmailReport',
} as const;

/**
 * Email Reports Tools Class
 * Provides methods for managing email reports
 */
export class EmailReportsTools {
  constructor(private context: ToolContext) {}

  /**
   * List all email reports
   */
  async listEmailReports(args: any): Promise<ToolResult> {
    return handleListEmailReports(this.context, args);
  }

  /**
   * Create a core email report
   */
  async createCoreEmailReport(args: any): Promise<ToolResult> {
    return handleCreateCoreEmailReport(this.context, args);
  }

  /**
   * Create a dashboard email report
   */
  async createDashboardEmailReport(args: any): Promise<ToolResult> {
    return handleCreateDashboardEmailReport(this.context, args);
  }

  /**
   * Update an email report
   */
  async updateEmailReport(args: any): Promise<ToolResult> {
    return handleUpdateEmailReport(this.context, args);
  }

  /**
   * Preview an email report
   */
  async previewEmailReport(args: any): Promise<ToolResult> {
    return handlePreviewEmailReport(this.context, args);
  }

  /**
   * Send an email report
   */
  async sendEmailReport(args: any): Promise<ToolResult> {
    return handleSendEmailReport(this.context, args);
  }

  /**
   * Delete an email report
   */
  async deleteEmailReport(args: any): Promise<ToolResult> {
    return handleDeleteEmailReport(this.context, args);
  }
}

/**
 * Export metadata for dynamic tool routing
 */
export const emailReportsToolMetadata = {
  instanceKey: 'email_reports',
  toolClass: EmailReportsTools,
  handlers: emailReportsToolHandlers,
};
