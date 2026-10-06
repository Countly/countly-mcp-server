/**
 * Dashboards Tools: Countly Platform /v2 variants
 *
 * On Platform with the new UI, dashboards are v2 documents
 * (`schema_version: 2`) that the legacy /o/dashboards endpoints do not
 * return, so the dashboard tools switch to /v2/dashboards there. Tool names
 * stay the same; these definitions replace the legacy ones in tools/list
 * when the server serves /v2.
 */

import { jsonResult, v2ErrorResult, v2Request } from '../lib/v2-api.js';
import type { ToolContext, ToolResult } from './types.js';

const WIDGET_SCHEMA_HELP = `Widget object (Countly Platform format). Common fields: "kind", "title", "appIds" (app ids the widget reads), "size" ("1/3", "1/2", "2/3", "1"), optional "period" (overrides the board period: "30days" or {"from": ms, "to": ms}) and "filter" (Mongo-style user filter). "id" is generated when omitted.

Kinds and their fields:
- "drill": "metrics" [{"id": "m1", "aggregation": "count"|"unique"|"sum"|"avg"|"min"|"max"|"percentile", "events": ["Event key"], "field": "uid" (unique users) | "s" (sum) | "dur" (duration) | "sg.<segment>" | "up.<user property>", "percentile": 1-99, "filter": {...}}] or formula metrics {"id": "f1", "formula": "m1 / m2"}; "breakdowns": ["sg.<segment>" | "up.<property>"]; "outputs": ["total" | "hourly" | "daily" | "weekly" | "monthly"].
- "funnel": "funnelId" (from funnels_list).
- "retention": "retentionType" "full"|"classic"|"unbounded", "periodType" "daily"|"weekly"|"monthly", "event" (anchor event key, e.g. "[CLY]_session").
- "profiles": total user profiles; optional "breakdown": {"field": "up.<property>"}.
- "active-profiles": daily/weekly/monthly active users.
- "online-profiles": users online now and recorded maxima.

Example: {"kind": "drill", "title": "Purchases per day", "appIds": ["<app_id>"], "size": "1/2", "metrics": [{"id": "m1", "aggregation": "count", "events": ["Purchase"]}], "breakdowns": [], "outputs": ["daily"]}`;

// ─── Definitions ──────────────────────────────────────────────────────────────

