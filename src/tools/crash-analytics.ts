import { ToolContext, ToolResult } from './types.js';
import { safeApiCall } from '../lib/error-handler.js';

// ============================================================================
// RESOLVE_CRASH TOOL
// ============================================================================

export const resolveCrashToolDefinition = {
  name: 'crashes_resolve',
  description: 'Mark a crash group as resolved (it stays visible but is flagged fixed) via /i/crashes/resolve. Requires the crashes plugin. To reopen use crashes_unresolve; to remove from lists use crashes_hide.',
  inputSchema: {
    type: 'object',
    properties: {
      app_id: { type: 'string', description: 'Application ID. Either app_id or app_name must be provided; call apps_list first if you do not know it.' },
      app_name: { type: 'string', description: 'Application name (alternative to app_id). Must match an existing app exactly; call apps_list to find valid names.' },
      crash_id: { type: 'string', description: 'Crash group identifier (_id) to resolve. Obtain it from crash_groups_list.' },
    },
    required: ['crash_id'],
  },
};

export async function handleResolveCrash(context: ToolContext, args: any): Promise<ToolResult> {
  const app_id = await context.resolveAppId(args);
  const { crash_id } = args;
  
  const params = {
    ...context.getAuthParams(),
    app_id,
    args: JSON.stringify({ crash_id }),
  };

  const response = await safeApiCall(


    () => context.httpClient.get('/i/crashes/resolve', { params }),


    'Failed to execute request to /i/crashes/resolve'


  );
  
  return {
    content: [
      {
        type: 'text',
        text: `Crash ${crash_id} resolved successfully: ${JSON.stringify(response.data, null, 2)}`,
      },
    ],
  };
}

// ============================================================================
// UNRESOLVE_CRASH TOOL
// ============================================================================

export const unresolveCrashToolDefinition = {
  name: 'crashes_unresolve',
  description: 'Reopen a previously resolved crash group (clear the resolved flag) via /i/crashes/unresolve. Requires the crashes plugin. To resolve use crashes_resolve.',
  inputSchema: {
    type: 'object',
    properties: {
      app_id: { type: 'string', description: 'Application ID. Either app_id or app_name must be provided; call apps_list first if you do not know it.' },
      app_name: { type: 'string', description: 'Application name (alternative to app_id). Must match an existing app exactly; call apps_list to find valid names.' },
      crash_id: { type: 'string', description: 'Crash group identifier (_id) to unresolve. Obtain it from crash_groups_list.' },
    },
    required: ['crash_id'],
  },
};

export async function handleUnresolveCrash(context: ToolContext, args: any): Promise<ToolResult> {
  const app_id = await context.resolveAppId(args);
  const { crash_id } = args;
  
  const params = {
    ...context.getAuthParams(),
    app_id,
    args: JSON.stringify({ crash_id }),
  };

  const response = await safeApiCall(


    () => context.httpClient.get('/i/crashes/unresolve', { params }),


    'Failed to execute request to /i/crashes/unresolve'


  );
  
  return {
    content: [
      {
        type: 'text',
        text: `Crash ${crash_id} unresolved successfully: ${JSON.stringify(response.data, null, 2)}`,
      },
    ],
  };
}

// ============================================================================
// VIEW_CRASH TOOL
// ============================================================================

export const viewCrashToolDefinition = {
  name: 'crashes_get',
  description: 'Get detailed data for a single crash group (stack trace, affected users, device/app-version breakdown, comments) via /o?method=crashes&group=. Requires the crashes plugin. To list crash groups use crash_groups_list.',
  inputSchema: {
    type: 'object',
    properties: {
      app_id: { type: 'string', description: 'Application ID. Either app_id or app_name must be provided; call apps_list first if you do not know it.' },
      app_name: { type: 'string', description: 'Application name (alternative to app_id). Must match an existing app exactly; call apps_list to find valid names.' },
      crash_id: { type: 'string', description: 'Crash group identifier (_id) to fetch. Obtain it from crash_groups_list.' },
      period: {
        type: 'string',
        description: 'Time period. One of "month", "60days", "30days", "7days", "yesterday", "hour", or a custom range as [startMilliseconds,endMilliseconds] (e.g. "[1417730400000,1420149600000]"). Defaults to "30days".',
        default: '30days'
      },
    },
    required: ['crash_id'],
  },
};

