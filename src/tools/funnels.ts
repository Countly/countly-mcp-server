import { ToolContext, ToolResult } from './types.js';
import { withDefault } from '../lib/validation.js';
import { safeApiCall } from '../lib/error-handler.js';

/**
 * Funnels Module
 * 
 * Tools for managing conversion funnels - sequences of events showing user flow
 * through each step, tracking progression and drop-off rates.
 * Requires the 'funnels' plugin to be installed on the Countly server.
 */

// ============================================================================
// LIST FUNNELS TOOL
// ============================================================================

export const listFunnelsToolDefinition = {
  name: 'list_funnels',
  description: 'List all funnels with their configurations and performance metrics. Funnels track user progression through a sequence of events.',
  inputSchema: {
    type: 'object',
    properties: {
      app_id: {
        type: 'string',
        description: 'Application ID (optional if app_name is provided)',
      },
      app_name: {
        type: 'string',
        description: 'Application name (alternative to app_id)',
      },
      skip: {
        type: 'number',
        description: 'Number of records to skip for pagination',
        default: 0,
      },
      limit: {
        type: 'number',
        description: 'Maximum number of records to return',
        default: 10,
      },
    },
  },
};

export async function handleListFunnels(
  context: ToolContext,
  input: Record<string, unknown>
): Promise<ToolResult> {
  const app_id = input.app_id as string | undefined;
  const app_name = input.app_name as string | undefined;
  const skip = withDefault(input.skip as number | undefined, 0);
  const limit = withDefault(input.limit as number | undefined, 10);

  const appId = await context.resolveAppId({ app_id, app_name });

  const queryParams: Record<string, string> = {
    app_id: appId,
    method: 'get_funnels',
    outputFormat: 'full',
    iDisplayStart: skip.toString(),
    iDisplayLength: limit.toString(),
    ready: 'true',
    'selectedDynamicCols[]': 'result',
    sEcho: '0',
  };

  const response = await safeApiCall(
    () => context.httpClient.get('/o', { params: queryParams }),
    'Failed to list funnels'
  );

  return {
    content: [{ type: 'text', text: JSON.stringify(response.data, null, 2) }],
  };
}

// ============================================================================
// GET FUNNEL TOOL
// ============================================================================

export const getFunnelToolDefinition = {
  name: 'get_funnel',
  description: 'Get detailed information about a specific funnel including its configuration, steps, and performance data.',
  inputSchema: {
    type: 'object',
    properties: {
      app_id: {
        type: 'string',
        description: 'Application ID (optional if app_name is provided)',
      },
      app_name: {
        type: 'string',
        description: 'Application name (alternative to app_id)',
      },
      funnel_id: {
        type: 'string',
        description: 'Funnel ID to retrieve',
      },
    },
    required: ['funnel_id'],
  },
};

export async function handleGetFunnel(
  context: ToolContext,
  input: Record<string, unknown>
): Promise<ToolResult> {
  const app_id = input.app_id as string | undefined;
  const app_name = input.app_name as string | undefined;
  const funnel_id = input.funnel_id as string;

  const appId = await context.resolveAppId({ app_id, app_name });

  const response = await safeApiCall(
    () => context.httpClient.get('/o', {
      params: {
        app_id: appId,
        method: 'get_funnel',
        funnel: funnel_id,
      },
    }),
    'Failed to get funnel'
  );

  return {
    content: [{ type: 'text', text: JSON.stringify(response.data, null, 2) }],
  };
}

// ============================================================================
// GET FUNNEL DATA TOOL
// ============================================================================

export const getFunnelDataToolDefinition = {
  name: 'get_funnel_data',
  description: 'Get funnel analytics data for a specific time period with optional filtering.',
  inputSchema: {
    type: 'object',
    properties: {
      app_id: {
        type: 'string',
        description: 'Application ID (optional if app_name is provided)',
      },
      app_name: {
        type: 'string',
        description: 'Application name (alternative to app_id)',
      },
      funnel_id: {
        type: 'string',
        description: 'Funnel ID to get data for',
      },
      period: {
        type: 'string',
        description: 'Time period for data. Possible values: "30days", "7days", "yesterday", "hour", or custom range',
        default: '30days',
      },
      filter: {
        type: 'string',
        description: 'Optional MongoDB query filter as JSON string (e.g., \'{"up.country":"US"}\')',
        default: '{}',
      },
    },
    required: ['funnel_id'],
  },
};

