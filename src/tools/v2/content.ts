/**
 * Content tools: Countly Platform /v2 variants (/v2/content)
 *
 * Platform replaces the classic content blocks (layout / placement /
 * elements) with content messages: a messageFormat (popup, carousel, banner,
 * survey, push), a platform, and slides made of typed blocks. The list unions
 * native messages with legacy content blocks, so:
 *
 * - content_blocks_list / _get / _preview / _delete accept both kinds; a
 *   legacy id falls back to the classic endpoints.
 * - content_blocks_create / _update write native messages only (legacy
 *   blocks are read-only here, as in the Platform dashboard).
 * - content_assets_* use the shared v2 asset store, which is what native
 *   messages reference. Legacy assets stay with legacy blocks.
 * - content_langs_list has no v2 equivalent and stays classic.
 */

import { jsonResult, V2ApiError, v2ErrorResult, v2Request } from '../../lib/v2-api.js';
import type { ToolContext, ToolResult } from '../types.js';

const MESSAGES = '/v2/content/messages';
const ASSETS = '/v2/content/assets';
const MAX_ASSET_BYTES = 10 * 1024 * 1024;

const appProps = {
  app_id: { type: 'string', description: 'Application ID. Either app_id or app_name must be provided; call apps_list first if you do not know it.' },
  app_name: { type: 'string', description: 'Application name (alternative to app_id). Must match an existing app exactly.' },
};
const contentIdProp = {
  content_id: { type: 'string', description: 'Content message ID (_id). Obtain it from content_blocks_list.' },
};

const SLIDES_DESCRIPTION = 'JSON-encoded array of slides (popup / banner / push: one slide; carousel: one per slide; survey: one per step). Each slide is {"id": "s1", "blocks": [...]}, each block {"id": "b1", "type": <type>, "config": {...}}. Types: header, text, image, button, spacer, divider, hero, list, dismiss, label, rating, consent; survey questions nps, csat, scale, multiple_choice, text_input, email_input; push_config / push_ios_config / push_android_config / push_web_config. Text fields are PersonalizedText objects {"text": "Hello", "parameters": {}}. Common configs: header/text {text, align, fontSize}, image {src, alt, height, fit} (src from content_assets_list), button {buttons: [{id, text, style: "primary"|"secondary"|"outline"|"ghost", action: "url"|"dismiss"|"next_slide"|"next_step", url}]}, dismiss {} for a close button. Example popup: [{"id":"s1","blocks":[{"id":"b1","type":"header","config":{"text":{"text":"Welcome!","parameters":{}}}},{"id":"b2","type":"text","config":{"text":{"text":"Thanks for joining.","parameters":{}}}},{"id":"b3","type":"button","config":{"buttons":[{"id":"btn1","text":{"text":"Got it","parameters":{}},"style":"primary","action":"dismiss","url":""}]}}]}]. Tip: content_blocks_get on an existing message shows a complete example.';

const messageProps = {
  message_format: { type: 'string', enum: ['popup', 'carousel', 'banner', 'survey', 'push'], description: 'Message format.' },
  platform: { type: 'string', enum: ['mobile', 'web', 'desktop'], description: 'Target platform.' },
  status: { type: 'string', enum: ['draft', 'ready'], description: 'Message status. New messages default to "draft"; "ready" makes it selectable in journeys and campaigns.' },
  slides: { type: 'string', description: SLIDES_DESCRIPTION },
  placement_mode: { type: 'string', enum: ['modal', 'bottom_sheet', 'widget_br', 'widget_bl', 'slide_in', 'fullscreen', 'sidebar', 'toast', 'bottom_bar'], description: 'Where the message appears. Defaults to "modal".' },
  placement_settings: { type: 'string', description: 'Optional JSON object of placement settings, e.g. {"animation":"fade","dismissClickOutside":true,"autoDismiss":false,"showBackdrop":true,"backdropOpacity":50}.' },
  styling: { type: 'string', description: 'Optional JSON object of style overrides, e.g. {"cardRadius":12,"cardAlign":"center","bannerPosition":"top","carouselIndicator":"dots"}.' },
  translations: { type: 'string', description: 'Optional JSON object {"defaultLanguage":"en","enabledLanguages":["en","de"],"strings":{"de":{"<blockId>.<field>":{"text":{"text":"Hallo","parameters":{}},"status":"reviewed"}}}}. Defaults to English only.' },
};

