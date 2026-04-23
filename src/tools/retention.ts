import { ToolContext, ToolResult } from './types.js';
import { safeApiCall } from '../lib/error-handler.js';

// ============================================================================
// GET_RETENTION TOOL
// ============================================================================

export const getRetentionToolDefinition = {
  name: 'retention',
  description: 'Compute user retention (cohort return curves) for an app via /o?method=retention. Requires the retention_segments plugin. Offers three modes: "full" (streak broken on first skipped day), "classic" (independent Day N percentages), "unbounded" (retained if user returns on or after Day N). Defaults to the session event.',
  inputSchema: {
    type: 'object',
    properties: {
      app_id: { type: 'string', description: 'Application ID. Either app_id or app_name must be provided; call apps_list first if you do not know it.' },
      app_name: { type: 'string', description: 'Application name (alternative to app_id). Must match an existing app exactly; call apps_list to find valid names.' },
      rettype: {
        type: 'string',
        enum: ['full', 'classic', 'unbounded'],
        description: 'Retention definition: "full" (strict streak), "classic" (Day N return %, independent days), "unbounded" (lenient: any return on/after Day N counts). Defaults to "full".'
      },
      period: {
        type: 'string',
        description: 'Retention bucketing period: "adaily" (all daily), "aweekly" (all weekly), "amonthly" (all monthly), or a standard range like "30days", "7days". Defaults to "adaily".'
      },
      range: {
        type: 'string',
        description: 'Optional explicit date range as a JSON array string "[startMilliseconds,endMilliseconds]" (e.g. "[1760389200000,1762984799999]"). When provided, overrides period.'
      },
      evt: {
        type: 'string',
        description: 'Event key to track retention on. Use "[CLY]_session" for session-based retention or any custom event key. Defaults to "[CLY]_session".'
      },
      query: {
        type: 'string',
        description: 'Optional MongoDB filter as a JSON string applied to events (e.g. \'{"country":"US"}\'). Defaults to \'{}\'.'
      },
      save_report: {
        type: 'boolean',
        description: 'When true, persist this retention calculation as a server-side saved report. Defaults to false.'
      },
    },
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
  'retention': 'getRetention',
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
