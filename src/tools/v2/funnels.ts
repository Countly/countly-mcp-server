/**
 * Funnel tools: Countly Platform /v2 variants
 *
 * - funnels_list: server-side paging with totals
 * - funnels_data: adds median / p95 time between steps; conversion
 *   percentages are computed here because v2 leaves them to the client
 * - funnels_step_users / funnels_dropoff_users: full user profiles instead
 *   of bare uids (via /v2/drill/users). Fall back to legacy when the drill
 *   profile service is unavailable or a legacy-only filter is used.
 *
 * Create/update/delete stay on the legacy API.
 */

import { fetchByOffset, jsonResult, V2ApiError, v2ErrorResult, v2Request } from '../../lib/v2-api.js';
import type { ToolContext, ToolResult } from '../types.js';

const appProps = {
  app_id: { type: 'string', description: 'Application ID. Either app_id or app_name must be provided; call apps_list first if you do not know it.' },
  app_name: { type: 'string', description: 'Application name (alternative to app_id). Must match an existing app exactly.' },
};
const periodProp = {
  period: { type: 'string', description: 'Time period: "30days" (default), "7days", "60days", "90days", "month", "yesterday", or a custom range as "[startMs,endMs]".' },
};
const usersPaging = {
  limit: { type: 'number', description: 'Users per page (default 20, max 100).' },
  offset: { type: 'number', description: 'Users to skip for paging (default 0).' },
  filter: { type: 'string', description: 'Optional user filter as a JSON string, e.g. {"up.cc":"DE"}. When given, only user ids are returned (no profiles or paging).' },
};

export const funnelsV2ToolDefinitions: Record<string, any> = {
  funnels_list: {
    name: 'funnels_list',
    description: 'List conversion funnels of an app with their steps, step filters and type, paginated and optionally name-filtered. Use funnels_data for conversion numbers. Requires the funnels plugin.',
    inputSchema: {
      type: 'object',
      properties: {
        ...appProps,
        skip: { type: 'number', description: 'Number of funnels to skip for paging. Defaults to 0.' },
        limit: { type: 'number', description: 'Maximum number of funnels to return. Defaults to 10.' },
        search: { type: 'string', description: 'Case-insensitive substring filter on funnel name.' },
      },
    },
  },
  funnels_data: {
    name: 'funnels_data',
    description: 'Conversion results of a funnel for a period: users and occurrences per step, conversion from the first and from the previous step, drop-off, and average / median / p95 time between steps. Requires the funnels plugin. For trends use funnels_trends, for who converted use funnels_step_users.',
    inputSchema: {
      type: 'object',
      properties: {
        ...appProps,
        funnel_id: { type: 'string', description: 'Funnel id from funnels_list.' },
        ...periodProp,
        filter: { type: 'string', description: 'Optional user filter as a JSON string, e.g. {"up.cc":"DE"}.' },
      },
      required: ['funnel_id'],
    },
  },
  funnels_step_users: {
    name: 'funnels_step_users',
    description: 'Users who reached a funnel step, with their profile (name, email, country, platform, device, sessions, last seen), paginated. Requires the funnels plugin. For users who dropped off use funnels_dropoff_users.',
    inputSchema: {
      type: 'object',
      properties: {
        ...appProps,
        funnel_id: { type: 'string', description: 'Funnel id from funnels_list.' },
        step: { type: 'number', description: 'Step index, 0-based (0 = first step).' },
        ...periodProp,
        ...usersPaging,
      },
      required: ['funnel_id', 'step'],
    },
  },
  funnels_dropoff_users: {
    name: 'funnels_dropoff_users',
    description: 'Users who reached one funnel step but not the next, with their profile, paginated. Requires the funnels plugin. For users who reached a step use funnels_step_users.',
    inputSchema: {
      type: 'object',
      properties: {
        ...appProps,
        funnel_id: { type: 'string', description: 'Funnel id from funnels_list.' },
        from_step: { type: 'number', description: 'Step the users reached, 0-based. Use -1 for users who never entered the funnel.' },
        to_step: { type: 'number', description: 'Step they did not reach, 0-based.' },
        ...periodProp,
        ...usersPaging,
      },
      required: ['funnel_id', 'from_step', 'to_step'],
    },
  },
};

const pct = (part: number, whole: number): number => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : 0);
const seconds = (ms: unknown): number | undefined => (typeof ms === 'number' ? Math.round(ms / 100) / 10 : undefined);

/** Add the conversion figures the legacy endpoint computed server-side */
export function summariseFunnel(data: any): any {
  const steps = Array.isArray(data?.steps) ? data.steps : [];
  const first = steps[0]?.users ?? 0;
  return {
    users_in_first_step: data.users_in_first_step ?? first,
    success_users: data.success_users,
    success_rate: data.success_rate,
    steps: steps.map((step: any, i: number) => {
      const prev = i === 0 ? step.users : steps[i - 1].users;
      return {
        step: step.step,
        query: step.query && Object.keys(step.query).length > 0 ? step.query : undefined,
        users: step.users,
        times: step.times,
        conversionFromFirstPct: pct(step.users, first),
        conversionFromPreviousPct: pct(step.users, prev),
        droppedFromPrevious: i === 0 ? 0 : prev - step.users,
        ...(i > 0 ? {
          avgTimeFromPreviousSec: seconds(step.averageTimeSpend),
          medianTimeFromPreviousSec: seconds(step.p50TimeSpend),
          p95TimeFromPreviousSec: seconds(step.p95TimeSpend),
        } : {}),
        ...(Array.isArray(step.metrics) && step.metrics.length > 0 ? { metrics: step.metrics } : {}),
      };
    }),
    ...(data.cache_generated ? { generatedAt: new Date(data.cache_generated).toISOString() } : {}),
  };
}

