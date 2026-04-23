import { ToolContext, ToolResult } from './types.js';
import { safeApiCall } from '../lib/error-handler.js';

// ============================================================================
// LIST_REMOTE_CONFIGS TOOL
// ============================================================================

export const listRemoteConfigsToolDefinition = {
  name: 'remote_configs_list',
  description: 'List all remote-config parameters and segment conditions defined for an app via /o?method=remote-config. Requires the remote-config plugin. Use before creating or updating parameters/conditions to see existing IDs.',
  inputSchema: {
    type: 'object',
    properties: {
      app_id: { type: 'string', description: 'Application ID. Either app_id or app_name must be provided; call apps_list first if you do not know it.' },
      app_name: { type: 'string', description: 'Application name (alternative to app_id). Must match an existing app exactly; call apps_list to find valid names.' },
    },
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
  name: 'remote_config_conditions_add',
  description: 'Create a user-segmentation condition that remote-config parameters can reference to serve variant values, via /i/remote-config/add-condition. Requires the remote-config plugin. To modify an existing condition use remote_config_conditions_update.',
  inputSchema: {
    type: 'object',
    properties: {
      app_id: { type: 'string', description: 'Application ID. Either app_id or app_name must be provided; call apps_list first if you do not know it.' },
      app_name: { type: 'string', description: 'Application name (alternative to app_id). Must match an existing app exactly; call apps_list to find valid names.' },
      condition: {
        type: 'string',
        description: 'Condition as a JSON string with fields: condition_name (string), condition_color (number 1-10), condition (MongoDB query; use "up." prefix for user properties), condition_definition (human-readable), seed_value (optional string), condition_description (optional string). Example: \'{"condition_name":"Test users","condition_color":1,"condition":{"up.age":{"$gt":30}},"condition_definition":"Age greater than 30","seed_value":"","condition_description":"Test user group"}\'.'
      },
    },
    required: ['condition'],
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
  name: 'remote_config_conditions_update',
  description: 'Replace the configuration of an existing remote-config condition via /i/remote-config/update-condition. Requires the remote-config plugin.',
  inputSchema: {
    type: 'object',
    properties: {
      app_id: { type: 'string', description: 'Application ID. Either app_id or app_name must be provided; call apps_list first if you do not know it.' },
      app_name: { type: 'string', description: 'Application name (alternative to app_id). Must match an existing app exactly; call apps_list to find valid names.' },
      condition_id: {
        type: 'string',
        description: 'Condition identifier (_id) to update. Obtain it from remote_configs_list.',
      },
      condition: {
        type: 'string',
        description: 'Full replacement condition as a JSON string with condition_name, condition_color, condition, condition_definition, seed_value, condition_description, and used_in_parameters (current count of parameters using it). Example: \'{"condition_name":"Test users","condition_color":2,"condition":{"up.age":{"$gt":30}},"condition_definition":"Age greater than 30","seed_value":"","condition_description":"Updated description","used_in_parameters":0}\'.'
      },
    },
    required: ['condition_id', 'condition'],
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
  name: 'remote_config_conditions_delete',
  description: 'Delete a remote-config segmentation condition via /i/remote-config/remove-condition. Fails if any parameter still references the condition. Requires the remote-config plugin. WARNING: irreversible.',
  inputSchema: {
    type: 'object',
    properties: {
      app_id: { type: 'string', description: 'Application ID. Either app_id or app_name must be provided; call apps_list first if you do not know it.' },
      app_name: { type: 'string', description: 'Application name (alternative to app_id). Must match an existing app exactly; call apps_list to find valid names.' },
      condition_id: {
        type: 'string',
        description: 'Condition identifier (_id) to delete. Obtain it from remote_configs_list.',
      },
    },
    required: ['condition_id'],
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
  name: 'remote_config_parameters_add',
  description: 'Create a remote-config parameter (key + default value + per-condition overrides) that SDKs fetch to control app behavior, via /i/remote-config/add-parameter. Requires the remote-config plugin. To modify an existing parameter use remote_config_parameters_update.',
  inputSchema: {
    type: 'object',
    properties: {
      app_id: { type: 'string', description: 'Application ID. Either app_id or app_name must be provided; call apps_list first if you do not know it.' },
      app_name: { type: 'string', description: 'Application name (alternative to app_id). Must match an existing app exactly; call apps_list to find valid names.' },
      parameter: {
        type: 'string',
        description: 'Parameter as a JSON string with: parameter_key (unique key), default_value (value served when no condition matches), description, conditions (array of {condition_id, value}), status ("Running" or "Stopped"), optional expiry_dttm (ms epoch). Example: \'{"parameter_key":"feature_flag","default_value":"0","description":"Feature toggle","conditions":[{"condition_id":"123","value":"1"}],"status":"Running","expiry_dttm":1763035291208}\'.'
      },
    },
    required: ['parameter'],
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
  name: 'remote_config_parameters_update',
  description: 'Replace an existing remote-config parameter (values, conditions, status) via /i/remote-config/update-parameter. Requires the remote-config plugin.',
  inputSchema: {
    type: 'object',
    properties: {
      app_id: { type: 'string', description: 'Application ID. Either app_id or app_name must be provided; call apps_list first if you do not know it.' },
      app_name: { type: 'string', description: 'Application name (alternative to app_id). Must match an existing app exactly; call apps_list to find valid names.' },
      parameter_id: {
        type: 'string',
        description: 'Parameter identifier (_id) to update. Obtain it from remote_configs_list.',
      },
      parameter: {
        type: 'string',
        description: 'Full replacement parameter as a JSON string with parameter_key, default_value, description, conditions, status, optional expiry_dttm, valuesList (all historical values), and ts (creation timestamp ms). Example: \'{"parameter_key":"feature_flag","default_value":0,"description":"Updated description","conditions":[{"condition_id":"123","value":1}],"status":"Stopped","expiry_dttm":1763035291208,"valuesList":[0,1],"ts":1762952513609}\'.'
      },
    },
    required: ['parameter_id', 'parameter'],
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
  name: 'remote_config_parameters_delete',
  description: 'Delete a remote-config parameter via /i/remote-config/remove-parameter. After deletion, SDKs will stop receiving it. Requires the remote-config plugin. WARNING: irreversible.',
  inputSchema: {
    type: 'object',
    properties: {
      app_id: { type: 'string', description: 'Application ID. Either app_id or app_name must be provided; call apps_list first if you do not know it.' },
      app_name: { type: 'string', description: 'Application name (alternative to app_id). Must match an existing app exactly; call apps_list to find valid names.' },
      parameter_id: {
        type: 'string',
        description: 'Parameter identifier (_id) to delete. Obtain it from remote_configs_list.',
      },
    },
    required: ['parameter_id'],
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
  'remote_configs_list': 'listRemoteConfigs',
  'remote_config_conditions_add': 'addRemoteConfigCondition',
  'remote_config_conditions_update': 'updateRemoteConfigCondition',
  'remote_config_conditions_delete': 'deleteRemoteConfigCondition',
  'remote_config_parameters_add': 'addRemoteConfigParameter',
  'remote_config_parameters_update': 'updateRemoteConfigParameter',
  'remote_config_parameters_delete': 'deleteRemoteConfigParameter',
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
