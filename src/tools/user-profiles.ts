import { ToolContext, ToolResult } from './types.js';
import { withDefault } from '../lib/validation.js';
import { safeApiCall } from '../lib/error-handler.js';

// ============================================================================
// QUERY USER PROFILES TOOL
// ============================================================================

export const queryUserProfilesToolDefinition = {
  name: 'user_profiles_query',
  description: 'Query end-user (app_user) profiles by MongoDB filter via /o?method=user_details. Requires the users plugin. Field names are used WITHOUT the "up." prefix here (unlike drill/retention). For details on a specific user use user_profiles_get; for counts grouped by a property use user_profiles_breakdown.',
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
      query: {
        type: 'string',
        description: 'MongoDB filter as a JSON string (e.g. \'{"country":"US"}\'). Field names go WITHOUT the "up." prefix. Defaults to \'{}\' (all users).',
      },
    },
    required: [],
  },
};

export async function handleQueryUserProfiles(context: ToolContext, args: any): Promise<ToolResult> {
  const appId = await context.resolveAppId(args);
  const query = withDefault(args.query, '{}');

  // Validate query is valid JSON
  try {
    JSON.parse(query);
  } catch {
    throw new Error(`Invalid query JSON: ${query}`);
  }

  const params = {
    ...context.getAuthParams(),
    app_id: appId,
    method: 'user_details',
    query,
  };

  const response = await safeApiCall(
    () => context.httpClient.get('/o', { params }),
    'Failed to query user profiles'
  );

  let resultText = 'User profiles query results:\n\n';
  resultText += `**Query:** ${query}\n\n`;
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
// BREAKDOWN USER PROFILES TOOL
// ============================================================================

export const breakdownUserProfilesToolDefinition = {
  name: 'user_profiles_breakdown',
  description: 'Group app-user profiles by one or more properties and count users per bucket via /o?method=user_details&projectionKey=. Requires the users plugin. For the raw profile records use user_profiles_query.',
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
      query: {
        type: 'string',
        description: 'MongoDB filter as a JSON string (e.g. \'{"country":"US"}\'). Field names go WITHOUT the "up." prefix. Defaults to \'{}\'.',
      },
      projection_key: {
        type: 'string',
        description: 'JSON-encoded array of property keys to group by (e.g. \'["av"]\' for app version, \'["country"]\').',
      },
    },
    required: ['projection_key'],
  },
};

export async function handleBreakdownUserProfiles(context: ToolContext, args: any): Promise<ToolResult> {
  const appId = await context.resolveAppId(args);
  const query = withDefault(args.query, '{}');
  const projectionKey = args.projection_key;

  // Validate query is valid JSON
  try {
    JSON.parse(query);
  } catch {
    throw new Error(`Invalid query JSON: ${query}`);
  }

  // Validate projection_key is valid JSON array
  try {
    const parsed = JSON.parse(projectionKey);
    if (!Array.isArray(parsed)) {
      throw new Error('projection_key must be a JSON array');
    }
  } catch {
    throw new Error(`Invalid projection_key JSON: ${projectionKey}`);
  }

  const params = {
    ...context.getAuthParams(),
    app_id: appId,
    method: 'user_details',
    query,
    projectionKey,
  };

  const response = await safeApiCall(
    () => context.httpClient.get('/o', { params }),
    'Failed to breakdown user profiles'
  );

  let resultText = 'User profiles breakdown:\n\n';
  resultText += `**Query:** ${query}\n`;
  resultText += `**Breakdown by:** ${projectionKey}\n\n`;
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
// GET USER PROFILE DETAILS TOOL
// ============================================================================

export const getUserProfileDetailsToolDefinition = {
  name: 'user_profiles_get',
  description: 'Get the full profile of a single app-user by UID via /o?method=user_details. Requires the users plugin. For bulk listing use user_profiles_query; for grouped counts use user_profiles_breakdown.',
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
      uid: {
        type: 'string',
        description: 'User identifier (uid) assigned by Countly. Obtain it from user_profiles_query results.',
      },
    },
    required: ['uid'],
  },
};

export async function handleGetUserProfileDetails(context: ToolContext, args: any): Promise<ToolResult> {
  const appId = await context.resolveAppId(args);
  const uid = args.uid;

  const params = {
    ...context.getAuthParams(),
    app_id: appId,
    method: 'user_details',
    uid,
  };

  const response = await safeApiCall(
    () => context.httpClient.get('/o', { params }),
    'Failed to get user profile details'
  );

  let resultText = 'User profile details:\n\n';
  resultText += `**UID:** ${uid}\n\n`;
  resultText += `**Details:**\n`;
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

export const userProfilesToolDefinitions = [
  queryUserProfilesToolDefinition,
  breakdownUserProfilesToolDefinition,
  getUserProfileDetailsToolDefinition,
];

export const userProfilesToolHandlers = {
  'user_profiles_query': 'user_profiles_query',
  'user_profiles_breakdown': 'user_profiles_breakdown',
  'user_profiles_get': 'user_profiles_get',
} as const;

export class UserProfilesTools {
  constructor(private context: ToolContext) {}

  async user_profiles_query(args: any): Promise<ToolResult> {
    return handleQueryUserProfiles(this.context, args);
  }

  async user_profiles_breakdown(args: any): Promise<ToolResult> {
    return handleBreakdownUserProfiles(this.context, args);
  }

  async user_profiles_get(args: any): Promise<ToolResult> {
    return handleGetUserProfileDetails(this.context, args);
  }
}

// Metadata for dynamic routing
export const userProfilesToolMetadata = {
  instanceKey: 'user_profiles',
  toolClass: UserProfilesTools,
  handlers: userProfilesToolHandlers,
} as const;
