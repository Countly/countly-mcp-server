import { ToolContext, ToolResult } from './types.js';
import { safeApiCall, extractErrorDetails, wrapApiError } from '../lib/error-handler.js';

// ============================================================================
// TASKBOARD_SEARCH TOOL
// ============================================================================

export const searchTaskboardToolDefinition = {
  name: 'taskboard_search',
  description: 'Semantic search over taskboard tickets via /v2/taskboard/search. Returns ranked ticket sections with deep-link citations (space_id, task_id, task_key, title, heading, url, snippet, score). Results are limited to tickets the authenticated user may read. Requires the taskboard plugin with semantic search enabled; use taskboard_ask instead for a synthesized answer.',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Natural-language query describing what to look for.' },
      limit: { type: 'number', description: 'Maximum number of results (default 10, capped by the server).' },
    },
    required: ['query'],
  },
};

export async function handleSearchTaskboard(context: ToolContext, args: any): Promise<ToolResult> {
  const { query, limit } = args;

  const params: any = {
    ...context.getAuthParams(),
    query,
  };
  if (limit !== undefined) {
    params.limit = limit;
  }

  let response;
  try {
    response = await context.httpClient.get('/v2/taskboard/search', { params });
  } catch (error) {
    const details = extractErrorDetails(error);
    if (details.statusCode === 400) {
      return {
        content: [
          {
            type: 'text',
            text: 'Semantic search is not enabled for the taskboard plugin on this server. Ask an administrator to enable it, then retry taskboard_search or taskboard_ask.',
          },
        ],
      };
    }
    throw wrapApiError(error, 'Failed to execute request to /v2/taskboard/search');
  }

  const results = response.data?.results || [];

  return {
    content: [
      {
        type: 'text',
        text: `Found ${results.length} taskboard result(s) for "${query}":\n${JSON.stringify(response.data, null, 2)}`,
      },
    ],
  };
}

// ============================================================================
// TASKBOARD_ASK TOOL
// ============================================================================

export const askTaskboardToolDefinition = {
  name: 'taskboard_ask',
  description: 'Ask the taskboard a question via /v2/taskboard/ask. The server retrieves matching tickets (permission-scoped) and returns an answer with cited sources: an LLM-synthesized answer when the server has an LLM configured ("llm" mode), the top passages verbatim ("extractive" mode), or "none" when nothing matched. Requires the taskboard plugin with semantic search enabled; use taskboard_search for raw ranked results.',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'The question to answer from taskboard tickets.' },
    },
    required: ['query'],
  },
};

export async function handleAskTaskboard(context: ToolContext, args: any): Promise<ToolResult> {
  const { query } = args;

  const params: any = {
    ...context.getAuthParams(),
    query,
  };

  const response = await safeApiCall(
    () => context.httpClient.get('/v2/taskboard/ask', { params }),
    'Failed to execute request to /v2/taskboard/ask'
  );

  return {
    content: [
      {
        type: 'text',
        text: `Taskboard answer (${response.data?.mode || 'unknown'} mode):\n${JSON.stringify(response.data, null, 2)}`,
      },
    ],
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export const taskboardToolDefinitions = [
  searchTaskboardToolDefinition,
  askTaskboardToolDefinition,
];

export const taskboardToolHandlers = {
  'taskboard_search': 'searchTaskboard',
  'taskboard_ask': 'askTaskboard',
} as const;

export class TaskboardTools {
  constructor(private context: ToolContext) {}

  async searchTaskboard(args: any): Promise<ToolResult> {
    return handleSearchTaskboard(this.context, args);
  }

  async askTaskboard(args: any): Promise<ToolResult> {
    return handleAskTaskboard(this.context, args);
  }
}

// Metadata for dynamic routing (must be after class declaration)
export const taskboardToolMetadata = {
  instanceKey: 'taskboard',
  toolClass: TaskboardTools,
  handlers: taskboardToolHandlers,
} as const;
