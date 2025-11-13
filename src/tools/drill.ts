import { ToolContext, ToolResult } from './types.js';
import { withDefault } from '../lib/validation.js';
import { safeApiCall } from '../lib/error-handler.js';

// ============================================================================
// GET SEGMENTATION METADATA TOOL
// ============================================================================

export const getAvailableFieldsToolDefinition = {
  name: 'get_available_fields',
  description: 'List available fields for events and user properties. User properties must be prepended with "up." in queries. When working with a specific event, always include the event parameter to get event-specific segments. Types: d=date, n=number, s=string, l=list',
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

function shouldAutoPrefixProperty(key: string): boolean {
  // Don't prefix aggregation fields
  if (AGGREGATION_FIELDS.has(key)) {
    return false;
  }
  // Don't prefix if already has a prefix (contains dot)
  if (key.includes('.')) {
    return false;
  }
  // Auto-prefix everything else with up.
  return true;
}

function correctPropertyName(key: string): string {
  // Correct common property name mistakes
  const corrections: Record<string, string> = {
    'manufacture': 'mnf',
    'manufacturer': 'mnf',
    'device': 'd',
    'devicetype': 'dt',
    'platform': 'p',
    'country': 'cc',
    'city': 'cty',
    'region': 'rgn',
    'appversion': 'av',
    'app_version': 'av',
    'browser': 'brw',
    'browserversion': 'brwv',
    'language': 'la',
    'locale': 'lo',
    'source': 'src',
    'carrier': 'c',
    'resolution': 'r',
    'orientation': 'ornt',
    'screen_density': 'dnst',
    'first_seen': 'fs',
    'last_seen': 'ls',
    'session_count': 'sc',
    'total_session_duration': 'tsd',
    'engagement_score': 'engagement_score',
    'has_hinge': 'hh',
  };
  
  return corrections[key.toLowerCase()] || key;
}

function autoPrefixQueryObject(obj: any): any {
  if (typeof obj !== 'object' || obj === null) {
    return obj;
  }
  
  if (Array.isArray(obj)) {
    return obj.map(item => autoPrefixQueryObject(item));
  }
  
  const result: any = {};
  for (const [key, value] of Object.entries(obj)) {
    const correctedKey = correctPropertyName(key);
    const processedKey = shouldAutoPrefixProperty(correctedKey) ? `up.${correctedKey}` : correctedKey;
    result[processedKey] = autoPrefixQueryObject(value);
  }
  return result;
}

export const runQueryToolDefinition = {
  name: 'run_query',
  description: 'Run a drill segmentation query with MongoDB query object. Automatically validates field names against available metadata before executing the query and provides warnings for invalid fields. Can optionally break down by projection key (segment or user property). Supports comprehensive user properties including: first_seen (fs), last_seen (ls), total_session_duration (tsd), session_count (sc), device (d), device_type (dt), manufacturer (mnf), orientation (ornt), city (cty), region (rgn), country_code (cc), platform (p), platform_version (pv), app_version (av), carrier (c), resolution (r), screen_density (dnst), browser (brw), browser_version (brwv), language (la), locale (lo), source (src), source_channel (src_ch), name, username, email, organization, phone, gender, byear, age, engagement_score, hour, dow, has_hinge (hh), and app version components (av_major, av_minor, av_patch, av_prerel, av_build).',
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
        type: 'string',
        description: 'Optional segment or user property to break down by. User properties will be automatically prefixed with "up.". Available user properties include: fs (first_seen, date), ls (last_seen, date), tsd (total_session_duration, number), sc (session_count, number), d (device, list), dt (device_type, list), mnf (manufacturer, list), ornt (orientation, list), cty (city, list), rgn (region, list), cc (country_code, list), p (platform, list), pv (platform_version, list), av (app_version, list), av_major (app_version_major, number), av_minor (app_version_minor, number), av_patch (app_version_patch, number), av_prerel (app_version_prerelease, list), av_build (app_version_build, list), c (carrier, list), r (resolution, list), dnst (screen_density, list), brw (browser, list), brwv (browser_version, list), la (language, list), lo (locale, list), src (source, list), src_ch (source_channel, list), name (name, string), username (username, string), email (email, string), organization (organization, string), phone (phone, string), gender (gender, list), byear (byear, number), age (age, number), engagement_score (engagement_score, number), hour (hour, list), dow (dow, list), hh (has_hinge, list). Provide as JSON array string like \'["av"]\', \'["cc","p"]\', or \'["up.p"]\'',
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
      
      // Add event segments (if event was specified)
      if (event && data.sg) {
        for (const key of Object.keys(data.sg)) {
          availableFields.add(key);
        }
      }
      
      // Add known system fields that are always available
      const systemFields = ['c', 's', 'dur', 'did', 'ts', 'av', 'cc', 'platform'];
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
      // Check if it's already prefixed or a system field
      if (!availableFields.has(field) && !AGGREGATION_FIELDS.has(field) && !field.includes('.')) {
        warnings.push(`Query field "${field}" may not be available. Available user properties: ${Array.from(availableFields).filter(f => f.startsWith('up.')).map(f => f.substring(3)).join(', ')}`);
      }
      // Also check prefixed user properties
      if (field.startsWith('up.') && !availableFields.has(field)) {
        warnings.push(`User property "${field}" may not be available. Available user properties: ${Array.from(availableFields).filter(f => f.startsWith('up.')).map(f => f.substring(3)).join(', ')}`);
      }
    }
  } catch {
    // Invalid JSON will be caught later
  }

  // Validate projection key
  if (projectionKey) {
    try {
      const parsedProjection = JSON.parse(projectionKey);
      if (Array.isArray(parsedProjection)) {
        for (const field of parsedProjection) {
          if (typeof field === 'string' && !availableFields.has(field) && !AGGREGATION_FIELDS.has(field) && !field.includes('.')) {
            warnings.push(`Projection field "${field}" may not be available. Available user properties: ${Array.from(availableFields).filter(f => f.startsWith('up.')).map(f => f.substring(3)).join(', ')}`);
          }
          // Also check prefixed user properties
          if (typeof field === 'string' && field.startsWith('up.') && !availableFields.has(field)) {
            warnings.push(`User property "${field}" may not be available. Available user properties: ${Array.from(availableFields).filter(f => f.startsWith('up.')).map(f => f.substring(3)).join(', ')}`);
          }
        }
      }
    } catch {
      // Invalid JSON will be caught later
    }
  }

  // THIRD: Construct the query with auto-prefixing
  let processedQueryObject = queryObject;
  try {
    const parsedQuery = JSON.parse(queryObject);
    const processedQuery = autoPrefixQueryObject(parsedQuery);
    processedQueryObject = JSON.stringify(processedQuery);
  } catch {
    throw new Error(`Invalid query_object JSON: ${queryObject}`);
  }

  // Validate projection key if provided and auto-prefix user properties
  let processedProjectionKey = projectionKey;
  if (projectionKey) {
    try {
      const parsed = JSON.parse(projectionKey);
      if (Array.isArray(parsed)) {
        // Auto-prefix user properties with "up." unless they're known system properties or already prefixed
        const processed = parsed.map(key => {
          if (typeof key === 'string') {
            const correctedKey = correctPropertyName(key);
            if (shouldAutoPrefixProperty(correctedKey)) {
              return `up.${correctedKey}`;
            }
            return correctedKey;
          }
          return key;
        });
        processedProjectionKey = JSON.stringify(processed);
      }
    } catch {
      throw new Error(`Invalid projection_key JSON: ${projectionKey}`);
    }
  }

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
