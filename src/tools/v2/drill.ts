/**
 * Drill tools: Countly Platform /v2 variants
 *
 * - drill_query (Platform only): ad-hoc analytics over raw events via
 *   POST /v2/drill/execute, with metrics (aggregations, cohorts, formulas),
 *   breakdowns, time series, sorting and cursor paging.
 * - user_profiles_query: paginated, sortable, searchable profiles via
 *   POST /v2/drill/users; falls back to legacy when that service is
 *   unavailable to the user.
 */

import { jsonResult, V2ApiError, v2ErrorResult, v2Request } from '../../lib/v2-api.js';
import { periodToRange } from '../dashboards-v2.js';
import type { ToolContext, ToolResult } from '../types.js';

const CUSTOM_EVENT = '[CLY]_custom';

const FIELD_HELP = 'Fields: "uid" (users), "c" (event count), "s" (event sum), "dur" (event duration), "sg.<segment>" (event segmentation), "up.<key>" (user property, e.g. "up.cc" country, "up.p" platform, "up.av" app version, "up.d" device), "custom.<key>" (custom user property).';

export const drillQueryToolDefinition = {
  name: 'drill_query',
  description: `Ad-hoc analytics over raw events (Countly Platform drill): compute metrics over chosen events, optionally filtered, broken down by properties and/or as a time series. Use events_list / queriable_fields_list to find event keys and properties.

Metrics (each gets an "id"; A, B, C… when omitted):
- event metric: {"events": ["Purchase"], "aggregation": "count" | "unique" | "sum" | "avg" | "min" | "max" | "percentile", "field": "<field>" (required except for count; "uid" for unique users), "percentile": 1-99, "filter": {Mongo-style filter}, "name": "label"}
- cohort metric: {"cohort_id": "<id from cohorts_list>", "filter": {...}} counts users in the cohort
- formula: {"formula": "B / A", "name": "label"} over other metric ids

${FIELD_HELP}
Filters use the same field names with Mongo operators, e.g. {"up.cc": {"$in": ["US", "DE"]}, "sg.plan": "pro"}.

Example: purchases, buyers and revenue per buyer by country, daily: {"metrics": [{"id": "P", "events": ["Purchase"], "aggregation": "count"}, {"id": "B", "events": ["Purchase"], "aggregation": "unique", "field": "uid"}, {"id": "R", "events": ["Purchase"], "aggregation": "sum", "field": "s"}, {"id": "RPB", "formula": "R / B"}], "breakdowns": ["up.cc"], "output": ["total", "daily"]}`,
  inputSchema: {
    type: 'object',
    properties: {
      app_id: { type: 'string', description: 'Application ID. Either app_id, app_name or app_ids must be provided.' },
      app_name: { type: 'string', description: 'Application name (alternative to app_id).' },
      app_ids: { type: 'array', items: { type: 'string' }, description: 'Query several apps together (overrides app_id).' },
      period: { type: 'string', description: 'Time period: "30days" (default), "7days", "60days", "90days", "month", "yesterday", "today", or a custom range as "[startMs,endMs]". Whole calendar days.' },
      timezone: { type: 'string', description: 'IANA time zone for day boundaries (default: the app\'s time zone).' },
      metrics: { type: 'array', items: { type: 'object' }, description: 'Metrics to compute, see the tool description.' },
      filter: { type: 'object', description: 'Filter applied to every event and cohort metric (ANDed with each metric\'s own filter).' },
      breakdowns: { type: 'array', items: { type: 'string' }, description: 'Properties to group by, e.g. ["up.cc", "sg.plan"].' },
      output: {
        type: 'array',
        items: { type: 'string', enum: ['total', 'hourly', 'daily', 'weekly', 'monthly'] },
        description: 'Result shapes: "total" (default) and/or a time series bucket.',
      },
      sort: { type: 'object', description: 'Sort breakdown rows: {"by": "<metric id or breakdown>", "dir": "desc" | "asc"}.' },
      limit: { type: 'number', description: 'Breakdown rows per page (default 50).' },
      cursor: { type: 'string', description: 'nextCursor from a previous response, to fetch the next page.' },
    },
    required: ['metrics'],
  },
};

