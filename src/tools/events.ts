import { ToolContext, ToolResult } from './types.js';
import { safeApiCall } from '../lib/error-handler.js';

// ============================================================================
// GET_EVENTS_AND_SEGMENTS TOOL
// ============================================================================

export const getEventsAndSegmentsToolDefinition = {
  name: 'events_list',
  description: 'List all events and their segments for an application. This shows exactly how events appear in the database, including both custom events and internal Countly events.',
  inputSchema: {
    type: 'object',
    properties: {
      app_id: { type: 'string', description: 'Application ID (optional if app_name is provided)' },
      app_name: { type: 'string', description: 'Application name (alternative to app_id)' },
    },
  },
};

export async function handleGetEventsAndSegments(context: ToolContext, args: any): Promise<ToolResult> {
  const app_id = await context.resolveAppId(args);

  const params = {
    ...context.getAuthParams(),
    app_id,
    method: 'get_events',
  };

  const response = await safeApiCall(
    () => context.httpClient.get('/o', { params }),
    'Failed to execute request to get events list'
  );

  let resultText = `Events and segments list for app ${app_id}:\n\n`;

  if (response.data && Array.isArray(response.data)) {
    resultText += `**Custom Events:** ${response.data.length}\n\n`;

    response.data.forEach((event: any, index: number) => {
      resultText += `**${index + 1}. ${event.key || 'Unnamed Event'}**\n`;
      if (event.name) {
        resultText += `   Name: ${event.name}\n`;
      }
      if (event.description) {
        resultText += `   Description: ${event.description}\n`;
      }
      if (event.category) {
        resultText += `   Category: ${event.category}\n`;
      }
      if (event.segments && Array.isArray(event.segments)) {
        resultText += `   Segments (${event.segments.length}):\n`;
        event.segments.forEach((segment: any) => {
          const typeDesc = getSegmentTypeDescription(segment.type);
          resultText += `     - ${segment.name}: ${typeDesc}`;
          if (segment.description) {
            resultText += ` (${segment.description})`;
          }
          if (segment.required) {
            resultText += ` [Required]`;
          }
          resultText += `\n`;
        });
      }
      resultText += `\n`;
    });
  } else {
    resultText += `**Custom Events:**\n${JSON.stringify(response.data, null, 2)}\n\n`;
  }

  // Add internal Countly events
  resultText += `**Internal Countly Events:**\n\n`;
  const internalEvents = {
    "[CLY]_view": {
      start: { name: "start", type: "l" },
      exit: { name: "exit", type: "l" },
      bounce: { name: "bounce", type: "l" }
    },
    "[CLY]_session": {
    },
    "[CLY]_crash": {
      name: { name: "name", type: "s" },
      manufacture: { name: "manufacture", type: "l" },
      cpu: { name: "cpu", type: "l" },
      opengl: { name: "opengl", type: "l" },
      view: { name: "view", type: "l" },
      browser: { name: "browser", type: "l" },
      os: { name: "operating_system", type: "l" },
      orientation: { name: "orientation", type: "l" },
      nonfatal: { name: "nonfatal", type: "l" },
      root: { name: "root", type: "l" },
      online: { name: "online", type: "l" },
      signal: { name: "signal", type: "l" },
      muted: { name: "muted", type: "l" },
      background: { name: "background", type: "l" },
      app_version: { name: "app_version", type: "l" },
      app_version_major: { name: "app_version_major", type: "n" },
      app_version_minor: { name: "app_version_minor", type: "n" },
      app_version_patch: { name: "app_version_patch", type: "n" },
      app_version_prerelease: { name: "app_version_prerelease", type: "l" },
      app_version_build: { name: "app_version_build", type: "l" },
      ram_current: { name: "ram_current", type: "n" },
      ram_total: { name: "ram_total", type: "n" },
      disk_current: { name: "disk_current", type: "n" },
      disk_total: { name: "disk_total", type: "n" },
      bat_current: { name: "bat_current", type: "n" },
      bat_total: { name: "bat_total", type: "n" },
      bat: { name: "bat", type: "n" },
      run: { name: "run", type: "n" }
    },
    "[CLY]_star_rating": {
      email: { name: "email", type: "s" },
      comment: { name: "comment", type: "s" },
      widget_id: { name: "widget_id", type: "l" },
      contactMe: { name: "contactMe", type: "s" },
      rating: { name: "rating", type: "n" },
      platform_version_rate: { name: "platform_version_rate", type: "s" }
    },
    "[CLY]_nps": {
      comment: { name: "comment", type: "s" },
      widget_id: { name: "widget_id", type: "l" },
      rating: { name: "rating", type: "n" },
      shown: { name: "shown", type: "s" },
      answered: { name: "answered", type: "s" }
    },
    "[CLY]_survey": {
      widget_id: { name: "widget_id", type: "l" },
      shown: { name: "shown", type: "s" },
      answered: { name: "answered", type: "s" }
    },
    "[CLY]_push_action": {
      i: { name: "message_id", type: "s" }
    },
    "[CLY]_push_sent": {
      i: { name: "message_id", type: "s" }
    },
    "[CLY]_journey_engine": {
      journey_id: { name: "journey_id", type: "s" },
      journey_definition_id: { name: "journey_definition_id", type: "s" },
      journey_state: { name: "journey_state", type: "l" },
      name: { name: "name", type: "l" },
    }
  };

  Object.entries(internalEvents).forEach(([eventKey, segments], index) => {
    resultText += `**${index + 1}. ${eventKey}**\n`;
    const segmentKeys = Object.keys(segments);
    if (segmentKeys.length > 0) {
      resultText += `   Segments (${segmentKeys.length}):\n`;
      segmentKeys.forEach((segmentKey) => {
        const segment = (segments as any)[segmentKey];
        const typeDesc = getSegmentTypeDescription(segment.type);
        resultText += `     - ${segment.name} (${segmentKey}): ${typeDesc}\n`;
      });
    } else {
      resultText += `   Segments: None\n`;
    }
    resultText += `\n`;
  });

  return {
    content: [
      {
        type: 'text',
        text: resultText,
      },
    ],
  };
}

function getSegmentTypeDescription(type: string): string {
  switch (type) {
    case 's':
      return 'string';
    case 'n':
      return 'number';
    case 'b':
      return 'boolean';
    case 'd':
      return 'date';
    case 'l':
      return 'list';
    default:
      return type;
  }
}

// ============================================================================
// CREATE_EVENT TOOL
// ============================================================================

export const createEventToolDefinition = {
  name: 'events_create',
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
  getEventsAndSegmentsToolDefinition,
];

export const eventsToolHandlers = {
  'events_create': 'createEvent',
  'events_list': 'getEventsAndSegments',
} as const;

export class EventsTools {
  constructor(private context: ToolContext) {}

  async createEvent(args: any): Promise<ToolResult> {
    return handleCreateEvent(this.context, args);
  }

  async getEventsAndSegments(args: any): Promise<ToolResult> {
    return handleGetEventsAndSegments(this.context, args);
  }
}

// Metadata for dynamic routing (must be after class declaration)
export const eventsToolMetadata = {
  instanceKey: 'events',
  toolClass: EventsTools,
  handlers: eventsToolHandlers,
} as const;
