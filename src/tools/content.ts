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

  const resolvedType = type !== undefined ? type : existingBlock.type;
  if (!resolvedType) {
    return {
      content: [{
        type: 'text',
        text: `Error: Could not resolve the content block type for "${content_id}" - the stored block has no type. Provide the type parameter explicitly.`,
      }],
    };
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
        type: resolvedType,
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
// CONTENT ASSETS TOOLS
// ============================================================================

export const listContentAssetsToolDefinition = {
  name: 'content_assets_list',
  description: 'List uploaded content assets (images/videos usable in content blocks) for an app via /o/content/assets, including filenames, IDs, and metadata (tags, dimensions, mime type). Requires the content plugin (Countly Enterprise).',
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

export async function handleListContentAssets(
  context: ToolContext,
  input: Record<string, unknown>
): Promise<ToolResult> {
  const appId = await context.resolveAppId({
    app_id: input.app_id as string | undefined,
    app_name: input.app_name as string | undefined,
  });

  const response = await safeApiCall(
    () => context.httpClient.get('/o/content/assets', {
      params: { app_id: appId },
    }),
    'Failed to list content assets'
  );

  return {
    content: [{ type: 'text', text: JSON.stringify(response.data, null, 2) }],
  };
}

export const uploadContentAssetToolDefinition = {
  name: 'content_assets_upload',
  description: 'Upload an image asset for use in content blocks via /i/content/asset-upload (multipart). Accepts base64-encoded file data, max 5MB; the server compresses the image and generates a thumbnail. Fails if an asset with the same name already exists. Requires the content plugin (Countly Enterprise).',
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
      file_name: {
        type: 'string',
        description: 'Asset filename, e.g. "hero-banner.png". Must be unique per app.',
      },
      file_base64: {
        type: 'string',
        description: 'Base64-encoded file content (raw base64 without a data: URI prefix). Maximum decoded size is 5MB.',
      },
      mime_type: {
        type: 'string',
        description: 'File MIME type, e.g. "image/png" or "image/jpeg".',
      },
      tags: {
        type: 'array',
        items: {
          type: 'string',
        },
        description: 'Optional tags stored in the asset metadata.',
      },
      width: {
        type: 'number',
        description: 'Optional intrinsic width in pixels, stored in asset metadata (provide together with height).',
      },
      height: {
        type: 'number',
        description: 'Optional intrinsic height in pixels, stored in asset metadata (provide together with width).',
      },
    },
    required: ['file_name', 'file_base64', 'mime_type'],
  },
};

export async function handleUploadContentAsset(
  context: ToolContext,
  input: Record<string, unknown>
): Promise<ToolResult> {
  const appId = await context.resolveAppId({
    app_id: input.app_id as string | undefined,
    app_name: input.app_name as string | undefined,
  });
  const file_name = input.file_name as string;
  const file_base64 = input.file_base64 as string;
  const mime_type = input.mime_type as string;
  const tags = input.tags as string[] | undefined;
  const width = input.width as number | undefined;
  const height = input.height as number | undefined;

  let fileBuffer: Buffer;
  try {
    fileBuffer = Buffer.from(file_base64, 'base64');
    if (fileBuffer.length === 0) {
      throw new Error('decoded file is empty');
    }
  } catch (error) {
    return {
      content: [{
        type: 'text',
        text: `Error: Invalid file_base64 - ${error instanceof Error ? error.message : 'Unknown error'}`,
      }],
    };
  }

  if (fileBuffer.length > 5 * 1024 * 1024) {
    return {
      content: [{
        type: 'text',
        text: `Error: File size ${fileBuffer.length} bytes exceeds the 5MB limit.`,
      }],
    };
  }

  const formData = new FormData();
  formData.append('assets', new Blob([new Uint8Array(fileBuffer)], { type: mime_type }), file_name);

  const queryParams: Record<string, string> = {
    app_id: appId,
    name: file_name,
  };
  if (tags && tags.length > 0) {
    queryParams.tags = JSON.stringify(tags);
  }
  if (width !== undefined && height !== undefined) {
    queryParams.width = width.toString();
    queryParams.height = height.toString();
  }

  const response = await safeApiCall(
    () => context.httpClient.post('/i/content/asset-upload', formData, {
      params: queryParams,
    }),
    'Failed to upload content asset'
  );

  return {
    content: [{ type: 'text', text: JSON.stringify(response.data, null, 2) }],
  };
}

export const updateContentAssetToolDefinition = {
  name: 'content_assets_update',
  description: 'Update the name and/or tags of an uploaded content asset via /i/content/asset-update. At least one of name or tags must be provided. Requires the content plugin (Countly Enterprise). To find asset IDs use content_assets_list.',
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
      asset_id: {
        type: 'string',
        description: 'Asset ID (_id) to update. Obtain it from content_assets_list.',
      },
      name: {
        type: 'string',
        description: 'New asset filename. Omit to keep current.',
      },
      tags: {
        type: 'array',
        items: {
          type: 'string',
        },
        description: 'New tags array (replaces existing tags). Omit to keep current.',
      },
    },
    required: ['asset_id'],
  },
};

