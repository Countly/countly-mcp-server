/**
 * Email Reports Tools
 * 
 * Tools for creating and managing periodic email reports of metrics.
 * 
 * Requires: reports plugin
 */

import { z } from 'zod';
import { safeApiCall } from '../lib/error-handler.js';
import type { ToolContext } from './types.js';

/**
 * Tool: email_reports_list
 * List all email reports
 */
export const listEmailReportsTool = {
  name: 'email_reports_list',
  description: 'List scheduled email reports (core and dashboard) configured for an app via /o/reports/all. Requires the reports plugin. To create new reports use email_reports_core_create or email_reports_dashboard_create.',
  inputSchema: z.object({
    app_id: z.string()
      .optional()
      .describe('Application ID. Either app_id or app_name must be provided; call apps_list first if you do not know it.'),
    app_name: z.string()
      .optional()
      .describe('Application name (alternative to app_id). Must match an existing app exactly; call apps_list to find valid names.'),
  }),
};

async function handleListEmailReports(args: z.infer<typeof listEmailReportsTool.inputSchema>, context: ToolContext) {
  const app_id = await context.resolveAppId(args);

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
        type: 'text' as const,
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
  inputSchema: z.object({
    app_id: z.string()
      .optional()
      .describe('Application ID. Either app_id or app_name must be provided; call apps_list first if you do not know it.'),
    app_name: z.string()
      .optional()
      .describe('Application name (alternative to app_id). Must match an existing app exactly; call apps_list to find valid names.'),
    title: z.string()
      .describe('Human-readable report title.'),
    apps: z.array(z.string())
      .describe('App IDs to include as data sources in the report (can include apps beyond the one scheduling the report).'),
    emails: z.array(z.string())
      .describe('Recipient email addresses.'),
    metrics: z.object({
      analytics: z.boolean().optional().describe('Include analytics section (sessions, users).'),
      events: z.boolean().optional().describe('Include events section.'),
      crash: z.boolean().optional().describe('Include crashes section.'),
      'star-rating': z.boolean().optional().describe('Include star-rating/feedback section.'),
    }).describe('Which sections to include. Set each flag to true to include.'),
    frequency: z.enum(['daily', 'weekly', 'monthly'])
      .describe('Send cadence.'),
    timezone: z.string()
      .describe('IANA timezone used to schedule delivery (e.g. "America/New_York", "Europe/London").'),
    day: z.number()
      .optional()
      .describe('For "weekly": day of week 0-6 (Sun-Sat). For "monthly": day of month 1-31. Ignored for "daily".'),
    hour: z.number()
      .describe('Hour of day 0-23 when the report should be sent (in the given timezone).'),
    minute: z.number()
      .optional()
      .default(0)
      .describe('Minute of hour 0-59. Defaults to 0.'),
    selectedEvents: z.array(z.string())
      .optional()
      .describe('Event keys to highlight, each formatted "app_id***event_key". Used with metrics.events.'),
    sendPdf: z.boolean()
      .optional()
      .default(true)
      .describe('Attach a PDF rendering of the report. Defaults to true.'),
  }),
};

