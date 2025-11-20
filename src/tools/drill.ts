import { ToolContext, ToolResult } from './types.js';
import { withDefault } from '../lib/validation.js';
import { safeApiCall } from '../lib/error-handler.js';

// ============================================================================
// GET SEGMENTATION METADATA TOOL
// ============================================================================

export const getAvailableFieldsToolDefinition = {
  name: 'get_queriable_fields_for_event',
  description: 'List all available fields for querying: user properties (use exact field names with prefixes), event segments (when event specified), and system fields (always available). Use these exact field names in run_query.',
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
        description: 'Event key to get event-specific segments in addition to user properties. Always include this when analyzing a specific event.'
      },
    },
    required: [],
  },
};

export async function handleGetAvailableFields(context: ToolContext, args: any): Promise<ToolResult> {
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
        const typeValue = typeof type === 'object' && type && 'type' in type ? (type as any).type : type;
        const typeDesc = getTypeDescription(typeValue);
        resultText += `  - up.${key}: ${typeDesc}\n`;
      }
      resultText += '\n';
    }
    
    // Custom user properties
    if (data.custom) {
      resultText += '**Custom User Properties** (prepend "custom." in queries):\n';
      for (const [key, type] of Object.entries(data.custom)) {
        const typeValue = typeof type === 'object' && type && 'type' in type ? (type as any).type : type;
        const typeDesc = getTypeDescription(typeValue);
        resultText += `  - custom.${key}: ${typeDesc}\n`;
      }
      resultText += '\n';
    }
    
    // Campaign properties
    if (data.cmp) {
      resultText += '**Campaign Properties** (prepend "cmp." in queries):\n';
      for (const [key, type] of Object.entries(data.cmp)) {
        const typeValue = typeof type === 'object' && type && 'type' in type ? (type as any).type : type;
        const typeDesc = getTypeDescription(typeValue);
        resultText += `  - cmp.${key}: ${typeDesc}\n`;
      }
      resultText += '\n';
    }
    
    // Event segments (if event was specified)
    if (event && data.sg) {
      resultText += `**Event Segments for "${event}"**:\n`;
      for (const [key, type] of Object.entries(data.sg)) {
        const typeValue = typeof type === 'object' && type && 'type' in type ? (type as any).type : type;
        const typeDesc = getTypeDescription(typeValue);
        resultText += `  - ${key}: ${typeDesc}\n`;
      }
      resultText += '\n';
    }
    
    // System fields (always available)
    resultText += '**System Fields** (always available in queries):\n';
    resultText += '  - c: count (number)\n';
    resultText += '  - s: sum (number)\n';
    resultText += '  - dur: duration (number)\n';
    resultText += '  - did: device id (string)\n';
    resultText += '\n';
    
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

  const _response = await safeApiCall(
    () => context.httpClient.get('/i/drill/add_bookmark', { params }),
    'Failed to create drill bookmark'
  );

  return {
    content: [
      {
        type: 'text',
        text: 'Drill bookmark created successfully.',
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
// GET METADATA TOOL
// ============================================================================

export const getMetadataToolDefinition = {
  name: 'get_metadata',
  description: 'Get comprehensive metadata for all events, segments, and properties in an app. Includes user properties, custom properties, campaign properties, and event-specific segments if drill plugin is available.',
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
    },
    required: [],
  },
};

export async function handleGetMetadata(context: ToolContext, args: any): Promise<ToolResult> {
  const appId = await context.resolveAppId(args);

  let resultText = 'App Metadata:\n\n';

  // Check if drill is available by trying segmentation_meta
  let drillAvailable = true;
  let globalMeta: any = null;
  try {
    const globalParams = {
      ...context.getAuthParams(),
      app_id: appId,
      method: 'segmentation_meta',
    };
    const globalResponse = await safeApiCall(
      () => context.httpClient.get('/o', { params: globalParams }),
      'Failed to get global segmentation metadata'
    );
    globalMeta = globalResponse.data;
  } catch {
    drillAvailable = false;
    resultText += '**Note:** Drill plugin not available. Only basic event definitions will be shown. Advanced properties and segments require the Drill plugin.\n\n';
  }

  // Fetch custom events
  let customEvents: any[] = [];
  try {
    const eventsParams = {
      ...context.getAuthParams(),
      app_id: appId,
      method: 'get_events',
    };
    const eventsResponse = await safeApiCall(
      () => context.httpClient.get('/o', { params: eventsParams }),
      'Failed to get events'
    );
    if (eventsResponse.data && Array.isArray(eventsResponse.data)) {
      customEvents = eventsResponse.data;
    }
  } catch {
    resultText += '**Warning:** Failed to fetch custom events.\n\n';
  }

  // Define internal events with their segments
  const internalEvents = [
    {
      key: '[CLY]_session',
      name: 'Session',
      description: 'User session events',
      segments: {
        platform: 's',
        country: 's',
        city: 's',
        carrier: 's',
        resolution: 's',
        density: 's',
        orientation: 's',
        app_version: 's',
        did: 's',
        uid: 's',
        sdur: 'n',
        start: 'd',
        end: 'd',
        exit: 's',
        bounce: 'n',
        duration: 'n',
        events: 'n',
        sum: 'n',
        dur: 'n',
      },
    },
    {
      key: '[CLY]_view',
      name: 'View',
      description: 'Screen/page view events',
      segments: {
        name: 's',
        visit: 'n',
        start: 'd',
        exit: 's',
        bounce: 'n',
        duration: 'n',
        segment: 's',
        domain: 's',
        url: 's',
        view: 's',
      },
    },
    {
      key: '[CLY]_crash',
      name: 'Crash',
      description: 'Application crash events',
      segments: {
        name: 's',
        error: 's',
        nonfatal: 'b',
        logs: 's',
        custom: 's',
        _os: 's',
        _os_version: 's',
        _device: 's',
        _resolution: 's',
        _app_version: 's',
        _manufacturer: 's',
      },
    },
    {
      key: '[CLY]_push_action',
      name: 'Push Action',
      description: 'Push notification action events',
      segments: {
        i: 's',
        a: 's',
        p: 's',
        b: 's',
        c: 's',
      },
    },
  ];

  // Combine custom and internal events
  const allEvents = [...customEvents, ...internalEvents];

  // If drill available, add global properties
  if (drillAvailable && globalMeta) {
    // User properties
    if (globalMeta.up) {
      resultText += '**User Properties** (prepend "up." in queries):\n';
      for (const [key, type] of Object.entries(globalMeta.up)) {
        const typeDesc = getTypeDescription(typeof type === 'object' && type && 'type' in type ? (type as any).type : type);
        resultText += `  - up.${key}: ${typeDesc}\n`;
      }
      resultText += '\n';
    }
    
    // Custom user properties
    if (globalMeta.custom) {
      resultText += '**Custom User Properties** (prepend "custom." in queries):\n';
      for (const [key, type] of Object.entries(globalMeta.custom)) {
        const typeDesc = getTypeDescription(typeof type === 'object' && type && 'type' in type ? (type as any).type : type);
        resultText += `  - custom.${key}: ${typeDesc}\n`;
      }
      resultText += '\n';
    }
    
    // Campaign properties
    if (globalMeta.cmp) {
      resultText += '**Campaign Properties** (prepend "cmp." in queries):\n';
      for (const [key, type] of Object.entries(globalMeta.cmp)) {
        const typeDesc = getTypeDescription(typeof type === 'object' && type && 'type' in type ? (type as any).type : type);
        resultText += `  - cmp.${key}: ${typeDesc}\n`;
      }
      resultText += '\n';
    }
  }

  // System fields (always available)
  resultText += '**System Fields** (always available in queries):\n';
  resultText += '  - c: count (number)\n';
  resultText += '  - s: sum (number)\n';
  resultText += '  - dur: duration (number)\n';
  resultText += '  - did: device id (string)\n';
  resultText += '\n';

  // Events
  resultText += '**Events and Segments:**\n\n';
  for (const event of allEvents) {
    resultText += `**${event.key}** (${event.name})\n`;
    if (event.description) {
      resultText += `Description: ${event.description}\n`;
    }
    
    let segments = event.segments || {};
    
    // If drill available and custom event, try to get additional segments
    if (drillAvailable && !event.key.startsWith('[CLY]_')) {
      try {
        const eventParams = {
          ...context.getAuthParams(),
          app_id: appId,
          method: 'segmentation_meta',
          event: event.key,
        };
        const eventResponse = await safeApiCall(
          () => context.httpClient.get('/o', { params: eventParams }),
          `Failed to get segments for ${event.key}`
        );
        if (eventResponse.data && eventResponse.data.sg) {
          segments = { ...segments, ...eventResponse.data.sg };
        }
      } catch {
        // Ignore, use basic segments
      }
    }
    
    if (Object.keys(segments).length > 0) {
      resultText += 'Segments:\n';
      for (const [segKey, segType] of Object.entries(segments)) {
        const typeDesc = getTypeDescription(typeof segType === 'object' && segType && 'type' in segType ? (segType as any).type : segType);
        resultText += `  - ${segKey}: ${typeDesc}\n`;
      }
    } else {
      resultText += 'No segments defined.\n';
    }
    resultText += '\n';
  }

  resultText += '**Type Legend:**\n';
  resultText += '  - d = date\n';
  resultText += '  - n = number\n';
  resultText += '  - s = string\n';
  resultText += '  - l = list (can be treated as string)\n';
  resultText += '  - b = boolean\n';

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
// EXPORTS
// ============================================================================

export const drillToolDefinitions = [
  getAvailableFieldsToolDefinition,
  listDrillBookmarksToolDefinition,
  createDrillBookmarkToolDefinition,
  deleteDrillBookmarkToolDefinition,
  getMetadataToolDefinition,
];

export const drillToolHandlers = {
  'get_queriable_fields_for_event': 'get_queriable_fields_for_event',
  'list_drill_bookmarks': 'list_drill_bookmarks',
  'create_drill_bookmark': 'create_drill_bookmark',
  'delete_drill_bookmark': 'delete_drill_bookmark',
  'get_metadata': 'get_metadata',
} as const;

export class DrillTools {
  constructor(private context: ToolContext) {}

  async get_queriable_fields_for_event(args: any): Promise<ToolResult> {
    return handleGetAvailableFields(this.context, args);
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

  async get_metadata(args: any): Promise<ToolResult> {
    return handleGetMetadata(this.context, args);
  }
}

// Metadata for dynamic routing
export const drillToolMetadata = {
  instanceKey: 'drill',
  toolClass: DrillTools,
  handlers: drillToolHandlers,
} as const;
