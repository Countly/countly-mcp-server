import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';

import { ToolContext, ToolResult } from './types.js';

// ============================================================================
// CREATE_NOTE TOOL
// ============================================================================

export const createNoteToolDefinition = {
  name: 'create_note',
  description: 'Create a new note',
  inputSchema: {
    type: 'object',
    properties: {
      app_id: { type: 'string', description: 'Application ID (optional if app_name is provided)' },
      app_name: { type: 'string', description: 'Application name (alternative to app_id)' },
      note: { type: 'string', description: 'Note content text' },
      ts: { type: 'number', description: 'Timestamp for the note (Unix timestamp in seconds)' },
      noteType: { type: 'string', description: 'Note type (e.g., "public", "private")' },
      color: { type: 'string', description: 'Note color (e.g., "blue", "red", "green", "yellow")', enum: ['turquoise', 'yellow', 'orange', 'pink', 'blue'] },
      category: { type: 'string', description: 'Optional category (e.g., "sessionHomeWidget" to display on session dashboard graph)' },
      emails: { type: 'array', items: { type: 'string' }, description: 'Optional array of email addresses' },
    },
    anyOf: [
      { required: ['app_id', 'note', 'ts', 'noteType', 'color'] },
      { required: ['app_name', 'note', 'ts', 'noteType', 'color'] }
    ],
  },
};

export async function handleCreateNote(context: ToolContext, args: any): Promise<ToolResult> {
  const app_id = await context.resolveAppId(args);
  const { note, ts, noteType, color, category, emails } = args;
  
  // Convert color name to numeric code
  const colorMap: { [key: string]: number } = {
    'turquoise': 1,
    'yellow': 2,
    'orange': 3,
    'pink': 4,
    'blue': 5,
  };
  
  const colorCode = colorMap[color.toLowerCase()] || 1;
  
  // Convert timestamp to milliseconds if it appears to be in seconds
  const timestamp = ts < 10000000000 ? ts * 1000 : ts;
  
  const noteArgs: any = {
    app_id,
    note,
    ts: timestamp,
    noteType,
    emails: emails || [],
    color: colorCode,
    category: category || null,
  };
  
  const params = {
    ...context.getAuthParams(),
    args: JSON.stringify(noteArgs),
  };

  const response = await context.httpClient.get('/i/notes/save', { params });
  
  return {
    content: [
      {
        type: 'text',
        text: `Note created for app ${app_id}:\n${JSON.stringify(response.data, null, 2)}`,
      },
    ],
  };
}

// ============================================================================
// LIST_NOTES TOOL
// ============================================================================

export const listNotesToolDefinition = {
  name: 'list_notes',
  description: 'List all notes for an application within a time period',
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

export async function handleListNotes(context: ToolContext, args: any): Promise<ToolResult> {
  const app_id = await context.resolveAppId(args);
  const { period = '30days' } = args;
  
  // Calculate timestamps for the period if it's a string like "30days"
  let periodParam = period;
  if (!period.startsWith('[')) {
    // Convert period string to timestamp array
    const now = Date.now();
    let startTime = now;
    
    if (period === '30days') {
startTime = now - (30 * 24 * 60 * 60 * 1000);
} else if (period === '60days') {
startTime = now - (60 * 24 * 60 * 60 * 1000);
} else if (period === '7days') {
startTime = now - (7 * 24 * 60 * 60 * 1000);
} else if (period === 'month') {
startTime = now - (30 * 24 * 60 * 60 * 1000);
}
    
    periodParam = `[${startTime},${now}]`;
  }
  
  const params = {
    ...context.getAuthParams(),
    app_id: app_id,
    method: 'notes',
    notes_apps: JSON.stringify([app_id]),
    period: periodParam,
  };

  const response = await context.httpClient.get('/o', { params });
  
  const notes = response.data?.notes || response.data || [];
  const noteCount = Array.isArray(notes) ? notes.length : Object.keys(notes).length;
  
  return {
    content: [
      {
        type: 'text',
        text: `Found ${noteCount} note(s) for app ${app_id}:\n${JSON.stringify(response.data, null, 2)}`,
      },
    ],
  };
}

// ============================================================================
// DELETE_NOTE TOOL
// ============================================================================

export const deleteNoteToolDefinition = {
  name: 'delete_note',
  description: 'Delete a note',
  inputSchema: {
    type: 'object',
    properties: {
      note_id: { type: 'string', description: 'Note ID to delete' },
    },
    required: ['note_id'],
  },
};

export async function handleDeleteNote(context: ToolContext, args: any): Promise<ToolResult> {
  const { note_id } = args;
  
  const params = {
    ...context.getAuthParams(),
    note_id,
  };

  const response = await context.httpClient.get('/i/notes/delete', { params });
  
  return {
    content: [
      {
        type: 'text',
        text: `Note ${note_id} deleted:\n${JSON.stringify(response.data, null, 2)}`,
      },
    ],
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export const notesToolDefinitions = [
  createNoteToolDefinition,
  listNotesToolDefinition,
  deleteNoteToolDefinition,
];

export const notesToolHandlers = {
  'create_note': 'createNote',
  'list_notes': 'listNotes',
  'delete_note': 'deleteNote',
} as const;

export class NotesTools {
  constructor(private context: ToolContext) {}

  async createNote(args: any): Promise<ToolResult> {
    return handleCreateNote(this.context, args);
  }

  async listNotes(args: any): Promise<ToolResult> {
    return handleListNotes(this.context, args);
  }

  async deleteNote(args: any): Promise<ToolResult> {
    return handleDeleteNote(this.context, args);
  }
}

// Metadata for dynamic routing (must be after class declaration)
export const notesToolMetadata = {
  instanceKey: 'notes',
  toolClass: NotesTools,
  handlers: notesToolHandlers,
} as const;
