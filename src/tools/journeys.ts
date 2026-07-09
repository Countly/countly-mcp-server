import { ToolContext, ToolResult } from './types.js';
import { withDefault } from '../lib/validation.js';
import { safeApiCall } from '../lib/error-handler.js';

/**
 * Journeys Module
 *
 * Tools for managing user journeys (journey engine) - automated multi-step
 * engagement flows built from trigger, logical, engagement and data-pipeline
 * blocks. Requires the 'journey_engine' plugin (Countly Enterprise).
 *
 * A journey consists of a journey definition (name-level entity) and one or
 * more versions. Each version holds the block graph. Write endpoints
 * (/i/journey-engine/journeys/*) expect a JSON request body; read endpoints
 * (/o/journey-engine/*) use query parameters.
 */

interface JourneyVersionSummary {
  _id: string;
  version?: number;
  status?: string;
  blocks?: unknown[];
  skip_threshold?: number | null;
}

/**
 * Fetch a journey definition (including its versions) by id.
 */
async function fetchJourney(
  context: ToolContext,
  appId: string,
  journeyId: string
): Promise<any> {
  const response = await safeApiCall(
    () => context.httpClient.get('/o/journey-engine/journey', {
      params: {
        app_id: appId,
        id: journeyId,
      },
    }),
    'Failed to get journey'
  );
  return response.data;
}

/**
 * Resolve which version of a journey to act on. When version_id is omitted
 * and the journey has exactly one candidate version (optionally filtered by
 * status), that version is used. Otherwise returns an error message listing
 * the available versions so the caller can pick one explicitly.
 */
function resolveVersion(
  journey: any,
  versionId: string | undefined,
  statusFilter?: string
): { version?: JourneyVersionSummary; error?: string } {
  const versions: JourneyVersionSummary[] = Array.isArray(journey?.versions) ? journey.versions : [];
  const available = versions
    .map((v) => `- version_id: ${v._id} (version ${v.version}, status: ${v.status})`)
    .join('\n');

  if (versionId) {
    const version = versions.find((v) => v._id === versionId);
    if (version) {
      return { version };
    }
    return {
      error: `Error: Version "${versionId}" not found on this journey. Available versions:\n${available || '(none)'}`,
    };
  }

  const candidates = statusFilter
    ? versions.filter((v) => v.status === statusFilter)
    : versions;

  if (candidates.length === 1) {
    return { version: candidates[0] };
  }

  const reason = candidates.length === 0
    ? (statusFilter ? `No version with status "${statusFilter}" found.` : 'The journey has no versions.')
    : (statusFilter
      ? `Multiple versions with status "${statusFilter}" found.`
      : 'The journey has multiple versions.');
  return {
    error: `Error: ${reason} Provide version_id explicitly. Available versions:\n${available || '(none)'}`,
  };
}

// ============================================================================
// LIST JOURNEYS TOOL
// ============================================================================

export const listJourneysToolDefinition = {
  name: 'journeys_list',
  description: 'List journey definitions for an app via /o/journey-engine/list, including version summaries, status, and usage counters (usersEntered, flowsCompleted). Requires the journey_engine plugin (Countly Enterprise). For full details of one journey use journeys_get.',
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
      with_deleted: {
        type: 'boolean',
        description: 'When true, the response is an object with "active" and "deleted" journey lists instead of an array of active journeys. Defaults to false.',
        default: false,
      },
    },
  },
};

export async function handleListJourneys(
  context: ToolContext,
  input: Record<string, unknown>
): Promise<ToolResult> {
  const app_id = input.app_id as string | undefined;
  const app_name = input.app_name as string | undefined;
  const with_deleted = withDefault(input.with_deleted as boolean | undefined, false);

  const appId = await context.resolveAppId({ app_id, app_name });

  const queryParams: Record<string, string> = {
    app_id: appId,
  };
  if (with_deleted) {
    queryParams.withDeletedJourneys = 'true';
  }

  const response = await safeApiCall(
    () => context.httpClient.get('/o/journey-engine/list', { params: queryParams }),
    'Failed to list journeys'
  );

  return {
    content: [{ type: 'text', text: JSON.stringify(response.data, null, 2) }],
  };
}

