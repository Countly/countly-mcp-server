import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { ToolContext, ToolResult } from './types.js';
import { parseJsonParam, withDefault } from '../lib/validation.js';
import { safeApiCall } from '../lib/error-handler.js';

/**
 * Hooks Module
 *
 * Tools for creating and managing webhooks and triggers.
 * Hooks can be triggered by incoming data, internal events, API endpoints, or schedules,
 * and can perform actions like HTTP requests, sending emails, or executing custom code.
 *
 * Requires the 'hooks' plugin to be installed on the Countly server.
 */

// ============================================================================
// LIST HOOKS TOOL
// ============================================================================

export const listHooksToolDefinition = {
  name: 'hooks_list',
  description: 'List hooks (triggers + effects: webhooks, emails, custom code, scheduled jobs) configured for an app via /o/hook/list. Requires the hooks plugin. To try a config before saving use hooks_test.',
  inputSchema: {
    type: 'object',
    properties: {
      app_id: {
        type: 'string',
        description: 'Application ID. Either app_id or app_name must be provided; call apps_list first if you do not know it.',
      },
      app_name: {
        type: 'string',
        description: 'Application name (alternative to app_id). Must match an existing app exactly; call apps_list to find valid names.',
      },
    },
  },
};

export async function handleListHooks(
  context: ToolContext,
  input: Record<string, unknown>
): Promise<ToolResult> {
  const app_id = await context.resolveAppId(input);

  const params = {
    ...context.getAuthParams(),
    app_id,
  };

  const response = await safeApiCall(
    () => context.httpClient.get('/o/hook/list', { params }),
    'Failed to list hooks'
  );

  return {
    content: [
      {
        type: 'text',
        text: `Hooks for app ${app_id}:\n\n${JSON.stringify(response.data, null, 2)}`,
      },
    ],
  };
}

// ============================================================================
// TEST HOOK TOOL
// ============================================================================

export const testHookToolDefinition = {
  name: 'hooks_test',
  description: 'Dry-run a hook configuration with optional mock data via /i/hook/test (evaluates trigger match and runs effects in test mode). Requires the hooks plugin. To persist the hook use hooks_create.',
  inputSchema: {
    type: 'object',
    properties: {
      app_id: {
        type: 'string',
        description: 'Application ID. Either app_id or app_name must be provided; call apps_list first if you do not know it.',
      },
      app_name: {
        type: 'string',
        description: 'Application name (alternative to app_id). Must match an existing app exactly; call apps_list to find valid names.',
      },
      hook_config: {
        type: 'string',
        description: 'Hook configuration as a JSON string with {name, description, apps:[...], trigger:{type, configuration}, effects:[...]}.',
      },
      mock_data: {
        type: 'string',
        description: 'Optional mock input as a JSON string. For IncomingDataTrigger pass {events:[...], user:{...}}.',
      },
    },
    required: ['hook_config'],
  },
};

export async function handleTestHook(
  context: ToolContext,
  input: Record<string, unknown>
): Promise<ToolResult> {
  const hook_config = input.hook_config as string;
  const mock_data = input.mock_data as string | undefined;

  const app_id = await context.resolveAppId(input);

  const params: Record<string, string> = {
    ...context.getAuthParams(),
    app_id,
    hook_config,
  };

  if (mock_data) {
    params.mock_data = mock_data;
  }

  const response = await safeApiCall(
    () => context.httpClient.get('/i/hook/test', { params }),
    'Failed to test hook'
  );

  return {
    content: [
      {
        type: 'text',
        text: `Hook test result:\n\n${JSON.stringify(response.data, null, 2)}`,
      },
    ],
  };
}

// ============================================================================
// CREATE HOOK TOOL
// ============================================================================

export const createHookToolDefinition = {
  name: 'hooks_create',
  description: `Create a hook (persistent trigger + effects binding) via /i/hook/save. Requires the hooks plugin. To change an existing hook use hooks_update; to try before persisting use hooks_test.

Supported trigger types: IncomingDataTrigger (match specific events with an optional filter), APIEndPointTrigger (exposes a unique URL to POST/GET into), InternalEventTrigger (fires on internal Countly events, e.g. /crashes/new, /cohort/enter, /i/apps/create, /alerts/trigger, remote-config mutations, etc.), ScheduledTrigger (cron schedule).

Supported effects: HTTPEffect (outbound HTTP request), EmailEffect (send email), CustomCodeEffect (run JavaScript).`,
  inputSchema: {
    type: 'object',
    properties: {
      app_id: {
        type: 'string',
        description: 'Application ID. Either app_id or app_name must be provided; call apps_list first if you do not know it.',
      },
      app_name: {
        type: 'string',
        description: 'Application name (alternative to app_id). Must match an existing app exactly; call apps_list to find valid names.',
      },
      name: {
        type: 'string',
        description: 'Display name for the hook.',
      },
      description: {
        type: 'string',
        description: 'Free-form description of what the hook does.',
      },
      apps: {
        type: 'array',
        items: {
          type: 'string',
        },
        description: 'App IDs this hook applies to (usually a single-element array).',
      },
      trigger_type: {
        type: 'string',
        enum: ['IncomingDataTrigger', 'APIEndPointTrigger', 'InternalEventTrigger', 'ScheduledTrigger'],
        description: 'Trigger class (see top-level description for behavior).',
      },
      trigger_config: {
        type: 'string',
        description: 'Trigger configuration as a JSON string. IncomingDataTrigger: {event:["app_id***event_key"], filter:"..."}. APIEndPointTrigger: {path:"uuid", method:"get|post"}. InternalEventTrigger: {eventType:"/crashes/new"|"/cohort/enter"|... , cohortID:null, hookID:null, alertID:null}. ScheduledTrigger: {period1:"day|week|month", cron:"0 6 * * *", period3:6, timezone2:"<IANA tz>"}.',
      },
      effects: {
        type: 'string',
        description: 'Effects as a JSON-encoded array. Each entry has {type, configuration}. HTTPEffect: {url, method, requestData, headers}. EmailEffect: {address:["email"], emailTemplate:"text"}. CustomCodeEffect: {code:"javascript"}.',
      },
      enabled: {
        type: 'boolean',
        description: 'Whether the hook is active immediately. Defaults to true.',
        default: true,
      },
    },
    required: ['name', 'description', 'apps', 'trigger_type', 'trigger_config', 'effects'],
  },
};

