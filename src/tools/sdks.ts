import { ToolContext, ToolResult } from './types.js';
import { safeApiCall } from '../lib/error-handler.js';
import { parseBooleanParam } from '../lib/validation.js';

// ============================================================================
// GET_SDK_STATS TOOL
// ============================================================================

export const getSDKStatsToolDefinition = {
  name: 'sdk_stats_get',
  description: 'Get per-SDK usage statistics for an app via /o?method=sdks: the raw Countly time series (year > month > day > hour) of request types, health checks, request delay and per-SDK/version session counters, often 100K+ characters. '
    + 'To answer which SDKs or SDK versions users run, set summary: true for a compact table of SDKs and versions with sessions, new users and unique users as Countly computes them (/o/analytics/metric). '
    + 'For the request-type breakdown, health checks or request delay, call without summary. Requires the sdk plugin. For the SDK configuration sent back to clients use sdk_config_get.',
  inputSchema: {
    type: 'object',
    properties: {
      app_id: { type: 'string', description: 'Application ID. Either app_id or app_name must be provided; call apps_list first if you do not know it.' },
      app_name: { type: 'string', description: 'Application name (alternative to app_id). Must match an existing app exactly; call apps_list to find valid names.' },
      period: {
        type: 'string',
        description: 'Time period. One of "month", "60days", "30days", "7days", "yesterday", "hour", or a custom range as [startMilliseconds,endMilliseconds]. Defaults to "30days".',
        default: '30days'
      },
      summary: {
        type: 'boolean',
        description: 'When true, return per-SDK and per-version sessions, new users and unique users (sorted by sessions) instead of the raw time series. Leaves out request types, health checks and request delay. Defaults to false.',
        default: false
      },
    },
  },
};

export async function handleGetSDKStats(context: ToolContext, args: any): Promise<ToolResult> {
  const summary = args.summary === undefined || args.summary === null
    ? false
    : parseBooleanParam(args.summary, 'summary');
  if (summary) {
    return handleGetSDKStatsSummary(context, args);
  }

  const app_id = await context.resolveAppId(args);
  const period = args.period || '30days';

  const params = {
    ...context.getAuthParams(),
    app_id,
    method: 'sdks',
    period,
  };

  const response = await safeApiCall(
    () => context.httpClient.get('/o', { params }),
    'Failed to get SDK statistics'
  );

  return {
    content: [
      {
        type: 'text',
        text: `SDK statistics for app ${app_id} (period: ${period}):\n\n${JSON.stringify(response.data, null, 2)}`,
      },
    ],
  };
}

interface SDKCounts {
  sessions: number;
  newUsers: number;
  uniqueUsers: number;
}

interface SDKSummaryEntry extends SDKCounts {
  sdk: string;
  versions: Array<SDKCounts & { version: string }>;
}

/** "[java-native-android]_26:10:1": SDK name in brackets, version with ":" for "." */
const SDK_VERSION_ID = /^\[([^\]]+)\]_(.+)$/;

const SUMMARY_NOTE = 'sessions counts sessions (Countly "t"), not users. '
  + 'Unique users are computed by Countly per row and do not add up across SDKs or versions, so they are never summed.';

/** Countly's t/n/u counters of one /o/analytics/metric row */
function countsOf(row: any): SDKCounts {
  return {
    sessions: Number(row.t) || 0,
    newUsers: Number(row.n) || 0,
    uniqueUsers: Number(row.u) || 0,
  };
}

/** Sessions descending, then name (plain code-unit order, locale-independent) */
function bySessions<T extends { sessions: number }>(name: (item: T) => string) {
  return (a: T, b: T) => {
    if (a.sessions !== b.sessions) {
      return b.sessions - a.sessions;
    }
    const nameA = name(a);
    const nameB = name(b);
    return nameA < nameB ? -1 : nameA > nameB ? 1 : 0;
  };
}

async function fetchMetricRows(
  context: ToolContext,
  params: Record<string, unknown>,
  metric: 'sdks' | 'sdk_version'
): Promise<{ rows: any[] } | { error: ToolResult }> {
  const response = await safeApiCall(
    () => context.httpClient.get('/o/analytics/metric', { params: { ...params, metric } }),
    `Failed to get SDK summary (metric=${metric})`
  );
  if (Array.isArray(response.data)) {
    return { rows: response.data };
  }
  const data = response.data;
  let serverText = '(empty response)';
  if (typeof data?.result === 'string' && data.result !== '') {
    serverText = data.result;
  } else if (data !== undefined && data !== null && data !== '') {
    serverText = JSON.stringify(data);
  }
  return {
    error: {
      content: [{ type: 'text', text: `Failed to get SDK summary (metric=${metric}): unexpected response from Countly: ${serverText}` }],
      isError: true,
    },
  };
}

/**
 * sdk_stats_get with summary: true. Countly computes per-SDK and per-version
 * sessions, new users and unique users itself (/o/analytics/metric), the same
 * figures the dashboard shows. Unique users cannot be rebuilt from the raw
 * /o?method=sdks time series: its "u" is unique per day/week/month, so summing
 * it over the period overcounts.
 */
