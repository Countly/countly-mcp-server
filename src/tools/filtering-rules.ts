import { ToolContext, ToolResult } from './types.js';
import { safeApiCall } from '../lib/error-handler.js';

// ============================================================================
// LIST_FILTERING_RULES TOOL
// ============================================================================

export const listFilteringRulesToolDefinition = {
  name: 'filtering_rules_list',
  description: 'List ingestion filtering (block) rules for an app via /o/blocks. Rules drop incoming requests, sessions, or events matching a MongoDB condition before they hit analytics. Requires the blocks plugin.',
  inputSchema: {
    type: 'object',
    properties: {
      app_id: { type: 'string', description: 'Application ID. Either app_id or app_name must be provided; call apps_list first if you do not know it.' },
      app_name: { type: 'string', description: 'Application name (alternative to app_id). Must match an existing app exactly; call apps_list to find valid names.' },
    },
  },
};

export async function handleListFilteringRules(context: ToolContext, args: any): Promise<ToolResult> {
  const app_id = await context.resolveAppId(args);

  const params = {
    ...context.getAuthParams(),
    app_id,
  };

  const response = await safeApiCall(
    () => context.httpClient.get('/o/blocks', { params }),
    'Failed to list filtering rules'
  );

  return {
    content: [
      {
        type: 'text',
        text: `Filtering rules for app ${app_id}:\n\n${JSON.stringify(response.data, null, 2)}`,
      },
    ],
  };
}

// ============================================================================
// CREATE_FILTERING_RULE TOOL
// ============================================================================

export const createFilteringRuleToolDefinition = {
  name: 'filtering_rules_create',
  description: 'Create an ingestion filter that drops incoming requests, sessions, or specific events matching a MongoDB condition, via /i/blocks/create. Requires the blocks plugin. WARNING: an empty rule {} drops ALL requests of the given type. To modify an existing rule use filtering_rules_update.',
  inputSchema: {
    type: 'object',
    properties: {
      app_id: { type: 'string', description: 'Application ID. Either app_id or app_name must be provided; call apps_list first if you do not know it.' },
      app_name: { type: 'string', description: 'Application name (alternative to app_id). Must match an existing app exactly; call apps_list to find valid names.' },
      type: {
        type: 'string',
        enum: ['all', 'session', 'event'],
        description: 'Scope of the rule: "all" (every request type), "session" (session begin requests), or "event" (specific custom event, selected via key).'
      },
      name: {
        type: 'string',
        description: 'Human-readable rule name shown in the dashboard (e.g. "Block IP 127.0.0.1", "Block App Version 5:10:1").'
      },
      rule: {
        type: 'object',
        description: 'MongoDB-style match condition. Use "up." prefix for user properties. Examples: block an IP \'{"up.ip":{"$in":["127.0.0.1"]}}\', block a subnet \'{"up.ip":{"$regex":"^192\\\\.168\\\\."}}\', block an app version \'{"up.av":{"$in":["5:10:1"]}}\', block a device \'{"up.d":{"$in":["iPhone"]}}\'. Use {} only when you want to drop all requests of the chosen type. Defaults to {}.',
        default: {}
      },
      key: {
        type: 'string',
        description: 'Event key when type="event" (the event to target), or "*" for all event keys. Defaults to "*".',
        default: '*'
      },
      is_arbitrary_input: {
        type: 'boolean',
        description: 'Set true when key is a specific user-provided event key; false when key is "*". Defaults to false.',
        default: false
      },
      status: {
        type: 'boolean',
        description: 'Whether the rule is enabled immediately (true) or saved disabled (false). Defaults to true.',
        default: true
      },
    },
    required: ['type', 'name'],
  },
};

