/**
 * Journey tools: Countly Platform /v2 variants (/v2/journey_engine)
 *
 * On Platform every journey tool goes through /v2. This is required for
 * writes, not just nicer: a journey written by /v2 is owned by the new UI and
 * the legacy /i/journey-engine/* write endpoints refuse it (409
 * journey_managed_in_new_ui). Note the reverse: the first /v2 write on a
 * journey created in the old dashboard migrates it to the new UI for good.
 *
 * Block graphs keep the legacy wire shape (flat `version.blocks` array), so
 * journeys_create / journeys_update accept the same `blocks` JSON.
 *
 * Platform-only extras: journeys_complete, journeys_stats_blocks,
 * journeys_stats_content, journeys_stats_active_users, journeys_templates.
 */

import { jsonResult, v2ErrorResult, v2Request } from '../../lib/v2-api.js';
import type { ToolContext, ToolResult } from '../types.js';

const BASE = '/v2/journey_engine/journeys';

const appProps = {
  app_id: { type: 'string', description: 'Application ID. Either app_id or app_name must be provided; call apps_list first if you do not know it.' },
  app_name: { type: 'string', description: 'Application name (alternative to app_id). Must match an existing app exactly.' },
};
const journeyIdProp = {
  journey_id: { type: 'string', description: 'Journey definition ID. Obtain it from journeys_list.' },
};
const versionFilterProp = {
  version_id: { type: 'string', description: 'Journey version ID to restrict stats to. Omit for all versions.' },
};
const periodProp = {
  period: { type: 'string', description: 'Time period: "30days" (default), "7days", "60days", "90days", "month", "yesterday", "0days" for all time, or a custom range as "[startMs,endMs]".' },
};
const BLOCKS_DESCRIPTION = 'JSON-encoded array of journey blocks forming the version graph; call journeys_block_reference for the block schema (or journeys_templates for ready-made graphs). Each block: id (unique string), blockType ("trigger", "engagement", "logical", "data_pipeline", "end"), subType, nextBlock (id of the next block) and subtype-specific fields (filters, contentId, waitPeriod, eventKey, updateStatement, ...). The first block must be the trigger.';
const GOAL_PROPS = {
  goal_event_key: { type: 'string', description: 'Optional conversion goal: event key users should fire after entering the journey (not a [CLY]_journey_engine_* event). Pass an empty string to clear the goal.' },
  goal_window: { type: 'string', enum: ['1d', '7d', '30d', 'none'], description: 'How long after entering the goal event still counts. Defaults to "none" (no limit). Only used with goal_event_key.' },
};

const versionIdForAction = (action: string) => ({
  version_id: { type: 'string', description: `Journey version ID to ${action}. May be omitted when the journey has one matching version; journeys_get lists version IDs.` },
});

const lifecycleSchema = (action: string) => ({
  type: 'object',
  properties: { ...appProps, ...journeyIdProp, ...versionIdForAction(action) },
  required: ['journey_id'],
});