export const contentV2ToolDefinitions: Record<string, any> = {
  content_blocks_list: {
    name: 'content_blocks_list',
    description: 'List content messages (in-app popups, banners, carousels, surveys, push) of an app, including legacy content blocks (flagged legacy), with format, platform, status and where each is used; paginated with status counts. Requires the content plugin. For one message use content_blocks_get.',
    inputSchema: {
      type: 'object',
      properties: {
        ...appProps,
        search: { type: 'string', description: 'Case-insensitive substring filter on name.' },
        status: { type: 'string', description: 'Optional status filter: "draft", "ready", "used", "in_review", "approved".' },
        message_format: { type: 'string', description: 'Optional format filter, comma-separated: "popup", "carousel", "banner", "survey", "push".' },
        sort: { type: 'string', enum: ['name', 'messageFormat', 'updatedAt'], description: 'Sort field. Defaults to "updatedAt".' },
        direction: { type: 'string', enum: ['asc', 'desc'], description: 'Sort direction. Defaults to "desc".' },
        page: { type: 'number', description: '1-based page number. Defaults to 1.' },
        page_size: { type: 'number', description: 'Messages per page. Defaults to 20.' },
      },
    },
  },
  content_blocks_get: {
    name: 'content_blocks_get',
    description: 'Get one content message with its slides, styling, placement and translations (or a legacy content block in its classic format). Requires the content plugin. To find IDs use content_blocks_list.',
    inputSchema: { type: 'object', properties: { ...appProps, ...contentIdProp }, required: ['content_id'] },
  },
  content_blocks_preview: {
    name: 'content_blocks_preview',
    description: 'Get a browser preview URL for a content message, rendered by the server exactly as end users see it (push messages have no preview). Requires the content plugin. To find IDs use content_blocks_list.',
    inputSchema: { type: 'object', properties: { ...appProps, ...contentIdProp }, required: ['content_id'] },
  },
  content_blocks_create: {
    name: 'content_blocks_create',
    description: 'Create a content message (popup, banner, carousel, survey or push) that journeys and campaigns can deliver; its ID goes into a journey "in-app-content" block\'s contentId. Requires the content plugin. To edit use content_blocks_update.',
    inputSchema: {
      type: 'object',
      properties: {
        ...appProps,
        name: { type: 'string', description: 'Message name shown in the content list (max 60 characters).' },
        ...messageProps,
      },
      required: ['name', 'message_format', 'platform', 'slides'],
    },
  },
  content_blocks_update: {
    name: 'content_blocks_update',
    description: 'Update a content message. Only supplied fields change; slides, styling, placement settings and translations are replaced as a whole when given. Legacy content blocks cannot be edited here. Requires the content plugin.',
    inputSchema: {
      type: 'object',
      properties: {
        ...appProps,
        ...contentIdProp,
        name: { type: 'string', description: 'New name. Omit to keep current.' },
        ...messageProps,
      },
      required: ['content_id'],
    },
  },
  content_blocks_delete: {
    name: 'content_blocks_delete',
    description: 'Delete a content message (or a legacy content block). Refuses content still used by a journey or campaign; remove it there first. Requires the content plugin. WARNING: the message disappears from lists and can no longer be delivered.',
    inputSchema: { type: 'object', properties: { ...appProps, ...contentIdProp }, required: ['content_id'] },
  },
  content_assets_list: {
    name: 'content_assets_list',
    description: 'List image assets usable in content messages (name, size, dimensions, tags, src URL for image blocks, and which messages use them), paginated. Requires the content plugin.',
    inputSchema: {
      type: 'object',
      properties: {
        ...appProps,
        search: { type: 'string', description: 'Case-insensitive substring filter on name.' },
        tags: { type: 'array', items: { type: 'string' }, description: 'Only assets with these tags.' },
        page: { type: 'number', description: '1-based page number. Defaults to 1.' },
        page_size: { type: 'number', description: 'Assets per page. Defaults to 20.' },
      },
    },
  },
  content_assets_upload: {
    name: 'content_assets_upload',
    description: 'Upload an image (PNG, JPEG, GIF, WebP or SVG, max 10MB) for content messages. The type and dimensions are read from the file; uploading identical bytes again returns the existing asset. Use the returned src in image blocks. Requires the content plugin.',
    inputSchema: {
      type: 'object',
      properties: {
        ...appProps,
        file_name: { type: 'string', description: 'File name, e.g. "hero-banner.png". Also the asset name unless name is given.' },
        file_base64: { type: 'string', description: 'Base64-encoded file content (raw base64 without a data: URI prefix). Maximum decoded size is 10MB.' },
        mime_type: { type: 'string', description: 'File MIME type, e.g. "image/png". The server verifies it from the bytes.' },
        name: { type: 'string', description: 'Optional display name. Defaults to file_name.' },
        tags: { type: 'array', items: { type: 'string' }, description: 'Optional tags.' },
      },
      required: ['file_name', 'file_base64', 'mime_type'],
    },
  },
  content_assets_update: {
    name: 'content_assets_update',
    description: 'Rename or retag a content asset. At least one of name or tags must be provided. Requires the content plugin. To find asset IDs use content_assets_list.',
    inputSchema: {
      type: 'object',
      properties: {
        ...appProps,
        asset_id: { type: 'string', description: 'Asset ID (_id). Obtain it from content_assets_list.' },
        name: { type: 'string', description: 'New name. Omit to keep current.' },
        tags: { type: 'array', items: { type: 'string' }, description: 'New tags (replace existing). Omit to keep current.' },
      },
      required: ['asset_id'],
    },
  },
  content_assets_delete: {
    name: 'content_assets_delete',
    description: 'Remove a content asset from an app (deleted for good once no app uses it). Refuses assets still used by this app\'s messages. Requires the content plugin. WARNING: irreversible.',
    inputSchema: {
      type: 'object',
      properties: {
        ...appProps,
        asset_id: { type: 'string', description: 'Asset ID (_id). Obtain it from content_assets_list.' },
      },
      required: ['asset_id'],
    },
  },
};

