import { ToolContext, ToolResult } from './types.js';
import { safeApiCall } from '../lib/error-handler.js';

// ============================================================================
// GET_CONSENT_STATS TOOL
// ============================================================================

export const getConsentStatsToolDefinition = {
  name: 'consents_stats',
  description: 'Get aggregated consent statistics for an app (counts and trends of given/denied consents by type) via /o?method=consents. Requires the compliance-hub plugin. For per-user consent states use consents_list; for individual change events use consents_history_search.',
  inputSchema: {
    type: 'object',
    properties: {
      app_id: { type: 'string', description: 'Application ID. Either app_id or app_name must be provided; call apps_list first if you do not know it.' },
      app_name: { type: 'string', description: 'Application name (alternative to app_id). Must match an existing app exactly; call apps_list to find valid names.' },
      period: {
        type: 'string',
        description: 'Time period. One of "month", "60days", "30days", "7days", "yesterday", "hour", or a custom range as [startMilliseconds,endMilliseconds] (e.g. "[1417730400000,1420149600000]"). Defaults to "30days".',
        default: '30days'
      },
    },
  },
};

export async function handleGetConsentStats(context: ToolContext, args: any): Promise<ToolResult> {
  const app_id = await context.resolveAppId(args);
  const period = args.period || '30days';

  const params = {
    ...context.getAuthParams(),
    app_id,
    method: 'consents',
    period,
  };

  const response = await safeApiCall(
    () => context.httpClient.get('/o', { params }),
    'Failed to get consent statistics'
  );

  return {
    content: [
      {
        type: 'text',
        text: `Consent statistics for app ${app_id} (period: ${period}):\n\n${JSON.stringify(response.data, null, 2)}`,
      },
    ],
  };
}

// ============================================================================
// LIST_USER_CONSENTS TOOL
// ============================================================================

export const listUserConsentsToolDefinition = {
  name: 'consents_list',
  description: 'List users with their current consent status (which consent types each user has given or denied) via /o/app_users/consents. Requires the compliance-hub plugin. For aggregated counts use consents_stats.',
  inputSchema: {
    type: 'object',
    properties: {
      app_id: { type: 'string', description: 'Application ID. Either app_id or app_name must be provided; call apps_list first if you do not know it.' },
      app_name: { type: 'string', description: 'Application name (alternative to app_id). Must match an existing app exactly; call apps_list to find valid names.' },
      skip: {
        type: 'number',
        description: 'Number of records to skip for pagination (maps to iDisplayStart). Defaults to 0.',
        default: 0
      },
      limit: {
        type: 'number',
        description: 'Maximum number of records to return (maps to iDisplayLength). Defaults to 10.',
        default: 10
      },
      sort_column: {
        type: 'number',
        description: 'Zero-based column index to sort by (maps to iSortCol_0). Defaults to 4.',
        default: 4
      },
      sort_direction: {
        type: 'string',
        enum: ['asc', 'desc'],
        description: 'Sort direction (maps to sSortDir_0). Defaults to "desc".',
        default: 'desc'
      },
    },
  },
};

export async function handleListUserConsents(context: ToolContext, args: any): Promise<ToolResult> {
  const app_id = await context.resolveAppId(args);
  const skip = args.skip !== undefined ? args.skip : 0;
  const limit = args.limit !== undefined ? args.limit : 10;
  const sort_column = args.sort_column !== undefined ? args.sort_column : 4;
  const sort_direction = args.sort_direction || 'desc';

  const params = {
    ...context.getAuthParams(),
    app_id,
    iDisplayStart: skip.toString(),
    iDisplayLength: limit.toString(),
    iSortCol_0: sort_column.toString(),
    sSortDir_0: sort_direction,
  };

  const response = await safeApiCall(
    () => context.httpClient.get('/o/app_users/consents', { params }),
    'Failed to list user consents'
  );

  return {
    content: [
      {
        type: 'text',
        text: `User consents for app ${app_id} (${skip}-${skip + limit}):\n\n${JSON.stringify(response.data, null, 2)}`,
      },
    ],
  };
}