export const journeysV2ToolDefinitions: Record<string, any> = {
  journeys_list: {
    name: 'journeys_list',
    description: 'List journeys of an app with status, active version, channels, entry trigger and lifetime counters (users entered / engaged / completed / dropped off), paginated, plus counts per status. Requires the journey_engine plugin. For one journey with its block graph use journeys_get.',
    inputSchema: {
      type: 'object',
      properties: {
        ...appProps,
        status: { type: 'string', description: 'Optional status filter, comma-separated: "active", "draft", "paused", "pending_approval", "completed".' },
        search: { type: 'string', description: 'Case-insensitive substring filter on journey name.' },
        sort: { type: 'string', enum: ['name', 'status', 'created', 'updated'], description: 'Sort field. Defaults to "updated".' },
        direction: { type: 'string', enum: ['asc', 'desc'], description: 'Sort direction. Defaults to "desc".' },
        page: { type: 'number', description: '1-based page number. Defaults to 1.' },
        page_size: { type: 'number', description: 'Journeys per page. Defaults to 20.' },
      },
    },
  },
  journeys_get: {
    name: 'journeys_get',
    description: 'Get one journey: name, status, goal, the editing version (active one, or latest draft) with its block graph, and a summary of all versions. Requires the journey_engine plugin. To find journey IDs use journeys_list.',
    inputSchema: { type: 'object', properties: { ...appProps, ...journeyIdProp }, required: ['journey_id'] },
  },
  journeys_create: {
    name: 'journeys_create',
    description: 'Create a journey (definition plus a first draft version). It starts as "draft"; use journeys_publish to activate it. Requires the journey_engine plugin. To modify an existing journey use journeys_update.',
    inputSchema: {
      type: 'object',
      properties: {
        ...appProps,
        name: { type: 'string', description: 'Journey name (max 256 characters).' },
        description: { type: 'string', description: 'Optional journey description.' },
        blocks: { type: 'string', description: BLOCKS_DESCRIPTION },
        skip_threshold: { type: 'number', description: 'Maximum journey instances per user. 0 or omitted means no limit.' },
        ...GOAL_PROPS,
      },
      required: ['name', 'blocks'],
    },
  },
  journeys_update: {
    name: 'journeys_update',
    description: 'Update a journey: name, description, per-user limit, goal, and/or the block graph of one version. Only supplied fields change. Journeys pending approval cannot be edited. Requires the journey_engine plugin. A journey created in the old dashboard is taken over by the new UI on its first edit here.',
    inputSchema: {
      type: 'object',
      properties: {
        ...appProps,
        ...journeyIdProp,
        version_id: { type: 'string', description: 'Version whose blocks are replaced. Defaults to the editing version (active one, or latest draft). Only used with blocks.' },
        name: { type: 'string', description: 'New journey name. Omit to keep current.' },
        description: { type: 'string', description: 'New description. Omit to keep current.' },
        blocks: { type: 'string', description: `${BLOCKS_DESCRIPTION} Replaces the version's blocks entirely. Omit to keep current.` },
        skip_threshold: { type: 'number', description: 'Maximum journey instances per user; 0 means no limit. Omit to keep current.' },
        ...GOAL_PROPS,
      },
      required: ['journey_id'],
    },
  },
  journeys_delete: {
    name: 'journeys_delete',
    description: 'Delete a journey and all its versions (soft delete; it disappears from lists and stats). Requires the journey_engine plugin. To find journey IDs use journeys_list.',
    inputSchema: { type: 'object', properties: { ...appProps, ...journeyIdProp }, required: ['journey_id'] },
  },
  journeys_publish: {
    name: 'journeys_publish',
    description: 'Publish (activate) a journey version after validating its blocks; publishing a paused version resumes it. With maker-checker approval enabled, the journey goes to "pending_approval" instead. Requires the journey_engine plugin. To stop a journey use journeys_pause or journeys_complete.',
    inputSchema: lifecycleSchema('publish (defaults to the only version, or the only draft)'),
  },
  journeys_pause: {
    name: 'journeys_pause',
    description: 'Pause an active journey version: running instances are parked and queued content is cleared. Requires the journey_engine plugin. Use journeys_resume to continue.',
    inputSchema: lifecycleSchema('pause (defaults to the active version)'),
  },
  journeys_resume: {
    name: 'journeys_resume',
    description: 'Resume a paused journey version, setting it back to active; parked instances continue. Requires the journey_engine plugin.',
    inputSchema: lifecycleSchema('resume (defaults to the paused version)'),
  },
  journeys_stats_summary: {
    name: 'journeys_stats_summary',
    description: 'Journey KPIs for a period: users entered, engaged, completed and dropped off (events and unique users) with % change vs the previous period, plus goal conversion when the journey has a goal. Requires the journey_engine plugin. For a daily series use journeys_stats_performance.',
    inputSchema: { type: 'object', properties: { ...appProps, ...journeyIdProp, ...versionFilterProp, ...periodProp }, required: ['journey_id'] },
  },
  journeys_stats_performance: {
    name: 'journeys_stats_performance',
    description: 'Daily journey series for a period (yearly for all time): users entered, engaged, completed, dropped off, and goal conversions when a goal is set. Requires the journey_engine plugin. For totals use journeys_stats_summary.',
    inputSchema: { type: 'object', properties: { ...appProps, ...journeyIdProp, ...versionFilterProp, ...periodProp }, required: ['journey_id'] },
  },
  journeys_stats_table: {
    name: 'journeys_stats_table',
    description: 'Journey instances (one row per user run): user id, status, start / end time and user details, paginated. Requires the journey_engine plugin. For per-block counts use journeys_stats_blocks.',
    inputSchema: {
      type: 'object',
      properties: {
        ...appProps,
        ...journeyIdProp,
        ...versionFilterProp,
        status: { type: 'string', enum: ['running', 'completed', 'stopped', 'paused', 'error'], description: 'Optional instance status filter.' },
        ...periodProp,
        skip: { type: 'number', description: 'Rows to skip for paging. Defaults to 0.' },
        limit: { type: 'number', description: 'Rows to return. Defaults to 10.' },
        task_id: { type: 'string', description: 'Task id of a stored export created by the classic dashboard; pages through its result instead of live data.' },
      },
      required: ['journey_id'],
    },
  },
  journeys_stats_uids: {
    name: 'journeys_stats_uids',
    description: 'User UIDs behind one journey metric for a period (users who entered, engaged, completed, dropped off, or converted on the goal). Use user_profiles_get to inspect users afterwards. Requires the journey_engine plugin.',
    inputSchema: {
      type: 'object',
      properties: {
        ...appProps,
        ...journeyIdProp,
        uid_type: { type: 'string', enum: ['users_entered', 'users_engaged', 'users_completed', 'users_drop_off', 'goal_converted'], description: 'Which metric to list user UIDs for. goal_converted needs a journey goal.' },
        ...versionFilterProp,
        ...periodProp,
        limit: { type: 'number', description: 'Maximum UIDs to return. Defaults to 500.' },
      },
      required: ['journey_id', 'uid_type'],
    },
  },
};

