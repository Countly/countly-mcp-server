import { ToolContext, ToolResult } from './types.js';
import { safeApiCall } from '../lib/error-handler.js';

// ============================================================================
// GET_RETENTION TOOL
// ============================================================================

export const getRetentionToolDefinition = {
  name: 'get_retention',
  description: 'Get retention data showing how many consecutive same events (like sessions) users did before breaking the streak. Supports three retention types: Full (strict - breaks on first skip), Classic (Day N - checks specific days independently), and Unbounded (lenient - counts any return after a day).',
  inputSchema: {
    type: 'object',
    properties: {
      app_id: { type: 'string', description: 'Application ID (optional if app_name is provided)' },
      app_name: { type: 'string', description: 'Application name (alternative to app_id)' },
      rettype: {
        type: 'string',
        enum: ['full', 'classic', 'unbounded'],
        description: 'Retention type: "full" (strict - retention breaks on first skip day), "classic" (Day N - users who returned on specific day, days affect only themselves), "unbounded" (lenient - users who returned on or after a specific day, all days between Day 0 and last session are retained). Defaults to "full".'
      },
      period: {
        type: 'string',
        description: 'Period type for retention calculation. Common values: "adaily" (all daily), "aweekly" (all weekly), "amonthly" (all monthly), or standard periods like "30days", "7days", etc. Defaults to "adaily".'
      },
      range: {
        type: 'string',
        description: 'Optional date range as JSON array [startMilliseconds, endMilliseconds]. Example: "[1760389200000,1762984799999]". If not provided, uses the period parameter.'
      },
      evt: {
        type: 'string',
        description: 'Event key to track retention for. Use "[CLY]_session" for session-based retention, or any custom event key. Defaults to "[CLY]_session".'
      },
      query: {
        type: 'string',
        description: 'Optional MongoDB query as JSON string to filter events. Example: \'{"country":"US"}\' or \'{}\'. Defaults to \'{}\' (all events).'
      },
      save_report: {
        type: 'boolean',
        description: 'Whether to save this retention report for later access. Defaults to false.'
      },
    },
    anyOf: [
      { required: ['app_id'] },
      { required: ['app_name'] }
    ],
  },
};

export async function handleGetRetention(context: ToolContext, args: any): Promise<ToolResult> {
  const app_id = await context.resolveAppId(args);

  const params: any = {
    ...context.getAuthParams(),
    app_id,
    method: 'retention',
    rettype: args.rettype || 'full',
    period: args.period || 'adaily',
    evt: args.evt || '[CLY]_session',
    query: args.query || '{}',
  };

  if (args.range) {
    params.range = args.range;
  }

  if (args.save_report !== undefined) {
    params.save_report = args.save_report ? 1 : 0;
  }

  // Add timestamp to prevent caching
  params._t = Date.now();

  const response = await safeApiCall(
    () => context.httpClient.get('/o', { params }),
    'Failed to get retention data'
  );

  // Build helpful description based on retention type
  let retentionDescription = '';
  switch (params.rettype) {
    case 'full':
      retentionDescription = 'Full Retention (strict): Once a user skips a day, retention is broken regardless of future activity. Most strict approach.';
      break;
    case 'classic':
      retentionDescription = 'Classic Retention (Day N): Shows percentage of users who returned on a specific day. Days are independent - no requirement for continuous sessions.';
      break;
    case 'unbounded':
      retentionDescription = 'Unbounded Retention (lenient): Shows percentage of users who returned on or after a specific day. All days between Day 0 and last session are considered retained.';
      break;
  }

  let resultText = `Retention data for app ${app_id}:\n\n`;
  resultText += `**Configuration:**\n`;
  resultText += `- Retention Type: ${params.rettype}\n`;
  resultText += `- Description: ${retentionDescription}\n`;
  resultText += `- Event: ${params.evt}\n`;
  resultText += `- Period: ${params.period}\n`;
  if (args.range) {
    resultText += `- Date Range: ${params.range}\n`;
  }
  resultText += `- Query Filter: ${params.query}\n\n`;
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

export const retentionToolDefinitions = [
  getRetentionToolDefinition,
];

export const retentionToolHandlers = {
  'get_retention': 'getRetention',
} as const;

export class RetentionTools {
  constructor(private context: ToolContext) {}

  async getRetention(args: any): Promise<ToolResult> {
    return handleGetRetention(this.context, args);
  }
}

// Metadata for dynamic routing (must be after class declaration)
export const retentionToolMetadata = {
  instanceKey: 'retention',
  toolClass: RetentionTools,
  handlers: retentionToolHandlers,
} as const;
