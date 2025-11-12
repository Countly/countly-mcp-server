import { ToolContext, ToolResult } from './types.js';
import { safeApiCall } from '../lib/error-handler.js';

// ============================================================================
// LIST_FILTERING_RULES TOOL
// ============================================================================

export const listFilteringRulesToolDefinition = {
  name: 'list_filtering_rules',
  description: 'List all filtering rules that block specific requests or data from entering the Countly server. Shows rules for blocking sessions, events, or all requests based on conditions.',
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
  name: 'create_filtering_rule',
  description: 'Create a new filtering rule to block requests. Can block all requests, sessions, or specific events based on MongoDB query conditions (e.g., IP address, app version, device properties).',
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
        description: 'Human-readable name describing the rule (e.g., "IP address contains 192", "App Version = 5:10:1")'
      },
      rule: { 
        type: 'object', 
        description: 'MongoDB query object for matching conditions. Use "up." prefix for user properties (e.g., {"up.ip": {"rgxcn": ["192"]}} for IP regex, {"up.av": {"$in": ["5:10:1"]}} for app version)',
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
    anyOf: [
      { required: ['app_id'] },
      { required: ['app_name'] }
    ],
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
  name: 'update_filtering_rule',
  description: 'Update an existing filtering rule. Can modify conditions, enable/disable rules, or change the rule type.',
  inputSchema: {
    type: 'object',
    properties: {
      app_id: { type: 'string', description: 'Application ID (optional if app_name is provided)' },
      app_name: { type: 'string', description: 'Application name (alternative to app_id)' },
      block_id: { 
        type: 'string', 
        description: 'ID of the filtering rule to update (_id from list_filtering_rules)'
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
        description: 'MongoDB query object for matching conditions',
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
    anyOf: [
      { required: ['app_id'] },
      { required: ['app_name'] }
    ],
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
  name: 'delete_filtering_rule',
  description: 'Delete a filtering rule. Once deleted, requests matching the rule conditions will no longer be blocked.',
  inputSchema: {
    type: 'object',
    properties: {
      app_id: { type: 'string', description: 'Application ID (optional if app_name is provided)' },
      app_name: { type: 'string', description: 'Application name (alternative to app_id)' },
      block_id: { 
        type: 'string', 
        description: 'ID of the filtering rule to delete (_id from list_filtering_rules)'
      },
    },
    required: ['block_id'],
    anyOf: [
      { required: ['app_id'] },
      { required: ['app_name'] }
    ],
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
// EXPORTS
// ============================================================================

export const filteringRulesToolDefinitions = [
  listFilteringRulesToolDefinition,
  createFilteringRuleToolDefinition,
  updateFilteringRuleToolDefinition,
  deleteFilteringRuleToolDefinition,
];

export const filteringRulesToolHandlers = {
  list_filtering_rules: handleListFilteringRules,
  create_filtering_rule: handleCreateFilteringRule,
  update_filtering_rule: handleUpdateFilteringRule,
  delete_filtering_rule: handleDeleteFilteringRule,
};

// ============================================================================
// TOOL CLASS
// ============================================================================

export class FilteringRulesTools {
  constructor(private context: ToolContext) {}

  async list_filtering_rules(args: any): Promise<ToolResult> {
    return handleListFilteringRules(this.context, args);
  }

  async create_filtering_rule(args: any): Promise<ToolResult> {
    return handleCreateFilteringRule(this.context, args);
  }

  async update_filtering_rule(args: any): Promise<ToolResult> {
    return handleUpdateFilteringRule(this.context, args);
  }

  async delete_filtering_rule(args: any): Promise<ToolResult> {
    return handleDeleteFilteringRule(this.context, args);
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