/** Platform-only journey tools */
export const journeysPlatformToolDefinitions = [
  {
    name: 'journeys_complete',
    description: 'End an active or paused journey for good: it takes no new entries and cannot be restarted (duplicate it instead). With maker-checker approval enabled, the journey goes to "pending_approval" first. Requires the journey_engine plugin. Countly Platform only. To stop temporarily use journeys_pause.',
    inputSchema: lifecycleSchema('complete (defaults to the active or paused version)'),
  },
  {
    name: 'journeys_stats_blocks',
    description: 'Per-block journey funnel for a period: executions, unique users entered and completed for every block, with the average time users reached it (blocks sorted in reach order). Combines all versions. Requires the journey_engine plugin. Countly Platform only.',
    inputSchema: { type: 'object', properties: { ...appProps, ...journeyIdProp, ...periodProp }, required: ['journey_id'] },
  },
  {
    name: 'journeys_stats_content',
    description: 'In-app content engagement of a journey for a period: per content message, impressions and users shown, interactions and users interacted, and clicks per button. Requires the journey_engine plugin. Countly Platform only.',
    inputSchema: { type: 'object', properties: { ...appProps, ...journeyIdProp, ...versionFilterProp, ...periodProp }, required: ['journey_id'] },
  },
  {
    name: 'journeys_stats_active_users',
    description: 'Users currently active in a journey for a period, with the previous period and % change; optionally broken down by day, week or month. Requires the journey_engine plugin. Countly Platform only.',
    inputSchema: {
      type: 'object',
      properties: {
        ...appProps,
        ...journeyIdProp,
        ...versionFilterProp,
        ...periodProp,
        interval: { type: 'string', enum: ['daily', 'weekly', 'monthly'], description: 'Optional breakdown interval. Omit for totals only.' },
      },
      required: ['journey_id'],
    },
  },
  {
    name: 'journeys_templates',
    description: 'Ready-made journey templates (onboarding, re-engagement, ...). Without template_id lists them with their use case, channels and steps; with template_id returns that template\'s block graph, usable as the blocks of journeys_create (fill in contentId for in-app blocks). Requires the journey_engine plugin. Countly Platform only.',
    inputSchema: {
      type: 'object',
      properties: {
        template_id: { type: 'string', description: 'Template id from the list, to get its blocks.' },
      },
    },
  },
];