async function handleGetSDKStatsSummary(context: ToolContext, args: any): Promise<ToolResult> {
  const app_id = await context.resolveAppId(args);
  const period = args.period || '30days';
  const params = {
    ...context.getAuthParams(),
    app_id,
    period,
  };

  const [sdkResult, versionResult] = await Promise.all([
    fetchMetricRows(context, params, 'sdks'),
    fetchMetricRows(context, params, 'sdk_version'),
  ]);
  if ('error' in sdkResult) {
    return sdkResult.error;
  }
  if ('error' in versionResult) {
    return versionResult.error;
  }

  const prefix = `SDK statistics for app ${app_id} (period: ${period})`;
  if (sdkResult.rows.length === 0 && versionResult.rows.length === 0) {
    return {
      content: [{ type: 'text', text: `${prefix}: no SDK data for this app in this period.` }],
    };
  }

  const unmatched: Array<{ id: unknown; reason: string }> = [];
  const sdks = new Map<string, SDKSummaryEntry>();
  for (const row of sdkResult.rows) {
    if (typeof row?._id !== 'string' || row._id === '') {
      unmatched.push({ id: row?._id, reason: 'SDK row without an SDK name' });
      continue;
    }
    sdks.set(row._id, { sdk: row._id, ...countsOf(row), versions: [] });
  }

  for (const row of versionResult.rows) {
    const match = typeof row?._id === 'string' ? SDK_VERSION_ID.exec(row._id) : null;
    if (!match) {
      unmatched.push({ id: row?._id, reason: 'version id does not match "[sdk]_version"' });
      continue;
    }
    const entry = sdks.get(match[1]);
    if (!entry) {
      unmatched.push({ id: row._id, reason: `SDK "${match[1]}" is not in the per-SDK rows` });
      continue;
    }
    entry.versions.push({ version: match[2].replace(/:/g, '.'), ...countsOf(row) });
  }

  const sdkList = [...sdks.values()].sort(bySessions<SDKSummaryEntry>((s) => s.sdk));
  for (const entry of sdkList) {
    entry.versions.sort(bySessions<SDKCounts & { version: string }>((v) => v.version));
  }

  const result = {
    period,
    app_id,
    sdks: sdkList,
    totals: {
      sessions: sdkList.reduce((sum, s) => sum + s.sessions, 0),
      newUsers: sdkList.reduce((sum, s) => sum + s.newUsers, 0),
    },
    note: SUMMARY_NOTE,
    ...(unmatched.length ? { unmatched } : {}),
  };

  return {
    content: [{ type: 'text', text: `${prefix}:\n\n${JSON.stringify(result, null, 2)}` }],
  };
}

// ============================================================================
// GET_SDK_CONFIG TOOL
// ============================================================================

export const getSDKConfigToolDefinition = {
  name: 'sdk_config_get',
  description: 'Get the SDK configuration object Countly serves to client SDKs for this app (feature flags, tracking toggles, rate limits) via /o?method=sdk-config. Requires the sdks plugin. For per-SDK traffic stats use sdk_stats_get.',
  inputSchema: {
    type: 'object',
    properties: {
      app_id: { type: 'string', description: 'Application ID. Either app_id or app_name must be provided; call apps_list first if you do not know it.' },
      app_name: { type: 'string', description: 'Application name (alternative to app_id). Must match an existing app exactly; call apps_list to find valid names.' },
    },
  },
};

export async function handleGetSDKConfig(context: ToolContext, args: any): Promise<ToolResult> {
  const app_id = await context.resolveAppId(args);

  const params = {
    ...context.getAuthParams(),
    app_id,
    method: 'sdk-config',
  };

  const response = await safeApiCall(
    () => context.httpClient.get('/o', { params }),
    'Failed to get SDK configuration'
  );

  return {
    content: [
      {
        type: 'text',
        text: `SDK configuration for app ${app_id}:\n\n${JSON.stringify(response.data, null, 2)}`,
      },
    ],
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export const sdksToolDefinitions = [
  getSDKStatsToolDefinition,
  getSDKConfigToolDefinition,
];

export const sdksToolHandlers = {
  'sdk_stats_get': 'sdk_stats_get',
  'sdk_config_get': 'sdk_config_get',
} as const;

// ============================================================================
// TOOL CLASS
// ============================================================================

export class SDKsTools {
  constructor(private context: ToolContext) {}

  async sdk_stats_get(args: any): Promise<ToolResult> {
    return handleGetSDKStats(this.context, args);
  }

  async sdk_config_get(args: any): Promise<ToolResult> {
    return handleGetSDKConfig(this.context, args);
  }
}

// ============================================================================
// METADATA
// ============================================================================

export const sdksToolMetadata = {
  instanceKey: 'sdks',
  toolClass: SDKsTools,
  handlers: sdksToolHandlers,
} as const;
