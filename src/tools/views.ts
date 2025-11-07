import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';

import { ToolContext, ToolResult } from './types.js';

// ============================================================================
// GET_VIEWS_TABLE TOOL
// ============================================================================

export const getViewsTableToolDefinition = {
  name: 'get_views_table',
  description: 'Get list of views and totals for each view in the application',
  inputSchema: {
    type: 'object',
    properties: {
      app_id: { type: 'string', description: 'Application ID (optional if app_name is provided)' },
      app_name: { type: 'string', description: 'Application name (alternative to app_id)' },
      period: { 
        type: 'string', 
        description: 'Time period for data. Possible values: "month", "60days", "30days", "7days", "yesterday", "hour", or custom range as [startMilliseconds,endMilliseconds] (e.g., "[1417730400000,1420149600000]")', 
        default: '30days' 
      },
      skip: { type: 'number', description: 'Number of records to skip for pagination (iDisplayStart)', default: 0 },
      limit: { type: 'number', description: 'Maximum number of records to return (iDisplayLength)', default: 10 },
      visibleColumns: { 
        type: 'array', 
        items: { type: 'string' },
        description: 'Array of column codes to display (e.g., ["u","n","t","s","e","d","b","br","uvc"])',
        default: ['u','n','t','s','e','d','b','br','uvc']
      },
    },
    anyOf: [
      { required: ['app_id'] },
      { required: ['app_name'] }
    ],
  },
};

export async function handleGetViewsTable(context: ToolContext, args: any): Promise<ToolResult> {
  const app_id = await context.resolveAppId(args);
  const { period = '30days', skip = 0, limit = 10, visibleColumns = ['u','n','t','s','e','d','b','br','uvc'] } = args;
  
  const params = {
    ...context.getAuthParams(),
    app_id,
    method: 'views',
    action: 'getTable',
    period,
    iDisplayStart: skip,
    iDisplayLength: limit,
    visibleColumns: JSON.stringify(visibleColumns),
  };

  const response = await context.httpClient.get('/o', { params });
  
  const viewCount = response.data?.aaData?.length || 0;
  
  return {
    content: [
      {
        type: 'text',
        text: `Found ${viewCount} view(s) for app ${app_id}:\n${JSON.stringify(response.data, null, 2)}`,
      },
    ],
  };
}

// ============================================================================
// GET_VIEW_SEGMENTS TOOL
// ============================================================================

export const getViewSegmentsToolDefinition = {
  name: 'get_view_segments',
  description: 'Get available segments for views in the application',
  inputSchema: {
    type: 'object',
    properties: {
      app_id: { type: 'string', description: 'Application ID (optional if app_name is provided)' },
      app_name: { type: 'string', description: 'Application name (alternative to app_id)' },
      period: { 
        type: 'string', 
        description: 'Time period for data. Possible values: "month", "60days", "30days", "7days", "yesterday", "hour", or custom range as [startMilliseconds,endMilliseconds] (e.g., "[1417730400000,1420149600000]")', 
        default: '30days' 
      },
    },
    anyOf: [
      { required: ['app_id'] },
      { required: ['app_name'] }
    ],
  },
};

export async function handleGetViewSegments(context: ToolContext, args: any): Promise<ToolResult> {
  const app_id = await context.resolveAppId(args);
  const { period = '30days' } = args;
  
  const params = {
    ...context.getAuthParams(),
    app_id,
    method: 'get_view_segments',
    period,
  };

  const response = await context.httpClient.get('/o', { params });
  
  const segments = response.data?.segments || response.data || [];
  const segmentCount = Array.isArray(segments) ? segments.length : Object.keys(segments).length;
  
  return {
    content: [
      {
        type: 'text',
        text: `Found ${segmentCount} segment(s) for views in app ${app_id}:\n${JSON.stringify(response.data, null, 2)}`,
      },
    ],
  };
}

// ============================================================================
// GET_VIEWS_DATA TOOL
// ============================================================================

export const getViewsDataToolDefinition = {
  name: 'get_views_data',
  description: 'Get data breakdown by time for selected views with optional segment filtering',
  inputSchema: {
    type: 'object',
    properties: {
      app_id: { type: 'string', description: 'Application ID (optional if app_name is provided)' },
      app_name: { type: 'string', description: 'Application name (alternative to app_id)' },
      period: { 
        type: 'string', 
        description: 'Time period for data. Possible values: "month", "60days", "30days", "7days", "yesterday", "hour", or custom range as [startMilliseconds,endMilliseconds] (e.g., "[1417730400000,1420149600000]")', 
        default: '30days' 
      },
      selectedViews: { 
        type: 'string', 
        description: 'JSON string array of view objects with "view" (view ID) and "action" properties (e.g., \'[{"view":"690ce509b2b84986e5890017","action":""}]\')',
        default: '[]'
      },
      segment: { type: 'string', description: 'Optional segment key to filter by', default: '' },
      segmentVal: { type: 'string', description: 'Optional segment value to filter by', default: '' },
    },
    anyOf: [
      { required: ['app_id'] },
      { required: ['app_name'] }
    ],
  },
};

export async function handleGetViewsData(context: ToolContext, args: any): Promise<ToolResult> {
  const app_id = await context.resolveAppId(args);
  const { period = '30days', selectedViews = '[]', segment = '', segmentVal = '' } = args;
  
  const params = {
    ...context.getAuthParams(),
    app_id,
    method: 'views',
    period,
    selectedViews,
    segment,
    segmentVal,
  };

  const response = await context.httpClient.get('/o', { params });
  
  return {
    content: [
      {
        type: 'text',
        text: `Views data for app ${app_id}:\n${JSON.stringify(response.data, null, 2)}`,
      },
    ],
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export const viewsToolDefinitions = [
  getViewsTableToolDefinition,
  getViewSegmentsToolDefinition,
  getViewsDataToolDefinition,
];

export const viewsToolHandlers = {
  'get_views_table': 'getViewsTable',
  'get_view_segments': 'getViewSegments',
  'get_views_data': 'getViewsData',
} as const;

export class ViewsTools {
  constructor(private context: ToolContext) {}

  async getViewsTable(args: any): Promise<ToolResult> {
    return handleGetViewsTable(this.context, args);
  }

  async getViewSegments(args: any): Promise<ToolResult> {
    return handleGetViewSegments(this.context, args);
  }

  async getViewsData(args: any): Promise<ToolResult> {
    return handleGetViewsData(this.context, args);
  }
}

// Metadata for dynamic routing (must be after class declaration)
export const viewsToolMetadata = {
  instanceKey: 'views',
  toolClass: ViewsTools,
  handlers: viewsToolHandlers,
} as const;
