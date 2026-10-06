/**
 * Platform Extras Tools
 *
 * Read-only tools for Countly Platform /v2 endpoints that have no legacy MCP
 * counterpart: user flows, rating widgets, campaigns, AI assistant analytics,
 * background tasks, notifications, geo locations, revenue IAP events and
 * crash Jira links. Listed only when the connected server serves /v2.
 */

import { jsonResult, V2ApiError, v2ErrorResult, v2Request } from '../lib/v2-api.js';
import type { ToolContext, ToolResult } from './types.js';

const appProps = {
  app_id: {
    type: 'string',
    description: 'Application ID. Either app_id or app_name must be provided; call apps_list first if you do not know it.',
  },
  app_name: {
    type: 'string',
    description: 'Application name (alternative to app_id). Must match an existing app exactly.',
  },
};

const periodProp = {
  period: {
    type: 'string',
    description: 'Time period: "today", "yesterday", "7days", "30days" (default), "90days", "month", or a custom range as "[startMs,endMs]".',
  },
};

const pagingProps = (def: number, max: number) => ({
  limit: { type: 'number', description: `Items per page (default ${def}, max ${max}).` },
  page: { type: 'number', description: 'Page number, 1-based (default 1).' },
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

const enc = encodeURIComponent;

function periodParam(period: unknown): string | undefined {
  if (period === undefined || period === null || period === '') {
    return undefined;
  }
  return typeof period === 'string' ? period : JSON.stringify(period);
}

/** Drop undefined, null and empty-string values */
function clean<T extends Record<string, unknown>>(obj: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined && v !== null && v !== '')
  ) as Partial<T>;
}

function iso(ts: unknown): string | undefined {
  if (ts === undefined || ts === null || ts === '' || ts === 0) {
    return undefined;
  }
  const date = typeof ts === 'number' ? new Date(ts) : new Date(String(ts));
  return Number.isNaN(date.getTime()) ? String(ts) : date.toISOString();
}

/** Countly HTML-escapes stored names; undo the common entities */
export function unescapeHtml(value: unknown): unknown {
  if (typeof value !== 'string') {
    return value;
  }
  return value
    .replace(/&#39;/g, '\'')
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

/**
 * Shrink a large payload for LLM use: arrays longer than `maxItems` are cut,
 * with a trailing note of how many were dropped, and daily series
 * ([{date, value}]) become a {date: value} map without zero days.
 */
export function compactPayload(value: unknown, maxItems: number): unknown {
  if (Array.isArray(value)) {
    const isSeries = value.length > 0 && value.every((x) => x && typeof x === 'object'
      && !Array.isArray(x) && Object.keys(x).length === 2 && 'date' in x && 'value' in x);
    if (isSeries) {
      const nonZero = value.filter((x: any) => x.value !== 0 && x.value !== null);
      return Object.fromEntries(nonZero.map((x: any) => [x.date, x.value]));
    }
    const items = value.slice(0, maxItems).map((x) => compactPayload(x, maxItems));
    if (value.length > maxItems) {
      items.push(`… ${value.length - maxItems} more`);
    }
    return items;
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, compactPayload(v, maxItems)])
    );
  }
  return value;
}

/** Epoch-ms range for a period string; defaults to the last 30 days */
export function periodToRange(period: unknown, now = Date.now()): { from: number; to: number } {
  const DAY = 86_400_000;
  const raw = periodParam(period) ?? '30days';
  if (raw.trim().startsWith('[')) {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length !== 2 || !parsed.every((n) => Number.isFinite(Number(n)))) {
      throw new Error('period range must be "[startMs,endMs]"');
    }
    return { from: Number(parsed[0]), to: Number(parsed[1]) };
  }
  const startOfToday = new Date(now);
  startOfToday.setUTCHours(0, 0, 0, 0);
  const today = startOfToday.getTime();
  if (raw === 'today') {
    return { from: today, to: now };
  }
  if (raw === 'yesterday') {
    return { from: today - DAY, to: today - 1 };
  }
  if (raw === 'month') {
    const start = new Date(today);
    start.setUTCDate(1);
    return { from: start.getTime(), to: now };
  }
  const days = /^(\d+)days$/.exec(raw);
  if (days) {
    return { from: today - (Number(days[1]) - 1) * DAY, to: now };
  }
  throw new Error(`Unsupported period "${raw}"`);
}

