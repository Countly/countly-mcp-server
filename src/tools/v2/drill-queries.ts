/**
 * Drill saved queries ("bookmarks"): Countly Platform /v2 variants
 *
 *   GET    /v2/drill/queries?app_id | ?scope=mine  → drill_bookmarks_list
 *   POST   /v2/drill/queries                       → drill_bookmarks_create
 *   DELETE /v2/drill/queries/:id                   → drill_bookmarks_delete
 *   GET    /v2/drill/queries/:id + POST …/data     → drill_saved_query_run (Platform only)
 *
 * Platform stores a saved query as the drill builder's "descriptor": metrics
 * keyed by `letter` with a `kind`, `field` as {id,label}, filters as a
 * `{nodes, gaps}` condition tree, breakdowns as {id,label}, and a date range.
 * Legacy bookmarks live in the same collection and are converted at read time
 * (read-only: v2 edit/delete answer 404 for them, so delete falls back to the
 * legacy endpoint).
 *
 * drill_bookmarks_create takes the same metrics/filter/breakdowns as
 * drill_query and translates them to the descriptor here, so anything a
 * drill_query computes can be saved and re-run.
 */

import { jsonResult, V2ApiError, v2ErrorResult, v2Request } from '../../lib/v2-api.js';
import { calendarNow, periodToRange } from '../dashboards-v2.js';
import type { ToolContext, ToolResult } from '../types.js';
import { toSlimMetrics } from './drill.js';

/** v2 statuses meaning "saved queries are not available to this user/server" */
const UNAVAILABLE = [401, 403, 404, 501, 503];

const appProps = {
  app_id: { type: 'string', description: 'Application ID. Either app_id or app_name must be provided; call apps_list first if you do not know it.' },
  app_name: { type: 'string', description: 'Application name (alternative to app_id). Must match an existing app exactly; call apps_list to find valid names.' },
};

export const drillQueriesV2ToolDefinitions: Record<string, any> = {
  drill_bookmarks_list: {
    name: 'drill_bookmarks_list',
    description: 'List saved drill queries (bookmarks) of an app, including ones saved in the old drill UI: name, visibility, metrics, filters, breakdowns and window. Run one with drill_saved_query_run; create with drill_bookmarks_create; remove with drill_bookmarks_delete. Requires the drill plugin.',
    inputSchema: {
      type: 'object',
      properties: {
        ...appProps,
        event_key: { type: 'string', description: 'Only queries that use this event (e.g. "[CLY]_session" or a custom event key).' },
        scope: { type: 'string', enum: ['app', 'mine'], description: '"app" (default): queries of this app. "mine": every saved query you can read, across all apps (app_id not needed).' },
      },
      required: [],
    },
  },
  drill_bookmarks_create: {
    name: 'drill_bookmarks_create',
    description: `Save a drill query so it can be re-run later (drill_saved_query_run) and opened in the drill UI. Takes the same metrics, filter and breakdowns as drill_query; run it with drill_query first to check the result.
Shortcut: instead of metrics, give event_key (+ optional query_obj and by_val) to save a count of that event, like a classic bookmark.
Filters must be flat field conditions combined with $and/$or, using eq, $ne, $in, $nin, $gt, $gte, $lt, $lte, rgxcn (contains), rgxntc (not contains) or rgxbw (starts with). Requires the drill plugin.`,
    inputSchema: {
      type: 'object',
      properties: {
        ...appProps,
        name: { type: 'string', description: 'Display name for the saved query.' },
        description: { type: 'string', description: 'Optional free-form description.' },
        metrics: { type: 'array', items: { type: 'object' }, description: 'Metrics as in drill_query, e.g. [{"id": "A", "events": ["Purchase"], "aggregation": "count"}, {"id": "B", "events": ["Purchase"], "aggregation": "unique", "field": "uid"}, {"id": "C", "formula": "A / B"}].' },
        filter: { type: 'object', description: 'Filter applied to every event and cohort metric, e.g. {"up.cc": {"$in": ["US", "DE"]}}.' },
        breakdowns: { type: 'array', items: { type: 'string' }, description: 'Properties to group by, e.g. ["up.cc", "sg.plan"].' },
        output: { type: 'array', items: { type: 'string', enum: ['total', 'hourly', 'daily', 'weekly', 'monthly'] }, description: 'Result shapes: "total" (default) and/or a time series bucket.' },
        period: { type: 'string', description: 'Saved window: a rolling keyword such as "30days" (default), "7days", "90days", or a fixed range as "[startMs,endMs]". drill_saved_query_run can override it.' },
        timezone: { type: 'string', description: 'IANA time zone for day boundaries (default: UTC).' },
        global: { type: 'boolean', description: 'true: visible to all dashboard users. Default false (only you and global admins).' },
        event_key: { type: 'string', description: 'Shortcut instead of metrics: save a count of this event.' },
        query_obj: { type: 'string', description: 'With event_key: filter as a JSON string, e.g. \'{"up.p":{"$in":["iOS"]}}\'.' },
        by_val: { type: 'string', description: 'With event_key: breakdown keys as a JSON array string, e.g. \'["up.av"]\'.' },
      },
      required: ['name'],
    },
  },
};

