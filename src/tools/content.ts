import { ToolContext, ToolResult } from './types.js';
import { safeApiCall } from '../lib/error-handler.js';

/**
 * Content Module
 *
 * Tools for managing content blocks (in-app content builder) - reusable
 * pieces of in-app content (banners, modals, surveys, etc.) that can be
 * delivered to users, typically through journeys. Requires the 'content'
 * plugin (Countly Enterprise).
 *
 * Write endpoints (/i/content/*) take query-string parameters where complex
 * fields (blocks, details) are JSON-encoded strings; read endpoints
 * (/o/content, /o/content/by-id) use plain query parameters.
 */

const CONTENT_BLOCKS_DESCRIPTION = 'JSON-encoded array of content block objects defining the visual content. Each entry is an object with: layout (widget layout, e.g. "banner", "modal", "survey"), placement (per-size positioning, e.g. {"small":{"position":"center","heightMultiplier":1,"fullScreenOverride":true}}), and elements (the content elements, e.g. {"title":{"text":"Welcome","translations":{"en":"Welcome","es":"Bienvenido"}}}).';

// ============================================================================
// LIST CONTENT BLOCKS TOOL
// ============================================================================

export const listContentBlocksToolDefinition = {
  name: 'content_blocks_list',
  description: 'List all content blocks (in-app content such as banners, modals, surveys) for an app via /o/content, sorted by creation date descending and enriched with creator names. Requires the content plugin (Countly Enterprise). For one block with full details use content_blocks_get.',
  inputSchema: {
    type: 'object',
    properties: {
      app_id: {
        type: 'string',
        description: 'Application ID. Either app_id or app_name must be provided; call apps_list first if you do not know it.',
      },
      app_name: {
        type: 'string',
        description: 'Application name (alternative to app_id). Must match an existing app exactly; call apps_list to find valid names.',
      },
    },
  },
};

export async function handleListContentBlocks(
  context: ToolContext,
  input: Record<string, unknown>
): Promise<ToolResult> {
  const app_id = input.app_id as string | undefined;
  const app_name = input.app_name as string | undefined;

  const appId = await context.resolveAppId({ app_id, app_name });

  const response = await safeApiCall(
    () => context.httpClient.get('/o/content', {
      params: { app_id: appId },
    }),
    'Failed to list content blocks'
  );

  return {
    content: [{ type: 'text', text: JSON.stringify(response.data, null, 2) }],
  };
}

// ============================================================================
// GET CONTENT BLOCK TOOL
// ============================================================================

export const getContentBlockToolDefinition = {
  name: 'content_blocks_get',
  description: 'Get one content block by ID via /o/content/by-id, including its full block definitions and metadata. Requires the content plugin (Countly Enterprise). To find content block IDs use content_blocks_list.',
  inputSchema: {
    type: 'object',
    properties: {
      app_id: {
        type: 'string',
        description: 'Application ID. Either app_id or app_name must be provided; call apps_list first if you do not know it.',
      },
      app_name: {
        type: 'string',
        description: 'Application name (alternative to app_id). Must match an existing app exactly; call apps_list to find valid names.',
      },
      content_id: {
        type: 'string',
        description: 'Content block ID (_id). Obtain it from content_blocks_list.',
      },
    },
    required: ['content_id'],
  },
};

export async function handleGetContentBlock(
  context: ToolContext,
  input: Record<string, unknown>
): Promise<ToolResult> {
  const app_id = input.app_id as string | undefined;
  const app_name = input.app_name as string | undefined;
  const content_id = input.content_id as string;

  const appId = await context.resolveAppId({ app_id, app_name });

  const response = await safeApiCall(
    () => context.httpClient.get('/o/content/by-id', {
      params: {
        app_id: appId,
        _id: content_id,
      },
    }),
    'Failed to get content block'
  );

  return {
    content: [{ type: 'text', text: JSON.stringify(response.data, null, 2) }],
  };
}

