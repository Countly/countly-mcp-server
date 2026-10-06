/**
 * Smoke-call plan: which arguments each read-only tool gets in the e2e suite.
 *
 * Tools whose required arguments are all app-scoped get just the test app.
 * Tools that need an object ID take it from the first item of a list call;
 * when that list is empty the tool is skipped, not failed. Anything else
 * that needs arguments we can't invent safely is skipped with a reason.
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

/** Fixed arguments for tools whose required parameters aren't IDs */
const STATIC_ARGS: Record<string, (appId: string) => Record<string, unknown>> = {
  query_data: () => ({ query_type: 'analytics', method: 'sessions' }),
  databases_query: () => ({ collection: 'apps', limit: 1 }),
  databases_document: (appId) => ({ collection: 'apps', document_id: appId }),
  collections_aggregate: () => ({ collection: 'apps', aggregation: '[{"$limit":1}]' }),
  collections_indexes: () => ({ collection: 'apps' }),
  databases_stats: () => ({ stat_type: 'mongotop' }),
  user_profiles_breakdown: () => ({ projection_key: '["av"]' }),
  server_logs_contents: () => ({ log: 'api', bytes: 2000 }),
};

/** Tools never smoke-called, and why */
const SKIPPED: Record<string, string> = {
  formulas_run: 'needs a formula definition',
  funnels_step_users: 'needs step indices of a real funnel',
  funnels_dropoff_users: 'needs step indices of a real funnel',
  journeys_stats_uids: 'needs a uid_type for a real journey',
};

const firstId = (json: unknown): string | undefined => {
  const node = findDeep(json, (n) =>
    !Array.isArray(n)
    && ((typeof n._id === 'string' && n._id !== 'meta') || typeof n.id === 'string'));
  return node ? String(node._id ?? node.id) : undefined;
};

interface IdSource {
  /** List tool that yields the ID */
  from: string;
  /** Parameter of the dependent tool */
  param: string;
  pick?: (json: unknown, appId: string) => string | undefined;
}

const ID_SOURCES: Record<string, IdSource> = {
  apps_get_by_name: {
    from: 'apps_list',
    param: 'app_name',
    pick: (json, appId) => findDeep(json, (n) => (n._id === appId || n.id === appId) && typeof n.name === 'string')?.name,
  },
  crashes_get: { from: 'crash_groups_list', param: 'crash_id' },
  cohorts_data: { from: 'cohorts_list', param: 'cohort_id' },
  funnels_data: { from: 'funnels_list', param: 'funnel_id' },
  ab_experiments_details: { from: 'ab_experiments_list', param: 'experiment_id' },
  email_reports_preview: { from: 'email_reports_list', param: 'report_id' },
  journeys_get: { from: 'journeys_list', param: 'journey_id' },
  journeys_stats_summary: { from: 'journeys_list', param: 'journey_id' },
  journeys_stats_table: { from: 'journeys_list', param: 'journey_id' },
  journeys_stats_performance: { from: 'journeys_list', param: 'journey_id' },
  content_blocks_get: { from: 'content_blocks_list', param: 'content_id' },
  content_blocks_preview: { from: 'content_blocks_list', param: 'content_id' },
  dashboards_data: { from: 'dashboards_list', param: 'dashboard_id' },
  user_profiles_get: {
    from: 'user_profiles_query',
    param: 'uid',
    pick: (json) => findDeep(json, (n) => !Array.isArray(n) && typeof n.uid === 'string')?.uid,
  },
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
  concurrency = 4
): Promise<SmokeOutcome[]> {
  const visible = new Map(tools.map((t) => [t.name, t]));
  const candidates = tools.filter((t) => isReadOnlyTool(t.name));

  // List calls feed ID resolution, so run them (memoised) before dependants.
  const listResults = new Map<string, Promise<{ ok: boolean; json: unknown; text: string }>>();
  const callList = (name: string) => {
    if (!listResults.has(name)) {
      const tool = visible.get(name)!;
      listResults.set(name, client.callTool(name, baseArgs(tool, appId)).then(
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
      const id = (source.pick || firstId)(list.json, appId);
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
    // ID source lists are called with base args only; reuse that call.
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
