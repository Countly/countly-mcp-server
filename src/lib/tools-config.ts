/**
 * Tools configuration and filtering based on environment variables
 * Allows controlling which tool categories and CRUD operations are available
 */

export type CrudOperation = 'C' | 'R' | 'U' | 'D';

export interface ToolsConfig {
  [category: string]: Set<CrudOperation>;
}

/**
 * Tool categories and their operations mapping
 */
export const TOOL_CATEGORIES: Record<string, { operations: Record<string, CrudOperation> }> = {
  core: {
    operations: {
      'ping': 'R',
      'get_version': 'R',
      'get_plugins': 'R',
      'search': 'R',
      'fetch': 'R',
    }
  },
  apps: {
    operations: {
      'list_apps': 'R',
      'get_app_by_name': 'R',
      'create_app': 'C',
      'update_app': 'U',
      'delete_app': 'D',
      'reset_app': 'D',
    }
  },
  analytics: {
    operations: {
      'get_analytics_data': 'R',
      'get_dashboard_data': 'R',
      'get_events_data': 'R',
      'get_events_overview': 'R',
      'get_top_events': 'R',
      'get_slipping_away_users': 'R',
    }
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
    }
  },
  notes: {
    operations: {
      'list_notes': 'R',
      'create_note': 'C',
      'delete_note': 'D',
    }
  },
  events: {
    operations: {
      'create_event': 'C',
    }
  },
  alerts: {
    operations: {
      'list_alerts': 'R',
      'create_alert': 'C', // Also handles updates
      'delete_alert': 'D',
    }
  },
  views: {
    operations: {
      'get_views_table': 'R',
      'get_view_segments': 'R',
      'get_views_data': 'R',
    }
  },
  database: {
    operations: {
      'query_database': 'R',
      'list_databases': 'R',
      'get_document': 'R',
      'aggregate_collection': 'R',
      'get_collection_indexes': 'R',
      'get_db_statistics': 'R',
    }
  },
  dashboard_users: {
    operations: {
      'get_all_dashboard_users': 'R',
    }
  },
  app_users: {
    operations: {
      'create_app_user': 'C',
      'edit_app_user': 'U',
      'delete_app_user': 'D',
    }
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
