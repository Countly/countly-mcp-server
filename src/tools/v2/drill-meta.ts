/**
 * Drill metadata: Countly Platform /v2 variants
 *
 *   GET  /v2/drill/segmentation_meta        → queriable_fields_list
 *   GET  /v2/drill/events + POST /v2/drill/segmentation_meta/batch
 *                                           → metadata_get (one batch call
 *                                             instead of one request per event)
 *   GET  /v2/drill/segmentation_big_meta    → drill_property_values (Platform only)
 *
 * The v2 meta routes need a drill read right; users who read metadata
 * through another feature (funnels, cohorts, …) fall back to legacy.
 */

import { jsonResult, V2ApiError, v2ErrorResult, v2Request } from '../../lib/v2-api.js';
import { periodToRange } from '../dashboards-v2.js';
import type { ToolContext, ToolResult } from '../types.js';

const UNAVAILABLE = [401, 403, 404, 501, 503];
const SESSION = '[CLY]_session';
const BATCH_LIMIT = 1000;

export const drillPropertyValuesToolDefinition = {
  name: 'drill_property_values',
  description: 'List the distinct values a property takes, to build exact filters for drill_query, drill_bookmarks_create or user_profiles_query (e.g. which countries, app versions or plan names exist). Values come from the last 30 days of data unless period is given. Countly Platform only. Requires the drill plugin. Use queriable_fields_list to find property names.',
  inputSchema: {
    type: 'object',
    properties: {
      app_id: { type: 'string', description: 'Application ID. Either app_id or app_name must be provided; call apps_list first if you do not know it.' },
      app_name: { type: 'string', description: 'Application name (alternative to app_id). Must match an existing app exactly.' },
      property: { type: 'string', description: 'Prefixed property: "up.<key>" (user property, e.g. "up.cc", "up.av"), "custom.<key>" (custom user property), "cmp.<key>" (campaign) or "sg.<segment>" (event segment; needs event).' },
      event: { type: 'string', description: 'Event key whose data is scanned (default "[CLY]_session"). Required for "sg." segments, e.g. "Purchase".' },
      search: { type: 'string', description: 'Only values containing this text.' },
      period: { type: 'string', description: 'Scan this window instead of the last 30 days: "7days", "90days", "month", or "[startMs,endMs]".' },
    },
    required: ['property'],
  },
};

const PREFIXES = ['up.', 'custom.', 'cmp.', 'sg.'];

const typeName: Record<string, string> = {
  d: 'date', n: 'number', s: 'string', l: 'list', bl: 'big list', a: 'array', b: 'boolean',
};
const typeOf = (v: any) => {
  const code = v && typeof v === 'object' && 'type' in v ? v.type : v;
  return typeName[code] ?? String(code);
};

function propertyLines(title: string, prefix: string, props: Record<string, unknown> | undefined): string {
  if (!props || Object.keys(props).length === 0) {
    return '';
  }
  let text = `**${title}** (prepend "${prefix}" in queries):\n`;
  for (const [key, type] of Object.entries(props)) {
    text += `  - ${prefix}${key}: ${typeOf(type)}\n`;
  }
  return `${text}\n`;
}

const SYSTEM_FIELDS = '**System Fields** (always available in queries):\n' +
  '  - c: count (number)\n  - s: sum (number)\n  - dur: duration (number)\n  - did: device id (string)\n  - uid: user id (string)\n\n';

const isUnavailable = (error: unknown) => error instanceof V2ApiError && UNAVAILABLE.includes(error.status);

export async function handleGetAvailableFieldsV2(context: ToolContext, args: any, legacy: () => Promise<ToolResult>): Promise<ToolResult> {
  try {
    const app_id = await context.resolveAppId(args);
    let meta: any;
    try {
      meta = await v2Request<any>(context, 'get', '/v2/drill/segmentation_meta', { params: { app_id, event: args.event || SESSION } });
    } catch (error) {
      if (isUnavailable(error)) {
        return legacy();
      }
      throw error;
    }
    let text = 'Segmentation metadata:\n\n';
    text += propertyLines('User Properties', 'up.', meta?.up);
    text += propertyLines('Custom User Properties', 'custom.', meta?.custom);
    text += propertyLines('Campaign Properties', 'cmp.', meta?.cmp);
    if (args.event) {
      text += propertyLines(`Event Segments for "${args.event}"`, 'sg.', meta?.sg) || `**Event Segments for "${args.event}"**: none recorded\n\n`;
    }
    text += SYSTEM_FIELDS;
    text += 'Use drill_property_values to list the values of a property.';
    return { content: [{ type: 'text', text }] };
  } catch (error) {
    return v2ErrorResult('get segmentation metadata', error);
  }
}

