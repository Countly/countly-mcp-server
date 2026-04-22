import { ToolContext, ToolResult } from './types.js';
import { withDefault } from '../lib/validation.js';
import { safeApiCall } from '../lib/error-handler.js';

// ============================================================================
// GET SEGMENTATION METADATA TOOL
// ============================================================================

export const getAvailableFieldsToolDefinition = {
  name: 'queriable_fields_list',
  description: 'List queryable fields for an app: user properties (up.*), custom properties (custom.*), campaign properties (cmp.*), and (when event is supplied) that event\'s segments; plus the always-available system fields (c, s, dur, did). Requires the drill plugin. Use before building a query_data "drill" query_object. For a full event catalog use metadata_get.',
  inputSchema: {
    type: 'object',
    properties: {
      app_id: {
        type: 'string',
        description: 'Application ID. Either app_id or app_name must be provided; call apps_list first if you do not know it.'
      },
      app_name: {
        type: 'string',
        description: 'Application name (alternative to app_id). Must match an existing app exactly; call apps_list to find valid names.'
      },
      event: {
        type: 'string',
        description: 'Optional event key (e.g. "[CLY]_session", "[CLY]_view", or a custom event). When provided, returns that event\'s segment fields in addition to user/custom/campaign properties.'
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
  name: 'drill_bookmarks_list',
  description: 'List saved drill bookmarks (persisted drill query definitions) for an event. Requires the drill plugin. To create one use drill_bookmarks_create; to remove one use drill_bookmarks_delete.',
  inputSchema: {
    type: 'object',
    properties: {
      app_id: {
        type: 'string',
        description: 'Application ID. Either app_id or app_name must be provided; call apps_list first if you do not know it.'
      },
      app_name: {
        type: 'string',
        description: 'Application name (alternative to app_id). Must match an existing app exactly; call apps_list to find valid names.'
      },
      event_key: {
        type: 'string',
        description: 'Event key the bookmarks belong to (e.g. "[CLY]_session", "[CLY]_view", or a custom event). Defaults to "[CLY]_session" when omitted.',
      },
      namespace: {
        type: 'string',
        description: 'Bookmark namespace. Defaults to "drill".',
      },
      app_level: {
        type: 'string',
        description: 'Include app-level bookmarks filter flag. Defaults to "1".',
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
  name: 'drill_bookmarks_create',
  description: 'Save a drill query as a reusable bookmark (event, filter, breakdown, visualization) via /i/drill/add_bookmark. Requires the drill plugin. To list existing bookmarks use drill_bookmarks_list.',
  inputSchema: {
    type: 'object',
    properties: {
      app_id: {
        type: 'string',
        description: 'Application ID. Either app_id or app_name must be provided; call apps_list first if you do not know it.'
      },
      app_name: {
        type: 'string',
        description: 'Application name (alternative to app_id). Must match an existing app exactly; call apps_list to find valid names.'
      },
      event_key: {
        type: 'string',
        description: 'Event key this bookmark targets (e.g. "[CLY]_session", "[CLY]_view", or a custom event).',
      },
      name: {
        type: 'string',
        description: 'Display name for the bookmark.',
      },
      query_obj: {
        type: 'string',
        description: 'MongoDB-style query as a JSON string (e.g. \'{"up.country":"US"}\'). Defaults to \'{}\'.',
      },
      query_text: {
        type: 'string',
        description: 'Optional human-readable label for the query, shown in the UI.',
      },
      by_val: {
        type: 'string',
        description: 'Breakdown/projection keys as a JSON array string (e.g. \'["av"]\'). Defaults to \'[]\'.',
      },
      by_val_text: {
        type: 'string',
        description: 'Optional human-readable label for the breakdown.',
      },
      desc: {
        type: 'string',
        description: 'Optional free-form description.',
      },
      global: {
        type: 'boolean',
        description: 'When true, the bookmark is visible to all dashboard users. Defaults to false.',
      },
      namespace: {
        type: 'string',
        description: 'Bookmark namespace. Defaults to "drill".',
      },
      visualization: {
        type: 'string',
        description: 'Default visualization (e.g. "timeSeries", "table"). Defaults to "timeSeries".',
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
  name: 'drill_bookmarks_delete',
  description: 'Delete a saved drill bookmark via /i/drill/delete_bookmark. Requires the drill plugin. WARNING: irreversible.',
  inputSchema: {
    type: 'object',
    properties: {
      app_id: {
        type: 'string',
        description: 'Application ID. Either app_id or app_name must be provided; call apps_list first if you do not know it.'
      },
      app_name: {
        type: 'string',
        description: 'Application name (alternative to app_id). Must match an existing app exactly; call apps_list to find valid names.'
      },
      bookmark_id: {
        type: 'string',
        description: 'Bookmark identifier (_id) to delete. Obtain it from drill_bookmarks_list.',
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
  name: 'metadata_get',
  description: 'Get a consolidated metadata report for an app: custom events, built-in events ([CLY]_session, [CLY]_view, [CLY]_crash, [CLY]_push_action) with their segments, plus system fields. When the drill plugin is available, also includes user, custom, and campaign properties and custom-event segments. Requires the drill plugin (metadata is richer, though the tool degrades gracefully). For just field names use queriable_fields_list; for the event catalog alone use events_list.',
  inputSchema: {
    type: 'object',
    properties: {
      app_id: {
        type: 'string',
        description: 'Application ID. Either app_id or app_name must be provided; call apps_list first if you do not know it.'
      },
      app_name: {
        type: 'string',
        description: 'Application name (alternative to app_id). Must match an existing app exactly; call apps_list to find valid names.'
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
  'queriable_fields_list': 'queriable_fields_list',
  'drill_bookmarks_list': 'drill_bookmarks_list',
  'drill_bookmarks_create': 'drill_bookmarks_create',
  'drill_bookmarks_delete': 'drill_bookmarks_delete',
  'metadata_get': 'metadata_get',
} as const;

export class DrillTools {
  constructor(private context: ToolContext) {}

  async queriable_fields_list(args: any): Promise<ToolResult> {
    return handleGetAvailableFields(this.context, args);
  }

  async drill_bookmarks_list(args: any): Promise<ToolResult> {
    return handleListDrillBookmarks(this.context, args);
  }

  async drill_bookmarks_create(args: any): Promise<ToolResult> {
    return handleCreateDrillBookmark(this.context, args);
  }

  async drill_bookmarks_delete(args: any): Promise<ToolResult> {
    return handleDeleteDrillBookmark(this.context, args);
  }

  async metadata_get(args: any): Promise<ToolResult> {
    return handleGetMetadata(this.context, args);
  }
}

// Metadata for dynamic routing
export const drillToolMetadata = {
  instanceKey: 'drill',
  toolClass: DrillTools,
  handlers: drillToolHandlers,
} as const;
