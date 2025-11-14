import { ToolContext, ToolResult } from './types.js';
import { withDefault } from '../lib/validation.js';
import { safeApiCall } from '../lib/error-handler.js';

// ============================================================================
// GET SEGMENTATION METADATA TOOL
// ============================================================================

export const getAvailableFieldsToolDefinition = {
  name: 'get_available_fields',
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

// Helper function to extract all field names from a query object
function extractFieldsFromQuery(obj: any, prefix = ''): Set<string> {
  const fields = new Set<string>();
  
  if (typeof obj !== 'object' || obj === null) {
    return fields;
  }
  
  if (Array.isArray(obj)) {
    obj.forEach(item => {
      const itemFields = extractFieldsFromQuery(item, prefix);
      itemFields.forEach(field => fields.add(field));
    });
    return fields;
  }
  
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    fields.add(fullKey);
    const nestedFields = extractFieldsFromQuery(value, fullKey);
    nestedFields.forEach(field => fields.add(field));
  }
  
  return fields;
}





export const runQueryToolDefinition = {
  name: 'run_query',
  description: 'PRIMARY TOOL for event segment breakdowns and filtering. Run drill queries to break down events by custom segments, user properties, or event attributes. Use this when you need to analyze events by categories like playback_type, device_type, country, etc. Supports MongoDB queries. Field names must use exact prefixes as shown in get_available_fields (up., custom., cmp., sg., or none for system fields).',
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
        description: 'MongoDB query object as JSON string. Use "up." prefix for user properties. Available user properties include: fs (first_seen, date), ls (last_seen, date), tsd (total_session_duration, number), sc (session_count, number), d (device, list), dt (device_type, list), mnf (manufacturer, list), ornt (orientation, list), cty (city, list), rgn (region, list), cc (country_code, list), p (platform, list), pv (platform_version, list), av (app_version, list), av_major (app_version_major, number), av_minor (app_version_minor, number), av_patch (app_version_patch, number), av_prerel (app_version_prerelease, list), av_build (app_version_build, list), c (carrier, list), r (resolution, list), dnst (screen_density, list), brw (browser, list), brwv (browser_version, list), la (language, list), lo (locale, list), src (source, list), src_ch (source_channel, list), name (name, string), username (username, string), email (email, string), organization (organization, string), phone (phone, string), gender (gender, list), byear (byear, number), age (age, number), engagement_score (engagement_score, number), hour (hour, list), dow (dow, list), hh (has_hinge, list). Example: \'{"up.p":"android","up.cc":"US"}\' or \'{}\'',
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
        type: 'array',
        description: 'Optional array of segments or user properties to break down by. Event segments will be automatically prefixed with "sg.". User properties will be automatically prefixed with "up.". Available user properties include: fs (first_seen, date), ls (last_seen, date), tsd (total_session_duration, number), sc (session_count, number), d (device, list), dt (device_type, list), mnf (manufacturer, list), ornt (orientation, list), cty (city, list), rgn (region, list), cc (country_code, list), p (platform, list), pv (platform_version, list), av (app_version, list), av_major (app_version_major, number), av_minor (app_version_minor, number), av_patch (app_version_patch, number), av_prerel (app_version_prerelease, list), av_build (app_version_build, list), c (carrier, list), r (resolution, list), dnst (screen_density, list), brw (browser, list), brwv (browser_version, list), la (language, list), lo (locale, list), src (source, list), src_ch (source_channel, list), name (name, string), username (username, string), email (email, string), organization (organization, string), phone (phone, string), gender (gender, list), byear (byear, number), age (age, number), engagement_score (engagement_score, number), hour (hour, list), dow (dow, list), hh (has_hinge, list). Example: ["Playback Type"], ["cc","p"], or ["up.p"]',
        items: {
          type: 'string'
        }
      },
    },
    required: [],
  },
};

// Known aggregation fields that don't need any prefix in drill queries
const AGGREGATION_FIELDS = new Set(['c', 's', 'dur', 'did', 'ts']);

