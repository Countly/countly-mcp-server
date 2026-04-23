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
  description: 'List all webhooks/hooks configured for an app. Shows triggers, effects, and configuration details.',
  inputSchema: z.object({
    app_id: z.string()
      .optional()
      .describe('Application ID (optional if app_name is provided)'),
    app_name: z.string()
      .optional()
      .describe('Application name (alternative to app_id)'),
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
  description: 'Test a hook configuration with mock data before creating it. Useful for validating trigger conditions and effect actions.',
  inputSchema: z.object({
    app_id: z.string()
      .optional()
      .describe('Application ID (optional if app_name is provided)'),
    app_name: z.string()
      .optional()
      .describe('Application name (alternative to app_id)'),
    hook_config: z.string()
      .describe('Hook configuration as JSON string. Must include name, description, apps array, trigger object (type and configuration), and effects array.'),
    mock_data: z.string()
      .optional()
      .describe('Mock data as JSON string to test the hook with. For IncomingDataTrigger, include events array and user object.'),
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
  description: `Create a new webhook/hook. Hooks can be triggered by:
- IncomingDataTrigger: Triggered by specific events with optional filters
- APIEndPointTrigger: Creates a unique endpoint URL that can be called externally
- InternalEventTrigger: Triggered by internal Countly events. Available events: /i/apps/create (new app created), /i/apps/update (app updated), /i/apps/delete (app deleted), /i/apps/reset (app reset), /i/users/create (dashboard user created), /i/users/update (dashboard user updated), /i/users/delete (dashboard user deleted), /systemlogs (system logs), /master (master events), /crashes/new (new crash received), /cohort/enter (user enters cohort), /cohort/exit (user exits cohort), /i/app_users/create (app user created), /i/app_users/update (app user updated), /i/app_users/delete (app user deleted), /hooks/trigger (another hook triggered), /alerts/trigger (alert triggered), /i/remote-config/add-parameter, /i/remote-config/update-parameter, /i/remote-config/remove-parameter, /i/remote-config/add-condition, /i/remote-config/update-condition, /i/remote-config/remove-condition
- ScheduledTrigger: Triggered on a schedule (cron expression)

Effects can include:
- HTTPEffect: Make HTTP requests to external URLs
- EmailEffect: Send emails
- CustomCodeEffect: Execute custom JavaScript code`,
  inputSchema: z.object({
    app_id: z.string()
      .optional()
      .describe('Application ID (optional if app_name is provided)'),
    app_name: z.string()
      .optional()
      .describe('Application name (alternative to app_id)'),
    name: z.string()
      .describe('Hook name'),
    description: z.string()
      .describe('Hook description'),
    apps: z.array(z.string())
      .describe('Array of app IDs this hook applies to'),
    trigger_type: z.enum(['IncomingDataTrigger', 'APIEndPointTrigger', 'InternalEventTrigger', 'ScheduledTrigger'])
      .describe('Type of trigger'),
    trigger_config: z.string()
      .describe('Trigger configuration as JSON string. For IncomingDataTrigger: {event: ["app_id***event_key"], filter: "..."}. For APIEndPointTrigger: {path: "uuid", method: "get|post"}. For InternalEventTrigger: {eventType: "/crashes/new" or "/cohort/enter" or any other internal event from the list above, cohortID: null, hookID: null, alertID: null}. For ScheduledTrigger: {period1: "day|week|month", cron: "0 6 * * *", period3: 6, timezone2: "timezone"}'),
    effects: z.string()
      .describe('Array of effects as JSON string. Each effect has type and configuration. HTTPEffect: {url, method, requestData, headers}. EmailEffect: {address: ["email"], emailTemplate: "text"}. CustomCodeEffect: {code: "javascript"}'),
    enabled: z.boolean()
      .default(true)
      .describe('Whether the hook is enabled'),
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
  description: 'Update an existing webhook/hook configuration. Provide the hook _id and new configuration.',
  inputSchema: z.object({
    app_id: z.string()
      .optional()
      .describe('Application ID (optional if app_name is provided)'),
    app_name: z.string()
      .optional()
      .describe('Application name (alternative to app_id)'),
    hook_id: z.string()
      .describe('Hook ID to update'),
    name: z.string()
      .optional()
      .describe('Hook name'),
    description: z.string()
      .optional()
      .describe('Hook description'),
    apps: z.array(z.string())
      .optional()
      .describe('Array of app IDs this hook applies to'),
    trigger_type: z.enum(['IncomingDataTrigger', 'APIEndPointTrigger', 'InternalEventTrigger', 'ScheduledTrigger'])
      .optional()
      .describe('Type of trigger'),
    trigger_config: z.string()
      .optional()
      .describe('Trigger configuration as JSON string'),
    effects: z.string()
      .optional()
      .describe('Array of effects as JSON string'),
    enabled: z.boolean()
      .optional()
      .describe('Whether the hook is enabled'),
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
  description: 'Delete a webhook/hook by its ID',
  inputSchema: z.object({
    app_id: z.string()
      .optional()
      .describe('Application ID (optional if app_name is provided)'),
    app_name: z.string()
      .optional()
      .describe('Application name (alternative to app_id)'),
    hook_id: z.string()
      .describe('Hook ID to delete'),
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
