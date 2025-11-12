import { ToolContext, ToolResult } from './types.js';
import { withDefault } from '../lib/validation.js';
import { safeApiCall } from '../lib/error-handler.js';

// ============================================================================
// GET SEGMENTATION METADATA TOOL
// ============================================================================

export const getSegmentationMetaToolDefinition = {
  name: 'get_segmentation_meta',
  description: 'Get all user properties and event segments with their types for drill queries. User properties must be prepended with "up." in queries. Types: d=date, n=number, s=string, l=list',
  inputSchema: {
    type: 'object',
    properties: {
      app_id: { 
        type: 'string', 
        description: 'Application ID (optional if app_name is provided)' 
      },
      app_name: { 
        type: 'string', 
        description: 'Application name (alternative to app_id)' 
      },
      event: {
        type: 'string',
        description: 'Optional event key to get event segments metadata in addition to user properties'
      },
    },
    required: [],
  },
};

export async function handleGetSegmentationMeta(context: ToolContext, args: any): Promise<ToolResult> {
  const appId = await context.resolveAppId(args);
  const event = args.event;

  const params: any = {
    ...context.getAuthParams(),
    app_id: appId,
    method: 'segmentation_meta',
  };

  if (event) {
    params.event = event;
  }

  const response = await safeApiCall(
    () => context.httpClient.get('/o', { params }),
    'Failed to get segmentation metadata'
  );

  let resultText = 'Segmentation metadata:\n\n';
  
  if (response.data) {
    const data = response.data;
    
    // User properties
    if (data.up) {
      resultText += '**User Properties** (prepend "up." in queries):\n';
      for (const [key, type] of Object.entries(data.up)) {
        const typeDesc = getTypeDescription(type as string);
        resultText += `  - up.${key}: ${typeDesc}\n`;
      }
      resultText += '\n';
    }
    
    // Event segments (if event was specified)
    if (event && data.sg) {
      resultText += `**Event Segments for "${event}"**:\n`;
      for (const [key, type] of Object.entries(data.sg)) {
        const typeDesc = getTypeDescription(type as string);
        resultText += `  - ${key}: ${typeDesc}\n`;
      }
      resultText += '\n';
    }
    
    resultText += '**Type Legend:**\n';
    resultText += '  - d = date\n';
    resultText += '  - n = number\n';
    resultText += '  - s = string\n';
    resultText += '  - l = list (can be treated as string)\n';
  }

  return {
    content: [
      {
        type: 'text',
        text: resultText,
      },
    ],
  };
}

function getTypeDescription(type: string): string {
  switch (type) {
    case 'd':
      return 'date';
    case 'n':
      return 'number';
    case 's':
      return 'string';
    case 'l':
      return 'list';
    default:
      return type;
  }
}

// ============================================================================
// RUN SEGMENTATION QUERY TOOL
// ============================================================================

export const runSegmentationQueryToolDefinition = {
  name: 'run_segmentation_query',
  description: 'Run a drill segmentation query with MongoDB query object. Can optionally break down by projection key (segment or user property)',
  inputSchema: {
    type: 'object',
    properties: {
      app_id: { 
        type: 'string', 
        description: 'Application ID (optional if app_name is provided)' 
      },
      app_name: { 
        type: 'string', 
        description: 'Application name (alternative to app_id)' 
      },
      event: {
        type: 'string',
        description: 'Event key to query (optional - if not provided, queries all sessions/users)'
      },
      query_object: {
        type: 'string',
        description: 'MongoDB query object as JSON string (e.g., \'{"up.country":"US"}\' or \'{}\'). Use "up." prefix for user properties',
      },
      period: {
        type: 'string',
        description: 'Time period for data. Possible values: "month", "60days", "30days", "7days", "yesterday", "hour", or custom range as [startMilliseconds,endMilliseconds]',
      },
      bucket: {
        type: 'string',
        description: 'Time bucket granularity',
        enum: ['hourly', 'daily', 'weekly', 'monthly'],
      },
      projection_key: {
        type: 'string',
        description: 'Optional segment or user property to break down by (e.g., "av" for app version, "up.country" for user country). Provide as JSON array string like \'["av"]\' or \'["up.country"]\'',
      },
    },
    required: [],
  },
};