export const dashboardsV2ToolDefinitions: Record<string, any> = {
  dashboards_list: {
    name: 'dashboards_list',
    description: 'List the dashboards the current user can open (Countly Platform). Returns id, name, visibility, owner, widget count and the apps each board reads. Use dashboards_data for widgets and their numbers.',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  dashboards_data: {
    name: 'dashboards_data',
    description: 'Get a dashboard (Countly Platform) with its widgets and, by default, each widget\'s current results. Widgets with their own period keep it; others use "period". Slow widgets may return a computing status or an estimate; call again later for the exact result.',
    inputSchema: {
      type: 'object',
      properties: {
        dashboard_id: { type: 'string', description: 'Dashboard id from dashboards_list.' },
        period: {
          type: 'string',
          description: 'Board period: "today", "yesterday", "7days", "30days" (default), "60days", "90days", "month", or a custom range as "[startMs,endMs]".',
        },
        include_data: { type: 'boolean', description: 'Fetch widget results. Default true; false returns only the layout and widget definitions.' },
        widget_ids: { type: 'array', items: { type: 'string' }, description: 'Only fetch results for these widget ids.' },
      },
      required: ['dashboard_id'],
    },
  },
  dashboards_create: {
    name: 'dashboards_create',
    description: 'Create an empty dashboard (Countly Platform). Add widgets afterwards with dashboards_widget_add.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Dashboard name.' },
        description: { type: 'string', description: 'Optional description.' },
        visibility: { type: 'string', enum: ['global', 'shared', 'private'], description: 'Who can open it: "global" (everyone with access to its apps), "shared" (listed users), "private" (only you, default).' },
        shared_emails: { type: 'array', items: { type: 'string' }, description: 'Emails of users to share with when visibility is "shared".' },
        category: { type: 'string', description: 'Optional category label.' },
      },
      required: ['name'],
    },
  },
  dashboards_update: {
    name: 'dashboards_update',
    description: 'Update a dashboard\'s name, description, visibility or category (Countly Platform). Only supplied fields change. Use the widget tools to change widgets.',
    inputSchema: {
      type: 'object',
      properties: {
        dashboard_id: { type: 'string', description: 'Dashboard id from dashboards_list.' },
        name: { type: 'string', description: 'New name.' },
        description: { type: 'string', description: 'New description.' },
        visibility: { type: 'string', enum: ['global', 'shared', 'private'], description: 'New visibility.' },
        shared_emails: { type: 'array', items: { type: 'string' }, description: 'Users to share with. Given alone, it sets visibility to "shared"; omitted, the current recipients are kept.' },
        category: { type: 'string', description: 'New category label.' },
      },
      required: ['dashboard_id'],
    },
  },
  dashboards_delete: {
    name: 'dashboards_delete',
    description: 'Delete a dashboard and its widgets (Countly Platform). WARNING: irreversible.',
    inputSchema: {
      type: 'object',
      properties: { dashboard_id: { type: 'string', description: 'Dashboard id from dashboards_list.' } },
      required: ['dashboard_id'],
    },
  },
  dashboards_widget_add: {
    name: 'dashboards_widget_add',
    description: `Add a widget to a dashboard (Countly Platform). Appends to "row_id" when given, otherwise to a new row.\n\n${WIDGET_SCHEMA_HELP}`,
    inputSchema: {
      type: 'object',
      properties: {
        dashboard_id: { type: 'string', description: 'Dashboard id from dashboards_list.' },
        widget: { type: 'object', description: 'Widget definition, see the tool description.' },
        row_id: { type: 'string', description: 'Existing row to append to (row ids are in dashboards_data). Omit to add a new row.' },
        row_title: { type: 'string', description: 'Title for the new row when row_id is omitted.' },
      },
      required: ['dashboard_id', 'widget'],
    },
  },
  dashboards_widget_update: {
    name: 'dashboards_widget_update',
    description: `Update a widget on a dashboard (Countly Platform). The given fields are merged into the existing widget; "kind" cannot change.\n\n${WIDGET_SCHEMA_HELP}`,
    inputSchema: {
      type: 'object',
      properties: {
        dashboard_id: { type: 'string', description: 'Dashboard id from dashboards_list.' },
        widget_id: { type: 'string', description: 'Widget id from dashboards_data.' },
        widget: { type: 'object', description: 'Fields to change.' },
      },
      required: ['dashboard_id', 'widget_id', 'widget'],
    },
  },
  dashboards_widget_remove: {
    name: 'dashboards_widget_remove',
    description: 'Remove a widget from a dashboard (Countly Platform). Rows left empty are removed too. WARNING: irreversible.',
    inputSchema: {
      type: 'object',
      properties: {
        dashboard_id: { type: 'string', description: 'Dashboard id from dashboards_list.' },
        widget_id: { type: 'string', description: 'Widget id from dashboards_data.' },
      },
      required: ['dashboard_id', 'widget_id'],
    },
  },
};

// ─── Period handling ──────────────────────────────────────────────────────────

const DAY_MS = 86_400_000;

/** "[startMs,endMs]" strings become arrays; everything else is returned as is */
function parseRangeString(period: unknown): unknown {
  if (typeof period === 'string' && period.trim().startsWith('[')) {
    try {
      return JSON.parse(period);
    } catch {
      return period;
    }
  }
  return period;
}

/**
 * A timestamp whose UTC calendar day is today's day in `timeZone`, for
 * resolving relative periods into calendar days (drill takes YYYY-MM-DD).
 * Without a time zone, or for an unknown one, the current time is returned.
 */
export function calendarNow(timeZone?: string, now = Date.now()): number {
  if (!timeZone) {
    return now;
  }
  try {
    const day = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(now));
    return Date.parse(`${day}T12:00:00Z`);
  } catch {
    return now;
  }
}

