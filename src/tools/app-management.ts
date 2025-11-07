import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';

import { ToolContext, ToolResult } from './types.js';

// ============================================================================
// LIST_APPS TOOL
// ============================================================================

export const listAppsToolDefinition = {
  name: 'list_apps',
  description: 'List all available applications with their names and IDs',
  inputSchema: {
    type: 'object',
    properties: {},
    required: [],
  },
};

export async function handleListApps(context: ToolContext, _: any): Promise<ToolResult> {
  const apps = await context.getApps();
  
  return {
    content: [
      {
        type: 'text',
        text: `Available applications:\n${apps.map(app => `- ${app.name} (ID: ${app._id})`).join('\n')}`,
      },
    ],
  };
}

// ============================================================================
// GET_APP_BY_NAME TOOL
// ============================================================================

export const getAppByNameToolDefinition = {
  name: 'get_app_by_name',
  description: 'Get app information by app name',
  inputSchema: {
    type: 'object',
    properties: {
      app_name: { type: 'string', description: 'Application name' },
    },
    required: ['app_name'],
  },
};

export async function handleGetAppByName(context: ToolContext, args: any): Promise<ToolResult> {
  const { app_name } = args;
  const apps = await context.getApps();
  const app = apps.find(a => a.name.toLowerCase() === app_name.toLowerCase());
  
  if (!app) {
    throw new McpError(
      ErrorCode.InvalidParams,
      `App with name "${app_name}" not found. Available apps: ${apps.map(a => a.name).join(', ')}`
    );
  }
  
  return {
    content: [
      {
        type: 'text',
        text: `App information:\n${JSON.stringify(app, null, 2)}`,
      },
    ],
  };
}

// ============================================================================
// CREATE_APP TOOL
// ============================================================================

export const createAppToolDefinition = {
  name: 'create_app',
  description: 'Create a new app in Countly (requires global admin privileges)',
  inputSchema: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Application name' },
      country: { type: 'string', description: 'Country code (e.g., "US")' },
      timezone: { type: 'string', description: 'Timezone (e.g., "America/New_York")' },
      category: { type: 'string', description: 'App category (optional)' },
    },
    required: ['name'],
  },
};

export async function handleCreateApp(context: ToolContext, args: any): Promise<ToolResult> {
  const { name, country, timezone, category } = args;
  
  const appData: any = { name };
  if (country) {
appData.country = country;
}
  if (timezone) {
appData.timezone = timezone;
}
  if (category) {
appData.category = category;
}
  
  const response = await context.httpClient.get('/i/apps/create', {
    params: {
      ...context.getAuthParams(),
      args: JSON.stringify(appData),
    },
  });
  
  return {
    content: [
      {
        type: 'text',
        text: `App created successfully:\n${JSON.stringify(response.data, null, 2)}`,
      },
    ],
  };
}

// ============================================================================
// UPDATE_APP TOOL
// ============================================================================

export const updateAppToolDefinition = {
  name: 'update_app',
  description: 'Update an existing app in Countly',
  inputSchema: {
    type: 'object',
    properties: {
      app_id: { type: 'string', description: 'Application ID (optional if app_name is provided)' },
      app_name: { type: 'string', description: 'Application name (alternative to app_id)' },
      name: { type: 'string', description: 'New application name (optional)' },
      country: { type: 'string', description: 'Country code (optional)' },
      timezone: { type: 'string', description: 'Timezone (optional)' },
      category: { type: 'string', description: 'App category (optional)' },
    },
    anyOf: [
      { required: ['app_id'] },
      { required: ['app_name'] }
    ],
  },
};

export async function handleUpdateApp(context: ToolContext, args: any): Promise<ToolResult> {
  const { app_id, app_name, name, country, timezone, category } = args;
  const targetAppId = await context.resolveAppId({ app_id, app_name });
  
  const updateData: any = {};
  if (name) {
updateData.name = name;
}
  if (country) {
updateData.country = country;
}
  if (timezone) {
updateData.timezone = timezone;
}
  if (category) {
updateData.category = category;
}
  
  // Include app_id in the args for updates
  updateData.app_id = targetAppId;
  
  const response = await context.httpClient.get('/i/apps/update', {
    params: {
      ...context.getAuthParams(),
      app_id: targetAppId,
      args: JSON.stringify(updateData),
    },
  });
  
  return {
    content: [
      {
        type: 'text',
        text: `App updated successfully:\n${JSON.stringify(response.data, null, 2)}`,
      },
    ],
  };
}