export const drillSavedQueryRunToolDefinition = {
  name: 'drill_saved_query_run',
  description: 'Run a saved drill query (from drill_bookmarks_list) and return its results, like drill_query. Optionally re-window it with period. Countly Platform only. Requires the drill plugin.',
  inputSchema: {
    type: 'object',
    properties: {
      ...appProps,
      query_id: { type: 'string', description: 'Saved query id (the "id" from drill_bookmarks_list).' },
      period: { type: 'string', description: 'Override the saved window: "30days", "7days", "90days", "month", "yesterday", "today", or "[startMs,endMs]". Default: the saved window.' },
      timezone: { type: 'string', description: 'IANA time zone for day boundaries (default: the saved one, else UTC).' },
      sort: { type: 'object', description: 'Sort breakdown rows: {"by": "<metric id or breakdown>", "dir": "desc" | "asc"}.' },
      limit: { type: 'number', description: 'Breakdown rows per page (default 50).' },
      cursor: { type: 'string', description: 'nextCursor from a previous response, to fetch the next page.' },
    },
    required: ['query_id'],
  },
};

// ─── Mongo-style filter ⇄ descriptor condition tree ──────────────────────────

type TreeNode = Record<string, any>;
interface FilterTree { nodes: TreeNode[]; gaps: string[] }

const OPERATORS: Record<string, string> = {
  $eq: 'eq', $ne: 'neq', $in: 'in', $nin: 'nin',
  $gt: 'gt', $gte: 'gte', $lt: 'lt', $lte: 'lte',
  rgxcn: 'contains', rgxntc: 'not_contains', rgxbw: 'starts_with',
};
const TEXT_OPS = new Set(['rgxcn', 'rgxntc', 'rgxbw']);

const isPlainObject = (v: unknown): v is Record<string, unknown> => Boolean(v) && typeof v === 'object' && !Array.isArray(v);

function simpleNode(field: string, operator: string, value: unknown): TreeNode {
  return { kind: 'simple', property: { id: field, label: field }, picked: { operator, value } };
}

/** Conditions of one field: a bare value is equality, an object one node per operator */
function fieldNodes(field: string, condition: unknown): TreeNode[] {
  if (!isPlainObject(condition)) {
    if (Array.isArray(condition) || condition === null || condition === undefined) {
      throw new Error(`filter on "${field}": use {"$in": [...]} to match a list of values`);
    }
    return [simpleNode(field, 'eq', condition)];
  }
  const ops = Object.keys(condition);
  if (ops.length === 0) {
    throw new Error(`filter on "${field}": empty condition`);
  }
  return ops.map((op) => {
    const operator = OPERATORS[op];
    if (!operator) {
      throw new Error(`filter on "${field}": operator ${op} cannot be saved (supported: ${Object.keys(OPERATORS).join(', ')})`);
    }
    let value = condition[op];
    if (op === '$in' || op === '$nin') {
      value = Array.isArray(value) ? value : [value];
    } else if (TEXT_OPS.has(op)) {
      value = String(Array.isArray(value) ? value[0] : value);
    }
    return simpleNode(field, operator, value);
  });
}

/** One query object as a list of AND-ed nodes ($or becomes a group node) */
function andNodes(filter: unknown): TreeNode[] {
  if (!isPlainObject(filter)) {
    throw new Error('filter must be an object');
  }
  const nodes: TreeNode[] = [];
  for (const [key, value] of Object.entries(filter)) {
    if (key === '$and') {
      if (!Array.isArray(value)) {
        throw new Error('$and must be an array');
      }
      value.forEach((part) => nodes.push(...andNodes(part)));
    } else if (key === '$or') {
      if (!Array.isArray(value) || value.length === 0) {
        throw new Error('$or must be a non-empty array');
      }
      const children = value.map((part) => {
        const inner = andNodes(part);
        return inner.length === 1 ? inner[0] : { kind: 'group', children: inner, gaps: inner.slice(1).map(() => 'and') };
      });
      nodes.push(children.length === 1 ? children[0] : { kind: 'group', children, gaps: children.slice(1).map(() => 'or') });
    } else if (key.startsWith('$')) {
      throw new Error(`filter operator ${key} cannot be saved; use $and/$or and field conditions`);
    } else {
      nodes.push(...fieldNodes(key, value));
    }
  }
  return nodes;
}