export async function handleListFunnelsV2(context: ToolContext, args: any): Promise<ToolResult> {
  try {
    const app_id = await context.resolveAppId(args);
    const limit = Math.max(1, Number(args.limit ?? 10));
    const skip = Math.max(0, Number(args.skip ?? 0));
    const data = await fetchByOffset(skip, limit, async (page, pageSize) => {
      const res = await v2Request<any>(context, 'get', '/v2/funnels', {
        params: { app_id, page, pageSize, ...(args.search ? { search: args.search } : {}) },
      });
      return { ...res, items: res.funnels || [] };
    });
    const funnels = data.items.map((f: any) => ({
      id: f._id,
      name: f.name,
      description: f.description || undefined,
      type: f.type,
      steps: (f.steps || []).map((step: string, i: number) => {
        // queries[i] is the stored filter (what funnels_update takes);
        // queryTexts[i] is only its readable label
        const query = typeof f.queries?.[i] === 'string' && f.queries[i] !== '{}' ? f.queries[i] : undefined;
        return {
          event: step,
          ...(query ? { filter: query } : {}),
          ...(f.queryTexts?.[i] ? { filterText: f.queryTexts[i] } : {}),
        };
      }),
      created: f.created ? new Date(f.created).toISOString() : undefined,
    }));
    return jsonResult(`Funnels for app ${app_id} (${data.total} total)`, funnels);
  } catch (error) {
    return v2ErrorResult('list funnels', error);
  }
}

export async function handleGetFunnelDataV2(context: ToolContext, args: any): Promise<ToolResult> {
  try {
    const app_id = await context.resolveAppId(args);
    const params: Record<string, unknown> = { app_id, funnel: args.funnel_id, period: args.period || '30days' };
    if (args.filter && args.filter !== '{}') {
      params.filter = args.filter;
    }
    const data = await v2Request<any>(context, 'get', '/v2/funnels/funnel', { params });
    if (data?.task_id) {
      return jsonResult('Funnel is still computing', { status: 'computing', task_id: data.task_id, note: 'Call funnels_data again in a little while.' });
    }
    return jsonResult(`Funnel ${args.funnel_id} for app ${app_id}`, summariseFunnel(data));
  } catch (error) {
    return v2ErrorResult('get funnel data', error);
  }
}

/** Profiles for a funnel uid leg, or null when the v2 profile service can't serve it */
async function funnelUsers(context: ToolContext, args: any, leg: Record<string, string>): Promise<any | null> {
  const app_id = await context.resolveAppId(args);
  const limit = Math.min(100, Math.max(1, Number(args.limit ?? 20)));
  try {
    return {
      app_id,
      ...(await v2Request<any>(context, 'post', '/v2/drill/users', {
        body: {
          app_id,
          funnelQuery: { app_id, funnel: args.funnel_id, period: args.period || '30days', ...leg },
          limit,
          offset: Math.max(0, Number(args.offset ?? 0)),
        },
      })),
    };
  } catch (error) {
    // drill / ClickHouse profile mirror unavailable, or no drill rights
    if (error instanceof V2ApiError && [401, 403, 404, 501, 503].includes(error.status)) {
      return null;
    }
    throw error;
  }
}

function usersResult(title: string, data: any): ToolResult {
  return jsonResult(`${title} (${data.meta?.total ?? data.rows?.length ?? 0} total${data.meta?.hasMore ? ', more available with offset' : ''})`, data.rows || []);
}

export async function handleFunnelStepUsersV2(
  context: ToolContext,
  args: any,
  legacy: () => Promise<ToolResult>
): Promise<ToolResult> {
  if (args.filter && args.filter !== '{}') {
    return legacy();
  }
  try {
    const data = await funnelUsers(context, args, { users_for_step: String(args.step) });
    return data ? usersResult(`Users who reached step ${args.step} of funnel ${args.funnel_id}`, data) : legacy();
  } catch (error) {
    return v2ErrorResult('get funnel step users', error);
  }
}

export async function handleFunnelDropoffUsersV2(
  context: ToolContext,
  args: any,
  legacy: () => Promise<ToolResult>
): Promise<ToolResult> {
  if (args.filter && args.filter !== '{}') {
    return legacy();
  }
  try {
    const data = await funnelUsers(context, args, { users_between_steps: `${args.from_step}|${args.to_step}` });
    return data
      ? usersResult(`Users who reached step ${args.from_step} but not step ${args.to_step} of funnel ${args.funnel_id}`, data)
      : legacy();
  } catch (error) {
    return v2ErrorResult('get funnel drop-off users', error);
  }
}
