import { ToolContext, ToolResult } from './types.js';
import { safeApiCall } from '../lib/error-handler.js';

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Ensures that all remote config parameters used in experiment variants exist.
 * Creates missing parameters with default values collected from all variants.
 */
async function ensureRemoteConfigParameters(
  context: ToolContext,
  app_id: string,
  variants: any[]
): Promise<void> {
  // Get existing remote config parameters
  const listParams = {
    ...context.getAuthParams(),
    app_id,
    method: 'remote-config',
  };

  const existingConfigsResponse = await safeApiCall(
    () => context.httpClient.get('/o', { params: listParams }),
    'Failed to list remote configs'
  );

  const existingParameters = existingConfigsResponse.data?.parameters || [];
  const existingParamKeys = new Set(existingParameters.map((p: any) => p.parameter_key));

  // Collect all parameter names and their values from variants
  const parameterMap = new Map<string, { description: string; values: Set<any> }>();

  for (const variant of variants) {
    if (variant.parameters && Array.isArray(variant.parameters)) {
      for (const param of variant.parameters) {
        if (!parameterMap.has(param.name)) {
          parameterMap.set(param.name, {
            description: param.description || `Parameter for A/B experiment`,
            values: new Set(),
          });
        }
        parameterMap.get(param.name)!.values.add(param.value);
      }
    }
  }

  // Create missing parameters
  for (const [paramName, paramInfo] of parameterMap.entries()) {
    if (!existingParamKeys.has(paramName)) {
      // Use the first value as default
      const defaultValue = Array.from(paramInfo.values)[0];

      const parameter = {
        parameter_key: paramName,
        default_value: defaultValue,
        description: paramInfo.description,
        conditions: [],
        status: 'Running',
      };

      const createParams = {
        ...context.getAuthParams(),
        app_id,
        parameter: JSON.stringify(parameter),
      };

      await safeApiCall(
        () => context.httpClient.get('/i/remote-config/add-parameter', { params: createParams }),
        `Failed to create remote config parameter: ${paramName}`
      );
    }
  }
}

// ============================================================================
// LIST_AB_EXPERIMENTS TOOL
// ============================================================================

export const listABExperimentsToolDefinition = {
  name: 'ab_experiments_list',
  description: 'List A/B testing experiments for an app (names, statuses, variants, and optionally computed results). Requires the ab-testing plugin. For full per-experiment detail use ab_experiments_details.',
  inputSchema: {
    type: 'object',
    properties: {
      app_id: { type: 'string', description: 'Application ID. Either app_id or app_name must be provided; call apps_list first if you do not know it.' },
      app_name: { type: 'string', description: 'Application name (alternative to app_id). Must match an existing app exactly; call apps_list to find valid names.' },
      skipCalculation: { type: 'boolean', description: 'When true, skip result aggregation for faster listing. Defaults to true.', default: true },
    },
  },
};

export async function handleListABExperiments(context: ToolContext, args: any): Promise<ToolResult> {
  const app_id = await context.resolveAppId(args);
  const skipCalculation = args.skipCalculation !== undefined ? args.skipCalculation : true;

  const params = {
    ...context.getAuthParams(),
    app_id,
    method: 'ab-testing',
    skipCalculation: skipCalculation.toString(),
  };

  const response = await safeApiCall(
    () => context.httpClient.get('/o', { params }),
    'Failed to list A/B experiments'
  );

  return {
    content: [
      {
        type: 'text',
        text: `A/B experiments for app ${app_id}:\n\n${JSON.stringify(response.data, null, 2)}`,
      },
    ],
  };
}

// ============================================================================
// GET_AB_EXPERIMENT_DETAIL TOOL
// ============================================================================

export const getABExperimentDetailToolDefinition = {
  name: 'ab_experiments_details',
  description: 'Get full details for one A/B testing experiment via /o/ab-testing/experiment-detail (variants, goals, per-variant results, statistical significance). Requires the ab-testing plugin. For a summary across experiments use ab_experiments_list.',
  inputSchema: {
    type: 'object',
    properties: {
      app_id: { type: 'string', description: 'Application ID. Either app_id or app_name must be provided; call apps_list first if you do not know it.' },
      app_name: { type: 'string', description: 'Application name (alternative to app_id). Must match an existing app exactly; call apps_list to find valid names.' },
      experiment_id: { type: 'string', description: 'Experiment identifier. Obtain it from ab_experiments_list.' },
    },
    required: ['experiment_id'],
  },
};