export async function handleCreateHook(
  context: ToolContext,
  input: Record<string, unknown>
): Promise<ToolResult> {
  const name = input.name as string;
  const description = input.description as string;
  const apps = input.apps as string[];
  const trigger_type = input.trigger_type as string;
  const trigger_config = input.trigger_config as string;
  const effects = input.effects as string;
  const enabled = withDefault(input.enabled as boolean | undefined, true);

  const app_id = await context.resolveAppId(input);

  // Parse trigger config and effects
  const triggerConfig = parseJsonParam(trigger_config, 'trigger_config');
  const effectsArray = parseJsonParam(effects, 'effects');

  const hookConfig = {
    _id: null,
    name,
    description,
    apps,
    trigger: {
      type: trigger_type,
      configuration: triggerConfig,
    },
    createdBy: '',
    createdByUser: '',
    effects: effectsArray,
    enabled,
  };

  const params = {
    ...context.getAuthParams(),
    app_id,
    hook_config: JSON.stringify(hookConfig),
  };

  const response = await safeApiCall(
    () => context.httpClient.get('/i/hook/save', { params }),
    'Failed to create hook'
  );

  return {
    content: [
      {
        type: 'text',
        text: `Hook created successfully:\n\n${JSON.stringify(response.data, null, 2)}`,
      },
    ],
  };
}

// ============================================================================
// UPDATE HOOK TOOL
// ============================================================================

export const updateHookToolDefinition = {
  name: 'hooks_update',
  description: 'Update an existing hook via /i/hook/save (the tool fetches the current hook first, merges supplied fields, and saves). Requires the hooks plugin. Note: both trigger_type AND trigger_config must be supplied together to change the trigger.',
  inputSchema: {
    type: 'object',
    properties: {
      app_id: {
        type: 'string',
        description: 'Application ID. Either app_id or app_name must be provided; call apps_list first if you do not know it.',
      },
      app_name: {
        type: 'string',
        description: 'Application name (alternative to app_id). Must match an existing app exactly; call apps_list to find valid names.',
      },
      hook_id: {
        type: 'string',
        description: 'Hook identifier (_id) to update. Obtain it from hooks_list.',
      },
      name: {
        type: 'string',
        description: 'New display name. Omit to keep current.',
      },
      description: {
        type: 'string',
        description: 'New description. Omit to keep current.',
      },
      apps: {
        type: 'array',
        items: {
          type: 'string',
        },
        description: 'Replacement list of app IDs. Omit to keep current.',
      },
      trigger_type: {
        type: 'string',
        enum: ['IncomingDataTrigger', 'APIEndPointTrigger', 'InternalEventTrigger', 'ScheduledTrigger'],
        description: 'New trigger class. Must be supplied together with trigger_config to actually change the trigger.',
      },
      trigger_config: {
        type: 'string',
        description: 'New trigger configuration as a JSON string (see hooks_create.trigger_config for shape). Only applied when trigger_type is also set.',
      },
      effects: {
        type: 'string',
        description: 'Replacement effects array as a JSON string (see hooks_create.effects). Omit to keep current.',
      },
      enabled: {
        type: 'boolean',
        description: 'Enable or disable the hook. Omit to keep current.',
      },
    },
    required: ['hook_id'],
  },
};

