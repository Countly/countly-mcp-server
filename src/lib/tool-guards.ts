/**
 * Permission guard of the Countly endpoint behind each tool.
 *
 * Mapped from the validators in countly-server / countly-enterprise-plugins
 * (origin/master) and countly-platform (origin/main, identical for these
 * endpoints), 2026-10-06. Note the server's access type sometimes differs
 * from the tool's CRUD label in tools-config.ts (e.g. alerts_delete needs
 * alerts:u). Tools missing here are never hidden by permissions.
 */

import { canUseGuard, type AccessType, type MemberPermissions, type ToolGuard } from './user-permissions.js';

const any: ToolGuard = { kind: 'any' };
const globalAdmin: ToolGuard = { kind: 'global-admin' };
const appAdmin: ToolGuard = { kind: 'app-admin' };
const appWrite: ToolGuard = { kind: 'app-write' };
const appRead: ToolGuard = { kind: 'app-read' };
const f = (feature: string | string[], access: AccessType): ToolGuard => ({ kind: 'feature', feature, access });

/** Any of these features lets a user read drill metadata (drill api.js segmentation_meta) */
const DRILL_META_FEATURES = ['funnels', 'cohorts', 'users', 'drill', 'formulas'];

export const TOOL_GUARDS: Record<string, ToolGuard> = {
  // core
  ping: any,
  get_version: any,
  get_plugins: globalAdmin,

  // apps
  apps_list: any,
  apps_get_by_name: any,
  apps_create: globalAdmin,
  apps_update: appAdmin,
  apps_delete: globalAdmin,
  apps_reset: globalAdmin,

  // analytics
  query_data: f('core', 'r'),
  app_analytics_summary: f('core', 'r'),
  session_frequency: f('core', 'r'),
  session_durations: f('core', 'r'),
  user_loyalty: appRead,
  slipping_users: f('slipping_away_users', 'r'),

  // notes
  notes_list: f('core', 'r'),
  notes_create: f('core', 'c'),
  notes_delete: f('core', 'd'),
  notes_update: f('core', 'c'), // PUT /v2/notes/:id checks the create right

  // events
  events_list: f('core', 'r'),
  events_create: f('events', 'u'),
  events_delete: f('events', 'd'),

  // users
  dashboard_users: globalAdmin,
  app_users_create: appWrite,
  app_users_update: appWrite,
  app_users_delete: appWrite,

  // crashes
  crash_groups_list: f('crashes', 'r'),
  crashes_stats_get: f('crashes', 'r'),
  crashes_get: f('crashes', 'r'),
  crashes_resolve: f('crashes', 'u'),
  crashes_unresolve: f('crashes', 'u'),
  crashes_hide: f('crashes', 'u'),
  crashes_show: f('crashes', 'u'),
  crashes_comment_add: f('crashes', 'c'),
  crashes_comment_update: f('crashes', 'u'),
  crashes_comment_delete: f('crashes', 'd'),

  // alerts
  alerts_list: f('alerts', 'r'),
  alerts_create: f('alerts', 'c'),
  alerts_delete: f('alerts', 'u'),

  // views
  views_table: f('views', 'r'),
  views_data: f('views', 'r'),

  // database (validateUser, then results filtered to apps with dbviewer:r)
  databases_query: f('dbviewer', 'r'),
  databases_list: f('dbviewer', 'r'),
  databases_document: f('dbviewer', 'r'),
  collections_aggregate: f('dbviewer', 'r'),
  collections_indexes: f('dbviewer', 'r'),
  databases_stats: globalAdmin,

  // drill
  queriable_fields_list: f(DRILL_META_FEATURES, 'r'),
  drill_bookmarks_list: f(DRILL_META_FEATURES, 'r'),
  drill_bookmarks_create: f('drill', 'r'),
  drill_bookmarks_delete: f('drill', 'r'),
  metadata_get: f('core', 'r'),

  // user profiles
  user_profiles_query: f('users', 'r'),
  user_profiles_breakdown: f('users', 'r'),
  user_profiles_get: f('users', 'r'),

  // cohorts
  cohorts_list: f('cohorts', 'r'),
  cohorts_data: f('cohorts', 'r'),
  cohorts_create: f('cohorts', 'c'),
  cohorts_update: f('cohorts', 'c'),
  cohorts_delete: f('cohorts', 'd'),

  // funnels
  funnels_list: f('funnels', 'r'),
  funnels_data: f('funnels', 'r'),
  funnels_step_users: f('funnels', 'r'),
  funnels_dropoff_users: f('funnels', 'r'),
  funnels_create: f('funnels', 'c'),
  funnels_update: f('funnels', 'u'),
  funnels_delete: f('funnels', 'd'),

  // formulas
  formulas_run: f('formulas', 'r'),
  formulas_list: f('formulas', 'r'),
  formulas_save: f('formulas', 'c'),
  formulas_delete: f('formulas', 'd'),

  // live
  live_users: f('concurrent_users', 'r'),
  live_metrics: f('concurrent_users', 'r'),
  live_last_hour: f('concurrent_users', 'r'),
  live_last_day: f('concurrent_users', 'r'),
  live_last_30_days: f('concurrent_users', 'r'),
  live_overall: f('concurrent_users', 'r'),

  // retention
  retention: f('retention_segments', 'r'),

  // remote config
  remote_configs_list: f('remote_config', 'r'),
  remote_config_parameters_add: f('remote_config', 'c'),
  remote_config_parameters_update: f('remote_config', 'u'),
  remote_config_parameters_delete: f('remote_config', 'd'),
  remote_config_conditions_add: f('remote_config', 'u'),
  remote_config_conditions_update: f('remote_config', 'u'),
  remote_config_conditions_delete: f('remote_config', 'd'),

  // A/B testing
  ab_experiments_list: f('ab_testing', 'r'),
  ab_experiments_details: f('ab_testing', 'r'),
  ab_experiments_create: f('ab_testing', 'c'),
  ab_experiments_start: f('ab_testing', 'u'),
  ab_experiments_stop: f('ab_testing', 'u'),
  ab_experiments_delete: f('ab_testing', 'd'),

  // logger / SDKs
  sdk_logs_list: f('logger', 'r'),
  sdk_stats_get: f('sdk', 'r'),
  sdk_config_get: f('sdk', 'r'),

  // compliance hub
  consents_stats: f('compliance_hub', 'r'),
  consents_list: f('compliance_hub', 'r'),
  consents_history_search: f('compliance_hub', 'r'),

  // filtering rules
  filtering_rules_list: f('block', 'r'),
  filtering_rules_create: f('block', 'c'),
  filtering_rules_update: f('block', 'u'),
  filtering_rules_toggle_status: f('block', 'u'),
  filtering_rules_delete: f('block', 'd'),

  // datapoints (validateUser, then filtered to apps with server-stats:r)
  datapoints_stats: f('server-stats', 'r'),
  datapoints_top_apps: f('server-stats', 'r'),
  datapoints_punch_card: f('server-stats', 'r'),

  // server logs
  server_logs_files_list: globalAdmin,
  server_logs_contents: globalAdmin,

  // email reports
  email_reports_list: f('reports', 'r'),
  email_reports_core_create: f('reports', 'c'),
  email_reports_dashboard_create: f('reports', 'c'),
  email_reports_update: f('reports', 'u'),
  email_reports_preview: f('reports', 'r'),
  email_reports_send: f('reports', 'r'),
  email_reports_delete: f('reports', 'd'),

  // dashboards: any user, access is per dashboard (owner / sharing)
  dashboards_list: any,
  dashboards_data: any,
  dashboards_create: any,
  dashboards_update: any,
  dashboards_delete: any,
  dashboards_widget_add: any,
  dashboards_widget_update: any,
  dashboards_widget_remove: any,

  // times of day
  times_of_day: f('times_of_day', 'r'),

  // hooks
  hooks_list: f('hooks', 'r'),
  hooks_create: f('hooks', 'c'),
  hooks_update: f('hooks', 'c'),
  hooks_delete: f('hooks', 'd'),
  hooks_test: f('hooks', 'c'),

  // journeys
  journeys_list: f('journey_engine', 'r'),
  journeys_get: f('journey_engine', 'r'),
  journeys_create: f('journey_engine', 'c'),
  journeys_update: f('journey_engine', 'c'),
  journeys_delete: f('journey_engine', 'c'),
  journeys_publish: f('journey_engine', 'u'),
  journeys_pause: f('journey_engine', 'u'),
  journeys_resume: f('journey_engine', 'u'),
  journeys_stats_summary: f('journey_engine', 'r'),
  journeys_stats_table: f('journey_engine', 'r'),
  journeys_stats_performance: f('journey_engine', 'r'),
  journeys_stats_uids: f('journey_engine', 'r'),
  journeys_block_reference: any,

  // content
  content_blocks_list: f('content', 'r'),
  content_blocks_get: f('content', 'r'),
  content_blocks_preview: f('content', 'r'),
  content_blocks_create: f('content', 'c'),
  content_blocks_update: f('content', 'u'),
  content_blocks_delete: f('content', 'd'),
  content_assets_list: f('content', 'r'),
  content_assets_upload: f('content', 'c'),
  content_assets_update: f('content', 'u'),
  content_assets_delete: f('content', 'd'),
  content_langs_list: f('content', 'r'),

  // Platform /v2 insights
  events_summary: f('core', 'r'),
  events_top: f('core', 'r'),
  events_movers: f('core', 'r'),
  views_top: f('views', 'r'),
  crash_group_breakdown: f('crashes', 'r'),
  crash_group_users: f('crashes', 'r'),
  funnels_breakdown: f('funnels', 'r'),
  funnels_trends: f('funnels', 'r'),
  funnels_user_progress: f('funnels', 'r'),
  drill_query: f('drill', 'r'),
  journeys_complete: f('journey_engine', 'u'),
  journeys_stats_blocks: f('journey_engine', 'r'),
  journeys_stats_content: f('journey_engine', 'r'),
  journeys_stats_active_users: f('journey_engine', 'r'),
  journeys_templates: any,

  // Platform /v2 extras
  flows_list: f('flows', 'r'),
  flows_get: f('flows', 'r'),
  flows_data: f('flows', 'r'),
  flows_dropoff: f('flows', 'r'),
  ratings_widgets_list: f('star_rating', 'r'),
  ratings_stats: f('star_rating', 'r'),
  ratings_comments: f('star_rating', 'r'),
  campaigns_list: f('campaigns', 'r'),
  campaigns_get: f('campaigns', 'r'),
  campaigns_results: f('campaigns', 'r'),
  ai_assistants_analytics: any, // the route only runs validateUser
  notifications_list: any, // the caller's own inbox
  tasks_list: f('core', 'r'),
  task_result: f('core', 'r'),
  geo_locations_list: f('geo', 'r'),
  revenue_iap_events: f('revenue', 'r'),
  crash_jira_issues: f('crashes', 'r'),
};

/**
 * Whether the connected user may use a tool. Unknown member or unmapped
 * tool means "allowed": the server stays the authority.
 */
export function isToolPermitted(toolName: string, member: MemberPermissions | null): boolean {
  const guard = TOOL_GUARDS[toolName];
  return !member || !guard || canUseGuard(member, guard);
}

/** Human-readable requirement, for error messages */
export function describeGuard(toolName: string): string {
  const guard = TOOL_GUARDS[toolName];
  const verbs: Record<AccessType, string> = { c: 'create', r: 'read', u: 'update', d: 'delete' };
  switch (guard?.kind) {
  case 'feature':
    return `"${verbs[guard.access]}" permission for ${[guard.feature].flat().map((x) => `"${x}"`).join(' or ')} on at least one app`;
  case 'global-admin':
    return 'global admin rights';
  case 'app-admin':
  case 'app-write':
    return 'admin rights on at least one app';
  case 'app-read':
    return 'access to at least one app';
  default:
    return 'additional permissions';
  }
}
