/**
 * Live (concurrent users) tools: Countly Platform /v2 variants
 *
 * GET /v2/concurrent_users/snapshot   → live_users
 * GET /v2/concurrent_users/historical → live_last_hour (perMinute),
 *                                       live_last_day (perHour, folded to hours),
 *                                       live_last_30_days (perDay)
 *
 * Unlike the legacy /o?method=concurrent call, v2 always carries the
 * new-profile counts next to the online counts. live_overall and live_metrics
 * stay legacy: v2's allTimeMax has no timestamp for the peak, and v2 has no
 * country/device/carrier breakdown of online users.
 */

import { jsonResult, V2ApiError, v2ErrorResult, v2Request } from '../../lib/v2-api.js';
import type { ToolContext, ToolResult } from '../types.js';

/** v2 statuses meaning "this route is not available to this user/server" */
const UNAVAILABLE = [401, 403, 404, 501, 503];

const appProps = {
  app_id: { type: 'string', description: 'Application ID. Either app_id or app_name must be provided; call apps_list first if you do not know it.' },
  app_name: { type: 'string', description: 'Application name (alternative to app_id). Must match an existing app exactly; call apps_list to find valid names.' },
};

const liveTool = (name: string, description: string) => ({
  name,
  description,
  inputSchema: { type: 'object', properties: { ...appProps } },
});

export const liveV2ToolDefinitions: Record<string, any> = {
  live_users: liveTool('live_users', 'Get the number of users online right now and how many of them are new users (a single snapshot), plus the activity window that counts as "online". Requires the concurrent_users plugin. For country/device/carrier breakdown use live_metrics.'),
  live_last_hour: liveTool('live_last_hour', 'Get the peak online-user and new-user counts for each minute of the last 60 minutes (60 points, oldest first). Requires the concurrent_users plugin. For longer windows use live_last_day or live_last_30_days.'),
  live_last_day: liveTool('live_last_day', 'Get the peak online-user and new-user counts for each hour of the last 24 hours (24 points, oldest first). Requires the concurrent_users plugin. For finer resolution use live_last_hour; for longer use live_last_30_days.'),
  live_last_30_days: liveTool('live_last_30_days', 'Get the daily peak online-user and new-user counts for the last 30 days (oldest first). Requires the concurrent_users plugin. For the all-time peak use live_overall.'),
};

interface OnlinePoint { t: number; value: number; newValue: number }

const iso = (ms: number) => new Date(ms).toISOString();

/** A regular series as parallel arrays: far fewer tokens than one object per point */
function series(raw: OnlinePoint[], label: (t: number) => string): Record<string, unknown> {
  const pts = Array.isArray(raw) ? raw : [];
  let best: OnlinePoint | null = null;
  for (const p of pts) {
    if (!best || p.value > best.value) {
      best = p;
    }
  }
  return {
    ...(pts.length > 0 ? { from: label(pts[0].t), to: label(pts[pts.length - 1].t) } : {}),
    peak: best && best.value > 0 ? { online: best.value, at: label(best.t) } : null,
    online: pts.map((p) => p.value),
    new: pts.map((p) => p.newValue),
  };
}

/** jsonResult, with number arrays kept on one line */
function seriesResult(title: string, data: unknown): ToolResult {
  const text = JSON.stringify(data, null, 2).replace(/\[\s*(-?[\d.]+(?:,\s*-?[\d.]+)*)\s*\]/g, (_m, list: string) => `[${list.split(/,\s*/).join(', ')}]`);
  return { content: [{ type: 'text', text: `${title}:\n${text}` }] };
}

/** v2 reports the day as half-hour points; fold each pair into its hour's maximum */
export function foldToHours(raw: OnlinePoint[] | undefined): OnlinePoint[] {
  const byHour = new Map<number, OnlinePoint>();
  for (const p of Array.isArray(raw) ? raw : []) {
    const hour = Math.floor(p.t / 3_600_000) * 3_600_000;
    const prev = byHour.get(hour);
    byHour.set(hour, prev
      ? { t: hour, value: Math.max(prev.value, p.value), newValue: Math.max(prev.newValue, p.newValue) }
      : { t: hour, value: p.value, newValue: p.newValue });
  }
  return [...byHour.values()].sort((a, b) => a.t - b.t).slice(-24);
}

/**
 * Daily points carry the END of the app-timezone day (23:59:59.999 local).
 * Twelve hours earlier is inside that day for every zone from UTC-12 to UTC+12.
 */
const dayOf = (endMs: number) => new Date(endMs - 12 * 3_600_000).toISOString().slice(0, 10);

async function withFallback(
  context: ToolContext,
  path: string,
  args: any,
  legacy: () => Promise<ToolResult>,
  render: (appId: string, data: any) => ToolResult,
  action: string
): Promise<ToolResult> {
  try {
    const app_id = await context.resolveAppId(args);
    let data: any;
    try {
      data = await v2Request<any>(context, 'get', path, { params: { app_id } });
    } catch (error) {
      if (error instanceof V2ApiError && UNAVAILABLE.includes(error.status)) {
        return legacy();
      }
      throw error;
    }
    return render(app_id, data || {});
  } catch (error) {
    return v2ErrorResult(action, error);
  }
}

export function handleLiveUsersV2(context: ToolContext, args: any, legacy: () => Promise<ToolResult>): Promise<ToolResult> {
  return withFallback(context, '/v2/concurrent_users/snapshot', args, legacy, (appId, d) => jsonResult(
    `Users online now in app ${appId}`,
    {
      online: d.total ?? 0,
      newOnline: d.newProfiles ?? 0,
      onlineWindowSec: d.windowSec,
      ...(typeof d.cutoffSec === 'number' ? { activeSince: iso(d.cutoffSec * 1000) } : {}),
    }
  ), 'get live users');
}

export function handleLiveLastHourV2(context: ToolContext, args: any, legacy: () => Promise<ToolResult>): Promise<ToolResult> {
  return withFallback(context, '/v2/concurrent_users/historical', args, legacy, (appId, d) => {
    return seriesResult(`Online users per minute, last hour, oldest first - app ${appId}`, { resolution: '1 minute', ...series(d.perMinute, iso) });
  }, 'get live data for last hour');
}

export function handleLiveLastDayV2(context: ToolContext, args: any, legacy: () => Promise<ToolResult>): Promise<ToolResult> {
  return withFallback(context, '/v2/concurrent_users/historical', args, legacy, (appId, d) => {
    return seriesResult(`Online users per hour, last 24 hours, oldest first - app ${appId}`, { resolution: '1 hour', ...series(foldToHours(d.perHour), iso) });
  }, 'get live data for last day');
}

export function handleLiveLast30DaysV2(context: ToolContext, args: any, legacy: () => Promise<ToolResult>): Promise<ToolResult> {
  return withFallback(context, '/v2/concurrent_users/historical', args, legacy, (appId, d) => {
    return seriesResult(`Daily peak online users, last 30 days, oldest first - app ${appId}`, { resolution: '1 day', ...series(d.perDay, dayOf) });
  }, 'get live data for last 30 days');
}
