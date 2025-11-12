import { ToolContext, ToolResult } from './types.js';
import { safeApiCall } from '../lib/error-handler.js';

// ============================================================================
// LIST_REMOTE_CONFIGS TOOL
// ============================================================================

export const listRemoteConfigsToolDefinition = {
  name: 'list_remote_configs',
  description: 'List all remote config parameters and conditions for an application. Remote configs allow controlling app behavior by changing parameter values on the server.',
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

export async function handleListRemoteConfigs(context: ToolContext, args: any): Promise<ToolResult> {
  const app_id = await context.resolveAppId(args);

  const params = {
    ...context.getAuthParams(),
    app_id,
    method: 'remote-config',
  };

  const response = await safeApiCall(
    () => context.httpClient.get('/o', { params }),
    'Failed to list remote configs'
  );

  let resultText = `Remote config parameters and conditions for app ${app_id}:\n\n`;
  resultText += JSON.stringify(response.data, null, 2);

  return {
    content: [
      {
        type: 'text',
        text: resultText,
      },
    ],
  };
}

// ============================================================================
// ADD_REMOTE_CONFIG_CONDITION TOOL
// ============================================================================

export const addRemoteConfigConditionToolDefinition = {
  name: 'add_remote_config_condition',
  description: 'Add a condition to segment user groups for which to use specific parameter values. Conditions use MongoDB queries to match users based on properties like age, country, etc.',
  inputSchema: {
    type: 'object',
    properties: {
      app_id: { type: 'string', description: 'Application ID (optional if app_name is provided)' },
      app_name: { type: 'string', description: 'Application name (alternative to app_id)' },
      condition: {
        type: 'string',
        description: 'Condition configuration as JSON string. Must include: condition_name (string), condition_color (number 1-10), condition (MongoDB query object with "up." prefix for user properties), condition_definition (human-readable description), seed_value (optional string), condition_description (optional string). Example: {"condition_name":"Test users","condition_color":1,"condition":{"up.age":{"$gt":30}},"condition_definition":"Age greater than 30","seed_value":"","condition_description":"Test user group"}'
      },
    },
    required: ['condition'],
    anyOf: [
      { required: ['app_id'] },
      { required: ['app_name'] }
    ],
  },
};

export async function handleAddRemoteConfigCondition(context: ToolContext, args: any): Promise<ToolResult> {
  const app_id = await context.resolveAppId(args);

  const params = {
    ...context.getAuthParams(),
    app_id,
    condition: args.condition,
  };

  const response = await safeApiCall(
    () => context.httpClient.get('/i/remote-config/add-condition', { params }),
    'Failed to add remote config condition'
  );

  return {
    content: [
      {
        type: 'text',
        text: `Remote config condition added successfully for app ${app_id}.\n\n${JSON.stringify(response.data, null, 2)}`,
      },
    ],
  };
}

// ============================================================================
// UPDATE_REMOTE_CONFIG_CONDITION TOOL
// ============================================================================

export const updateRemoteConfigConditionToolDefinition = {
  name: 'update_remote_config_condition',
  description: 'Update an existing remote config condition to modify user segmentation criteria.',
  inputSchema: {
    type: 'object',
    properties: {
      app_id: { type: 'string', description: 'Application ID (optional if app_name is provided)' },
      app_name: { type: 'string', description: 'Application name (alternative to app_id)' },
      condition_id: {
        type: 'string',
        description: 'The ID of the condition to update',
      },
      condition: {
        type: 'string',
        description: 'Updated condition configuration as JSON string. Should include all fields: condition_name, condition_color, condition, condition_definition, seed_value, condition_description, and used_in_parameters (number of parameters using this condition). Example: {"condition_name":"Test users","condition_color":2,"condition":{"up.age":{"$gt":30}},"condition_definition":"Age greater than 30","seed_value":"","condition_description":"Updated description","used_in_parameters":0}'
      },
    },
    required: ['condition_id', 'condition'],
    anyOf: [
      { required: ['app_id'] },
      { required: ['app_name'] }
    ],
  },
};

export async function handleUpdateRemoteConfigCondition(context: ToolContext, args: any): Promise<ToolResult> {
  const app_id = await context.resolveAppId(args);

  const params = {
    ...context.getAuthParams(),
    app_id,
    condition_id: args.condition_id,
    condition: args.condition,
  };

  const response = await safeApiCall(
    () => context.httpClient.get('/i/remote-config/update-condition', { params }),
    'Failed to update remote config condition'
  );

  return {
    content: [
      {
        type: 'text',
        text: `Remote config condition ${args.condition_id} updated successfully for app ${app_id}.\n\n${JSON.stringify(response.data, null, 2)}`,
      },
    ],
  };
}

// ============================================================================
// DELETE_REMOTE_CONFIG_CONDITION TOOL
// ============================================================================

export const deleteRemoteConfigConditionToolDefinition = {
  name: 'delete_remote_config_condition',
  description: 'Delete a remote config condition. Note: Cannot delete conditions that are currently being used by parameters.',
  inputSchema: {
    type: 'object',
    properties: {
      app_id: { type: 'string', description: 'Application ID (optional if app_name is provided)' },
      app_name: { type: 'string', description: 'Application name (alternative to app_id)' },
      condition_id: {
        type: 'string',
        description: 'The ID of the condition to delete',
      },
    },
    required: ['condition_id'],
    anyOf: [
      { required: ['app_id'] },
      { required: ['app_name'] }
    ],
  },
};

export async function handleDeleteRemoteConfigCondition(context: ToolContext, args: any): Promise<ToolResult> {
  const app_id = await context.resolveAppId(args);

  const params = {
    ...context.getAuthParams(),
    app_id,
    condition_id: args.condition_id,
  };

  const response = await safeApiCall(
    () => context.httpClient.get('/i/remote-config/remove-condition', { params }),
    'Failed to delete remote config condition'
  );

  return {
    content: [
      {
        type: 'text',
        text: `Remote config condition ${args.condition_id} deleted successfully for app ${app_id}.\n\n${JSON.stringify(response.data, null, 2)}`,
      },
    ],
  };
}

// ============================================================================
// ADD_REMOTE_CONFIG_PARAMETER TOOL
// ============================================================================

export const addRemoteConfigParameterToolDefinition = {
  name: 'add_remote_config_parameter',
  description: 'Add a remote config parameter that apps can fetch and use to control behavior. Parameters can have different values for different user segments based on conditions.',
  inputSchema: {
    type: 'object',
    properties: {
      app_id: { type: 'string', description: 'Application ID (optional if app_name is provided)' },
      app_name: { type: 'string', description: 'Application name (alternative to app_id)' },
      parameter: {
        type: 'string',
        description: 'Parameter configuration as JSON string. Must include: parameter_key (string - unique key), default_value (any - value for users not matching conditions), description (string), conditions (array of {condition_id, value} objects), status ("Running" or "Stopped"), expiry_dttm (optional - timestamp in milliseconds when parameter expires). Example: {"parameter_key":"feature_flag","default_value":"0","description":"Feature toggle","conditions":[{"condition_id":"123","value":"1"}],"status":"Running","expiry_dttm":1763035291208}'
      },
    },
    required: ['parameter'],
    anyOf: [
      { required: ['app_id'] },
      { required: ['app_name'] }
    ],
  },
};

export async function handleAddRemoteConfigParameter(context: ToolContext, args: any): Promise<ToolResult> {
  const app_id = await context.resolveAppId(args);

  const params = {
    ...context.getAuthParams(),
    app_id,
    parameter: args.parameter,
  };

  const response = await safeApiCall(
    () => context.httpClient.get('/i/remote-config/add-parameter', { params }),
    'Failed to add remote config parameter'
  );

  return {
    content: [
      {
        type: 'text',
        text: `Remote config parameter added successfully for app ${app_id}.\n\n${JSON.stringify(response.data, null, 2)}`,
      },
    ],
  };
}

// ============================================================================
// UPDATE_REMOTE_CONFIG_PARAMETER TOOL
// ============================================================================

export const updateRemoteConfigParameterToolDefinition = {
  name: 'update_remote_config_parameter',
  description: 'Update an existing remote config parameter to change its values, conditions, or status.',
  inputSchema: {
    type: 'object',
    properties: {
      app_id: { type: 'string', description: 'Application ID (optional if app_name is provided)' },
      app_name: { type: 'string', description: 'Application name (alternative to app_id)' },
      parameter_id: {
        type: 'string',
        description: 'The ID of the parameter to update',
      },
      parameter: {
        type: 'string',
        description: 'Updated parameter configuration as JSON string. Should include all fields: parameter_key, default_value, description, conditions, status, expiry_dttm (optional), valuesList (array of all possible values), ts (creation timestamp). Example: {"parameter_key":"feature_flag","default_value":0,"description":"Updated description","conditions":[{"condition_id":"123","value":1}],"status":"Stopped","expiry_dttm":1763035291208,"valuesList":[0,1],"ts":1762952513609}'
      },
    },
    required: ['parameter_id', 'parameter'],
    anyOf: [
      { required: ['app_id'] },
      { required: ['app_name'] }
    ],
  },
};

export async function handleUpdateRemoteConfigParameter(context: ToolContext, args: any): Promise<ToolResult> {
  const app_id = await context.resolveAppId(args);

  const params = {
    ...context.getAuthParams(),
    app_id,
    parameter_id: args.parameter_id,
    parameter: args.parameter,
  };

  const response = await safeApiCall(
    () => context.httpClient.get('/i/remote-config/update-parameter', { params }),
    'Failed to update remote config parameter'
  );

  return {
    content: [
      {
        type: 'text',
        text: `Remote config parameter ${args.parameter_id} updated successfully for app ${app_id}.\n\n${JSON.stringify(response.data, null, 2)}`,
      },
    ],
  };
}

// ============================================================================
// DELETE_REMOTE_CONFIG_PARAMETER TOOL
// ============================================================================

export const deleteRemoteConfigParameterToolDefinition = {
  name: 'delete_remote_config_parameter',
  description: 'Delete a remote config parameter. This will remove the parameter from the server and apps will no longer receive it.',
  inputSchema: {
    type: 'object',
    properties: {
      app_id: { type: 'string', description: 'Application ID (optional if app_name is provided)' },
      app_name: { type: 'string', description: 'Application name (alternative to app_id)' },
      parameter_id: {
        type: 'string',
        description: 'The ID of the parameter to delete',
      },
    },
    required: ['parameter_id'],
    anyOf: [
      { required: ['app_id'] },
      { required: ['app_name'] }
    ],
  },
};

export async function handleDeleteRemoteConfigParameter(context: ToolContext, args: any): Promise<ToolResult> {
  const app_id = await context.resolveAppId(args);

  const params = {
    ...context.getAuthParams(),
    app_id,
    parameter_id: args.parameter_id,
  };

  const response = await safeApiCall(
    () => context.httpClient.get('/i/remote-config/remove-parameter', { params }),
    'Failed to delete remote config parameter'
  );

  return {
    content: [
      {
        type: 'text',
        text: `Remote config parameter ${args.parameter_id} deleted successfully for app ${app_id}.\n\n${JSON.stringify(response.data, null, 2)}`,
      },
    ],
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export const remoteConfigToolDefinitions = [
  listRemoteConfigsToolDefinition,
  addRemoteConfigConditionToolDefinition,
  updateRemoteConfigConditionToolDefinition,
  deleteRemoteConfigConditionToolDefinition,
  addRemoteConfigParameterToolDefinition,
  updateRemoteConfigParameterToolDefinition,
  deleteRemoteConfigParameterToolDefinition,
];

export const remoteConfigToolHandlers = {
  'list_remote_configs': 'listRemoteConfigs',
  'add_remote_config_condition': 'addRemoteConfigCondition',
  'update_remote_config_condition': 'updateRemoteConfigCondition',
  'delete_remote_config_condition': 'deleteRemoteConfigCondition',
  'add_remote_config_parameter': 'addRemoteConfigParameter',
  'update_remote_config_parameter': 'updateRemoteConfigParameter',
  'delete_remote_config_parameter': 'deleteRemoteConfigParameter',
} as const;

export class RemoteConfigTools {
  constructor(private context: ToolContext) {}

  async listRemoteConfigs(args: any): Promise<ToolResult> {
    return handleListRemoteConfigs(this.context, args);
  }

  async addRemoteConfigCondition(args: any): Promise<ToolResult> {
    return handleAddRemoteConfigCondition(this.context, args);
  }

  async updateRemoteConfigCondition(args: any): Promise<ToolResult> {
    return handleUpdateRemoteConfigCondition(this.context, args);
  }

  async deleteRemoteConfigCondition(args: any): Promise<ToolResult> {
    return handleDeleteRemoteConfigCondition(this.context, args);
  }

  async addRemoteConfigParameter(args: any): Promise<ToolResult> {
    return handleAddRemoteConfigParameter(this.context, args);
  }

  async updateRemoteConfigParameter(args: any): Promise<ToolResult> {
    return handleUpdateRemoteConfigParameter(this.context, args);
  }

  async deleteRemoteConfigParameter(args: any): Promise<ToolResult> {
    return handleDeleteRemoteConfigParameter(this.context, args);
  }
}

// Metadata for dynamic routing (must be after class declaration)
export const remoteConfigToolMetadata = {
  instanceKey: 'remoteConfig',
  toolClass: RemoteConfigTools,
  handlers: remoteConfigToolHandlers,
} as const;