// ── helpers ──────────────────────────────────────────────

const errorText = (text: string): ToolResult & { isError: true } => ({ content: [{ type: 'text', text }], isError: true });
const iso = (ms: unknown): string | undefined => (typeof ms === 'number' && ms > 0 ? new Date(ms).toISOString() : undefined);

function parseBlocks(blocks: unknown): unknown[] {
  let parsed: unknown;
  try {
    parsed = typeof blocks === 'string' ? JSON.parse(blocks) : blocks;
  } catch (error) {
    throw new Error(`Invalid blocks JSON - ${error instanceof Error ? error.message : 'parse error'}`);
  }
  if (!Array.isArray(parsed)) {
    throw new Error('Invalid blocks JSON - blocks must be an array');
  }
  return parsed;
}

function goalFromArgs(args: any): Record<string, unknown> | null | undefined {
  if (args.goal_event_key === undefined) {
    return undefined;
  }
  if (args.goal_event_key === '' || args.goal_event_key === null) {
    return null;
  }
  return { eventKey: String(args.goal_event_key), window: args.goal_window || 'none' };
}

function statsParams(app_id: string, args: any, defaults: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    app_id,
    period: args.period || '30days',
    ...(args.version_id ? { journeyVersionId: args.version_id } : {}),
    ...defaults,
  };
}

const getDetail = (context: ToolContext, app_id: string, id: string) =>
  v2Request<any>(context, 'get', `${BASE}/${encodeURIComponent(id)}`, { params: { app_id } });

/** Pick the version a lifecycle action targets, mirroring the legacy tools */
export function pickVersion(detail: any, versionId: string | undefined, statuses: string[]): { id?: string; error?: string } {
  if (versionId) {
    return { id: versionId };
  }
  const versions: any[] = Array.isArray(detail?.versions) ? detail.versions : [];
  if (versions.length === 1) {
    return { id: versions[0]._id };
  }
  const matching = versions.filter((v) => statuses.includes(v.status));
  if (matching.length === 1) {
    return { id: matching[0]._id };
  }
  const available = versions.map((v) => `- version_id: ${v._id} (version ${v.version}, status: ${v.status})`).join('\n');
  return { error: `Error: Could not pick a version (${matching.length === 0 ? `none with status ${statuses.join(' or ')}` : 'several match'}). Provide version_id explicitly. Available versions:\n${available || '(none)'}` };
}

function compactVersion(v: any): any {
  const { created, ...rest } = v;
  return { ...rest, created: iso(created) };
}

// ── handlers ─────────────────────────────────────────────

export async function handleListJourneysV2(context: ToolContext, args: any): Promise<ToolResult> {
  try {
    const app_id = await context.resolveAppId(args);
    const data = await v2Request<any>(context, 'get', BASE, {
      params: {
        app_id,
        page: Math.max(1, Number(args.page ?? 1)),
        pageSize: Math.max(1, Number(args.page_size ?? 20)),
        ...(args.status ? { status: args.status } : {}),
        ...(args.search ? { search: args.search } : {}),
        ...(args.sort ? { sort: args.sort } : {}),
        ...(args.direction ? { direction: args.direction } : {}),
      },
    });
    const journeys = (data.items || []).map((j: any) => ({
      id: j._id,
      name: j.name,
      description: j.description || undefined,
      status: j.status,
      legacy: j.legacy || undefined,
      activeVersion: j.activeVersion,
      activeVersionId: j.activeVersionId || undefined,
      versionCount: j.versionCount,
      channels: j.channels?.length ? j.channels : undefined,
      trigger: j.triggerBlock,
      externalTrigger: j.externalTrigger,
      createdBy: j.createdByName || j.createdBy,
      created: iso(j.created),
      updated: iso(j.updated),
      metrics: j.metrics,
    }));
    return jsonResult(
      `Journeys for app ${app_id} (page ${data.page}, ${data.total} total)`,
      { counts: data.counts, journeys }
    );
  } catch (error) {
    return v2ErrorResult('list journeys', error);
  }
}

