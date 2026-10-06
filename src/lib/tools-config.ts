/**
 * Tools configuration and filtering based on environment variables
 * Allows controlling which tool categories and CRUD operations are available
 */

export type CrudOperation = 'C' | 'R' | 'U' | 'D';

export interface ToolsConfig {
  [category: string]: Set<CrudOperation>;
}

/**
 * User-facing grouping of tool categories. Hosts that embed the server (see
 * src/library.ts) show these to people granting access and use them to group
 * usage stats, so they name product areas rather than internal categories.
 */
export type ToolArea =
  | 'Events'
  | 'Funnels'
  | 'Retention'
  | 'Users'
  | 'Crashes'
  | 'Dashboards'
  | 'Remote config'
  | 'Content'
  | 'Settings'
  | 'Other';

export const TOOL_AREAS: readonly ToolArea[] = [
  'Events',
  'Funnels',
  'Retention',
  'Users',
  'Crashes',
  'Dashboards',
  'Remote config',
  'Content',
  'Settings',
  'Other',
];

export interface ToolCategoryConfig {
  area: ToolArea; // User-facing grouping, see ToolArea
  operations: Record<string, CrudOperation>;
  requiresPlugin?: string; // Optional plugin name required for this category
  availableByDefault?: boolean; // If false, requires plugin check (default: true)
}

/**
 * Tool categories and their operations mapping
 * 
 * Categories can be marked with:
 * - requiresPlugin: Name of the plugin required (e.g., "alerts", "crashes")
 * - availableByDefault: If false, requires checking /o/system/plugins first
 */
