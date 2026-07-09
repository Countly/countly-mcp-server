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

const BLOCKS_DESCRIPTION = 'JSON-encoded array of journey blocks forming the version graph. Call journeys_block_reference first for the full block schema, field requirements, and sample graphs. Each block is an object with: id (unique string, e.g. "block_1"), blockType ("trigger", "engagement", "logical", "data_pipeline", or "end"), subType (e.g. trigger: "incoming-data", "profile-update", "cohort-entry", "cohort-exit", "schedule", "webhook"; engagement: "in-app-content", "survey", "email"; logical: "wait-trigger", "wait-period", "wait-date", "continue-if", "switch", "repeat"; data_pipeline: "record-event", "update-profile", "call-webhook"), nextBlock (id of the next block), and subtype-specific fields such as filters (array of {key, conditions} for triggers), contentId (for in-app-content blocks), eventKey (for record-event blocks), or updateStatement (array of single-key objects for update-profile blocks).';

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
// JOURNEY BLOCK REFERENCE TOOL
// ============================================================================

const JOURNEY_BLOCK_REFERENCE = `# Countly Journey Engine - blocks schema reference

Reference for authoring the "blocks" array used by journeys_create and journeys_update
(POST /i/journey-engine/journeys/save). Derived from the journey engine source
(enums, runtime execution code, and the publish-time validator).

## Block common fields

- "id" (string, required): unique block id within the journey; used as the link target.
- "blockType" (string, required): one of "trigger", "engagement", "logical", "data_pipeline", "end".
- "subType" (string, required for every block except "end"): see per-type lists below.
- "nextBlock" (string, optional): id of the next block to execute. This is the ONLY linking
  field the engine reads for linear flow; if absent, the journey ends after this block.
  (Legacy samples use "next_block" - the engine does NOT read that; always use "nextBlock".)

The FIRST block (blocks[0]) must be the trigger; the engine matches journeys by
blocks[0].blockType == "trigger" and blocks[0].subType.

Branching blocks link differently: "continue-if" uses "nextBlocks" (array),
"switch" uses per-condition "nextBlock" entries inside "conditions".

## blockType: trigger

Valid subType values and when they fire:
- "incoming-data": any incoming SDK data (sessions, views, custom events, crashes,
  surveys, star ratings, NPS, push actions, consent)
- "cohort-entry" / "cohort-exit": user enters/exits an auto cohort
- "profile-group-entry" / "profile-group-exit": user enters/exits a manual profile group
- "profile-update": user profile updated
- "journey-exit": user exits another journey

Fields:
- "filters" (array, required): filter objects, OR-combined (any match fires the trigger).
- "nextBlock" (string): first block after entry.

Filter format - each element is either:
1. A raw MongoDB-style query object matched against the incoming data, e.g.
   {"key": "Login"} or {"$or": [{"cohort": "cohort1"}, {"cohort": "cohort2"}]}
2. A {key, conditions} object - "key" is merged with the fields of "conditions"
   into a single query, e.g. {"key": "[CLY]_session", "conditions": {"up.av": {"$in": ["1.0"]}}}

## blockType: engagement

subType values: "in-app-content", "survey", "push-notificatiion" (note the enum's spelling), "email".
Only "in-app-content" is fully implemented ("survey" sends content then waits for a
response; "push-notificatiion" and "email" are stubs with no runtime effect).

"in-app-content" fields:
- "contentId" (string, required): content block id (see content_blocks_list).
- "priority" (number, optional): push priority, defaults to 3 (low).
- "expiration_type" (string, optional): "exact" or "dynamic".
- "expiration_date" (string/date, optional): absolute expiry when expiration_type is "exact".
- "duration" (string, optional): relative duration, e.g. "2d2h2m2s".
- "nextBlock" (string, optional): journey completes here if omitted.

## blockType: logical

subType values: "wait-period", "wait-date", "wait-trigger", "continue-if", "switch",
"repeat" ("repeat" is declared but not implemented - do not use).

wait-period / wait-date:
- "untilDate" (number, ms epoch): absolute resume time (wait-date). Takes precedence.
- "waitPeriod" (number, ms): relative delay (wait-period).
- "nextBlock" (string, required): block to run when the wait elapses.

wait-trigger:
- "filters" (array, required): same format as trigger filters; a matching event
  for the user resumes the journey.
- "nextBlock" (string, required).

continue-if:
- "condition" (object, required): MongoDB-style query evaluated against journey data.
- "nextBlocks" (array of strings, required): [ifTrueBlockId, ifFalseBlockId].
  Index 0 runs when true, index 1 when false. With only one element and a false
  condition, the user is dropped.

switch:
- "conditions" (array, required): ordered list of {"condition": <query>, "nextBlock": <id>}.
  First matching condition wins; if none match, the user is dropped.

## blockType: data_pipeline

subType values: "record-event", "update-profile", "call-webhook", "run-code".
"call-webhook" and "run-code" are NOT implemented - executing them errors the journey.

record-event:
- "eventKey" (string, required): non-empty, must not start with "." or "$"
  (runtime also rejects keys containing ".").
- "nextBlock" (string, optional).

update-profile:
- "updateStatement" (array, required): non-empty; each element is an object with
  EXACTLY ONE key/value pair. A {"custom": {...}} statement merges into the user's
  custom properties; any other key sets a top-level profile field.
  Example: [{"name": "VIP"}, {"custom": {"tier": "gold"}}]
- "nextBlock" (string, optional).

## blockType: end

Terminal block: {"id": "block_9", "blockType": "end"}. Note: the publish-time
validator requires a subType on every block it sees, so journeys commonly end by
omitting "nextBlock" on the last functional block instead of using an explicit
end block.

## Hard validation rules (enforced at publish, not at save)

- "blocks" must be an array; every block must have a "subType".
- record-event: "eventKey" required, non-empty, not starting with "." or "$".
- update-profile: "updateStatement" required, non-empty array, each element an
  object with exactly one non-empty string key.
- Link integrity (nextBlock ids existing) is NOT validated - double-check ids.

## Sample 1 - minimal journey (trigger -> in-app content)

\`\`\`json
[
  {"id": "block_1", "blockType": "trigger", "subType": "incoming-data",
   "filters": [{"key": "Login"}], "nextBlock": "block_2"},
  {"id": "block_2", "blockType": "engagement", "subType": "in-app-content",
   "contentId": "<content_block_id>", "priority": 1}
]
\`\`\`

## Sample 2 - trigger -> wait -> engagement with branching

\`\`\`json
[
  {"id": "block_1", "blockType": "trigger", "subType": "incoming-data",
   "filters": [{"key": "Start"}], "nextBlock": "block_2"},
  {"id": "block_2", "blockType": "logical", "subType": "wait-period",
   "waitPeriod": 86400000, "nextBlock": "block_3"},
  {"id": "block_3", "blockType": "logical", "subType": "continue-if",
   "condition": {"$or": [{"AccountType": "Business"}, {"Country": "NL"}]},
   "nextBlocks": ["block_4", "block_5"]},
  {"id": "block_4", "blockType": "engagement", "subType": "in-app-content",
   "contentId": "<content_block_id>", "priority": 1},
  {"id": "block_5", "blockType": "data_pipeline", "subType": "update-profile",
   "updateStatement": [{"custom": {"segment": "other"}}]}
]
\`\`\`
`;