// ============================================================================
// PREVIEW CONTENT BLOCK TOOL
// ============================================================================

export const previewContentBlockToolDefinition = {
  name: 'content_blocks_preview',
  description: 'Get a browser preview URL for a content block. The URL points to the Countly server\'s public /_external/content renderer (the same page SDK webviews load), showing the block exactly as end users see it. Requires the content plugin (Countly Enterprise). To find content block IDs use content_blocks_list.',
  inputSchema: {
    type: 'object',
    properties: {
      app_id: {
        type: 'string',
        description: 'Application ID. Either app_id or app_name must be provided; call apps_list first if you do not know it.',
      },
      app_name: {
        type: 'string',
        description: 'Application name (alternative to app_id). Must match an existing app exactly; call apps_list to find valid names.',
      },
      content_id: {
        type: 'string',
        description: 'Content block ID (_id) to preview. Obtain it from content_blocks_list.',
      },
    },
    required: ['content_id'],
  },
};

export async function handlePreviewContentBlock(
  context: ToolContext,
  input: Record<string, unknown>
): Promise<ToolResult> {
  const app_id = input.app_id as string | undefined;
  const app_name = input.app_name as string | undefined;
  const content_id = input.content_id as string;

  const appId = await context.resolveAppId({ app_id, app_name });

  // Validate the block exists (and pick up its title/type) so we never hand
  // out a dead preview link.
  const existingResponse = await safeApiCall(
    () => context.httpClient.get('/o/content/by-id', {
      params: {
        app_id: appId,
        _id: content_id,
      },
    }),
    'Failed to get content block'
  );

  const block = existingResponse.data || {};
  const serverUrl = (context.httpClient.defaults.baseURL || '').replace(/\/+$/, '');
  const previewUrl = `${serverUrl}/_external/content/?id=${encodeURIComponent(content_id)}&app_id=${encodeURIComponent(appId)}`;

  const lines = [
    `Preview URL for content block "${block.details?.title || content_id}"${block.type ? ` (type: ${block.type})` : ''}:`,
    '',
    previewUrl,
    '',
    'Open this URL in a browser to see the content rendered exactly as end users see it. Note: the renderer endpoint is public (no dashboard login required), so treat the link accordingly.',
  ];

  return {
    content: [{ type: 'text', text: lines.join('\n') }],
  };
}

// ============================================================================
// CREATE CONTENT BLOCK TOOL
// ============================================================================

export const createContentBlockToolDefinition = {
  name: 'content_blocks_create',
  description: 'Create a content block (in-app content such as a banner, modal, or survey) via /i/content/save. The created block can be referenced from journey "in-app-content" engagement blocks by its ID. Requires the content plugin (Countly Enterprise). For editing an existing block use content_blocks_update.',
  inputSchema: {
    type: 'object',
    properties: {
      app_id: {
        type: 'string',
        description: 'Application ID. Either app_id or app_name must be provided; call apps_list first if you do not know it.',
      },
      app_name: {
        type: 'string',
        description: 'Application name (alternative to app_id). Must match an existing app exactly; call apps_list to find valid names.',
      },
      title: {
        type: 'string',
        description: 'Content block title shown in the content list.',
      },
      type: {
        type: 'string',
        description: 'Content block type, e.g. "Banner". Matches the widget type used by the content builder UI.',
      },
      blocks: {
        type: 'string',
        description: CONTENT_BLOCKS_DESCRIPTION,
      },
      favorite: {
        type: 'boolean',
        description: 'Mark the content block as favorite. Defaults to false.',
        default: false,
      },
    },
    required: ['title', 'type', 'blocks'],
  },
};

