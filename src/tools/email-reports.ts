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
 * Tool: list_email_reports
 * List all email reports
 */
export const listEmailReportsTool = {
  name: 'list_email_reports',
  description: 'List all email reports configured for an app',
  inputSchema: z.object({
    app_id: z.string()
      .optional()
      .describe('Application ID (optional if app_name is provided)'),
    app_name: z.string()
      .optional()
      .describe('Application name (alternative to app_id)'),
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
 * Tool: create_core_email_report
 * Create a core email report with metrics like analytics, events, crashes
 */
export const createCoreEmailReportTool = {
  name: 'create_core_email_report',
  description: 'Create a core email report with metrics like analytics, events, crashes, and star-rating',
  inputSchema: z.object({
    app_id: z.string()
      .optional()
      .describe('Application ID (optional if app_name is provided)'),
    app_name: z.string()
      .optional()
      .describe('Application name (alternative to app_id)'),
    title: z.string()
      .describe('Report title'),
    apps: z.array(z.string())
      .describe('Array of app IDs to include in the report'),
    emails: z.array(z.string())
      .describe('Array of email addresses to send the report to'),
    metrics: z.object({
      analytics: z.boolean().optional().describe('Include analytics metrics'),
      events: z.boolean().optional().describe('Include events metrics'),
      crash: z.boolean().optional().describe('Include crash metrics'),
      'star-rating': z.boolean().optional().describe('Include star-rating metrics'),
    }).describe('Metrics to include in the report'),
    frequency: z.enum(['daily', 'weekly', 'monthly'])
      .describe('Report frequency'),
    timezone: z.string()
      .describe('Timezone (e.g., "America/New_York", "Europe/London")'),
    day: z.number()
      .optional()
      .describe('Day of week (0-6 for Sunday-Saturday) for weekly reports, or day of month (1-31) for monthly reports'),
    hour: z.number()
      .describe('Hour of day (0-23) when report should be sent'),
    minute: z.number()
      .optional()
      .default(0)
      .describe('Minute of hour (0-59) when report should be sent'),
    selectedEvents: z.array(z.string())
      .optional()
      .describe('Array of selected events in format "app_id***event_key"'),
    sendPdf: z.boolean()
      .optional()
      .default(true)
      .describe('Whether to send report as PDF'),
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
 * Tool: create_dashboard_email_report
 * Create a dashboard email report
 */
export const createDashboardEmailReportTool = {
  name: 'create_dashboard_email_report',
  description: 'Create a dashboard email report for specific dashboards',
  inputSchema: z.object({
    app_id: z.string()
      .optional()
      .describe('Application ID (optional if app_name is provided)'),
    app_name: z.string()
      .optional()
      .describe('Application name (alternative to app_id)'),
    title: z.string()
      .describe('Report title'),
    emails: z.array(z.string())
      .describe('Array of email addresses to send the report to'),
    dashboards: z.string()
      .describe('Dashboard ID to include in the report'),
    date_range: z.string()
      .describe('Date range for the dashboard data (e.g., "7days", "30days", "60days")'),
    frequency: z.enum(['daily', 'weekly', 'monthly'])
      .describe('Report frequency'),
    timezone: z.string()
      .describe('Timezone (e.g., "America/New_York", "Europe/London")'),
    day: z.number()
      .optional()
      .describe('Day of week (0-6 for Sunday-Saturday) for weekly reports, or day of month (1-31) for monthly reports'),
    hour: z.number()
      .describe('Hour of day (0-23) when report should be sent'),
    minute: z.number()
      .optional()
      .default(0)
      .describe('Minute of hour (0-59) when report should be sent'),
    sendPdf: z.boolean()
      .optional()
      .default(true)
      .describe('Whether to send report as PDF'),
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
 * Tool: update_email_report
 * Update an existing email report
 */
export const updateEmailReportTool = {
  name: 'update_email_report',
  description: 'Update an existing email report configuration',
  inputSchema: z.object({
    app_id: z.string()
      .optional()
      .describe('Application ID (optional if app_name is provided)'),
    app_name: z.string()
      .optional()
      .describe('Application name (alternative to app_id)'),
    report_id: z.string()
      .describe('Report ID to update'),
    title: z.string()
      .optional()
      .describe('Report title'),
    emails: z.array(z.string())
      .optional()
      .describe('Array of email addresses to send the report to'),
    frequency: z.enum(['daily', 'weekly', 'monthly'])
      .optional()
      .describe('Report frequency'),
    timezone: z.string()
      .optional()
      .describe('Timezone (e.g., "America/New_York", "Europe/London")'),
    day: z.number()
      .optional()
      .describe('Day of week (0-6) for weekly or day of month (1-31) for monthly'),
    hour: z.number()
      .optional()
      .describe('Hour of day (0-23) when report should be sent'),
    minute: z.number()
      .optional()
      .describe('Minute of hour (0-59) when report should be sent'),
    enabled: z.boolean()
      .optional()
      .describe('Whether the report is enabled'),
    sendPdf: z.boolean()
      .optional()
      .describe('Whether to send report as PDF'),
    report_data: z.record(z.any())
      .optional()
      .describe('Additional report data fields to update'),
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
 * Tool: preview_email_report
 * Preview an email report before sending
 */
export const previewEmailReportTool = {
  name: 'preview_email_report',
  description: 'Preview an email report to see what it will look like before sending',
  inputSchema: z.object({
    app_id: z.string()
      .optional()
      .describe('Application ID (optional if app_name is provided)'),
    app_name: z.string()
      .optional()
      .describe('Application name (alternative to app_id)'),
    report_id: z.string()
      .describe('Report ID to preview'),
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
 * Tool: send_email_report
 * Manually trigger sending an email report
 */
export const sendEmailReportTool = {
  name: 'send_email_report',
  description: 'Manually trigger sending an email report immediately',
  inputSchema: z.object({
    app_id: z.string()
      .optional()
      .describe('Application ID (optional if app_name is provided)'),
    app_name: z.string()
      .optional()
      .describe('Application name (alternative to app_id)'),
    report_id: z.string()
      .describe('Report ID to send'),
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
 * Tool: delete_email_report
 * Delete an email report
 */
export const deleteEmailReportTool = {
  name: 'delete_email_report',
  description: 'Delete an email report configuration',
  inputSchema: z.object({
    app_id: z.string()
      .optional()
      .describe('Application ID (optional if app_name is provided)'),
    app_name: z.string()
      .optional()
      .describe('Application name (alternative to app_id)'),
    report_id: z.string()
      .describe('Report ID to delete'),
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
  [listEmailReportsTool.name]: handleListEmailReports,
  [createCoreEmailReportTool.name]: handleCreateCoreEmailReport,
  [createDashboardEmailReportTool.name]: handleCreateDashboardEmailReport,
  [updateEmailReportTool.name]: handleUpdateEmailReport,
  [previewEmailReportTool.name]: handlePreviewEmailReport,
  [sendEmailReportTool.name]: handleSendEmailReport,
  [deleteEmailReportTool.name]: handleDeleteEmailReport,
};

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