export const TOOL_CATEGORIES: Record<string, ToolCategoryConfig> = {
  core: {
    area: 'Other',
    operations: {
      'ping': 'R',
      'get_version': 'R',
      'get_plugins': 'R',
    },
    availableByDefault: true,
  },
  apps: {
    area: 'Settings',
    operations: {
      'apps_list': 'R',
      'apps_get_by_name': 'R',
      'apps_create': 'C',
      'apps_update': 'U',
      'apps_delete': 'D',
      'apps_reset': 'D',
    },
    availableByDefault: true,
  },
  analytics: {
    area: 'Users',
    operations: {
      'query_data': 'R',
      'app_analytics_summary': 'R',
      'slipping_users': 'R',
      'session_frequency': 'R',
      'user_loyalty': 'R',
      'session_durations': 'R',
    },
    availableByDefault: true,
  },
  crashes: {
    area: 'Crashes',
    operations: {
      'crash_groups_list': 'R',
      'crashes_stats_get': 'R',
      'crashes_get': 'R',
      'crashes_comment_add': 'C',
      'crashes_comment_update': 'U',
      'crashes_comment_delete': 'D',
      'crashes_resolve': 'U',
      'crashes_unresolve': 'U',
      'crashes_hide': 'U',
      'crashes_show': 'U',
    },
    requiresPlugin: 'crashes',
    availableByDefault: false,
  },
  notes: {
    area: 'Other',
    operations: {
      'notes_list': 'R',
      'notes_create': 'C',
      'notes_delete': 'D',
    },
    availableByDefault: true,
  },
  events: {
    area: 'Events',
    operations: {
      'events_create': 'C',
      'events_list': 'R',
      'events_delete': 'D',
    },
    availableByDefault: true,
  },
  alerts: {
    area: 'Other',
    operations: {
      'alerts_list': 'R',
      'alerts_create': 'C', // Also handles updates
      'alerts_delete': 'D',
    },
    requiresPlugin: 'alerts',
    availableByDefault: false,
  },
  views: {
    area: 'Events',
    operations: {
      'views_table': 'R',
      'views_data': 'R',
    },
    requiresPlugin: 'views',
    availableByDefault: false,
  },
  database: {
    area: 'Settings',
    operations: {
      'databases_query': 'R',
      'databases_list': 'R',
      'databases_document': 'R',
      'collections_aggregate': 'R',
      'collections_indexes': 'R',
      'databases_stats': 'R',
    },
    requiresPlugin: 'dbviewer',
    availableByDefault: false,
  },
  dashboard_users: {
    area: 'Settings',
    operations: {
      'dashboard_users': 'R',
    },
    availableByDefault: true,
  },
  app_users: {
    area: 'Users',
    operations: {
      'app_users_create': 'C',
      'app_users_update': 'U',
      'app_users_delete': 'D',
    },
    availableByDefault: true,
  },
  drill: {
    area: 'Events',
    operations: {
      'drill_bookmarks_list': 'R',
      'drill_bookmarks_create': 'C',
      'drill_bookmarks_delete': 'D',
      'queriable_fields_list': 'R',
    },
    requiresPlugin: 'drill',
    availableByDefault: false,
  },
  metadata: {
    area: 'Events',
    operations: {
      // metadata_get returns event definitions, built-in event segments,
      // and system fields even without the drill plugin (drill just adds
      // user/custom/campaign-property breakdowns on top). Keeping it in
      // the drill category hid it from servers without drill installed
      // even though the handler degrades gracefully.
      'metadata_get': 'R',
    },
    availableByDefault: true,
  },
  user_profiles: {
    area: 'Users',
    operations: {
      'user_profiles_query': 'R',
      'user_profiles_breakdown': 'R',
      'user_profiles_get': 'R',
    },
    requiresPlugin: 'users',
    availableByDefault: false,
  },
  cohorts: {
    area: 'Users',
    operations: {
      'cohorts_list': 'R',
      'cohorts_data': 'R',
      'cohorts_create': 'C',
      'cohorts_update': 'U',
      'cohorts_delete': 'D',
    },
    requiresPlugin: 'cohorts',
    availableByDefault: false,
  },
  funnels: {
    area: 'Funnels',
    operations: {
      'funnels_list': 'R',
      'funnels_data': 'R',
      'funnels_step_users': 'R',
      'funnels_dropoff_users': 'R',
      'funnels_create': 'C',
      'funnels_update': 'U',
      'funnels_delete': 'D',
    },
    requiresPlugin: 'funnels',
    availableByDefault: false,
  },
  formulas: {
    area: 'Events',
    operations: {
      'formulas_run': 'R',
      'formulas_list': 'R',
      'formulas_delete': 'D',
      'formulas_save': 'C',
    },
    requiresPlugin: 'formulas',
    availableByDefault: false,
  },
  live: {
    area: 'Users',
    operations: {
      'live_users': 'R',
      'live_metrics': 'R',
      'live_last_hour': 'R',
      'live_last_day': 'R',
      'live_last_30_days': 'R',
      'live_overall': 'R',
    },
    requiresPlugin: 'concurrent_users',
    availableByDefault: false,
  },
  retention: {
    area: 'Retention',
    operations: {
      'retention': 'R',
    },
    requiresPlugin: 'retention_segments',
    availableByDefault: false,
  },
  remote_config: {
    area: 'Remote config',
    operations: {
      'remote_configs_list': 'R',
      'remote_config_conditions_add': 'C',
      'remote_config_conditions_update': 'U',
      'remote_config_conditions_delete': 'D',
      'remote_config_parameters_add': 'C',
      'remote_config_parameters_update': 'U',
      'remote_config_parameters_delete': 'D',
    },
    requiresPlugin: 'remote-config',
    availableByDefault: false,
  },
  ab_testing: {
    area: 'Remote config',
    operations: {
      'ab_experiments_list': 'R',
      'ab_experiments_details': 'R',
      'ab_experiments_create': 'C',
      'ab_experiments_start': 'U',
      'ab_experiments_stop': 'U',
      'ab_experiments_delete': 'D',
    },
    requiresPlugin: 'ab-testing',
    availableByDefault: false,
  },
  logger: {
    area: 'Settings',
    operations: {
      'sdk_logs_list': 'R',
    },
    requiresPlugin: 'logger',
    availableByDefault: false,
  },
  sdks: {
    area: 'Settings',
    operations: {
      'sdk_stats_get': 'R',
      'sdk_config_get': 'R',
    },
    requiresPlugin: 'sdks',
    availableByDefault: false,
  },
  compliance_hub: {
    area: 'Users',
    operations: {
      'consents_stats': 'R',
      'consents_list': 'R',
      'consents_history_search': 'R',
    },
    requiresPlugin: 'compliance-hub',
    availableByDefault: false,
  },
  filtering_rules: {
    area: 'Settings',
    operations: {
      'filtering_rules_list': 'R',
      'filtering_rules_create': 'C',
      'filtering_rules_update': 'U',
      'filtering_rules_delete': 'D',
      'filtering_rules_toggle_status': 'U',
    },
    requiresPlugin: 'blocks',
    availableByDefault: false,
  },
  datapoint: {
    area: 'Settings',
    operations: {
      'datapoints_stats': 'R',
      'datapoints_top_apps': 'R',
      'datapoints_punch_card': 'R',
    },
    requiresPlugin: 'server-stats',
    availableByDefault: false,
  },
  server_logs: {
    area: 'Settings',
    operations: {
      'server_logs_files_list': 'R',
      'server_logs_contents': 'R',
    },
    requiresPlugin: 'errorlogs',
    availableByDefault: false,
  },
  email_reports: {
    area: 'Dashboards',
    operations: {
      'email_reports_list': 'R',
      'email_reports_core_create': 'C',
      'email_reports_dashboard_create': 'C',
      'email_reports_update': 'U',
      'email_reports_preview': 'R',
      'email_reports_send': 'C',
      'email_reports_delete': 'D',
    },
    requiresPlugin: 'reports',
    availableByDefault: false,
  },
  dashboards: {
    area: 'Dashboards',
    operations: {
      'dashboards_list': 'R',
      'dashboards_data': 'R',
      'dashboards_create': 'C',
      'dashboards_update': 'U',
      'dashboards_delete': 'D',
      'dashboards_widget_add': 'C',
      'dashboards_widget_update': 'U',
      'dashboards_widget_remove': 'D',
    },
    requiresPlugin: 'dashboards',
    availableByDefault: false,
  },
  times_of_day: {
    area: 'Users',
    operations: {
      'times_of_day': 'R',
    },
    requiresPlugin: 'times-of-day',
    availableByDefault: false,
  },
  hooks: {
    area: 'Settings',
    operations: {
      'hooks_list': 'R',
      // 'C', not 'R': /i/hook/test does not simulate the effects, it runs them.
      // A test call really delivers the configured emails, calls the configured
      // webhooks and executes the custom code, and Countly Server authorizes the
      // endpoint with validateCreate. Trying a configuration out before saving it
      // is part of authoring a hook, so it must not be reachable in a read-only
      // deployment. See the read-only guard in tests/tools-config.test.ts.
      'hooks_test': 'C',
      'hooks_create': 'C',
      'hooks_update': 'U',
      'hooks_delete': 'D',
    },
    requiresPlugin: 'hooks',
    availableByDefault: false,
  },
  journeys: {
    area: 'Content',
    operations: {
      'journeys_list': 'R',
      'journeys_get': 'R',
      'journeys_create': 'C',
      'journeys_update': 'U',
      'journeys_delete': 'D',
      'journeys_publish': 'U',
      'journeys_pause': 'U',
      'journeys_resume': 'U',
      'journeys_stats_summary': 'R',
      'journeys_stats_table': 'R',
      'journeys_stats_performance': 'R',
      'journeys_stats_uids': 'R',
      'journeys_block_reference': 'R',
    },
    requiresPlugin: 'journey_engine',
    availableByDefault: false,
  },
  content: {
    area: 'Content',
    operations: {
      'content_blocks_list': 'R',
      'content_blocks_get': 'R',
      'content_blocks_preview': 'R',
      'content_blocks_create': 'C',
      'content_blocks_update': 'U',
      'content_blocks_delete': 'D',
      'content_assets_list': 'R',
      'content_assets_upload': 'C',
      'content_assets_update': 'U',
      'content_assets_delete': 'D',
      'content_langs_list': 'R',
    },
    requiresPlugin: 'content',
    availableByDefault: false,
  },
};

