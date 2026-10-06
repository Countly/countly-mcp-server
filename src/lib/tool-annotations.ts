/**
 * MCP tool annotations (spec 2025-03-26+): behavior hints clients use to decide
 * which tool calls need user confirmation. Without them clients must assume
 * every tool may be destructive, so reads get prompted like deletes.
 *
 * Derived from each tool's CRUD label in TOOL_CATEGORIES, with per-tool
 * overrides where the label alone gives the wrong hint.
 */

import { TOOL_CATEGORIES, type CrudOperation } from './tools-config.js';

export interface ToolAnnotations {
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
}

// openWorldHint is false by default: every tool talks only to the configured
// Countly server. Tools that send or schedule messages outside it override it.
const BY_OPERATION: Record<CrudOperation, ToolAnnotations> = {
  R: { readOnlyHint: true, openWorldHint: false },
  C: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  // Updates replace existing configuration, so treat them as destructive
  U: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
  D: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
};

/** Status setters that are undone by their counterpart tool */
const REVERSIBLE_STATUS: ToolAnnotations = { destructiveHint: false, idempotentHint: true };
/** Tools that deliver emails or call webhooks, now or on a schedule/trigger */
const SENDS_OUTSIDE: ToolAnnotations = { openWorldHint: true };

const OVERRIDES: Record<string, ToolAnnotations> = {
  crashes_resolve: REVERSIBLE_STATUS,
  crashes_unresolve: REVERSIBLE_STATUS,
  crashes_hide: REVERSIBLE_STATUS,
  crashes_show: REVERSIBLE_STATUS,
  journeys_pause: REVERSIBLE_STATUS,
  journeys_resume: REVERSIBLE_STATUS,
  filtering_rules_toggle_status: REVERSIBLE_STATUS,

  // Labelled 'C' but also update an existing record: an alert when
  // alert_config._id is given, an event key's name/description/category
  alerts_create: { destructiveHint: true, ...SENDS_OUTSIDE },
  events_create: { destructiveHint: true },
  // Not a dry run: the configured effects really execute (emails, webhooks, custom code)
  hooks_test: { destructiveHint: true, ...SENDS_OUTSIDE },
  hooks_create: SENDS_OUTSIDE,
  hooks_update: SENDS_OUTSIDE,
  email_reports_send: SENDS_OUTSIDE,
  email_reports_core_create: SENDS_OUTSIDE,
  email_reports_dashboard_create: SENDS_OUTSIDE,
  email_reports_update: SENDS_OUTSIDE,
  // Optional `emails` are notified about the note
  notes_create: SENDS_OUTSIDE,
  // send_email_invitation emails the users the dashboard is shared with
  dashboards_create: SENDS_OUTSIDE,
};

function getToolOperation(toolName: string): CrudOperation | undefined {
  for (const category of Object.values(TOOL_CATEGORIES)) {
    if (toolName in category.operations) {
      return category.operations[toolName];
    }
  }
  return undefined;
}

/** Annotations for a tool, or undefined when it has no CRUD label */
export function getToolAnnotations(toolName: string): ToolAnnotations | undefined {
  const operation = getToolOperation(toolName);
  if (!operation) {
    return undefined;
  }
  return { ...BY_OPERATION[operation], ...OVERRIDES[toolName] };
}

/** Copy of the tool definition with its annotations attached */
export function withAnnotations<T extends { name: string }>(tool: T): T & { annotations?: ToolAnnotations } {
  const annotations = getToolAnnotations(tool.name);
  return annotations ? { ...tool, annotations } : tool;
}
