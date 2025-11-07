import { ToolContext, ToolResult } from './types.js';

// ============================================================================
// SEARCH TOOL
// ============================================================================

export const searchToolDefinition = {
  name: 'search',
  description: 'Search for relevant content in Countly data sources (required for ChatGPT Connectors)',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Search query string' },
    },
    required: ['query'],
  },
};

export async function handleSearch(context: ToolContext, args: any): Promise<ToolResult> {
  const { query } = args;
  
  // Search across multiple Countly data sources
  const apps = await context.appCache.getAll();
  const appResults = apps.filter(app => 
    app.name.toLowerCase().includes(query.toLowerCase())
  );
  
  return {
    content: [
      {
        type: 'text',
        text: `Search results for "${query}":\n${JSON.stringify({ apps: appResults }, null, 2)}`,
      },
    ],
  };
}

// ============================================================================
// FETCH TOOL
// ============================================================================

export const fetchToolDefinition = {
  name: 'fetch',
  description: 'Retrieve the full contents of a specific document or data item (required for ChatGPT Connectors)',
  inputSchema: {
    type: 'object',
    properties: {
      id: { type: 'string', description: 'Unique identifier for the document or data item' },
    },
    required: ['id'],
  },
};

export async function handleFetch(context: ToolContext, args: any): Promise<ToolResult> {
  const { id } = args;
  
  // Fetch specific document by ID
  const apps = await context.appCache.getAll();
  const app = apps.find(a => a._id === id);
  
  if (!app) {
    return {
      content: [
        {
          type: 'text',
          text: `Document with ID "${id}" not found`,
        },
      ],
    };
  }
  
  return {
    content: [
      {
        type: 'text',
        text: `Document ${id}:\n${JSON.stringify(app, null, 2)}`,
      },
    ],
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export const coreToolDefinitions = [
  searchToolDefinition,
  fetchToolDefinition,
];

export const coreToolHandlers = {
  'search': 'handleSearch',
  'fetch': 'handleFetch',
} as const;

export class CoreTools {
  constructor(private context: ToolContext) {}

  async search(args: any): Promise<ToolResult> {
    return handleSearch(this.context, args);
  }

  async fetch(args: any): Promise<ToolResult> {
    return handleFetch(this.context, args);
  }
}

// Metadata for dynamic routing (must be after class declaration)
export const coreToolMetadata = {
  instanceKey: 'core',
  toolClass: CoreTools,
  handlers: coreToolHandlers,
} as const;