export async function handleGetFunnelData(
  context: ToolContext,
  input: Record<string, unknown>
): Promise<ToolResult> {
  const app_id = input.app_id as string | undefined;
  const app_name = input.app_name as string | undefined;
  const funnel_id = input.funnel_id as string;
  const period = withDefault(input.period as string | undefined, '30days');
  const filter = withDefault(input.filter as string | undefined, '{}');

  const appId = await context.resolveAppId({ app_id, app_name });

  // Validate filter is valid JSON
  try {
    JSON.parse(filter);
  } catch {
    return {
      content: [{
        type: 'text',
        text: `Error: Invalid filter JSON - ${filter}`,
      }],
    };
  }

  const response = await safeApiCall(
    () => context.httpClient.get('/o', {
      params: {
        app_id: appId,
        method: 'funnel',
        funnel: funnel_id,
        period,
        filter,
      },
    }),
    'Failed to get funnel data'
  );

  return {
    content: [{ type: 'text', text: JSON.stringify(response.data, null, 2) }],
  };
}

// ============================================================================
// GET FUNNEL STEP USERS TOOL
// ============================================================================

export const getFunnelStepUsersToolDefinition = {
  name: 'get_funnel_step_users',
  description: 'Get list of user IDs (UIDs) who reached a specific step in the funnel.',
  inputSchema: {
    type: 'object',
    properties: {
      app_id: {
        type: 'string',
        description: 'Application ID (optional if app_name is provided)',
      },
      app_name: {
        type: 'string',
        description: 'Application name (alternative to app_id)',
      },
      funnel_id: {
        type: 'string',
        description: 'Funnel ID',
      },
      step: {
        type: 'number',
        description: 'Step number (0-indexed) to get users for',
      },
      period: {
        type: 'string',
        description: 'Time period for data',
        default: '30days',
      },
      filter: {
        type: 'string',
        description: 'Optional MongoDB query filter as JSON string',
        default: '{}',
      },
    },
    required: ['funnel_id', 'step'],
  },
};

export async function handleGetFunnelStepUsers(
  context: ToolContext,
  input: Record<string, unknown>
): Promise<ToolResult> {
  const app_id = input.app_id as string | undefined;
  const app_name = input.app_name as string | undefined;
  const funnel_id = input.funnel_id as string;
  const step = input.step as number;
  const period = withDefault(input.period as string | undefined, '30days');
  const filter = withDefault(input.filter as string | undefined, '{}');

  const appId = await context.resolveAppId({ app_id, app_name });

  const response = await safeApiCall(
    () => context.httpClient.get('/o', {
      params: {
        app_id: appId,
        method: 'funnel',
        funnel: funnel_id,
        period,
        filter,
        users_for_step: step.toString(),
      },
    }),
    'Failed to get funnel step users'
  );

  return {
    content: [{ type: 'text', text: JSON.stringify(response.data, null, 2) }],
  };
}

// ============================================================================
// GET FUNNEL DROPOFF USERS TOOL
// ============================================================================

export const getFunnelDropoffUsersToolDefinition = {
  name: 'get_funnel_dropoff_users',
  description: 'Get list of user IDs (UIDs) who dropped off between two steps in the funnel.',
  inputSchema: {
    type: 'object',
    properties: {
      app_id: {
        type: 'string',
        description: 'Application ID (optional if app_name is provided)',
      },
      app_name: {
        type: 'string',
        description: 'Application name (alternative to app_id)',
      },
      funnel_id: {
        type: 'string',
        description: 'Funnel ID',
      },
      from_step: {
        type: 'number',
        description: 'Starting step number (use -1 for users who never entered the funnel)',
      },
      to_step: {
        type: 'number',
        description: 'Ending step number (the step they dropped off from)',
      },
      period: {
        type: 'string',
        description: 'Time period for data',
        default: '30days',
      },
      filter: {
        type: 'string',
        description: 'Optional MongoDB query filter as JSON string',
        default: '{}',
      },
    },
    required: ['funnel_id', 'from_step', 'to_step'],
  },
};