export async function handleGetABExperimentDetail(context: ToolContext, args: any): Promise<ToolResult> {
  const app_id = await context.resolveAppId(args);

  const params = {
    ...context.getAuthParams(),
    app_id,
    experiment_id: args.experiment_id,
  };

  const response = await safeApiCall(
    () => context.httpClient.get('/o/ab-testing/experiment-detail', { params }),
    'Failed to get experiment detail'
  );

  return {
    content: [
      {
        type: 'text',
        text: `Experiment detail for ${args.experiment_id}:\n\n${JSON.stringify(response.data, null, 2)}`,
      },
    ],
  };
}

// ============================================================================
// CREATE_AB_EXPERIMENT TOOL
// ============================================================================

export const createABExperimentToolDefinition = {
  name: 'ab_experiments_create',
  description: 'Create an A/B testing experiment with variants, user targeting, and optional goals. Requires the ab-testing plugin. Creates the experiment in draft; call ab_experiments_start to begin serving variants. For remote-config experiments, missing remote-config parameters referenced by variants are auto-created.',
  inputSchema: {
    type: 'object',
    properties: {
      app_id: { type: 'string', description: 'Application ID. Either app_id or app_name must be provided; call apps_list first if you do not know it.' },
      app_name: { type: 'string', description: 'Application name (alternative to app_id). Must match an existing app exactly; call apps_list to find valid names.' },
      name: { type: 'string', description: 'Human-readable experiment name shown in the dashboard.' },
      description: { type: 'string', description: 'Free-form description of what the experiment tests.' },
      type: { type: 'string', enum: ['remote-config', 'code'], default: 'remote-config', description: 'Experiment delivery mechanism: "remote-config" (served via remote-config parameters) or "code" (client-side flag). Defaults to "remote-config".' },
      show_target_users: { type: 'boolean', default: true, description: 'Whether the experiment UI shows the targeting block. Defaults to true.' },
      target_users: {
        type: 'object',
        properties: {
          percentage: { type: 'string', description: 'Percentage of eligible users to enroll, as a numeric string (e.g. "50" for 50%).' },
          byVal: { type: 'array', items: { type: 'string' }, description: 'Specific user IDs to include in the experiment.' },
          byValText: { type: 'string', description: 'Free-text representation of the user-ID list shown in the UI.' },
          condition: { type: 'object', description: 'MongoDB-style condition object on user properties (e.g. {"up.age": {"$gt": 30}}). Defaults to empty (no extra filter).' },
          condition_definition: { type: 'string', description: 'Human-readable label for the condition, shown in the UI.' },
        },
        required: ['percentage'],
        description: 'User targeting configuration. Percentage is required; other fields narrow the audience.',
      },
      variants: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Variant label (e.g. "Control", "Variant A"). Must be unique within the experiment.' },
            parameters: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string', description: 'Remote-config parameter key this variant overrides.' },
                  description: { type: 'string', description: 'Optional human-readable note about the parameter.' },
                  value: { type: 'string', description: 'Value assigned to the parameter for this variant.' },
                },
                required: ['name', 'value'],
              },
              description: 'Parameter overrides for this variant.',
            },
          },
          required: ['name', 'parameters'],
        },
        minItems: 2,
        description: 'Variants to test. At least 2 entries required (typically control + one or more challengers).',
      },
      goals: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            user_segmentation: {
              type: 'string',
              description: 'User segmentation query as a JSON string in the form \'{"query":{<MongoDB query>},"queryText":"<human-readable description>"}\'. Example: \'{"query":{"custom.Subscription Plan":{"$in":["Premium"]}},"queryText":"Subscription Plan = Premium"}\'.'
            },
            steps: {
              type: 'string',
              description: 'Goal steps as a JSON-encoded array. Each step specifies user behavior to track. Format: \'[{"type":"did"|"didnot","event":"<event_name>","times":"{\\"$gte\\":<number>}","period":"<days>days"|"0days","query":"{}","queryText":"","byVal":"","group":<number>,"conj":"and"|"or"}]\'. Example: \'[{"type":"did","event":"Subscription Purchased","times":"{\\"$gte\\":1}","period":"0days","query":"{}","queryText":"","byVal":"","group":0,"conj":"and"}]\'.'
            },
          },
          required: ['user_segmentation', 'steps'],
        },
        description: 'Success metrics to evaluate variants against. Each goal pairs a user-segmentation filter with behavioral steps (events to do/avoid). Omit for exploratory experiments.',
      },
      expiration: { type: 'boolean', default: true, description: 'Whether the experiment auto-concludes after a fixed duration. Defaults to true.' },
      days: { type: 'string', default: '30', description: 'Duration in days before auto-conclusion (used when expiration is true). Defaults to "30".' },
      improvement: { type: 'boolean', default: true, description: 'Whether to auto-conclude once a variant beats control by improvementRate. Defaults to true.' },
      improvementRate: { type: 'string', default: '10', description: 'Minimum improvement percentage to trigger auto-conclusion. Defaults to "10".' },
    },
    required: ['name', 'description', 'target_users', 'variants'],
  },
};

