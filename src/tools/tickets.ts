import { ToolContext, ToolResult } from './types.js';
import { safeApiCall } from '../lib/error-handler.js';

// ============================================================================
// SHARED HELPERS
// ============================================================================

const PRIORITY_LABELS: Record<number, string> = { 1: 'low', 2: 'normal', 3: 'high', 4: 'urgent' };

/** Decode the HTML entities the API encodes member/requester fields with. */
function decodeEntities(text: string): string {
  return String(text || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"');
}

/** Strip server-sanitized message HTML down to readable plain text. */
function toPlainText(html: string): string {
  return decodeEntities(String(html || '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

/**
 * Fetch dashboard members via /v2/members and return an id → display-name
 * map, used to resolve ticket assignee ids. Best-effort: an empty map on
 * failure just leaves ids unresolved rather than failing the whole tool.
 */
async function fetchMemberNames(context: ToolContext): Promise<Record<string, string>> {
  try {
    const response = await context.httpClient.get('/v2/members', { params: context.getAuthParams() });
    const members = (response.data && response.data.data) || [];
    const map: Record<string, string> = {};
    for (const member of members) {
      map[String(member._id)] = decodeEntities(member.full_name || member.username || member.email || String(member._id));
    }
    return map;
  } catch {
    return {};
  }
}

/** Fetch tickets teams and return an id → name map (best-effort, like members). */
async function fetchTeamNames(context: ToolContext): Promise<Record<string, string>> {
  try {
    const response = await context.httpClient.get('/v2/tickets/teams', { params: context.getAuthParams() });
    const teams = (response.data && response.data.data) || [];
    const map: Record<string, string> = {};
    for (const team of teams) {
      map[String(team._id)] = decodeEntities(team.name || String(team._id));
    }
    return map;
  } catch {
    return {};
  }
}

/** One-line summary of a ticket for list output. */
function formatTicketLine(ticket: any, memberNames: Record<string, string>, teamNames: Record<string, string>): string {
  const assignee = ticket.assignee_id
    ? (memberNames[String(ticket.assignee_id)] || ticket.assignee_id)
    : 'unassigned';
  const team = ticket.team_id ? ` | team: ${teamNames[String(ticket.team_id)] || ticket.team_id}` : '';
  const requester = ticket.requester
    ? decodeEntities(ticket.requester.name || ticket.requester.email || ticket.requester.did || 'unknown')
    : 'unknown';
  const priority = PRIORITY_LABELS[ticket.priority] || ticket.priority;
  return `#${ticket.number} — ${decodeEntities(ticket.subject)}\n` +
    `  status: ${ticket.status} (${ticket.status_category}) | priority: ${priority} | assignee: ${assignee}${team}\n` +
    `  requester: ${requester} | channel: ${ticket.channel} | app: ${ticket.app_id}\n` +
    `  created: ${new Date(ticket.created_at).toISOString()} | updated: ${new Date(ticket.updated_at).toISOString()}`;
}

// ============================================================================
// TICKETS_LIST TOOL
// ============================================================================

export const ticketsListToolDefinition = {
  name: 'tickets_list',
  description: 'List/filter support tickets via GET /v2/tickets, with assignee and team ids resolved to names. Answers structured questions like "who is answering BMW\'s latest ticket" (requester_name or segments filter + sort=created_at, direction=desc, limit=1), "open urgent tickets", or "tickets assigned to nobody". Results are permission-scoped to the apps the API key can read.',
  inputSchema: {
    type: 'object',
    properties: {
      app_id: { type: 'string', description: 'Optional application ID to restrict to one app; searches all readable apps when omitted.' },
      app_name: { type: 'string', description: 'Optional application name (alternative to app_id). Must match an existing app exactly.' },
      status: { type: 'string', description: 'Exact workflow status key, e.g. "new", "open", "pending", "solved", "closed".' },
      status_category: { type: 'string', description: 'Status category filter.', enum: ['open', 'pending', 'solved', 'closed'] },
      assignee_id: { type: 'string', description: 'Member ID of the assigned agent.' },
      unassigned: { type: 'boolean', description: 'true to return only unassigned tickets.' },
      team_id: { type: 'string', description: 'Team ID filter.' },
      tag: { type: 'string', description: 'Exact tag filter.' },
      channel: { type: 'string', description: 'Origin channel, e.g. "widget", "dashboard", "api", "import".' },
      priority: { type: 'number', description: 'Priority: 1=low, 2=normal, 3=high, 4=urgent.' },
      requester: { type: 'string', description: 'Exact requester match by email, analytics uid, or device id.' },
      requester_name: { type: 'string', description: 'Case-insensitive substring match on the requester\'s name (person or organization), e.g. "BMW".' },
      segments: { type: 'object', description: 'Audience-segment filter over properties snapshotted on the ticket, e.g. {"custom.organization": "BMW"} or {"up.cc": "DE"}.' },
      q: { type: 'string', description: 'Subject text search, or an exact ticket number.' },
      updated_since: { type: 'number', description: 'Only tickets updated at/after this Unix millisecond timestamp.' },
      sort: { type: 'string', description: 'Sort field (default updated_at).', enum: ['created_at', 'updated_at', 'number', 'priority', 'last_message_at', 'status'] },
      direction: { type: 'string', description: 'Sort direction (default desc).', enum: ['asc', 'desc'] },
      limit: { type: 'number', description: 'Maximum tickets to return (default 10, max 50).' },
      page: { type: 'number', description: 'Page number for paging through larger result sets (default 1).' },
    },
  },
};

export async function handleTicketsList(context: ToolContext, args: any): Promise<ToolResult> {
  const params: any = { ...context.getAuthParams() };
  if (args.app_id || args.app_name) {
    params.app_id = await context.resolveAppId(args);
  }
  for (const key of ['status', 'status_category', 'assignee_id', 'team_id', 'tag', 'channel', 'requester', 'requester_name', 'q', 'sort', 'direction'] as const) {
    if (args[key] !== undefined && args[key] !== '') {
      params[key] = args[key];
    }
  }
  if (args.unassigned === true) {
    params.unassigned = 'true';
  }
  if (args.priority !== undefined) {
    params.priority = args.priority;
  }
  if (args.updated_since !== undefined) {
    params.updated_since = args.updated_since;
  }
  if (args.segments !== undefined) {
    params.segments = typeof args.segments === 'string' ? args.segments : JSON.stringify(args.segments);
  }
  params.pageSize = Math.max(1, Math.min(50, args.limit || 10));
  params.page = Math.max(1, args.page || 1);

  const response = await safeApiCall(
    () => context.httpClient.get('/v2/tickets', { params }),
    'Failed to execute request to /v2/tickets'
  );

  const data = (response.data && response.data.data) || {};
  let items: any[] = data.items || [];
  // Older servers ignore the requester_name param instead of filtering, so
  // re-apply it client-side rather than silently returning everything.
  if (args.requester_name) {
    const needle = String(args.requester_name).toLowerCase();
    items = items.filter((t) => ((t.requester && t.requester.name) || '').toLowerCase().includes(needle));
  }

  if (items.length === 0) {
    return { content: [{ type: 'text', text: 'No tickets matched the given filters.' }] };
  }

  const needsMembers = items.some((t) => t.assignee_id);
  const needsTeams = items.some((t) => t.team_id);
  const [memberNames, teamNames] = await Promise.all([
    needsMembers ? fetchMemberNames(context) : Promise.resolve({}),
    needsTeams ? fetchTeamNames(context) : Promise.resolve({}),
  ]);

  const lines = items.map((t) => formatTicketLine(t, memberNames, teamNames));
  return {
    content: [
      {
        type: 'text',
        text: `${data.total ?? items.length} ticket(s) matched (showing ${items.length}, page ${data.page || 1}):\n\n${lines.join('\n\n')}`,
      },
    ],
  };
}

// ============================================================================
// TICKETS_GET TOOL
// ============================================================================

export const ticketsGetToolDefinition = {
  name: 'tickets_get',
  description: 'Get one support ticket by its number: full detail (subject, status, priority, assignee/team resolved to names, requester, tags, SLA state, CSAT) and optionally the conversation transcript. Ticket numbers are unique across all apps. Use tickets_list first when you only have filters, not a number.',
  inputSchema: {
    type: 'object',
    properties: {
      number: { type: 'number', description: 'The ticket number (as shown as #N in the dashboard and in tickets_list output).' },
      include_conversation: { type: 'boolean', description: 'true to append the message transcript (public replies and internal notes). Default false.' },
    },
    required: ['number'],
  },
};

export async function handleTicketsGet(context: ToolContext, args: any): Promise<ToolResult> {
  const number = Number.parseInt(args.number, 10);

  // Ticket numbers are globally unique, so locate the ticket (and its app)
  // through the list endpoint's exact-number search.
  const listResponse = await safeApiCall(
    () => context.httpClient.get('/v2/tickets', { params: { ...context.getAuthParams(), q: String(number), pageSize: 50 } }),
    'Failed to execute request to /v2/tickets'
  );
  const items: any[] = ((listResponse.data && listResponse.data.data) || {}).items || [];
  const match = items.find((t) => t.number === number);
  if (!match) {
    return { content: [{ type: 'text', text: `Ticket #${number} was not found (or the API key has no read access to its app).` }] };
  }

  const detailResponse = await safeApiCall(
    () => context.httpClient.get(`/v2/tickets/${match._id}`, { params: { ...context.getAuthParams(), app_id: match.app_id } }),
    'Failed to execute request to /v2/tickets/:id'
  );
  const ticket = (detailResponse.data && detailResponse.data.data) || match;

  const [memberNames, teamNames] = await Promise.all([
    ticket.assignee_id ? fetchMemberNames(context) : Promise.resolve({}),
    ticket.team_id ? fetchTeamNames(context) : Promise.resolve({}),
  ]);

  const parts: string[] = [formatTicketLine(ticket, memberNames, teamNames)];
  if (Array.isArray(ticket.tags) && ticket.tags.length > 0) {
    parts.push(`tags: ${ticket.tags.join(', ')}`);
  }
  if (ticket.sla && ticket.sla.policy_id) {
    parts.push(`SLA: first-response breached: ${!!ticket.sla.first_response_breached}, resolution breached: ${!!ticket.sla.resolution_breached}`);
  }
  if (ticket.csat && ticket.csat.score) {
    parts.push(`CSAT: ${ticket.csat.score}/5${ticket.csat.comment ? ` — "${decodeEntities(ticket.csat.comment)}"` : ''}`);
  }

  if (args.include_conversation === true) {
    const messagesResponse = await safeApiCall(
      () => context.httpClient.get(`/v2/tickets/${match._id}/messages`, { params: { ...context.getAuthParams(), app_id: match.app_id } }),
      'Failed to execute request to /v2/tickets/:id/messages'
    );
    const raw = (messagesResponse.data && messagesResponse.data.data) || {};
    const messages: any[] = Array.isArray(raw) ? raw : (raw.items || []);
    const transcript = messages.map((m) => {
      const author = decodeEntities((m.author && m.author.name) || (m.author && m.author.type) || 'unknown');
      const label = m.kind === 'note' ? `${author} (internal note)` : author;
      return `${label}: ${toPlainText(m.content)}`;
    });
    parts.push(`\nConversation (${transcript.length} message(s)):\n${transcript.join('\n')}`);
  }

  return { content: [{ type: 'text', text: parts.join('\n') }] };
}

// ============================================================================
// TICKETS_STATS TOOL
// ============================================================================

export const ticketsStatsToolDefinition = {
  name: 'tickets_stats',
  description: 'Support performance metrics via GET /v2/tickets/stats: created/resolved volume and daily series, current backlog, first-response and resolution time percentiles (p50/p90, milliseconds), SLA attainment, per-agent resolved counts, busiest hours, and CSAT average. Use for questions like "how many tickets breached SLA this month" or "what is our average CSAT".',
  inputSchema: {
    type: 'object',
    properties: {
      app_id: { type: 'string', description: 'Optional application ID to restrict to one app; covers all readable apps when omitted.' },
      app_name: { type: 'string', description: 'Optional application name (alternative to app_id).' },
      period_days: { type: 'number', description: 'Look-back window in days (default 30).' },
    },
  },
};

export async function handleTicketsStats(context: ToolContext, args: any): Promise<ToolResult> {
  const params: any = { ...context.getAuthParams() };
  if (args.app_id || args.app_name) {
    params.app_id = await context.resolveAppId(args);
  }
  if (args.period_days !== undefined) {
    params.period = args.period_days;
  }

  const response = await safeApiCall(
    () => context.httpClient.get('/v2/tickets/stats', { params }),
    'Failed to execute request to /v2/tickets/stats'
  );
  const stats = (response.data && response.data.data) || {};

  return {
    content: [
      {
        type: 'text',
        text: `Support performance (last ${stats.period_days} days):\n${JSON.stringify(stats, null, 2)}`,
      },
    ],
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export const ticketsToolDefinitions = [
  ticketsListToolDefinition,
  ticketsGetToolDefinition,
  ticketsStatsToolDefinition,
];

export const ticketsToolHandlers = {
  'tickets_list': 'list',
  'tickets_get': 'get',
  'tickets_stats': 'stats',
} as const;

export class TicketsTools {
  constructor(private context: ToolContext) {}

  async list(args: any): Promise<ToolResult> {
    return handleTicketsList(this.context, args);
  }

  async get(args: any): Promise<ToolResult> {
    return handleTicketsGet(this.context, args);
  }

  async stats(args: any): Promise<ToolResult> {
    return handleTicketsStats(this.context, args);
  }
}

// Metadata for dynamic routing (must be after class declaration)
export const ticketsToolMetadata = {
  instanceKey: 'tickets',
  toolClass: TicketsTools,
  handlers: ticketsToolHandlers,
} as const;
