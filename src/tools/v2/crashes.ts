/**
 * Crash tools: Countly Platform /v2 variants
 *
 * crash_groups_list gains server-side search and sorting and returns lean
 * rows. Resolve/unresolve/hide/show use PUT /v2/crashes/crashgroups/:id.
 * Detail (crashes_get keeps comments only on the legacy endpoint), comments
 * and crashes_stats_get (no v2 stats/graph endpoint) stay on the legacy API.
 */

import { jsonResult, v2ErrorResult, v2Request } from '../../lib/v2-api.js';
import type { ToolContext, ToolResult } from '../types.js';

export const crashesV2ToolDefinitions: Record<string, any> = {
  crash_groups_list: {
    name: 'crash_groups_list',
    description: 'List crash groups (deduplicated crash/error buckets) of an app with filtering, search, sorting and paging. Each row has id, name, OS, fatal/non-fatal, state, reports, affected users, first/last seen and latest app version; the stack trace is shortened (use crashes_get for full detail). Requires the crashes plugin.',
    inputSchema: {
      type: 'object',
      properties: {
        app_id: { type: 'string', description: 'Application ID. Either app_id or app_name must be provided; call apps_list first if you do not know it.' },
        app_name: { type: 'string', description: 'Application name (alternative to app_id). Must match an existing app exactly.' },
        period: { type: 'string', description: 'Time period: "30days" (default), "7days", "60days", "month", "yesterday", or a custom range as "[startMs,endMs]".' },
        query: { type: 'string', description: 'Filter as a JSON string. Group state: {"is_resolved": false}, {"is_new": true}, {"is_hidden": true}, {"nonfatal": false}; occurrence properties such as {"os": "Android"}, {"app_version": "2.1"}, {"custom.<key>": "x"}.' },
        search: { type: 'string', description: 'Free-text search in crash names and errors.' },
        sort_by: { type: 'string', enum: ['name', 'os', 'reports', 'lastTs', 'users', 'latest_version'], description: 'Sort column (default: last seen).' },
        sort_dir: { type: 'string', enum: ['asc', 'desc'], description: 'Sort direction (default desc).' },
        skip: { type: 'number', description: 'Number of groups to skip for paging. Defaults to 0.' },
        limit: { type: 'number', description: 'Maximum number of groups to return. Defaults to 10.' },
      },
    },
  },
};

/** First lines of a stack trace: enough to recognise the crash */
function shortError(error: unknown, lines = 4): unknown {
  if (typeof error !== 'string') {
    return error;
  }
  const all = error.split('\n');
  return all.length > lines ? `${all.slice(0, lines).join('\n')}\n… (${all.length - lines} more lines)` : error;
}

export async function handleListCrashGroupsV2(context: ToolContext, args: any): Promise<ToolResult> {
  try {
    const app_id = await context.resolveAppId(args);
    const params: Record<string, unknown> = {
      app_id,
      period: args.period || '30days',
      limit: args.limit ?? 10,
      offset: args.skip ?? 0,
    };
    if (args.query && args.query !== '{}') {
      params.query = typeof args.query === 'string' ? args.query : JSON.stringify(args.query);
    }
    for (const key of ['search', 'sort_by', 'sort_dir']) {
      if (args[key]) {
        params[key] = args[key];
      }
    }
    const data = await v2Request<any>(context, 'get', '/v2/crashes/crashgroups', { params });
    const rows = (data.rows || []).map((row: any) => ({
      id: row._id,
      name: row.name,
      os: row.os,
      nonfatal: row.nonfatal,
      is_new: row.is_new,
      is_resolved: row.is_resolved,
      reports: row.reports,
      users: row.users,
      firstSeen: row.startTs ? new Date(row.startTs).toISOString() : undefined,
      lastSeen: row.lastTs ? new Date(row.lastTs).toISOString() : undefined,
      latest_version: row.latest_version,
      error: shortError(row.error),
    }));
    return jsonResult(`Crash groups for app ${app_id} (${data.total} total, showing ${rows.length} from offset ${data.offset})`, rows);
  } catch (error) {
    return v2ErrorResult('list crash groups', error);
  }
}

export type CrashGroupAction = 'resolve' | 'unresolve' | 'hide' | 'show';

const ACTION_DONE: Record<CrashGroupAction, string> = {
  resolve: 'resolved',
  unresolve: 'unresolved',
  hide: 'hidden',
  show: 'shown',
};

/** crashes_resolve / _unresolve / _hide / _show via PUT /v2/crashes/crashgroups/:id */
export async function handleCrashGroupActionV2(context: ToolContext, args: any, action: CrashGroupAction): Promise<ToolResult> {
  try {
    const app_id = await context.resolveAppId(args);
    const data = await v2Request<any>(context, 'put', `/v2/crashes/crashgroups/${encodeURIComponent(args.crash_id)}`, {
      params: { app_id },
      body: { app_id, action },
    });
    const state = {
      id: data?._id ?? args.crash_id,
      is_resolved: data?.is_resolved,
      is_hidden: data?.is_hidden,
      is_new: data?.is_new,
      resolved_version: data?.resolved_version ?? undefined,
    };
    return jsonResult(`Crash ${args.crash_id} ${ACTION_DONE[action]}`, state);
  } catch (error) {
    return v2ErrorResult(`${action} crash group`, error);
  }
}