export async function handleRunQuery(context: ToolContext, args: any): Promise<ToolResult> {
  const appId = await context.resolveAppId(args);
  
  const event = args.event;
  const queryObject = withDefault(args.query_object, '{}');
  const period = withDefault(args.period, '30days');
  const bucket = withDefault(args.bucket, 'daily');
  const projectionKey = args.projection_key;

  // Initialize warnings array
  const warnings: string[] = [];

  // FIRST: Fetch segmentation metadata to validate fields before query construction
  const availableFields = new Set<string>();
  try {
    const metaParams: any = {
      ...context.getAuthParams(),
      app_id: appId,
      method: 'segmentation_meta',
    };
    
    if (event) {
      metaParams.event = event;
    }
    
    const metaResponse = await safeApiCall(
      () => context.httpClient.get('/o', { params: metaParams }),
      'Failed to get segmentation metadata for validation'
    );
    
    if (metaResponse.data) {
      const data = metaResponse.data;
      
      // Add user properties (with up. prefix)
      if (data.up) {
        for (const key of Object.keys(data.up)) {
          availableFields.add(`up.${key}`);
        }
      }
      
      // Add custom user properties (with custom. prefix)
      if (data.custom) {
        for (const key of Object.keys(data.custom)) {
          availableFields.add(`custom.${key}`);
        }
      }
      
      // Add event segments (if event was specified)
      if (event && data.sg) {
        for (const key of Object.keys(data.sg)) {
          availableFields.add(key);
        }
      }
      
      // Add known system fields that are always available
      const systemFields = ['c', 's', 'dur', 'did', 'ts'];
      systemFields.forEach(field => availableFields.add(field));
    }
  } catch (error) {
    warnings.push(`Could not fetch metadata for field validation: ${error}`);
  }

  // SECOND: Validate raw input parameters against metadata
  try {
    const parsedQuery = JSON.parse(queryObject);
    const rawQueryFields = extractFieldsFromQuery(parsedQuery);
    
    for (const field of rawQueryFields) {
      if (!availableFields.has(field) && !AGGREGATION_FIELDS.has(field)) {
        warnings.push(`Query field "${field}" may not be available. Available fields: ${Array.from(availableFields).join(', ')}`);
      }
    }
  } catch {
    // Invalid JSON will be caught later
  }

  // Validate projection key (no prefixing expected)
  if (projectionKey) {
    if (Array.isArray(projectionKey)) {
      for (const field of projectionKey) {
        if (typeof field === 'string') {
          if (!availableFields.has(field) && !AGGREGATION_FIELDS.has(field)) {
            warnings.push(`Projection field "${field}" may not be available. Available fields: ${Array.from(availableFields).join(', ')}`);
          }
        }
      }
    } else {
      throw new Error(`projection_key must be an array, got: ${typeof projectionKey}`);
    }
  }

  // THIRD: Use query object as-is (no auto-prefixing)
  const processedQueryObject = queryObject;

  // Validate projection key if provided (no auto-prefixing)
  const processedProjectionKey = projectionKey;

  const params: any = {
    ...context.getAuthParams(),
    app_id: appId,
    method: 'segmentation',
    queryObject: processedQueryObject,
    period,
    bucket,
  };

  if (event) {
    params.event = event;
  }

  if (processedProjectionKey) {
    params.projectionKey = processedProjectionKey;
  }

  const response = await safeApiCall(
    () => context.httpClient.get('/o', { params }),
    'Failed to run segmentation query'
  );

  let resultText = 'Segmentation query results:\n\n';
  
  // Add warnings if any
  if (warnings.length > 0) {
    resultText += '**Warnings:**\n';
    warnings.forEach(warning => {
      resultText += `  ⚠️ ${warning}\n`;
    });
    resultText += '\n';
  }
  
  resultText += `**Query Details:**\n`;
  resultText += `  - Event: ${event || 'All sessions/users'}\n`;
  resultText += `  - Query: ${processedQueryObject}\n`;
  resultText += `  - Period: ${period}\n`;
  resultText += `  - Bucket: ${bucket}\n`;
  if (processedProjectionKey) {
    resultText += `  - Breakdown by: ${processedProjectionKey}\n`;
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
// EXPORTS
// ============================================================================

export const drillToolDefinitions = [
  getAvailableFieldsToolDefinition,
  runQueryToolDefinition,
  listDrillBookmarksToolDefinition,
  createDrillBookmarkToolDefinition,
  deleteDrillBookmarkToolDefinition,
];

export const drillToolHandlers = {
  'get_available_fields': 'get_available_fields',
  'run_query': 'run_query',
  'list_drill_bookmarks': 'list_drill_bookmarks',
  'create_drill_bookmark': 'create_drill_bookmark',
  'delete_drill_bookmark': 'delete_drill_bookmark',
} as const;

export class DrillTools {
  constructor(private context: ToolContext) {}

  async get_available_fields(args: any): Promise<ToolResult> {
    return handleGetAvailableFields(this.context, args);
  }

  async run_query(args: any): Promise<ToolResult> {
    return handleRunQuery(this.context, args);
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
