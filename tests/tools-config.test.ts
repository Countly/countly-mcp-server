import { describe, it, expect } from 'vitest';
import {
  TOOL_CATEGORIES,
  parseCrudPermissions,
  loadToolsConfig,
  isToolAllowed,
  filterTools,
  getConfigSummary,
} from '../src/lib/tools-config.js';
import { getAllToolDefinitions } from '../src/tools/index.js';

/**
 * Tools Configuration Tests
 */
describe('Tools Configuration', () => {
  
  describe('TOOL_CATEGORIES structure', () => {
    it('should have all expected categories', () => {
    const expectedCategories = [
      'core',
      'apps',
      'analytics',
      'crashes',
      'notes',
      'events',
      'alerts',
      'views',
      'database',
      'dashboard_users',
      'app_users',
      'drill',
      'user_profiles',
      'cohorts',
      'funnels',
      'formulas',
      'live',
      'retention',
      'remote_config',
      'ab_testing',
      'logger',
      'sdks',
      'compliance_hub',
      'filtering_rules',
      'datapoint',
      'server_logs',
      'email_reports',
      'dashboards',
      'times_of_day',
    ];      const actualCategories = Object.keys(TOOL_CATEGORIES);
      expect(actualCategories.sort()).toEqual(expectedCategories.sort());
    });

    it('should have correct number of operations per category', () => {
    const expectedCounts = {
      core: 7,
      apps: 6,
      analytics: 9,
      crashes: 10,
      notes: 3,
      events: 1,
      alerts: 3,
      views: 3,
      database: 6,
      dashboard_users: 1,
      app_users: 3,
      drill: 5,
      user_profiles: 4,
      cohorts: 5,
      funnels: 8,
      formulas: 3,
      live: 6,
      retention: 1,
      remote_config: 7,
      ab_testing: 6,
      logger: 1,
      sdks: 2,
      compliance_hub: 3,
      filtering_rules: 4,
      datapoint: 3,
      server_logs: 2,
      email_reports: 7,
      dashboards: 8,
      times_of_day: 1,
    };    for (const [category, config] of Object.entries(TOOL_CATEGORIES)) {
      const toolCount = Object.keys(config.operations).length;
      expect(toolCount).toBe(expectedCounts[category as keyof typeof expectedCounts]);
    }
  });

    it('should have valid CRUD operations for all tools', () => {
      const validOperations = ['C', 'R', 'U', 'D'];
      
      for (const [_category, config] of Object.entries(TOOL_CATEGORIES)) {
        for (const [_tool, operation] of Object.entries(config.operations)) {
          expect(validOperations).toContain(operation);
        }
      }
    });

    it('should have total of 128 tools', () => {
      const totalTools = Object.values(TOOL_CATEGORIES).reduce(
        (sum, config) => sum + Object.keys(config.operations).length,
        0
      );
      expect(totalTools).toBe(128);
    });
  });

  describe('Specific tool categorizations', () => {
  it('should categorize get_all_dashboard_users in dashboard_users category', () => {
    expect(TOOL_CATEGORIES.dashboard_users.operations['get_all_dashboard_users']).toBe('R');
  });    it('should have moved get_slipping_away_users to analytics', () => {
    expect(TOOL_CATEGORIES.analytics.operations['get_slipping_away_users']).toBe('R');
    expect(TOOL_CATEGORIES.dashboard_users.operations['get_slipping_away_users']).toBeUndefined();
    expect(TOOL_CATEGORIES.app_users.operations['get_slipping_away_users']).toBeUndefined();
  });

    it('should not have share/unshare crash tools', () => {
      expect(TOOL_CATEGORIES.crashes.operations).not.toHaveProperty('share_crash');
      expect(TOOL_CATEGORIES.crashes.operations).not.toHaveProperty('unshare_crash');
    });

    it('should have all crash management tools', () => {
      const crashTools = Object.keys(TOOL_CATEGORIES.crashes.operations);
      expect(crashTools).toContain('list_crash_groups');
      expect(crashTools).toContain('get_crash_statistics');
      expect(crashTools).toContain('view_crash');
      expect(crashTools).toContain('resolve_crash');
      expect(crashTools).toContain('unresolve_crash');
      expect(crashTools).toContain('hide_crash');
      expect(crashTools).toContain('show_crash');
      expect(crashTools).toContain('add_crash_comment');
      expect(crashTools).toContain('edit_crash_comment');
      expect(crashTools).toContain('delete_crash_comment');
    });
  });

  describe('parseCrudPermissions', () => {
    it('should parse CRUD to all operations', () => {
      const permissions = parseCrudPermissions('CRUD');
      expect(permissions).toEqual(new Set(['C', 'R', 'U', 'D']));
    });

    it('should parse ALL to all operations', () => {
      const permissions = parseCrudPermissions('ALL');
      expect(permissions).toEqual(new Set(['C', 'R', 'U', 'D']));
    });

    it('should parse * to all operations', () => {
      const permissions = parseCrudPermissions('*');
      expect(permissions).toEqual(new Set(['C', 'R', 'U', 'D']));
    });

    it('should parse individual letters', () => {
      const permissions = parseCrudPermissions('CR');
      expect(permissions).toEqual(new Set(['C', 'R']));
    });

    it('should parse case-insensitive', () => {
      const permissions = parseCrudPermissions('cr');
      expect(permissions).toEqual(new Set(['C', 'R']));
    });

    it('should parse NONE to empty set', () => {
      const permissions = parseCrudPermissions('NONE');
      expect(permissions).toEqual(new Set());
    });

    it('should parse empty string to all operations (default)', () => {
      const permissions = parseCrudPermissions('');
      expect(permissions).toEqual(new Set(['C', 'R', 'U', 'D']));
    });

    it('should ignore invalid characters', () => {
      const permissions = parseCrudPermissions('CRX');
      expect(permissions).toEqual(new Set(['C', 'R']));
    });
  });

  describe('loadToolsConfig', () => {
    it('should use default ALL for all categories when no env vars', () => {
      const config = loadToolsConfig({});
      
      for (const category of Object.keys(TOOL_CATEGORIES)) {
        expect(config[category]).toEqual(new Set(['C', 'R', 'U', 'D']));
      }
    });

    it('should apply COUNTLY_TOOLS_ALL globally', () => {
      const config = loadToolsConfig({
        COUNTLY_TOOLS_ALL: 'R',
      });
      
      for (const category of Object.keys(TOOL_CATEGORIES)) {
        expect(config[category]).toEqual(new Set(['R']));
      }
    });

    it('should allow category-specific overrides', () => {
      const config = loadToolsConfig({
        COUNTLY_TOOLS_ALL: 'R',
        COUNTLY_TOOLS_APPS: 'CR',
        COUNTLY_TOOLS_DATABASE: 'NONE',
      });
      
      expect(config.apps).toEqual(new Set(['C', 'R']));
      expect(config.database).toEqual(new Set());
      expect(config.analytics).toEqual(new Set(['R']));
    });

    it('should handle mixed case environment variables', () => {
      const config = loadToolsConfig({
        COUNTLY_TOOLS_APPS: 'cr',
      });
      
      expect(config.apps).toEqual(new Set(['C', 'R']));
    });
  });

  describe('isToolAllowed', () => {
    it('should allow tool when operation is permitted', () => {
      const config = {
        apps: new Set<'C' | 'R' | 'U' | 'D'>(['C', 'R']),
      };
      
      expect(isToolAllowed('list_apps', config)).toBe(true);
      expect(isToolAllowed('create_app', config)).toBe(true);
    });

    it('should deny tool when operation is not permitted', () => {
      const config = {
        apps: new Set<'C' | 'R' | 'U' | 'D'>(['R']),
      };
      
      expect(isToolAllowed('create_app', config)).toBe(false);
      expect(isToolAllowed('delete_app', config)).toBe(false);
    });

    it('should deny tool when category is disabled', () => {
      const config = {
        apps: new Set<'C' | 'R' | 'U' | 'D'>(),
      };
      
      expect(isToolAllowed('list_apps', config)).toBe(false);
    });

    it('should return true for unknown tools (forward compatibility)', () => {
      const config = {
        apps: new Set<'C' | 'R' | 'U' | 'D'>(['C', 'R', 'U', 'D']),
      };
      
      expect(isToolAllowed('unknown_tool', config)).toBe(true);
    });
  });

  describe('filterTools', () => {
    it('should filter tools based on configuration', () => {
      const tools = [
        { name: 'list_apps' },
        { name: 'create_app' },
        { name: 'delete_app' },
      ];
      
      const config = {
        apps: new Set<'C' | 'R' | 'U' | 'D'>(['R']),
      };
      
      const filtered = filterTools(tools, config);
      expect(filtered).toHaveLength(1);
      expect(filtered[0].name).toBe('list_apps');
    });

    it('should allow all tools with full permissions', () => {
      const tools = [
        { name: 'list_apps' },
        { name: 'create_app' },
        { name: 'delete_app' },
      ];
      
      const config = {
        apps: new Set<'C' | 'R' | 'U' | 'D'>(['C', 'R', 'U', 'D']),
      };
      
      const filtered = filterTools(tools, config);
      expect(filtered).toHaveLength(3);
    });

    it('should filter out all tools when category is disabled', () => {
      const tools = [
        { name: 'list_apps' },
        { name: 'create_app' },
      ];
      
      const config = {
        apps: new Set<'C' | 'R' | 'U' | 'D'>(),
      };
      
      const filtered = filterTools(tools, config);
      expect(filtered).toHaveLength(0);
    });
  });

  describe('getConfigSummary', () => {
    it('should generate readable summary for all categories', () => {
      const config = {
        core: new Set<'C' | 'R' | 'U' | 'D'>(['R']),
        apps: new Set<'C' | 'R' | 'U' | 'D'>(['C', 'R']),
        analytics: new Set<'C' | 'R' | 'U' | 'D'>(['R']),
        crashes: new Set<'C' | 'R' | 'U' | 'D'>(['C', 'R', 'U', 'D']),
        notes: new Set<'C' | 'R' | 'U' | 'D'>(),
        events: new Set<'C' | 'R' | 'U' | 'D'>(['C', 'R', 'U', 'D']),
        alerts: new Set<'C' | 'R' | 'U' | 'D'>(['C', 'R', 'U', 'D']),
        views: new Set<'C' | 'R' | 'U' | 'D'>(['C', 'R', 'U', 'D']),
        database: new Set<'C' | 'R' | 'U' | 'D'>(['C', 'R', 'U', 'D']),
        users: new Set<'C' | 'R' | 'U' | 'D'>(['C', 'R', 'U', 'D']),
      };
      
      const summary = getConfigSummary(config);
      
      expect(summary).toContain('apps: CR');
      expect(summary).toContain('analytics: R');
      expect(summary).toContain('crashes: ALL');
      expect(summary).toContain('notes: DISABLED');
    });

    it('should show ALL for full permissions', () => {
      const config = {
        core: new Set<'C' | 'R' | 'U' | 'D'>(['C', 'R', 'U', 'D']),
        apps: new Set<'C' | 'R' | 'U' | 'D'>(['C', 'R', 'U', 'D']),
        analytics: new Set<'C' | 'R' | 'U' | 'D'>(['C', 'R', 'U', 'D']),
        crashes: new Set<'C' | 'R' | 'U' | 'D'>(['C', 'R', 'U', 'D']),
        notes: new Set<'C' | 'R' | 'U' | 'D'>(['C', 'R', 'U', 'D']),
        events: new Set<'C' | 'R' | 'U' | 'D'>(['C', 'R', 'U', 'D']),
        alerts: new Set<'C' | 'R' | 'U' | 'D'>(['C', 'R', 'U', 'D']),
        views: new Set<'C' | 'R' | 'U' | 'D'>(['C', 'R', 'U', 'D']),
        database: new Set<'C' | 'R' | 'U' | 'D'>(['C', 'R', 'U', 'D']),
        users: new Set<'C' | 'R' | 'U' | 'D'>(['C', 'R', 'U', 'D']),
      };
      
      const summary = getConfigSummary(config);
      expect(summary).toContain('apps: ALL');
    });
  });

  describe('Integration with tool definitions', () => {
    it('should have all tools from definitions in TOOL_CATEGORIES', () => {
      const allTools = getAllToolDefinitions();
      const configuredTools = new Set<string>();
      
      for (const config of Object.values(TOOL_CATEGORIES)) {
        for (const toolName of Object.keys(config.operations)) {
          configuredTools.add(toolName);
        }
      }
      
      const missingTools: string[] = [];
      for (const tool of allTools) {
        if (!configuredTools.has(tool.name)) {
          missingTools.push(tool.name);
        }
      }
      
      expect(missingTools).toEqual([]);
    });

    it('should not have any extra tools in TOOL_CATEGORIES', () => {
      const allTools = getAllToolDefinitions();
      const definedTools = new Set(allTools.map(t => t.name));
      
      const extraTools: string[] = [];
      for (const [category, config] of Object.entries(TOOL_CATEGORIES)) {
        for (const toolName of Object.keys(config.operations)) {
          if (!definedTools.has(toolName)) {
            extraTools.push(`${category}:${toolName}`);
          }
        }
      }
      
      expect(extraTools).toEqual([]);
    });
  });

  describe('Real-world scenarios', () => {
    it('should support read-only mode for all tools', () => {
      const config = loadToolsConfig({
        COUNTLY_TOOLS_ALL: 'R',
      });
      
      // All write operations should be denied
      expect(isToolAllowed('create_app', config)).toBe(false);
      expect(isToolAllowed('delete_app', config)).toBe(false);
      expect(isToolAllowed('add_crash_comment', config)).toBe(false);
      
      // All read operations should be allowed
      expect(isToolAllowed('list_apps', config)).toBe(true);
      expect(isToolAllowed('get_analytics_data', config)).toBe(true);
      expect(isToolAllowed('view_crash', config)).toBe(true);
    });

    it('should support selective category access', () => {
      const config = loadToolsConfig({
        COUNTLY_TOOLS_ALL: 'NONE',
        COUNTLY_TOOLS_ANALYTICS: 'R',
        COUNTLY_TOOLS_APPS: 'R',
      });
      
      // Allowed categories
      expect(isToolAllowed('get_analytics_data', config)).toBe(true);
      expect(isToolAllowed('list_apps', config)).toBe(true);
      
      // Disabled categories
      expect(isToolAllowed('list_crash_groups', config)).toBe(false);
      expect(isToolAllowed('create_note', config)).toBe(false);
      expect(isToolAllowed('query_database', config)).toBe(false);
    });

    it('should support no-delete policy', () => {
      const config = loadToolsConfig({
        COUNTLY_TOOLS_ALL: 'CRU',
      });
      
      // Delete operations should be denied
      expect(isToolAllowed('delete_app', config)).toBe(false);
      expect(isToolAllowed('delete_app_user', config)).toBe(false);
      expect(isToolAllowed('delete_crash_comment', config)).toBe(false);
      expect(isToolAllowed('delete_note', config)).toBe(false);
      
      // Other operations should be allowed
      expect(isToolAllowed('create_app', config)).toBe(true);
      expect(isToolAllowed('update_app', config)).toBe(true);
      expect(isToolAllowed('list_apps', config)).toBe(true);
    });
  });

  describe('Plugin-based filtering', () => {
    it('should identify categories requiring plugin checks', async () => {
      const { requiresPluginCheck, getCategoriesRequiringPluginCheck } = await import('../src/lib/tools-config.js');
      
      expect(requiresPluginCheck('alerts')).toBe(true);
      expect(requiresPluginCheck('crashes')).toBe(true);
      expect(requiresPluginCheck('views')).toBe(true);
      expect(requiresPluginCheck('core')).toBe(false);
      expect(requiresPluginCheck('apps')).toBe(false);
      
      const categoriesRequiringCheck = getCategoriesRequiringPluginCheck();
      expect(categoriesRequiringCheck).toContain('alerts');
      expect(categoriesRequiringCheck).toContain('crashes');
      expect(categoriesRequiringCheck).toContain('views');
      expect(categoriesRequiringCheck).toContain('database');
      expect(categoriesRequiringCheck).toContain('drill');
      expect(categoriesRequiringCheck).toContain('user_profiles');
      expect(categoriesRequiringCheck).toContain('cohorts');
      expect(categoriesRequiringCheck).toContain('funnels');
      expect(categoriesRequiringCheck).toContain('formulas');
      expect(categoriesRequiringCheck).toContain('live');
      expect(categoriesRequiringCheck).toContain('retention');
      expect(categoriesRequiringCheck).toContain('remote_config');
      expect(categoriesRequiringCheck).toContain('ab_testing');
      expect(categoriesRequiringCheck).toContain('logger');
      expect(categoriesRequiringCheck).toContain('sdks');
      expect(categoriesRequiringCheck).toContain('compliance_hub');
      expect(categoriesRequiringCheck).toContain('filtering_rules');
      expect(categoriesRequiringCheck).toContain('datapoint');
      expect(categoriesRequiringCheck).toContain('server_logs');
      expect(categoriesRequiringCheck).toContain('email_reports');
      expect(categoriesRequiringCheck).toContain('dashboards');
      expect(categoriesRequiringCheck).toContain('times_of_day');
      expect(categoriesRequiringCheck).not.toContain('core');
      expect(categoriesRequiringCheck).not.toContain('apps');
    });

    it('should get required plugin names', async () => {
      const { getRequiredPlugin, getPluginRequirements } = await import('../src/lib/tools-config.js');
      
      expect(getRequiredPlugin('alerts')).toBe('alerts');
      expect(getRequiredPlugin('crashes')).toBe('crashes');
      expect(getRequiredPlugin('views')).toBe('views');
      expect(getRequiredPlugin('database')).toBe('dbviewer');
      expect(getRequiredPlugin('drill')).toBe('drill');
      expect(getRequiredPlugin('user_profiles')).toBe('users');
      expect(getRequiredPlugin('cohorts')).toBe('cohorts');
      expect(getRequiredPlugin('funnels')).toBe('funnels');
      expect(getRequiredPlugin('formulas')).toBe('formulas');
      expect(getRequiredPlugin('live')).toBe('concurrent_users');
      expect(getRequiredPlugin('retention')).toBe('retention_segments');
      expect(getRequiredPlugin('remote_config')).toBe('remote-config');
      expect(getRequiredPlugin('ab_testing')).toBe('ab-testing');
      expect(getRequiredPlugin('logger')).toBe('logger');
      expect(getRequiredPlugin('sdks')).toBe('sdks');
      expect(getRequiredPlugin('compliance_hub')).toBe('compliance-hub');
      expect(getRequiredPlugin('filtering_rules')).toBe('blocks');
      expect(getRequiredPlugin('datapoint')).toBe('server-stats');
      expect(getRequiredPlugin('server_logs')).toBe('errorlogs');
      expect(getRequiredPlugin('email_reports')).toBe('reports');
      expect(getRequiredPlugin('dashboards')).toBe('dashboards');
      expect(getRequiredPlugin('times_of_day')).toBe('times-of-day');
      expect(getRequiredPlugin('core')).toBeUndefined();
      
      const requirements = getPluginRequirements();
      expect(requirements).toHaveProperty('alerts', 'alerts');
      expect(requirements).toHaveProperty('crashes', 'crashes');
      expect(requirements).toHaveProperty('views', 'views');
      expect(requirements).toHaveProperty('database', 'dbviewer');
      expect(requirements).toHaveProperty('drill', 'drill');
      expect(requirements).toHaveProperty('user_profiles', 'users');
      expect(requirements).toHaveProperty('cohorts', 'cohorts');
      expect(requirements).toHaveProperty('funnels', 'funnels');
      expect(requirements).not.toHaveProperty('core');
    });

    it('should check category availability based on plugins', async () => {
      const { isCategoryAvailable } = await import('../src/lib/tools-config.js');
      
      const installedPlugins = ['crashes', 'push', 'views', 'dbviewer'];
      
      // Categories requiring plugins
      expect(isCategoryAvailable('crashes', installedPlugins)).toBe(true);
      expect(isCategoryAvailable('views', installedPlugins)).toBe(true);
      expect(isCategoryAvailable('database', installedPlugins)).toBe(true);
      expect(isCategoryAvailable('alerts', installedPlugins)).toBe(false); // not installed
      
      // Categories available by default
      expect(isCategoryAvailable('core', installedPlugins)).toBe(true);
      expect(isCategoryAvailable('apps', installedPlugins)).toBe(true);
      expect(isCategoryAvailable('analytics', installedPlugins)).toBe(true);
    });

    it('should filter tools based on plugins', async () => {
      const { filterToolsByPlugins } = await import('../src/lib/tools-config.js');
      
      const mockTools = [
        { name: 'list_apps' },
        { name: 'list_alerts' },
        { name: 'list_crash_groups' },
        { name: 'get_views_table' },
        { name: 'get_dashboard_data' },
        { name: 'query_database' },
      ];
      
      const config = loadToolsConfig({ COUNTLY_TOOLS_ALL: 'CRUD' });
      
      // With crashes, views, and dbviewer plugins
      const plugins1 = ['crashes', 'views', 'dbviewer'];
      const filtered1 = filterToolsByPlugins(mockTools, config, plugins1);
      expect(filtered1.map(t => t.name)).toContain('list_apps');
      expect(filtered1.map(t => t.name)).toContain('list_crash_groups');
      expect(filtered1.map(t => t.name)).toContain('get_views_table');
      expect(filtered1.map(t => t.name)).toContain('query_database');
      expect(filtered1.map(t => t.name)).toContain('get_dashboard_data');
      expect(filtered1.map(t => t.name)).not.toContain('list_alerts');
      
      // With alerts plugin only
      const plugins2 = ['alerts'];
      const filtered2 = filterToolsByPlugins(mockTools, config, plugins2);
      expect(filtered2.map(t => t.name)).toContain('list_apps');
      expect(filtered2.map(t => t.name)).toContain('list_alerts');
      expect(filtered2.map(t => t.name)).toContain('get_dashboard_data');
      expect(filtered2.map(t => t.name)).not.toContain('list_crash_groups');
      expect(filtered2.map(t => t.name)).not.toContain('get_views_table');
      expect(filtered2.map(t => t.name)).not.toContain('query_database');
      
      // With no optional plugins
      const plugins3: string[] = [];
      const filtered3 = filterToolsByPlugins(mockTools, config, plugins3);
      expect(filtered3.map(t => t.name)).toContain('list_apps');
      expect(filtered3.map(t => t.name)).toContain('get_dashboard_data');
      expect(filtered3.map(t => t.name)).not.toContain('list_alerts');
      expect(filtered3.map(t => t.name)).not.toContain('list_crash_groups');
      expect(filtered3.map(t => t.name)).not.toContain('get_views_table');
      expect(filtered3.map(t => t.name)).not.toContain('query_database');
    });

    it('should combine config and plugin filtering', async () => {
      const { filterToolsByPlugins } = await import('../src/lib/tools-config.js');
      
      const mockTools = [
        { name: 'list_alerts' },
        { name: 'create_alert' },
        { name: 'delete_alert' },
      ];
      
      // Allow only read operations
      const config = loadToolsConfig({ COUNTLY_TOOLS_ALL: 'R' });
      const plugins = ['alerts']; // Plugin is available
      
      const filtered = filterToolsByPlugins(mockTools, config, plugins);
      expect(filtered.map(t => t.name)).toContain('list_alerts'); // R operation
      expect(filtered.map(t => t.name)).not.toContain('create_alert'); // C operation
      expect(filtered.map(t => t.name)).not.toContain('delete_alert'); // D operation
    });
  });
});
