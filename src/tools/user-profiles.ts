import { ToolContext, ToolResult } from './types.js';
import { withDefault } from '../lib/validation.js';
import { safeApiCall } from '../lib/error-handler.js';

// ============================================================================
// QUERY USER PROFILES TOOL
// ============================================================================

export const queryUserProfilesToolDefinition = {
  name: 'query_user_profiles',
  description: 'Query user profiles using MongoDB query. Check drill segmentation_meta for available user properties (without "up." prefix here)',
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
      query: {
        type: 'string',
        description: 'MongoDB query object as JSON string (e.g., \'{"country":"US"}\' or \'{}\'). Note: Do NOT use "up." prefix here',
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
  name: 'breakdown_user_profiles',
  description: 'Break down user counts by specific properties (e.g., country, app version)',
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
      query: {
        type: 'string',
        description: 'MongoDB query object as JSON string to filter users (e.g., \'{"country":"US"}\' or \'{}\'). Do NOT use "up." prefix',
      },
      projection_key: {
        type: 'string',
        description: 'JSON array of property keys to break down by (e.g., \'["av"]\' for app version, \'["country"]\' for country)',
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
  name: 'get_user_profile_details',
  description: 'Get detailed information about a specific user by their UID',
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
      uid: {
        type: 'string',
        description: 'User ID (UID) to get details for',
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

// ============================================================================
// ADD USER NOTE TOOL
// ============================================================================

export const addUserNoteToolDefinition = {
  name: 'add_user_note',
  description: 'Add or update a note on a specific user profile',
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
      user_id: {
        type: 'string',
        description: 'User ID to add note to',
      },
      note: {
        type: 'string',
        description: 'Note text to add',
      },
    },
    required: ['user_id', 'note'],
  },
};

export async function handleAddUserNote(context: ToolContext, args: any): Promise<ToolResult> {
  const appId = await context.resolveAppId(args);
  const userId = args.user_id;
  const note = args.note;

  const params = {
    ...context.getAuthParams(),
    app_id: appId,
    user_id: userId,
    note,
  };

  const response = await safeApiCall(
    () => context.httpClient.get('/usernote/edit', { params }),
    'Failed to add user note'
  );

  return {
    content: [
      {
        type: 'text',
        text: `User note added:\n${JSON.stringify(response.data, null, 2)}`,
      },
    ],
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export const userProfilesToolDefinitions = [
  queryUserProfilesToolDefinition,
  breakdownUserProfilesToolDefinition,
  getUserProfileDetailsToolDefinition,
  addUserNoteToolDefinition,
];

export const userProfilesToolHandlers = {
  'query_user_profiles': 'handleQueryUserProfiles',
  'breakdown_user_profiles': 'handleBreakdownUserProfiles',
  'get_user_profile_details': 'handleGetUserProfileDetails',
  'add_user_note': 'handleAddUserNote',
} as const;

export class UserProfilesTools {
  constructor(private context: ToolContext) {}

  async query_user_profiles(args: any): Promise<ToolResult> {
    return handleQueryUserProfiles(this.context, args);
  }

  async breakdown_user_profiles(args: any): Promise<ToolResult> {
    return handleBreakdownUserProfiles(this.context, args);
  }

  async get_user_profile_details(args: any): Promise<ToolResult> {
    return handleGetUserProfileDetails(this.context, args);
  }

  async add_user_note(args: any): Promise<ToolResult> {
    return handleAddUserNote(this.context, args);
  }
}

// Metadata for dynamic routing
export const userProfilesToolMetadata = {
  instanceKey: 'user_profiles',
  toolClass: UserProfilesTools,
  handlers: userProfilesToolHandlers,
} as const;
