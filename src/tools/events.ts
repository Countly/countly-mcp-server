import { ToolContext, ToolResult } from './types.js';
import { safeApiCall } from '../lib/error-handler.js';

// ============================================================================
// CREATE_EVENT TOOL
// ============================================================================

export const createEventToolDefinition = {
  name: 'create_event',
  description: 'Create/configure an event definition with display name and description',
  inputSchema: {
    type: 'object',
    properties: {
      app_id: { type: 'string', description: 'Application ID (optional if app_name is provided)' },
      app_name: { type: 'string', description: 'Application name (alternative to app_id)' },
      key: { type: 'string', description: 'Event key/name' },
      name: { type: 'string', description: 'Display name for the event' },
      description: { type: 'string', description: 'Description for the event' },
      category: { type: 'string', description: 'Optional event category' },
      segments: { 
        type: 'array', 
        description: 'Array of segment definitions',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Segment name/key' },
            type: { type: 'string', description: 'Segment type (s=string, n=number, b=boolean, l=list, d=date in millisecond timestamp)' },
            required: { type: 'boolean', description: 'Whether segment is required' },
            description: { type: 'string', description: 'Segment description' }
          }
        }
      },
    },
    anyOf: [
      { required: ['app_id', 'key', 'name'] },
      { required: ['app_name', 'key', 'name'] }
    ],
  },
};

export async function handleCreateEvent(context: ToolContext, args: any): Promise<ToolResult> {
  const app_id = await context.resolveAppId(args);
  const { key, name, description, category, segments } = args;
  
  const eventData: any = {
    key,
    name,
    description: description || '',
    category: category || null,
    isEditMode: false,
    segments: segments || []
  };

  const params = {
    ...context.getAuthParams(),
    app_id,
    event: JSON.stringify(eventData),
  };

  const response = await safeApiCall(


    () => context.httpClient.get('/i/data-manager/event', { params }),


    'Failed to execute request to /i/data-manager/event'


  );
  
  return {
    content: [
      {
        type: 'text',
        text: `Event definition created for "${name}" (${key}) in app ${app_id}:\n${JSON.stringify(response.data, null, 2)}`,
      },
    ],
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export const eventsToolDefinitions = [
  createEventToolDefinition,
];

export const eventsToolHandlers = {
  'create_event': 'createEvent',
} as const;

export class EventsTools {
  constructor(private context: ToolContext) {}

  async createEvent(args: any): Promise<ToolResult> {
    return handleCreateEvent(this.context, args);
  }
}

// Metadata for dynamic routing (must be after class declaration)
export const eventsToolMetadata = {
  instanceKey: 'events',
  toolClass: EventsTools,
  handlers: eventsToolHandlers,
} as const;