export async function handleCreateFilteringRule(context: ToolContext, args: any): Promise<ToolResult> {
  const app_id = await context.resolveAppId(args);

  const blocks = {
    is_arbitrary_input: args.is_arbitrary_input !== undefined ? args.is_arbitrary_input : false,
    key: args.key || '*',
    name: args.name,
    rule: args.rule || {},
    status: args.status !== undefined ? args.status : true,
    type: args.type,
  };

  const params = {
    ...context.getAuthParams(),
    app_id,
    blocks: JSON.stringify(blocks),
  };

  const response = await safeApiCall(
    () => context.httpClient.get('/i/blocks/create', { params }),
    'Failed to create filtering rule'
  );

  return {
    content: [
      {
        type: 'text',
        text: `Filtering rule created successfully for app ${app_id}.\n\n${JSON.stringify(response.data, null, 2)}`,
      },
    ],
  };
}

// ============================================================================
// UPDATE_FILTERING_RULE TOOL
// ============================================================================

export const updateFilteringRuleToolDefinition = {
  name: 'filtering_rules_update',
  description: 'Replace the configuration of an existing filtering rule (full payload: type, name, rule, key, status) via /i/blocks/update. Requires the blocks plugin. To only enable/disable, use filtering_rules_toggle_status.',
  inputSchema: {
    type: 'object',
    properties: {
      app_id: { type: 'string', description: 'Application ID. Either app_id or app_name must be provided; call apps_list first if you do not know it.' },
      app_name: { type: 'string', description: 'Application name (alternative to app_id). Must match an existing app exactly; call apps_list to find valid names.' },
      block_id: {
        type: 'string',
        description: 'Rule identifier (_id) to update. Obtain it from filtering_rules_list.'
      },
      type: {
        type: 'string',
        enum: ['all', 'session', 'event'],
        description: 'New rule scope: "all", "session", or "event".'
      },
      name: {
        type: 'string',
        description: 'New human-readable rule name.'
      },
      rule: {
        type: 'object',
        description: 'New MongoDB-style match condition. WARNING: {} drops all requests of the type. See filtering_rules_create for examples. Defaults to {}.',
        default: {}
      },
      key: {
        type: 'string',
        description: 'Event key when type="event" (the event to target), or "*" for all. Defaults to "*".',
        default: '*'
      },
      is_arbitrary_input: {
        type: 'boolean',
        description: 'Set true when key is a specific event key; false when key is "*". Defaults to false.',
        default: false
      },
      status: {
        type: 'boolean',
        description: 'Whether the rule is enabled (true) or disabled (false). Defaults to true.',
        default: true
      },
    },
    required: ['block_id', 'type', 'name'],
  },
};

export async function handleUpdateFilteringRule(context: ToolContext, args: any): Promise<ToolResult> {
  const app_id = await context.resolveAppId(args);

  const blocks = {
    _id: args.block_id,
    is_arbitrary_input: args.is_arbitrary_input !== undefined ? args.is_arbitrary_input : false,
    key: args.key || '*',
    name: args.name,
    rule: args.rule || {},
    status: args.status !== undefined ? args.status : true,
    type: args.type,
  };

  const params = {
    ...context.getAuthParams(),
    app_id,
    blocks: JSON.stringify(blocks),
  };

  const response = await safeApiCall(
    () => context.httpClient.get('/i/blocks/update', { params }),
    'Failed to update filtering rule'
  );

  return {
    content: [
      {
        type: 'text',
        text: `Filtering rule ${args.block_id} updated successfully for app ${app_id}.\n\n${JSON.stringify(response.data, null, 2)}`,
      },
    ],
  };
}

// ============================================================================
// DELETE_FILTERING_RULE TOOL
// ============================================================================

export const deleteFilteringRuleToolDefinition = {
  name: 'filtering_rules_delete',
  description: 'Permanently delete a filtering rule via /i/blocks/delete; matching requests will no longer be dropped. Requires the blocks plugin. WARNING: irreversible. To disable without deleting use filtering_rules_toggle_status.',
  inputSchema: {
    type: 'object',
    properties: {
      app_id: { type: 'string', description: 'Application ID. Either app_id or app_name must be provided; call apps_list first if you do not know it.' },
      app_name: { type: 'string', description: 'Application name (alternative to app_id). Must match an existing app exactly; call apps_list to find valid names.' },
      block_id: {
        type: 'string',
        description: 'Rule identifier (_id) to delete. Obtain it from filtering_rules_list.'
      },
    },
    required: ['block_id'],
  },
};