export async function handleCreateContentBlock(
  context: ToolContext,
  input: Record<string, unknown>
): Promise<ToolResult> {
  const app_id = input.app_id as string | undefined;
  const app_name = input.app_name as string | undefined;
  const title = input.title as string;
  const type = input.type as string;
  const blocks = input.blocks as string;
  const favorite = (input.favorite as boolean | undefined) === true;

  const appId = await context.resolveAppId({ app_id, app_name });

  let blocksArray;
  try {
    blocksArray = JSON.parse(blocks);
    if (!Array.isArray(blocksArray)) {
      throw new Error('blocks must be an array');
    }
  } catch (error) {
    return {
      content: [{
        type: 'text',
        text: `Error: Invalid blocks JSON - ${error instanceof Error ? error.message : 'Unknown error'}`,
      }],
    };
  }

  // The server overwrites details.created/updated with its own timestamps.
  const details = {
    title,
    favorite,
  };

  const response = await safeApiCall(
    () => context.httpClient.post('/i/content/save', null, {
      params: {
        app_id: appId,
        type,
        blocks: JSON.stringify(blocksArray),
        details: JSON.stringify(details),
      },
    }),
    'Failed to create content block'
  );

  return {
    content: [{ type: 'text', text: JSON.stringify(response.data, null, 2) }],
  };
}

// ============================================================================
// UPDATE CONTENT BLOCK TOOL
// ============================================================================

export const updateContentBlockToolDefinition = {
  name: 'content_blocks_update',
  description: 'Update an existing content block via /i/content/save. Only supplied fields change; others are preserved from the current block. Note that a supplied blocks value fully replaces the stored block definitions. Requires the content plugin (Countly Enterprise).',
  inputSchema: {
    type: 'object',
    properties: {
      app_id: {
        type: 'string',
        description: 'Application ID. Either app_id or app_name must be provided; call apps_list first if you do not know it.',
      },
      app_name: {
        type: 'string',
        description: 'Application name (alternative to app_id). Must match an existing app exactly; call apps_list to find valid names.',
      },
      content_id: {
        type: 'string',
        description: 'Content block ID (_id) to update. Obtain it from content_blocks_list.',
      },
      title: {
        type: 'string',
        description: 'New content block title. Omit to keep current.',
      },
      type: {
        type: 'string',
        description: 'New content block type. Omit to keep current.',
      },
      blocks: {
        type: 'string',
        description: `${CONTENT_BLOCKS_DESCRIPTION} Replaces the current block definitions entirely. Omit to keep current.`,
      },
      favorite: {
        type: 'boolean',
        description: 'Mark or unmark the content block as favorite. Omit to keep current.',
      },
    },
    required: ['content_id'],
  },
};

export async function handleUpdateContentBlock(
  context: ToolContext,
  input: Record<string, unknown>
): Promise<ToolResult> {
  const app_id = input.app_id as string | undefined;
  const app_name = input.app_name as string | undefined;
  const content_id = input.content_id as string;
  const title = input.title as string | undefined;
  const type = input.type as string | undefined;
  const blocks = input.blocks as string | undefined;
  const favorite = input.favorite as boolean | undefined;

  const appId = await context.resolveAppId({ app_id, app_name });

  // Fetch the existing content block to preserve fields not being updated.
  const existingResponse = await safeApiCall(
    () => context.httpClient.get('/o/content/by-id', {
      params: {
        app_id: appId,
        _id: content_id,
      },
    }),
    'Failed to get existing content block'
  );

  const existingBlock = existingResponse.data || {};
  const existingDetails = existingBlock.details || {};

  let blocksArray: unknown[] | undefined;
  if (blocks !== undefined) {
    try {
      blocksArray = JSON.parse(blocks);
      if (!Array.isArray(blocksArray)) {
        throw new Error('blocks must be an array');
      }
    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: `Error: Invalid blocks JSON - ${error instanceof Error ? error.message : 'Unknown error'}`,
        }],
      };
    }
  }

  const details: Record<string, unknown> = {
    title: title !== undefined ? title : existingDetails.title,
    favorite: favorite !== undefined ? favorite : (existingDetails.favorite === true),
  };
  if (existingDetails.created !== undefined) {
    details.created = existingDetails.created;
  }
  if (existingDetails.creatorId !== undefined) {
    details.creatorId = existingDetails.creatorId;
  }

  const response = await safeApiCall(
    () => context.httpClient.post('/i/content/save', null, {
      params: {
        app_id: appId,
        content_id,
        type: type !== undefined ? type : (existingBlock.type || ''),
        blocks: JSON.stringify(blocksArray !== undefined ? blocksArray : (existingBlock.blocks || [])),
        details: JSON.stringify(details),
      },
    }),
    'Failed to update content block'
  );

  return {
    content: [{ type: 'text', text: JSON.stringify(response.data, null, 2) }],
  };
}

