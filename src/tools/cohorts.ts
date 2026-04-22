import { ToolContext, ToolResult } from './types.js';
import { withDefault } from '../lib/validation.js';
import { safeApiCall } from '../lib/error-handler.js';

/**
 * Cohorts Module
 * 
 * Tools for managing user cohorts - groups of users based on behavior or metrics.
 * Requires the 'cohorts' plugin to be installed on the Countly server.
 */

// ============================================================================
// LIST COHORTS TOOL
// ============================================================================

export const listCohortsToolDefinition = {
  name: 'cohorts_list',
  description: 'List user cohorts (behavioral or manual user groupings) with pagination, type filter, and name search. Requires the cohorts plugin. For historical size data of a specific cohort use cohorts_data.',
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
      type: {
        type: 'string',
        enum: ['auto', 'manual'],
        description: 'Restrict results by cohort type: "auto" (behavioral, rebuilt continuously) or "manual" (static user lists). Omit for both.',
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
        description: 'Case-insensitive substring filter on cohort name.',
      },
    },
  },
};

export async function handleListCohorts(
  context: ToolContext,
  input: Record<string, unknown>
): Promise<ToolResult> {
  const app_id = input.app_id as string | undefined;
  const app_name = input.app_name as string | undefined;
  const type = input.type as string | undefined;
  const skip = withDefault(input.skip as number | undefined, 0);
  const limit = withDefault(input.limit as number | undefined, 10);
  const search = input.search as string | undefined;

  const appId = await context.resolveAppId({ app_id, app_name });

  const queryParams: Record<string, string> = {
    app_id: appId,
    method: 'get_cohorts',
    outputFormat: 'full',
    iDisplayStart: skip.toString(),
    iDisplayLength: limit.toString(),
    ready: 'true',
    sEcho: '0',
  };

  if (type) {
    queryParams.type = type;
  }
  if (search) {
    queryParams.sSearch = search;
  }

  const response = await safeApiCall(
    () => context.httpClient.get('/o', { params: queryParams }),
    'Failed to list cohorts'
  );

  return {
    content: [{ type: 'text', text: JSON.stringify(response.data, null, 2) }],
  };
}

// ============================================================================
// GET COHORT DATA TOOL
// ============================================================================

export const getCohortDataToolDefinition = {
  name: 'cohorts_data',
  description: 'Get time-series membership data for a single cohort over a period (how the cohort population evolved). Requires the cohorts plugin. To list available cohorts use cohorts_list.',
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
      cohort_id: {
        type: 'string',
        description: 'Cohort identifier to retrieve data for. Obtain it from cohorts_list.',
      },
      period: {
        type: 'string',
        description: 'Time period. One of "month", "60days", "30days", "7days", "yesterday", "hour", "12months", or a custom range as [startMilliseconds,endMilliseconds]. Defaults to "12months".',
        default: '12months',
      },
    },
    required: ['cohort_id'],
  },
};

export async function handleGetCohortData(
  context: ToolContext,
  input: Record<string, unknown>
): Promise<ToolResult> {
  const app_id = input.app_id as string | undefined;
  const app_name = input.app_name as string | undefined;
  const cohort_id = input.cohort_id as string;
  const period = withDefault(input.period as string | undefined, '12months');

  const appId = await context.resolveAppId({ app_id, app_name });

  const response = await safeApiCall(
    () => context.httpClient.get('/o', {
      params: {
        app_id: appId,
        method: 'cohortdata',
        cohorts: JSON.stringify([cohort_id]),
        period,
      },
    }),
    'Failed to get cohort data'
  );

  return {
    content: [{ type: 'text', text: JSON.stringify(response.data, null, 2) }],
  };
}

// ============================================================================
// CREATE COHORT TOOL
// ============================================================================

export const createCohortToolDefinition = {
  name: 'cohorts_create',
  description: 'Create a behavioral cohort from event-based steps plus optional user-property filters via /i/cohorts/add. Requires the cohorts plugin. For editing an existing cohort use cohorts_update.',
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
        description: 'Cohort display name.',
      },
      description: {
        type: 'string',
        description: 'Free-form cohort description shown in the UI.',
      },
      visibility: {
        type: 'string',
        enum: ['global', 'private'],
        description: 'Who can see the cohort: "global" (all dashboard users) or "private" (only the creator). Defaults to "global".',
        default: 'global',
      },
      steps: {
        type: 'string',
        description: 'JSON-encoded array of behavioral steps. Each step has: type ("did" or "didnot"), event (event key e.g. "[CLY]_session" or "[CLY]_view"), times (JSON string e.g. "{\\"$gte\\":1}"), period (e.g. "7days" or "0days" for all time), query (MongoDB filter JSON string e.g. "{\\"up.av\\":{\\"$in\\":[\\"5:10:0\\"]}}"), queryText (human-readable label), group (step-group number starting at 0), conj ("and" or "or").',
      },
      user_segmentation: {
        type: 'string',
        description: 'Optional JSON-encoded user-property filter: {"query":{<MongoDB filter>},"queryText":"<description>"}. Applied in addition to the behavioral steps.',
      },
      shared_email_edit: {
        type: 'array',
        items: {
          type: 'string',
        },
        description: 'Email addresses of dashboard users granted edit access. Defaults to [].',
        default: [],
      },
    },
    required: ['name', 'steps'],
  },
};