export async function handleDeleteFilteringRule(context: ToolContext, args: any): Promise<ToolResult> {
  const app_id = await context.resolveAppId(args);

  const params = {
    ...context.getAuthParams(),
    app_id,
    block_id: args.block_id,
  };

  const response = await safeApiCall(
    () => context.httpClient.get('/i/blocks/delete', { params }),
    'Failed to delete filtering rule'
  );

  return {
    content: [
      {
        type: 'text',
        text: `Filtering rule ${args.block_id} deleted successfully for app ${app_id}.\n\n${JSON.stringify(response.data, null, 2)}`,
      },
    ],
  };
}

// ============================================================================
// TOGGLE_FILTERING_RULE_STATUS TOOL
// ============================================================================

export const toggleFilteringRuleStatusToolDefinition = {
  name: 'filtering_rules_toggle_status',
  description: 'Enable or disable one or more existing filtering rules without changing their condition, via /i/blocks/toggle_status. Requires the blocks plugin. For full edits use filtering_rules_update.',
  inputSchema: {
    type: 'object',
    properties: {
      app_id: { type: 'string', description: 'Application ID. Either app_id or app_name must be provided; call apps_list first if you do not know it.' },
      app_name: { type: 'string', description: 'Application name (alternative to app_id). Must match an existing app exactly; call apps_list to find valid names.' },
      blocks: {
        type: 'object',
        description: 'Map of rule_id -> desired status (true=enabled, false=disabled). Example: {"rule_id_1": false, "rule_id_2": true}.',
      },
    },
    required: ['blocks'],
  },
};

export async function handleToggleFilteringRuleStatus(context: ToolContext, args: any): Promise<ToolResult> {
  const app_id = await context.resolveAppId(args);

  const params = {
    ...context.getAuthParams(),
    app_id,
    blocks: JSON.stringify(args.blocks),
  };

  const response = await safeApiCall(
    () => context.httpClient.get('/i/blocks/toggle_status', { params }),
    'Failed to toggle filtering rule status'
  );

  return {
    content: [
      {
        type: 'text',
        text: `Filtering rule status toggled successfully for app ${app_id}.\n\n${JSON.stringify(response.data, null, 2)}`,
      },
    ],
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export const filteringRulesToolDefinitions = [
  listFilteringRulesToolDefinition,
  createFilteringRuleToolDefinition,
  updateFilteringRuleToolDefinition,
  deleteFilteringRuleToolDefinition,
  toggleFilteringRuleStatusToolDefinition,
];

export const filteringRulesToolHandlers = {
  'filtering_rules_list': 'filtering_rules_list',
  'filtering_rules_create': 'filtering_rules_create',
  'filtering_rules_update': 'filtering_rules_update',
  'filtering_rules_delete': 'filtering_rules_delete',
  'filtering_rules_toggle_status': 'filtering_rules_toggle_status',
} as const;

// ============================================================================
// TOOL CLASS
// ============================================================================

export class FilteringRulesTools {
  constructor(private context: ToolContext) {}

  async filtering_rules_list(args: any): Promise<ToolResult> {
    return handleListFilteringRules(this.context, args);
  }

  async filtering_rules_create(args: any): Promise<ToolResult> {
    return handleCreateFilteringRule(this.context, args);
  }

  async filtering_rules_update(args: any): Promise<ToolResult> {
    return handleUpdateFilteringRule(this.context, args);
  }

  async filtering_rules_delete(args: any): Promise<ToolResult> {
    return handleDeleteFilteringRule(this.context, args);
  }

  async filtering_rules_toggle_status(args: any): Promise<ToolResult> {
    return handleToggleFilteringRuleStatus(this.context, args);
  }
}

// ============================================================================
// METADATA
// ============================================================================

export const filteringRulesToolMetadata = {
  instanceKey: 'filtering_rules',
  toolClass: FilteringRulesTools,
  handlers: filteringRulesToolHandlers,
} as const;
