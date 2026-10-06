/**
 * Graph-note tools: Countly Platform /v2 variants (/v2/notes)
 *
 * v2 notes use the sharing-framework vocabulary (visibility private / shared /
 * global, shared with member emails) and can be scoped to one event. Notes
 * written through /v2 are stored as version 2 and are hidden from the legacy
 * dashboard; updating a legacy note promotes it to version 2.
 *
 * Edit and delete are allowed for the note owner and global admins only.
 */

import { periodToRange } from '../dashboards-v2.js';
import { jsonResult, v2ErrorResult, v2Request } from '../../lib/v2-api.js';
import type { ToolContext, ToolResult } from '../types.js';

const appProps = {
  app_id: { type: 'string', description: 'Application ID. Either app_id or app_name must be provided; call apps_list first if you do not know it.' },
  app_name: { type: 'string', description: 'Application name (alternative to app_id). Must match an existing app exactly; call apps_list to find valid names.' },
};

const COLORS = ['turquoise', 'yellow', 'orange', 'pink', 'blue'];

const noteFields = {
  note: { type: 'string', description: 'Note text shown on the graphs.' },
  ts: { type: 'number', description: 'Time the note marks. Unix seconds (< 10^10) are converted to milliseconds; milliseconds are passed through.' },
  color: { type: 'string', enum: COLORS, description: 'Badge color. Defaults to "turquoise".' },
  visibility: {
    type: 'string',
    enum: ['private', 'shared', 'global'],
    description: 'Who sees the note: "private" (only you, default), "shared" (you and shared_with), "global" (everyone with access to the app).',
  },
  shared_with: { type: 'array', items: { type: 'string' }, description: 'Dashboard member emails to share with. Required when visibility is "shared".' },
  event: { type: 'string', description: 'Optional event key: show the note only on charts of this event. Omit to show it on every time chart.' },
};

export const notesV2ToolDefinitions: Record<string, any> = {
  notes_create: {
    name: 'notes_create',
    description: 'Create a graph note (annotation on dashboard time charts) on an app, e.g. to mark a release, incident or campaign. Notes created here are hidden from the legacy dashboard. To change one use notes_update.',
    inputSchema: {
      type: 'object',
      properties: { ...appProps, ...noteFields },
      required: ['note', 'ts'],
    },
  },
};

export const updateNoteV2ToolDefinition = {
  name: 'notes_update',
  description: 'Edit a graph note: text, time, color, visibility, sharing or event scope. Only the fields you pass change. Only the note owner or a global admin can edit. Editing a legacy note moves it to the new format, which the legacy dashboard no longer shows. Get note ids from notes_list.',
  inputSchema: {
    type: 'object',
    properties: {
      ...appProps,
      note_id: { type: 'string', description: 'Note id from notes_list.' },
      ...noteFields,
      note: { type: 'string', description: 'New note text. Omit to keep the current text.' },
      ts: { type: 'number', description: 'New time the note marks (Unix seconds or milliseconds). Omit to keep it.' },
      event: { type: 'string', description: 'Event key to scope the note to. Pass an empty string to show it on every chart again; omit to keep the current scope.' },
    },
    required: ['note_id'],
  },
};

const toMs = (ts: unknown): number => {
  const n = Number(ts);
  return n < 10_000_000_000 ? n * 1000 : n;
};

const colorCode = (color: unknown, fallback = 1): number => {
  if (typeof color === 'number' && color >= 1 && color <= 5) {
    return color;
  }
  const index = typeof color === 'string' ? COLORS.indexOf(color.toLowerCase()) : -1;
  return index >= 0 ? index + 1 : fallback;
};

/** Legacy noteType ("public"/"shared"/"private") → framework visibility */
function visibilityOf(args: any, fallback = 'private'): string {
  if (args.visibility) {
    return args.visibility;
  }
  if (args.noteType === 'public') {
    return 'global';
  }
  return args.noteType === 'shared' ? 'shared' : fallback;
}