export const journeyBlockReferenceToolDefinition = {
  name: 'journeys_block_reference',
  description: 'Get the reference documentation for the journey block JSON schema: block types, subtypes, per-subtype fields, filter/condition formats, validation rules, and complete sample block graphs. Call this BEFORE authoring the blocks parameter of journeys_create or journeys_update. Static documentation - makes no server request.',
  inputSchema: {
    type: 'object',
    properties: {},
  },
};

export async function handleJourneyBlockReference(
  _context: ToolContext,
  _input: Record<string, unknown>
): Promise<ToolResult> {
  return {
    content: [{ type: 'text', text: JOURNEY_BLOCK_REFERENCE }],
  };
}

// ============================================================================
// JOURNEY STATS TOOLS
// ============================================================================

const STATS_PERIOD_DESCRIPTION = 'Time period, e.g. "30days", "7days", "hour", "month", "60days", or "0days" for all time. Defaults to all time.';

export const journeyStatsSummaryToolDefinition = {
  name: 'journeys_stats_summary',
  description: 'Get summary KPIs for a journey via /o/journey-engine/stats/summary: users entered, engaged, completed, dropped off, content viewed/interacted, with change vs the previous period. Requires the journey_engine plugin (Countly Enterprise). For per-block breakdowns use journeys_stats_table.',
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
        description: 'Journey version ID to restrict stats to. Omit for all versions.',
      },
      period: {
        type: 'string',
        description: STATS_PERIOD_DESCRIPTION,
      },
    },
    required: ['journey_id'],
  },
};

