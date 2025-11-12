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
    },
    availableByDefault: true,
  },
  apps: {
    operations: {
      'list_apps': 'R',
      'get_app_by_name': 'R',
      'create_app': 'C',
      'update_app': 'U',
      'delete_app': 'D',
      'reset_app': 'D',
    },
    availableByDefault: true,
  },
  analytics: {
    operations: {
      'get_analytics_data': 'R',
      'get_dashboard_data': 'R',
      'get_events_data': 'R',
      'get_events_overview': 'R',
      'get_top_events': 'R',
      'get_slipping_away_users': 'R',
      'get_session_frequency': 'R',
      'get_user_loyalty': 'R',
      'get_session_durations': 'R',
    },
    availableByDefault: true,
  },
  crashes: {
    operations: {
      'list_crash_groups': 'R',
      'get_crash_statistics': 'R',
      'view_crash': 'R',
      'add_crash_comment': 'C',
      'edit_crash_comment': 'U',
      'delete_crash_comment': 'D',
      'resolve_crash': 'U',
      'unresolve_crash': 'U',
      'hide_crash': 'U',
      'show_crash': 'U',
    },
    requiresPlugin: 'crashes',
    availableByDefault: false,
  },
  notes: {
    operations: {
      'list_notes': 'R',
      'create_note': 'C',
      'delete_note': 'D',
    },
    availableByDefault: true,
  },
  events: {
    operations: {
      'create_event': 'C',
    },
    availableByDefault: true,
  },
  alerts: {
    operations: {
      'list_alerts': 'R',
      'create_alert': 'C', // Also handles updates
      'delete_alert': 'D',
    },
    requiresPlugin: 'alerts',
    availableByDefault: false,
  },
  views: {
    operations: {
      'get_views_table': 'R',
      'get_view_segments': 'R',
      'get_views_data': 'R',
    },
    requiresPlugin: 'views',
    availableByDefault: false,
  },
  database: {
    operations: {
      'query_database': 'R',
      'list_databases': 'R',
      'get_document': 'R',
      'aggregate_collection': 'R',
      'get_collection_indexes': 'R',
      'get_db_statistics': 'R',
    },
    requiresPlugin: 'dbviewer',
    availableByDefault: false,
  },
  dashboard_users: {
    operations: {
      'get_all_dashboard_users': 'R',
    },
    availableByDefault: true,
  },
  app_users: {
    operations: {
      'create_app_user': 'C',
      'edit_app_user': 'U',
      'delete_app_user': 'D',
    },
    availableByDefault: true,
  },
  drill: {
    operations: {
      'get_segmentation_meta': 'R',
      'run_segmentation_query': 'R',
      'list_drill_bookmarks': 'R',
      'create_drill_bookmark': 'C',
      'delete_drill_bookmark': 'D',
    },
    requiresPlugin: 'drill',
    availableByDefault: false,
  },
  user_profiles: {
    operations: {
      'query_user_profiles': 'R',
      'breakdown_user_profiles': 'R',
      'get_user_profile_details': 'R',
      'add_user_note': 'C',
    },
    requiresPlugin: 'users',
    availableByDefault: false,
  },
  cohorts: {
    operations: {
      'list_cohorts': 'R',
      'get_cohort': 'R',
      'create_cohort': 'C',
      'update_cohort': 'U',
      'delete_cohort': 'D',
    },
    requiresPlugin: 'cohorts',
    availableByDefault: false,
  },
  funnels: {
    operations: {
      'list_funnels': 'R',
      'get_funnel': 'R',
      'get_funnel_data': 'R',
      'get_funnel_step_users': 'R',
      'get_funnel_dropoff_users': 'R',
      'create_funnel': 'C',
      'update_funnel': 'U',
      'delete_funnel': 'D',
    },
    requiresPlugin: 'funnels',
    availableByDefault: false,
  },
  formulas: {
    operations: {
      'run_formula': 'R',
      'list_formulas': 'R',
      'delete_formula': 'D',
    },
    requiresPlugin: 'formulas',
    availableByDefault: false,
  },
  live: {
    operations: {
      'get_live_users': 'R',
      'get_live_metrics': 'R',
      'get_live_last_hour': 'R',
      'get_live_last_day': 'R',
      'get_live_last_30_days': 'R',
      'get_live_overall': 'R',
    },
    requiresPlugin: 'concurrent_users',
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