/** Drop-off step: "[CLY]_..." system key, custom event key, or a raw JSON step query */
export function toDropoffStep(step: unknown): Record<string, unknown> {
  if (step && typeof step === 'object' && !Array.isArray(step)) {
    return step as Record<string, unknown>;
  }
  const value = String(step ?? '').trim();
  if (!value) {
    throw new Error('steps must not contain empty values');
  }
  if (value.startsWith('{')) {
    return JSON.parse(value);
  }
  return value.startsWith('[CLY]_') ? { e: value } : { e: '[CLY]_custom', n: value };
}

// ─── Definitions ──────────────────────────────────────────────────────────────

export const flowsListTool = {
  name: 'flows_list',
  description: 'List saved user flows (path analyses) of an app: id, name, anchor event, direction, depth, period and calculation status. Countly Platform only.',
  inputSchema: {
    type: 'object',
    properties: {
      ...appProps,
      search: { type: 'string', description: 'Filter by flow name (case-insensitive).' },
      status: { type: 'string', enum: ['all', 'ready', 'calculating', 'error'], description: 'Filter by status (default all).' },
      limit: { type: 'number', description: 'Maximum number of flows (default 50).' },
      skip: { type: 'number', description: 'Number of flows to skip (default 0).' },
    },
    required: [],
  },
};

export const flowsGetTool = {
  name: 'flows_get',
  description: 'Definition of one saved flow: anchor, direction, depth, window, period, excluded events, status and creator. Countly Platform only.',
  inputSchema: {
    type: 'object',
    properties: { ...appProps, flow_id: { type: 'string', description: 'Flow id from flows_list.' } },
    required: ['flow_id'],
  },
};

export const flowsDataTool = {
  name: 'flows_data',
  description: 'Calculated result of a saved flow: per step away from the anchor event, the top events with user counts and share, plus the strongest transitions between them. Countly Platform only.',
  inputSchema: {
    type: 'object',
    properties: {
      ...appProps,
      flow_id: { type: 'string', description: 'Flow id from flows_list.' },
      max_steps: { type: 'number', description: 'Steps away from the anchor to include (default 5).' },
      top: { type: 'number', description: 'Events per step (default 5).' },
    },
    required: ['flow_id'],
  },
};

export const flowsDropoffTool = {
  name: 'flows_dropoff',
  description: 'What users did instead of an expected step: for users who did the given steps in order but NOT the "missing_step" afterwards, the top events they did next, with user and occurrence counts. Needs ClickHouse. Countly Platform only.',
  inputSchema: {
    type: 'object',
    properties: {
      ...appProps,
      steps: {
        type: 'array',
        items: { type: 'string' },
        description: 'Steps users did, in order (1-10). Each is a custom event key, a system key such as "[CLY]_session" or "[CLY]_view", or a raw JSON step query such as {"e":"[CLY]_view","n":"Home"} or with "sg.<segment>" / "up.<property>" filters.',
      },
      missing_step: { type: 'string', description: 'The step that did NOT follow (same format as steps).' },
      distance: { type: 'number', description: 'Other events allowed between consecutive steps and before the missing step (default 0 = directly next).' },
      window: { type: 'string', enum: ['any', 'session'], description: '"session" keeps the whole path inside one session (default "any").' },
      ...periodProp,
      limit: { type: 'number', description: 'Number of replacement events (default 5, max 100).' },
    },
    required: ['steps', 'missing_step'],
  },
};

export const ratingsWidgetsListTool = {
  name: 'ratings_widgets_list',
  description: 'List star-rating feedback widgets of an app with status, times shown, response count and average rating. Countly Platform only.',
  inputSchema: {
    type: 'object',
    properties: {
      ...appProps,
      active: { type: 'boolean', description: 'Only active (true) or inactive (false) widgets.' },
      search: { type: 'string', description: 'Filter by widget name/text.' },
      ...pagingProps(50, 200),
    },
    required: [],
  },
};

export const ratingsStatsTool = {
  name: 'ratings_stats',
  description: 'Response stats of one rating widget for a period: responses, average rating and the 1-5 distribution. Countly Platform only.',
  inputSchema: {
    type: 'object',
    properties: {
      ...appProps,
      widget_id: { type: 'string', description: 'Widget id from ratings_widgets_list.' },
      ...periodProp,
      platform: { type: 'string', description: 'Only responses from this platform, e.g. "iOS", "Android", "Web".' },
    },
    required: ['widget_id'],
  },
};