export const drillV2ToolDefinitions: Record<string, any> = {
  user_profiles_query: {
    name: 'user_profiles_query',
    description: 'Search end-user profiles of an app with a filter and/or free text, sorted and paginated. Returns uid, name, email, country, platform, device, sessions, last seen and more, plus the total match count. Field names are app user fields WITHOUT the "up." prefix (e.g. "cc", "p", "av", "custom.plan"). Requires the users plugin. For one user use user_profiles_get; for counts per property use user_profiles_breakdown.',
    inputSchema: {
      type: 'object',
      properties: {
        app_id: { type: 'string', description: 'Application ID. Either app_id or app_name must be provided; call apps_list first if you do not know it.' },
        app_name: { type: 'string', description: 'Application name (alternative to app_id). Must match an existing app exactly.' },
        query: { type: 'string', description: 'Mongo-style filter as a JSON string, e.g. \'{"cc":"US","sc":{"$gte":5}}\'. Defaults to all users.' },
        search: { type: 'string', description: 'Free-text search over name, email, username and ids.' },
        sort_by: { type: 'string', description: 'Profile field to sort by, e.g. "ls" (last seen, default), "sc" (session count), "fs" (first seen).' },
        sort_dir: { type: 'string', enum: ['desc', 'asc'], description: 'Sort direction (default desc).' },
        limit: { type: 'number', description: 'Profiles per page (default 20, max 100).' },
        offset: { type: 'number', description: 'Profiles to skip for paging (default 0).' },
      },
      required: [],
    },
  },
};

// ─── drill_query ──────────────────────────────────────────────────────────────

const day = (ms: number) => new Date(ms).toISOString().slice(0, 10);

function andFilter(a: unknown, b: unknown): Record<string, unknown> | undefined {
  const objA = a && typeof a === 'object' && Object.keys(a).length > 0 ? a as Record<string, unknown> : undefined;
  const objB = b && typeof b === 'object' && Object.keys(b).length > 0 ? b as Record<string, unknown> : undefined;
  if (objA && objB) {
    return { $and: [objA, objB] };
  }
  return objA ?? objB;
}

function parseObject(value: unknown, label: string): any {
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      throw new Error(`${label} must be valid JSON`);
    }
  }
  return value;
}

/** Translate the tool's metrics into the slim /v2/drill/execute dialect */
export function toSlimMetrics(metrics: any[], globalFilter: unknown): any[] {
  if (!Array.isArray(metrics) || metrics.length === 0) {
    throw new Error('metrics must be a non-empty array');
  }
  const used = new Set(metrics.map((m) => m?.id).filter(Boolean));
  let next = 0;
  const nextId = (): string => {
    let id: string;
    do {
      id = next < 26 ? String.fromCharCode(65 + next) : `M${next}`;
      next++;
    } while (used.has(id));
    used.add(id);
    return id;
  };

  return metrics.map((raw) => {
    const m = parseObject(raw, 'metric');
    const id = m.id || nextId();
    const name = m.name ? { name: m.name } : {};
    if (m.formula) {
      return { id, formula: m.formula, ...name };
    }
    const filter = andFilter(globalFilter, parseObject(m.filter, 'metric filter'));
    if (m.cohort_id || m.cohortId) {
      return { id, cohortId: m.cohort_id || m.cohortId, ...(m.membership ? { membership: m.membership } : {}), ...(filter ? { filter } : {}), ...name };
    }
    const events: string[] = Array.isArray(m.events) ? m.events : m.event ? [m.event] : [];
    if (events.length === 0) {
      throw new Error(`metric ${id}: give "events", "cohort_id" or "formula"`);
    }
    // Custom events are stored as e='[CLY]_custom' with the real key in n
    const system = events.filter((e) => e.startsWith('[CLY]_'));
    const custom = events.filter((e) => !e.startsWith('[CLY]_'));
    const aggregation = m.aggregation || 'count';
    const field = m.field || (aggregation === 'unique' ? 'uid' : undefined);
    return {
      id,
      aggregation,
      events: custom.length > 0 ? [...new Set([...system, CUSTOM_EVENT])] : system,
      ...(custom.length > 0 ? { eventNames: custom } : {}),
      ...(field ? { field } : {}),
      ...(m.percentile !== undefined ? { percentile: m.percentile } : {}),
      ...(filter ? { filter } : {}),
      ...name,
    };
  });
}