/** Resolve a period keyword or range to epoch-ms bounds (UTC days) */
export function periodToRange(period: unknown, now = Date.now()): { from: number; to: number } {
  period = parseRangeString(period);
  if (Array.isArray(period) && period.length === 2) {
    return { from: Number(period[0]), to: Number(period[1]) };
  }
  if (period && typeof period === 'object' && 'from' in period && 'to' in period) {
    const p = period as { from: unknown; to: unknown };
    return { from: Number(p.from), to: Number(p.to) };
  }
  const startOfToday = Math.floor(now / DAY_MS) * DAY_MS;
  const endOfToday = startOfToday + DAY_MS - 1;
  const key = typeof period === 'string' ? period : '30days';
  if (key === 'today' || key === 'day' || key === 'hour') {
    return { from: startOfToday, to: endOfToday };
  }
  if (key === 'yesterday') {
    return { from: startOfToday - DAY_MS, to: startOfToday - 1 };
  }
  if (key === 'month') {
    const d = new Date(now);
    return { from: Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1), to: endOfToday };
  }
  const days = /^(\d+)days$/.exec(key);
  const n = days ? Number(days[1]) : 30;
  return { from: startOfToday - (n - 1) * DAY_MS, to: endOfToday };
}

/** The time envelope the widget-data endpoint expects for each widget kind */
export function widgetWindow(widget: any, boardPeriod: unknown): Record<string, unknown> {
  const period = parseRangeString(widget.period ?? boardPeriod ?? '30days');
  const isCustom = typeof period !== 'string';
  switch (widget.kind) {
  case 'drill': {
    const { from, to } = periodToRange(period);
    return { from: new Date(from).toISOString(), to: new Date(to).toISOString() };
  }
  case 'funnel':
  case 'active-profiles': {
    if (!isCustom) {
      return { period };
    }
    const { from, to } = periodToRange(period);
    return { period: JSON.stringify([from, to]) };
  }
  case 'retention': {
    // Send the window for keywords too, otherwise the endpoint ignores the
    // board period and falls back to its own default range.
    const { from, to } = periodToRange(period);
    return { range: JSON.stringify([from, to]) };
  }
  default:
    return {};
  }
}

