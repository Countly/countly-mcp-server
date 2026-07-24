import { ToolContext, ToolResult } from './types.js';
import { safeApiCall } from '../lib/error-handler.js';

// ============================================================================
// TICKETS_RAG_SEARCH TOOL
// ============================================================================

export const ticketsRagSearchToolDefinition = {
  name: 'tickets_rag_search',
  description: 'Semantic (RAG) search over indexed support-ticket conversations via GET /v2/tickets/rag/search. Returns the most relevant ticket transcript snippets for a natural-language query, ranked by vector similarity — use it to ground answers in how similar customer issues were actually resolved. Results are permission-scoped to the apps the API key can read, and PII in snippets is redacted according to the server\'s tickets.rag_pii_mode setting. Requires the tickets plugin with rag_enabled turned on; returns an error when the feature is disabled.',
  inputSchema: {
    type: 'object',
    properties: {
      q: { type: 'string', description: 'Natural-language search query, e.g. "export to CSV times out".' },
      app_id: { type: 'string', description: 'Optional application ID to restrict results to one app. Omit to search across all readable apps. Call apps_list first if you do not know it.' },
      app_name: { type: 'string', description: 'Optional application name (alternative to app_id). Must match an existing app exactly.' },
      limit: { type: 'number', description: 'Maximum number of hits to return (default 5, max 20).' },
    },
    required: ['q'],
  },
};

export async function handleTicketsRagSearch(context: ToolContext, args: any): Promise<ToolResult> {
  const { q, limit } = args;

  const params: any = {
    ...context.getAuthParams(),
    q,
  };
  // App scoping is optional — the endpoint searches every app the member can
  // read when app_id is omitted, so only resolve when the caller asked for it.
  if (args.app_id || args.app_name) {
    params.app_id = await context.resolveAppId(args);
  }
  if (limit !== undefined) {
    params.limit = limit;
  }

  const response = await safeApiCall(
    () => context.httpClient.get('/v2/tickets/rag/search', { params }),
    'Failed to execute request to /v2/tickets/rag/search'
  );

  const hits = (response.data && response.data.data) || [];
  if (!Array.isArray(hits) || hits.length === 0) {
    return {
      content: [
        {
          type: 'text',
          text: `No ticket conversations matched "${q}". The index only contains tickets opted into AI search on apps where it is enabled.`,
        },
      ],
    };
  }

  const lines = hits.map((hit: any) =>
    `#${hit.number} — ${hit.title} (score ${typeof hit.score === 'number' ? hit.score.toFixed(3) : hit.score}, app ${hit.app_id})\n${hit.snippet}`
  );

  return {
    content: [
      {
        type: 'text',
        text: `Found ${hits.length} matching ticket conversation(s) for "${q}":\n\n${lines.join('\n\n---\n\n')}`,
      },
    ],
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export const ticketsToolDefinitions = [
  ticketsRagSearchToolDefinition,
];

export const ticketsToolHandlers = {
  'tickets_rag_search': 'ragSearch',
} as const;

export class TicketsTools {
  constructor(private context: ToolContext) {}

  async ragSearch(args: any): Promise<ToolResult> {
    return handleTicketsRagSearch(this.context, args);
  }
}

// Metadata for dynamic routing (must be after class declaration)
export const ticketsToolMetadata = {
  instanceKey: 'tickets',
  toolClass: TicketsTools,
  handlers: ticketsToolHandlers,
} as const;
