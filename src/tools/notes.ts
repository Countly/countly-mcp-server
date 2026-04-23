import { ToolContext, ToolResult } from './types.js';
import { safeApiCall } from '../lib/error-handler.js';

// ============================================================================
// CREATE_NOTE TOOL
// ============================================================================

export const createNoteToolDefinition = {
  name: 'notes_create',
  description: 'Create a timestamped note on an app (annotation that appears on dashboard graphs) via /i/notes/save. Notes are handy for marking releases, incidents, or campaigns.',
  inputSchema: {
    type: 'object',
    properties: {
      app_id: { type: 'string', description: 'Application ID. Either app_id or app_name must be provided; call apps_list first if you do not know it.' },
      app_name: { type: 'string', description: 'Application name (alternative to app_id). Must match an existing app exactly; call apps_list to find valid names.' },
      note: { type: 'string', description: 'Note body text shown in the dashboard.' },
      ts: { type: 'number', description: 'Note anchor timestamp. Unix seconds (< 10^10) are auto-converted to milliseconds; milliseconds are passed through.' },
      noteType: { type: 'string', description: 'Visibility tier, typically "public" or "private".' },
      color: { type: 'string', description: 'Badge color. Defaults to "turquoise" when omitted.', enum: ['turquoise', 'yellow', 'orange', 'pink', 'blue'] },
      category: { type: 'string', description: 'Optional placement category, e.g. "sessionHomeWidget" to pin the note on the session dashboard graph.' },
      emails: { type: 'array', items: { type: 'string' }, description: 'Optional email addresses to notify.' },
    },
    required: ['note', 'ts'],
  },
};

export async function handleCreateNote(context: ToolContext, args: any): Promise<ToolResult> {
  const app_id = await context.resolveAppId(args);
  const { note, ts, noteType, color, category, emails } = args;

  // Convert color name to numeric code. Defaults to turquoise (1) when omitted.
  const colorMap: { [key: string]: number } = {
    'turquoise': 1,
    'yellow': 2,
    'orange': 3,
    'pink': 4,
    'blue': 5,
  };

  const colorCode = color ? (colorMap[color.toLowerCase()] || 1) : 1;

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

  const response = await safeApiCall(


    () => context.httpClient.get('/i/notes/save', { params }),


    'Failed to execute request to /i/notes/save'


  );
  
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
  name: 'notes_list',
  description: 'List dashboard notes (annotations) for an app within a time period via /o?method=notes. String periods are converted to [start,end] millisecond ranges by the tool. To add a note use notes_create.',
  inputSchema: {
    type: 'object',
    properties: {
      app_id: { type: 'string', description: 'Application ID. Either app_id or app_name must be provided; call apps_list first if you do not know it.' },
      app_name: { type: 'string', description: 'Application name (alternative to app_id). Must match an existing app exactly; call apps_list to find valid names.' },
      period: {
        type: 'string',
        description: 'Time period. One of "month", "60days", "30days", "7days", or a custom range as [startMilliseconds,endMilliseconds] (e.g. "[1417730400000,1420149600000]"). Defaults to "30days".',
        default: '30days'
      },
    },
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

  const response = await safeApiCall(


    () => context.httpClient.get('/o', { params }),


    'Failed to execute request to /o'


  );
  
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
  name: 'notes_delete',
  description: 'Delete a single note by its _id via /i/notes/delete. WARNING: irreversible. Unlike other tools in this file, this endpoint is app-agnostic and does not require app_id.',
  inputSchema: {
    type: 'object',
    properties: {
      note_id: { type: 'string', description: 'Note identifier (_id) to delete. Obtain it from notes_list.' },
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

  const response = await safeApiCall(


    () => context.httpClient.get('/i/notes/delete', { params }),


    'Failed to execute request to /i/notes/delete'


  );
  
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
  'notes_create': 'createNote',
  'notes_list': 'listNotes',
  'notes_delete': 'deleteNote',
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