export async function handleCreateABExperiment(context: ToolContext, args: any): Promise<ToolResult> {
  const app_id = await context.resolveAppId(args);

  // Check and create missing remote config parameters for remote-config type experiments
  if ((args.type || 'remote-config') === 'remote-config') {
    await ensureRemoteConfigParameters(context, app_id, args.variants);
  }

  // Build experiment object
  const experiment = {
    name: args.name,
    description: args.description || '',
    show_target_users: args.show_target_users !== undefined ? args.show_target_users : true,
    target_users: {
      byVal: args.target_users.byVal || [],
      byValText: args.target_users.byValText || '',
      percentage: args.target_users.percentage,
      condition: args.target_users.condition || {},
      condition_definition: args.target_users.condition_definition || '',
    },
    goals: args.goals || [],
    variants: args.variants,
    expiration: args.expiration !== undefined ? args.expiration : true,
    improvement: args.improvement !== undefined ? args.improvement : true,
    days: args.days || '30',
    improvementRate: args.improvementRate || '10',
    type: args.type || 'remote-config',
  };

  // Log the experiment object for debugging
  console.log('Creating experiment:', JSON.stringify(experiment, null, 2));

  const params = {
    ...context.getAuthParams(),
    app_id,
    experiment: JSON.stringify(experiment),
  };

  const response = await safeApiCall(
    () => context.httpClient.post('/i/ab-testing/add-experiment', null, { params }),
    'Failed to create A/B experiment'
  );

  return {
    content: [
      {
        type: 'text',
        text: `A/B experiment created successfully for app ${app_id}.\n\n${JSON.stringify(response.data, null, 2)}`,
      },
    ],
  };
}

// ============================================================================
// START_AB_EXPERIMENT TOOL
// ============================================================================

export const startABExperimentToolDefinition = {
  name: 'ab_experiments_start',
  description: 'Start a draft A/B testing experiment so variants begin serving to targeted users and data collection begins. Requires the ab-testing plugin. To halt a running experiment use ab_experiments_stop.',
  inputSchema: {
    type: 'object',
    properties: {
      app_id: { type: 'string', description: 'Application ID. Either app_id or app_name must be provided; call apps_list first if you do not know it.' },
      app_name: { type: 'string', description: 'Application name (alternative to app_id). Must match an existing app exactly; call apps_list to find valid names.' },
      experiment_id: { type: 'string', description: 'Experiment identifier to start. Obtain it from ab_experiments_list.' },
    },
    required: ['experiment_id'],
  },
};

export async function handleStartABExperiment(context: ToolContext, args: any): Promise<ToolResult> {
  const app_id = await context.resolveAppId(args);

  const params = {
    ...context.getAuthParams(),
    app_id,
    experiment_id: args.experiment_id,
  };

  const response = await safeApiCall(
    () => context.httpClient.post('/i/ab-testing/start-experiment', null, { params }),
    'Failed to start A/B experiment'
  );

  return {
    content: [
      {
        type: 'text',
        text: `A/B experiment ${args.experiment_id} started successfully.\n\n${JSON.stringify(response.data, null, 2)}`,
      },
    ],
  };
}

// ============================================================================
// STOP_AB_EXPERIMENT TOOL
// ============================================================================

