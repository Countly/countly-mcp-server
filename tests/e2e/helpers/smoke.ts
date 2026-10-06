/**
 * Smoke-call plan: which arguments each read-only tool gets in the e2e suite.
 *
 * Tools whose required arguments are all app-scoped get just the test app.
 * Tools that need an object ID take it from the first item of a list call;
 * when that list is empty the tool is skipped, not failed. Anything else
 * that needs arguments we can't invent safely is skipped with a reason.
 *
 * Keep every call cheap: arturs.count.ly runs a single API worker, and one
 * unfiltered user_profiles_query on its large app blocked it for minutes.
 * Profile, drill and user-detail queries always get a narrow filter.
 */

import { TOOL_CATEGORIES } from '../../../src/lib/tools-config.js';
import { findDeep, mapLimit, parseResultJson, resultText, type McpStdioClient, type ToolInfo } from './mcp-client.js';

const READ_ONLY_TOOLS = new Set(
  Object.values(TOOL_CATEGORIES).flatMap((category) =>
    Object.entries(category.operations).filter(([, op]) => op === 'R').map(([name]) => name)
  )
);

export function isReadOnlyTool(name: string): boolean {
  return READ_ONLY_TOOLS.has(name);
}

/** Matches no profile, but exercises the full query path cheaply */
const NO_PROFILES = '{"uid":"mcp-e2e-no-such-user"}';

/** Fixed arguments: required non-ID parameters, and narrow filters for heavy queries */
const STATIC_ARGS: Record<string, (appId: string) => Record<string, unknown>> = {
  query_data: () => ({ query_type: 'analytics', method: 'sessions' }),
  // The app's own collection: non-admins may only read their apps' collections.
  databases_query: (appId) => ({ collection: `app_users${appId}`, limit: 1 }),
  collections_aggregate: (appId) => ({ collection: `app_users${appId}`, aggregation: '[{"$limit":1}]' }),
  collections_indexes: (appId) => ({ collection: `app_users${appId}` }),
  databases_document: (appId) => ({ collection: `app_users${appId}` }),
  user_profiles_query: () => ({ query: NO_PROFILES }),
  user_profiles_breakdown: () => ({ projection_key: '["av"]', query: NO_PROFILES }),
  user_loyalty: () => ({ query: NO_PROFILES }),
  retention: () => ({ period: '7days', query: NO_PROFILES }),
  // Funnels compute over raw drill events; one day keeps that cheap.
  funnels_data: () => ({ period: 'yesterday' }),
  server_logs_contents: () => ({ log: 'api', bytes: 2000 }),
};

/** Tools never smoke-called, and why */
const SKIPPED: Record<string, string> = {
  formulas_run: 'needs a formula definition',
  funnels_step_users: 'needs step indices of a real funnel',
  funnels_dropoff_users: 'needs step indices of a real funnel',
  journeys_stats_uids: 'needs a uid_type for a real journey',
  // Spawns mongotop/mongostat on the API host. Platform images don't ship
  // them and the spawn error is uncaught, so this call restarts the API
  // process (seen on master.count.ly, 2026-10-06).
  databases_stats: 'spawns mongotop/mongostat, which crashes Platform API processes',
  user_profiles_get: 'finding a uid needs a broad profile query, too heavy for large apps',
};

const hasId = (n: any) =>
  !Array.isArray(n) && ((typeof n._id === 'string' && n._id !== 'meta') || typeof n.id === 'string');

/** ID of the first listed item matching `accept` (any item by default) */
const firstId = (json: unknown, accept: (n: any) => boolean = () => true): string | undefined => {
  const node = findDeep(json, (n) => hasId(n) && accept(n));
  return node ? String(node._id ?? node.id) : undefined;
};

interface IdSource {
  /** List tool that yields the ID */
  from: string;
  /** Parameter of the dependent tool */
  param: string;
  pick?: (json: unknown, appId: string, text: string) => string | undefined;
}