/** A Mongo-style query object as the descriptor's `{nodes, gaps}` tree */
export function toFilterTree(filter: unknown): FilterTree | undefined {
  if (filter === undefined || filter === null || (isPlainObject(filter) && Object.keys(filter).length === 0)) {
    return undefined;
  }
  const nodes = andNodes(filter);
  return nodes.length > 0 ? { nodes, gaps: nodes.slice(1).map(() => 'and') } : undefined;
}

/** A condition tree as readable text, e.g. `up.cc in ["US","DE"] and sg.plan = "pro"` */
export function describeFilterTree(tree: any): string | undefined {
  const nodes = Array.isArray(tree?.nodes) ? tree.nodes : [];
  if (nodes.length === 0) {
    return undefined;
  }
  const describe = (list: any[], gaps: string[]): string => list.map((n, i) => {
    const text = Array.isArray(n?.children)
      ? `(${describe(n.children, n.gaps ?? [])})`
      : `${n?.property?.id ?? '?'} ${n?.picked?.operator === 'eq' ? '=' : n?.picked?.operator ?? '?'} ${JSON.stringify(n?.picked?.value)}` +
        (n?.picked?.valueTo !== undefined ? ` ${JSON.stringify(n.picked.valueTo)}` : '');
    return i === 0 ? text : `${gaps[i - 1] === 'or' ? 'or' : 'and'} ${text}`;
  }).join(' ');
  return describe(nodes, Array.isArray(tree.gaps) ? tree.gaps : []);
}

// ─── drill_query metrics → descriptor ────────────────────────────────────────

/** Translate drill_query metrics (slim dialect) into stored descriptor metrics */
export function toDescriptorMetrics(metrics: unknown, globalFilter: unknown): any[] {
  const parsed = typeof metrics === 'string' ? JSON.parse(metrics) : metrics;
  const filter = typeof globalFilter === 'string' ? JSON.parse(globalFilter) : globalFilter;
  return toSlimMetrics(parsed as any[], filter).map((m: any) => {
    const name = m.name ? { name: m.name } : {};
    if (m.formula) {
      return { letter: m.id, kind: 'formula', expression: m.formula, ...name };
    }
    const tree = toFilterTree(m.filter);
    if (m.cohortId) {
      if (m.membership) {
        throw new Error(`metric ${m.id}: cohort "membership" cannot be saved`);
      }
      return { letter: m.id, kind: 'cohort', cohortId: m.cohortId, ...(tree ? { filter: tree } : {}), ...name };
    }
    return {
      letter: m.id,
      kind: 'custom',
      aggregation: m.aggregation,
      events: m.events,
      ...(m.eventNames ? { eventNames: m.eventNames } : {}),
      ...(m.field ? { field: { id: m.field, label: m.field } } : {}),
      ...(m.percentile !== undefined ? { percentile: m.percentile } : {}),
      ...(tree ? { filter: tree } : {}),
      ...name,
    };
  });
}

const day = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** Saved window: rolling keywords stay relative; a "[start,end]" range is stored as calendar days */
export function toSavedDateRange(period: unknown): Record<string, string> {
  if (period === undefined || period === null || period === '') {
    return { period: '30days' };
  }
  if (typeof period === 'string' && !period.trim().startsWith('[')) {
    return { period: period.trim() };
  }
  const { from, to } = periodToRange(period);
  if (!Number.isFinite(from) || !Number.isFinite(to)) {
    throw new Error('period must be a keyword like "30days" or "[startMs,endMs]"');
  }
  return { from: day(from), to: day(to) };
}

function parseJson(value: unknown, label: string): any {
  if (typeof value !== 'string') {
    return value;
  }
  try {
    return JSON.parse(value);
  } catch {
    throw new Error(`${label} must be valid JSON`);
  }
}

