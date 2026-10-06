/**
 * Email report tools: Countly Platform /v2 variants
 *
 * - email_reports_list: /v2/reports lists every report the member owns,
 *   receives or can see; filtered here by app and compacted
 * - create / update / delete / send: same arguments as the legacy tools,
 *   sent as real JSON to /v2/reports
 * - preview: /v2/reports/:id/preview answers raw HTML, which is reduced to
 *   readable text here
 *
 * Reports created through /v2 are stamped schema_version 2 and hidden from the
 * legacy endpoints, so there is no legacy fallback on Platform. Dashboard
 * reports reference new-UI (v2) dashboards, which is what dashboards_list
 * returns on Platform.
 */

import { jsonResult, v2ErrorResult, v2Request } from '../../lib/v2-api.js';
import type { ToolContext, ToolResult } from '../types.js';

export const emailReportsV2ToolDefinitions: Record<string, any> = {
  email_reports_list: {
    name: 'email_reports_list',
    description: 'List scheduled email reports (core metric reports and dashboard reports) you own, receive or can see, with recipients, schedule, contents and enabled state. Optionally filtered to one app. Requires the reports plugin. To create reports use email_reports_core_create or email_reports_dashboard_create.',
    inputSchema: {
      type: 'object',
      properties: {
        app_id: { type: 'string', description: 'Optional application ID: only core reports covering this app and dashboard reports are returned. Omit for all reports.' },
        app_name: { type: 'string', description: 'Optional application name (alternative to app_id). Must match an existing app exactly.' },
        search: { type: 'string', description: 'Case-insensitive substring match on report title.' },
      },
    },
  },
};

const WEEKDAYS = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

function schedule(r: any): string {
  const time = `${String(r.hour ?? 0).padStart(2, '0')}:${String(r.minute ?? 0).padStart(2, '0')} ${r.timezone || ''}`.trim();
  if (r.frequency === 'weekly') {
    return `weekly on ${WEEKDAYS[r.day] || `day ${r.day}`} at ${time}`;
  }
  if (r.frequency === 'monthly') {
    return `monthly on day ${r.day} at ${time}`;
  }
  return `${r.frequency || 'daily'} at ${time}`;
}

/** Lean view of a v2 report document */
export function compactReport(r: any): any {
  const isCore = !r.report_type || r.report_type === 'core';
  const metrics = r.metrics && typeof r.metrics === 'object'
    ? Object.keys(r.metrics).filter((k) => r.metrics[k])
    : [];
  return {
    id: r._id,
    title: r.title,
    type: r.report_type || 'core',
    enabled: r.enabled !== false,
    emails: r.emails,
    frequency: r.frequency,
    day: r.day,
    hour: r.hour,
    minute: r.minute,
    timezone: r.timezone,
    schedule: schedule(r),
    ...(isCore
      ? {
        apps: r.apps,
        metrics,
        ...(Array.isArray(r.selectedEvents) && r.selectedEvents.length > 0 ? { selectedEvents: r.selectedEvents } : {}),
      }
      : {
        dashboard: r.dashboards,
        dateRange: r.date_range,
        ...(r.columns ? { columns: r.columns } : {}),
      }),
    sendPdf: r.sendPdf === true,
    owner: r.userName || r.user,
    visibility: r.visibility?.mode,
    ...(r.isValid === false ? { isValid: false } : {}),
    ...(r.last_sent ? { lastSent: r.last_sent } : {}),
  };
}

async function optionalAppId(context: ToolContext, args: any): Promise<string | undefined> {
  return args.app_id || args.app_name ? context.resolveAppId(args) : undefined;
}

export async function handleListEmailReportsV2(context: ToolContext, args: any): Promise<ToolResult> {
  try {
    const app_id = await optionalAppId(context, args);
    const reports = await v2Request<any[]>(context, 'get', '/v2/reports');
    const search = typeof args.search === 'string' ? args.search.toLowerCase() : '';
    const rows = (Array.isArray(reports) ? reports : []).filter((r) => {
      if (app_id && (!r.report_type || r.report_type === 'core') && !(r.apps || []).includes(app_id)) {
        return false;
      }
      return !search || String(r.title || '').toLowerCase().includes(search);
    });
    const scope = app_id ? ` for app ${app_id}` : '';
    return jsonResult(`Email reports${scope} (${rows.length})`, rows.map(compactReport));
  } catch (error) {
    return v2ErrorResult('list email reports', error);
  }
}

