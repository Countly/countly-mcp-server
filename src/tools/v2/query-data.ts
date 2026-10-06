/**
 * query_data on Countly Platform
 *
 * Same arguments and behaviour as everywhere else: its drill mode still runs
 * the legacy /o?method=segmentation call, which Platform serves, so existing
 * callers keep the response shape they parse. Only the description changes,
 * pointing richer analysis (metrics, unique users, formulas, cohorts,
 * paging) to drill_query.
 */

import { queryDataToolDefinition } from '../analytics.js';

export const queryDataV2ToolDefinitions: Record<string, any> = {
  query_data: {
    ...queryDataToolDefinition,
    description: 'Query analytics data in one of three modes selected by query_type: "analytics" for built-in breakdowns (locations, devices, carriers, app versions, etc.), "events" for event totals via /o/analytics/events, or "drill" for the classic drill segmentation of one event (count, users, sum, duration per time bucket, with query_object filter and projection_key breakdown). For new drill analysis prefer drill_query: several events and metrics at once, unique users, averages and percentiles, formulas, cohorts and paged breakdowns. For the single-call app overview use app_analytics_summary; for event key management use events_list.',
  },
};