/**
 * Tools that need Countly global-admin rights (or act server-wide rather than
 * on one app). Used only by the embedded library entry point (src/library.ts),
 * which hides them unless the caller's grant allows admin tools. Stdio and
 * standalone HTTP modes do not read this; Countly itself still enforces the
 * rights on every call.
 *
 * Decided from what each Countly endpoint requires:
 * - apps_create, apps_delete, apps_reset: /i/apps/create|delete|reset are
 *   validateUserForGlobalAdmin.
 * - apps_update: /i/apps/update needs app-admin with an app_id and global
 *   admin without one; it changes app settings (name, timezone, country) for
 *   everyone using the app, so it is treated as administration.
 * - get_plugins: /o/system/plugins is validateUserForGlobalAdmin (the list of
 *   installed modules is treated as sensitive).
 * - dashboard_users: /o/users/all is validateUserForGlobalAdmin.
 * - databases_* and collections_* (dbviewer /o/db): raw database and
 *   collection browsing, outside any per-app scope a host may apply.
 * - server_logs_* (errorlogs /o/errorlogs): global admin only.
 * - datapoints_* (server-stats): server-wide usage and billing metrics; a
 *   non-admin sees their own apps, but the data is not limited to the apps a
 *   host grant names, so it is kept with the other server administration.
 */
export const ADMIN_ONLY_TOOLS: ReadonlySet<string> = new Set<string>([
  'apps_create',
  'apps_update',
  'apps_delete',
  'apps_reset',
  'get_plugins',
  'dashboard_users',
  'databases_query',
  'databases_list',
  'databases_document',
  'collections_aggregate',
  'collections_indexes',
  'databases_stats',
  'server_logs_files_list',
  'server_logs_contents',
  'datapoints_stats',
  'datapoints_top_apps',
  'datapoints_punch_card',
]);