const SCHEDULE_FIELDS = ['frequency', 'timezone', 'day', 'hour', 'minute', 'sendPdf'] as const;

function pick(args: any, keys: readonly string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of keys) {
    if (args[key] !== undefined && args[key] !== null) {
      out[key] = args[key];
    }
  }
  return out;
}

export async function handleCreateCoreEmailReportV2(context: ToolContext, args: any): Promise<ToolResult> {
  try {
    await context.resolveAppId(args);
    const body = {
      report_type: 'core',
      title: args.title,
      apps: args.apps,
      emails: args.emails,
      metrics: args.metrics,
      selectedEvents: args.selectedEvents || [],
      minute: 0,
      sendPdf: true,
      ...pick(args, SCHEDULE_FIELDS),
    };
    const created = await v2Request<any>(context, 'post', '/v2/reports', { body });
    return jsonResult('Core email report created', compactReport(created));
  } catch (error) {
    return v2ErrorResult('create core email report', error);
  }
}

export async function handleCreateDashboardEmailReportV2(context: ToolContext, args: any): Promise<ToolResult> {
  try {
    await context.resolveAppId(args);
    const body = {
      report_type: 'dashboards',
      title: args.title,
      emails: args.emails,
      dashboards: args.dashboards,
      date_range: args.date_range,
      minute: 0,
      sendPdf: true,
      ...pick(args, SCHEDULE_FIELDS),
    };
    const created = await v2Request<any>(context, 'post', '/v2/reports', { body });
    return jsonResult('Dashboard email report created', compactReport(created));
  } catch (error) {
    return v2ErrorResult('create dashboard email report', error);
  }
}

export async function handleUpdateEmailReportV2(context: ToolContext, args: any): Promise<ToolResult> {
  try {
    await context.resolveAppId(args);
    const body = {
      ...(args.report_data && typeof args.report_data === 'object' ? args.report_data : {}),
      ...pick(args, ['title', 'emails', 'enabled', ...SCHEDULE_FIELDS]),
    };
    delete body._id;
    if (Object.keys(body).length === 0) {
      return v2ErrorResult('update email report', new Error('nothing to update, pass at least one field to change'));
    }
    const path = `/v2/reports/${encodeURIComponent(args.report_id)}`;
    // Every PATCH resets an omitted timezone to Etc/GMT and recomputes the send
    // time from the patch alone (v1 parity), so carry the stored schedule over.
    const existing = await v2Request<any>(context, 'get', path);
    for (const key of ['frequency', 'timezone', 'day', 'hour', 'minute']) {
      if (body[key] === undefined && existing?.[key] !== undefined && existing[key] !== null) {
        body[key] = existing[key];
      }
    }
    const updated = await v2Request<any>(context, 'patch', path, { body });
    return jsonResult('Email report updated', compactReport(updated));
  } catch (error) {
    return v2ErrorResult('update email report', error);
  }
}

const ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', mdash: '—', ndash: '–', hellip: '…', middot: '·',
};

