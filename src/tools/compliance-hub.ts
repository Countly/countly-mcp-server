import { ToolContext, ToolResult } from './types.js';
import { safeApiCall } from '../lib/error-handler.js';

// ============================================================================
// GET_CONSENT_STATS TOOL
// ============================================================================

export const getConsentStatsToolDefinition = {
  name: 'get_consent_stats',
  description: 'Get aggregated statistics about user consents. Shows which consents users have given and when, with trend data over time.',
  inputSchema: {
    type: 'object',
    properties: {
      app_id: { type: 'string', description: 'Application ID (optional if app_name is provided)' },
      app_name: { type: 'string', description: 'Application name (alternative to app_id)' },
      period: { 
        type: 'string', 
        description: 'Time period for data. Possible values: "month", "60days", "30days", "7days", "yesterday", "hour", or custom range as [startMilliseconds,endMilliseconds]',
        default: '30days'
      },
    },
    anyOf: [
      { required: ['app_id'] },
      { required: ['app_name'] }
    ],
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
  name: 'list_user_consents',
  description: 'List specific users and their consent status. Shows which users have given or denied specific consents.',
  inputSchema: {
    type: 'object',
    properties: {
      app_id: { type: 'string', description: 'Application ID (optional if app_name is provided)' },
      app_name: { type: 'string', description: 'Application name (alternative to app_id)' },
      skip: { 
        type: 'number', 
        description: 'Number of records to skip for pagination (iDisplayStart)',
        default: 0
      },
      limit: { 
        type: 'number', 
        description: 'Maximum number of records to return (iDisplayLength)',
        default: 10
      },
      sort_column: { 
        type: 'number', 
        description: 'Column index to sort by (iSortCol_0)',
        default: 4
      },
      sort_direction: { 
        type: 'string', 
        enum: ['asc', 'desc'],
        description: 'Sort direction (sSortDir_0)',
        default: 'desc'
      },
    },
    anyOf: [
      { required: ['app_id'] },
      { required: ['app_name'] }
    ],
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
  name: 'search_consent_history',
  description: 'Search consent history records. Shows when users gave or revoked consents with detailed audit trail.',
  inputSchema: {
    type: 'object',
    properties: {
      app_id: { type: 'string', description: 'Application ID (optional if app_name is provided)' },
      app_name: { type: 'string', description: 'Application name (alternative to app_id)' },
      period: { 
        type: 'string', 
        description: 'Time period for data. Possible values: "month", "60days", "30days", "7days", "yesterday", "hour", or custom range as [startMilliseconds,endMilliseconds]',
        default: '30days'
      },
      filter: { 
        type: 'object', 
        description: 'MongoDB query filter as object (optional). Example: {"consent_name": "analytics"} to filter by consent type, {"uid": "user123"} for specific user',
        default: {}
      },
      skip: { 
        type: 'number', 
        description: 'Number of records to skip for pagination (iDisplayStart)',
        default: 0
      },
      limit: { 
        type: 'number', 
        description: 'Maximum number of records to return (iDisplayLength)',
        default: 10
      },
      sort_column: { 
        type: 'number', 
        description: 'Column index to sort by (iSortCol_0)',
        default: 5
      },
      sort_direction: { 
        type: 'string', 
        enum: ['asc', 'desc'],
        description: 'Sort direction (sSortDir_0)',
        default: 'desc'
      },
    },
    anyOf: [
      { required: ['app_id'] },
      { required: ['app_name'] }
    ],
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
  get_consent_stats: handleGetConsentStats,
  list_user_consents: handleListUserConsents,
  search_consent_history: handleSearchConsentHistory,
};

// ============================================================================
// TOOL CLASS
// ============================================================================

export class ComplianceHubTools {
  constructor(private context: ToolContext) {}

  async get_consent_stats(args: any): Promise<ToolResult> {
    return handleGetConsentStats(this.context, args);
  }

  async list_user_consents(args: any): Promise<ToolResult> {
    return handleListUserConsents(this.context, args);
  }

  async search_consent_history(args: any): Promise<ToolResult> {
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