/** Lean note for the model: ISO times, color name, no empty sharing */
export function compactNote(note: any): any {
  const users = note.sharing?.users || [];
  const groups = note.sharing?.userGroups || [];
  return {
    id: note.id,
    note: note.note,
    time: note.ts ? new Date(note.ts).toISOString() : undefined,
    ts: note.ts,
    color: COLORS[(note.color || 1) - 1] ?? note.color,
    visibility: note.visibility,
    ...(users.length ? { shared_with: users } : {}),
    ...(groups.length ? { shared_with_groups: groups } : {}),
    ...(note.scope?.event ? { event: note.scope.event } : {}),
    ...(note.scope?.keys?.length ? { keys: note.scope.keys } : {}),
    ...(note.scope?.subjects?.length ? { subjects: note.scope.subjects } : {}),
    owner: note.ownerName || note.owner,
    can_edit: note.canEdit,
    legacy: note.version === 1 ? true : undefined,
  };
}

export async function handleListNotesV2(context: ToolContext, args: any): Promise<ToolResult> {
  try {
    const app_id = await context.resolveAppId(args);
    const { from, to } = periodToRange(args.period || '30days');
    const data = await v2Request<any>(context, 'get', '/v2/notes', { params: { app_id, from, to } });
    const notes = (data?.notes || []).map(compactNote);
    return jsonResult(`Found ${notes.length} note(s) for app ${app_id}`, notes);
  } catch (error) {
    return v2ErrorResult('list notes', error);
  }
}

export async function handleCreateNoteV2(context: ToolContext, args: any): Promise<ToolResult> {
  try {
    const app_id = await context.resolveAppId(args);
    const shared = args.shared_with || args.emails || [];
    const body = {
      note: args.note,
      ts: toMs(args.ts),
      color: colorCode(args.color),
      visibility: visibilityOf(args),
      sharing: { users: shared, userGroups: [] },
      ...(args.event ? { scope: { event: args.event } } : {}),
    };
    const note = await v2Request<any>(context, 'post', '/v2/notes', { params: { app_id }, body });
    return jsonResult(`Note created for app ${app_id}`, compactNote(note));
  } catch (error) {
    return v2ErrorResult('create note', error);
  }
}

export async function handleUpdateNoteV2(context: ToolContext, args: any): Promise<ToolResult> {
  try {
    // PUT replaces the whole note, so start from the current version
    const app_id = await context.resolveAppId(args);
    const data = await v2Request<any>(context, 'get', '/v2/notes', { params: { app_id } });
    const current = (data?.notes || []).find((n: any) => n.id === args.note_id);
    if (!current) {
      return {
        content: [{ type: 'text', text: `Failed to update note: note ${args.note_id} not found in app ${app_id} (or not visible to you).` }],
        isError: true,
      } as ToolResult;
    }
    const visibility = visibilityOf(args, current.visibility);
    const users = args.shared_with ?? current.sharing?.users ?? [];
    let scope = current.scope;
    if (args.event !== undefined) {
      const { event: _old, ...rest } = current.scope || {};
      scope = args.event ? { ...rest, event: args.event } : rest;
    }
    if (scope && Object.keys(scope).length === 0) {
      scope = undefined;
    }
    const body = {
      note: args.note ?? current.note,
      ts: args.ts !== undefined ? toMs(args.ts) : current.ts,
      color: args.color !== undefined ? colorCode(args.color, current.color) : current.color,
      visibility,
      sharing: { users, userGroups: current.sharing?.userGroups ?? [] },
      ...(scope ? { scope } : {}),
    };
    const note = await v2Request<any>(context, 'put', `/v2/notes/${encodeURIComponent(args.note_id)}`, { params: { app_id }, body });
    return jsonResult(`Note ${args.note_id} updated`, compactNote(note));
  } catch (error) {
    return v2ErrorResult('update note', error);
  }
}

export async function handleDeleteNoteV2(context: ToolContext, args: any): Promise<ToolResult> {
  try {
    await v2Request<any>(context, 'delete', `/v2/notes/${encodeURIComponent(args.note_id)}`);
    return { content: [{ type: 'text', text: `Note ${args.note_id} deleted.` }] };
  } catch (error) {
    return v2ErrorResult('delete note', error);
  }
}
