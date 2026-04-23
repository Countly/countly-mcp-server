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
  name: 'funnels_list',
  description: 'List conversion funnels with configurations and rollup metrics, paginated and optionally name-filtered, via /o?method=get_funnels. Requires the funnels plugin. For per-period analytics of one funnel use funnels_data.',
  inputSchema: {
    type: 'object',
    properties: {
      app_id: {
        type: 'string',
        description: 'Application ID. Either app_id or app_name must be provided; call apps_list first if you do not know it.',
      },
      app_name: {
        type: 'string',
        description: 'Application name (alternative to app_id). Must match an existing app exactly; call apps_list to find valid names.',
      },
      skip: {
        type: 'number',
        description: 'Number of records to skip for pagination. Defaults to 0.',
        default: 0,
      },
      limit: {
        type: 'number',
        description: 'Maximum number of records to return. Defaults to 10.',
        default: 10,
      },
      search: {
        type: 'string',
        description: 'Case-insensitive substring filter on funnel name.',
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
  const search = input.search as string | undefined;

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
  if (search) {
    queryParams.sSearch = search;
  }

  const response = await safeApiCall(
    () => context.httpClient.get('/o', { params: queryParams }),
    'Failed to list funnels'
  );

  return {
    content: [{ type: 'text', text: JSON.stringify(response.data, null, 2) }],
  };
}

// ============================================================================
// GET FUNNEL DATA TOOL
// ============================================================================

export const getFunnelDataToolDefinition = {
  name: 'funnels_data',
  description: 'Get per-step conversion data (counts, drop-off, rates) for one funnel in a period, via /o?method=funnel. Requires the funnels plugin. For the users at a specific step use funnels_step_users; for who dropped off between steps use funnels_dropoff_users.',
  inputSchema: {
    type: 'object',
    properties: {
      app_id: {
        type: 'string',
        description: 'Application ID. Either app_id or app_name must be provided; call apps_list first if you do not know it.',
      },
      app_name: {
        type: 'string',
        description: 'Application name (alternative to app_id). Must match an existing app exactly; call apps_list to find valid names.',
      },
      funnel_id: {
        type: 'string',
        description: 'Funnel identifier to fetch data for. Obtain it from funnels_list.',
      },
      period: {
        type: 'string',
        description: 'Time period. One of "month", "60days", "30days", "7days", "yesterday", "hour", or a custom range as [startMilliseconds,endMilliseconds]. Defaults to "30days".',
        default: '30days',
      },
      filter: {
        type: 'string',
        description: 'Optional MongoDB filter as a JSON string (e.g. \'{"up.country":"US"}\'). Defaults to \'{}\'.',
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
  name: 'funnels_step_users',
  description: 'Return UIDs of users who reached a specific funnel step in the given period, via /o?method=funnel&users_for_step=. Requires the funnels plugin. For users who dropped off between two steps use funnels_dropoff_users.',
  inputSchema: {
    type: 'object',
    properties: {
      app_id: {
        type: 'string',
        description: 'Application ID. Either app_id or app_name must be provided; call apps_list first if you do not know it.',
      },
      app_name: {
        type: 'string',
        description: 'Application name (alternative to app_id). Must match an existing app exactly; call apps_list to find valid names.',
      },
      funnel_id: {
        type: 'string',
        description: 'Funnel identifier. Obtain it from funnels_list.',
      },
      step: {
        type: 'number',
        description: 'Zero-indexed step number to retrieve users for (0 = first step).',
      },
      period: {
        type: 'string',
        description: 'Time period. One of "month", "60days", "30days", "7days", "yesterday", "hour", or a custom range as [startMilliseconds,endMilliseconds]. Defaults to "30days".',
        default: '30days',
      },
      filter: {
        type: 'string',
        description: 'Optional MongoDB filter as a JSON string. Defaults to \'{}\'.',
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
  name: 'funnels_dropoff_users',
  description: 'Return UIDs of users who dropped off between two steps of a funnel, via /o?method=funnel&users_between_steps=. Requires the funnels plugin. For users who reached a single step use funnels_step_users.',
  inputSchema: {
    type: 'object',
    properties: {
      app_id: {
        type: 'string',
        description: 'Application ID. Either app_id or app_name must be provided; call apps_list first if you do not know it.',
      },
      app_name: {
        type: 'string',
        description: 'Application name (alternative to app_id). Must match an existing app exactly; call apps_list to find valid names.',
      },
      funnel_id: {
        type: 'string',
        description: 'Funnel identifier. Obtain it from funnels_list.',
      },
      from_step: {
        type: 'number',
        description: 'Starting zero-indexed step number. Use -1 for users who never entered the funnel.',
      },
      to_step: {
        type: 'number',
        description: 'Ending zero-indexed step the users dropped off from.',
      },
      period: {
        type: 'string',
        description: 'Time period. One of "month", "60days", "30days", "7days", "yesterday", "hour", or a custom range. Defaults to "30days".',
        default: '30days',
      },
      filter: {
        type: 'string',
        description: 'Optional MongoDB filter as a JSON string. Defaults to \'{}\'.',
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
  name: 'funnels_create',
  description: 'Create a new conversion funnel (ordered steps, per-step filters, session scope) via /i/funnels/add. Requires the funnels plugin. The queries, query_texts, and step_groups arrays are auto-padded to match steps.length when shorter.',
  inputSchema: {
    type: 'object',
    properties: {
      app_id: {
        type: 'string',
        description: 'Application ID. Either app_id or app_name must be provided; call apps_list first if you do not know it.',
      },
      app_name: {
        type: 'string',
        description: 'Application name (alternative to app_id). Must match an existing app exactly; call apps_list to find valid names.',
      },
      name: {
        type: 'string',
        description: 'Display name for the funnel.',
      },
      description: {
        type: 'string',
        description: 'Optional free-form description.',
      },
      type: {
        type: 'string',
        enum: ['session-independent', 'same-session'],
        description: 'Scope: "session-independent" (events can occur in any order of sessions) or "same-session" (all events must occur within one session). Defaults to "session-independent".',
        default: 'session-independent',
      },
      steps: {
        type: 'array',
        items: {
          type: 'string',
        },
        description: 'Ordered event keys that make up the funnel (e.g. ["[CLY]_session","Product Viewed","Added to Cart","Purchase"]).',
      },
      queries: {
        type: 'array',
        items: {
          type: 'string',
        },
        description: 'Per-step MongoDB filters as JSON strings; use "{}" for no filter (e.g. [\'{"up.country":"US"}\', \'{}\', \'{}\', \'{}\']). Defaults to [] (auto-expanded to "{}" per step).',
        default: [],
      },
      query_texts: {
        type: 'array',
        items: {
          type: 'string',
        },
        description: 'Per-step human-readable filter labels (e.g. ["Country = US","","",""]). Defaults to [] (auto-expanded to "" per step).',
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
        description: 'Per-step grouping rules: each entry has c ("and"/"or") and g (group index). Defaults to [] (auto-expanded to {c:"and",g:<step index>}).',
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
  name: 'funnels_update',
  description: 'Update an existing funnel (name, description, type, steps, filters, step groups) via /i/funnels/edit. Only supplied fields change; others are preserved. Requires the funnels plugin.',
  inputSchema: {
    type: 'object',
    properties: {
      app_id: {
        type: 'string',
        description: 'Application ID. Either app_id or app_name must be provided; call apps_list first if you do not know it.',
      },
      app_name: {
        type: 'string',
        description: 'Application name (alternative to app_id). Must match an existing app exactly; call apps_list to find valid names.',
      },
      funnel_id: {
        type: 'string',
        description: 'Funnel identifier to update. Obtain it from funnels_list.',
      },
      name: {
        type: 'string',
        description: 'New funnel name. Omit to keep current.',
      },
      description: {
        type: 'string',
        description: 'New description. Omit to keep current.',
      },
      type: {
        type: 'string',
        enum: ['session-independent', 'same-session'],
        description: 'New funnel scope. Omit to keep current.',
      },
      steps: {
        type: 'array',
        items: {
          type: 'string',
        },
        description: 'Replacement ordered list of event keys. Omit to keep current.',
      },
      queries: {
        type: 'array',
        items: {
          type: 'string',
        },
        description: 'Replacement per-step MongoDB filters (JSON strings). Omit to keep current.',
      },
      query_texts: {
        type: 'array',
        items: {
          type: 'string',
        },
        description: 'Replacement per-step human-readable filter labels. Omit to keep current.',
      },
      step_groups: {
        type: 'array',
        items: {
          type: 'object',
        },
        description: 'Replacement per-step grouping entries (see funnels_create.step_groups). Omit to keep current.',
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
  name: 'funnels_delete',
  description: 'Delete a funnel definition via /i/funnels/delete. Requires the funnels plugin. WARNING: irreversible.',
  inputSchema: {
    type: 'object',
    properties: {
      app_id: {
        type: 'string',
        description: 'Application ID. Either app_id or app_name must be provided; call apps_list first if you do not know it.',
      },
      app_name: {
        type: 'string',
        description: 'Application name (alternative to app_id). Must match an existing app exactly; call apps_list to find valid names.',
      },
      funnel_id: {
        type: 'string',
        description: 'Funnel identifier to delete. Obtain it from funnels_list.',
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
  getFunnelDataToolDefinition,
  getFunnelStepUsersToolDefinition,
  getFunnelDropoffUsersToolDefinition,
  createFunnelToolDefinition,
  updateFunnelToolDefinition,
  deleteFunnelToolDefinition,
];

export const funnelsToolHandlers = {
  'funnels_list': 'funnels_list',
  'funnels_data': 'funnels_data',
  'funnels_step_users': 'funnels_step_users',
  'funnels_dropoff_users': 'funnels_dropoff_users',
  'funnels_create': 'funnels_create',
  'funnels_update': 'funnels_update',
  'funnels_delete': 'funnels_delete',
} as const;

export class FunnelsTools {
  constructor(private context: ToolContext) {}

  async funnels_list(args: any): Promise<ToolResult> {
    return handleListFunnels(this.context, args);
  }

  async funnels_data(args: any): Promise<ToolResult> {
    return handleGetFunnelData(this.context, args);
  }

  async funnels_step_users(args: any): Promise<ToolResult> {
    return handleGetFunnelStepUsers(this.context, args);
  }

  async funnels_dropoff_users(args: any): Promise<ToolResult> {
    return handleGetFunnelDropoffUsers(this.context, args);
  }

  async funnels_create(args: any): Promise<ToolResult> {
    return handleCreateFunnel(this.context, args);
  }

  async funnels_update(args: any): Promise<ToolResult> {
    return handleUpdateFunnel(this.context, args);
  }

  async funnels_delete(args: any): Promise<ToolResult> {
    return handleDeleteFunnel(this.context, args);
  }
}

export const funnelsToolMetadata = {
  instanceKey: 'funnels',
  toolClass: FunnelsTools,
  handlers: funnelsToolHandlers,
} as const;