// ── helpers ──────────────────────────────────────────────

const iso = (ms: unknown): string | undefined => (typeof ms === 'number' && ms > 0 ? new Date(ms).toISOString() : undefined);
const isNotFound = (error: unknown) => error instanceof V2ApiError && error.status === 404;
const errorResult = (text: string): ToolResult & { isError: true } => ({ content: [{ type: 'text', text: `Error: ${text}` }], isError: true });

function parseJsonArg(value: unknown, name: string, kind: 'array' | 'object'): unknown {
  let parsed: unknown;
  try {
    parsed = typeof value === 'string' ? JSON.parse(value) : value;
  } catch (error) {
    throw new Error(`Invalid ${name} JSON - ${error instanceof Error ? error.message : 'parse error'}`);
  }
  const ok = kind === 'array' ? Array.isArray(parsed) : parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed);
  if (!ok) {
    throw new Error(`Invalid ${name} JSON - must be an ${kind}`);
  }
  return parsed;
}

/** Map tool args onto a content message body */
export function messageBody(args: any): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  const scalar: Record<string, string> = {
    name: 'name', message_format: 'messageFormat', platform: 'platform', status: 'status', placement_mode: 'placementMode',
  };
  for (const [arg, field] of Object.entries(scalar)) {
    if (args[arg] !== undefined) {
      body[field] = args[arg];
    }
  }
  if (args.slides !== undefined) {
    body.slides = parseJsonArg(args.slides, 'slides', 'array');
  }
  const objects: Record<string, string> = { placement_settings: 'placementSettings', styling: 'styling', translations: 'translations' };
  for (const [arg, field] of Object.entries(objects)) {
    if (args[arg] !== undefined) {
      body[field] = parseJsonArg(args[arg], arg, 'object');
    }
  }
  return body;
}

