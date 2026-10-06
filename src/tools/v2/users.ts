/**
 * user_profiles_breakdown: Countly Platform /v2 variant (/v2/users/breakdown)
 *
 * Same aggregation as legacy /o?method=user_details&projectionKey (which also
 * groups by the first key only), plus a top-N limit and each bucket's share.
 * Falls back to legacy when the users v2 route is unavailable.
 *
 * user_profiles_get stays legacy: v2 has no single-profile endpoint.
 */

import { jsonResult, V2ApiError, v2ErrorResult, v2Request } from '../../lib/v2-api.js';
import type { ToolContext, ToolResult } from '../types.js';

export const usersV2ToolDefinitions: Record<string, any> = {
  user_profiles_breakdown: {
    name: 'user_profiles_breakdown',
    description: 'Count app users per value of one profile property (e.g. country, platform, app version, a custom property), optionally over a user filter. Returns the top values with user counts and share. Requires the users plugin. For the profile records use user_profiles_query.',
    inputSchema: {
      type: 'object',
      properties: {
        app_id: { type: 'string', description: 'Application ID. Either app_id or app_name must be provided; call apps_list first if you do not know it.' },
        app_name: { type: 'string', description: 'Application name (alternative to app_id). Must match an existing app exactly; call apps_list to find valid names.' },
        projection_key: {
          type: 'string',
          description: 'Profile property to group by, e.g. "cc" (country), "p" (platform), "av" (app version), "d" (device), "custom.plan". A JSON array such as \'["cc"]\' is accepted; only its first key is used.',
        },
        query: { type: 'string', description: 'Optional user filter as a JSON string, e.g. \'{"p":"Android"}\'. Field names go WITHOUT the "up." prefix.' },
        limit: { type: 'number', description: 'Number of top values to return (default 50).' },
      },
      required: ['projection_key'],
    },
  },
};

const FALLBACK_STATUSES = [401, 403, 404, 501, 503];

function firstKey(projectionKey: unknown): string {
  const raw = String(projectionKey ?? '').trim();
  if (raw.startsWith('[')) {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) && parsed.length ? String(parsed[0]) : '';
    } catch {
      return raw;
    }
  }
  return raw;
}

export async function handleBreakdownUserProfilesV2(
  context: ToolContext,
  args: any,
  legacy: (args: any) => Promise<ToolResult>
): Promise<ToolResult> {
  try {
    const app_id = await context.resolveAppId(args);
    const key = firstKey(args.projection_key);
    if (!key) {
      return v2ErrorResult('break down user profiles', new Error('projection_key is required'));
    }
    const query = typeof args.query === 'string' ? args.query.trim() : args.query ? JSON.stringify(args.query) : '';
    if (query && query !== '{}') {
      try {
        JSON.parse(query);
      } catch {
        return v2ErrorResult('break down user profiles', new Error(`Invalid query JSON: ${query}`));
      }
    }
    let data: any;
    try {
      data = await v2Request<any>(context, 'get', '/v2/users/breakdown', {
        params: {
          app_id,
          projectionKey: key,
          limit: Math.max(1, Number(args.limit ?? 50)),
          ...(query && query !== '{}' ? { query } : {}),
        },
      });
    } catch (error) {
      if (error instanceof V2ApiError && FALLBACK_STATUSES.includes(error.status)) {
        return legacy({ ...args, projection_key: JSON.stringify([key]) });
      }
      throw error;
    }
    const filtered = Number(data?.filtered ?? 0);
    const buckets = (data?.breakDownData || []).map((row: any) => ({
      value: row._id === '' || row._id === null || row._id === undefined ? '(not set)' : row._id,
      users: row.sum,
      ...(filtered > 0 ? { pct: Math.round((row.sum / filtered) * 1000) / 10 } : {}),
    }));
    return jsonResult(`User breakdown by "${key}" for app ${app_id}`, {
      property: key,
      matching_users: filtered,
      total_users: data?.total,
      values: buckets,
      ...(typeof data?.lastRefresh === 'string' ? { data_as_of: data.lastRefresh } : {}),
    });
  } catch (error) {
    return v2ErrorResult('break down user profiles', error);
  }
}
