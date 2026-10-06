/**
 * Platform Insights Tools
 *
 * Read-only analytics that only Countly Platform's /v2 API offers: ranked and
 * trending events, top views, crash group breakdowns and funnel analysis.
 * These tools are listed only when the connected server serves /v2.
 */

import { jsonResult, v2ErrorResult, v2Request } from '../lib/v2-api.js';
import type { ToolContext, ToolResult } from './types.js';
import { drillQueryToolDefinition, handleDrillQuery } from './v2/drill.js';

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
    description: 'Time period: "today", "yesterday", "7days", "30days" (default), "60days", "90days", "month", or a custom range as "[startMs,endMs]".',
  },
};

const limitProp = (def: number, max: number) => ({
  limit: { type: 'number', description: `Number of entries per list (default ${def}, max ${max}).` },
});

function periodParam(period: unknown): string | undefined {
  if (period === undefined || period === null || period === '') {
    return undefined;
  }
  return typeof period === 'string' ? period : JSON.stringify(period);
}

// ─── Definitions ──────────────────────────────────────────────────────────────

export const eventsSummaryTool = {
  name: 'events_summary',
  description: 'All custom events of an app with their totals for a period: count, sum, duration and per-occurrence averages, sorted by count. Fast overview of what users do. Countly Platform only.',
  inputSchema: { type: 'object', properties: { ...appProps, ...periodProp }, required: [] },
};

export const eventsTopTool = {
  name: 'events_top',
  description: 'Top custom events of an app ranked three ways for a period: by count, by average sum per occurrence, and by average duration, each with its share of the total. Countly Platform only.',
  inputSchema: { type: 'object', properties: { ...appProps, ...periodProp, ...limitProp(5, 50) }, required: [] },
};

export const eventsMoversTool = {
  name: 'events_movers',
  description: 'Custom events that changed most versus the previous period of the same length: "growers" (count, previous count, growth %, daily series) and "newcomers" (events new in this period). Good for spotting trends and anomalies. Countly Platform only.',
  inputSchema: {
    type: 'object',
    properties: {
      ...appProps,
      ...periodProp,
      ...limitProp(5, 50),
      min_prev: { type: 'number', description: 'Minimum count in the previous period for an event to rank as a grower (default 100); lower it for small apps.' },
    },
    required: [],
  },
};

export const viewsTopTool = {
  name: 'views_top',
  description: 'Top views/pages of an app per metric for a period. Metrics: "count" (views), "avg_duration", "bounce_rate", "bounces", "landings", "exits", "avg_scroll". Returns one ranked list per metric (by_<metric>). Countly Platform only.',
  inputSchema: {
    type: 'object',
    properties: {
      ...appProps,
      ...periodProp,
      metrics: {
        type: 'array',
        items: { type: 'string', enum: ['count', 'avg_duration', 'bounce_rate', 'bounces', 'landings', 'exits', 'avg_scroll'] },
        description: 'Metrics to rank by. Default ["count", "avg_duration", "bounce_rate"].',
      },
      limit: { type: 'number', description: 'Views per metric (default 5, max 20).' },
      min_threshold: { type: 'number', description: 'Ignore views with fewer occurrences than this (useful for rate metrics such as bounce_rate).' },
    },
    required: [],
  },
};

export const crashGroupBreakdownTool = {
  name: 'crash_group_breakdown',
  description: 'Distribution of one crash group\'s occurrences over a field (top 10 values with counts), e.g. which OS versions, devices or app versions are affected. Countly Platform only.',
  inputSchema: {
    type: 'object',
    properties: {
      ...appProps,
      crash_id: { type: 'string', description: 'Crash group id from crash_groups_list.' },
      field: { type: 'string', description: 'Field to break down by, e.g. "os_version", "app_version", "device", "manufacture", "resolution", "orientation", "online", "root", or a custom crash segment as "custom.<key>".' },
      ...periodProp,
    },
    required: ['crash_id', 'field'],
  },
};

export const crashGroupUsersTool = {
  name: 'crash_group_users',
  description: 'User ids (uid) affected by a crash group. Use with user_profiles_get to inspect affected users. Countly Platform only.',
  inputSchema: {
    type: 'object',
    properties: { ...appProps, crash_id: { type: 'string', description: 'Crash group id from crash_groups_list.' } },
    required: ['crash_id'],
  },
};

export const funnelsBreakdownTool = {
  name: 'funnels_breakdown',
  description: 'Break down the users who reached one funnel step by a property (e.g. country, platform, app version), showing where conversion differs. Countly Platform only.',
  inputSchema: {
    type: 'object',
    properties: {
      ...appProps,
      funnel_id: { type: 'string', description: 'Funnel id from funnels_list.' },
      step: { type: 'number', description: 'Step index, 0-based (0 = first step).' },
      property: { type: 'string', description: 'Property to break down by: a user property "up.<key>" (e.g. "up.cc" country, "up.p" platform, "up.av" app version) or custom "custom.<key>".' },
      ...periodProp,
      limit: { type: 'number', description: 'Maximum number of property values.' },
    },
    required: ['funnel_id', 'step', 'property'],
  },
};