export const ratingsCommentsTool = {
  name: 'ratings_comments',
  description: 'Individual responses of one rating widget for a period, newest first: rating, comment, email and user id. Countly Platform only.',
  inputSchema: {
    type: 'object',
    properties: {
      ...appProps,
      widget_id: { type: 'string', description: 'Widget id from ratings_widgets_list.' },
      ...periodProp,
      search: { type: 'string', description: 'Filter comments by text.' },
      platform: { type: 'string', description: 'Only responses from this platform, e.g. "iOS", "Android", "Web".' },
      ...pagingProps(50, 200),
    },
    required: ['widget_id'],
  },
};

const CAMPAIGN_CHANNELS = ['push', 'in-app', 'survey', 'rating'];

export const campaignsListTool = {
  name: 'campaigns_list',
  description: 'List messaging campaigns of an app (push, in-app, survey, rating) with status, trigger type, send date and delivery counters, plus status counts. Countly Platform only.',
  inputSchema: {
    type: 'object',
    properties: {
      ...appProps,
      channel: { type: 'string', enum: CAMPAIGN_CHANNELS, description: 'Only this channel.' },
      status: {
        type: 'string',
        enum: ['draft', 'active', 'paused', 'pendingApproval', 'rejected', 'archived', 'scheduled', 'sending', 'sent', 'canceled', 'failed', 'completed'],
        description: 'Only this status.',
      },
      search: { type: 'string', description: 'Filter by campaign name.' },
      type: { type: 'string', description: 'Trigger kind(s), comma-separated: one-time, recurring, multi-day, on-event, on-cohort, api, always-on.' },
      ...pagingProps(50, 200),
    },
    required: [],
  },
};

export const campaignsGetTool = {
  name: 'campaigns_get',
  description: 'Full definition of one campaign: audience, trigger, platforms, delivery result and, for push, recent delivery schedules. Countly Platform only.',
  inputSchema: {
    type: 'object',
    properties: { ...appProps, campaign_id: { type: 'string', description: 'Campaign id from campaigns_list.' } },
    required: ['campaign_id'],
  },
};

export const campaignsResultsTool = {
  name: 'campaigns_results',
  description: 'Delivery funnel of one campaign: events and unique users per stage (e.g. targeted, sent, failed, clicked for push; shown, interacted for in-app). Countly Platform only.',
  inputSchema: {
    type: 'object',
    properties: {
      ...appProps,
      campaign_id: { type: 'string', description: 'Campaign id from campaigns_list.' },
      platform: { type: 'string', description: 'Only this platform (push: send platform such as "i" or "a"; others: user platform).' },
      filter: { type: 'string', description: 'Optional JSON user-property filter, e.g. {"up.cc":"US"}.' },
    },
    required: ['campaign_id'],
  },
};

const AI_TABS = ['overview', 'conversations', 'conversation_detail', 'composition', 'tools', 'models', 'quality', 'cost', 'performance', 'adoption'];

export const aiAssistantsAnalyticsTool = {
  name: 'ai_assistants_analytics',
  description: 'Analytics of in-app AI assistants (LLM events) for a period, one view per call: overview KPIs, conversations, a conversation\'s detail, composition by user property, tools, models, quality/feedback, cost, performance or adoption. Countly Platform only.',
  inputSchema: {
    type: 'object',
    properties: {
      ...appProps,
      tab: { type: 'string', enum: AI_TABS, description: 'View to return (default "overview").' },
      ...periodProp,
      thread_id: { type: 'string', description: 'Conversation thread id, required for tab "conversation_detail" (from tab "conversations").' },
      property: { type: 'string', enum: ['cc', 'cty', 'd', 'dt', 'p', 'pv', 'av', 'la'], description: 'User property for tab "composition": cc country, cty city, d device, dt device type, p platform, pv platform version, av app version, la language.' },
      limit: { type: 'number', description: 'Maximum items per list in the output (default 25).' },
    },
    required: [],
  },
};

export const notificationsListTool = {
  name: 'notifications_list',
  description: 'The connected user\'s dashboard notifications (inbox), newest first, with the unread count. Countly Platform only.',
  inputSchema: {
    type: 'object',
    properties: {
      limit: { type: 'number', description: 'Maximum notifications (default 20, max 100).' },
      before: { type: 'number', description: 'Only notifications older than this timestamp (ms), for paging.' },
    },
    required: [],
  },
};

