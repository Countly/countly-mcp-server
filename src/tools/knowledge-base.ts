import { ToolContext, ToolResult } from './types.js';
import { safeApiCall } from '../lib/error-handler.js';

/*
 * Knowledge base authoring tools.
 *
 * Searching documentation is deliberately NOT here: retrieval across every
 * knowledge source (documentation, support tickets, work sessions) is owned by
 * the Countly `build` plugin and will be exposed as `build_recall` /
 * `build_ask` against `/o/build/*`. These two tools cover what is genuinely
 * knowledge-base-specific — discovering spaces and authoring pages.
 */

// ============================================================================
// KNOWLEDGE_BASE_SPACES TOOL
// ============================================================================

export const listKnowledgeBaseSpacesToolDefinition = {
  name: 'knowledge_base_spaces',
  description: 'List knowledge base spaces the current user can read via /o/kb/spaces. Call this first to discover the space id needed by knowledge_base_write. Requires the knowledge-base plugin.',
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
// KNOWLEDGE_BASE_WRITE TOOL
// ============================================================================

export const writeKnowledgeBasePageToolDefinition = {
  name: 'knowledge_base_write',
  description: 'Write documentation into the Countly knowledge base from Markdown via /i/kb/page-write. The server converts the Markdown to sanitized page content and publishes it. Pass a stable external_ref to update the same page on later calls instead of creating duplicates. Requires create rights on the target space.',
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
  writeKnowledgeBasePageToolDefinition,
];

export const knowledgeBaseToolHandlers = {
  'knowledge_base_spaces': 'listSpaces',
  'knowledge_base_write': 'writePage',
} as const;

export class KnowledgeBaseTools {
  constructor(private context: ToolContext) {}

  async listSpaces(args: any): Promise<ToolResult> {
    return handleListKnowledgeBaseSpaces(this.context, args);
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