function compactMessage(m: any): any {
  const { createdAt, updatedAt, deletedAt: _deleted, schemaVersion: _schema, ...rest } = m;
  return { ...rest, createdAt: iso(createdAt), updatedAt: iso(updatedAt) };
}

const getMessage = (context: ToolContext, app_id: string, id: string) =>
  v2Request<any>(context, 'get', `${MESSAGES}/${encodeURIComponent(id)}`, { params: { app_id } });

/** The legacy content block, or null when it does not exist either */
async function getLegacyBlock(context: ToolContext, app_id: string, id: string): Promise<any | null> {
  try {
    const response = await context.httpClient.get('/o/content/by-id', { params: { app_id, _id: id } });
    const block = response.data;
    return block && typeof block === 'object' && block._id ? block : null;
  } catch {
    return null;
  }
}

// ── message handlers ─────────────────────────────────────

export async function handleListContentBlocksV2(context: ToolContext, args: any): Promise<ToolResult> {
  try {
    const app_id = await context.resolveAppId(args);
    const data = await v2Request<any>(context, 'get', MESSAGES, {
      params: {
        app_id,
        page: Math.max(1, Number(args.page ?? 1)),
        pageSize: Math.max(1, Number(args.page_size ?? 20)),
        ...(args.search ? { search: args.search } : {}),
        ...(args.status ? { status: args.status } : {}),
        ...(args.message_format ? { messageFormat: args.message_format } : {}),
        ...(args.sort ? { sort: args.sort } : {}),
        ...(args.direction ? { direction: args.direction } : {}),
      },
    });
    const items = (data.items || []).map((m: any) => ({
      id: m._id,
      name: m.name,
      format: m.messageFormat,
      platform: m.platform ?? undefined,
      status: m.status,
      legacy: m.legacy || undefined,
      usedIn: m.usedIn?.length ? m.usedIn.map((u: any) => ({ type: u.type, id: u.id, name: u.name })) : undefined,
      createdBy: m.createdByName || m.createdBy,
      updated: iso(m.updatedAt),
    }));
    return jsonResult(`Content for app ${app_id} (page ${data.page}, ${data.total} total)`, { counts: data.counts, items });
  } catch (error) {
    return v2ErrorResult('list content', error);
  }
}

export async function handleGetContentBlockV2(context: ToolContext, args: any): Promise<ToolResult> {
  try {
    const app_id = await context.resolveAppId(args);
    try {
      return jsonResult(`Content message ${args.content_id}`, compactMessage(await getMessage(context, app_id, args.content_id)));
    } catch (error) {
      if (!isNotFound(error)) {
        throw error;
      }
      const legacy = await getLegacyBlock(context, app_id, args.content_id);
      if (!legacy) {
        throw error;
      }
      return jsonResult(`Legacy content block ${args.content_id} (classic format, read-only on Countly Platform)`, legacy);
    }
  } catch (error) {
    return v2ErrorResult('get content', error);
  }
}

export async function handlePreviewContentBlockV2(context: ToolContext, args: any): Promise<ToolResult> {
  try {
    const app_id = await context.resolveAppId(args);
    const serverUrl = (context.httpClient.defaults?.baseURL || '').replace(/\/+$/, '');
    const id = encodeURIComponent(args.content_id);
    let title: string;
    let url: string;
    try {
      const message = await getMessage(context, app_id, args.content_id);
      if (message.messageFormat === 'push') {
        return errorResult(`"${message.name}" is a push message; push content has no browser preview. Use content_blocks_get to inspect it.`);
      }
      title = `content message "${message.name}" (${message.messageFormat}, ${message.platform})`;
      url = `${serverUrl}${MESSAGES}/${encodeURIComponent(app_id)}/${id}/render`;
    } catch (error) {
      if (!isNotFound(error)) {
        throw error;
      }
      const legacy = await getLegacyBlock(context, app_id, args.content_id);
      if (!legacy) {
        throw error;
      }
      title = `legacy content block "${legacy.details?.title || args.content_id}"`;
      url = `${serverUrl}/_external/content/?id=${id}&app_id=${encodeURIComponent(app_id)}`;
    }
    return {
      content: [{
        type: 'text',
        text: `Preview URL for ${title}:\n\n${url}\n\nOpen it in a browser to see the content as end users see it (personalization shows fallbacks). The page is public (no login), so treat the link accordingly.`,
      }],
    };
  } catch (error) {
    return v2ErrorResult('preview content', error);
  }
}