export async function handleRunSegmentationQuery(context: ToolContext, args: any): Promise<ToolResult> {
  const appId = await context.resolveAppId(args);
  
  const event = args.event;
  const queryObject = withDefault(args.query_object, '{}');
  const period = withDefault(args.period, '30days');
  const bucket = withDefault(args.bucket, 'daily');
  const projectionKey = args.projection_key;

  // Validate query object is valid JSON
  try {
    JSON.parse(queryObject);
  } catch {
    throw new Error(`Invalid query_object JSON: ${queryObject}`);
  }

  // Validate projection key if provided
  if (projectionKey) {
    try {
      const parsed = JSON.parse(projectionKey);
      if (!Array.isArray(parsed)) {
        throw new Error('projection_key must be a JSON array');
      }
    } catch {
      throw new Error(`Invalid projection_key JSON: ${projectionKey}`);
    }
  }

  const params: any = {
    ...context.getAuthParams(),
    app_id: appId,
    method: 'segmentation',
    queryObject,
    period,
    bucket,
  };

  if (event) {
    params.event = event;
  }

  if (projectionKey) {
    params.projectionKey = projectionKey;
  }

  const response = await safeApiCall(
    () => context.httpClient.get('/o', { params }),
    'Failed to run segmentation query'
  );

  let resultText = 'Segmentation query results:\n\n';
  resultText += `**Query Details:**\n`;
  resultText += `  - Event: ${event || 'All sessions/users'}\n`;
  resultText += `  - Query: ${queryObject}\n`;
  resultText += `  - Period: ${period}\n`;
  resultText += `  - Bucket: ${bucket}\n`;
  if (projectionKey) {
    resultText += `  - Breakdown by: ${projectionKey}\n`;
  }
  resultText += '\n';
  resultText += `**Results:**\n`;
  resultText += JSON.stringify(response.data, null, 2);

  return {
    content: [
      {
        type: 'text',
        text: resultText,
      },
    ],
  };
}

// ============================================================================
// LIST DRILL BOOKMARKS TOOL
// ============================================================================

export const listDrillBookmarksToolDefinition = {
  name: 'list_drill_bookmarks',
  description: 'List all existing drill bookmarks for a specific event',
  inputSchema: {
    type: 'object',
    properties: {
      app_id: { 
        type: 'string', 
        description: 'Application ID (optional if app_name is provided)' 
      },
      app_name: { 
        type: 'string', 
        description: 'Application name (alternative to app_id)' 
      },
      event_key: {
        type: 'string',
        description: 'Event key to list bookmarks for (e.g., "[CLY]_session" for sessions)',
      },
      namespace: {
        type: 'string',
        description: 'Namespace for bookmarks (default: "drill")',
      },
      app_level: {
        type: 'string',
        description: 'App level filter (default: "1")',
      },
    },
    required: [],
  },
};

export async function handleListDrillBookmarks(context: ToolContext, args: any): Promise<ToolResult> {
  const appId = await context.resolveAppId(args);
  const eventKey = args.event_key || '[CLY]_session';
  const namespace = withDefault(args.namespace, 'drill');
  const appLevel = withDefault(args.app_level, '1');

  const params = {
    ...context.getAuthParams(),
    app_id: appId,
    method: 'drill_bookmarks',
    event_key: eventKey,
    namespace,
    app_level: appLevel,
  };

  const response = await safeApiCall(
    () => context.httpClient.get('/o', { params }),
    'Failed to list drill bookmarks'
  );

  let resultText = 'Drill bookmarks:\n\n';
  resultText += `**Event Key:** ${eventKey}\n`;
  resultText += `**Namespace:** ${namespace}\n\n`;
  
  if (response.data && Array.isArray(response.data)) {
    if (response.data.length === 0) {
      resultText += 'No bookmarks found.\n';
    } else {
      resultText += `**Bookmarks (${response.data.length}):**\n`;
      resultText += JSON.stringify(response.data, null, 2);
    }
  } else {
    resultText += JSON.stringify(response.data, null, 2);
  }

  return {
    content: [
      {
        type: 'text',
        text: resultText,
      },
    ],
  };
}

// ============================================================================
// CREATE DRILL BOOKMARK TOOL
// ============================================================================

export const createDrillBookmarkToolDefinition = {
  name: 'create_drill_bookmark',
  description: 'Create a new drill bookmark to save a query for later reuse',
  inputSchema: {
    type: 'object',
    properties: {
      app_id: { 
        type: 'string', 
        description: 'Application ID (optional if app_name is provided)' 
      },
      app_name: { 
        type: 'string', 
        description: 'Application name (alternative to app_id)' 
      },
      event_key: {
        type: 'string',
        description: 'Event key for the bookmark (e.g., "[CLY]_session" for sessions)',
      },
      name: {
        type: 'string',
        description: 'Name of the bookmark',
      },
      query_obj: {
        type: 'string',
        description: 'MongoDB query object as JSON string (e.g., \'{"up.country":"US"}\' or \'{}\')',
      },
      query_text: {
        type: 'string',
        description: 'Human-readable query description (optional)',
      },
      by_val: {
        type: 'string',
        description: 'Projection/breakdown values as JSON array string (e.g., \'["av"]\' or \'[]\'), default: "[]"',
      },
      by_val_text: {
        type: 'string',
        description: 'Human-readable breakdown description (optional)',
      },
      desc: {
        type: 'string',
        description: 'Description of the bookmark (optional)',
      },
      global: {
        type: 'boolean',
        description: 'Whether bookmark is global (visible to all users), default: false',
      },
      namespace: {
        type: 'string',
        description: 'Namespace for bookmark (default: "drill")',
      },
      visualization: {
        type: 'string',
        description: 'Visualization type (e.g., "timeSeries", "table"), default: "timeSeries"',
      },
    },
    required: ['event_key', 'name'],
  },
};

