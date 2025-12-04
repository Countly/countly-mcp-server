/**
 * Tools configuration and filtering based on environment variables
 * Allows controlling which tool categories and CRUD operations are available
 */

export type CrudOperation = 'C' | 'R' | 'U' | 'D';

export interface ToolsConfig {
  [category: string]: Set<CrudOperation>;
}

export interface ToolCategoryConfig {
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
    operations: {
      'ping': 'R',
      'get_version': 'R',
      'get_plugins': 'R',
      'search': 'R',
      'fetch': 'R',
      'jobs_list': 'R',
      'job_runs': 'R',
    },
    availableByDefault: true,
  },
  apps: {
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
    operations: {
      'notes_list': 'R',
      'notes_create': 'C',
      'notes_delete': 'D',
    },
    availableByDefault: true,
  },
  events: {
    operations: {
      'events_create': 'C',
      'events_segments': 'R',
    },
    availableByDefault: true,
  },
  alerts: {
    operations: {
      'alerts_list': 'R',
      'alerts_create': 'C', // Also handles updates
      'alerts_delete': 'D',
    },
    requiresPlugin: 'alerts',
    availableByDefault: false,
  },
  views: {
    operations: {
      'views_table': 'R',
      'views_segments': 'R',
      'views_data': 'R',
    },
    requiresPlugin: 'views',
    availableByDefault: false,
  },
  database: {
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
    operations: {
      'dashboard_users': 'R',
    },
    availableByDefault: true,
  },
  app_users: {
    operations: {
      'app_users_create': 'C',
      'app_users_update': 'U',
      'app_users_delete': 'D',
    },
    availableByDefault: true,
  },
  drill: {
    operations: {
      'drill_bookmarks_list': 'R',
      'drill_bookmarks_create': 'C',
      'drill_bookmarks_delete': 'D',
      'metadata_get': 'R',
      'queriable_fields_list': 'R',
    },
    requiresPlugin: 'drill',
    availableByDefault: false,
  },
  user_profiles: {
    operations: {
      'user_profiles_query': 'R',
      'user_profiles_breakdown': 'R',
      'user_profiles_get': 'R',
      'user_profiles_note_add': 'C',
    },
    requiresPlugin: 'users',
    availableByDefault: false,
  },
  cohorts: {
    operations: {
      'cohorts_list': 'R',
      'cohorts_details': 'R',
      'cohorts_create': 'C',
      'cohorts_update': 'U',
      'cohorts_delete': 'D',
    },
    requiresPlugin: 'cohorts',
    availableByDefault: false,
  },
  funnels: {
    operations: {
      'funnels_list': 'R',
      'funnels_details': 'R',
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
    operations: {
      'formulas_run': 'R',
      'formulas_list': 'R',
      'formulas_delete': 'D',
    },
    requiresPlugin: 'formulas',
    availableByDefault: false,
  },
  live: {
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
    operations: {
      'retention': 'R',
    },
    requiresPlugin: 'retention_segments',
    availableByDefault: false,
  },
  remote_config: {
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
    operations: {
      'sdk_logs_list': 'R',
    },
    requiresPlugin: 'logger',
    availableByDefault: false,
  },
  sdks: {
    operations: {
      'sdk_stats_get': 'R',
      'sdk_config_get': 'R',
    },
    requiresPlugin: 'sdks',
    availableByDefault: false,
  },
  compliance_hub: {
    operations: {
      'consents_stats': 'R',
      'consents_list': 'R',
      'consents_history_search': 'R',
    },
    requiresPlugin: 'compliance-hub',
    availableByDefault: false,
  },
  filtering_rules: {
    operations: {
      'filtering_rules_list': 'R',
      'filtering_rules_create': 'C',
      'filtering_rules_update': 'U',
      'filtering_rules_delete': 'D',
    },
    requiresPlugin: 'blocks',
    availableByDefault: false,
  },
  datapoint: {
    operations: {
      'datapoints_stats': 'R',
      'datapoints_top_apps': 'R',
      'datapoints_punch_card': 'R',
    },
    requiresPlugin: 'server-stats',
    availableByDefault: false,
  },
  server_logs: {
    operations: {
      'server_logs_files_list': 'R',
      'server_logs_contents': 'R',
    },
    requiresPlugin: 'errorlogs',
    availableByDefault: false,
  },
  email_reports: {
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
    operations: {
      'times_of_day': 'R',
    },
    requiresPlugin: 'times-of-day',
    availableByDefault: false,
  },
  hooks: {
    operations: {
      'hooks_list': 'R',
      'hooks_test': 'R',
      'hooks_create': 'C',
      'hooks_update': 'U',
      'hooks_delete': 'D',
      'hooks_internal_triggers_get': 'R',
    },
    requiresPlugin: 'hooks',
    availableByDefault: false,
  },
};

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
  // Find which category this tool belongs to
  for (const [category, categoryData] of Object.entries(TOOL_CATEGORIES)) {
    if (toolName in categoryData.operations) {
      const requiredOperation = categoryData.operations[toolName];
      const allowedOperations = config[category];
      return allowedOperations.has(requiredOperation);
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