/** The create body for /v2/drill/queries */
export function buildSaveBody(args: any, appId: string): Record<string, unknown> {
  let metrics: any[];
  let breakdowns: string[];
  const rawMetrics = parseJson(args.metrics, 'metrics');
  if (Array.isArray(rawMetrics) && rawMetrics.length > 0) {
    metrics = toDescriptorMetrics(rawMetrics, parseJson(args.filter, 'filter'));
    breakdowns = Array.isArray(args.breakdowns) ? args.breakdowns : [];
  } else if (args.event_key) {
    const filter = args.query_obj ? parseJson(args.query_obj, 'query_obj') : parseJson(args.filter, 'filter');
    metrics = toDescriptorMetrics([{ id: 'A', events: [args.event_key], aggregation: 'count' }], filter);
    const byVal = args.by_val !== undefined ? parseJson(args.by_val, 'by_val') : args.breakdowns;
    if (byVal !== undefined && !Array.isArray(byVal)) {
      throw new Error('by_val must be a JSON array');
    }
    breakdowns = byVal ?? [];
  } else {
    throw new Error('give metrics (as in drill_query) or event_key');
  }
  const outputs = Array.isArray(args.output) && args.output.length > 0
    ? args.output
    : typeof args.output === 'string' ? [args.output] : ['total'];
  return {
    name: args.name,
    description: args.description ?? args.desc ?? '',
    visibility: args.global === true || args.global === 'true' ? 'global' : 'private',
    query: {
      scope: {
        appIds: [appId],
        dateRange: toSavedDateRange(args.period),
        ...(args.timezone ? { timezone: args.timezone } : {}),
      },
      metrics,
      breakdowns: breakdowns.map((b) => ({ id: String(b), label: String(b) })),
      outputs,
    },
  };
}

// ─── Stored query → compact summary ──────────────────────────────────────────

function summariseMetric(m: any): Record<string, unknown> {
  const name = m?.name ? { name: m.name } : {};
  if (m?.kind === 'formula') {
    return { id: m.letter, formula: m.expression, ...name };
  }
  const filter = describeFilterTree(m?.filter);
  if (m?.kind === 'cohort') {
    return { id: m.letter, cohort_id: m.cohortId, ...(filter ? { filter } : {}), ...name };
  }
  const events = [
    ...(m?.events ?? []).filter((e: string) => e !== '[CLY]_custom' && !e.endsWith('_begin') && e !== '[CLY]_view_update'),
    ...(m?.eventNames ?? []),
  ];
  return {
    id: m?.letter,
    aggregation: m?.aggregation,
    ...(m?.field?.id ? { field: m.field.id } : {}),
    ...(m?.percentile !== undefined ? { percentile: m.percentile } : {}),
    events,
    ...(filter ? { filter } : {}),
    ...name,
  };
}

export function summariseSavedQuery(doc: any): Record<string, unknown> {
  const q = doc?.query ?? {};
  const range = q.scope?.dateRange ?? {};
  return {
    id: doc?._id,
    name: doc?.name,
    ...(doc?.description ? { description: doc.description } : {}),
    visibility: doc?.visibility,
    ...(doc?.origin === 'legacy' ? { savedIn: 'old drill UI' } : {}),
    ...(doc?.unsupported ? { runnable: false, unsupported: `${doc.unsupported.code}: ${doc.unsupported.detail}` } : {}),
    apps: doc?.appIds,
    window: range.period ? range.period : (range.from ? `${range.from} to ${range.to}` : undefined),
    metrics: (q.metrics ?? []).map(summariseMetric),
    ...(Array.isArray(q.breakdowns) && q.breakdowns.length > 0 ? { breakdowns: q.breakdowns.map((b: any) => b?.id ?? b) } : {}),
    outputs: q.outputs,
    updatedAt: doc?.updatedAt,
  };
}

function usesEvent(doc: any, eventKey: string): boolean {
  return (doc?.query?.metrics ?? []).some((m: any) =>
    (m?.events ?? []).includes(eventKey) || (m?.eventNames ?? []).includes(eventKey));
}

const isUnavailable = (error: unknown, statuses = UNAVAILABLE) => error instanceof V2ApiError && statuses.includes(error.status);

// ─── Handlers ────────────────────────────────────────────────────────────────

export async function handleListSavedQueriesV2(context: ToolContext, args: any, legacy: () => Promise<ToolResult>): Promise<ToolResult> {
  try {
    const mine = args.scope === 'mine';
    const appId = mine ? undefined : await context.resolveAppId(args);
    let docs: any[];
    try {
      docs = await v2Request<any[]>(context, 'get', '/v2/drill/queries', { params: mine ? { scope: 'mine' } : { app_id: appId } });
    } catch (error) {
      if (isUnavailable(error) && !mine) {
        return legacy();
      }
      throw error;
    }
    const list = (Array.isArray(docs) ? docs : []).filter((d) => !args.event_key || usesEvent(d, args.event_key));
    return jsonResult(
      `Saved drill queries ${mine ? 'you can read' : `for app ${appId}`}${args.event_key ? ` using ${args.event_key}` : ''} (${list.length})`,
      list.map(summariseSavedQuery)
    );
  } catch (error) {
    return v2ErrorResult('list saved drill queries', error);
  }
}