/**
 * How a tool call's arguments change the operation it performs.
 *
 * TOOL_CATEGORIES gives every tool one static operation. That is the whole
 * story for most tools, but a few do something else depending on their
 * arguments: a read that also persists, a create that also updates. For those
 * tools the rule below derives the operation(s) a given call needs, and every
 * caller that enforces CRUD (library mode per call, the standalone modes per
 * call, the host via `requiredOperations`) checks the EFFECTIVE operations,
 * not the static one.
 *
 * `possible` is every operation the tool can perform. A rule that throws is
 * treated as needing all of them (fail closed), and a rule must only return
 * the read-only answer when the arguments prove the call does not write.
 *
 * Audit of every handler in src/tools/*.ts (2026-10) for argument-dependent
 * behaviour - save/persist flags, upsert by id, modes, actions, delete flags:
 *
 * Argument-dependent, ruled below:
 * - formulas_run: `mode` other than "unsaved" (the schema also offers "saved",
 *   documented as persisting the formula with formulaMeta) and `report_name`
 *   (names a stored report) need C as well as R. Only an absent/empty or
 *   "unsaved" mode with no report_name is a pure read.
 * - retention: a truthy `save_report` dispatches the calculation to the report
 *   manager as a saved report (Countly treats any truthy value as "save"), so
 *   it needs C as well as R.
 * - alerts_create: /i/alert/save updates the alert named by
 *   `alert_config._id` and creates one otherwise, so an `_id` needs U and no
 *   `_id` needs C. `alert_config` may arrive as a JSON string; if it cannot be
 *   parsed the call needs both.
 * - events_create: /i/events/edit_map overwrites the name, description and
 *   category of an event key that already exists, and the arguments cannot
 *   prove the key is new, so every call needs C and U.
 *
 * Checked and not argument-dependent (static operation is accurate):
 * - dashboards_data `action` is a "refresh" hint for /o/dashboards, a read.
 * - drill_bookmarks_list `app_level`/`global`, journeys_stats_* `status` and
 *   `task_id`, query_data `query_type`/`method`, views_* and funnels_* filter
 *   options only select what is read.
 * - crashes_get: Countly clears the group's "new" flag when it is viewed; it
 *   authorizes that endpoint as a read and no argument changes it.
 * - collections_aggregate / databases_query: dbviewer rejects pipeline stages
 *   outside its operator allow-list (no $out/$merge), so they stay reads.
 * - email_reports_preview renders without sending; email_reports_send (C)
 *   sends.
 * - email_reports_update `report_data` merges extra fields into the same
 *   update (U); journeys_publish `status`, filtering_rules_toggle_status and
 *   *_update `enabled`/`status` flags are all updates (U).
 * - app_users_delete `force` only skips a safety check on a delete (D).
 * - hooks_test is already C: it really runs the hook's effects.
 * - dashboards_create `send_email_invitation`, notes_create `emails` and
 *   email_reports_* recipients are part of the create/update itself.
 * - formulas_save, notes_create, content_blocks_create, journeys_create,
 *   cohorts_create, funnels_create, drill_bookmarks_create and the other
 *   *_create tools build their payload from named fields and never pass an
 *   id, so they cannot be turned into an update; the *_update tools always
 *   address an existing record (U).
 */
export interface OperationRule {
  /** Every operation the tool can perform. */
  possible: readonly CrudOperation[];
  /** The operations this call needs, derived from its arguments. */
  operationsFor: (args: Record<string, unknown>) => CrudOperation[];
}

function parseMaybeJson(value: unknown): { ok: boolean; value: unknown } {
  if (typeof value !== 'string') {
    return { ok: true, value };
  }
  try {
    return { ok: true, value: JSON.parse(value) };
  } catch {
    return { ok: false, value: undefined };
  }
}

function isTruthyFlag(value: unknown): boolean {
  if (value === undefined || value === null || value === false || value === 0 || value === '') {
    return false;
  }
  if (typeof value === 'string' && ['false', '0'].includes(value.trim().toLowerCase())) {
    return false;
  }
  return true;
}

