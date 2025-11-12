import { ToolContext, ToolResult } from './types.js';
import { safeApiCall } from '../lib/error-handler.js';

// ============================================================================
// LIST_AB_EXPERIMENTS TOOL
// ============================================================================

export const listABExperimentsToolDefinition = {
  name: 'list_ab_experiments',
  description: 'List all A/B testing experiments for an application. Shows experiment names, statuses, variants, and results.',
  inputSchema: {
    type: 'object',
    properties: {
      app_id: { type: 'string', description: 'Application ID (optional if app_name is provided)' },
      app_name: { type: 'string', description: 'Application name (alternative to app_id)' },
      skipCalculation: { type: 'boolean', description: 'Skip calculation of results for better performance', default: true },
    },
    anyOf: [
      { required: ['app_id'] },
      { required: ['app_name'] }
    ],
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
  name: 'get_ab_experiment_detail',
  description: 'Get detailed information about a specific A/B testing experiment including variants, results, goals, and statistical significance.',
  inputSchema: {
    type: 'object',
    properties: {
      app_id: { type: 'string', description: 'Application ID (optional if app_name is provided)' },
      app_name: { type: 'string', description: 'Application name (alternative to app_id)' },
      experiment_id: { type: 'string', description: 'Experiment ID to retrieve details for' },
    },
    required: ['experiment_id'],
    anyOf: [
      { required: ['app_id'] },
      { required: ['app_name'] }
    ],
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
  name: 'create_ab_experiment',
  description: 'Create a new A/B testing experiment with multiple variants, user targeting, and goals. Used for testing different features, UI elements, or configurations.',
  inputSchema: {
    type: 'object',
    properties: {
      app_id: { type: 'string', description: 'Application ID (optional if app_name is provided)' },
      app_name: { type: 'string', description: 'Application name (alternative to app_id)' },
      name: { type: 'string', description: 'Experiment name' },
      description: { type: 'string', description: 'Experiment description' },
      type: { type: 'string', enum: ['remote-config', 'code'], default: 'remote-config', description: 'Experiment type' },
      target_users: {
        type: 'object',
        properties: {
          percentage: { type: 'string', description: 'Percentage of users to include (e.g., "50" for 50%)' },
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
            user_segmentation: { type: 'string', description: 'User segmentation query as JSON string' },
            steps: { type: 'string', description: 'Goal steps as JSON string array' },
          },
          required: ['user_segmentation', 'steps'],
        },
        description: 'Optional array of experiment goals',
      },
      expiration: { type: 'boolean', default: true, description: 'Whether experiment auto-concludes' },
      days: { type: 'string', default: '30', description: 'Duration in days before auto-conclusion' },
      improvement: { type: 'boolean', default: true, description: 'Whether to auto-conclude on improvement' },
      improvementRate: { type: 'string', default: '10', description: 'Minimum improvement percentage to auto-conclude' },
    },
    required: ['name', 'description', 'target_users', 'variants'],
    anyOf: [
      { required: ['app_id'] },
      { required: ['app_name'] }
    ],
  },
};

export async function handleCreateABExperiment(context: ToolContext, args: any): Promise<ToolResult> {
  const app_id = await context.resolveAppId(args);

  // Build experiment object
  const experiment = {
    name: args.name,
    description: args.description,
    show_target_users: true,
    target_users: {
      byVal: [],
      byValText: '',
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
  name: 'start_ab_experiment',
  description: 'Start an A/B testing experiment. Once started, the experiment begins collecting data and showing variants to users.',
  inputSchema: {
    type: 'object',
    properties: {
      app_id: { type: 'string', description: 'Application ID (optional if app_name is provided)' },
      app_name: { type: 'string', description: 'Application name (alternative to app_id)' },
      experiment_id: { type: 'string', description: 'Experiment ID to start' },
    },
    required: ['experiment_id'],
    anyOf: [
      { required: ['app_id'] },
      { required: ['app_name'] }
    ],
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
  name: 'stop_ab_experiment',
  description: 'Stop a running A/B testing experiment. The experiment will no longer show variants to users but results remain available.',
  inputSchema: {
    type: 'object',
    properties: {
      app_id: { type: 'string', description: 'Application ID (optional if app_name is provided)' },
      app_name: { type: 'string', description: 'Application name (alternative to app_id)' },
      experiment_id: { type: 'string', description: 'Experiment ID to stop' },
    },
    required: ['experiment_id'],
    anyOf: [
      { required: ['app_id'] },
      { required: ['app_name'] }
    ],
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
  name: 'delete_ab_experiment',
  description: 'Delete an A/B testing experiment. This permanently removes the experiment and all its data.',
  inputSchema: {
    type: 'object',
    properties: {
      app_id: { type: 'string', description: 'Application ID (optional if app_name is provided)' },
      app_name: { type: 'string', description: 'Application name (alternative to app_id)' },
      experiment_id: { type: 'string', description: 'Experiment ID to delete' },
    },
    required: ['experiment_id'],
    anyOf: [
      { required: ['app_id'] },
      { required: ['app_name'] }
    ],
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
  list_ab_experiments: handleListABExperiments,
  get_ab_experiment_detail: handleGetABExperimentDetail,
  create_ab_experiment: handleCreateABExperiment,
  start_ab_experiment: handleStartABExperiment,
  stop_ab_experiment: handleStopABExperiment,
  delete_ab_experiment: handleDeleteABExperiment,
};

// ============================================================================
// TOOL CLASS
// ============================================================================

export class ABTestingTools {
  constructor(private context: ToolContext) {}

  async list_ab_experiments(args: any): Promise<ToolResult> {
    return handleListABExperiments(this.context, args);
  }

  async get_ab_experiment_detail(args: any): Promise<ToolResult> {
    return handleGetABExperimentDetail(this.context, args);
  }

  async create_ab_experiment(args: any): Promise<ToolResult> {
    return handleCreateABExperiment(this.context, args);
  }

  async start_ab_experiment(args: any): Promise<ToolResult> {
    return handleStartABExperiment(this.context, args);
  }

  async stop_ab_experiment(args: any): Promise<ToolResult> {
    return handleStopABExperiment(this.context, args);
  }

  async delete_ab_experiment(args: any): Promise<ToolResult> {
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