export async function handleJourneyStatsSummary(
  context: ToolContext,
  input: Record<string, unknown>
): Promise<ToolResult> {
  const appId = await context.resolveAppId({
    app_id: input.app_id as string | undefined,
    app_name: input.app_name as string | undefined,
  });

  const queryParams: Record<string, string> = {
    app_id: appId,
    journeyDefinitionId: input.journey_id as string,
  };
  if (input.version_id) {
    queryParams.journeyVersionId = input.version_id as string;
  }
  if (input.period) {
    queryParams.period = input.period as string;
  }

  const response = await safeApiCall(
    () => context.httpClient.get('/o/journey-engine/stats/summary', { params: queryParams }),
    'Failed to get journey stats summary'
  );

  return {
    content: [{ type: 'text', text: JSON.stringify(response.data, null, 2) }],
  };
}

export const journeyStatsTableToolDefinition = {
  name: 'journeys_stats_table',
  description: 'Get the per-block journey statistics table via /o/journey-engine/stats/table (block-by-block user counts with pagination). Long-running queries may return a task id instead of data; re-call this tool with task_id to fetch the result. Requires the journey_engine plugin (Countly Enterprise).',
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
        description: 'Journey version ID to restrict stats to. Omit for all versions.',
      },
      status: {
        type: 'string',
        description: 'Optional journey instance status filter, e.g. "running", "completed", "stopped", "paused", "error".',
      },
      period: {
        type: 'string',
        description: STATS_PERIOD_DESCRIPTION,
      },
      skip: {
        type: 'number',
        description: 'Number of rows to skip for pagination. Defaults to 0.',
        default: 0,
      },
      limit: {
        type: 'number',
        description: 'Maximum number of rows to return. Defaults to 10.',
        default: 10,
      },
      task_id: {
        type: 'string',
        description: 'Task ID returned by a previous call whose query ran long. Provide it to fetch the completed result instead of starting a new query.',
      },
    },
    required: ['journey_id'],
  },
};

export async function handleJourneyStatsTable(
  context: ToolContext,
  input: Record<string, unknown>
): Promise<ToolResult> {
  const appId = await context.resolveAppId({
    app_id: input.app_id as string | undefined,
    app_name: input.app_name as string | undefined,
  });
  const skip = withDefault(input.skip as number | undefined, 0);
  const limit = withDefault(input.limit as number | undefined, 10);

  const queryParams: Record<string, string> = {
    app_id: appId,
    journeyDefinitionId: input.journey_id as string,
    iDisplayStart: skip.toString(),
    iDisplayLength: limit.toString(),
    sEcho: '1',
  };
  if (input.version_id) {
    queryParams.journeyVersionId = input.version_id as string;
  }
  if (input.status) {
    queryParams.status = input.status as string;
  }
  if (input.period) {
    queryParams.period = input.period as string;
  }
  if (input.task_id) {
    queryParams.taskId = input.task_id as string;
  }

  const response = await safeApiCall(
    () => context.httpClient.get('/o/journey-engine/stats/table', { params: queryParams }),
    'Failed to get journey stats table'
  );

  return {
    content: [{ type: 'text', text: JSON.stringify(response.data, null, 2) }],
  };
}