export async function handleGetFunnelDropoffUsers(
  context: ToolContext,
  input: Record<string, unknown>
): Promise<ToolResult> {
  const app_id = input.app_id as string | undefined;
  const app_name = input.app_name as string | undefined;
  const funnel_id = input.funnel_id as string;
  const from_step = input.from_step as number;
  const to_step = input.to_step as number;
  const period = withDefault(input.period as string | undefined, '30days');
  const filter = withDefault(input.filter as string | undefined, '{}');

  const appId = await context.resolveAppId({ app_id, app_name });

  const response = await safeApiCall(
    () => context.httpClient.get('/o', {
      params: {
        app_id: appId,
        method: 'funnel',
        funnel: funnel_id,
        period,
        filter,
        users_between_steps: `${from_step}|${to_step}`,
      },
    }),
    'Failed to get funnel dropoff users'
  );

  return {
    content: [{ type: 'text', text: JSON.stringify(response.data, null, 2) }],
  };
}

// ============================================================================
// CREATE FUNNEL TOOL
// ============================================================================

export const createFunnelToolDefinition = {
  name: 'create_funnel',
  description: 'Create a new conversion funnel to track user progression through a sequence of events. Define steps, queries for filtering, and session requirements.',
  inputSchema: {
    type: 'object',
    properties: {
      app_id: {
        type: 'string',
        description: 'Application ID (optional if app_name is provided)',
      },
      app_name: {
        type: 'string',
        description: 'Application name (alternative to app_id)',
      },
      name: {
        type: 'string',
        description: 'Funnel name',
      },
      description: {
        type: 'string',
        description: 'Funnel description',
      },
      type: {
        type: 'string',
        enum: ['session-independent', 'same-session'],
        description: 'Funnel type: "session-independent" (events can happen across sessions) or "same-session" (all events must occur in same session)',
        default: 'session-independent',
      },
      steps: {
        type: 'array',
        items: {
          type: 'string',
        },
        description: 'Array of event names representing funnel steps in order (e.g., ["[CLY]_session", "Product Viewed", "Added to Cart", "Purchase"])',
      },
      queries: {
        type: 'array',
        items: {
          type: 'string',
        },
        description: 'Array of MongoDB query JSON strings for each step (e.g., [\'{"up.country":"US"}\', \'{}\', \'{}\', \'{}\']). Use {} for no filter',
        default: [],
      },
      query_texts: {
        type: 'array',
        items: {
          type: 'string',
        },
        description: 'Array of human-readable query descriptions for each step (e.g., ["Country = US", "", "", ""])',
        default: [],
      },
      step_groups: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            c: {
              type: 'string',
              enum: ['and', 'or'],
            },
            g: {
              type: 'number',
            },
          },
        },
        description: 'Array of step group objects defining relationships between steps. Each has "c" (conjunction: "and"/"or") and "g" (group number)',
        default: [],
      },
    },
    required: ['name', 'steps'],
  },
};