/** Drop what costs tokens without informing an answer (SQL, per-minute series) */
export function compactWidgetData(kind: string, data: any): any {
  if (!data || typeof data !== 'object') {
    return data;
  }
  if (data.task_id) {
    return {
      status: 'computing',
      task_id: data.task_id,
      ...(data.estimate ? { estimate: data.estimate.data, estimateFraction: data.estimate.fraction } : {}),
      note: 'The exact result is still computing; call dashboards_data again later.',
    };
  }
  if (data.heavy) {
    return data.estimate
      ? { status: 'estimate', estimate: data.estimate.data, estimateFraction: data.estimate.fraction, note: 'Heavy widget: this is a sampled estimate.' }
      : { status: 'computing', note: 'Heavy widget: no result yet; call dashboards_data again later.' };
  }
  if (kind === 'drill' && data.meta) {
    const { queries: _queries, ...meta } = data.meta;
    return { ...data, meta };
  }
  if (kind === 'online-profiles' && Array.isArray(data.historical?.perMinute)) {
    return { ...data, historical: { ...data.historical, perMinute: data.historical.perMinute.slice(-10) } };
  }
  return data;
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

const allWidgets = (rows: any[]): any[] => (rows || []).flatMap((row) => row?.widgets || []);

function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

function visibilityPayload(visibility: string | undefined, emails: string[] | undefined) {
  if (!visibility) {
    return undefined;
  }
  return visibility === 'shared' ? { mode: 'shared', sharedEmails: emails || [] } : { mode: visibility };
}

/**
 * Visibility for an update. Omitted recipients keep the board's current
 * ones; recipients without a visibility imply "shared".
 */
async function updateVisibilityPayload(context: ToolContext, args: any) {
  const emails: string[] | undefined = Array.isArray(args.shared_emails) ? args.shared_emails : undefined;
  const mode = args.visibility ?? (emails ? 'shared' : undefined);
  if (!mode) {
    return undefined;
  }
  if (mode !== 'shared') {
    return { mode };
  }
  const current = await v2Request<any>(context, 'get', `/v2/dashboards/${encodeURIComponent(args.dashboard_id)}`);
  return {
    mode: 'shared',
    sharedEmails: emails ?? current?.visibility?.sharedEmails ?? [],
    sharedUserGroupIds: current?.visibility?.sharedUserGroupIds ?? [],
  };
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return results;
}

export async function handleListDashboardsV2(context: ToolContext, _args?: any): Promise<ToolResult> {
  try {
    const boards = await v2Request<any[]>(context, 'get', '/v2/dashboards');
    const summary = (boards || []).map((b) => ({
      id: b.id,
      name: b.name,
      description: b.description,
      visibility: b.visibility,
      owner: b.ownerName ?? b.ownerId,
      isOwner: b.isOwner,
      widgetCount: b.widgetCount,
      appIds: b.appIds,
      category: b.category,
      pinned: b.pinned,
      editable: b.editable,
      updatedAt: b.updatedAt ? new Date(b.updatedAt).toISOString() : undefined,
    }));
    return jsonResult(`Dashboards (${summary.length})`, summary);
  } catch (error) {
    return v2ErrorResult('list dashboards', error);
  }
}

export async function handleGetDashboardDataV2(context: ToolContext, args: any): Promise<ToolResult> {
  const id = args.dashboard_id;
  try {
    const board = await v2Request<any>(context, 'get', `/v2/dashboards/${encodeURIComponent(id)}`);
    const includeData = args.include_data !== false;
    const only = Array.isArray(args.widget_ids) && args.widget_ids.length > 0 ? new Set(args.widget_ids) : null;

    const results = new Map<string, any>();
    if (includeData) {
      const targets = allWidgets(board.rows).filter((w) => !only || only.has(w.id));
      await mapLimit(targets, 4, async (widget) => {
        try {
          const data = await v2Request(
            context,
            'post',
            `/v2/dashboards/${encodeURIComponent(id)}/widgets/${encodeURIComponent(widget.id)}/data`,
            { body: widgetWindow(widget, args.period) }
          );
          results.set(widget.id, compactWidgetData(widget.kind, data));
        } catch (error) {
          results.set(widget.id, { error: error instanceof Error ? error.message : String(error) });
        }
      });
    }

    const rows = (board.rows || []).map((row: any) => ({
      id: row.id,
      title: row.title,
      note: row.note?.text,
      widgets: (row.widgets || []).map((w: any) => ({
        ...w,
        ...(results.has(w.id) ? { data: results.get(w.id) } : {}),
      })),
    }));
    return jsonResult(`Dashboard "${board.name}"`, {
      id: board.id,
      name: board.name,
      description: board.description,
      visibility: board.visibility,
      period: args.period ?? '30days',
      rows,
    });
  } catch (error) {
    return v2ErrorResult(`get dashboard ${id}`, error);
  }
}

export async function handleCreateDashboardV2(context: ToolContext, args: any): Promise<ToolResult> {
  try {
    const board = await v2Request<any>(context, 'post', '/v2/dashboards', {
      body: {
        name: args.name,
        description: args.description,
        category: args.category,
        visibility: visibilityPayload(args.visibility || 'private', args.shared_emails),
        rows: [],
      },
    });
    return jsonResult('Dashboard created', { id: board.id, name: board.name, visibility: board.visibility });
  } catch (error) {
    return v2ErrorResult('create dashboard', error);
  }
}

export async function handleUpdateDashboardV2(context: ToolContext, args: any): Promise<ToolResult> {
  const body: Record<string, unknown> = {};
  for (const key of ['name', 'description', 'category']) {
    if (args[key] !== undefined) {
      body[key] = args[key];
    }
  }
  try {
    const visibility = await updateVisibilityPayload(context, args);
    if (visibility) {
      body.visibility = visibility;
    }
    if (Object.keys(body).length === 0) {
      return v2ErrorResult('update dashboard', 'no fields to update were given');
    }
    const board = await v2Request<any>(context, 'put', `/v2/dashboards/${encodeURIComponent(args.dashboard_id)}`, { body });
    return jsonResult('Dashboard updated', { id: board.id, name: board.name, description: board.description, visibility: board.visibility, category: board.category });
  } catch (error) {
    return v2ErrorResult(`update dashboard ${args.dashboard_id}`, error);
  }
}

export async function handleDeleteDashboardV2(context: ToolContext, args: any): Promise<ToolResult> {
  try {
    await v2Request(context, 'delete', `/v2/dashboards/${encodeURIComponent(args.dashboard_id)}`);
    return { content: [{ type: 'text', text: `Dashboard ${args.dashboard_id} deleted.` }] };
  } catch (error) {
    return v2ErrorResult(`delete dashboard ${args.dashboard_id}`, error);
  }
}

/** Read the board, let `edit` change its rows, then write the rows back */
/** Pending row edits per dashboard, so overlapping calls in this process run one after another */
const rowEditQueue = new Map<string, Promise<unknown>>();

/**
 * Read the board, let `edit` change its rows, then write the rows back.
 * The v2 API has no revision check, so edits to the same dashboard are
 * serialized here; otherwise two overlapping widget calls would both read
 * the same rows and the later PUT would drop the earlier change.
 */
async function editRows(
  context: ToolContext,
  dashboardId: string,
  edit: (rows: any[]) => string
): Promise<string> {
  const run = async () => {
    const path = `/v2/dashboards/${encodeURIComponent(dashboardId)}`;
    const board = await v2Request<any>(context, 'get', path);
    const rows = JSON.parse(JSON.stringify(board.rows || []));
    const message = edit(rows);
    await v2Request(context, 'put', path, { body: { rows } });
    return message;
  };
  const previous = rowEditQueue.get(dashboardId) ?? Promise.resolve();
  const current = previous.catch(() => undefined).then(run);
  const settled = current.catch(() => undefined);
  rowEditQueue.set(dashboardId, settled);
  void settled.then(() => {
    if (rowEditQueue.get(dashboardId) === settled) {
      rowEditQueue.delete(dashboardId);
    }
  });
  return current;
}

function parseWidget(value: unknown): any {
  const widget = typeof value === 'string' ? JSON.parse(value) : value;
  if (!widget || typeof widget !== 'object' || Array.isArray(widget)) {
    throw new Error('widget must be an object');
  }
  return widget;
}

export async function handleAddDashboardWidgetV2(context: ToolContext, args: any): Promise<ToolResult> {
  try {
    const widget = { size: '1/3', ...parseWidget(args.widget) };
    if (!widget.kind) {
      throw new Error('widget.kind is required');
    }
    if (!Array.isArray(widget.appIds) || widget.appIds.length === 0) {
      throw new Error('widget.appIds is required (app ids the widget reads)');
    }
    const message = await editRows(context, args.dashboard_id, (rows) => {
      // A widget copied from dashboards_data keeps its id; never duplicate one
      if (!widget.id || allWidgets(rows).some((w) => w.id === widget.id)) {
        widget.id = newId('w');
      }
      if (args.row_id) {
        const row = rows.find((r) => r.id === args.row_id);
        if (!row) {
          throw new Error(`row ${args.row_id} not found`);
        }
        row.widgets = [...(row.widgets || []), widget];
        return `Widget ${widget.id} added to row ${row.id}.`;
      }
      const row = { id: newId('r'), height: 'auto', ...(args.row_title ? { title: args.row_title } : {}), widgets: [widget] };
      rows.push(row);
      return `Widget ${widget.id} added in new row ${row.id}.`;
    });
    return { content: [{ type: 'text', text: message }] };
  } catch (error) {
    return v2ErrorResult('add widget', error);
  }
}

export async function handleUpdateDashboardWidgetV2(context: ToolContext, args: any): Promise<ToolResult> {
  try {
    const changes = parseWidget(args.widget);
    const message = await editRows(context, args.dashboard_id, (rows) => {
      for (const row of rows) {
        const i = (row.widgets || []).findIndex((w: any) => w.id === args.widget_id);
        if (i >= 0) {
          const current = row.widgets[i];
          if (changes.kind && changes.kind !== current.kind) {
            throw new Error(`widget kind cannot change (is "${current.kind}"); remove it and add a new widget instead`);
          }
          row.widgets[i] = { ...current, ...changes, id: current.id, kind: current.kind };
          return `Widget ${args.widget_id} updated.`;
        }
      }
      throw new Error(`widget ${args.widget_id} not found`);
    });
    return { content: [{ type: 'text', text: message }] };
  } catch (error) {
    return v2ErrorResult('update widget', error);
  }
}

export async function handleRemoveDashboardWidgetV2(context: ToolContext, args: any): Promise<ToolResult> {
  try {
    const message = await editRows(context, args.dashboard_id, (rows) => {
      const before = allWidgets(rows).length;
      for (const row of rows) {
        row.widgets = (row.widgets || []).filter((w: any) => w.id !== args.widget_id);
      }
      if (allWidgets(rows).length === before) {
        throw new Error(`widget ${args.widget_id} not found`);
      }
      const nonEmpty = rows.filter((r) => (r.widgets || []).length > 0 || r.note);
      rows.splice(0, rows.length, ...nonEmpty);
      return `Widget ${args.widget_id} removed.`;
    });
    return { content: [{ type: 'text', text: message }] };
  } catch (error) {
    return v2ErrorResult('remove widget', error);
  }
}