export async function handleViewCrash(context: ToolContext, args: any): Promise<ToolResult> {
  const app_id = await context.resolveAppId(args);
  const { crash_id, period = '30days' } = args;
  
  const params = {
    ...context.getAuthParams(),
    app_id,
    method: 'crashes',
    group: crash_id,
    period,
  };

  const response = await safeApiCall(


    () => context.httpClient.get('/o', { params }),


    'Failed to execute request to /o'


  );
  
  return {
    content: [
      {
        type: 'text',
        text: `Crash group with id ${crash_id} data: ${JSON.stringify(response.data, null, 2)}`,
      },
    ],
  };
}

// ============================================================================
// HIDE_CRASH TOOL
// ============================================================================

export const hideCrashToolDefinition = {
  name: 'crashes_hide',
  description: 'Hide a crash group from default listings (data is preserved) via /i/crashes/hide. Requires the crashes plugin. To reveal again use crashes_show.',
  inputSchema: {
    type: 'object',
    properties: {
      app_id: { type: 'string', description: 'Application ID. Either app_id or app_name must be provided; call apps_list first if you do not know it.' },
      app_name: { type: 'string', description: 'Application name (alternative to app_id). Must match an existing app exactly; call apps_list to find valid names.' },
      crash_id: { type: 'string', description: 'Crash group identifier (_id) to hide. Obtain it from crash_groups_list.' },
    },
    required: ['crash_id'],
  },
};

export async function handleHideCrash(context: ToolContext, args: any): Promise<ToolResult> {
  const app_id = await context.resolveAppId(args);
  const { crash_id } = args;
  
  const params = {
    ...context.getAuthParams(),
    app_id,
    args: JSON.stringify({ crash_id }),
  };

  const response = await safeApiCall(


    () => context.httpClient.get('/i/crashes/hide', { params }),


    'Failed to execute request to /i/crashes/hide'


  );
  
  return {
    content: [
      {
        type: 'text',
        text: `Crash ${crash_id} hidden successfully: ${JSON.stringify(response.data, null, 2)}`,
      },
    ],
  };
}

// ============================================================================
// SHOW_CRASH TOOL
// ============================================================================

export const showCrashToolDefinition = {
  name: 'crashes_show',
  description: 'Reveal a previously hidden crash group in listings via /i/crashes/show. Requires the crashes plugin. To hide again use crashes_hide.',
  inputSchema: {
    type: 'object',
    properties: {
      app_id: { type: 'string', description: 'Application ID. Either app_id or app_name must be provided; call apps_list first if you do not know it.' },
      app_name: { type: 'string', description: 'Application name (alternative to app_id). Must match an existing app exactly; call apps_list to find valid names.' },
      crash_id: { type: 'string', description: 'Crash group identifier (_id) to unhide. Obtain it from crash_groups_list.' },
    },
    required: ['crash_id'],
  },
};

export async function handleShowCrash(context: ToolContext, args: any): Promise<ToolResult> {
  const app_id = await context.resolveAppId(args);
  const { crash_id } = args;
  
  const params = {
    ...context.getAuthParams(),
    app_id,
    args: JSON.stringify({ crash_id }),
  };

  const response = await safeApiCall(


    () => context.httpClient.get('/i/crashes/show', { params }),


    'Failed to execute request to /i/crashes/show'


  );
  
  return {
    content: [
      {
        type: 'text',
        text: `Crash ${crash_id} shown successfully: ${JSON.stringify(response.data, null, 2)}`,
      },
    ],
  };
}

// ============================================================================
// ADD_CRASH_COMMENT TOOL
// ============================================================================

export const addCrashCommentToolDefinition = {
  name: 'crashes_comment_add',
  description: 'Post a new comment on a crash group via /i/crashes/add_comment. Requires the crashes plugin. To change an existing comment use crashes_comment_update.',
  inputSchema: {
    type: 'object',
    properties: {
      app_id: { type: 'string', description: 'Application ID. Either app_id or app_name must be provided; call apps_list first if you do not know it.' },
      app_name: { type: 'string', description: 'Application name (alternative to app_id). Must match an existing app exactly; call apps_list to find valid names.' },
      crash_id: { type: 'string', description: 'Crash group identifier (_id) to comment on. Obtain it from crash_groups_list.' },
      comment: { type: 'string', description: 'Comment body to post.' },
    },
    required: ['crash_id', 'comment'],
  },
};