export async function handleCreateCohort(
  context: ToolContext,
  input: Record<string, unknown>
): Promise<ToolResult> {
  const app_id = input.app_id as string | undefined;
  const app_name = input.app_name as string | undefined;
  const name = input.name as string;
  const description = input.description as string | undefined;
  const visibility = withDefault(input.visibility as string | undefined, 'global');
  const steps = input.steps as string;
  const user_segmentation = input.user_segmentation as string | undefined;
  const shared_email_edit = withDefault(input.shared_email_edit as string[] | undefined, []);

  const appId = await context.resolveAppId({ app_id, app_name });

  // Validate JSON strings
  let stepsArray;
  try {
    stepsArray = JSON.parse(steps);
    if (!Array.isArray(stepsArray)) {
      throw new Error('steps must be an array');
    }
  } catch (error) {
    return {
      content: [{
        type: 'text',
        text: `Error: Invalid steps JSON - ${error instanceof Error ? error.message : 'Unknown error'}`,
      }],
    };
  }

  let userSegmentation;
  if (user_segmentation) {
    try {
      userSegmentation = JSON.parse(user_segmentation);
    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: `Error: Invalid user_segmentation JSON - ${error instanceof Error ? error.message : 'Unknown error'}`,
        }],
      };
    }
  }

  const requestParams: Record<string, string> = {
    app_id: appId,
    cohort_name: name,
    name: name,
    visibility: visibility,
    steps: JSON.stringify(stepsArray),
    shared_email_edit: JSON.stringify(shared_email_edit),
  };

  if (description) {
    requestParams.cohort_desc = description;
  }

  if (userSegmentation) {
    requestParams.user_segmentation = JSON.stringify(userSegmentation);
  }

  const response = await safeApiCall(
    () => context.httpClient.get('/i/cohorts/add', { params: requestParams }),
    'Failed to create cohort'
  );

  return {
    content: [{ type: 'text', text: JSON.stringify(response.data, null, 2) }],
  };
}

// ============================================================================
// UPDATE COHORT TOOL
// ============================================================================

export const updateCohortToolDefinition = {
  name: 'cohorts_update',
  description: 'Update an existing cohort via /i/cohorts/edit. Only supplied fields change; others are preserved from the current cohort. Requires the cohorts plugin.',
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
      cohort_id: {
        type: 'string',
        description: 'Cohort identifier to update. Obtain it from cohorts_list.',
      },
      name: {
        type: 'string',
        description: 'New cohort name. Omit to keep current.',
      },
      description: {
        type: 'string',
        description: 'New cohort description. Omit to keep current.',
      },
      visibility: {
        type: 'string',
        enum: ['global', 'private'],
        description: 'New visibility: "global" (everyone) or "private" (creator only). Omit to keep current.',
      },
      steps: {
        type: 'string',
        description: 'JSON-encoded behavioral steps array (same schema as cohorts_create.steps). Omit to keep current.',
      },
      user_segmentation: {
        type: 'string',
        description: 'JSON-encoded user-property filter {"query":{...},"queryText":"..."}. Omit to keep current.',
      },
      shared_email_edit: {
        type: 'array',
        items: {
          type: 'string',
        },
        description: 'Email addresses granted edit access. Omit to keep current list.',
      },
    },
    required: ['cohort_id'],
  },
};