export const TOOL_OPERATION_RULES: Readonly<Record<string, OperationRule>> = {
  formulas_run: {
    possible: ['R', 'C'],
    operationsFor: (args) => {
      const mode = args.mode;
      const readOnlyMode = mode === undefined || mode === null || mode === '' || mode === 'unsaved';
      const namesReport = args.report_name !== undefined && args.report_name !== null && args.report_name !== '';
      return readOnlyMode && !namesReport ? ['R'] : ['R', 'C'];
    },
  },
  retention: {
    possible: ['R', 'C'],
    operationsFor: (args) => (isTruthyFlag(args.save_report) ? ['R', 'C'] : ['R']),
  },
  alerts_create: {
    possible: ['C', 'U'],
    operationsFor: (args) => {
      const parsed = parseMaybeJson(args.alert_config);
      if (!parsed.ok) {
        return ['C', 'U'];
      }
      const config = parsed.value;
      if (config === undefined || config === null) {
        return ['C'];
      }
      if (typeof config !== 'object' || Array.isArray(config)) {
        return ['C', 'U'];
      }
      const id = (config as Record<string, unknown>)._id;
      return id === undefined || id === null || id === '' ? ['C'] : ['U'];
    },
  },
  events_create: {
    possible: ['C', 'U'],
    operationsFor: () => ['C', 'U'],
  },
};

/**
 * How a tool relates to an app allow-list (library mode, `context.apps`).
 *
 * - `app`: every request the tool makes is confined to the app(s) named in
 *   its arguments, which library mode validates against the allow-list (top
 *   level app_id / app_name and every nested app field): the Countly endpoint
 *   filters or authorizes by that app_id, a per-app collection, or an id looked
 *   up together with the app.
 * - `safe`: exposes no app data, or its output is already limited to the
 *   allowed apps by library mode.
 * - `unscoped`: can read or change another app's data (cross-app lists,
 *   records addressed by id without checking they belong to app_id, server
 *   administration, or not provably confined). Hidden while an allow-list is
 *   set. When unsure, a tool is `unscoped` (fail closed).
 *
 * Decided from the Countly endpoints each handler calls (audit 2026-10,
 * countly-platform plugins/ and api/); the reason is noted per tool.
 */
export type ToolAppScope = 'app' | 'safe' | 'unscoped';