async function handleCreateCoreEmailReport(args: z.infer<typeof createCoreEmailReportTool.inputSchema>, context: ToolContext) {
  const app_id = await context.resolveAppId(args);

  const reportArgs = {
    _id: null,
    title: args.title,
    report_type: 'core',
    apps: args.apps,
    emails: args.emails,
    metrics: args.metrics,
    metricsArray: [],
    frequency: args.frequency,
    timezone: args.timezone,
    day: args.day || null,
    hour: args.hour,
    minute: args.minute,
    dashboards: null,
    date_range: null,
    sendPdf: args.sendPdf,
    selectedEvents: args.selectedEvents || [],
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
        type: 'text' as const,
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
  inputSchema: z.object({
    app_id: z.string()
      .optional()
      .describe('Application ID. Either app_id or app_name must be provided; call apps_list first if you do not know it.'),
    app_name: z.string()
      .optional()
      .describe('Application name (alternative to app_id). Must match an existing app exactly; call apps_list to find valid names.'),
    title: z.string()
      .describe('Human-readable report title.'),
    emails: z.array(z.string())
      .describe('Recipient email addresses.'),
    dashboards: z.string()
      .describe('Dashboard identifier to render. Obtain it from dashboards_list.'),
    date_range: z.string()
      .describe('Date range evaluated when the report runs (e.g. "7days", "30days", "60days").'),
    frequency: z.enum(['daily', 'weekly', 'monthly'])
      .describe('Send cadence.'),
    timezone: z.string()
      .describe('IANA timezone for delivery scheduling (e.g. "America/New_York").'),
    day: z.number()
      .optional()
      .describe('For "weekly": day of week 0-6 (Sun-Sat). For "monthly": day of month 1-31. Ignored for "daily".'),
    hour: z.number()
      .describe('Hour of day 0-23 when the report should be sent.'),
    minute: z.number()
      .optional()
      .default(0)
      .describe('Minute of hour 0-59. Defaults to 0.'),
    sendPdf: z.boolean()
      .optional()
      .default(true)
      .describe('Attach a PDF rendering of the dashboard. Defaults to true.'),
  }),
};

async function handleCreateDashboardEmailReport(args: z.infer<typeof createDashboardEmailReportTool.inputSchema>, context: ToolContext) {
  const app_id = await context.resolveAppId(args);

  const reportArgs = {
    _id: null,
    title: args.title,
    report_type: 'dashboards',
    apps: [],
    emails: args.emails,
    metrics: {},
    metricsArray: [],
    frequency: args.frequency,
    timezone: args.timezone,
    day: args.day || null,
    hour: args.hour,
    minute: args.minute,
    dashboards: args.dashboards,
    date_range: args.date_range,
    sendPdf: args.sendPdf,
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
        type: 'text' as const,
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
  inputSchema: z.object({
    app_id: z.string()
      .optional()
      .describe('Application ID. Either app_id or app_name must be provided; call apps_list first if you do not know it.'),
    app_name: z.string()
      .optional()
      .describe('Application name (alternative to app_id). Must match an existing app exactly; call apps_list to find valid names.'),
    report_id: z.string()
      .describe('Report identifier (_id) to update. Obtain it from email_reports_list.'),
    title: z.string()
      .optional()
      .describe('New report title.'),
    emails: z.array(z.string())
      .optional()
      .describe('New recipient email list (replaces existing).'),
    frequency: z.enum(['daily', 'weekly', 'monthly'])
      .optional()
      .describe('New send cadence.'),
    timezone: z.string()
      .optional()
      .describe('New IANA timezone for scheduling.'),
    day: z.number()
      .optional()
      .describe('New day-of-week (0-6) for weekly or day-of-month (1-31) for monthly.'),
    hour: z.number()
      .optional()
      .describe('New hour of day 0-23.'),
    minute: z.number()
      .optional()
      .describe('New minute of hour 0-59.'),
    enabled: z.boolean()
      .optional()
      .describe('Enable or disable the schedule without deleting the report.'),
    sendPdf: z.boolean()
      .optional()
      .describe('Toggle PDF attachment.'),
    report_data: z.record(z.string(), z.any())
      .optional()
      .describe('Extra raw fields to merge into the update payload (escape hatch for fields not covered above).'),
  }),
};

async function handleUpdateEmailReport(args: z.infer<typeof updateEmailReportTool.inputSchema>, context: ToolContext) {
  const app_id = await context.resolveAppId(args);

  // Build update object with only provided fields
  const updateArgs: Record<string, any> = {
    _id: args.report_id,
  };

  if (args.title !== undefined) {
    updateArgs.title = args.title;
  }
  if (args.emails !== undefined) {
    updateArgs.emails = args.emails;
  }
  if (args.frequency !== undefined) {
    updateArgs.frequency = args.frequency;
  }
  if (args.timezone !== undefined) {
    updateArgs.timezone = args.timezone;
  }
  if (args.day !== undefined) {
    updateArgs.day = args.day;
  }
  if (args.hour !== undefined) {
    updateArgs.hour = args.hour;
  }
  if (args.minute !== undefined) {
    updateArgs.minute = args.minute;
  }
  if (args.enabled !== undefined) {
    updateArgs.enabled = args.enabled;
  }
  if (args.sendPdf !== undefined) {
    updateArgs.sendPdf = args.sendPdf;
  }
  if (args.report_data) {
    Object.assign(updateArgs, args.report_data);
  }

  const params = {
    ...context.getAuthParams(),
    app_id,
    args: JSON.stringify(updateArgs),
  };

  const response = await safeApiCall(
    () => context.httpClient.get('/i/reports/update', { params }),
    `Failed to update email report: ${args.report_id}`
  );

  return {
    content: [
      {
        type: 'text' as const,
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
  inputSchema: z.object({
    app_id: z.string()
      .optional()
      .describe('Application ID. Either app_id or app_name must be provided; call apps_list first if you do not know it.'),
    app_name: z.string()
      .optional()
      .describe('Application name (alternative to app_id). Must match an existing app exactly; call apps_list to find valid names.'),
    report_id: z.string()
      .describe('Report identifier (_id) to preview. Obtain it from email_reports_list.'),
  }),
};

async function handlePreviewEmailReport(args: z.infer<typeof previewEmailReportTool.inputSchema>, context: ToolContext) {
  const app_id = await context.resolveAppId(args);

  const params = {
    ...context.getAuthParams(),
    app_id,
    args: JSON.stringify({ _id: args.report_id }),
  };

  const response = await safeApiCall(
    () => context.httpClient.get('/i/reports/preview', { params }),
    `Failed to preview email report: ${args.report_id}`
  );

  return {
    content: [
      {
        type: 'text' as const,
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
  inputSchema: z.object({
    app_id: z.string()
      .optional()
      .describe('Application ID. Either app_id or app_name must be provided; call apps_list first if you do not know it.'),
    app_name: z.string()
      .optional()
      .describe('Application name (alternative to app_id). Must match an existing app exactly; call apps_list to find valid names.'),
    report_id: z.string()
      .describe('Report identifier (_id) to send now. Obtain it from email_reports_list.'),
  }),
};

async function handleSendEmailReport(args: z.infer<typeof sendEmailReportTool.inputSchema>, context: ToolContext) {
  const app_id = await context.resolveAppId(args);

  const params = {
    ...context.getAuthParams(),
    app_id,
    args: JSON.stringify({ _id: args.report_id }),
  };

  const response = await safeApiCall(
    () => context.httpClient.get('/i/reports/send', { params }),
    `Failed to send email report: ${args.report_id}`
  );

  return {
    content: [
      {
        type: 'text' as const,
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
  inputSchema: z.object({
    app_id: z.string()
      .optional()
      .describe('Application ID. Either app_id or app_name must be provided; call apps_list first if you do not know it.'),
    app_name: z.string()
      .optional()
      .describe('Application name (alternative to app_id). Must match an existing app exactly; call apps_list to find valid names.'),
    report_id: z.string()
      .describe('Report identifier (_id) to delete. Obtain it from email_reports_list.'),
  }),
};

async function handleDeleteEmailReport(args: z.infer<typeof deleteEmailReportTool.inputSchema>, context: ToolContext) {
  const app_id = await context.resolveAppId(args);

  const params = {
    ...context.getAuthParams(),
    app_id,
    args: JSON.stringify({ _id: args.report_id }),
  };

  const response = await safeApiCall(
    () => context.httpClient.get('/i/reports/delete', { params }),
    `Failed to delete email report: ${args.report_id}`
  );

  return {
    content: [
      {
        type: 'text' as const,
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
  async listEmailReports(args: z.infer<typeof listEmailReportsTool.inputSchema>) {
    return handleListEmailReports(args, this.context);
  }

  /**
   * Create a core email report
   */
  async createCoreEmailReport(args: z.infer<typeof createCoreEmailReportTool.inputSchema>) {
    return handleCreateCoreEmailReport(args, this.context);
  }

  /**
   * Create a dashboard email report
   */
  async createDashboardEmailReport(args: z.infer<typeof createDashboardEmailReportTool.inputSchema>) {
    return handleCreateDashboardEmailReport(args, this.context);
  }

  /**
   * Update an email report
   */
  async updateEmailReport(args: z.infer<typeof updateEmailReportTool.inputSchema>) {
    return handleUpdateEmailReport(args, this.context);
  }

  /**
   * Preview an email report
   */
  async previewEmailReport(args: z.infer<typeof previewEmailReportTool.inputSchema>) {
    return handlePreviewEmailReport(args, this.context);
  }

  /**
   * Send an email report
   */
  async sendEmailReport(args: z.infer<typeof sendEmailReportTool.inputSchema>) {
    return handleSendEmailReport(args, this.context);
  }

  /**
   * Delete an email report
   */
  async deleteEmailReport(args: z.infer<typeof deleteEmailReportTool.inputSchema>) {
    return handleDeleteEmailReport(args, this.context);
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
