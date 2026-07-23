import { ToolContext, ToolResult } from './types.js';
import { safeApiCall } from '../lib/error-handler.js';

// ============================================================================
// KNOWLEDGE_BASE_SPACES TOOL
// ============================================================================

export const listKnowledgeBaseSpacesToolDefinition = {
  name: 'knowledge_base_spaces',
  description: 'List knowledge base spaces the current user can read via /o/kb/spaces. Call this first to discover space ids for knowledge_base_search, knowledge_base_ask and knowledge_base_write. Requires the knowledge-base plugin.',
  inputSchema: {
    type: 'object',
    properties: {},
  },
};

export async function handleListKnowledgeBaseSpaces(context: ToolContext, _args: any): Promise<ToolResult> {
  const params = {
    ...context.getAuthParams(),
  };

  const response = await safeApiCall(
    () => context.httpClient.get('/o/kb/spaces', { params }),
    'Failed to execute request to /o/kb/spaces'
  );

  const spaces = Array.isArray(response.data) ? response.data : [];

  return {
    content: [
      {
        type: 'text',
        text: `Found ${spaces.length} knowledge base space(s):\n${JSON.stringify(response.data, null, 2)}`,
      },
    ],
  };
}

// ============================================================================
// KNOWLEDGE_BASE_SEARCH TOOL
// ============================================================================

export const searchKnowledgeBaseToolDefinition = {
  name: 'knowledge_base_search',
  description: 'Semantic search over the Countly knowledge base via /o/kb/rag-search. Returns ranked documentation sections with deep-link citations (title, heading, url, snippet, score). Results are limited to spaces the authenticated user may read. Requires the knowledge-base plugin with semantic search enabled; use knowledge_base_ask instead for a synthesized answer.',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Natural-language query describing what to look for.' },
      limit: { type: 'number', description: 'Maximum number of results (default 10, capped at 50 by the server).' },
      space_id: { type: 'string', description: 'Optional: restrict the search to one space. Call knowledge_base_spaces to discover ids.' },
    },
    required: ['query'],
  },
};

export async function handleSearchKnowledgeBase(context: ToolContext, args: any): Promise<ToolResult> {
  const { query, limit, space_id } = args;

  const params: any = {
    ...context.getAuthParams(),
    query,
  };
  if (limit !== undefined) {
    params.limit = limit;
  }
  if (space_id) {
    params.space_id = space_id;
  }

  const response = await safeApiCall(
    () => context.httpClient.get('/o/kb/rag-search', { params }),
    'Failed to execute request to /o/kb/rag-search'
  );

  const results = response.data?.results || [];

  return {
    content: [
      {
        type: 'text',
        text: `Found ${results.length} knowledge base result(s) for "${query}":\n${JSON.stringify(response.data, null, 2)}`,
      },
    ],
  };
}

// ============================================================================
// KNOWLEDGE_BASE_ASK TOOL
// ============================================================================

export const askKnowledgeBaseToolDefinition = {
  name: 'knowledge_base_ask',
  description: 'Ask the Countly knowledge base a question via /o/kb/ask. The server retrieves matching documentation (permission-scoped) and returns an answer with cited sources: an LLM-synthesized answer when the server has an LLM configured ("llm" mode), otherwise the top passages verbatim ("extractive" mode). Requires the knowledge-base plugin with semantic search enabled; use knowledge_base_search for raw ranked results.',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'The question to answer from the knowledge base.' },
      limit: { type: 'number', description: 'Maximum number of source passages to retrieve (default 10, capped at 50 by the server).' },
      space_id: { type: 'string', description: 'Optional: restrict retrieval to one space. Call knowledge_base_spaces to discover ids.' },
    },
    required: ['query'],
  },
};