export const funnelsTrendsTool = {
  name: 'funnels_trends',
  description: 'Daily funnel trend: users entering, users completing and conversion rate per day. "is_settled" is false for days whose users may still complete. Countly Platform only.',
  inputSchema: {
    type: 'object',
    properties: { ...appProps, funnel_id: { type: 'string', description: 'Funnel id from funnels_list.' }, ...periodProp },
    required: ['funnel_id'],
  },
};

export const funnelsUserProgressTool = {
  name: 'funnels_user_progress',
  description: 'How far one user got in each funnel of the app during a period. Countly Platform only.',
  inputSchema: {
    type: 'object',
    properties: { ...appProps, uid: { type: 'string', description: 'User id (uid), e.g. from user_profiles_query or crash_group_users.' }, ...periodProp },
    required: ['uid'],
  },
};

export const platformInsightsToolDefinitions = [
  eventsSummaryTool,
  eventsTopTool,
  eventsMoversTool,
  viewsTopTool,
  crashGroupBreakdownTool,
  crashGroupUsersTool,
  funnelsBreakdownTool,
  funnelsTrendsTool,
  funnelsUserProgressTool,
  drillQueryToolDefinition,
];

// ─── Handlers ─────────────────────────────────────────────────────────────────

async function get(context: ToolContext, args: any, path: string, params: Record<string, unknown>, title: string, action: string): Promise<ToolResult> {
  try {
    const app_id = await context.resolveAppId(args);
    const query: Record<string, unknown> = { app_id };
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== '') {
        query[key] = value;
      }
    }
    return jsonResult(title, await v2Request(context, 'get', path, { params: query }));
  } catch (error) {
    return v2ErrorResult(action, error);
  }
}

const enc = encodeURIComponent;

export class PlatformInsightsTools {
  constructor(private context: ToolContext) {}

  async events_summary(args: any): Promise<ToolResult> {
    return get(this.context, args, '/v2/events/summary', { period: periodParam(args.period) ?? '30days' }, 'Events summary', 'get events summary');
  }

  async events_top(args: any): Promise<ToolResult> {
    return get(this.context, args, '/v2/events/top', { period: periodParam(args.period) ?? '30days', limit: args.limit }, 'Top events', 'get top events');
  }

  async events_movers(args: any): Promise<ToolResult> {
    return get(this.context, args, '/v2/events/movers', {
      period: periodParam(args.period) ?? '30days',
      limit: args.limit,
      min_prev: args.min_prev,
    }, 'Event movers', 'get event movers');
  }

  async views_top(args: any): Promise<ToolResult> {
    const names: string[] = Array.isArray(args.metrics) && args.metrics.length > 0
      ? args.metrics
      : ['count', 'avg_duration', 'bounce_rate'];
    const metrics = names.map((metric) => ({
      metric,
      ...(args.limit !== undefined ? { limit: args.limit } : {}),
      ...(args.min_threshold !== undefined ? { min_threshold: args.min_threshold } : {}),
    }));
    return get(this.context, args, '/v2/views/top', {
      period: periodParam(args.period) ?? '30days',
      metrics: JSON.stringify(metrics),
    }, 'Top views', 'get top views');
  }

  async crash_group_breakdown(args: any): Promise<ToolResult> {
    return get(this.context, args, `/v2/crashes/crashgroups/${enc(args.crash_id)}/breakdown`, {
      field: args.field,
      period: periodParam(args.period) ?? '30days',
    }, `Crash group breakdown by ${args.field}`, 'get crash group breakdown');
  }

  async crash_group_users(args: any): Promise<ToolResult> {
    return get(this.context, args, `/v2/crashes/crashgroups/${enc(args.crash_id)}/users`, {}, 'Affected users', 'get crash group users');
  }

  async funnels_breakdown(args: any): Promise<ToolResult> {
    return get(this.context, args, '/v2/funnels/breakdown', {
      funnel: args.funnel_id,
      step: args.step,
      property: args.property,
      period: periodParam(args.period) ?? '30days',
      limit: args.limit,
    }, `Funnel step ${args.step} breakdown by ${args.property}`, 'get funnel breakdown');
  }

  async funnels_trends(args: any): Promise<ToolResult> {
    return get(this.context, args, '/v2/funnels/trends', {
      funnel: args.funnel_id,
      period: periodParam(args.period) ?? '30days',
    }, 'Funnel trends', 'get funnel trends');
  }

  async drill_query(args: any): Promise<ToolResult> {
    return handleDrillQuery(this.context, args);
  }

  async funnels_user_progress(args: any): Promise<ToolResult> {
    return get(this.context, args, '/v2/funnels/user', {
      uid: args.uid,
      period: periodParam(args.period) ?? '30days',
    }, `Funnel progress of user ${args.uid}`, 'get user funnel progress');
  }
}

export const platformInsightsToolHandlers = Object.fromEntries(
  platformInsightsToolDefinitions.map((t) => [t.name, t.name])
) as Record<string, string>;

export const platformInsightsToolMetadata = {
  instanceKey: 'platformInsights',
  toolClass: PlatformInsightsTools,
  handlers: platformInsightsToolHandlers,
} as const;