// ============================================================================
// DELETE CONTENT BLOCK TOOL
// ============================================================================

export const deleteContentBlockToolDefinition = {
  name: 'content_blocks_delete',
  description: 'Delete a content block via /i/content/delete. Fails with "content-is-used-in-a-journey" if the block is referenced by a journey; remove it from the journey first. Requires the content plugin (Countly Enterprise). WARNING: irreversible.',
  inputSchema: {
    type: 'object',
    properties: {
      app_id: {
        type: 'string',
        description: 'Application ID. Either app_id or app_name must be provided; call apps_list first if you do not know it.',
      },
      app_name: {
        type: 'string',
        description: 'Application name (alternative to app_id). Must match an existing app exactly; call apps_list to find valid names.',
      },
      content_id: {
        type: 'string',
        description: 'Content block ID (_id) to delete. Obtain it from content_blocks_list.',
      },
    },
    required: ['content_id'],
  },
};

export async function handleDeleteContentBlock(
  context: ToolContext,
  input: Record<string, unknown>
): Promise<ToolResult> {
  const app_id = input.app_id as string | undefined;
  const app_name = input.app_name as string | undefined;
  const content_id = input.content_id as string;

  const appId = await context.resolveAppId({ app_id, app_name });

  const response = await safeApiCall(
    () => context.httpClient.post('/i/content/delete', null, {
      params: {
        app_id: appId,
        _id: content_id,
      },
    }),
    'Failed to delete content block'
  );

  return {
    content: [{ type: 'text', text: JSON.stringify(response.data, null, 2) }],
  };
}

// ============================================================================
// Export Combined Arrays
// ============================================================================

export const contentToolDefinitions = [
  listContentBlocksToolDefinition,
  getContentBlockToolDefinition,
  previewContentBlockToolDefinition,
  createContentBlockToolDefinition,
  updateContentBlockToolDefinition,
  deleteContentBlockToolDefinition,
];

export const contentToolHandlers = {
  'content_blocks_list': 'content_blocks_list',
  'content_blocks_get': 'content_blocks_get',
  'content_blocks_preview': 'content_blocks_preview',
  'content_blocks_create': 'content_blocks_create',
  'content_blocks_update': 'content_blocks_update',
  'content_blocks_delete': 'content_blocks_delete',
} as const;

export class ContentTools {
  constructor(private context: ToolContext) {}

  async content_blocks_list(args: any): Promise<ToolResult> {
    return handleListContentBlocks(this.context, args);
  }

  async content_blocks_get(args: any): Promise<ToolResult> {
    return handleGetContentBlock(this.context, args);
  }

  async content_blocks_preview(args: any): Promise<ToolResult> {
    return handlePreviewContentBlock(this.context, args);
  }

  async content_blocks_create(args: any): Promise<ToolResult> {
    return handleCreateContentBlock(this.context, args);
  }

  async content_blocks_update(args: any): Promise<ToolResult> {
    return handleUpdateContentBlock(this.context, args);
  }

  async content_blocks_delete(args: any): Promise<ToolResult> {
    return handleDeleteContentBlock(this.context, args);
  }
}

export const contentToolMetadata = {
  instanceKey: 'content',
  toolClass: ContentTools,
  handlers: contentToolHandlers,
} as const;
