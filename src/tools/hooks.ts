/**
 * Hooks Tools
 * 
 * Tools for creating and managing webhooks and triggers.
 * Hooks can be triggered by incoming data, internal events, API endpoints, or schedules,
 * and can perform actions like HTTP requests, sending emails, or executing custom code.
 * 
 * Requires: hooks plugin
 */

import { z } from 'zod';
import { safeApiCall } from '../lib/error-handler.js';
import type { ToolContext } from './types.js';

/**
 * Tool: hooks_list
 * List all webhooks/hooks configured for an app
 */
export const listHooksTool = {
  name: 'hooks_list',
  description: 'List hooks (triggers + effects: webhooks, emails, custom code, scheduled jobs) configured for an app via /o/hook/list. Requires the hooks plugin. To try a config before saving use hooks_test.',
  inputSchema: z.object({
    app_id: z.string()
      .optional()
      .describe('Application ID. Either app_id or app_name must be provided; call apps_list first if you do not know it.'),
    app_name: z.string()
      .optional()
      .describe('Application name (alternative to app_id). Must match an existing app exactly; call apps_list to find valid names.'),
  }),
};

async function handleListHooks(args: z.infer<typeof listHooksTool.inputSchema>, context: ToolContext) {
  const app_id = await context.resolveAppId(args);

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
        type: 'text' as const,
        text: `Hooks for app ${app_id}:\n\n${JSON.stringify(response.data, null, 2)}`,
      },
    ],
  };
}

/**
 * Tool: hooks_test
 * Test a hook configuration before creating it
 */
export const testHookTool = {
  name: 'hooks_test',
  description: 'Dry-run a hook configuration with optional mock data via /i/hook/test (evaluates trigger match and runs effects in test mode). Requires the hooks plugin. To persist the hook use hooks_create.',
  inputSchema: z.object({
    app_id: z.string()
      .optional()
      .describe('Application ID. Either app_id or app_name must be provided; call apps_list first if you do not know it.'),
    app_name: z.string()
      .optional()
      .describe('Application name (alternative to app_id). Must match an existing app exactly; call apps_list to find valid names.'),
    hook_config: z.string()
      .describe('Hook configuration as a JSON string with {name, description, apps:[...], trigger:{type, configuration}, effects:[...]}.'),
    mock_data: z.string()
      .optional()
      .describe('Optional mock input as a JSON string. For IncomingDataTrigger pass {events:[...], user:{...}}.'),
  }),
};

async function handleTestHook(args: z.infer<typeof testHookTool.inputSchema>, context: ToolContext) {
  const app_id = await context.resolveAppId(args);

  const params: Record<string, string> = {
    ...context.getAuthParams(),
    app_id,
    hook_config: args.hook_config,
  };

  if (args.mock_data) {
    params.mock_data = args.mock_data;
  }

  const response = await safeApiCall(
    () => context.httpClient.get('/i/hook/test', { params }),
    'Failed to test hook'
  );

  return {
    content: [
      {
        type: 'text' as const,
        text: `Hook test result:\n\n${JSON.stringify(response.data, null, 2)}`,
      },
    ],
  };
}

/**
 * Tool: hooks_create
 * Create a new webhook/hook
 */
