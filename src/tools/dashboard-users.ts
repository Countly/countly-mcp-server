import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { ToolContext, ToolResult } from './types.js';

// ============================================================================
// GET_ALL_DASHBOARD_USERS TOOL
// ============================================================================

export const getAllDashboardUsersToolDefinition = {
  name: 'get_all_dashboard_users',
  description: 'Get a list of all dashboard users (admin/management users who access the Countly dashboard)',
  inputSchema: {
    type: 'object',
    properties: {},
    required: [],
  },
};

export async function handleGetAllDashboardUsers(context: ToolContext, _: any): Promise<ToolResult> {
  const params = {
    ...context.getAuthParams(),
  };

  const response = await context.httpClient.get('/o/users/all', { params });
  
  return {
    content: [
      {
        type: 'text',
        text: `All dashboard users:\n${JSON.stringify(response.data, null, 2)}`,
      },
    ],
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export const dashboardUsersToolDefinitions = [
  getAllDashboardUsersToolDefinition,
];

export const dashboardUsersToolHandlers = {
  'get_all_dashboard_users': 'getAllDashboardUsers',
} as const;

export class DashboardUsersTools {
  constructor(private context: ToolContext) {}

  async getAllDashboardUsers(args: any): Promise<ToolResult> {
    return handleGetAllDashboardUsers(this.context, args);
  }
}

// Metadata for dynamic routing (must be after class declaration)
export const dashboardUsersToolMetadata = {
  instanceKey: 'dashboardUsers',
  toolClass: DashboardUsersTools,
  handlers: dashboardUsersToolHandlers,
} as const;