export const TOOL_APP_SCOPE: Readonly<Record<string, ToolAppScope>> = {
  // core
  ping: 'safe', // /o/ping, no app data
  get_version: 'safe', // /o/system/version, no app data
  get_plugins: 'unscoped', // /o/system/plugins, server-wide administration

  // apps
  apps_list: 'safe', // library getApps() filters /o/apps/mine to the allow-list
  apps_get_by_name: 'safe', // same filtered app list
  apps_create: 'unscoped', // creates an app that cannot be in the allow-list
  apps_update: 'app', // /i/apps/update writes args.app_id, which the tool sets to the validated app
  apps_delete: 'app', // /i/apps/delete on args.app_id = validated app
  apps_reset: 'app', // /i/apps/reset on args.app_id = validated app

  // analytics: per-app fetches keyed by params.app_id
  query_data: 'app',
  app_analytics_summary: 'app',
  slipping_users: 'app',
  session_frequency: 'app',
  user_loyalty: 'app',
  session_durations: 'app',

  // crashes: everything runs on the per-app collection app_crashgroups<app_id>
  crash_groups_list: 'app',
  crashes_stats_get: 'app',
  crashes_get: 'app',
  crashes_comment_add: 'app',
  crashes_comment_update: 'app',
  crashes_comment_delete: 'app',
  crashes_resolve: 'app',
  crashes_unresolve: 'app',
  crashes_hide: 'app',
  crashes_show: 'app',

  // notes
  notes_list: 'app', // the tool always sends notes_apps=[app_id]; query is app_id $in that list
  notes_create: 'app', // note.app_id = qstring app_id
  notes_delete: 'unscoped', // no app argument; /i/notes/delete finds the note by _id in any app

  // events: events{_id: app_id}
  events_create: 'app',
  events_list: 'app',
  events_delete: 'app',

  // alerts
  alerts_list: 'unscoped', // /o/alert/list lists the member's alerts across apps
  alerts_create: 'unscoped', // with alert_config._id, /i/alert/save updates any alert found by _id alone
  alerts_delete: 'unscoped', // /i/alert/delete removes by _id (and creator), never checks the app

  // views: app_viewdata collections keyed by app_id
  views_table: 'app',
  views_data: 'app',

  // database (dbviewer /o/db ignores app_id; any collection of any app)
  databases_query: 'unscoped',
  databases_list: 'unscoped',
  databases_document: 'unscoped',
  collections_aggregate: 'unscoped',
  collections_indexes: 'unscoped',
  databases_stats: 'unscoped',

  // dashboard users: /o/users/all, every user of the server
  dashboard_users: 'unscoped',

  // app users: app_users<app_id>
  app_users_create: 'app',
  app_users_update: 'app',
  app_users_delete: 'app',

  // drill: bookmarks filtered by app_id / md5(app_id+event); meta keyed by app_id
  drill_bookmarks_list: 'app',
  drill_bookmarks_create: 'app',
  drill_bookmarks_delete: 'app', // {_id, app_id} on find and remove
  queriable_fields_list: 'app',
  metadata_get: 'app',

  // user profiles: app_users<app_id>
  user_profiles_query: 'app',
  user_profiles_breakdown: 'app',
  user_profiles_get: 'app',

  // cohorts: every query includes app_id
  cohorts_list: 'app',
  cohorts_data: 'app',
  cohorts_create: 'app',
  cohorts_update: 'app', // findOne {_id, app_id} before the edit
  cohorts_delete: 'app',

  // funnels: {_id, app_id}
  funnels_list: 'app',
  funnels_data: 'app',
  funnels_step_users: 'app',
  funnels_dropoff_users: 'app',
  funnels_create: 'app',
  funnels_update: 'app',
  funnels_delete: 'app',

  // formulas: {app: app_id} / {_id, app}
  formulas_run: 'app',
  formulas_list: 'app',
  formulas_delete: 'app',
  formulas_save: 'app',

  // live: the tool pins r_apps=[app_id]
  live_users: 'app',
  live_metrics: 'app',
  live_last_hour: 'app',
  live_last_day: 'app',
  live_last_30_days: 'app',
  live_overall: 'app',

  // retention: query.a = app_id, cache key includes app_id
  retention: 'app',

  // remote config: per-app collections, ids looked up inside them
  remote_configs_list: 'app',
  remote_config_conditions_add: 'app',
  remote_config_conditions_update: 'app',
  remote_config_conditions_delete: 'app',
  remote_config_parameters_add: 'app',
  remote_config_parameters_update: 'app',
  remote_config_parameters_delete: 'app',

  // A/B testing: per-app collection ab_testing_experiments<app_id>
  ab_experiments_list: 'app',
  ab_experiments_details: 'app',
  ab_experiments_create: 'app',
  ab_experiments_start: 'app',
  ab_experiments_stop: 'app',
  ab_experiments_delete: 'app',

  // logger / sdks: logs<app_id>, sdk_configs{_id: app_id}, per-app metrics
  sdk_logs_list: 'app',
  sdk_stats_get: 'app',
  sdk_config_get: 'app',

  // compliance hub: queries by app_id
  consents_stats: 'app',
  consents_list: 'app',
  consents_history_search: 'app',

  // filtering rules: stored inside apps{_id: app_id}
  filtering_rules_list: 'app',
  filtering_rules_create: 'app',
  filtering_rules_update: 'app',
  filtering_rules_delete: 'app',
  filtering_rules_toggle_status: 'app',

  // server stats: all of the member's apps (or the whole server)
  datapoints_stats: 'unscoped', // selected_app optional; omitted = every app
  datapoints_top_apps: 'unscoped',
  datapoints_punch_card: 'unscoped',

  // server logs: server-wide, app_id only used for the permission check
  server_logs_files_list: 'unscoped',
  server_logs_contents: 'unscoped',

  // email reports
  email_reports_list: 'unscoped', // /o/reports/all lists by user across apps
  email_reports_core_create: 'app', // report apps and selectedEvents come from validated arguments
  email_reports_dashboard_create: 'unscoped', // targets a dashboard, authorized by dashboard sharing
  email_reports_update: 'unscoped', // report found by {_id, user}, app_id never compared
  email_reports_preview: 'unscoped', // same lookup; renders the report's apps
  email_reports_send: 'unscoped', // same lookup
  email_reports_delete: 'unscoped', // same lookup

  // dashboards: not per app; dashboard/widget ids, widgets can name any app
  dashboards_list: 'unscoped',
  dashboards_data: 'unscoped',
  dashboards_create: 'unscoped',
  dashboards_update: 'unscoped',
  dashboards_delete: 'unscoped',
  dashboards_widget_add: 'unscoped',
  dashboards_widget_update: 'unscoped',
  dashboards_widget_remove: 'unscoped',

  // times of day: a = app_id
  times_of_day: 'app',

  // hooks
  hooks_list: 'unscoped', // /o/hook/list lists across the member's apps
  hooks_test: 'unscoped', // only qstring app_id is authorized; runs real effects from an arbitrary config
  hooks_create: 'unscoped', // trigger configuration can reference other apps' records (not provably confined)
  hooks_update: 'unscoped', // hook found by _id alone, rights checked on its stored apps
  hooks_delete: 'unscoped', // hook found and removed by _id

  // journeys: {_id, appId}
  journeys_list: 'app',
  journeys_get: 'app',
  journeys_create: 'app',
  journeys_update: 'app',
  journeys_delete: 'app',
  journeys_publish: 'app',
  journeys_pause: 'app',
  journeys_resume: 'app',
  journeys_stats_summary: 'app',
  journeys_stats_table: 'unscoped', // task_id returns long_tasks.findOne({_id}) with no app filter
  journeys_stats_performance: 'app',
  journeys_stats_uids: 'app',
  journeys_block_reference: 'safe', // static documentation, no request

  // content: {_id, app} / content_assets<app_id>
  content_blocks_list: 'app',
  content_blocks_get: 'app',
  content_blocks_preview: 'app',
  content_blocks_create: 'app',
  content_blocks_update: 'app',
  content_blocks_delete: 'app',
  content_assets_list: 'app',
  content_assets_upload: 'app',
  content_assets_update: 'app',
  content_assets_delete: 'app',
  content_langs_list: 'app',
};