export async function handleUpdateCohort(
  context: ToolContext,
  input: Record<string, unknown>
): Promise<ToolResult> {
  const app_id = input.app_id as string | undefined;
  const app_name = input.app_name as string | undefined;
  const cohort_id = input.cohort_id as string;
  const name = input.name as string | undefined;
  const description = input.description as string | undefined;
  const visibility = input.visibility as string | undefined;
  const steps = input.steps as string | undefined;
  const user_segmentation = input.user_segmentation as string | undefined;
  const shared_email_edit = input.shared_email_edit as string[] | undefined;

  const appId = await context.resolveAppId({ app_id, app_name });

  // First get the existing cohort to preserve fields not being updated
  const existingResponse = await safeApiCall(
    () => context.httpClient.get('/o', {
      params: {
        app_id: appId,
        method: 'get_cohort',
        cohort: cohort_id,
      },
    }),
    'Failed to get existing cohort'
  );

  const existingCohort = existingResponse.data;

  // Validate JSON strings if provided
  let stepsArray;
  if (steps) {
    try {
      stepsArray = JSON.parse(steps);
      if (!Array.isArray(stepsArray)) {
        throw new Error('steps must be an array');
      }
    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: `Error: Invalid steps JSON - ${error instanceof Error ? error.message : 'Unknown error'}`,
        }],
      };
    }
  }

  let userSegmentation;
  if (user_segmentation) {
    try {
      userSegmentation = JSON.parse(user_segmentation);
    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: `Error: Invalid user_segmentation JSON - ${error instanceof Error ? error.message : 'Unknown error'}`,
        }],
      };
    }
  }

  const requestParams: Record<string, string> = {
    _id: cohort_id,
    cohort_id: cohort_id,
    app_id: appId,
    name: name || existingCohort.name,
    cohort_name: name || existingCohort.name,
    type: existingCohort.type || 'auto',
    steps: stepsArray ? JSON.stringify(stepsArray) : JSON.stringify(existingCohort.steps || []),
    shared_email_edit: shared_email_edit ? JSON.stringify(shared_email_edit) : JSON.stringify(existingCohort.shared_email_edit || []),
    // Preserve existing fields
    owner_id: existingCohort.owner_id,
    creator: existingCohort.creator,
    created_at: existingCohort.created_at,
    stateChanged: existingCohort.stateChanged,
    state: existingCohort.state || 'live',
    result: existingCohort.result || '0',
  };

  if (description !== undefined) {
    requestParams.cohort_desc = description;
  } else if (existingCohort.cohort_desc) {
    requestParams.cohort_desc = existingCohort.cohort_desc;
  }

  if (visibility) {
    requestParams.visibility = visibility;
  } else if (existingCohort.visibility) {
    requestParams.visibility = existingCohort.visibility;
  }

  if (userSegmentation) {
    requestParams.user_segmentation = JSON.stringify(userSegmentation);
  } else if (existingCohort.user_segmentation) {
    requestParams.user_segmentation = JSON.stringify(existingCohort.user_segmentation);
  }

  if (existingCohort.creatorMember) {
    requestParams.creatorMember = existingCohort.creatorMember;
  }

  const response = await safeApiCall(
    () => context.httpClient.get('/i/cohorts/edit', { params: requestParams }),
    'Failed to update cohort'
  );

  return {
    content: [{ type: 'text', text: JSON.stringify(response.data, null, 2) }],
  };
}

// ============================================================================
// DELETE COHORT TOOL
// ============================================================================

export const deleteCohortToolDefinition = {
  name: 'cohorts_delete',
  description: 'Delete a cohort definition via /i/cohorts/delete. Requires the cohorts plugin. WARNING: irreversible.',
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
      cohort_id: {
        type: 'string',
        description: 'Cohort identifier to delete. Obtain it from cohorts_list.',
      },
    },
    required: ['cohort_id'],
  },
};

export async function handleDeleteCohort(
  context: ToolContext,
  input: Record<string, unknown>
): Promise<ToolResult> {
  const app_id = input.app_id as string | undefined;
  const app_name = input.app_name as string | undefined;
  const cohort_id = input.cohort_id as string;

  const appId = await context.resolveAppId({ app_id, app_name });

  const response = await safeApiCall(
    () => context.httpClient.get('/i/cohorts/delete', {
      params: {
        app_id: appId,
        cohort_id: cohort_id,
        ack: '0',
      },
    }),
    'Failed to delete cohort'
  );

  return {
    content: [{ type: 'text', text: JSON.stringify(response.data, null, 2) }],
  };
}

// ============================================================================
// Export Combined Arrays
// ============================================================================

export const cohortsToolDefinitions = [
  listCohortsToolDefinition,
  getCohortDataToolDefinition,
  createCohortToolDefinition,
  updateCohortToolDefinition,
  deleteCohortToolDefinition,
];

export const cohortsToolHandlers = {
  'cohorts_list': 'cohorts_list',
  'cohorts_data': 'cohorts_data',
  'cohorts_create': 'cohorts_create',
  'cohorts_update': 'cohorts_update',
  'cohorts_delete': 'cohorts_delete',
} as const;

export class CohortsTools {
  constructor(private context: ToolContext) {}

  async cohorts_list(args: any): Promise<ToolResult> {
    return handleListCohorts(this.context, args);
  }

  async cohorts_data(args: any): Promise<ToolResult> {
    return handleGetCohortData(this.context, args);
  }

  async cohorts_create(args: any): Promise<ToolResult> {
    return handleCreateCohort(this.context, args);
  }

  async cohorts_update(args: any): Promise<ToolResult> {
    return handleUpdateCohort(this.context, args);
  }

  async cohorts_delete(args: any): Promise<ToolResult> {
    return handleDeleteCohort(this.context, args);
  }
}

export const cohortsToolMetadata = {
  instanceKey: 'cohorts',
  toolClass: CohortsTools,
  handlers: cohortsToolHandlers,
} as const;