export const createHookTool = {
  name: 'hooks_create',
  description: `Create a hook (persistent trigger + effects binding) via /i/hook/save. Requires the hooks plugin. To change an existing hook use hooks_update; to try before persisting use hooks_test.

Supported trigger types: IncomingDataTrigger (match specific events with an optional filter), APIEndPointTrigger (exposes a unique URL to POST/GET into), InternalEventTrigger (fires on internal Countly events, e.g. /crashes/new, /cohort/enter, /i/apps/create, /alerts/trigger, remote-config mutations, etc.), ScheduledTrigger (cron schedule).

Supported effects: HTTPEffect (outbound HTTP request), EmailEffect (send email), CustomCodeEffect (run JavaScript).`,
  inputSchema: z.object({
    app_id: z.string()
      .optional()
      .describe('Application ID. Either app_id or app_name must be provided; call apps_list first if you do not know it.'),
    app_name: z.string()
      .optional()
      .describe('Application name (alternative to app_id). Must match an existing app exactly; call apps_list to find valid names.'),
    name: z.string()
      .describe('Display name for the hook.'),
    description: z.string()
      .describe('Free-form description of what the hook does.'),
    apps: z.array(z.string())
      .describe('App IDs this hook applies to (usually a single-element array).'),
    trigger_type: z.enum(['IncomingDataTrigger', 'APIEndPointTrigger', 'InternalEventTrigger', 'ScheduledTrigger'])
      .describe('Trigger class (see top-level description for behavior).'),
    trigger_config: z.string()
      .describe('Trigger configuration as a JSON string. IncomingDataTrigger: {event:["app_id***event_key"], filter:"..."}. APIEndPointTrigger: {path:"uuid", method:"get|post"}. InternalEventTrigger: {eventType:"/crashes/new"|"/cohort/enter"|... , cohortID:null, hookID:null, alertID:null}. ScheduledTrigger: {period1:"day|week|month", cron:"0 6 * * *", period3:6, timezone2:"<IANA tz>"}.'),
    effects: z.string()
      .describe('Effects as a JSON-encoded array. Each entry has {type, configuration}. HTTPEffect: {url, method, requestData, headers}. EmailEffect: {address:["email"], emailTemplate:"text"}. CustomCodeEffect: {code:"javascript"}.'),
    enabled: z.boolean()
      .default(true)
      .describe('Whether the hook is active immediately. Defaults to true.'),
  }),
};

async function handleCreateHook(args: z.infer<typeof createHookTool.inputSchema>, context: ToolContext) {
  const app_id = await context.resolveAppId(args);

  // Parse trigger config and effects
  const triggerConfig = JSON.parse(args.trigger_config);
  const effects = JSON.parse(args.effects);

  const hookConfig = {
    _id: null,
    name: args.name,
    description: args.description,
    apps: args.apps,
    trigger: {
      type: args.trigger_type,
      configuration: triggerConfig,
    },
    createdBy: '',
    createdByUser: '',
    effects: effects,
    enabled: args.enabled,
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
        type: 'text' as const,
        text: `Hook created successfully:\n\n${JSON.stringify(response.data, null, 2)}`,
      },
    ],
  };
}

/**
 * Tool: hooks_update
 * Update an existing webhook/hook
 */
export const updateHookTool = {
  name: 'hooks_update',
  description: 'Update an existing hook via /i/hook/save (the tool fetches the current hook first, merges supplied fields, and saves). Requires the hooks plugin. Note: both trigger_type AND trigger_config must be supplied together to change the trigger.',
  inputSchema: z.object({
    app_id: z.string()
      .optional()
      .describe('Application ID. Either app_id or app_name must be provided; call apps_list first if you do not know it.'),
    app_name: z.string()
      .optional()
      .describe('Application name (alternative to app_id). Must match an existing app exactly; call apps_list to find valid names.'),
    hook_id: z.string()
      .describe('Hook identifier (_id) to update. Obtain it from hooks_list.'),
    name: z.string()
      .optional()
      .describe('New display name. Omit to keep current.'),
    description: z.string()
      .optional()
      .describe('New description. Omit to keep current.'),
    apps: z.array(z.string())
      .optional()
      .describe('Replacement list of app IDs. Omit to keep current.'),
    trigger_type: z.enum(['IncomingDataTrigger', 'APIEndPointTrigger', 'InternalEventTrigger', 'ScheduledTrigger'])
      .optional()
      .describe('New trigger class. Must be supplied together with trigger_config to actually change the trigger.'),
    trigger_config: z.string()
      .optional()
      .describe('New trigger configuration as a JSON string (see hooks_create.trigger_config for shape). Only applied when trigger_type is also set.'),
    effects: z.string()
      .optional()
      .describe('Replacement effects array as a JSON string (see hooks_create.effects). Omit to keep current.'),
    enabled: z.boolean()
      .optional()
      .describe('Enable or disable the hook. Omit to keep current.'),
  }),
};