// ============================================================================
// DELETE_APP TOOL
// ============================================================================

export const deleteAppToolDefinition = {
  name: 'delete_app',
  description: 'Delete an app from Countly (requires global admin privileges)',
  inputSchema: {
    type: 'object',
    properties: {
      app_id: { type: 'string', description: 'Application ID (optional if app_name is provided)' },
      app_name: { type: 'string', description: 'Application name (alternative to app_id)' },
    },
    anyOf: [
      { required: ['app_id'] },
      { required: ['app_name'] }
    ],
  },
};

export async function handleDeleteApp(context: ToolContext, args: any): Promise<ToolResult> {
  const { app_id, app_name } = args;
  const targetAppId = await context.resolveAppId({ app_id, app_name });
  
  const response = await context.httpClient.get('/i/apps/delete', {
    params: {
      ...context.getAuthParams(),
      args: JSON.stringify({ app_id: targetAppId }),
    },
  });
  
  return {
    content: [
      {
        type: 'text',
        text: `App deleted successfully:\n${JSON.stringify(response.data, null, 2)}`,
      },
    ],
  };
}

// ============================================================================
// RESET_APP TOOL
// ============================================================================

export const resetAppToolDefinition = {
  name: 'reset_app',
  description: 'Reset all data for an app (requires global admin privileges)',
  inputSchema: {
    type: 'object',
    properties: {
      app_id: { type: 'string', description: 'Application ID (optional if app_name is provided)' },
      app_name: { type: 'string', description: 'Application name (alternative to app_id)' },
    },
    anyOf: [
      { required: ['app_id'] },
      { required: ['app_name'] }
    ],
  },
};

export async function handleResetApp(context: ToolContext, args: any): Promise<ToolResult> {
  const { app_id, app_name } = args;
  const targetAppId = await context.resolveAppId({ app_id, app_name });
  
  const response = await context.httpClient.get('/i/apps/reset', {
    params: {
      ...context.getAuthParams(),
      args: JSON.stringify({ app_id: targetAppId, period: 'reset' }),
    },
  });
  
  return {
    content: [
      {
        type: 'text',
        text: `App reset successfully:\n${JSON.stringify(response.data, null, 2)}`,
      },
    ],
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export const appManagementToolDefinitions = [
  listAppsToolDefinition,
  getAppByNameToolDefinition,
  createAppToolDefinition,
  updateAppToolDefinition,
  deleteAppToolDefinition,
  resetAppToolDefinition,
];

export const appManagementToolHandlers = {
  'list_apps': 'listApps',
  'get_app_by_name': 'getAppByName',
  'create_app': 'createApp',
  'update_app': 'updateApp',
  'delete_app': 'deleteApp',
  'reset_app': 'resetApp',
} as const;

export class AppManagementTools {
  constructor(private context: ToolContext) {}

  async listApps(args: any): Promise<ToolResult> {
    return handleListApps(this.context, args);
  }

  async getAppByName(args: any): Promise<ToolResult> {
    return handleGetAppByName(this.context, args);
  }

  async createApp(args: any): Promise<ToolResult> {
    return handleCreateApp(this.context, args);
  }

  async updateApp(args: any): Promise<ToolResult> {
    return handleUpdateApp(this.context, args);
  }

  async deleteApp(args: any): Promise<ToolResult> {
    return handleDeleteApp(this.context, args);
  }

  async resetApp(args: any): Promise<ToolResult> {
    return handleResetApp(this.context, args);
  }
}

// Metadata for dynamic routing (must be after class declaration)
export const appManagementToolMetadata = {
  instanceKey: 'appManagement',
  toolClass: AppManagementTools,
  handlers: appManagementToolHandlers,
} as const;