export async function handleCreateDrillBookmark(context: ToolContext, args: any): Promise<ToolResult> {
  const appId = await context.resolveAppId(args);
  const eventKey = args.event_key;
  const name = args.name;
  const queryObj = withDefault(args.query_obj, '{}');
  const queryText = withDefault(args.query_text, '');
  const byVal = withDefault(args.by_val, '[]');
  const byValText = withDefault(args.by_val_text, '');
  const desc = withDefault(args.desc, '');
  const global = args.global === true ? 'true' : 'false';
  const namespace = withDefault(args.namespace, 'drill');
  const visualization = withDefault(args.visualization, 'timeSeries');

  // Validate query_obj is valid JSON
  try {
    JSON.parse(queryObj);
  } catch {
    throw new Error(`Invalid query_obj JSON: ${queryObj}`);
  }

  // Validate by_val is valid JSON array
  try {
    const parsed = JSON.parse(byVal);
    if (!Array.isArray(parsed)) {
      throw new Error('by_val must be a JSON array');
    }
  } catch {
    throw new Error(`Invalid by_val JSON: ${byVal}`);
  }

  const params = {
    ...context.getAuthParams(),
    app_id: appId,
    event_key: eventKey,
    name,
    query_obj: queryObj,
    query_text: queryText,
    by_val: byVal,
    by_val_text: byValText,
    desc,
    global,
    namespace,
    visualization,
  };

  const response = await safeApiCall(
    () => context.httpClient.get('/i/drill/add_bookmark', { params }),
    'Failed to create drill bookmark'
  );

  return {
    content: [
      {
        type: 'text',
        text: `Drill bookmark created:\n${JSON.stringify(response.data, null, 2)}`,
      },
    ],
  };
}

// ============================================================================
// DELETE DRILL BOOKMARK TOOL
// ============================================================================

export const deleteDrillBookmarkToolDefinition = {
  name: 'delete_drill_bookmark',
  description: 'Delete a drill bookmark',
  inputSchema: {
    type: 'object',
    properties: {
      app_id: { 
        type: 'string', 
        description: 'Application ID (optional if app_name is provided)' 
      },
      app_name: { 
        type: 'string', 
        description: 'Application name (alternative to app_id)' 
      },
      bookmark_id: {
        type: 'string',
        description: 'ID of the bookmark to delete',
      },
    },
    required: ['bookmark_id'],
  },
};

export async function handleDeleteDrillBookmark(context: ToolContext, args: any): Promise<ToolResult> {
  const appId = await context.resolveAppId(args);
  const bookmarkId = args.bookmark_id;

  const params = {
    ...context.getAuthParams(),
    app_id: appId,
    bookmark_id: bookmarkId,
  };

  const response = await safeApiCall(
    () => context.httpClient.get('/i/drill/delete_bookmark', { params }),
    'Failed to delete drill bookmark'
  );

  return {
    content: [
      {
        type: 'text',
        text: `Drill bookmark deleted:\n${JSON.stringify(response.data, null, 2)}`,
      },
    ],
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export const drillToolDefinitions = [
  getSegmentationMetaToolDefinition,
  runSegmentationQueryToolDefinition,
  listDrillBookmarksToolDefinition,
  createDrillBookmarkToolDefinition,
  deleteDrillBookmarkToolDefinition,
];

export const drillToolHandlers = {
  'get_segmentation_meta': 'handleGetSegmentationMeta',
  'run_segmentation_query': 'handleRunSegmentationQuery',
  'list_drill_bookmarks': 'handleListDrillBookmarks',
  'create_drill_bookmark': 'handleCreateDrillBookmark',
  'delete_drill_bookmark': 'handleDeleteDrillBookmark',
} as const;

export class DrillTools {
  constructor(private context: ToolContext) {}

  async get_segmentation_meta(args: any): Promise<ToolResult> {
    return handleGetSegmentationMeta(this.context, args);
  }

  async run_segmentation_query(args: any): Promise<ToolResult> {
    return handleRunSegmentationQuery(this.context, args);
  }

  async list_drill_bookmarks(args: any): Promise<ToolResult> {
    return handleListDrillBookmarks(this.context, args);
  }

  async create_drill_bookmark(args: any): Promise<ToolResult> {
    return handleCreateDrillBookmark(this.context, args);
  }

  async delete_drill_bookmark(args: any): Promise<ToolResult> {
    return handleDeleteDrillBookmark(this.context, args);
  }
}

// Metadata for dynamic routing
export const drillToolMetadata = {
  instanceKey: 'drill',
  toolClass: DrillTools,
  handlers: drillToolHandlers,
} as const;
