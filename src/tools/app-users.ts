import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { ToolContext, ToolResult } from './types.js';

// ============================================================================
// CREATE_APP_USER TOOL
// ============================================================================

export const createAppUserToolDefinition = {
  name: 'create_app_user',
  description: 'Create a new app user (end-user of your application being tracked by Countly)',
  inputSchema: {
    type: 'object',
    properties: {
      app_id: { type: 'string', description: 'Application ID (optional if app_name is provided)' },
      app_name: { type: 'string', description: 'Application name (alternative to app_id)' },
      user_data: { type: 'string', description: 'JSON string containing user data' },
    },
    anyOf: [
      { required: ['app_id', 'user_data'] },
      { required: ['app_name', 'user_data'] }
    ],
  },
};

export async function handleCreateAppUser(context: ToolContext, args: any): Promise<ToolResult> {
  const app_id = await context.resolveAppId(args);
  const { user_data } = args;
  
  const params = {
    ...context.getAuthParams(),
    app_id,
    user_data,
  };

  const response = await context.httpClient.post('/i/app_users/create', null, { params });
  
  return {
    content: [
      {
        type: 'text',
        text: `User created for app ${app_id}:\n${JSON.stringify(response.data, null, 2)}`,
      },
    ],
  };
}

// ============================================================================
// DELETE_APP_USER TOOL
// ============================================================================

export const deleteAppUserToolDefinition = {
  name: 'delete_app_user',
  description: 'Delete an app user (end-user of your application)',
  inputSchema: {
    type: 'object',
    properties: {
      app_id: { type: 'string', description: 'Application ID (optional if app_name is provided)' },
      app_name: { type: 'string', description: 'Application name (alternative to app_id)' },
      uid: { type: 'string', description: 'User ID to delete' },
      force: { type: 'boolean', description: 'Force delete if multiple users match', default: false },
    },
    anyOf: [
      { required: ['app_id', 'uid'] },
      { required: ['app_name', 'uid'] }
    ],
  },
};

export async function handleDeleteAppUser(context: ToolContext, args: any): Promise<ToolResult> {
  const app_id = await context.resolveAppId(args);
  const { uid, force = false } = args;
  
  const params = {
    ...context.getAuthParams(),
    app_id,
    uid,
    force,
  };

  const response = await context.httpClient.post('/i/app_users/delete', null, { params });
  
  return {
    content: [
      {
        type: 'text',
        text: `User ${uid} deleted from app ${app_id}:\n${JSON.stringify(response.data, null, 2)}`,
      },
    ],
  };
}

// ============================================================================
// EXPORT_APP_USERS TOOL
// ============================================================================

export const exportAppUsersToolDefinition = {
  name: 'export_app_users',
  description: 'Export all data for app users (end-users of your application)',
  inputSchema: {
    type: 'object',
    properties: {
      app_id: { type: 'string', description: 'Application ID (optional if app_name is provided)' },
      app_name: { type: 'string', description: 'Application name (alternative to app_id)' },
      export_type: { 
        type: 'string', 
        enum: ['json', 'csv'], 
        description: 'Export format',
        default: 'json'
      },
    },
    anyOf: [
      { required: ['app_id'] },
      { required: ['app_name'] }
    ],
  },
};

export async function handleExportAppUsers(context: ToolContext, args: any): Promise<ToolResult> {
  const app_id = await context.resolveAppId(args);
  const { export_type = 'json' } = args;
  
  const params = {
    ...context.getAuthParams(),
    app_id,
    export_type,
  };

  const response = await context.httpClient.get('/i/app_users/export', { params });
  
  return {
    content: [
      {
        type: 'text',
        text: `Users export for app ${app_id} (${export_type}):\n${JSON.stringify(response.data, null, 2)}`,
      },
    ],
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export const appUsersToolDefinitions = [
  createAppUserToolDefinition,
  deleteAppUserToolDefinition,
  exportAppUsersToolDefinition,
];

export const appUsersToolHandlers = {
  'create_app_user': 'createAppUser',
  'delete_app_user': 'deleteAppUser',
  'export_app_users': 'exportAppUsers',
} as const;

export class AppUsersTools {
  constructor(private context: ToolContext) {}

  async createAppUser(args: any): Promise<ToolResult> {
    return handleCreateAppUser(this.context, args);
  }

  async deleteAppUser(args: any): Promise<ToolResult> {
    return handleDeleteAppUser(this.context, args);
  }

  async exportAppUsers(args: any): Promise<ToolResult> {
    return handleExportAppUsers(this.context, args);
  }
}

// Metadata for dynamic routing (must be after class declaration)
export const appUsersToolMetadata = {
  instanceKey: 'appUsers',
  toolClass: AppUsersTools,
  handlers: appUsersToolHandlers,
} as const;