export async function handleAddCrashComment(context: ToolContext, args: any): Promise<ToolResult> {
  const app_id = await context.resolveAppId(args);
  const { crash_id, comment } = args;
  
  const params = {
    ...context.getAuthParams(),
    app_id,
    args: JSON.stringify({ 
      text: comment,
      crash_id, 
      app_id 
    }),
  };

  const response = await safeApiCall(


    () => context.httpClient.get('/i/crashes/add_comment', { params }),


    'Failed to execute request to /i/crashes/add_comment'


  );
  
  return {
    content: [
      {
        type: 'text',
        text: `Comment added to crash ${crash_id}: ${JSON.stringify(response.data, null, 2)}`,
      },
    ],
  };
}

// ============================================================================
// EDIT_CRASH_COMMENT TOOL
// ============================================================================

export const editCrashCommentToolDefinition = {
  name: 'crashes_comment_update',
  description: 'Replace the text of an existing crash-group comment via /i/crashes/edit_comment. Requires the crashes plugin. To remove the comment use crashes_comment_delete.',
  inputSchema: {
    type: 'object',
    properties: {
      app_id: { type: 'string', description: 'Application ID. Either app_id or app_name must be provided; call apps_list first if you do not know it.' },
      app_name: { type: 'string', description: 'Application name (alternative to app_id). Must match an existing app exactly; call apps_list to find valid names.' },
      crash_id: { type: 'string', description: 'Crash group identifier (_id) that owns the comment. Obtain it from crash_groups_list.' },
      comment_id: { type: 'string', description: 'Identifier of the comment to edit. Obtain it from crashes_get.' },
      comment: { type: 'string', description: 'Replacement comment body.' },
    },
    required: ['crash_id', 'comment_id', 'comment'],
  },
};

export async function handleEditCrashComment(context: ToolContext, args: any): Promise<ToolResult> {
  const app_id = await context.resolveAppId(args);
  const { crash_id, comment_id, comment } = args;
  
  const params = {
    ...context.getAuthParams(),
    app_id,
    args: JSON.stringify({ 
      text: comment,
      crash_id, 
      comment_id,
      app_id 
    }),
  };

  const response = await safeApiCall(


    () => context.httpClient.get('/i/crashes/edit_comment', { params }),


    'Failed to execute request to /i/crashes/edit_comment'


  );
  
  return {
    content: [
      {
        type: 'text',
        text: `Comment ${comment_id} edited on crash ${crash_id}: ${JSON.stringify(response.data, null, 2)}`,
      },
    ],
  };
}

// ============================================================================
// DELETE_CRASH_COMMENT TOOL
// ============================================================================

export const deleteCrashCommentToolDefinition = {
  name: 'crashes_comment_delete',
  description: 'Delete a single comment from a crash group via /i/crashes/delete_comment. Requires the crashes plugin. WARNING: irreversible.',
  inputSchema: {
    type: 'object',
    properties: {
      app_id: { type: 'string', description: 'Application ID. Either app_id or app_name must be provided; call apps_list first if you do not know it.' },
      app_name: { type: 'string', description: 'Application name (alternative to app_id). Must match an existing app exactly; call apps_list to find valid names.' },
      crash_id: { type: 'string', description: 'Crash group identifier (_id) that owns the comment. Obtain it from crash_groups_list.' },
      comment_id: { type: 'string', description: 'Identifier of the comment to delete. Obtain it from crashes_get.' },
    },
    required: ['crash_id', 'comment_id'],
  },
};

export async function handleDeleteCrashComment(context: ToolContext, args: any): Promise<ToolResult> {
  const app_id = await context.resolveAppId(args);
  const { crash_id, comment_id } = args;
  
  const params = {
    ...context.getAuthParams(),
    app_id,
    args: JSON.stringify({ 
      comment_id,
      crash_id,
      app_id 
    }),
  };

  const response = await safeApiCall(


    () => context.httpClient.get('/i/crashes/delete_comment', { params }),


    'Failed to execute request to /i/crashes/delete_comment'


  );
  
  return {
    content: [
      {
        type: 'text',
        text: `Comment ${comment_id} deleted from crash ${crash_id}: ${JSON.stringify(response.data, null, 2)}`,
      },
    ],
  };
}

// ============================================================================
// LIST_CRASH_GROUPS TOOL
// ============================================================================

export const listCrashGroupsToolDefinition = {
  name: 'crash_groups_list',
  description: 'List crash groups (deduplicated crash/error buckets) for an app with pagination and optional MongoDB filter, via /o?method=crashes. Requires the crashes plugin. For detail on one group use crashes_get; for overall counts/graph use crashes_stats_get.',
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
      query: { type: 'string', description: 'MongoDB filter as a JSON string (e.g. \'{"is_resolved":false}\'). Defaults to \'{}\' (no filter).', default: '{}' },
      skip: { type: 'number', description: 'Number of records to skip for pagination. Defaults to 0.', default: 0 },
      limit: { type: 'number', description: 'Maximum number of records to return. Defaults to 10.', default: 10 },
    },
  },
};