const ALL_CRUD: readonly CrudOperation[] = ['C', 'R', 'U', 'D'];

/** The static operation of a tool from TOOL_CATEGORIES, or undefined. */
export function getToolOperation(toolName: string): CrudOperation | undefined {
  for (const data of Object.values(TOOL_CATEGORIES)) {
    if (Object.prototype.hasOwnProperty.call(data.operations, toolName)) {
      return data.operations[toolName];
    }
  }
  return undefined;
}

/** Every operation a tool can perform, whatever its arguments. */
export function getPossibleOperations(toolName: string): CrudOperation[] | undefined {
  const base = getToolOperation(toolName);
  if (!base) {
    return undefined;
  }
  const rule = Object.prototype.hasOwnProperty.call(TOOL_OPERATION_RULES, toolName)
    ? TOOL_OPERATION_RULES[toolName]
    : undefined;
  return rule ? ALL_CRUD.filter((op) => rule.possible.includes(op)) : [base];
}

/**
 * The operations one call of `toolName` with `args` needs (all of them must
 * be granted). Undefined for an unknown tool. Fails closed: if the tool's
 * rule throws or returns nothing usable, every possible operation is needed.
 */
export function getEffectiveOperations(toolName: string, args: unknown): CrudOperation[] | undefined {
  const possible = getPossibleOperations(toolName);
  if (!possible) {
    return undefined;
  }
  const rule = Object.prototype.hasOwnProperty.call(TOOL_OPERATION_RULES, toolName)
    ? TOOL_OPERATION_RULES[toolName]
    : undefined;
  if (!rule) {
    return possible;
  }
  const input = args && typeof args === 'object' && !Array.isArray(args)
    ? (args as Record<string, unknown>)
    : {};
  try {
    const ops = rule.operationsFor(input);
    if (!Array.isArray(ops) || ops.length === 0 || ops.some((op) => !ALL_CRUD.includes(op))) {
      return possible;
    }
    return ALL_CRUD.filter((op) => ops.includes(op));
  } catch {
    return possible;
  }
}

/**
 * Parse CRUD permissions from environment variable
 * Format: "CRUD" or any combination like "CR", "RU", "R", etc.
 * Default is "CRUD" (all operations allowed)
 */
export function parseCrudPermissions(value: string | undefined): Set<CrudOperation> {
  if (!value || value.toLowerCase() === 'all' || value === '*') {
    return new Set<CrudOperation>(['C', 'R', 'U', 'D']);
  }
  
  if (value.toLowerCase() === 'none' || value === '') {
    return new Set<CrudOperation>();
  }
  
  const operations = new Set<CrudOperation>();
  const upper = value.toUpperCase();
  
  if (upper.includes('C')) {
operations.add('C');
}
  if (upper.includes('R')) {
operations.add('R');
}
  if (upper.includes('U')) {
operations.add('U');
}
  if (upper.includes('D')) {
operations.add('D');
}
  
  return operations;
}

/**
 * Load tools configuration from environment variables
 * 
 * Environment variable format:
 * - COUNTLY_TOOLS_{CATEGORY} = CRUD operations (e.g., "CRUD", "CR", "R", "NONE")
 * - COUNTLY_TOOLS_ALL = Default for all categories
 * 
 * Examples:
 *   COUNTLY_TOOLS_ALL=CRUD          # All operations for all categories (default)
 *   COUNTLY_TOOLS_APPS=CR           # Only Create and Read for apps
 *   COUNTLY_TOOLS_DATABASE=R        # Only Read for database
 *   COUNTLY_TOOLS_CRASHES=NONE      # Disable all crash tools
 */
