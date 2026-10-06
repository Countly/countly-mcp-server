/**
 * events_list: Countly Platform /v2 variant
 *
 * The catalog comes from /v2/drill/events (server-side search and paging,
 * display names, metric labels, and events drill has seen that the events
 * collection does not list). /v2 has no segments, so they are added from the
 * legacy /o?method=get_events document, which also backs the fallback when
 * drill is unavailable to the user.
 *
 * events_create / events_delete have no v2 equivalent and stay legacy.
 */

import { safeApiCall } from '../../lib/error-handler.js';
import { jsonResult, V2ApiError, v2ErrorResult, v2Request } from '../../lib/v2-api.js';
import type { ToolContext, ToolResult } from '../types.js';
import { INTERNAL_EVENTS } from '../events.js';

export const eventsV2ToolDefinitions: Record<string, any> = {
  events_list: {
    name: 'events_list',
    description: 'List the custom events of an app: key, display name, description, category, metric labels and segment names, sorted by name, searchable and paginated. Built-in [CLY]_* events and their segments are listed on the first page. For event totals use events_summary or query_data.',
    inputSchema: {
      type: 'object',
      properties: {
        app_id: { type: 'string', description: 'Application ID. Either app_id or app_name must be provided; call apps_list first if you do not know it.' },
        app_name: { type: 'string', description: 'Application name (alternative to app_id). Must match an existing app exactly; call apps_list to find valid names.' },
        search: { type: 'string', description: 'Case-insensitive substring filter on the event key.' },
        limit: { type: 'number', description: 'Maximum number of custom events to return (default 100, max 500).' },
        skip: { type: 'number', description: 'Number of custom events to skip for paging (default 0).' },
        include_internal: { type: 'boolean', description: 'List the built-in [CLY]_* events on the first page (default true).' },
      },
    },
  },
};


const DRILL_UNAVAILABLE = [401, 403, 404, 501, 503];

async function legacyEventsDoc(context: ToolContext, app_id: string): Promise<any> {
  const response = await safeApiCall(
    () => context.httpClient.get('/o', { params: { ...context.getAuthParams(), app_id, method: 'get_events' } }),
    'Failed to execute request to get events list'
  );
  return response.data && typeof response.data === 'object' && !Array.isArray(response.data) ? response.data : {};
}

const segmentsOf = (doc: any, key: string): string[] =>
  (Array.isArray(doc.segments?.[key]) ? doc.segments[key] : []).filter((s: unknown) => typeof s === 'string' && s);

export async function handleEventsListV2(context: ToolContext, args: any): Promise<ToolResult> {
  try {
    const app_id = await context.resolveAppId(args);
    const limit = Math.min(500, Math.max(1, Number(args.limit ?? 100)));
    const skip = Math.max(0, Number(args.skip ?? 0));
    const search = typeof args.search === 'string' ? args.search.trim() : '';

    const legacyPromise = legacyEventsDoc(context, app_id);
    legacyPromise.catch(() => undefined); // awaited below; avoid an unhandled rejection meanwhile
    let page: { events: any[]; total: number };
    let source = 'drill';
    try {
      page = await v2Request<any>(context, 'get', '/v2/drill/events', {
        params: { app_id, limit, skip, ...(search ? { search } : {}) },
      });
    } catch (error) {
      if (!(error instanceof V2ApiError && DRILL_UNAVAILABLE.includes(error.status))) {
        throw error;
      }
      // No drill (plugin off or no drill rights): page the legacy list here
      source = 'legacy';
      const doc = await legacyPromise;
      const needle = search.toLowerCase();
      const keys: string[] = (doc.list || [])
        .filter((k: string) => !k.startsWith('[CLY]') && (!needle || k.toLowerCase().includes(needle)));
      const named = keys.map((key) => ({ key, name: doc.map?.[key]?.name || key }))
        .sort((a, b) => a.name.localeCompare(b.name));
      page = { events: named.slice(skip, skip + limit), total: named.length };
    }

    const doc = await legacyPromise;
    const events = (page.events || []).map((event: any) => {
      const meta = doc.map?.[event.key] || {};
      const segments = segmentsOf(doc, event.key);
      return {
        key: event.key,
        ...(event.name && event.name !== event.key ? { name: event.name } : {}),
        ...(meta.description ? { description: meta.description } : {}),
        ...(meta.category ? { category: meta.category } : {}),
        ...(event.metricLabels ? { metric_labels: event.metricLabels } : {}),
        ...(meta.is_visible === false ? { hidden: true } : {}),
        segments,
      };
    });

    const result: any = {
      total: page.total,
      offset: skip,
      events,
      ...(skip + events.length < page.total ? { next_skip: skip + events.length } : {}),
    };
    if (skip === 0 && args.include_internal !== false) {
      const needle = search.toLowerCase();
      result.internal_events = Object.entries(INTERNAL_EVENTS)
        .filter(([key]) => !needle || key.toLowerCase().includes(needle))
        .map(([key, segments]) => ({
          key,
          segments: [...new Set([...Object.keys(segments), ...segmentsOf(doc, key)])],
        }));
    }
    return jsonResult(`Custom events of app ${app_id} (${page.total} total${source === 'legacy' ? ', drill unavailable' : ''})`, result);
  } catch (error) {
    return v2ErrorResult('list events', error);
  }
}