export const stopABExperimentToolDefinition = {
  name: 'ab_experiments_stop',
  description: 'Stop a running A/B testing experiment; variants stop being served but collected results remain available. Requires the ab-testing plugin. To remove the experiment entirely use ab_experiments_delete.',
  inputSchema: {
    type: 'object',
    properties: {
      app_id: { type: 'string', description: 'Application ID. Either app_id or app_name must be provided; call apps_list first if you do not know it.' },
      app_name: { type: 'string', description: 'Application name (alternative to app_id). Must match an existing app exactly; call apps_list to find valid names.' },
      experiment_id: { type: 'string', description: 'Experiment identifier to stop. Obtain it from ab_experiments_list.' },
    },
    required: ['experiment_id'],
  },
};

export async function handleStopABExperiment(context: ToolContext, args: any): Promise<ToolResult> {
  const app_id = await context.resolveAppId(args);

  const params = {
    ...context.getAuthParams(),
    app_id,
    experiment_id: args.experiment_id,
  };

  const response = await safeApiCall(
    () => context.httpClient.post('/i/ab-testing/stop-experiment', null, { params }),
    'Failed to stop A/B experiment'
  );

  return {
    content: [
      {
        type: 'text',
        text: `A/B experiment ${args.experiment_id} stopped successfully.\n\n${JSON.stringify(response.data, null, 2)}`,
      },
    ],
  };
}

// ============================================================================
// DELETE_AB_EXPERIMENT TOOL
// ============================================================================

export const deleteABExperimentToolDefinition = {
  name: 'ab_experiments_delete',
  description: 'Delete an A/B testing experiment and all its collected data. Requires the ab-testing plugin. WARNING: irreversible. To temporarily halt without data loss use ab_experiments_stop.',
  inputSchema: {
    type: 'object',
    properties: {
      app_id: { type: 'string', description: 'Application ID. Either app_id or app_name must be provided; call apps_list first if you do not know it.' },
      app_name: { type: 'string', description: 'Application name (alternative to app_id). Must match an existing app exactly; call apps_list to find valid names.' },
      experiment_id: { type: 'string', description: 'Experiment identifier to delete. Obtain it from ab_experiments_list.' },
    },
    required: ['experiment_id'],
  },
};

export async function handleDeleteABExperiment(context: ToolContext, args: any): Promise<ToolResult> {
  const app_id = await context.resolveAppId(args);

  const params = {
    ...context.getAuthParams(),
    app_id,
    experiment_id: args.experiment_id,
  };

  const response = await safeApiCall(
    () => context.httpClient.post('/i/ab-testing/remove-experiment', null, { params }),
    'Failed to delete A/B experiment'
  );

  return {
    content: [
      {
        type: 'text',
        text: `A/B experiment ${args.experiment_id} deleted successfully.\n\n${JSON.stringify(response.data, null, 2)}`,
      },
    ],
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export const abTestingToolDefinitions = [
  listABExperimentsToolDefinition,
  getABExperimentDetailToolDefinition,
  createABExperimentToolDefinition,
  startABExperimentToolDefinition,
  stopABExperimentToolDefinition,
  deleteABExperimentToolDefinition,
];

export const abTestingToolHandlers = {
  'ab_experiments_list': 'ab_experiments_list',
  'ab_experiments_details': 'ab_experiments_details',
  'ab_experiments_create': 'ab_experiments_create',
  'ab_experiments_start': 'ab_experiments_start',
  'ab_experiments_stop': 'ab_experiments_stop',
  'ab_experiments_delete': 'ab_experiments_delete',
} as const;

// ============================================================================
// TOOL CLASS
// ============================================================================

export class ABTestingTools {
  constructor(private context: ToolContext) {}

  async ab_experiments_list(args: any): Promise<ToolResult> {
    return handleListABExperiments(this.context, args);
  }

  async ab_experiments_details(args: any): Promise<ToolResult> {
    return handleGetABExperimentDetail(this.context, args);
  }

  async ab_experiments_create(args: any): Promise<ToolResult> {
    return handleCreateABExperiment(this.context, args);
  }

  async ab_experiments_start(args: any): Promise<ToolResult> {
    return handleStartABExperiment(this.context, args);
  }

  async ab_experiments_stop(args: any): Promise<ToolResult> {
    return handleStopABExperiment(this.context, args);
  }

  async ab_experiments_delete(args: any): Promise<ToolResult> {
    return handleDeleteABExperiment(this.context, args);
  }
}

// ============================================================================
// METADATA
// ============================================================================

export const abTestingToolMetadata = {
  instanceKey: 'ab_testing',
  toolClass: ABTestingTools,
  handlers: abTestingToolHandlers,
} as const;

