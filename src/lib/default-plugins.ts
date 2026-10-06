/**
 * Default enabled plugin sets per Countly flavor.
 *
 * Used when the connected token cannot read the server's real plugin list
 * (countly-server restricts /o/system/plugins to global admins). Snapshots
 * taken 2026-10-06; refresh when the upstream defaults change:
 *
 * - Lite:       countly-server             plugins/plugins.default.json
 * - Enterprise: countly-enterprise-plugins plugins/plugins.ee.json
 * - Platform:   countly-platform           plugins/plugins.default.json
 */

export const LITE_DEFAULT_PLUGINS = [
  'mobile', 'web', 'desktop', 'plugins', 'density', 'locale',
  'browser', 'sources', 'views', 'logger', 'systemlogs', 'errorlogs',
  'populator', 'reports', 'crashes', 'push', 'star-rating', 'slipping-away-users',
  'compare', 'server-stats', 'dbviewer', 'times-of-day', 'compliance-hub', 'alerts',
  'onboarding', 'consolidate', 'remote-config', 'hooks', 'dashboards', 'sdk',
  'data-manager', 'guides',
];

export const ENTERPRISE_DEFAULT_PLUGINS = [
  'mobile', 'web', 'desktop', 'plugins', 'density', 'locale',
  'browser', 'sources', 'views', 'license', 'drill', 'funnels',
  'retention_segments', 'flows', 'cohorts', 'surveys', 'remote-config', 'ab-testing',
  'formulas', 'activity-map', 'concurrent_users', 'revenue', 'logger', 'systemlogs',
  'errorlogs', 'populator', 'reports', 'crashes', 'push', 'geo',
  'block', 'users', 'star-rating', 'slipping-away-users', 'compare', 'server-stats',
  'dbviewer', 'crash_symbolication', 'groups', 'white-labeling', 'alerts', 'times-of-day',
  'compliance-hub', 'onboarding', 'active_users', 'performance-monitoring', 'config-transfer', 'consolidate',
  'data-manager', 'hooks', 'dashboards', 'heatmaps', 'sdk', 'guides',
  'journey_engine', 'content', 'adjust',
];

export const PLATFORM_DEFAULT_PLUGINS = [
  'mobile', 'web', 'desktop', 'plugins', 'density', 'locale',
  'browser', 'sources', 'views', 'license', 'drill', 'funnels',
  'retention_segments', 'flows', 'cohorts', 'surveys', 'formulas', 'activity-map',
  'kafka', 'ai-assistants', 'remote-config', 'ab-testing', 'concurrent_users', 'logger',
  'systemlogs', 'populator', 'reports', 'crashes', 'push', 'geo',
  'block', 'users', 'star-rating', 'alerts', 'slipping-away-users', 'compare',
  'server-stats', 'dbviewer', 'crash_symbolication', 'groups', 'white-labeling', 'times-of-day',
  'compliance-hub', 'onboarding', 'active_users', 'config-transfer', 'data-manager', 'hooks',
  'sdk', 'guides', 'content', 'journey_engine', 'adjust', 'appsflyer',
  'clickhouse', 'dashboards', 'cleanup-center', 'campaigns',
];