export async function handleDrillQuery(context: ToolContext, args: any): Promise<ToolResult> {
  try {
    const appIds: string[] = Array.isArray(args.app_ids) && args.app_ids.length > 0
      ? args.app_ids
      : [await context.resolveAppId(args)];
    const { from, to } = periodToRange(args.period || '30days');
    const outputs = Array.isArray(args.output) && args.output.length > 0
      ? args.output
      : typeof args.output === 'string' ? [args.output] : ['total'];
    const sort = parseObject(args.sort, 'sort');
    const body = {
      scope: {
        appIds,
        dateRange: { from: day(from), to: day(to) },
        ...(args.timezone ? { timezone: args.timezone } : {}),
      },
      metrics: toSlimMetrics(parseObject(args.metrics, 'metrics'), parseObject(args.filter, 'filter')),
      breakdowns: Array.isArray(args.breakdowns) ? args.breakdowns : [],
      outputs,
      page: { limit: Math.max(1, Number(args.limit ?? 50)), ...(args.cursor ? { cursor: args.cursor } : {}) },
      ...(sort?.by ? { sort: { by: sort.by, dir: sort.dir === 'asc' ? 'asc' : 'desc' } } : {}),
    };
    const data = await v2Request<any>(context, 'post', '/v2/drill/execute', { body });
    const meta = data.meta || {};
    return jsonResult(
      `Drill results ${body.scope.dateRange.from} to ${body.scope.dateRange.to}` +
        (meta.hasMore ? ` (more rows: pass cursor "${meta.nextCursor}")` : ''),
      {
        metrics: body.metrics.map((m: any) => ({ id: m.id, name: m.name, ...(m.formula ? { formula: m.formula } : {}) })),
        results: data.results,
        ...(meta.hasMore ? { nextCursor: meta.nextCursor } : {}),
      }
    );
  } catch (error) {
    return v2ErrorResult('run drill query', error);
  }
}

// ─── user_profiles_query ──────────────────────────────────────────────────────

export async function handleQueryUserProfilesV2(
  context: ToolContext,
  args: any,
  legacy: () => Promise<ToolResult>
): Promise<ToolResult> {
  try {
    const app_id = await context.resolveAppId(args);
    const profileFilter = args.query ? parseObject(args.query, 'query') : {};
    const body: Record<string, unknown> = {
      app_id,
      profileFilter,
      limit: Math.min(100, Math.max(1, Number(args.limit ?? 20))),
      offset: Math.max(0, Number(args.offset ?? 0)),
      sort: { column: args.sort_by || 'ls', dir: args.sort_dir === 'asc' ? 'asc' : 'desc' },
      ...(args.search ? { search: args.search } : {}),
    };
    let data: any;
    try {
      data = await v2Request<any>(context, 'post', '/v2/drill/users', { body });
    } catch (error) {
      // ClickHouse profile mirror unavailable, or no drill rights
      if (error instanceof V2ApiError && [401, 403, 404, 501, 503].includes(error.status) && !args.search) {
        return legacy();
      }
      throw error;
    }
    const total = data.meta?.total;
    return jsonResult(
      `User profiles for app ${app_id} (${total ?? data.rows?.length ?? 0} total${data.meta?.hasMore ? ', more available with offset' : ''})`,
      data.rows || []
    );
  } catch (error) {
    return v2ErrorResult('query user profiles', error);
  }
}