/** Built-in events the metadata report always lists */
const INTERNAL_EVENTS = [
  { key: '[CLY]_session', name: 'Session', description: 'User session events' },
  { key: '[CLY]_view', name: 'View', description: 'Screen/page view events' },
  { key: '[CLY]_crash', name: 'Crash', description: 'Application crash events' },
  { key: '[CLY]_push_action', name: 'Push Action', description: 'Push notification action events' },
];

export async function handleGetMetadataV2(context: ToolContext, args: any, legacy: () => Promise<ToolResult>): Promise<ToolResult> {
  try {
    const app_id = await context.resolveAppId(args);
    let events: Array<{ key: string; name?: string; description?: string }>;
    const segments = new Map<string, Record<string, unknown>>();
    let globalMeta: any = null;
    try {
      const custom = await v2Request<any>(context, 'get', '/v2/drill/events', { params: { app_id } });
      // A bare array, or the {events, total} envelope when the server pages
      const customList: any[] = Array.isArray(custom) ? custom : Array.isArray(custom?.events) ? custom.events : [];
      events = [
        ...customList.map((e: any) => ({ key: e.key, name: e.name })),
        ...INTERNAL_EVENTS,
      ];
      for (let i = 0; i < events.length; i += BATCH_LIMIT) {
        const pairs = events.slice(i, i + BATCH_LIMIT).map((e) => ({ appId: app_id, eventKey: e.key }));
        const batch = await v2Request<any>(context, 'post', '/v2/drill/segmentation_meta/batch', { body: { app_id, pairs } });
        for (const r of batch?.results ?? []) {
          const meta = r?.meta ?? {};
          segments.set(r.eventKey, meta.sg ?? {});
          if (!globalMeta || r.eventKey === SESSION) {
            globalMeta = meta;
          }
        }
      }
    } catch (error) {
      if (isUnavailable(error)) {
        return legacy();
      }
      throw error;
    }

    let text = 'App Metadata:\n\n';
    text += propertyLines('User Properties', 'up.', globalMeta?.up);
    text += propertyLines('Custom User Properties', 'custom.', globalMeta?.custom);
    text += propertyLines('Campaign Properties', 'cmp.', globalMeta?.cmp);
    text += SYSTEM_FIELDS;
    text += `**Events and Segments** (${events.length - INTERNAL_EVENTS.length} custom events; segments are "sg.<key>" in queries):\n\n`;
    for (const event of events) {
      text += `**${event.key}**${event.name && event.name !== event.key ? ` (${event.name})` : ''}\n`;
      if (event.description) {
        text += `Description: ${event.description}\n`;
      }
      const sg = segments.get(event.key) ?? {};
      const keys = Object.keys(sg);
      text += keys.length > 0
        ? `Segments: ${keys.map((k) => `${k} (${typeOf(sg[k])})`).join(', ')}\n\n`
        : 'No segments recorded.\n\n';
    }
    text += 'Use drill_property_values to list the values of a property.';
    return { content: [{ type: 'text', text }] };
  } catch (error) {
    return v2ErrorResult('get app metadata', error);
  }
}

export async function handleDrillPropertyValues(context: ToolContext, args: any): Promise<ToolResult> {
  try {
    const app_id = await context.resolveAppId(args);
    const property = String(args.property || '').trim();
    if (!PREFIXES.some((p) => property.startsWith(p) && property.length > p.length)) {
      throw new Error(`property must start with ${PREFIXES.join(', ')}, e.g. "up.cc" or "sg.plan"`);
    }
    if (property.startsWith('sg.') && !args.event) {
      throw new Error('event is required for "sg." segments');
    }
    const event = args.event || SESSION;
    const params: Record<string, unknown> = { app_id, event, prop: property };
    if (args.search) {
      params.search = args.search;
    }
    if (args.period) {
      const { from, to } = periodToRange(args.period);
      params.from = from;
      params.to = to;
    }
    const values = await v2Request<unknown[]>(context, 'get', '/v2/drill/segmentation_big_meta', { params });
    const list = Array.isArray(values) ? values : [];
    return jsonResult(`Values of ${property} in ${event} (${list.length})`, list);
  } catch (error) {
    return v2ErrorResult('get property values', error);
  }
}