export async function handleCreateSavedQueryV2(context: ToolContext, args: any, legacy: () => Promise<ToolResult>): Promise<ToolResult> {
  try {
    const appId = await context.resolveAppId(args);
    const body = buildSaveBody(args, appId);
    let saved: any;
    try {
      saved = await v2Request<any>(context, 'post', '/v2/drill/queries', { body });
    } catch (error) {
      // Saved queries unavailable: a classic bookmark still works
      const hasMetrics = Array.isArray(parseJson(args.metrics, 'metrics')) && parseJson(args.metrics, 'metrics').length > 0;
      if (isUnavailable(error, [404, 501, 503]) && !hasMetrics && args.event_key) {
        return legacy();
      }
      throw error;
    }
    return jsonResult('Saved drill query created', summariseSavedQuery(saved));
  } catch (error) {
    return v2ErrorResult('create saved drill query', error);
  }
}

export async function handleDeleteSavedQueryV2(context: ToolContext, args: any, legacy: () => Promise<ToolResult>): Promise<ToolResult> {
  try {
    if (!args.bookmark_id) {
      throw new Error('bookmark_id is required');
    }
    let result: any;
    try {
      result = await v2Request<any>(context, 'delete', `/v2/drill/queries/${encodeURIComponent(args.bookmark_id)}`);
    } catch (error) {
      // 404: a query saved in the old drill UI, which v2 serves read-only
      if (isUnavailable(error, [404, 501, 503])) {
        return legacy();
      }
      throw error;
    }
    return jsonResult('Saved drill query deleted', result);
  } catch (error) {
    return v2ErrorResult('delete saved drill query', error);
  }
}

export async function handleRunSavedQuery(context: ToolContext, args: any): Promise<ToolResult> {
  try {
    if (!args.query_id) {
      throw new Error('query_id is required');
    }
    const id = encodeURIComponent(args.query_id);
    const doc = await v2Request<any>(context, 'get', `/v2/drill/queries/${id}`);
    if (doc?.unsupported) {
      throw new Error(`this query was saved in the old drill UI and cannot be run (${doc.unsupported.code}: ${doc.unsupported.detail})`);
    }
    const stored = doc?.query?.scope?.dateRange ?? {};
    // A relative saved window is not resolved server-side, so send it as days
    let window: { from: string; to: string } | undefined;
    const zone = args.timezone ?? doc?.query?.scope?.timezone;
    if (args.period) {
      const { from, to } = periodToRange(args.period, calendarNow(zone));
      window = { from: day(from), to: day(to) };
    } else if (!(stored.from && stored.to)) {
      const { from, to } = periodToRange(stored.period || '30days', calendarNow(zone));
      window = { from: day(from), to: day(to) };
    }
    const sort = parseJson(args.sort, 'sort');
    // Paging and sorting apply to breakdown rows only; a scalar total rejects them
    const hasBreakdowns = Array.isArray(doc?.query?.breakdowns) && doc.query.breakdowns.length > 0;
    const body = {
      ...(window ?? {}),
      ...(args.timezone ? { timezone: args.timezone } : {}),
      ...(hasBreakdowns ? { page: { limit: Math.max(1, Number(args.limit ?? 50)), ...(args.cursor ? { cursor: args.cursor } : {}) } } : {}),
      ...(hasBreakdowns && sort?.by ? { sort: { by: sort.by, dir: sort.dir === 'asc' ? 'asc' : 'desc' } } : {}),
    };
    const data = await v2Request<any>(context, 'post', `/v2/drill/queries/${id}/data`, { body });
    const meta = data?.meta || {};
    const range = window ?? { from: String(stored.from).slice(0, 10), to: String(stored.to).slice(0, 10) };
    return jsonResult(
      `Saved query "${doc?.name}" ${range.from} to ${range.to}` + (meta.hasMore ? ` (more rows: pass cursor "${meta.nextCursor}")` : ''),
      {
        metrics: (doc?.query?.metrics ?? []).map(summariseMetric),
        results: data?.results,
        ...(meta.hasMore ? { nextCursor: meta.nextCursor } : {}),
      }
    );
  } catch (error) {
    return v2ErrorResult('run saved drill query', error);
  }
}