export async function handleListCrashGroups(context: ToolContext, args: any): Promise<ToolResult> {
  const app_id = await context.resolveAppId(args);
  const { period = '30days', query = '{}', skip = 0, limit = 10 } = args;
  
  const params = {
    ...context.getAuthParams(),
    app_id,
    method: 'crashes',
    period,
    query,
    iDisplayStart: skip,
    iDisplayLength: limit,
  };

  const response = await safeApiCall(


    () => context.httpClient.get('/o', { params }),


    'Failed to execute request to /o'


  );
  
  return {
    content: [
      {
        type: 'text',
        text: `Crash groups for app ${app_id}:\n${JSON.stringify(response.data, null, 2)}`,
      },
    ],
  };
}

// ============================================================================
// GET_CRASH_STATISTICS TOOL
// ============================================================================

export const getCrashStatisticsToolDefinition = {
  name: 'crashes_stats_get',
  description: 'Get overall crash statistics and time-series graph data for an app via /o?method=crashes&graph=1. Requires the crashes plugin. To see individual crash groups use crash_groups_list.',
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

export async function handleGetCrashStatistics(context: ToolContext, args: any): Promise<ToolResult> {
  const app_id = await context.resolveAppId(args);
  const { period = '30days' } = args;
  
  const params = {
    ...context.getAuthParams(),
    app_id,
    method: 'crashes',
    graph: 1,
    period,
  };

  const response = await safeApiCall(


    () => context.httpClient.get('/o', { params }),


    'Failed to execute request to /o'


  );
  
  return {
    content: [
      {
        type: 'text',
        text: `Crash statistics for app ${app_id}:\n${JSON.stringify(response.data, null, 2)}`,
      },
    ],
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export const crashAnalyticsToolDefinitions = [
  resolveCrashToolDefinition,
  unresolveCrashToolDefinition,
  viewCrashToolDefinition,
  hideCrashToolDefinition,
  showCrashToolDefinition,
  addCrashCommentToolDefinition,
  editCrashCommentToolDefinition,
  deleteCrashCommentToolDefinition,
  listCrashGroupsToolDefinition,
  getCrashStatisticsToolDefinition,
];

export const crashAnalyticsToolHandlers = {
  'crashes_resolve': 'resolveCrash',
  'crashes_unresolve': 'unresolveCrash',
  'crashes_get': 'viewCrash',
  'crashes_hide': 'hideCrash',
  'crashes_show': 'showCrash',
  'crashes_comment_add': 'addCrashComment',
  'crashes_comment_update': 'editCrashComment',
  'crashes_comment_delete': 'deleteCrashComment',
  'crash_groups_list': 'listCrashGroups',
  'crashes_stats_get': 'getCrashStatistics',
} as const;

export class CrashAnalyticsTools {
  constructor(private context: ToolContext) {}

  async resolveCrash(args: any): Promise<ToolResult> {
    return handleResolveCrash(this.context, args);
  }

  async unresolveCrash(args: any): Promise<ToolResult> {
    return handleUnresolveCrash(this.context, args);
  }

  async viewCrash(args: any): Promise<ToolResult> {
    return handleViewCrash(this.context, args);
  }

  async hideCrash(args: any): Promise<ToolResult> {
    return handleHideCrash(this.context, args);
  }

  async showCrash(args: any): Promise<ToolResult> {
    return handleShowCrash(this.context, args);
  }

  async addCrashComment(args: any): Promise<ToolResult> {
    return handleAddCrashComment(this.context, args);
  }

  async editCrashComment(args: any): Promise<ToolResult> {
    return handleEditCrashComment(this.context, args);
  }

  async deleteCrashComment(args: any): Promise<ToolResult> {
    return handleDeleteCrashComment(this.context, args);
  }

  async listCrashGroups(args: any): Promise<ToolResult> {
    return handleListCrashGroups(this.context, args);
  }

  async getCrashStatistics(args: any): Promise<ToolResult> {
    return handleGetCrashStatistics(this.context, args);
  }
}

// Metadata for dynamic routing (must be after class declaration)
export const crashAnalyticsToolMetadata = {
  instanceKey: 'crashAnalytics',
  toolClass: CrashAnalyticsTools,
  handlers: crashAnalyticsToolHandlers,
} as const;
