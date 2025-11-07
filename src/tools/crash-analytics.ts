import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { ToolContext, ToolResult } from './types.js';

// ============================================================================
// RESOLVE_CRASH TOOL
// ============================================================================

export const resolveCrashToolDefinition = {
  name: 'resolve_crash',
  description: 'Mark a crash group as resolved',
  inputSchema: {
    type: 'object',
    properties: {
      app_id: { type: 'string', description: 'Application ID (optional if app_name is provided)' },
      app_name: { type: 'string', description: 'Application name (alternative to app_id)' },
      crash_id: { type: 'string', description: 'Crash ID to resolve' },
    },
    required: ['crash_id'],
    anyOf: [
      { required: ['app_id'] },
      { required: ['app_name'] }
    ],
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

  const response = await context.httpClient.get('/i/crashes/resolve', { params });
  
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
  name: 'unresolve_crash',
  description: 'Mark a crash group as unresolved',
  inputSchema: {
    type: 'object',
    properties: {
      app_id: { type: 'string', description: 'Application ID (optional if app_name is provided)' },
      app_name: { type: 'string', description: 'Application name (alternative to app_id)' },
      crash_id: { type: 'string', description: 'Crash ID to unresolve' },
    },
    required: ['crash_id'],
    anyOf: [
      { required: ['app_id'] },
      { required: ['app_name'] }
    ],
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

  const response = await context.httpClient.get('/i/crashes/unresolve', { params });
  
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
  name: 'view_crash',
  description: 'View data for specific crash group',
  inputSchema: {
    type: 'object',
    properties: {
      app_id: { type: 'string', description: 'Application ID (optional if app_name is provided)' },
      app_name: { type: 'string', description: 'Application name (alternative to app_id)' },
      crash_id: { type: 'string', description: 'Crash ID to view' },
      period: { 
        type: 'string', 
        description: 'Time period for data. Possible values: "month", "60days", "30days", "7days", "yesterday", "hour", or custom range as [startMilliseconds,endMilliseconds] (e.g., "[1417730400000,1420149600000]")', 
        default: '30days' 
      },
    },
    required: ['crash_id'],
    anyOf: [
      { required: ['app_id'] },
      { required: ['app_name'] }
    ],
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

  const response = await context.httpClient.get('/o', { params });
  
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
  name: 'hide_crash',
  description: 'Hide a crash group from view',
  inputSchema: {
    type: 'object',
    properties: {
      app_id: { type: 'string', description: 'Application ID (optional if app_name is provided)' },
      app_name: { type: 'string', description: 'Application name (alternative to app_id)' },
      crash_id: { type: 'string', description: 'Crash ID to hide' },
    },
    required: ['crash_id'],
    anyOf: [
      { required: ['app_id'] },
      { required: ['app_name'] }
    ],
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

  const response = await context.httpClient.get('/i/crashes/hide', { params });
  
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
  name: 'show_crash',
  description: 'Show a hidden crash group',
  inputSchema: {
    type: 'object',
    properties: {
      app_id: { type: 'string', description: 'Application ID (optional if app_name is provided)' },
      app_name: { type: 'string', description: 'Application name (alternative to app_id)' },
      crash_id: { type: 'string', description: 'Crash ID to show' },
    },
    required: ['crash_id'],
    anyOf: [
      { required: ['app_id'] },
      { required: ['app_name'] }
    ],
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

  const response = await context.httpClient.get('/i/crashes/show', { params });
  
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
  name: 'add_crash_comment',
  description: 'Add a comment to a crash group',
  inputSchema: {
    type: 'object',
    properties: {
      app_id: { type: 'string', description: 'Application ID (optional if app_name is provided)' },
      app_name: { type: 'string', description: 'Application name (alternative to app_id)' },
      crash_id: { type: 'string', description: 'Crash ID to comment on' },
      comment: { type: 'string', description: 'Comment text to add' },
    },
    required: ['crash_id', 'comment'],
    anyOf: [
      { required: ['app_id'] },
      { required: ['app_name'] }
    ],
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

  const response = await context.httpClient.get('/i/crashes/add_comment', { params });
  
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
  name: 'edit_crash_comment',
  description: 'Edit an existing comment on a crash group',
  inputSchema: {
    type: 'object',
    properties: {
      app_id: { type: 'string', description: 'Application ID (optional if app_name is provided)' },
      app_name: { type: 'string', description: 'Application name (alternative to app_id)' },
      crash_id: { type: 'string', description: 'Crash ID containing the comment' },
      comment_id: { type: 'string', description: 'ID of the comment to edit' },
      comment: { type: 'string', description: 'New comment text' },
    },
    required: ['crash_id', 'comment_id', 'comment'],
    anyOf: [
      { required: ['app_id'] },
      { required: ['app_name'] }
    ],
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

  const response = await context.httpClient.get('/i/crashes/edit_comment', { params });
  
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
  name: 'delete_crash_comment',
  description: 'Delete a comment from a crash group',
  inputSchema: {
    type: 'object',
    properties: {
      app_id: { type: 'string', description: 'Application ID (optional if app_name is provided)' },
      app_name: { type: 'string', description: 'Application name (alternative to app_id)' },
      crash_id: { type: 'string', description: 'Crash ID containing the comment' },
      comment_id: { type: 'string', description: 'ID of the comment to delete' },
    },
    required: ['crash_id', 'comment_id'],
    anyOf: [
      { required: ['app_id'] },
      { required: ['app_name'] }
    ],
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

  const response = await context.httpClient.get('/i/crashes/delete_comment', { params });
  
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
  name: 'list_crash_groups',
  description: 'List crash groups for an app with optional filtering',
  inputSchema: {
    type: 'object',
    properties: {
      app_id: { type: 'string', description: 'Application ID (optional if app_name is provided)' },
      app_name: { type: 'string', description: 'Application name (alternative to app_id)' },
      period: { 
        type: 'string', 
        description: 'Time period for data. Possible values: "month", "60days", "30days", "7days", "yesterday", "hour", or custom range as [startMilliseconds,endMilliseconds] (e.g., "[1417730400000,1420149600000]")', 
        default: '30days' 
      },
      query: { type: 'string', description: 'Optional MongoDB query as JSON string for filtering', default: '{}' },
      skip: { type: 'number', description: 'Number of records to skip for pagination', default: 0 },
      limit: { type: 'number', description: 'Maximum number of records to return', default: 10 },
    },
    anyOf: [
      { required: ['app_id'] },
      { required: ['app_name'] }
    ],
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

  const response = await context.httpClient.get('/o', { params });
  
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
  name: 'get_crash_statistics',
  description: 'Get overall crash statistics and graph data for an app',
  inputSchema: {
    type: 'object',
    properties: {
      app_id: { type: 'string', description: 'Application ID (optional if app_name is provided)' },
      app_name: { type: 'string', description: 'Application name (alternative to app_id)' },
      period: { 
        type: 'string', 
        description: 'Time period for data. Possible values: "month", "60days", "30days", "7days", "yesterday", "hour", or custom range as [startMilliseconds,endMilliseconds] (e.g., "[1417730400000,1420149600000]")', 
        default: '30days' 
      },
    },
    anyOf: [
      { required: ['app_id'] },
      { required: ['app_name'] }
    ],
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

  const response = await context.httpClient.get('/o', { params });
  
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
  'resolve_crash': 'resolveCrash',
  'unresolve_crash': 'unresolveCrash',
  'view_crash': 'viewCrash',
  'hide_crash': 'hideCrash',
  'show_crash': 'showCrash',
  'add_crash_comment': 'addCrashComment',
  'edit_crash_comment': 'editCrashComment',
  'delete_crash_comment': 'deleteCrashComment',
  'list_crash_groups': 'listCrashGroups',
  'get_crash_statistics': 'getCrashStatistics',
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