async function handleUpdateHook(args: z.infer<typeof updateHookTool.inputSchema>, context: ToolContext) {
  const app_id = await context.resolveAppId(args);

  // First get the existing hook to merge with updates
  const listParams = {
    ...context.getAuthParams(),
    app_id,
  };

  const listResponse = await safeApiCall(
    () => context.httpClient.get('/o/hook/list', { params: listParams }),
    'Failed to get existing hook'
  );

  const existingHook = listResponse.data.find((h: any) => h._id === args.hook_id);
  if (!existingHook) {
    return {
      content: [
        {
          type: 'text' as const,
          text: `Error: Hook with ID ${args.hook_id} not found`,
        },
      ],
    };
  }

  // Merge updates
  const hookConfig: any = {
    _id: args.hook_id,
    name: args.name || existingHook.name,
    description: args.description || existingHook.description,
    apps: args.apps || existingHook.apps,
    trigger: existingHook.trigger,
    createdBy: existingHook.createdBy || '',
    createdByUser: existingHook.createdByUser || '',
    effects: existingHook.effects,
    enabled: args.enabled !== undefined ? args.enabled : existingHook.enabled,
  };

  // Update trigger if provided. Both fields must be supplied together so the
  // trigger object stays internally consistent — partial updates can easily
  // leave type and configuration out of sync (e.g. new type with stale cron
  // config). Fail loudly instead of silently ignoring the request.
  if (args.trigger_type || args.trigger_config) {
    if (!args.trigger_type || !args.trigger_config) {
      throw new Error(
        'hooks_update: trigger_type and trigger_config must be provided together. ' +
        'Supply both to change the trigger, or neither to keep it unchanged.'
      );
    }
    const triggerConfig = JSON.parse(args.trigger_config);
    hookConfig.trigger = {
      type: args.trigger_type,
      configuration: triggerConfig,
    };
  }

  // Update effects if provided
  if (args.effects) {
    hookConfig.effects = JSON.parse(args.effects);
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
        type: 'text' as const,
        text: `Hook updated successfully:\n\n${JSON.stringify(response.data, null, 2)}`,
      },
    ],
  };
}

/**
 * Tool: hooks_delete
 * Delete a webhook/hook
 */
export const deleteHookTool = {
  name: 'hooks_delete',
  description: 'Delete a hook by its _id via /i/hook/delete. Requires the hooks plugin. WARNING: irreversible. To disable without deleting set enabled=false via hooks_update.',
  inputSchema: z.object({
    app_id: z.string()
      .optional()
      .describe('Application ID. Either app_id or app_name must be provided; call apps_list first if you do not know it.'),
    app_name: z.string()
      .optional()
      .describe('Application name (alternative to app_id). Must match an existing app exactly; call apps_list to find valid names.'),
    hook_id: z.string()
      .describe('Hook identifier (_id) to delete. Obtain it from hooks_list.'),
  }),
};

async function handleDeleteHook(args: z.infer<typeof deleteHookTool.inputSchema>, context: ToolContext) {
  const app_id = await context.resolveAppId(args);

  const params = {
    ...context.getAuthParams(),
    app_id,
    hookID: args.hook_id,
  };

  const response = await safeApiCall(
    () => context.httpClient.get('/i/hook/delete', { params }),
    'Failed to delete hook'
  );

  return {
    content: [
      {
        type: 'text' as const,
        text: `Hook deleted successfully:\n\n${JSON.stringify(response.data, null, 2)}`,
      },
    ],
  };
}

// Export tools array
export const hooksTools = [
  listHooksTool,
  testHookTool,
  createHookTool,
  updateHookTool,
  deleteHookTool,
];

// Export handlers map
export const hooksHandlers = {
  hooks_list: handleListHooks,
  hooks_test: handleTestHook,
  hooks_create: handleCreateHook,
  hooks_update: handleUpdateHook,
  hooks_delete: handleDeleteHook,
};
