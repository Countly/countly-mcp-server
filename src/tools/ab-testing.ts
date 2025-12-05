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
  description: 'List all A/B testing experiments for an application. Shows experiment names, statuses, variants, and results.',
  inputSchema: {
    type: 'object',
    properties: {
      app_id: { type: 'string', description: 'Application ID (optional if app_name is provided)' },
      app_name: { type: 'string', description: 'Application name (alternative to app_id)' },
      skipCalculation: { type: 'boolean', description: 'Skip calculation of results for better performance', default: true },
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
  description: 'Get detailed information about a specific A/B testing experiment including variants, results, goals, and statistical significance.',
  inputSchema: {
    type: 'object',
    properties: {
      app_id: { type: 'string', description: 'Application ID (optional if app_name is provided)' },
      app_name: { type: 'string', description: 'Application name (alternative to app_id)' },
      experiment_id: { type: 'string', description: 'Experiment ID to retrieve details for' },
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
  description: 'Create a new A/B testing experiment with multiple variants, user targeting, and goals. Used for testing different features, UI elements, or configurations.',
  inputSchema: {
    type: 'object',
    properties: {
      app_id: { type: 'string', description: 'Application ID (optional if app_name is provided)' },
      app_name: { type: 'string', description: 'Application name (alternative to app_id)' },
      name: { type: 'string', description: 'Experiment name' },
      description: { type: 'string', description: 'Experiment description' },
      type: { type: 'string', enum: ['remote-config', 'code'], default: 'remote-config', description: 'Experiment type' },
      show_target_users: { type: 'boolean', default: true, description: 'Whether to show target users configuration' },
      target_users: {
        type: 'object',
        properties: {
          percentage: { type: 'string', description: 'Percentage of users to include (e.g., "50" for 50%)' },
          byVal: { type: 'array', items: { type: 'string' }, description: 'Array of user IDs to target' },
          byValText: { type: 'string', description: 'Text representation of targeted user IDs' },
          condition: { type: 'object', description: 'MongoDB query for user conditions (e.g., {"up.age": {"$gt": 30}})' },
          condition_definition: { type: 'string', description: 'Human-readable condition description' },
        },
        required: ['percentage'],
        description: 'User targeting configuration',
      },
      variants: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Variant name (e.g., "Control group", "Variant A")' },
            parameters: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string', description: 'Parameter name' },
                  description: { type: 'string', description: 'Parameter description' },
                  value: { type: 'string', description: 'Parameter value' },
                },
                required: ['name', 'value'],
              },
              description: 'Parameters for this variant',
            },
          },
          required: ['name', 'parameters'],
        },
        minItems: 2,
        description: 'Array of experiment variants (minimum 2)',
      },
      goals: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            user_segmentation: { 
              type: 'string', 
              description: 'User segmentation query as JSON string. Format: \'{"query":{<MongoDB query>},"queryText":"<human-readable description>"}\'  Example: \'{"query":{"custom.Subscription Plan":{"$in":["Premium"]}},"queryText":"Subscription Plan = Premium"}\'' 
            },
            steps: { 
              type: 'string', 
              description: 'Goal steps as JSON string array. Each step defines user behavior to track. Format: \'[{"type":"did"|"didnot","event":"<event_name>","times":"{\\"$gte\\":<number>}","period":"<days>days"|"0days","query":"{}","queryText":"","byVal":"","group":<number>,"conj":"and"|"or"}]\' Example: \'[{"type":"did","event":"Subscription Purchased","times":"{\\"$gte\\":1}","period":"0days","query":"{}","queryText":"","byVal":"","group":0,"conj":"and"}]\'' 
            },
          },
          required: ['user_segmentation', 'steps'],
        },
        description: 'Optional array of experiment goals. Goals define what user actions you want to optimize for (e.g., conversions, purchases). Each goal has user segmentation filters and behavioral steps that users must complete.',
      },
      expiration: { type: 'boolean', default: true, description: 'Whether experiment auto-concludes' },
      days: { type: 'string', default: '30', description: 'Duration in days before auto-conclusion' },
      improvement: { type: 'boolean', default: true, description: 'Whether to auto-conclude on improvement' },
      improvementRate: { type: 'string', default: '10', description: 'Minimum improvement percentage to auto-conclude' },
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
  description: 'Start an A/B testing experiment. Once started, the experiment begins collecting data and showing variants to users.',
  inputSchema: {
    type: 'object',
    properties: {
      app_id: { type: 'string', description: 'Application ID (optional if app_name is provided)' },
      app_name: { type: 'string', description: 'Application name (alternative to app_id)' },
      experiment_id: { type: 'string', description: 'Experiment ID to start' },
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
  description: 'Stop a running A/B testing experiment. The experiment will no longer show variants to users but results remain available.',
  inputSchema: {
    type: 'object',
    properties: {
      app_id: { type: 'string', description: 'Application ID (optional if app_name is provided)' },
      app_name: { type: 'string', description: 'Application name (alternative to app_id)' },
      experiment_id: { type: 'string', description: 'Experiment ID to stop' },
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
  description: 'Delete an A/B testing experiment. This permanently removes the experiment and all its data.',
  inputSchema: {
    type: 'object',
    properties: {
      app_id: { type: 'string', description: 'Application ID (optional if app_name is provided)' },
      app_name: { type: 'string', description: 'Application name (alternative to app_id)' },
      experiment_id: { type: 'string', description: 'Experiment ID to delete' },
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