export async function handleCreateFunnel(
  context: ToolContext,
  input: Record<string, unknown>
): Promise<ToolResult> {
  const app_id = input.app_id as string | undefined;
  const app_name = input.app_name as string | undefined;
  const name = input.name as string;
  const description = withDefault(input.description as string | undefined, '');
  const type = withDefault(input.type as string | undefined, 'session-independent');
  const steps = input.steps as string[];
  const queries = withDefault(input.queries as string[] | undefined, []);
  const query_texts = withDefault(input.query_texts as string[] | undefined, []);
  const step_groups = withDefault(input.step_groups as Array<{c: string, g: number}> | undefined, []);

  const appId = await context.resolveAppId({ app_id, app_name });

  // Auto-generate queries, query_texts, and step_groups if not provided
  const finalQueries = queries.length > 0 ? queries : steps.map(() => '{}');
  const finalQueryTexts = query_texts.length > 0 ? query_texts : steps.map(() => '');
  const finalStepGroups = step_groups.length > 0 ? step_groups : steps.map((_, i) => ({ c: 'and', g: i }));

  // Validate arrays have matching lengths
  if (finalQueries.length !== steps.length || 
      finalQueryTexts.length !== steps.length || 
      finalStepGroups.length !== steps.length) {
    return {
      content: [{
        type: 'text',
        text: 'Error: steps, queries, query_texts, and step_groups arrays must have the same length',
      }],
    };
  }

  const requestParams: Record<string, string> = {
    app_id: appId,
    funnel_name: name,
    funnel_desc: description,
    funnel_type: type,
    steps: JSON.stringify(steps),
    queries: JSON.stringify(finalQueries),
    queryTexts: JSON.stringify(finalQueryTexts),
    stepGroups: JSON.stringify(finalStepGroups),
  };

  const response = await safeApiCall(
    () => context.httpClient.get('/i/funnels/add', { params: requestParams }),
    'Failed to create funnel'
  );

  return {
    content: [{ type: 'text', text: JSON.stringify(response.data, null, 2) }],
  };
}

// ============================================================================
// UPDATE FUNNEL TOOL
// ============================================================================

export const updateFunnelToolDefinition = {
  name: 'update_funnel',
  description: 'Update an existing funnel configuration including name, description, steps, and filters.',
  inputSchema: {
    type: 'object',
    properties: {
      app_id: {
        type: 'string',
        description: 'Application ID (optional if app_name is provided)',
      },
      app_name: {
        type: 'string',
        description: 'Application name (alternative to app_id)',
      },
      funnel_id: {
        type: 'string',
        description: 'Funnel ID to update',
      },
      name: {
        type: 'string',
        description: 'New funnel name',
      },
      description: {
        type: 'string',
        description: 'New funnel description',
      },
      type: {
        type: 'string',
        enum: ['session-independent', 'same-session'],
        description: 'Funnel type',
      },
      steps: {
        type: 'array',
        items: {
          type: 'string',
        },
        description: 'Array of event names for funnel steps',
      },
      queries: {
        type: 'array',
        items: {
          type: 'string',
        },
        description: 'Array of MongoDB query JSON strings for each step',
      },
      query_texts: {
        type: 'array',
        items: {
          type: 'string',
        },
        description: 'Array of human-readable query descriptions',
      },
      step_groups: {
        type: 'array',
        items: {
          type: 'object',
        },
        description: 'Array of step group objects',
      },
    },
    required: ['funnel_id'],
  },
};

export async function handleUpdateFunnel(
  context: ToolContext,
  input: Record<string, unknown>
): Promise<ToolResult> {
  const app_id = input.app_id as string | undefined;
  const app_name = input.app_name as string | undefined;
  const funnel_id = input.funnel_id as string;
  const name = input.name as string | undefined;
  const description = input.description as string | undefined;
  const type = input.type as string | undefined;
  const steps = input.steps as string[] | undefined;
  const queries = input.queries as string[] | undefined;
  const query_texts = input.query_texts as string[] | undefined;
  const step_groups = input.step_groups as Array<{c: string, g: number}> | undefined;

  const appId = await context.resolveAppId({ app_id, app_name });

  // Get existing funnel data
  const existingResponse = await safeApiCall(
    () => context.httpClient.get('/o', {
      params: {
        app_id: appId,
        method: 'get_funnel',
        funnel: funnel_id,
      },
    }),
    'Failed to get existing funnel'
  );

  const existingFunnel = existingResponse.data;

  // Build funnel_map with updated values
  const funnelData: Record<string, string> = {
    app_id: appId,
    funnel_name: name || existingFunnel.funnel_name,
    funnel_desc: description !== undefined ? description : (existingFunnel.funnel_desc || ''),
    funnel_type: type || existingFunnel.funnel_type,
    steps: steps ? JSON.stringify(steps) : JSON.stringify(existingFunnel.steps || []),
    queries: queries ? JSON.stringify(queries) : JSON.stringify(existingFunnel.queries || []),
    queryTexts: query_texts ? JSON.stringify(query_texts) : JSON.stringify(existingFunnel.queryTexts || []),
    stepGroups: step_groups ? JSON.stringify(step_groups) : JSON.stringify(existingFunnel.stepGroups || []),
  };

  const funnelMap: Record<string, Record<string, string>> = {
    [funnel_id]: funnelData,
  };

  const requestParams = {
    app_id: appId,
    funnel_map: JSON.stringify(funnelMap),
  };

  const response = await safeApiCall(
    () => context.httpClient.get('/i/funnels/edit', { params: requestParams }),
    'Failed to update funnel'
  );

  return {
    content: [{ type: 'text', text: JSON.stringify(response.data, null, 2) }],
  };
}