export async function handleCreateContentBlockV2(context: ToolContext, args: any): Promise<ToolResult> {
  try {
    const app_id = await context.resolveAppId(args);
    const created = await v2Request<any>(context, 'post', MESSAGES, { params: { app_id }, body: { app_id, ...messageBody(args) } });
    return jsonResult('Content message created', {
      id: created._id, name: created.name, format: created.messageFormat, platform: created.platform, status: created.status,
    });
  } catch (error) {
    return v2ErrorResult('create content message', error);
  }
}

export async function handleUpdateContentBlockV2(context: ToolContext, args: any): Promise<ToolResult> {
  try {
    const app_id = await context.resolveAppId(args);
    const body = messageBody(args);
    if (Object.keys(body).length === 0) {
      return errorResult('Nothing to update. Provide at least one field to change.');
    }
    try {
      const updated = await v2Request<any>(context, 'patch', `${MESSAGES}/${encodeURIComponent(args.content_id)}`, { params: { app_id }, body });
      return jsonResult('Content message updated', {
        id: updated._id, name: updated.name, format: updated.messageFormat, platform: updated.platform, status: updated.status, updated: iso(updated.updatedAt),
      });
    } catch (error) {
      if (isNotFound(error) && await getLegacyBlock(context, app_id, args.content_id)) {
        return errorResult(`"${args.content_id}" is a legacy content block, which is read-only on Countly Platform. Create a new message with content_blocks_create instead (content_blocks_get shows the legacy content to copy from).`);
      }
      throw error;
    }
  } catch (error) {
    return v2ErrorResult('update content message', error);
  }
}

export async function handleDeleteContentBlockV2(
  context: ToolContext,
  args: any,
  legacy: () => Promise<ToolResult>
): Promise<ToolResult> {
  try {
    const app_id = await context.resolveAppId(args);
    const id = encodeURIComponent(args.content_id);
    let usage: any;
    try {
      usage = await v2Request<any>(context, 'get', `${MESSAGES}/${id}/usage`, { params: { app_id } });
    } catch (error) {
      if (isNotFound(error)) {
        return legacy();
      }
      throw error;
    }
    if (usage?.inUse) {
      const refs = (usage.usedIn || []).map((u: any) => `${u.type} ${u.name || u.id}`);
      if (usage.legacyJourney) {
        refs.push('a legacy journey');
      }
      return errorResult(`Content "${args.content_id}" is still used by ${refs.join(', ')}. Remove it there first.`);
    }
    try {
      await v2Request(context, 'delete', `${MESSAGES}/${id}`, { params: { app_id } });
    } catch (error) {
      // Not a native message: a legacy block, deleted through the classic API
      if (isNotFound(error)) {
        return legacy();
      }
      throw error;
    }
    return jsonResult('Content message deleted', { id: args.content_id, deleted: true });
  } catch (error) {
    return v2ErrorResult('delete content', error);
  }
}

// ── asset handlers ───────────────────────────────────────

function compactAsset(a: any, serverUrl: string): any {
  const abs = (src: unknown) => (typeof src === 'string' && src.startsWith('/') ? `${serverUrl}${src}` : src);
  return {
    id: a._id,
    name: a.name,
    src: abs(a.src),
    mimeType: a.mimeType,
    width: a.width,
    height: a.height,
    sizeBytes: a.sizeBytes,
    tags: a.tags?.length ? a.tags : undefined,
    usedIn: a.usedIn?.length ? a.usedIn : undefined,
    appIds: a.appIds?.length > 1 ? a.appIds : undefined,
    created: iso(a.createdAt),
  };
}

