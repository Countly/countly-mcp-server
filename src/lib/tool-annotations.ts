/**
 * MCP tool annotations (spec 2025-03-26+): behavior hints clients use to decide
 * which tool calls need user confirmation. Without them clients must assume
 * every tool may be destructive, so reads get prompted like deletes.
 *
 * Derived from each tool's CRUD label in TOOL_CATEGORIES, with per-tool
 * overrides where the label alone gives the wrong hint.
 */

import { TOOL_CATEGORIES, getCallShapes, hasRestrictedArguments, type CrudOperation, type ToolsConfig } from './tools-config.js';

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

/**
 * Status setters: repeating the call changes nothing more. They stay
 * destructive, since destructiveHint: false means "only additive updates"
 * and these overwrite state (pausing a journey also clears queued content).
 */
const SETS_STATUS: ToolAnnotations = { idempotentHint: true };
/** Tools that deliver emails or call webhooks, now or on a schedule/trigger/activation */
const SENDS_OUTSIDE: ToolAnnotations = { openWorldHint: true };

const OVERRIDES: Record<string, ToolAnnotations> = {
  crashes_resolve: SETS_STATUS,
  crashes_unresolve: SETS_STATUS,
  crashes_hide: SETS_STATUS,
  crashes_show: SETS_STATUS,
  journeys_pause: SETS_STATUS,
  filtering_rules_toggle_status: SETS_STATUS,
  // Activating a journey lets its call-webhook blocks (Platform) call arbitrary URLs
  journeys_publish: SENDS_OUTSIDE,
  journeys_resume: { ...SETS_STATUS, ...SENDS_OUTSIDE },

  // Labelled 'C' but also update an existing record: an alert when
  // alert_config._id is given, an event key's name/description/category
  alerts_create: { destructiveHint: true, ...SENDS_OUTSIDE },
  events_create: { destructiveHint: true },
  // Upserts by key (default "unnamed_formula"), replacing a saved formula
  formulas_save: { destructiveHint: true },
  // Labelled 'R', but mode "saved" persists the formula like formulas_save.
  // Dropped when the tools configuration refuses mode "saved".
  formulas_run: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
  // Rules are enabled by default, so creating one starts dropping incoming data
  filtering_rules_create: { destructiveHint: true },
  // Deletes whatever data matches at call time, so a retry removes records
  // that arrived (or started matching) since the first call
  apps_reset: { idempotentHint: false },
  app_users_delete: { idempotentHint: false },
  // Not a dry run: the configured effects really execute (emails, webhooks, custom code)
  hooks_test: { destructiveHint: true, ...SENDS_OUTSIDE },
  // Enabled by default, and its effects can call any URL or run custom code
  hooks_create: { destructiveHint: true, ...SENDS_OUTSIDE },
  hooks_update: SENDS_OUTSIDE,
  email_reports_send: SENDS_OUTSIDE,
  email_reports_core_create: SENDS_OUTSIDE,
  email_reports_dashboard_create: SENDS_OUTSIDE,
  email_reports_update: SENDS_OUTSIDE,
  // Optional `emails` are notified about the note
  notes_create: SENDS_OUTSIDE,
  // send_email_invitation emails the users the dashboard is shared with
  dashboards_create: SENDS_OUTSIDE,
  // Labelled 'C' (a new version), but it changes what every embedding website
  // shows, and the first publish fixes the slug for good
  stage_scenes_publish: { destructiveHint: true },
  stage_scenes_set_latest: SETS_STATUS,
  stage_scenes_unpublish: SETS_STATUS,
  stage_scenes_restore: SETS_STATUS,
};

function getToolOperation(toolName: string): CrudOperation | undefined {
  for (const category of Object.values(TOOL_CATEGORIES)) {
    if (toolName in category.operations) {
      return category.operations[toolName];
    }
  }
  return undefined;
}

/**
 * Annotations for a tool, or undefined when it has no CRUD label. With a tools
 * configuration that refuses the tool's side-effecting arguments, only its
 * CRUD label applies.
 */
export function getToolAnnotations(toolName: string, config?: ToolsConfig): ToolAnnotations | undefined {
  const operation = getToolOperation(toolName);
  if (!operation) {
    return undefined;
  }
  if (config && hasRestrictedArguments(toolName, config)) {
    return { ...BY_OPERATION[operation] };
  }
  return { ...BY_OPERATION[operation], ...writesByArguments(toolName, operation, config), ...OVERRIDES[toolName] };
}

/**
 * A tool labelled as a read whose arguments can make it write (see
 * TOOL_OPERATION_RULES: retention with save_report, formulas_run saving) is
 * not read-only while the configuration allows that write.
 */
function writesByArguments(toolName: string, operation: CrudOperation, config?: ToolsConfig): ToolAnnotations {
  if (operation !== 'R') {
    return {};
  }
  const category = Object.entries(TOOL_CATEGORIES).find(([, data]) => toolName in data.operations)?.[0];
  const allowed = category && config ? config[category] : undefined;
  const writes = (getCallShapes(toolName) ?? []).some((shape) =>
    shape.some((op) => op !== 'R') && (!config || (!!allowed && shape.every((op) => allowed.has(op)))));
  return writes ? { readOnlyHint: false, idempotentHint: false } : {};
}

/** Copy of the tool definition with its annotations attached */
export function withAnnotations<T extends { name: string }>(
  tool: T,
  config?: ToolsConfig
): T & { annotations?: ToolAnnotations } {
  const annotations = getToolAnnotations(tool.name, config);
  return annotations ? { ...tool, annotations } : tool;
}