// ============================================================================
// DELETE FUNNEL TOOL
// ============================================================================

export const deleteFunnelToolDefinition = {
  name: 'delete_funnel',
  description: 'Delete a funnel. This action cannot be undone.',
  inputSchema: {
    type: 'object',
    properties: {
      app_id: {
        type: 'string',
        description: 'Application ID (optional if app_name is provided)',
      },
      app_name: {
        type: 'string',
        description: 'Application name (alternative to app_id)',
      },
      funnel_id: {
        type: 'string',
        description: 'Funnel ID to delete',
      },
    },
    required: ['funnel_id'],
  },
};

export async function handleDeleteFunnel(
  context: ToolContext,
  input: Record<string, unknown>
): Promise<ToolResult> {
  const app_id = input.app_id as string | undefined;
  const app_name = input.app_name as string | undefined;
  const funnel_id = input.funnel_id as string;

  const appId = await context.resolveAppId({ app_id, app_name });

  const response = await safeApiCall(
    () => context.httpClient.get('/i/funnels/delete', {
      params: {
        app_id: appId,
        funnel_id: funnel_id,
      },
    }),
    'Failed to delete funnel'
  );

  return {
    content: [{ type: 'text', text: JSON.stringify(response.data, null, 2) }],
  };
}

// ============================================================================
// Export Combined Arrays
// ============================================================================

export const funnelsToolDefinitions = [
  listFunnelsToolDefinition,
  getFunnelToolDefinition,
  getFunnelDataToolDefinition,
  getFunnelStepUsersToolDefinition,
  getFunnelDropoffUsersToolDefinition,
  createFunnelToolDefinition,
  updateFunnelToolDefinition,
  deleteFunnelToolDefinition,
];

export const funnelsToolHandlers = {
  list_funnels: 'handleListFunnels',
  get_funnel: 'handleGetFunnel',
  get_funnel_data: 'handleGetFunnelData',
  get_funnel_step_users: 'handleGetFunnelStepUsers',
  get_funnel_dropoff_users: 'handleGetFunnelDropoffUsers',
  create_funnel: 'handleCreateFunnel',
  update_funnel: 'handleUpdateFunnel',
  delete_funnel: 'handleDeleteFunnel',
} as const;

export class FunnelsTools {
  constructor(private context: ToolContext) {}

  async list_funnels(args: any): Promise<ToolResult> {
    return handleListFunnels(this.context, args);
  }

  async get_funnel(args: any): Promise<ToolResult> {
    return handleGetFunnel(this.context, args);
  }

  async get_funnel_data(args: any): Promise<ToolResult> {
    return handleGetFunnelData(this.context, args);
  }

  async get_funnel_step_users(args: any): Promise<ToolResult> {
    return handleGetFunnelStepUsers(this.context, args);
  }

  async get_funnel_dropoff_users(args: any): Promise<ToolResult> {
    return handleGetFunnelDropoffUsers(this.context, args);
  }

  async create_funnel(args: any): Promise<ToolResult> {
    return handleCreateFunnel(this.context, args);
  }

  async update_funnel(args: any): Promise<ToolResult> {
    return handleUpdateFunnel(this.context, args);
  }

  async delete_funnel(args: any): Promise<ToolResult> {
    return handleDeleteFunnel(this.context, args);
  }
}

export const funnelsToolMetadata = {
  instanceKey: 'funnels',
  toolClass: FunnelsTools,
  handlers: funnelsToolHandlers,
} as const;