export async function handleGetJourneyV2(context: ToolContext, args: any): Promise<ToolResult> {
  try {
    const app_id = await context.resolveAppId(args);
    const d = await getDetail(context, app_id, args.journey_id);
    return jsonResult(`Journey ${args.journey_id}`, {
      ...d,
      created: iso(d.created),
      updated: iso(d.updated),
      version: d.version ? compactVersion(d.version) : undefined,
      versions: (d.versions || []).map(compactVersion),
    });
  } catch (error) {
    return v2ErrorResult('get journey', error);
  }
}

export async function handleCreateJourneyV2(context: ToolContext, args: any): Promise<ToolResult> {
  try {
    const app_id = await context.resolveAppId(args);
    const blocks = parseBlocks(args.blocks);
    const goal = goalFromArgs(args);
    const created = await v2Request<any>(context, 'post', BASE, {
      params: { app_id },
      body: {
        app_id,
        name: args.name,
        ...(args.description !== undefined ? { description: args.description } : {}),
        ...(args.skip_threshold !== undefined ? { skip_threshold: args.skip_threshold } : {}),
        ...(goal ? { goal } : {}),
        version: { blocks },
      },
    });
    return jsonResult('Journey created', {
      id: created._id,
      name: created.name,
      status: created.status,
      versionId: created.version?._id ?? created.activeVersionId,
      versions: (created.versions || []).map((v: any) => ({ id: v._id, version: v.version, status: v.status })),
    });
  } catch (error) {
    return v2ErrorResult('create journey', error);
  }
}

export async function handleUpdateJourneyV2(context: ToolContext, args: any): Promise<ToolResult> {
  try {
    const app_id = await context.resolveAppId(args);
    const body: Record<string, unknown> = {};
    for (const key of ['name', 'description', 'skip_threshold'] as const) {
      if (args[key] !== undefined) {
        body[key] = args[key];
      }
    }
    const goal = goalFromArgs(args);
    if (goal !== undefined) {
      body.goal = goal;
    }
    if (args.blocks !== undefined) {
      const blocks = parseBlocks(args.blocks);
      const versionId = args.version_id || (await getDetail(context, app_id, args.journey_id)).version?._id;
      if (!versionId) {
        return errorText('Error: The journey has no editable version; provide version_id.');
      }
      body.version = { _id: versionId, blocks };
    }
    if (Object.keys(body).length === 0) {
      return errorText('Error: Nothing to update. Provide at least one of name, description, blocks, skip_threshold or goal_event_key.');
    }
    const d = await v2Request<any>(context, 'patch', `${BASE}/${encodeURIComponent(args.journey_id)}`, { params: { app_id }, body });
    return jsonResult('Journey updated', {
      id: d._id,
      name: d.name,
      status: d.status,
      goal: d.goal ?? undefined,
      version: d.version ? { id: d.version._id, version: d.version.version, status: d.version.status, blockCount: d.version.blocks?.length } : undefined,
      updated: iso(d.updated),
    });
  } catch (error) {
    return v2ErrorResult('update journey', error);
  }
}

export async function handleDeleteJourneyV2(context: ToolContext, args: any): Promise<ToolResult> {
  try {
    const app_id = await context.resolveAppId(args);
    await v2Request(context, 'delete', `${BASE}/${encodeURIComponent(args.journey_id)}`, { params: { app_id } });
    return jsonResult('Journey deleted', { id: args.journey_id, deleted: true });
  } catch (error) {
    return v2ErrorResult('delete journey', error);
  }
}

const LIFECYCLE_STATUSES: Record<string, string[]> = {
  publish: ['draft'],
  pause: ['active'],
  resume: ['paused'],
  complete: ['active', 'paused'],
};