export async function handleUpdateHook(
  context: ToolContext,
  input: Record<string, unknown>
): Promise<ToolResult> {
  const hook_id = input.hook_id as string;
  const name = input.name as string | undefined;
  const description = input.description as string | undefined;
  const apps = input.apps as string[] | undefined;
  const trigger_type = input.trigger_type as string | undefined;
  const trigger_config = input.trigger_config as string | undefined;
  const effects = input.effects as string | undefined;
  const enabled = input.enabled as boolean | undefined;

  const app_id = await context.resolveAppId(input);

  // First get the existing hook to merge with updates
  const listParams = {
    ...context.getAuthParams(),
    app_id,
  };

  const listResponse = await safeApiCall(
    () => context.httpClient.get('/o/hook/list', { params: listParams }),
    'Failed to get existing hook'
  );

  const existingHook = listResponse.data.find((h: any) => h._id === hook_id);
  if (!existingHook) {
    return {
      content: [
        {
          type: 'text',
          text: `Error: Hook with ID ${hook_id} not found`,
        },
      ],
    };
  }

  // Merge updates
  const hookConfig: any = {
    _id: hook_id,
    name: name || existingHook.name,
    description: description || existingHook.description,
    apps: apps || existingHook.apps,
    trigger: existingHook.trigger,
    createdBy: existingHook.createdBy || '',
    createdByUser: existingHook.createdByUser || '',
    effects: existingHook.effects,
    enabled: enabled !== undefined ? enabled : existingHook.enabled,
  };

  // Update trigger if provided. Both fields must be supplied together so the
  // trigger object stays internally consistent — partial updates can easily
  // leave type and configuration out of sync (e.g. new type with stale cron
  // config). Fail loudly instead of silently ignoring the request.
  if (trigger_type || trigger_config) {
    if (!trigger_type || !trigger_config) {
      throw new McpError(
        ErrorCode.InvalidParams,
        'hooks_update: trigger_type and trigger_config must be provided together. ' +
        'Supply both to change the trigger, or neither to keep it unchanged.'
      );
    }
    const triggerConfig = parseJsonParam(trigger_config, 'trigger_config');
    hookConfig.trigger = {
      type: trigger_type,
      configuration: triggerConfig,
    };
  }

  // Update effects if provided
  if (effects) {
    hookConfig.effects = parseJsonParam(effects, 'effects');
  }

  const params = {
    ...context.getAuthParams(),
    app_id,
    hook_config: JSON.stringify(hookConfig),
  };

  const response = await safeApiCall(
    () => context.httpClient.get('/i/hook/save', { params }),
    'Failed to update hook'
  );

  return {
    content: [
      {
        type: 'text',
        text: `Hook updated successfully:\n\n${JSON.stringify(response.data, null, 2)}`,
      },
    ],
  };
}

// ============================================================================
// DELETE HOOK TOOL
// ============================================================================

export const deleteHookToolDefinition = {
  name: 'hooks_delete',
  description: 'Delete a hook by its _id via /i/hook/delete. Requires the hooks plugin. WARNING: irreversible. To disable without deleting set enabled=false via hooks_update.',
  inputSchema: {
    type: 'object',
    properties: {
      app_id: {
        type: 'string',
        description: 'Application ID. Either app_id or app_name must be provided; call apps_list first if you do not know it.',
      },
      app_name: {
        type: 'string',
        description: 'Application name (alternative to app_id). Must match an existing app exactly; call apps_list to find valid names.',
      },
      hook_id: {
        type: 'string',
        description: 'Hook identifier (_id) to delete. Obtain it from hooks_list.',
      },
    },
    required: ['hook_id'],
  },
};

export async function handleDeleteHook(
  context: ToolContext,
  input: Record<string, unknown>
): Promise<ToolResult> {
  const hook_id = input.hook_id as string;

  const app_id = await context.resolveAppId(input);

  const params = {
    ...context.getAuthParams(),
    app_id,
    hookID: hook_id,
  };

  const response = await safeApiCall(
    () => context.httpClient.get('/i/hook/delete', { params }),
    'Failed to delete hook'
  );

  return {
    content: [
      {
        type: 'text',
        text: `Hook deleted successfully:\n\n${JSON.stringify(response.data, null, 2)}`,
      },
    ],
  };
}

// ============================================================================
// Export Combined Arrays
// ============================================================================

export const hooksToolDefinitions = [
  listHooksToolDefinition,
  testHookToolDefinition,
  createHookToolDefinition,
  updateHookToolDefinition,
  deleteHookToolDefinition,
];

export const hooksToolHandlers = {
  'hooks_list': 'hooks_list',
  'hooks_test': 'hooks_test',
  'hooks_create': 'hooks_create',
  'hooks_update': 'hooks_update',
  'hooks_delete': 'hooks_delete',
} as const;

export class HooksTools {
  constructor(private context: ToolContext) {}

  async hooks_list(args: any): Promise<ToolResult> {
    return handleListHooks(this.context, args);
  }

  async hooks_test(args: any): Promise<ToolResult> {
    return handleTestHook(this.context, args);
  }

  async hooks_create(args: any): Promise<ToolResult> {
    return handleCreateHook(this.context, args);
  }

  async hooks_update(args: any): Promise<ToolResult> {
    return handleUpdateHook(this.context, args);
  }

  async hooks_delete(args: any): Promise<ToolResult> {
    return handleDeleteHook(this.context, args);
  }
}

export const hooksToolMetadata = {
  instanceKey: 'hooks',
  toolClass: HooksTools,
  handlers: hooksToolHandlers,
} as const;