export const journeyStatsPerformanceToolDefinition = {
  name: 'journeys_stats_performance',
  description: 'Get time-series journey performance data via /o/journey-engine/stats/performance (daily entered/engaged/completed/drop-off counts for charting trends). Requires the journey_engine plugin (Countly Enterprise). For headline totals use journeys_stats_summary.',
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
        description: 'Journey version ID to restrict stats to. Omit for all versions.',
      },
      period: {
        type: 'string',
        description: STATS_PERIOD_DESCRIPTION,
      },
    },
    required: ['journey_id'],
  },
};

export async function handleJourneyStatsPerformance(
  context: ToolContext,
  input: Record<string, unknown>
): Promise<ToolResult> {
  const appId = await context.resolveAppId({
    app_id: input.app_id as string | undefined,
    app_name: input.app_name as string | undefined,
  });

  const queryParams: Record<string, string> = {
    app_id: appId,
    journeyDefinitionId: input.journey_id as string,
  };
  if (input.version_id) {
    queryParams.journeyVersionId = input.version_id as string;
  }
  if (input.period) {
    queryParams.period = input.period as string;
  }

  const response = await safeApiCall(
    () => context.httpClient.get('/o/journey-engine/stats/performance', { params: queryParams }),
    'Failed to get journey performance stats'
  );

  return {
    content: [{ type: 'text', text: JSON.stringify(response.data, null, 2) }],
  };
}

export const journeyStatsUidsToolDefinition = {
  name: 'journeys_stats_uids',
  description: 'Get the list of user UIDs in a journey stat bucket via /o/journey-engine/stats/uids (e.g. all users who entered, completed, or dropped off). Use user_profiles_get to inspect individual users afterwards. Requires the journey_engine plugin (Countly Enterprise).',
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
      uid_type: {
        type: 'string',
        enum: ['users_entered', 'users_engaged', 'users_completed', 'content_viewed', 'content_interacted', 'users_drop_off'],
        description: 'Which stat bucket to list user UIDs for.',
      },
      version_id: {
        type: 'string',
        description: 'Journey version ID to restrict stats to. Omit for all versions.',
      },
      period: {
        type: 'string',
        description: STATS_PERIOD_DESCRIPTION,
      },
    },
    required: ['journey_id', 'uid_type'],
  },
};

export async function handleJourneyStatsUids(
  context: ToolContext,
  input: Record<string, unknown>
): Promise<ToolResult> {
  const appId = await context.resolveAppId({
    app_id: input.app_id as string | undefined,
    app_name: input.app_name as string | undefined,
  });

  const queryParams: Record<string, string> = {
    app_id: appId,
    journeyDefinitionId: input.journey_id as string,
    uidType: input.uid_type as string,
  };
  if (input.version_id) {
    queryParams.journeyVersionId = input.version_id as string;
  }
  if (input.period) {
    queryParams.period = input.period as string;
  }

  const response = await safeApiCall(
    () => context.httpClient.get('/o/journey-engine/stats/uids', { params: queryParams }),
    'Failed to get journey user UIDs'
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
  journeyStatsSummaryToolDefinition,
  journeyStatsTableToolDefinition,
  journeyStatsPerformanceToolDefinition,
  journeyStatsUidsToolDefinition,
  journeyBlockReferenceToolDefinition,
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
  'journeys_stats_summary': 'journeys_stats_summary',
  'journeys_stats_table': 'journeys_stats_table',
  'journeys_stats_performance': 'journeys_stats_performance',
  'journeys_stats_uids': 'journeys_stats_uids',
  'journeys_block_reference': 'journeys_block_reference',
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

  async journeys_stats_summary(args: any): Promise<ToolResult> {
    return handleJourneyStatsSummary(this.context, args);
  }

  async journeys_stats_table(args: any): Promise<ToolResult> {
    return handleJourneyStatsTable(this.context, args);
  }

  async journeys_stats_performance(args: any): Promise<ToolResult> {
    return handleJourneyStatsPerformance(this.context, args);
  }

  async journeys_stats_uids(args: any): Promise<ToolResult> {
    return handleJourneyStatsUids(this.context, args);
  }

  async journeys_block_reference(args: any): Promise<ToolResult> {
    return handleJourneyBlockReference(this.context, args);
  }
}

export const journeysToolMetadata = {
  instanceKey: 'journeys',
  toolClass: JourneysTools,
  handlers: journeysToolHandlers,
} as const;
