import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { safeApiCall } from '../lib/error-handler.js';

import { ToolContext, ToolResult } from './types.js';

// ============================================================================
// LIST_APPS TOOL
// ============================================================================

export const listAppsToolDefinition = {
  name: 'apps_list',
  description: 'List every Countly application the authenticated user can access, with each app name and _id. Use this first whenever an app_id is needed but unknown, or to answer "which apps are in this account?". Takes no arguments. For details of a single app by name use apps_get_by_name.',
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
  name: 'apps_get_by_name',
  description: 'Look up a single app by its exact name (case-insensitive) and return its full record (_id, keys, category, timezone, etc.). Errors if no app matches. To list all apps use apps_list.',
  inputSchema: {
    type: 'object',
    properties: {
      app_name: { type: 'string', description: 'Exact application name to look up (case-insensitive). Must match an existing app; call apps_list to see valid names.' },
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
  name: 'apps_create',
  description: 'Create a new Countly application via /i/apps/create. Requires global admin privileges. Returns the created app including its _id and API keys.',
  inputSchema: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Name for the new app. Shown in the dashboard and used by apps_get_by_name.' },
      country: { type: 'string', description: 'Default country ISO code (e.g. "US"). Optional.' },
      timezone: { type: 'string', description: 'IANA timezone for the app (e.g. "America/New_York"). Optional.' },
      category: { type: 'string', description: 'Numeric category ID string (see Countly category list). Optional.' },
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
  
  const response = await safeApiCall(

  
    () => context.httpClient.get('/i/apps/create', {
    params: {
      ...context.getAuthParams(),
      args: JSON.stringify(appData),
    },
  }),

  
    'Failed to execute request to /i/apps/create'

  
  );
  
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
  name: 'apps_update',
  description: 'Update mutable fields of an existing Countly app (name, country, timezone, category) via /i/apps/update. Only supplied fields change. For creating a new app use apps_create.',
  inputSchema: {
    type: 'object',
    properties: {
      app_id: { type: 'string', description: 'Application ID. Either app_id or app_name must be provided; call apps_list first if you do not know it.' },
      app_name: { type: 'string', description: 'Application name (alternative to app_id). Must match an existing app exactly; call apps_list to find valid names.' },
      name: { type: 'string', description: 'New display name for the app. Omit to keep current.' },
      country: { type: 'string', description: 'New default country ISO code (e.g. "US"). Omit to keep current.' },
      timezone: { type: 'string', description: 'New IANA timezone (e.g. "America/New_York"). Omit to keep current.' },
      category: { type: 'string', description: 'New category ID string. Omit to keep current.' },
    },
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
  
  const response = await safeApiCall(

  
    () => context.httpClient.get('/i/apps/update', {
    params: {
      ...context.getAuthParams(),
      app_id: targetAppId,
      args: JSON.stringify(updateData),
    },
  }),

  
    'Failed to execute request to /i/apps/update'

  
  );
  
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
  name: 'apps_delete',
  description: 'Permanently delete a Countly app and all its data via /i/apps/delete. Requires global admin privileges. WARNING: irreversible. To wipe analytics data but keep the app use apps_reset.',
  inputSchema: {
    type: 'object',
    properties: {
      app_id: { type: 'string', description: 'Application ID. Either app_id or app_name must be provided; call apps_list first if you do not know it.' },
      app_name: { type: 'string', description: 'Application name (alternative to app_id). Must match an existing app exactly; call apps_list to find valid names.' },
    },
  },
};

export async function handleDeleteApp(context: ToolContext, args: any): Promise<ToolResult> {
  const { app_id, app_name } = args;
  const targetAppId = await context.resolveAppId({ app_id, app_name });
  
  const response = await safeApiCall(

  
    () => context.httpClient.get('/i/apps/delete', {
    params: {
      ...context.getAuthParams(),
      args: JSON.stringify({ app_id: targetAppId }),
    },
  }),

  
    'Failed to execute request to /i/apps/delete'

  
  );
  
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
  name: 'apps_reset',
  description: 'Delete all analytics data for an app (sessions, events, users, crashes, etc.) while keeping the app record and keys intact, via /i/apps/reset. Requires global admin privileges. WARNING: irreversible. To also remove the app itself use apps_delete.',
  inputSchema: {
    type: 'object',
    properties: {
      app_id: { type: 'string', description: 'Application ID. Either app_id or app_name must be provided; call apps_list first if you do not know it.' },
      app_name: { type: 'string', description: 'Application name (alternative to app_id). Must match an existing app exactly; call apps_list to find valid names.' },
    },
  },
};

export async function handleResetApp(context: ToolContext, args: any): Promise<ToolResult> {
  const { app_id, app_name } = args;
  const targetAppId = await context.resolveAppId({ app_id, app_name });
  
  const response = await safeApiCall(

  
    () => context.httpClient.get('/i/apps/reset', {
    params: {
      ...context.getAuthParams(),
      args: JSON.stringify({ app_id: targetAppId, period: 'reset' }),
    },
  }),

  
    'Failed to execute request to /i/apps/reset'

  
  );
  
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
  'apps_list': 'apps_list',
  'apps_get_by_name': 'apps_get_by_name',
  'apps_create': 'apps_create',
  'apps_update': 'apps_update',
  'apps_delete': 'apps_delete',
  'apps_reset': 'apps_reset',
} as const;

export class AppManagementTools {
  constructor(private context: ToolContext) {}

  async apps_list(args: any): Promise<ToolResult> {
    return handleListApps(this.context, args);
  }

  async apps_get_by_name(args: any): Promise<ToolResult> {
    return handleGetAppByName(this.context, args);
  }

  async apps_create(args: any): Promise<ToolResult> {
    return handleCreateApp(this.context, args);
  }

  async apps_update(args: any): Promise<ToolResult> {
    return handleUpdateApp(this.context, args);
  }

  async apps_delete(args: any): Promise<ToolResult> {
    return handleDeleteApp(this.context, args);
  }

  async apps_reset(args: any): Promise<ToolResult> {
    return handleResetApp(this.context, args);
  }
}

// Metadata for dynamic routing (must be after class declaration)
export const appManagementToolMetadata = {
  instanceKey: 'appManagement',
  toolClass: AppManagementTools,
  handlers: appManagementToolHandlers,
} as const;