const ID_SOURCES: Record<string, IdSource> = {
  apps_get_by_name: {
    from: 'apps_list',
    param: 'app_name',
    // Plain text: "- <name> (ID: <id>)" per line
    pick: (_json, appId, text) => text.split('\n').map((l) => /^- (.+) \(ID: ([0-9a-f]{24})\)$/.exec(l))
      .find((m) => m?.[2] === appId)?.[1],
  },
  databases_document: { from: 'databases_query', param: 'document_id' },
  crashes_get: { from: 'crash_groups_list', param: 'crash_id' },
  cohorts_data: { from: 'cohorts_list', param: 'cohort_id' },
  funnels_data: { from: 'funnels_list', param: 'funnel_id' },
  ab_experiments_details: { from: 'ab_experiments_list', param: 'experiment_id' },
  // Dashboard reports depend on the referenced dashboards still having data.
  email_reports_preview: {
    from: 'email_reports_list',
    param: 'report_id',
    pick: (json) => firstId(json, (n) => (n.report_type ?? n.type ?? 'core') === 'core'),
  },
  journeys_get: { from: 'journeys_list', param: 'journey_id' },
  journeys_stats_summary: { from: 'journeys_list', param: 'journey_id' },
  journeys_stats_table: { from: 'journeys_list', param: 'journey_id' },
  journeys_stats_performance: { from: 'journeys_list', param: 'journey_id' },
  content_blocks_get: { from: 'content_blocks_list', param: 'content_id' },
  // Push messages have no browser preview.
  content_blocks_preview: {
    from: 'content_blocks_list',
    param: 'content_id',
    pick: (json) => firstId(json, (n) => (n.format ?? n.messageFormat) !== 'push'),
  },
  dashboards_data: { from: 'dashboards_list', param: 'dashboard_id' },
};

const SOURCE_TOOLS = new Set(Object.values(ID_SOURCES).map((s) => s.from));

export interface SmokeOutcome {
  tool: string;
  status: 'ok' | 'failed' | 'skipped';
  detail?: string;
}

function baseArgs(tool: ToolInfo, appId: string): Record<string, unknown> {
  return tool.inputSchema.properties?.app_id ? { app_id: appId } : {};
}

function missingRequired(tool: ToolInfo, args: Record<string, unknown>): string[] {
  return (tool.inputSchema.required || []).filter((p) => !(p in args) && !(p === 'app_id' && 'app_name' in args));
}

/**
 * Call every visible read-only tool once. Never throws for a tool failure:
 * all outcomes are collected so one run reports every broken tool.
 */
export async function smokeReadOnlyTools(
  client: McpStdioClient,
  tools: ToolInfo[],
  appId: string,
  concurrency = 2
): Promise<SmokeOutcome[]> {
  const visible = new Map(tools.map((t) => [t.name, t]));
  const candidates = tools.filter((t) => isReadOnlyTool(t.name));

  // List calls feed ID resolution, so run them (memoised) before dependants.
  const listResults = new Map<string, Promise<{ ok: boolean; json: unknown; text: string }>>();
  const callList = (name: string) => {
    if (!listResults.has(name)) {
      const tool = visible.get(name)!;
      const args = { ...baseArgs(tool, appId), ...(STATIC_ARGS[name]?.(appId) || {}) };
      listResults.set(name, client.callTool(name, args).then(
        (r) => ({ ok: !r.isError, json: parseResultJson(r), text: resultText(r) }),
        (e) => ({ ok: false, json: undefined, text: String(e) })
      ));
    }
    return listResults.get(name)!;
  };

  const plan = async (tool: ToolInfo): Promise<{ args: Record<string, unknown> } | { skip: string }> => {
    if (SKIPPED[tool.name]) {
      return { skip: SKIPPED[tool.name] };
    }
    const args = { ...baseArgs(tool, appId), ...(STATIC_ARGS[tool.name]?.(appId) || {}) };
    const source = ID_SOURCES[tool.name];
    if (source) {
      if (!visible.has(source.from)) {
        return { skip: `${source.from} is not visible` };
      }
      const list = await callList(source.from);
      if (!list.ok) {
        return { skip: `${source.from} failed` };
      }
      const id = source.pick ? source.pick(list.json, appId, list.text) : firstId(list.json);
      if (!id) {
        return { skip: `${source.from} returned nothing to use` };
      }
      args[source.param] = id;
    }
    const missing = missingRequired(tool, args);
    if (missing.length > 0) {
      return { skip: `needs ${missing.join(', ')}` };
    }
    return { args };
  };

  return mapLimit(candidates, concurrency, async (tool): Promise<SmokeOutcome> => {
    const p = await plan(tool);
    if ('skip' in p) {
      return { tool: tool.name, status: 'skipped', detail: p.skip };
    }
    // ID source lists were already called with these same args; reuse that.
    if (SOURCE_TOOLS.has(tool.name)) {
      const list = await callList(tool.name);
      return list.ok
        ? { tool: tool.name, status: 'ok' }
        : { tool: tool.name, status: 'failed', detail: list.text.slice(0, 500) };
    }
    try {
      const result = await client.callTool(tool.name, p.args);
      if (result.isError) {
        return { tool: tool.name, status: 'failed', detail: resultText(result).slice(0, 500) };
      }
      return { tool: tool.name, status: 'ok' };
    } catch (error) {
      return { tool: tool.name, status: 'failed', detail: error instanceof Error ? error.message : String(error) };
    }
  });
}

export function formatSmokeFailures(outcomes: SmokeOutcome[]): string {
  return outcomes
    .filter((o) => o.status === 'failed')
    .map((o) => `- ${o.tool}: ${o.detail}`)
    .join('\n');
}
