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
      data: { 
        type: 'object',
        description: 'User profile data object containing standard and/or custom fields',
        properties: {
          did: {
            type: 'string',
            description: 'Device ID - unique identifier for the user (required)'
          },
          name: {
            type: 'string',
            description: 'User\'s full name'
          },
          username: {
            type: 'string',
            description: 'Username'
          },
          email: {
            type: 'string',
            format: 'email',
            description: 'Email address'
          },
          organization: {
            type: 'string',
            description: 'Organization name'
          },
          phone: {
            type: 'string',
            description: 'Phone number'
          },
          picture: {
            type: 'string',
            format: 'uri',
            description: 'URL to user\'s profile picture'
          },
          gender: {
            type: 'string',
            enum: ['M', 'F'],
            description: 'Gender (M for Male, F for Female)'
          },
          byear: {
            type: 'number',
            description: 'Birth year (e.g., 1995)'
          },
          custom: {
            type: 'object',
            description: 'Custom key-value pairs specific to your application. Values can be strings, numbers, arrays, or objects. Examples: subscription_plan, role, preferences, achievements, etc.',
            additionalProperties: true
          }
        },
        required: ['did']
      },
    },
    anyOf: [
      { required: ['app_id', 'data'] },
      { required: ['app_name', 'data'] }
    ],
  },
};

export async function handleCreateAppUser(context: ToolContext, args: any): Promise<ToolResult> {
  const app_id = await context.resolveAppId(args);
  const { data } = args;
  
  const params = {
    ...context.getAuthParams(),
    app_id,
    data: typeof data === 'string' ? data : JSON.stringify(data),
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
// EDIT_APP_USER TOOL
// ============================================================================

export const editAppUserToolDefinition = {
  name: 'edit_app_user',
  description: 'Update existing app user(s) using MongoDB query and update operations. Allows bulk updates matching specific criteria.',
  inputSchema: {
    type: 'object',
    properties: {
      app_id: { type: 'string', description: 'Application ID (optional if app_name is provided)' },
      app_name: { type: 'string', description: 'Application name (alternative to app_id)' },
      query: {
        type: 'object',
        description: 'MongoDB query object to find users to update. Examples: {"uid": "user123"} to update specific user, {"custom.plan": "free"} to update all free plan users, {} to update all users (use with caution)',
        additionalProperties: true
      },
      update: {
        type: 'object',
        description: 'MongoDB update object specifying how to modify matching users. Use MongoDB update operators like $set, $inc, $push, $pull, etc.',
        properties: {
          $set: {
            type: 'object',
            description: 'Set field values. Example: {"name": "New Name", "custom.plan": "premium"}',
            additionalProperties: true
          },
          $inc: {
            type: 'object',
            description: 'Increment numeric fields. Example: {"custom.login_count": 1}',
            additionalProperties: true
          },
          $unset: {
            type: 'object',
            description: 'Remove fields. Example: {"custom.old_field": ""}',
            additionalProperties: true
          },
          $push: {
            type: 'object',
            description: 'Add item to array. Example: {"custom.tags": "new_tag"}',
            additionalProperties: true
          },
          $pull: {
            type: 'object',
            description: 'Remove item from array. Example: {"custom.tags": "old_tag"}',
            additionalProperties: true
          },
          $addToSet: {
            type: 'object',
            description: 'Add item to array if not exists. Example: {"custom.tags": "unique_tag"}',
            additionalProperties: true
          },
          $currentDate: {
            type: 'object',
            description: 'Set field to current date. Example: {"custom.last_updated": true}',
            additionalProperties: true
          }
        },
        additionalProperties: true
      }
    },
    anyOf: [
      { required: ['app_id', 'query', 'update'] },
      { required: ['app_name', 'query', 'update'] }
    ],
  },
};

export async function handleEditAppUser(context: ToolContext, args: any): Promise<ToolResult> {
  const app_id = await context.resolveAppId(args);
  const { query, update } = args;
  
  const params = {
    ...context.getAuthParams(),
    app_id,
    query: typeof query === 'string' ? query : JSON.stringify(query),
    update: typeof update === 'string' ? update : JSON.stringify(update),
  };

  const response = await context.httpClient.post('/i/app_users/update', null, { params });
  
  return {
    content: [
      {
        type: 'text',
        text: `User(s) updated for app ${app_id}:\n${JSON.stringify(response.data, null, 2)}`,
      },
    ],
  };
}

// ============================================================================
// DELETE_APP_USER TOOL
// ============================================================================

export const deleteAppUserToolDefinition = {
  name: 'delete_app_user',
  description: 'Delete app user(s) matching a MongoDB query. Can delete single or multiple users based on the query criteria.',
  inputSchema: {
    type: 'object',
    properties: {
      app_id: { type: 'string', description: 'Application ID (optional if app_name is provided)' },
      app_name: { type: 'string', description: 'Application name (alternative to app_id)' },
      query: { 
        type: 'object', 
        description: 'MongoDB query object to find users to delete. Examples: {"uid": "user123"} to delete specific user, {"custom.plan": "expired"} to delete all users with expired plan, {"did": "device-id"} to delete by device ID',
        additionalProperties: true 
      },
      force: { 
        type: 'boolean', 
        description: 'Force delete if multiple users match the query. Set to true to allow deletion of multiple users at once.', 
        default: false 
      },
    },
    anyOf: [
      { required: ['app_id', 'query'] },
      { required: ['app_name', 'query'] }
    ],
  },
};

export async function handleDeleteAppUser(context: ToolContext, args: any): Promise<ToolResult> {
  const app_id = await context.resolveAppId(args);
  const { query, force = false } = args;
  
  const params = {
    ...context.getAuthParams(),
    app_id,
    query: typeof query === 'string' ? query : JSON.stringify(query),
    force,
  };

  const response = await context.httpClient.post('/i/app_users/delete', null, { params });
  
  return {
    content: [
      {
        type: 'text',
        text: `User(s) matching query deleted from app ${app_id}:\n${JSON.stringify(response.data, null, 2)}`,
      },
    ],
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export const appUsersToolDefinitions = [
  createAppUserToolDefinition,
  editAppUserToolDefinition,
  deleteAppUserToolDefinition,
];

export const appUsersToolHandlers = {
  'create_app_user': 'createAppUser',
  'edit_app_user': 'editAppUser',
  'delete_app_user': 'deleteAppUser',
} as const;

export class AppUsersTools {
  constructor(private context: ToolContext) {}

  async createAppUser(args: any): Promise<ToolResult> {
    return handleCreateAppUser(this.context, args);
  }

  async editAppUser(args: any): Promise<ToolResult> {
    return handleEditAppUser(this.context, args);
  }

  async deleteAppUser(args: any): Promise<ToolResult> {
    return handleDeleteAppUser(this.context, args);
  }
}

// Metadata for dynamic routing (must be after class declaration)
export const appUsersToolMetadata = {
  instanceKey: 'appUsers',
  toolClass: AppUsersTools,
  handlers: appUsersToolHandlers,
} as const;