export async function handleAskKnowledgeBase(context: ToolContext, args: any): Promise<ToolResult> {
  const { query, limit, space_id } = args;

  const params: any = {
    ...context.getAuthParams(),
    query,
  };
  if (limit !== undefined) {
    params.limit = limit;
  }
  if (space_id) {
    params.space_id = space_id;
  }

  const response = await safeApiCall(
    () => context.httpClient.get('/o/kb/ask', { params }),
    'Failed to execute request to /o/kb/ask'
  );

  return {
    content: [
      {
        type: 'text',
        text: `Knowledge base answer (${response.data?.mode || 'unknown'} mode):\n${JSON.stringify(response.data, null, 2)}`,
      },
    ],
  };
}

// ============================================================================
// KNOWLEDGE_BASE_WRITE TOOL
// ============================================================================

export const writeKnowledgeBasePageToolDefinition = {
  name: 'knowledge_base_write',
  description: 'Record documentation or decisions into the Countly knowledge base from Markdown via /i/kb/page-write. The server converts the Markdown to sanitized page content and publishes it. Pass a stable external_ref (feature id, branch, ticket) so repeated calls update the same page instead of creating duplicates. Requires create rights on the target space.',
  inputSchema: {
    type: 'object',
    properties: {
      space_id: { type: 'string', description: 'Target space id. Call knowledge_base_spaces first if unknown.' },
      markdown: { type: 'string', description: 'Page body as Markdown (headings, lists, tables, fenced code).' },
      title: { type: 'string', description: 'Page title. Required when creating; optional when updating an existing page by external_ref.' },
      external_ref: { type: 'string', description: 'Stable key (feature/branch/ticket id) for idempotent upsert. Same ref updates the same page on later calls; omit and every call creates a new page.' },
      parent_id: { type: 'string', description: 'Optional parent page id to nest the new page under.' },
    },
    required: ['space_id', 'markdown'],
  },
};

export async function handleWriteKnowledgeBasePage(context: ToolContext, args: any): Promise<ToolResult> {
  const { space_id, markdown, title, external_ref, parent_id } = args;

  const params: any = {
    ...context.getAuthParams(),
    space_id,
    markdown,
  };
  if (title) {
    params.title = title;
  }
  if (external_ref) {
    params.external_ref = external_ref;
  }
  if (parent_id) {
    params.parent_id = parent_id;
  }

  const response = await safeApiCall(
    () => context.httpClient.post('/i/kb/page-write', null, { params }),
    'Failed to execute request to /i/kb/page-write'
  );

  const created = response.data?.created;
  const action = created === false ? 'updated' : 'created';

  return {
    content: [
      {
        type: 'text',
        text: `Knowledge base page ${action}:\n${JSON.stringify(response.data, null, 2)}`,
      },
    ],
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export const knowledgeBaseToolDefinitions = [
  listKnowledgeBaseSpacesToolDefinition,
  searchKnowledgeBaseToolDefinition,
  askKnowledgeBaseToolDefinition,
  writeKnowledgeBasePageToolDefinition,
];

export const knowledgeBaseToolHandlers = {
  'knowledge_base_spaces': 'listSpaces',
  'knowledge_base_search': 'searchKnowledgeBase',
  'knowledge_base_ask': 'askKnowledgeBase',
  'knowledge_base_write': 'writePage',
} as const;

export class KnowledgeBaseTools {
  constructor(private context: ToolContext) {}

  async listSpaces(args: any): Promise<ToolResult> {
    return handleListKnowledgeBaseSpaces(this.context, args);
  }

  async searchKnowledgeBase(args: any): Promise<ToolResult> {
    return handleSearchKnowledgeBase(this.context, args);
  }

  async askKnowledgeBase(args: any): Promise<ToolResult> {
    return handleAskKnowledgeBase(this.context, args);
  }

  async writePage(args: any): Promise<ToolResult> {
    return handleWriteKnowledgeBasePage(this.context, args);
  }
}

// Metadata for dynamic routing (must be after class declaration)
export const knowledgeBaseToolMetadata = {
  instanceKey: 'knowledgeBase',
  toolClass: KnowledgeBaseTools,
  handlers: knowledgeBaseToolHandlers,
} as const;