export async function handleJourneyLifecycleV2(
  context: ToolContext,
  args: any,
  action: 'publish' | 'pause' | 'resume' | 'complete'
): Promise<ToolResult> {
  try {
    if (action === 'publish' && args.status === 'draft') {
      return errorText('Error: Countly Platform cannot unpublish a journey back to draft. Use journeys_pause to stop it temporarily, or journeys_complete to end it.');
    }
    const app_id = await context.resolveAppId(args);
    let versionId = args.version_id as string | undefined;
    if (!versionId) {
      const detail = await getDetail(context, app_id, args.journey_id);
      const picked = action === 'pause' && detail.activeVersionId
        ? { id: detail.activeVersionId as string }
        : pickVersion(detail, undefined, LIFECYCLE_STATUSES[action]);
      if (!picked.id) {
        return errorText(picked.error || 'Error: Could not resolve journey version.');
      }
      versionId = picked.id;
    }
    const result = await v2Request<any>(context, 'post', `${BASE}/${encodeURIComponent(args.journey_id)}/${action}`, {
      params: { app_id, versionId },
      body: { versionId },
    });
    const pending = result?.outcome === 'pending_approval';
    return jsonResult(pending ? `Journey ${action} submitted for approval` : `Journey ${action} done`, result);
  } catch (error) {
    return v2ErrorResult(`${action} journey`, error);
  }
}

export async function handleJourneyStatsSummaryV2(context: ToolContext, args: any): Promise<ToolResult> {
  try {
    const app_id = await context.resolveAppId(args);
    const data = await v2Request<any>(context, 'get', `${BASE}/${encodeURIComponent(args.journey_id)}/stats/summary`, { params: statsParams(app_id, args) });
    return jsonResult(`Journey ${args.journey_id} summary (${args.period || '30days'})`, data);
  } catch (error) {
    return v2ErrorResult('get journey stats summary', error);
  }
}

export async function handleJourneyStatsPerformanceV2(context: ToolContext, args: any): Promise<ToolResult> {
  try {
    const app_id = await context.resolveAppId(args);
    const data = await v2Request<Record<string, any>>(context, 'get', `${BASE}/${encodeURIComponent(args.journey_id)}/stats/performance`, { params: statsParams(app_id, args) });
    const series = Object.keys(data || {})
      .sort()
      .map((date) => ({ date: date.replace(/\./g, '-'), ...data[date] }));
    return jsonResult(`Journey ${args.journey_id} performance (${args.period || '30days'})`, series);
  } catch (error) {
    return v2ErrorResult('get journey performance stats', error);
  }
}

export async function handleJourneyInstancesV2(context: ToolContext, args: any): Promise<ToolResult> {
  try {
    const app_id = await context.resolveAppId(args);
    const limit = Math.max(1, Number(args.limit ?? 10));
    const skip = Math.max(0, Number(args.skip ?? 0));
    const data = await v2Request<any>(context, 'get', `${BASE}/${encodeURIComponent(args.journey_id)}/instances`, {
      params: statsParams(app_id, args, {
        page: Math.floor(skip / limit) + 1,
        pageSize: limit,
        ...(args.status ? { status: args.status } : {}),
        ...(args.task_id ? { taskId: args.task_id } : {}),
      }),
    });
    if (typeof data?.taskId === 'string' && !Array.isArray(data.rows)) {
      return jsonResult('Instances are being exported', { status: 'computing', task_id: data.taskId, note: 'Call journeys_stats_table again with task_id in a little while.' });
    }
    const rows = (data.rows || []).map((r: any) => ({
      uid: r.appUserId,
      status: r.status,
      start: iso(r.startTime),
      end: iso(r.endTime),
      ...(r.userDetails ? {
        user: {
          name: r.userDetails.name,
          email: r.userDetails.email,
          deviceId: r.userDetails.did,
          lastSeen: typeof r.userDetails.lac === 'number' ? new Date(r.userDetails.lac * 1000).toISOString() : undefined,
        },
      } : {}),
    }));
    return jsonResult(`Journey ${args.journey_id} instances (${data.total} total, page ${data.page})`, rows);
  } catch (error) {
    return v2ErrorResult('get journey instances', error);
  }
}