// ============================================================================
// GET JOURNEY TOOL
// ============================================================================

export const getJourneyToolDefinition = {
  name: 'journeys_get',
  description: 'Get one journey definition by ID via /o/journey-engine/journey, including all versions with their block graphs, statuses, and computed counters. Requires the journey_engine plugin (Countly Enterprise). To find journey IDs use journeys_list.',
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
      journey_id: {
        type: 'string',
        description: 'Journey definition ID. Obtain it from journeys_list.',
      },
    },
    required: ['journey_id'],
  },
};

export async function handleGetJourney(
  context: ToolContext,
  input: Record<string, unknown>
): Promise<ToolResult> {
  const app_id = input.app_id as string | undefined;
  const app_name = input.app_name as string | undefined;
  const journey_id = input.journey_id as string;

  const appId = await context.resolveAppId({ app_id, app_name });

  const journey = await fetchJourney(context, appId, journey_id);

  return {
    content: [{ type: 'text', text: JSON.stringify(journey, null, 2) }],
  };
}

// ============================================================================
// CREATE JOURNEY TOOL
// ============================================================================

const BLOCKS_DESCRIPTION = 'JSON-encoded array of journey blocks forming the version graph. Each block is an object with: id (unique string, e.g. "block_1"), blockType ("trigger", "engagement", "logical", "data_pipeline", or "end"), subType (e.g. trigger: "incoming-data", "profile-update", "cohort-entry", "cohort-exit", "schedule", "webhook"; engagement: "in-app-content", "survey", "email"; logical: "wait-trigger", "wait-period", "wait-date", "continue-if", "switch", "repeat"; data_pipeline: "record-event", "update-profile", "call-webhook"), nextBlock (id of the next block), and subtype-specific fields such as filters (array of {key, conditions} for triggers), contentId (for in-app-content blocks), eventKey (for record-event blocks), or updateStatement (array of single-key objects for update-profile blocks).';

export const createJourneyToolDefinition = {
  name: 'journeys_create',
  description: 'Create a new journey (definition plus first draft version) via POST /i/journey-engine/journeys/save. The journey is created in "draft" status; use journeys_publish to activate it. Requires the journey_engine plugin (Countly Enterprise). To modify an existing journey use journeys_update.',
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
        description: 'Journey name. Must be unique per app among non-deleted journeys.',
      },
      blocks: {
        type: 'string',
        description: BLOCKS_DESCRIPTION,
      },
      skip_threshold: {
        type: 'number',
        description: 'Maximum journey instances per user for this version. 0 or omitted means no limit.',
      },
    },
    required: ['name', 'blocks'],
  },
};

export async function handleCreateJourney(
  context: ToolContext,
  input: Record<string, unknown>
): Promise<ToolResult> {
  const app_id = input.app_id as string | undefined;
  const app_name = input.app_name as string | undefined;
  const name = input.name as string;
  const blocks = input.blocks as string;
  const skip_threshold = input.skip_threshold as number | undefined;

  const appId = await context.resolveAppId({ app_id, app_name });

  let blocksArray;
  try {
    blocksArray = JSON.parse(blocks);
    if (!Array.isArray(blocksArray)) {
      throw new Error('blocks must be an array');
    }
  } catch (error) {
    return {
      content: [{
        type: 'text',
        text: `Error: Invalid blocks JSON - ${error instanceof Error ? error.message : 'Unknown error'}`,
      }],
    };
  }

  const payload: Record<string, unknown> = {
    app_id: appId,
    name,
    version: {
      blocks: blocksArray,
    },
  };
  if (skip_threshold !== undefined) {
    payload.skip_threshold = skip_threshold;
  }

  const response = await safeApiCall(
    () => context.httpClient.post('/i/journey-engine/journeys/save', payload, {
      params: { app_id: appId },
    }),
    'Failed to create journey'
  );

  return {
    content: [{ type: 'text', text: JSON.stringify(response.data, null, 2) }],
  };
}

// ============================================================================
// UPDATE JOURNEY TOOL
// ============================================================================