export const tasksListTool = {
  name: 'tasks_list',
  description: 'Background tasks / long-running reports of an app (drill, funnels, flows, formulas, exports...) with status, period and timing. Use task_result to read a finished task. Countly Platform only.',
  inputSchema: {
    type: 'object',
    properties: {
      ...appProps,
      all_apps: { type: 'boolean', description: 'List tasks of every app you can see, not just this one.' },
      type: { type: 'string', description: 'Only this task type, e.g. "drill", "funnels", "flows", "formulas".' },
      status: { type: 'string', enum: ['running', 'rerunning', 'completed', 'errored'], description: 'Only this status.' },
      search: { type: 'string', description: 'Filter by report name/description.' },
      ...periodProp,
      limit: { type: 'number', description: 'Maximum tasks (default 20).' },
      skip: { type: 'number', description: 'Tasks to skip (default 0).' },
    },
    required: [],
  },
};

export const taskResultTool = {
  name: 'task_result',
  description: 'Status and stored result of one background task (from tasks_list, or a task_id returned by a long query). Countly Platform only.',
  inputSchema: {
    type: 'object',
    properties: {
      ...appProps,
      task_id: { type: 'string', description: 'Task id.' },
      limit: { type: 'number', description: 'Maximum items per list in the output (default 50).' },
    },
    required: ['task_id'],
  },
};

export const geoLocationsListTool = {
  name: 'geo_locations_list',
  description: 'Saved geo locations (geofences) of an app: title, address, coordinates and radius. Countly Platform only.',
  inputSchema: {
    type: 'object',
    properties: {
      ...appProps,
      search: { type: 'string', description: 'Filter by title.' },
      limit: { type: 'number', description: 'Maximum locations (default 20, max 100).' },
      skip: { type: 'number', description: 'Locations to skip (default 0).' },
    },
    required: [],
  },
};

export const revenueIapEventsTool = {
  name: 'revenue_iap_events',
  description: 'Custom event keys configured as in-app purchase (revenue) events for an app. Countly Platform only.',
  inputSchema: { type: 'object', properties: { ...appProps }, required: [] },
};

export const crashJiraIssuesTool = {
  name: 'crash_jira_issues',
  description: 'Jira issues linked to crash groups: issue key and URL per crash group that has one. Countly Platform only.',
  inputSchema: {
    type: 'object',
    properties: {
      ...appProps,
      crash_ids: { type: 'array', items: { type: 'string' }, description: 'Crash group ids from crash_groups_list.' },
    },
    required: ['crash_ids'],
  },
};

export const platformExtrasToolDefinitions = [
  flowsListTool,
  flowsGetTool,
  flowsDataTool,
  flowsDropoffTool,
  ratingsWidgetsListTool,
  ratingsStatsTool,
  ratingsCommentsTool,
  campaignsListTool,
  campaignsGetTool,
  campaignsResultsTool,
  aiAssistantsAnalyticsTool,
  notificationsListTool,
  tasksListTool,
  taskResultTool,
  geoLocationsListTool,
  revenueIapEventsTool,
  crashJiraIssuesTool,
];

// ─── Compaction ───────────────────────────────────────────────────────────────

function compactFlow(flow: any): any {
  const def = flow.definition || {};
  return clean({
    id: flow.id,
    name: unescapeHtml(flow.name),
    description: flow.description,
    status: flow.status,
    visibility: flow.visibility,
    anchor: def.anchorId,
    direction: def.direction,
    depth: def.depth,
    window: def.window,
    period: def.period,
    eventFilter: def.eventFilter && Object.keys(def.eventFilter).length ? def.eventFilter : undefined,
    excludedEvents: Array.isArray(def.excludedEventIds) ? def.excludedEventIds.length : undefined,
    created: iso(flow.createdAt),
    calculated: iso(flow.runAt),
    calcDurationMs: flow.duration,
  });
}

