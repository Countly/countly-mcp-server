/**
 * SDK request log tool: Countly Platform /v2 variant
 *
 * Adds server-side paging, request-type / SDK / time-range filters and a
 * "has problems" filter, which make SDK integration debugging practical.
 */

import { jsonResult, v2ErrorResult, v2Request } from '../../lib/v2-api.js';
import type { ToolContext, ToolResult } from '../types.js';

export const loggerV2ToolDefinitions: Record<string, any> = {
  sdk_logs_list: {
    name: 'sdk_logs_list',
    description: 'List incoming SDK requests for an app (newest first): device, location, SDK name/version, request types and payload, server response and detected problems. Filter by request type, SDK, time range, text search or problem requests to debug an SDK integration. Requires the logger plugin.',
    inputSchema: {
      type: 'object',
      properties: {
        app_id: { type: 'string', description: 'Application ID. Either app_id or app_name must be provided; call apps_list first if you do not know it.' },
        app_name: { type: 'string', description: 'Application name (alternative to app_id). Must match an existing app exactly.' },
        types: {
          type: 'array',
          items: { type: 'string', enum: ['events', 'session', 'metrics', 'consent', 'crash', 'user_details'] },
          description: 'Only requests containing these data types.',
        },
        search: { type: 'string', description: 'Text search in requests (e.g. a device id or event key).' },
        sdk_name: { type: 'string', description: 'Only requests from this SDK, e.g. "objc-native-ios", "java-native-android", "javascript_native_web".' },
        has_problems: { type: 'boolean', description: 'true: only requests with detected problems; false: only clean requests.' },
        since: { type: 'number', description: 'Only requests received at or after this epoch-ms timestamp.' },
        until: { type: 'number', description: 'Only requests received at or before this epoch-ms timestamp.' },
        order: { type: 'string', enum: ['desc', 'asc'], description: 'By receive time; default "desc" (newest first).' },
        page: { type: 'number', description: 'Page number, 1-based (default 1).' },
        page_size: { type: 'number', description: 'Requests per page (default 10).' },
      },
    },
  },
};

export async function handleListSdkLogsV2(context: ToolContext, args: any): Promise<ToolResult> {
  try {
    const app_id = await context.resolveAppId(args);
    const params: Record<string, unknown> = {
      app_id,
      page: args.page ?? 1,
      pageSize: args.page_size ?? 10,
      sort: 'reqts',
      order: args.order || 'desc',
    };
    if (Array.isArray(args.types) && args.types.length > 0) {
      params.types = args.types.join(',');
    }
    if (args.search) {
      params.search = args.search;
    }
    if (args.sdk_name) {
      params.sdkName = args.sdk_name;
    }
    if (typeof args.has_problems === 'boolean') {
      params.hasProblems = String(args.has_problems);
    }
    for (const key of ['since', 'until']) {
      if (args[key] !== undefined) {
        params[key] = args[key];
      }
    }
    const data = await v2Request<any>(context, 'get', '/v2/logger/logs', { params });
    // Request headers are mostly proxy noise; drop them to save tokens
    const rows = (data.rows || []).map(({ h: _headers, ...row }: any) => ({
      ...row,
      receivedAt: row.reqts ? new Date(row.reqts).toISOString() : undefined,
    }));
    return jsonResult(
      `SDK requests for app ${app_id} (${data.total} total, page ${data.page}, logger ${data.state}${data.capped ? `, keeps last ${data.capped}` : ''})`,
      rows
    );
  } catch (error) {
    return v2ErrorResult('list SDK logs', error);
  }
}