export const updateJourneyToolDefinition = {
  name: 'journeys_update',
  description: 'Update an existing journey definition and one of its versions via POST /i/journey-engine/journeys/save. Only supplied fields change; the name and blocks are preserved from the current journey when omitted. Requires the journey_engine plugin (Countly Enterprise). Journeys pending approval cannot be edited.',
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
      journey_id: {
        type: 'string',
        description: 'Journey definition ID to update. Obtain it from journeys_list.',
      },
      version_id: {
        type: 'string',
        description: 'Journey version ID whose blocks should be updated. May be omitted when the journey has exactly one version; call journeys_get to list version IDs.',
      },
      name: {
        type: 'string',
        description: 'New journey name (unique per app). Omit to keep current.',
      },
      blocks: {
        type: 'string',
        description: `${BLOCKS_DESCRIPTION} Omit to keep the current blocks of the selected version.`,
      },
      skip_threshold: {
        type: 'number',
        description: 'Maximum journey instances per user for this version. 0 means no limit. Omit to keep current.',
      },
    },
    required: ['journey_id'],
  },
};

export async function handleUpdateJourney(
  context: ToolContext,
  input: Record<string, unknown>
): Promise<ToolResult> {
  const app_id = input.app_id as string | undefined;
  const app_name = input.app_name as string | undefined;
  const journey_id = input.journey_id as string;
  const version_id = input.version_id as string | undefined;
  const name = input.name as string | undefined;
  const blocks = input.blocks as string | undefined;
  const skip_threshold = input.skip_threshold as number | undefined;

  const appId = await context.resolveAppId({ app_id, app_name });

  // Fetch the existing journey to preserve fields not being updated and to
  // resolve the target version.
  const existingJourney = await fetchJourney(context, appId, journey_id);

  const { version, error } = resolveVersion(existingJourney, version_id);
  if (error || !version) {
    return {
      content: [{ type: 'text', text: error || 'Error: Could not resolve journey version.' }],
    };
  }

  let blocksArray: unknown[] | undefined;
  if (blocks !== undefined) {
    try {
      blocksArray = JSON.parse(blocks);
      if (!Array.isArray(blocksArray)) {
        throw new Error('blocks must be an array');
      }
    } catch (parseError) {
      return {
        content: [{
          type: 'text',
          text: `Error: Invalid blocks JSON - ${parseError instanceof Error ? parseError.message : 'Unknown error'}`,
        }],
      };
    }
  }

  const payload: Record<string, unknown> = {
    _id: journey_id,
    app_id: appId,
    name: name !== undefined ? name : existingJourney.name,
    version: {
      _id: version._id,
      blocks: blocksArray !== undefined ? blocksArray : (version.blocks || []),
    },
  };

  if (skip_threshold !== undefined) {
    payload.skip_threshold = skip_threshold;
  } else if (version.skip_threshold !== undefined && version.skip_threshold !== null) {
    payload.skip_threshold = version.skip_threshold;
  }

  const response = await safeApiCall(
    () => context.httpClient.post('/i/journey-engine/journeys/save', payload, {
      params: { app_id: appId },
    }),
    'Failed to update journey'
  );

  return {
    content: [{ type: 'text', text: JSON.stringify(response.data, null, 2) }],
  };
}

// ============================================================================
// DELETE JOURNEY TOOL
// ============================================================================

export const deleteJourneyToolDefinition = {
  name: 'journeys_delete',
  description: 'Soft-delete a journey definition and all its versions via /i/journey-engine/delete (status is set to "deleted"). Requires the journey_engine plugin (Countly Enterprise). To find journey IDs use journeys_list.',
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
      journey_id: {
        type: 'string',
        description: 'Journey definition ID to delete. Obtain it from journeys_list.',
      },
    },
    required: ['journey_id'],
  },
};

export async function handleDeleteJourney(
  context: ToolContext,
  input: Record<string, unknown>
): Promise<ToolResult> {
  const app_id = input.app_id as string | undefined;
  const app_name = input.app_name as string | undefined;
  const journey_id = input.journey_id as string;

  const appId = await context.resolveAppId({ app_id, app_name });

  const response = await safeApiCall(
    () => context.httpClient.post('/i/journey-engine/delete', null, {
      params: {
        app_id: appId,
        id: journey_id,
      },
    }),
    'Failed to delete journey'
  );

  return {
    content: [{ type: 'text', text: JSON.stringify(response.data, null, 2) }],
  };
}

