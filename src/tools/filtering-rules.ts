import { ToolContext, ToolResult } from './types.js';
import { safeApiCall } from '../lib/error-handler.js';

// ============================================================================
// LIST_FILTERING_RULES TOOL
// ============================================================================

export const listFilteringRulesToolDefinition = {
  name: 'filtering_rules_list',
  description: 'List all filtering rules that block specific requests or data from entering the Countly server. Shows rules for blocking sessions, events, or all requests based on conditions.',
  inputSchema: {
    type: 'object',
    properties: {
      app_id: { type: 'string', description: 'Application ID (optional if app_name is provided)' },
      app_name: { type: 'string', description: 'Application name (alternative to app_id)' },
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
  description: 'Create a new filtering rule to block requests. Can block all requests, sessions, or specific events based on MongoDB query conditions (e.g., IP address, app version, device properties). IMPORTANT: To block specific conditions (like an IP address), you MUST include a "rule" parameter with MongoDB query conditions. An empty rule {} will block ALL matching requests.',
  inputSchema: {
    type: 'object',
    properties: {
      app_id: { type: 'string', description: 'Application ID (optional if app_name is provided)' },
      app_name: { type: 'string', description: 'Application name (alternative to app_id)' },
      type: { 
        type: 'string', 
        enum: ['all', 'session', 'event'],
        description: 'Type of rule: "all" blocks all requests, "session" blocks sessions only, "event" blocks specific events'
      },
      name: { 
        type: 'string', 
        description: 'Human-readable name describing the rule (e.g., "Block IP 127.0.0.1", "Block App Version 5:10:1")'
      },
      rule: { 
        type: 'object', 
        description: 'MongoDB query object for matching conditions. REQUIRED for specific filtering. Use "up." prefix for user properties. Common examples: Block specific IP: {"up.ip": {"$in": ["127.0.0.1"]}}, Block IP range with regex: {"up.ip": {"$regex": "^192\\.168\\."}}, Block app version: {"up.av": {"$in": ["5:10:1"]}}, Block device: {"up.d": {"$in": ["iPhone"]}}. Leave empty {} ONLY to block all requests matching the type.',
        default: {}
      },
      key: { 
        type: 'string', 
        description: 'Event key when type is "event" (specific event to block), or "*" for all',
        default: '*'
      },
      is_arbitrary_input: { 
        type: 'boolean', 
        description: 'Whether the key is user-provided input. Set to true for specific event keys, false for "*"',
        default: false
      },
      status: { 
        type: 'boolean', 
        description: 'Whether the rule is active (true) or disabled (false)',
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
  description: 'Update an existing filtering rule. Can modify conditions, enable/disable rules, or change the rule type. IMPORTANT: To block specific conditions (like an IP address), you MUST include a "rule" parameter with MongoDB query conditions.',
  inputSchema: {
    type: 'object',
    properties: {
      app_id: { type: 'string', description: 'Application ID (optional if app_name is provided)' },
      app_name: { type: 'string', description: 'Application name (alternative to app_id)' },
      block_id: { 
        type: 'string', 
        description: 'ID of the filtering rule to update (_id from filtering_rules_list)'
      },
      type: { 
        type: 'string', 
        enum: ['all', 'session', 'event'],
        description: 'Type of rule: "all" blocks all requests, "session" blocks sessions only, "event" blocks specific events'
      },
      name: { 
        type: 'string', 
        description: 'Human-readable name describing the rule'
      },
      rule: { 
        type: 'object', 
        description: 'MongoDB query object for matching conditions. REQUIRED for specific filtering. Use "up." prefix for user properties. Common examples: Block specific IP: {"up.ip": {"$in": ["127.0.0.1"]}}, Block IP range with regex: {"up.ip": {"$regex": "^192\\.168\\."}}, Block app version: {"up.av": {"$in": ["5:10:1"]}}, Block device: {"up.d": {"$in": ["iPhone"]}}. Leave empty {} ONLY to block all requests matching the type.',
        default: {}
      },
      key: { 
        type: 'string', 
        description: 'Event key when type is "event", or "*" for all',
        default: '*'
      },
      is_arbitrary_input: { 
        type: 'boolean', 
        description: 'Whether the key is user-provided input',
        default: false
      },
      status: { 
        type: 'boolean', 
        description: 'Whether the rule is active (true) or disabled (false)',
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
  description: 'Delete a filtering rule. Once deleted, requests matching the rule conditions will no longer be blocked.',
  inputSchema: {
    type: 'object',
    properties: {
      app_id: { type: 'string', description: 'Application ID (optional if app_name is provided)' },
      app_name: { type: 'string', description: 'Application name (alternative to app_id)' },
      block_id: { 
        type: 'string', 
        description: 'ID of the filtering rule to delete (_id from filtering_rules_list)'
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
  description: 'Toggle the status (enabled/disabled) of one or more filtering rules. Allows you to quickly enable or disable rules without modifying other settings.',
  inputSchema: {
    type: 'object',
    properties: {
      app_id: { type: 'string', description: 'Application ID (optional if app_name is provided)' },
      app_name: { type: 'string', description: 'Application name (alternative to app_id)' },
      blocks: {
        type: 'object',
        description: 'Object mapping rule IDs to their new status. Keys are rule IDs, values are boolean (true=enabled, false=disabled). Example: {"rule_id_1": false, "rule_id_2": true}',
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