export function loadToolsConfig(env: NodeJS.ProcessEnv = process.env): ToolsConfig {
  const config: ToolsConfig = {};
  
  // Get default permissions for all categories
  const defaultPermissions = parseCrudPermissions(env.COUNTLY_TOOLS_ALL);
  
  // Apply default to all categories
  for (const category of Object.keys(TOOL_CATEGORIES)) {
    config[category] = new Set(defaultPermissions);
  }
  
  // Override with specific category permissions
  for (const category of Object.keys(TOOL_CATEGORIES)) {
    const envKey = `COUNTLY_TOOLS_${category.toUpperCase()}`;
    if (env[envKey]) {
      config[category] = parseCrudPermissions(env[envKey]);
    }
  }
  
  return config;
}

/**
 * Check if a specific tool is allowed based on configuration
 */
export function isToolAllowed(toolName: string, config: ToolsConfig): boolean {
  // A tool is listed when its plainest call (no arguments) is allowed; see
  // isToolCallAllowed for the per-call check of argument-dependent tools.
  return isToolCallAllowed(toolName, {}, config);
}

/**
 * Check one call: every operation the call needs, given its arguments (see
 * TOOL_OPERATION_RULES), must be allowed for the tool's category.
 */
export function isToolCallAllowed(toolName: string, args: unknown, config: ToolsConfig): boolean {
  // Find which category this tool belongs to
  for (const [category, categoryData] of Object.entries(TOOL_CATEGORIES)) {
    if (Object.prototype.hasOwnProperty.call(categoryData.operations, toolName)) {
      const required = getEffectiveOperations(toolName, args) ?? [categoryData.operations[toolName]];
      const allowedOperations = config[category];
      return !!allowedOperations && required.every((op) => allowedOperations.has(op));
    }
  }

  // If tool is not in any category, allow it by default
  return true;
}

/**
 * Filter tool definitions based on configuration
 */
export function filterTools<T extends { name: string }>(
  tools: T[],
  config: ToolsConfig
): T[] {
  return tools.filter(tool => isToolAllowed(tool.name, config));
}

/**
 * Get human-readable configuration summary
 */
export function getConfigSummary(config: ToolsConfig): string {
  const lines: string[] = ['Tools Configuration:'];
  
  for (const [category, operations] of Object.entries(config)) {
    const ops = Array.from(operations).sort().join('');
    const status = ops.length === 0 ? 'DISABLED' : 
                   ops === 'CDRU' ? 'ALL' : ops;
    lines.push(`  ${category}: ${status}`);
  }
  
  return lines.join('\n');
}

/**
 * Check if a category requires plugin verification
 */
export function requiresPluginCheck(category: string): boolean {
  const categoryConfig = TOOL_CATEGORIES[category];
  return categoryConfig?.availableByDefault === false;
}

/**
 * Get the required plugin name for a category
 */
export function getRequiredPlugin(category: string): string | undefined {
  return TOOL_CATEGORIES[category]?.requiresPlugin;
}

/**
 * Check if a category is available based on installed plugins
 */
export function isCategoryAvailable(category: string, installedPlugins: string[]): boolean {
  const categoryConfig = TOOL_CATEGORIES[category];
  
  if (!categoryConfig) {
    return false;
  }
  
  // If available by default, no plugin check needed
  if (categoryConfig.availableByDefault !== false) {
    return true;
  }
  
  // Check if required plugin is installed
  const requiredPlugin = categoryConfig.requiresPlugin;
  if (!requiredPlugin) {
    // No plugin specified but not available by default - should not happen
    return false;
  }
  
  return installedPlugins.includes(requiredPlugin);
}

/**
 * Filter tool definitions based on configuration and available plugins
 */
export function filterToolsByPlugins<T extends { name: string }>(
  tools: T[],
  config: ToolsConfig,
  installedPlugins: string[]
): T[] {
  return tools.filter(tool => {
    // First check if tool is allowed by config
    if (!isToolAllowed(tool.name, config)) {
      return false;
    }
    
    // Find which category this tool belongs to
    for (const [category, categoryData] of Object.entries(TOOL_CATEGORIES)) {
      if (tool.name in categoryData.operations) {
        // Check if category is available based on plugins
        return isCategoryAvailable(category, installedPlugins);
      }
    }
    
    // If tool is not in any category, allow it by default
    return true;
  });
}

/**
 * Get list of categories that require plugin checks
 */
export function getCategoriesRequiringPluginCheck(): string[] {
  return Object.entries(TOOL_CATEGORIES)
    .filter(([_, config]) => config.availableByDefault === false)
    .map(([category, _]) => category);
}

/**
 * Get mapping of categories to their required plugins
 */
export function getPluginRequirements(): Record<string, string> {
  const requirements: Record<string, string> = {};
  
  for (const [category, config] of Object.entries(TOOL_CATEGORIES)) {
    if (config.requiresPlugin) {
      requirements[category] = config.requiresPlugin;
    }
  }
  
  return requirements;
}