/** Flow graph → top events per step from the anchor, plus top transitions */
export function summariseFlowData(data: any, maxSteps: number, top: number): any {
  const graph = data?.graph || {};
  const nodes: any[] = graph.nodes || [];
  const anchorColumn = Number(graph.anchorColumn) || 0;
  const byStep = new Map<number, any[]>();
  for (const node of nodes) {
    const step = Number(node.column) - anchorColumn;
    if (Math.abs(step) > maxSteps) {
      continue;
    }
    if (!byStep.has(step)) {
      byStep.set(step, []);
    }
    byStep.get(step)!.push(node);
  }
  const kept = new Map<string, { label: string; step: number }>();
  const steps = [...byStep.entries()]
    .sort((a, b) => Math.abs(a[0]) - Math.abs(b[0]))
    .map(([step, list]) => {
      const sorted = list.sort((a, b) => (b.value || 0) - (a.value || 0));
      const shown = sorted.slice(0, top);
      shown.forEach((n) => kept.set(n.id, { label: n.label, step }));
      return clean({
        step,
        events: shown.map((n) => clean({ event: n.label, kind: n.kind, users: n.value, pct: n.valuePct })),
        otherEvents: sorted.length > top ? sorted.length - top : undefined,
      });
    });
  const transitions = (graph.links || [])
    .filter((l: any) => kept.has(l.source) && kept.has(l.target))
    .sort((a: any, b: any) => (b.value || 0) - (a.value || 0))
    .slice(0, top * Math.max(1, steps.length))
    .map((l: any) => {
      const from = kept.get(l.source)!;
      const to = kept.get(l.target)!;
      return { from: `${from.label} (step ${from.step})`, to: `${to.label} (step ${to.step})`, users: l.value, pct: l.valuePct };
    });
  return clean({
    direction: graph.direction,
    anchor: data?.anchor ? clean({ event: data.anchor.label, users: data.anchor.volume }) : undefined,
    totalUsers: graph.total,
    steps,
    topTransitions: transitions,
    topPaths: Array.isArray(data?.paths) && data.paths.length ? compactPayload(data.paths, top) : undefined,
    sampling: data?.sampling?.sampled ? data.sampling : undefined,
    engine: data?.version,
    note: nodes.length === 0 ? 'No calculated data for this flow yet.' : undefined,
  });
}

function compactWidget(w: any): any {
  const count = Number(w.ratingsCount) || 0;
  return clean({
    id: w._id,
    name: unescapeHtml(w.internalName || w.popup_header_text),
    question: w.internalName ? unescapeHtml(w.popup_header_text) : undefined,
    active: w.status === true || w.status === 'true',
    responses: count,
    avgRating: count ? Math.round((Number(w.ratingsSum) / count) * 100) / 100 : undefined,
    timesShown: w.timesShown,
    symbol: w.rating_symbol,
    created: iso(w.created_at),
  });
}

function compactCampaign(c: any): any {
  const result = c.result && Object.values(c.result).some((v) => typeof v === 'number' && v > 0)
    ? Object.fromEntries(Object.entries(c.result).filter(([k, v]) => k !== 'errors' && typeof v === 'number'))
    : undefined;
  return clean({
    id: c._id,
    name: c.name,
    channel: c.channel,
    status: c.status,
    trigger: c.trigger?.kind,
    platforms: Array.isArray(c.platforms) && c.platforms.length ? c.platforms : undefined,
    sentAt: iso(c.sentAt),
    created: iso(c.createdAt),
    createdBy: c.createdByName,
    result,
  });
}