// ============================================================================
// SEARCH_CONSENT_HISTORY TOOL
// ============================================================================

export const searchConsentHistoryToolDefinition = {
  name: 'consents_history_search',
  description: 'Search the audit trail of consent changes (each grant/revoke event with user, consent type, and timestamp) via /o/consent/search. Requires the compliance-hub plugin. For current state per user use consents_list.',
  inputSchema: {
    type: 'object',
    properties: {
      app_id: { type: 'string', description: 'Application ID. Either app_id or app_name must be provided; call apps_list first if you do not know it.' },
      app_name: { type: 'string', description: 'Application name (alternative to app_id). Must match an existing app exactly; call apps_list to find valid names.' },
      period: {
        type: 'string',
        description: 'Time period. One of "month", "60days", "30days", "7days", "yesterday", "hour", or a custom range as [startMilliseconds,endMilliseconds]. Defaults to "30days".',
        default: '30days'
      },
      filter: {
        type: 'object',
        description: 'MongoDB query to filter history records. Examples: {"consent_name":"analytics"}, {"uid":"user123"}. Defaults to {} (no filter).',
        default: {}
      },
      skip: {
        type: 'number',
        description: 'Number of records to skip for pagination (maps to iDisplayStart). Defaults to 0.',
        default: 0
      },
      limit: {
        type: 'number',
        description: 'Maximum number of records to return (maps to iDisplayLength). Defaults to 10.',
        default: 10
      },
      sort_column: {
        type: 'number',
        description: 'Zero-based column index to sort by (maps to iSortCol_0). Defaults to 5.',
        default: 5
      },
      sort_direction: {
        type: 'string',
        enum: ['asc', 'desc'],
        description: 'Sort direction (maps to sSortDir_0). Defaults to "desc".',
        default: 'desc'
      },
    },
  },
};

export async function handleSearchConsentHistory(context: ToolContext, args: any): Promise<ToolResult> {
  const app_id = await context.resolveAppId(args);
  const period = args.period || '30days';
  const filter = args.filter || {};
  const skip = args.skip !== undefined ? args.skip : 0;
  const limit = args.limit !== undefined ? args.limit : 10;
  const sort_column = args.sort_column !== undefined ? args.sort_column : 5;
  const sort_direction = args.sort_direction || 'desc';

  const params = {
    ...context.getAuthParams(),
    app_id,
    period,
    filter: JSON.stringify(filter),
    iDisplayStart: skip.toString(),
    iDisplayLength: limit.toString(),
    iSortCol_0: sort_column.toString(),
    sSortDir_0: sort_direction,
  };

  const response = await safeApiCall(
    () => context.httpClient.get('/o/consent/search', { params }),
    'Failed to search consent history'
  );

  return {
    content: [
      {
        type: 'text',
        text: `Consent history for app ${app_id} (period: ${period}, ${skip}-${skip + limit}):\n\n${JSON.stringify(response.data, null, 2)}`,
      },
    ],
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export const complianceHubToolDefinitions = [
  getConsentStatsToolDefinition,
  listUserConsentsToolDefinition,
  searchConsentHistoryToolDefinition,
];

export const complianceHubToolHandlers = {
  'consents_stats': 'consents_stats',
  'consents_list': 'consents_list',
  'consents_history_search': 'consents_history_search',
} as const;

// ============================================================================
// TOOL CLASS
// ============================================================================

export class ComplianceHubTools {
  constructor(private context: ToolContext) {}

  async consents_stats(args: any): Promise<ToolResult> {
    return handleGetConsentStats(this.context, args);
  }

  async consents_list(args: any): Promise<ToolResult> {
    return handleListUserConsents(this.context, args);
  }

  async consents_history_search(args: any): Promise<ToolResult> {
    return handleSearchConsentHistory(this.context, args);
  }
}

// ============================================================================
// METADATA
// ============================================================================

export const complianceHubToolMetadata = {
  instanceKey: 'compliance_hub',
  toolClass: ComplianceHubTools,
  handlers: complianceHubToolHandlers,
} as const;