// ============================================================================
// PUBLISH JOURNEY TOOL
// ============================================================================

export const publishJourneyToolDefinition = {
  name: 'journeys_publish',
  description: 'Publish (activate) or unpublish (set back to draft) a journey version via POST /i/journey-engine/journeys/publish. Publishing validates the block graph and activates the version; other versions of the same journey become drafts. Requires the journey_engine plugin (Countly Enterprise). On servers with journey approval enabled, publishing may set the journey to "pending_approval" instead.',
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
      journey_id: {
        type: 'string',
        description: 'Journey definition ID. Obtain it from journeys_list.',
      },
      version_id: {
        type: 'string',
        description: 'Journey version ID to publish or unpublish. May be omitted when the journey has exactly one version; call journeys_get to list version IDs.',
      },
      status: {
        type: 'string',
        enum: ['active', 'draft'],
        description: 'Target status: "active" publishes the version, "draft" unpublishes it. Defaults to "active".',
        default: 'active',
      },
    },
    required: ['journey_id'],
  },
};

export async function handlePublishJourney(
  context: ToolContext,
  input: Record<string, unknown>
): Promise<ToolResult> {
  const app_id = input.app_id as string | undefined;
  const app_name = input.app_name as string | undefined;
  const journey_id = input.journey_id as string;
  const version_id = input.version_id as string | undefined;
  const status = withDefault(input.status as string | undefined, 'active');

  const appId = await context.resolveAppId({ app_id, app_name });

  let resolvedVersionId = version_id;
  if (!resolvedVersionId) {
    const journey = await fetchJourney(context, appId, journey_id);
    const { version, error } = resolveVersion(journey, undefined);
    if (error || !version) {
      return {
        content: [{ type: 'text', text: error || 'Error: Could not resolve journey version.' }],
      };
    }
    resolvedVersionId = version._id;
  }

  const response = await safeApiCall(
    () => context.httpClient.post('/i/journey-engine/journeys/publish', {
      journeyId: journey_id,
      versionId: resolvedVersionId,
      status,
    }, {
      params: { app_id: appId },
    }),
    'Failed to publish journey'
  );

  return {
    content: [{ type: 'text', text: JSON.stringify(response.data, null, 2) }],
  };
}

// ============================================================================
// PAUSE JOURNEY TOOL
// ============================================================================

export const pauseJourneyToolDefinition = {
  name: 'journeys_pause',
  description: 'Pause an active journey version via POST /i/journey-engine/journeys/pause. Running journey instances are paused and queued content is cleared. Requires the journey_engine plugin (Countly Enterprise). Use journeys_resume to continue a paused journey.',
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
      journey_id: {
        type: 'string',
        description: 'Journey definition ID. Obtain it from journeys_list.',
      },
      version_id: {
        type: 'string',
        description: 'Journey version ID to pause. May be omitted when the journey has exactly one active version; call journeys_get to list version IDs.',
      },
    },
    required: ['journey_id'],
  },
};

export async function handlePauseJourney(
  context: ToolContext,
  input: Record<string, unknown>
): Promise<ToolResult> {
  const app_id = input.app_id as string | undefined;
  const app_name = input.app_name as string | undefined;
  const journey_id = input.journey_id as string;
  const version_id = input.version_id as string | undefined;

  const appId = await context.resolveAppId({ app_id, app_name });

  let resolvedVersionId = version_id;
  if (!resolvedVersionId) {
    const journey = await fetchJourney(context, appId, journey_id);
    const { version, error } = resolveVersion(journey, undefined, 'active');
    if (error || !version) {
      return {
        content: [{ type: 'text', text: error || 'Error: Could not resolve journey version.' }],
      };
    }
    resolvedVersionId = version._id;
  }

  const response = await safeApiCall(
    () => context.httpClient.post('/i/journey-engine/journeys/pause', {
      journeyId: journey_id,
      versionId: resolvedVersionId,
    }, {
      params: { app_id: appId },
    }),
    'Failed to pause journey'
  );

  return {
    content: [{ type: 'text', text: JSON.stringify(response.data, null, 2) }],
  };
}