function decodeEntities(text: string): string {
  return text.replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

const VOID_TAGS = new Set(['br', 'img', 'meta', 'link', 'hr', 'input', 'col', 'source', 'wbr']);
const SKIP_TAGS = new Set(['style', 'script', 'head', 'title']);
const LINE_TAGS = new Set(['tr', 'table', 'p', 'div', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol']);

const attr = (attrs: string, name: string): string | undefined =>
  new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i').exec(attrs)?.slice(2).find((v) => v !== undefined);

/** Whether an element is hidden in the desktop rendering of the email */
function isHidden(attrs: string): boolean {
  const cls = attr(attrs, 'class') || '';
  const style = attr(attrs, 'style') || '';
  return /\bmobile-table\b/.test(cls) || /display\s*:\s*none/i.test(style);
}

/**
 * Reduce a rendered report email to readable text: desktop layout only,
 * side-by-side cell tables joined with " | ", one line per row.
 */
export function htmlToText(html: string): string {
  const out: string[] = [];
  const stack: Array<{ tag: string; attrs: string }> = [];
  let hiddenDepth = -1;
  const token = /<!--[\s\S]*?-->|<!\w[^>]*>|<\/?([a-zA-Z][a-zA-Z0-9]*)([^>]*)>|[^<]+/g;
  let m: RegExpExecArray | null;
  while ((m = token.exec(html)) !== null) {
    const [raw, name, attrs = ''] = m;
    const hidden = hiddenDepth >= 0;
    if (!name) {
      if (!raw.startsWith('<') && !hidden && !stack.some((s) => SKIP_TAGS.has(s.tag))) {
        out.push(decodeEntities(raw.replace(/\s+/g, ' ')));
      }
      continue;
    }
    const tag = name.toLowerCase();
    if (!raw.startsWith('</')) {
      if (!hidden && tag === 'img') {
        const alt = attr(attrs, 'alt');
        if (alt) {
          out.push(` ${alt} `);
        }
      }
      if (!hidden && tag === 'br') {
        out.push('\n');
      }
      if (VOID_TAGS.has(tag) || raw.endsWith('/>')) {
        continue;
      }
      stack.push({ tag, attrs });
      if (!hidden && isHidden(attrs)) {
        hiddenDepth = stack.length - 1;
      }
      continue;
    }
    const at = stack.map((s) => s.tag).lastIndexOf(tag);
    if (at < 0) {
      continue;
    }
    const el = stack[at];
    stack.length = at;
    if (hiddenDepth >= 0) {
      if (at <= hiddenDepth) {
        hiddenDepth = -1;
      }
      continue;
    }
    if (tag === 'a') {
      const href = attr(el.attrs, 'href');
      if (href && /^https?:/i.test(href)) {
        out.push(` (${href})`);
      }
    } else if (tag === 'table' && attr(el.attrs, 'align')) {
      // A floated cell table: drop the line breaks its inner rows left
      while (out.length > 0 && /^\s*$/.test(out[out.length - 1])) {
        out.pop();
      }
      out.push(' | ');
    } else if (LINE_TAGS.has(tag)) {
      out.push('\n');
    } else if (tag === 'td' || tag === 'th') {
      out.push(' ');
    }
  }
  const lines: string[] = [];
  for (const line of out.join('').split('\n')) {
    const clean = line.replace(/[ \t\u00a0]+/g, ' ').replace(/(\s*\|\s*)+/g, ' | ').replace(/^[ |]+|[ |]+$/g, '');
    if (clean && clean !== lines[lines.length - 1]) {
      lines.push(clean);
    }
  }
  return lines.join('\n');
}

const PREVIEW_MAX_CHARS = 8000;

export async function handlePreviewEmailReportV2(context: ToolContext, args: any): Promise<ToolResult> {
  try {
    await context.resolveAppId(args);
    const data = await v2Request<unknown>(context, 'get', `/v2/reports/${encodeURIComponent(args.report_id)}/preview`);
    if (typeof data !== 'string') {
      return jsonResult('Email report preview', data);
    }
    if (!/<[a-z!]/i.test(data)) {
      // "No data to report" and similar plain answers
      return { content: [{ type: 'text', text: `Email report preview: ${data}` }] };
    }
    let text = htmlToText(data);
    if (text.length > PREVIEW_MAX_CHARS) {
      text = `${text.slice(0, PREVIEW_MAX_CHARS)}\n… (truncated, ${text.length - PREVIEW_MAX_CHARS} more chars)`;
    }
    return { content: [{ type: 'text', text: `Email report preview (text rendering of the email):\n\n${text}` }] };
  } catch (error) {
    return v2ErrorResult('preview email report', error);
  }
}

export async function handleSendEmailReportV2(context: ToolContext, args: any): Promise<ToolResult> {
  try {
    await context.resolveAppId(args);
    const data = await v2Request<any>(context, 'post', `/v2/reports/${encodeURIComponent(args.report_id)}/send`);
    if (typeof data === 'string') {
      return { content: [{ type: 'text', text: `Email report not sent: ${data}` }] };
    }
    return jsonResult('Email report sent', data);
  } catch (error) {
    return v2ErrorResult('send email report', error);
  }
}

export async function handleDeleteEmailReportV2(context: ToolContext, args: any): Promise<ToolResult> {
  try {
    await context.resolveAppId(args);
    const data = await v2Request<any>(context, 'delete', `/v2/reports/${encodeURIComponent(args.report_id)}`);
    return jsonResult('Email report deleted', data);
  } catch (error) {
    return v2ErrorResult('delete email report', error);
  }
}
