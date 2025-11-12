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
  name: 'list_cohorts',
  description: 'List all user cohorts with filtering and pagination. Cohorts are groups of users based on behavior or manually created segments.',
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
      type: {
        type: 'string',
        enum: ['auto', 'manual'],
        description: 'Filter by cohort type (auto for behavioral cohorts, manual for manually created cohorts)',
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

export async function handleListCohorts(
  context: ToolContext,
  input: Record<string, unknown>
): Promise<ToolResult> {
  const app_id = input.app_id as string | undefined;
  const app_name = input.app_name as string | undefined;
  const type = input.type as string | undefined;
  const skip = withDefault(input.skip as number | undefined, 0);
  const limit = withDefault(input.limit as number | undefined, 10);

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

  const response = await safeApiCall(
    () => context.httpClient.get('/o', { params: queryParams }),
    'Failed to list cohorts'
  );

  return {
    content: [{ type: 'text', text: JSON.stringify(response.data, null, 2) }],
  };
}

// ============================================================================
// GET COHORT TOOL
// ============================================================================

export const getCohortToolDefinition = {
  name: 'get_cohort',
  description: 'Get detailed information about a specific cohort including its configuration, user count, and current state.',
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
      cohort_id: {
        type: 'string',
        description: 'Cohort ID to retrieve',
      },
    },
    required: ['cohort_id'],
  },
};

export async function handleGetCohort(
  context: ToolContext,
  input: Record<string, unknown>
): Promise<ToolResult> {
  const app_id = input.app_id as string | undefined;
  const app_name = input.app_name as string | undefined;
  const cohort_id = input.cohort_id as string;

  const appId = await context.resolveAppId({ app_id, app_name });

  const response = await safeApiCall(
    () => context.httpClient.get('/o', {
      params: {
        app_id: appId,
        method: 'get_cohort',
        cohort: cohort_id,
      },
    }),
    'Failed to get cohort'
  );

  return {
    content: [{ type: 'text', text: JSON.stringify(response.data, null, 2) }],
  };
}

// ============================================================================
// CREATE COHORT TOOL
// ============================================================================

export const createCohortToolDefinition = {
  name: 'create_cohort',
  description: 'Create a new behavioral cohort based on user actions and properties. Define steps with events users did or did not perform, with time periods and filters.',
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
        description: 'Cohort name',
      },
      description: {
        type: 'string',
        description: 'Cohort description',
      },
      visibility: {
        type: 'string',
        enum: ['global', 'private'],
        description: 'Cohort visibility (global = visible to all, private = only to creator)',
        default: 'global',
      },
      steps: {
        type: 'string',
        description: 'JSON string array of behavioral steps. Each step must have: type ("did" or "didnot"), event (event key like "[CLY]_session" or "[CLY]_view"), times (JSON string like "{\\"$gte\\":1}"), period (like "7days" or "0days" for all time), query (MongoDB filter JSON string for additional filters like "{\\"up.av\\":{\\"$in\\":[\\"5:10:0\\"]}}"), queryText (human readable description), group (step group number starting from 0), conj ("and" or "or" conjunction)',
      },
      user_segmentation: {
        type: 'string',
        description: 'Optional JSON string with additional user property filters. Format: {"query": {...MongoDB filter...}, "queryText": "human readable description"}',
      },
      shared_email_edit: {
        type: 'array',
        items: {
          type: 'string',
        },
        description: 'Array of email addresses to share edit access with',
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
  name: 'update_cohort',
  description: 'Update an existing cohort configuration including name, description, steps, and sharing settings.',
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
      cohort_id: {
        type: 'string',
        description: 'Cohort ID to update',
      },
      name: {
        type: 'string',
        description: 'New cohort name',
      },
      description: {
        type: 'string',
        description: 'New cohort description',
      },
      visibility: {
        type: 'string',
        enum: ['global', 'private'],
        description: 'Cohort visibility',
      },
      steps: {
        type: 'string',
        description: 'JSON string array of behavioral steps (same format as create_cohort)',
      },
      user_segmentation: {
        type: 'string',
        description: 'JSON string with user property filters',
      },
      shared_email_edit: {
        type: 'array',
        items: {
          type: 'string',
        },
        description: 'Array of email addresses to share edit access with',
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
  name: 'delete_cohort',
  description: 'Delete a cohort. This action cannot be undone.',
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
      cohort_id: {
        type: 'string',
        description: 'Cohort ID to delete',
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
  getCohortToolDefinition,
  createCohortToolDefinition,
  updateCohortToolDefinition,
  deleteCohortToolDefinition,
];

export const cohortsToolHandlers = {
  list_cohorts: 'handleListCohorts',
  get_cohort: 'handleGetCohort',
  create_cohort: 'handleCreateCohort',
  update_cohort: 'handleUpdateCohort',
  delete_cohort: 'handleDeleteCohort',
} as const;

export class CohortsTools {
  constructor(private context: ToolContext) {}

  async list_cohorts(args: any): Promise<ToolResult> {
    return handleListCohorts(this.context, args);
  }

  async get_cohort(args: any): Promise<ToolResult> {
    return handleGetCohort(this.context, args);
  }

  async create_cohort(args: any): Promise<ToolResult> {
    return handleCreateCohort(this.context, args);
  }

  async update_cohort(args: any): Promise<ToolResult> {
    return handleUpdateCohort(this.context, args);
  }

  async delete_cohort(args: any): Promise<ToolResult> {
    return handleDeleteCohort(this.context, args);
  }
}

export const cohortsToolMetadata = {
  instanceKey: 'cohorts',
  toolClass: CohortsTools,
  handlers: cohortsToolHandlers,
} as const;