const serverUrlOf = (context: ToolContext) => (context.httpClient.defaults?.baseURL || '').replace(/\/+$/, '');

export async function handleListContentAssetsV2(context: ToolContext, args: any): Promise<ToolResult> {
  try {
    const app_id = await context.resolveAppId(args);
    const data = await v2Request<any>(context, 'get', ASSETS, {
      params: {
        app_id,
        page: Math.max(1, Number(args.page ?? 1)),
        pageSize: Math.max(1, Number(args.page_size ?? 20)),
        ...(args.search ? { search: args.search } : {}),
        ...(Array.isArray(args.tags) && args.tags.length > 0 ? { tags: JSON.stringify(args.tags) } : {}),
      },
    });
    const serverUrl = serverUrlOf(context);
    return jsonResult(
      `Content assets for app ${app_id} (page ${data.page}, ${data.total} total, ${data.usedTotal ?? 0} used)`,
      (data.items || []).map((a: any) => compactAsset(a, serverUrl))
    );
  } catch (error) {
    return v2ErrorResult('list content assets', error);
  }
}

export async function handleUploadContentAssetV2(context: ToolContext, args: any): Promise<ToolResult> {
  try {
    const app_id = await context.resolveAppId(args);
    const bytes = Buffer.from(String(args.file_base64 || ''), 'base64');
    if (bytes.length === 0) {
      return errorResult('Invalid file_base64 - decoded file is empty');
    }
    if (bytes.length > MAX_ASSET_BYTES) {
      return errorResult(`File size ${bytes.length} bytes exceeds the 10MB limit.`);
    }
    const form = new FormData();
    form.append('asset', new Blob([new Uint8Array(bytes)], { type: args.mime_type }), args.file_name);
    form.append('appIds', JSON.stringify([app_id]));
    form.append('name', args.name || args.file_name);
    if (Array.isArray(args.tags) && args.tags.length > 0) {
      form.append('tags', JSON.stringify(args.tags));
    }
    const asset = await v2Request<any>(context, 'post', ASSETS, { params: { app_id }, body: form });
    return jsonResult('Content asset uploaded', compactAsset(asset, serverUrlOf(context)));
  } catch (error) {
    return v2ErrorResult('upload content asset', error);
  }
}

export async function handleUpdateContentAssetV2(context: ToolContext, args: any): Promise<ToolResult> {
  try {
    if (args.name === undefined && args.tags === undefined) {
      return errorResult('Provide at least one of name or tags to update.');
    }
    const app_id = await context.resolveAppId(args);
    const body: Record<string, unknown> = {};
    if (args.name !== undefined) {
      body.name = args.name;
    }
    if (args.tags !== undefined) {
      body.tags = args.tags;
    }
    const asset = await v2Request<any>(context, 'patch', `${ASSETS}/${encodeURIComponent(args.asset_id)}`, { params: { app_id }, body });
    return jsonResult('Content asset updated', compactAsset(asset, serverUrlOf(context)));
  } catch (error) {
    return v2ErrorResult('update content asset', error);
  }
}

export async function handleDeleteContentAssetV2(context: ToolContext, args: any): Promise<ToolResult> {
  try {
    const app_id = await context.resolveAppId(args);
    const result = await v2Request<any>(context, 'delete', `${ASSETS}/${encodeURIComponent(args.asset_id)}`, { params: { app_id } });
    return jsonResult(result?.deleted ? 'Content asset deleted' : 'Content asset removed from this app (still used by other apps)', { id: args.asset_id, deleted: result?.deleted === true });
  } catch (error) {
    if (error instanceof V2ApiError && error.status === 409) {
      return errorResult(`Asset "${args.asset_id}" is still used by content messages of this app. Remove it from those messages first.`);
    }
    return v2ErrorResult('delete content asset', error);
  }
}