export async function handleJourneyStatsUidsV2(context: ToolContext, args: any): Promise<ToolResult> {
  try {
    const app_id = await context.resolveAppId(args);
    const limit = Math.max(1, Number(args.limit ?? 500));
    const data = await v2Request<any>(context, 'get', `${BASE}/${encodeURIComponent(args.journey_id)}/stats/uids`, {
      params: statsParams(app_id, args, {
        uidType: args.uid_type,
        ...(args.uid_type === 'goal_converted' ? { limit } : {}),
      }),
    });
    const uids: string[] = Array.isArray(data?.uids) ? data.uids : [];
    const total = data?.total ?? uids.length;
    return jsonResult(
      `${args.uid_type} uids for journey ${args.journey_id} (${total} total${uids.length > limit ? `, first ${limit} shown` : ''})`,
      uids.slice(0, limit)
    );
  } catch (error) {
    return v2ErrorResult('get journey user UIDs', error);
  }
}

export async function handleJourneyStatsBlocksV2(context: ToolContext, args: any): Promise<ToolResult> {
  try {
    const app_id = await context.resolveAppId(args);
    const data = await v2Request<any>(context, 'get', `${BASE}/${encodeURIComponent(args.journey_id)}/stats/blocks`, { params: statsParams(app_id, args) });
    const blocks = [...(data?.blocks || [])]
      .sort((a: any, b: any) => (a.avgStartTime ?? Infinity) - (b.avgStartTime ?? Infinity))
      .map(({ avgStartTime, ...b }: any) => ({ ...b, avgReachedAt: iso(avgStartTime === undefined ? undefined : Math.round(avgStartTime)) }));
    return jsonResult(`Journey ${args.journey_id} per-block stats (${args.period || '30days'})`, blocks);
  } catch (error) {
    return v2ErrorResult('get journey block stats', error);
  }
}

export async function handleJourneyStatsContentV2(context: ToolContext, args: any): Promise<ToolResult> {
  try {
    const app_id = await context.resolveAppId(args);
    const data = await v2Request<any>(context, 'get', `${BASE}/${encodeURIComponent(args.journey_id)}/stats/content`, { params: statsParams(app_id, args) });
    return jsonResult(`Journey ${args.journey_id} content engagement (${args.period || '30days'})`, data?.content ?? []);
  } catch (error) {
    return v2ErrorResult('get journey content stats', error);
  }
}

export async function handleJourneyStatsActiveUsersV2(context: ToolContext, args: any): Promise<ToolResult> {
  try {
    const app_id = await context.resolveAppId(args);
    const path = `${BASE}/${encodeURIComponent(args.journey_id)}/stats/active-users`;
    const totals = await v2Request<any>(context, 'get', path, { params: statsParams(app_id, args) });
    const result: Record<string, unknown> = { ...totals };
    if (args.interval) {
      const detail = await v2Request<any>(context, 'get', `${path}/detail`, { params: statsParams(app_id, args, { interval: args.interval }) });
      result.breakdown = detail?.items ?? [];
    }
    return jsonResult(`Journey ${args.journey_id} active users (${args.period || '30days'})`, result);
  } catch (error) {
    return v2ErrorResult('get journey active users', error);
  }
}

export async function handleJourneyTemplatesV2(context: ToolContext, args: any): Promise<ToolResult> {
  try {
    const data = await v2Request<any>(context, 'get', '/v2/journey_engine/templates');
    const items: any[] = data?.items || [];
    if (args.template_id) {
      const t = items.find((x) => x.id === args.template_id);
      if (!t) {
        return errorText(`Error: Template "${args.template_id}" not found. Available: ${items.map((x) => x.id).join(', ')}`);
      }
      return jsonResult(`Journey template ${t.id}`, { id: t.id, name: t.name, description: t.description, blocks: t.blocks });
    }
    return jsonResult(`Journey templates (${items.length})`, items.map((t) => ({
      id: t.id,
      name: t.name,
      description: t.description,
      stage: t.stage,
      useCase: t.useCase,
      channels: t.channels,
      steps: (t.flowSteps || []).map((s: any) => s.label).join(' -> '),
    })));
  } catch (error) {
    return v2ErrorResult('list journey templates', error);
  }
}
