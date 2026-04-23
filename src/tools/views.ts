import { ToolContext, ToolResult } from './types.js';
import { safeApiCall } from '../lib/error-handler.js';

// ============================================================================
// GET_VIEWS_TABLE TOOL
// ============================================================================

export const getViewsTableToolDefinition = {
  name: 'views_table',
  description: 'List tracked screens/pages (views) with aggregate metrics per view via /o?method=views&action=getTable. Paginated. Requires the views plugin. For time-series data of specific views use views_data; for available segment keys use views_segments.',
  inputSchema: {
    type: 'object',
    properties: {
      app_id: { type: 'string', description: 'Application ID. Either app_id or app_name must be provided; call apps_list first if you do not know it.' },
      app_name: { type: 'string', description: 'Application name (alternative to app_id). Must match an existing app exactly; call apps_list to find valid names.' },
      period: {
        type: 'string',
        description: 'Time period. One of "month", "60days", "30days", "7days", "yesterday", "hour", or a custom range as [startMilliseconds,endMilliseconds] (e.g. "[1417730400000,1420149600000]"). Defaults to "30days".',
        default: '30days'
      },
      skip: { type: 'number', description: 'Number of records to skip for pagination (maps to iDisplayStart). Defaults to 0.', default: 0 },
      limit: { type: 'number', description: 'Maximum number of records to return (maps to iDisplayLength). Defaults to 10.', default: 10 },
      visibleColumns: {
        type: 'array',
        items: { type: 'string' },
        description: 'Column codes to include: "u" unique users, "n" new users, "t" total views, "s" sessions, "e" events, "d" duration, "b" bounces, "br" bounce rate, "uvc" uniq views/user. Defaults to all.',
        default: ['u','n','t','s','e','d','b','br','uvc']
      },
    },
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

  const response = await safeApiCall(


    () => context.httpClient.get('/o', { params }),


    'Failed to execute request to /o'


  );
  
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
// GET_VIEWS_DATA TOOL
// ============================================================================

export const getViewsDataToolDefinition = {
  name: 'views_data',
  description: 'Get time-series data for selected views with optional segment filter via /o?method=views. Requires the views plugin. To list views use views_table; to discover segment keys use views_segments.',
  inputSchema: {
    type: 'object',
    properties: {
      app_id: { type: 'string', description: 'Application ID. Either app_id or app_name must be provided; call apps_list first if you do not know it.' },
      app_name: { type: 'string', description: 'Application name (alternative to app_id). Must match an existing app exactly; call apps_list to find valid names.' },
      period: {
        type: 'string',
        description: 'Time period. One of "month", "60days", "30days", "7days", "yesterday", "hour", or a custom range as [startMilliseconds,endMilliseconds]. Defaults to "30days".',
        default: '30days'
      },
      selectedViews: {
        type: 'string',
        description: 'JSON-encoded array of view selectors, each {"view":"<view_id>","action":"<action>"} (e.g. \'[{"view":"690ce509b2b84986e5890017","action":""}]\'). Defaults to \'[]\'.',
        default: '[]'
      },
      segment: { type: 'string', description: 'Optional segment key to slice by (see views_segments). Defaults to empty string.', default: '' },
      segmentVal: { type: 'string', description: 'Optional value of the segment to filter to. Defaults to empty string.', default: '' },
    },
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

  const response = await safeApiCall(


    () => context.httpClient.get('/o', { params }),


    'Failed to execute request to /o'


  );
  
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
  getViewsDataToolDefinition,
];

export const viewsToolHandlers = {
  'views_table': 'getViewsTable',
  'views_data': 'getViewsData',
} as const;

export class ViewsTools {
  constructor(private context: ToolContext) {}

  async getViewsTable(args: any): Promise<ToolResult> {
    return handleGetViewsTable(this.context, args);
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