// ============================================================================
// RESUME JOURNEY TOOL
// ============================================================================

export const resumeJourneyToolDefinition = {
  name: 'journeys_resume',
  description: 'Resume a paused journey version via POST /i/journey-engine/journeys/resume, setting it back to active. Paused instances continue and wait timers are recalculated. Requires the journey_engine plugin (Countly Enterprise).',
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
      journey_id: {
        type: 'string',
        description: 'Journey definition ID. Obtain it from journeys_list.',
      },
      version_id: {
        type: 'string',
        description: 'Journey version ID to resume. May be omitted when the journey has exactly one paused version; call journeys_get to list version IDs.',
      },
    },
    required: ['journey_id'],
  },
};

export async function handleResumeJourney(
  context: ToolContext,
  input: Record<string, unknown>
): Promise<ToolResult> {
  const app_id = input.app_id as string | undefined;
  const app_name = input.app_name as string | undefined;
  const journey_id = input.journey_id as string;
  const version_id = input.version_id as string | undefined;

  const appId = await context.resolveAppId({ app_id, app_name });

  let resolvedVersionId = version_id;
  if (!resolvedVersionId) {
    const journey = await fetchJourney(context, appId, journey_id);
    const { version, error } = resolveVersion(journey, undefined, 'paused');
    if (error || !version) {
      return {
        content: [{ type: 'text', text: error || 'Error: Could not resolve journey version.' }],
      };
    }
    resolvedVersionId = version._id;
  }

  const response = await safeApiCall(
    () => context.httpClient.post('/i/journey-engine/journeys/resume', {
      journeyId: journey_id,
      versionId: resolvedVersionId,
    }, {
      params: { app_id: appId },
    }),
    'Failed to resume journey'
  );

  return {
    content: [{ type: 'text', text: JSON.stringify(response.data, null, 2) }],
  };
}

// ============================================================================
// Export Combined Arrays
// ============================================================================

export const journeysToolDefinitions = [
  listJourneysToolDefinition,
  getJourneyToolDefinition,
  createJourneyToolDefinition,
  updateJourneyToolDefinition,
  deleteJourneyToolDefinition,
  publishJourneyToolDefinition,
  pauseJourneyToolDefinition,
  resumeJourneyToolDefinition,
];

export const journeysToolHandlers = {
  'journeys_list': 'journeys_list',
  'journeys_get': 'journeys_get',
  'journeys_create': 'journeys_create',
  'journeys_update': 'journeys_update',
  'journeys_delete': 'journeys_delete',
  'journeys_publish': 'journeys_publish',
  'journeys_pause': 'journeys_pause',
  'journeys_resume': 'journeys_resume',
} as const;

export class JourneysTools {
  constructor(private context: ToolContext) {}

  async journeys_list(args: any): Promise<ToolResult> {
    return handleListJourneys(this.context, args);
  }

  async journeys_get(args: any): Promise<ToolResult> {
    return handleGetJourney(this.context, args);
  }

  async journeys_create(args: any): Promise<ToolResult> {
    return handleCreateJourney(this.context, args);
  }

  async journeys_update(args: any): Promise<ToolResult> {
    return handleUpdateJourney(this.context, args);
  }

  async journeys_delete(args: any): Promise<ToolResult> {
    return handleDeleteJourney(this.context, args);
  }

  async journeys_publish(args: any): Promise<ToolResult> {
    return handlePublishJourney(this.context, args);
  }

  async journeys_pause(args: any): Promise<ToolResult> {
    return handlePauseJourney(this.context, args);
  }

  async journeys_resume(args: any): Promise<ToolResult> {
    return handleResumeJourney(this.context, args);
  }
}

export const journeysToolMetadata = {
  instanceKey: 'journeys',
  toolClass: JourneysTools,
  handlers: journeysToolHandlers,
} as const;