function compactTask(t: any): any {
  let meta = t.meta;
  if (typeof meta === 'string') {
    try {
      meta = JSON.parse(meta);
    } catch {
      // keep the raw string
    }
  }
  const subtasks = t.subtasks && typeof t.subtasks === 'object' ? Object.values(t.subtasks) : [];
  return clean({
    id: t._id,
    name: t.report_name || t.name,
    description: t.report_desc,
    type: t.type,
    status: t.status,
    error: t.errormsg,
    app_id: t.app_id,
    period: t.period_desc,
    meta,
    autoRefresh: t.autoRefresh || undefined,
    global: t.global,
    created: iso(t.ts),
    started: iso(t.start),
    finished: iso(t.end),
    hasData: t.hasData,
    subtasks: subtasks.length || undefined,
    erroredSubtasks: subtasks.filter((s: any) => s?.status === 'errored').length || undefined,
  });
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

async function run(action: string, fn: () => Promise<ToolResult>): Promise<ToolResult> {
  try {
    return await fn();
  } catch (error) {
    return v2ErrorResult(action, error);
  }
}

function paging(args: any, def: number): { page: number; pageSize: number } {
  return { page: Math.max(1, Number(args.page) || 1), pageSize: Math.max(1, Number(args.limit) || def) };
}

export class PlatformExtrasTools {
  constructor(private context: ToolContext) {}

  async flows_list(args: any): Promise<ToolResult> {
    return run('list flows', async () => {
      const app_id = await this.context.resolveAppId(args);
      const data = await v2Request<any>(this.context, 'get', '/v2/flows', {
        params: clean({
          app_id,
          sSearch: args.search,
          status: args.status,
          iDisplayStart: args.skip ?? 0,
          iDisplayLength: args.limit ?? 50,
        }),
      });
      const rows = (data.aaData || []).map(compactFlow);
      return jsonResult(`Flows of app ${app_id} (${data.iTotalDisplayRecords ?? rows.length} total, showing ${rows.length})`, rows);
    });
  }

  async flows_get(args: any): Promise<ToolResult> {
    return run('get flow', async () => {
      const app_id = await this.context.resolveAppId(args);
      const flow = await v2Request<any>(this.context, 'get', `/v2/flows/info/${enc(args.flow_id)}`, { params: { app_id } });
      return jsonResult(`Flow ${args.flow_id}`, clean({
        ...compactFlow(flow),
        excludedEvents: flow.definition?.excludedEventIds,
        creator: flow.creator?.full_name || undefined,
      }));
    });
  }

  async flows_data(args: any): Promise<ToolResult> {
    return run('get flow data', async () => {
      const app_id = await this.context.resolveAppId(args);
      const data = await v2Request<any>(this.context, 'get', `/v2/flows/data/${enc(args.flow_id)}`, { params: { app_id } });
      return jsonResult(`Flow ${args.flow_id} data`, summariseFlowData(data, Number(args.max_steps) || 5, Number(args.top) || 5));
    });
  }

  async flows_dropoff(args: any): Promise<ToolResult> {
    return run('get flow drop-off', async () => {
      const app_id = await this.context.resolveAppId(args);
      const steps: unknown[] = Array.isArray(args.steps) ? args.steps : [args.steps];
      const events = [...steps, args.missing_step].map(toDropoffStep);
      const data = await v2Request<any>(this.context, 'post', '/v2/flows/dropoff', {
        params: { app_id },
        body: clean({
          events,
          distance: args.distance,
          window: args.window,
          period: periodParam(args.period) ?? '30days',
          limit: args.limit,
        }),
      });
      const destinations = (data.destinations || []).map((d: any) => clean({
        event: d.label && d.label !== d.event ? d.label : d.event,
        users: d.users,
        occurrences: d.occurrences,
      }));
      return jsonResult(`Instead of "${args.missing_step}", users did`, clean({
        destinations,
        sampling: data.sampling?.sampled ? data.sampling : undefined,
      }));
    });
  }

  async ratings_widgets_list(args: any): Promise<ToolResult> {
    return run('list rating widgets', async () => {
      const app_id = await this.context.resolveAppId(args);
      const { page, pageSize } = paging(args, 50);
      const data = await v2Request<any>(this.context, 'get', '/v2/star-rating/widgets', {
        params: clean({ app_id, status: args.active, search: args.search, page, pageSize }),
      });
      const rows = (data.items || []).map(compactWidget);
      return jsonResult(`Rating widgets of app ${app_id} (${data.total} total, page ${data.page})`, rows);
    });
  }

  async ratings_stats(args: any): Promise<ToolResult> {
    return run('get rating stats', async () => {
      const app_id = await this.context.resolveAppId(args);
      const data = await v2Request<any>(this.context, 'get', `/v2/star-rating/widgets/${enc(args.widget_id)}/stats`, {
        params: clean({ app_id, period: periodParam(args.period) ?? '30days', platform: args.platform }),
      });
      return jsonResult(`Rating stats of widget ${args.widget_id}`, {
        period: data.period,
        responses: data.responses,
        avgRating: Math.round((Number(data.avgRating) || 0) * 100) / 100,
        timesShown: data.timesShown,
        distribution: Object.fromEntries((data.distribution || []).map((d: any) => [d.rating, d.count])),
      });
    });
  }

  async ratings_comments(args: any): Promise<ToolResult> {
    return run('get rating comments', async () => {
      const app_id = await this.context.resolveAppId(args);
      const { page, pageSize } = paging(args, 50);
      const data = await v2Request<any>(this.context, 'get', `/v2/star-rating/widgets/${enc(args.widget_id)}/comments`, {
        params: clean({
          app_id,
          period: periodParam(args.period) ?? '30days',
          search: args.search,
          platform: args.platform,
          page,
          pageSize,
        }),
      });
      const rows = (data.items || []).map((c: any) => clean({
        rating: c.rating,
        comment: unescapeHtml(c.comment),
        email: c.email,
        uid: c.uid,
        time: c.ts,
      }));
      return jsonResult(`Responses of widget ${args.widget_id} (${data.total} total, page ${data.page})`, rows);
    });
  }

  async campaigns_list(args: any): Promise<ToolResult> {
    return run('list campaigns', async () => {
      const app_id = await this.context.resolveAppId(args);
      const { page, pageSize } = paging(args, 50);
      const list = (channel: string | undefined) => v2Request<any>(this.context, 'get', '/v2/campaigns', {
        params: clean({
          app_id,
          channel,
          status: args.status,
          search: args.search,
          type: args.type,
          page,
          pageSize,
        }),
      });
      try {
        const data = await list(args.channel);
        return jsonResult(`Campaigns of app ${app_id} (${data.total} matching, page ${data.page})`, {
          counts: data.counts,
          campaigns: (data.items || []).map(compactCampaign),
        });
      } catch (error) {
        // One unreadable campaign fails the whole mixed list server-side
        // (seen with legacy rating widgets): list channel by channel instead.
        if (args.channel || !(error instanceof V2ApiError) || error.status < 500) {
          throw error;
        }
        const byChannel: Record<string, unknown> = {};
        const failed: string[] = [];
        for (const channel of CAMPAIGN_CHANNELS) {
          try {
            const data = await list(channel);
            byChannel[channel] = { total: data.total, campaigns: (data.items || []).map(compactCampaign) };
          } catch {
            failed.push(channel);
          }
        }
        if (failed.length === CAMPAIGN_CHANNELS.length) {
          throw error;
        }
        return jsonResult(`Campaigns of app ${app_id} by channel, page ${page}`
          + (failed.length ? ` (the server failed to list channel ${failed.join(', ')})` : ''), byChannel);
      }
    });
  }

  async campaigns_get(args: any): Promise<ToolResult> {
    return run('get campaign', async () => {
      const app_id = await this.context.resolveAppId(args);
      const c = await v2Request<any>(this.context, 'get', `/v2/campaigns/${enc(args.campaign_id)}`, { params: { app_id } });
      const { _id, app: _app, createdBy: _cb, updatedBy: _ub, deletedAt: _d, ...rest } = c || {};
      return jsonResult(`Campaign ${args.campaign_id}`, { id: _id, ...rest });
    });
  }

  async campaigns_results(args: any): Promise<ToolResult> {
    return run('get campaign results', async () => {
      const app_id = await this.context.resolveAppId(args);
      const filter = args.filter && typeof args.filter !== 'string' ? JSON.stringify(args.filter) : args.filter;
      const data = await v2Request<any>(this.context, 'get', `/v2/campaigns/${enc(args.campaign_id)}/results`, {
        params: clean({ app_id, platform: args.platform, filter }),
      });
      return jsonResult(`Delivery funnel of campaign ${args.campaign_id}`, clean({
        stages: data.stages,
        errors: data.errors && Object.keys(data.errors).length ? data.errors : undefined,
      }));
    });
  }

  async ai_assistants_analytics(args: any): Promise<ToolResult> {
    return run('get AI assistants analytics', async () => {
      const app_id = await this.context.resolveAppId(args);
      // The v2 route only validates the user, not access to the app
      // (countly-platform#1712), so only query apps the caller can see.
      const apps = await this.context.getApps();
      if (!apps.some((app) => String(app._id) === String(app_id))) {
        throw new Error(`app ${app_id} is not one of your apps; call apps_list to see the apps you can access`);
      }
      const tab = args.tab || 'overview';
      const { from, to } = periodToRange(args.period);
      const data = await v2Request<any>(this.context, 'get', '/v2/ai-assistants/analytics', {
        params: clean({ app_id, from, to, tab, thread_id: args.thread_id, property: args.property }),
      });
      return jsonResult(
        `AI assistants ${tab} (${new Date(from).toISOString()} – ${new Date(to).toISOString()}; daily series list non-zero days only)`,
        compactPayload(data, Number(args.limit) || 25)
      );
    });
  }

  async notifications_list(args: any): Promise<ToolResult> {
    return run('list notifications', async () => {
      const data = await v2Request<any>(this.context, 'get', '/v2/notifications', {
        params: clean({ limit: args.limit ?? 20, before: args.before }),
      });
      const items = (data.items || []).map((n: any) => clean({
        id: n._id,
        category: n.category,
        title: n.title,
        body: n.body,
        time: iso(n.ts),
        ts: n.ts,
        read: n.read,
        payload: n.payload,
      }));
      return jsonResult(`Notifications (${data.unreadCount} unread)`, items);
    });
  }

  async tasks_list(args: any): Promise<ToolResult> {
    return run('list tasks', async () => {
      const app_id = await this.context.resolveAppId(args);
      const query = clean({ type: args.type, status: args.status });
      const data = await v2Request<any>(this.context, 'get', '/v2/tasks', {
        params: clean({
          app_id,
          data_source: args.all_apps ? 'all' : undefined,
          query: Object.keys(query).length ? JSON.stringify(query) : undefined,
          search: args.search,
          period: periodParam(args.period),
          skip: args.skip ?? 0,
          limit: args.limit ?? 20,
        }),
      });
      const tasks = (data.tasks || []).map(compactTask);
      return jsonResult(`Tasks (${data.total} total, showing ${tasks.length})`, tasks);
    });
  }

  async task_result(args: any): Promise<ToolResult> {
    return run('get task result', async () => {
      const app_id = await this.context.resolveAppId(args);
      const data = await v2Request<any>(this.context, 'get', `/v2/tasks/${enc(args.task_id)}/result`, { params: { app_id } });
      const result = jsonResult(`Task ${args.task_id} (${data.status})`, clean({
        status: data.status,
        error: data.errormsg,
        data: compactPayload(data.data, Number(args.limit) || 50),
      }));
      const MAX_TEXT = 30_000;
      const text = result.content[0].text;
      if (text.length > MAX_TEXT) {
        result.content[0].text = `${text.slice(0, MAX_TEXT)}\n… output truncated (${text.length - MAX_TEXT} more characters); query a narrower period or use drill_query for targeted numbers.`;
      }
      return result;
    });
  }

  async geo_locations_list(args: any): Promise<ToolResult> {
    return run('list geo locations', async () => {
      const app_id = await this.context.resolveAppId(args);
      const data = await v2Request<any>(this.context, 'get', '/v2/geo/locations', {
        params: clean({ app_id, search: args.search, limit: args.limit, skip: args.skip }),
      });
      const items = (data.items || []).map((g: any) => clean({
        id: g._id,
        title: g.title,
        address: g.address,
        lng: g.geo?.coordinates?.[0],
        lat: g.geo?.coordinates?.[1],
        radius: g.radius,
        unit: g.unit,
        created: g.created,
      }));
      return jsonResult(`Geo locations of app ${app_id} (${data.total} total)`, items);
    });
  }

  async revenue_iap_events(args: any): Promise<ToolResult> {
    return run('get IAP events', async () => {
      const app_id = await this.context.resolveAppId(args);
      const data = await v2Request<any>(this.context, 'get', '/v2/revenue/iap-events', { params: { app_id } });
      return jsonResult(`IAP events of app ${app_id}`, data.events || []);
    });
  }

  async crash_jira_issues(args: any): Promise<ToolResult> {
    return run('get crash Jira issues', async () => {
      const app_id = await this.context.resolveAppId(args);
      const ids: string[] = Array.isArray(args.crash_ids) ? args.crash_ids : String(args.crash_ids || '').split(',');
      const data = await v2Request<any>(this.context, 'get', '/v2/crashes-jira/issues', {
        params: { app_id, crashgroup_ids: ids.map((x) => String(x).trim()).filter(Boolean).join(',') },
      });
      const rows = (data.rows || []).map((r: any) => clean({
        crash_id: r.crashgroup_id,
        issue: r.issue_key,
        url: r.url,
        linked: iso(r.created),
        lastChecked: iso(r.last_checked),
      }));
      return jsonResult(`Jira issues (${rows.length} of ${ids.length} crash groups linked)`, rows);
    });
  }
}

export const platformExtrasToolHandlers = Object.fromEntries(
  platformExtrasToolDefinitions.map((t) => [t.name, t.name])
) as Record<string, string>;

export const platformExtrasToolMetadata = {
  instanceKey: 'platformExtras',
  toolClass: PlatformExtrasTools,
  handlers: platformExtrasToolHandlers,
} as const;