export async function handleUpdateContentAsset(
  context: ToolContext,
  input: Record<string, unknown>
): Promise<ToolResult> {
  const appId = await context.resolveAppId({
    app_id: input.app_id as string | undefined,
    app_name: input.app_name as string | undefined,
  });
  const name = input.name as string | undefined;
  const tags = input.tags as string[] | undefined;

  if (name === undefined && tags === undefined) {
    return {
      content: [{
        type: 'text',
        text: 'Error: Provide at least one of name or tags to update.',
      }],
    };
  }

  const queryParams: Record<string, string> = {
    app_id: appId,
    asset_id: input.asset_id as string,
  };
  if (name !== undefined) {
    queryParams.asset_name = name;
  }
  if (tags !== undefined) {
    queryParams.asset_tags = JSON.stringify(tags);
  }

  const response = await safeApiCall(
    () => context.httpClient.post('/i/content/asset-update', null, {
      params: queryParams,
    }),
    'Failed to update content asset'
  );

  return {
    content: [{ type: 'text', text: JSON.stringify(response.data, null, 2) }],
  };
}

export const deleteContentAssetToolDefinition = {
  name: 'content_assets_delete',
  description: 'Delete an uploaded content asset via /i/content/asset-delete. Content blocks that reference the asset will lose the image. Requires the content plugin (Countly Enterprise). WARNING: irreversible.',
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
      asset_id: {
        type: 'string',
        description: 'Asset ID (_id) to delete. Obtain it from content_assets_list.',
      },
    },
    required: ['asset_id'],
  },
};

export async function handleDeleteContentAsset(
  context: ToolContext,
  input: Record<string, unknown>
): Promise<ToolResult> {
  const appId = await context.resolveAppId({
    app_id: input.app_id as string | undefined,
    app_name: input.app_name as string | undefined,
  });

  const response = await safeApiCall(
    () => context.httpClient.post('/i/content/asset-delete', null, {
      params: {
        app_id: appId,
        asset_id: input.asset_id as string,
      },
    }),
    'Failed to delete content asset'
  );

  return {
    content: [{ type: 'text', text: JSON.stringify(response.data, null, 2) }],
  };
}

// ============================================================================
// CONTENT LANGUAGES TOOL
// ============================================================================

export const listContentLanguagesToolDefinition = {
  name: 'content_langs_list',
  description: 'List languages eligible for content translations via /o/content/langs, optionally scoped to one content block. Use the returned language codes as keys in element "translations" objects. Requires the content plugin (Countly Enterprise).',
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
        description: 'Optional content block ID to scope the language list to.',
      },
    },
  },
};

export async function handleListContentLanguages(
  context: ToolContext,
  input: Record<string, unknown>
): Promise<ToolResult> {
  const appId = await context.resolveAppId({
    app_id: input.app_id as string | undefined,
    app_name: input.app_name as string | undefined,
  });

  const queryParams: Record<string, string> = { app_id: appId };
  if (input.content_id) {
    queryParams.content_id = input.content_id as string;
  }

  const response = await safeApiCall(
    () => context.httpClient.get('/o/content/langs', { params: queryParams }),
    'Failed to list content languages'
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
  listContentAssetsToolDefinition,
  uploadContentAssetToolDefinition,
  updateContentAssetToolDefinition,
  deleteContentAssetToolDefinition,
  listContentLanguagesToolDefinition,
];

export const contentToolHandlers = {
  'content_blocks_list': 'content_blocks_list',
  'content_blocks_get': 'content_blocks_get',
  'content_blocks_preview': 'content_blocks_preview',
  'content_blocks_create': 'content_blocks_create',
  'content_blocks_update': 'content_blocks_update',
  'content_blocks_delete': 'content_blocks_delete',
  'content_assets_list': 'content_assets_list',
  'content_assets_upload': 'content_assets_upload',
  'content_assets_update': 'content_assets_update',
  'content_assets_delete': 'content_assets_delete',
  'content_langs_list': 'content_langs_list',
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

  async content_assets_list(args: any): Promise<ToolResult> {
    return handleListContentAssets(this.context, args);
  }

  async content_assets_upload(args: any): Promise<ToolResult> {
    return handleUploadContentAsset(this.context, args);
  }

  async content_assets_update(args: any): Promise<ToolResult> {
    return handleUpdateContentAsset(this.context, args);
  }

  async content_assets_delete(args: any): Promise<ToolResult> {
    return handleDeleteContentAsset(this.context, args);
  }

  async content_langs_list(args: any): Promise<ToolResult> {
    return handleListContentLanguages(this.context, args);
  }
}

export const contentToolMetadata = {
  instanceKey: 'content',
  toolClass: ContentTools,
  handlers: contentToolHandlers,
} as const;
