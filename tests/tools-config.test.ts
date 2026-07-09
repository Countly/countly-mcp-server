import { describe, it, expect } from 'vitest';
import {
  TOOL_CATEGORIES,
  parseCrudPermissions,
  loadToolsConfig,
  isToolAllowed,
  filterTools,
  getConfigSummary,
} from '../src/lib/tools-config.js';
import { getAllToolDefinitions, getAllToolMetadata } from '../src/tools/index.js';
import { ToolContext } from '../src/tools/types.js';

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
      'hooks',
      'journeys',
      'content',
      'metadata',
    ];
    const actualCategories = Object.keys(TOOL_CATEGORIES);
    expect(actualCategories.sort()).toEqual(expectedCategories.sort());
  });

    it('should have correct number of operations per category', () => {
    const expectedCounts = {
      core: 3,
      apps: 6,
      analytics: 6,
      crashes: 10,
      notes: 3,
      events: 3,
      alerts: 3,
      views: 2,
      database: 6,
      dashboard_users: 1,
      app_users: 3,
      drill: 4,
      user_profiles: 3,
      cohorts: 5,
      funnels: 7,
      formulas: 4,
      live: 6,
      retention: 1,
      remote_config: 7,
      ab_testing: 6,
      logger: 1,
      sdks: 2,
      compliance_hub: 3,
      filtering_rules: 5,
      datapoint: 3,
      server_logs: 2,
      email_reports: 7,
      dashboards: 8,
      times_of_day: 1,
      hooks: 5,
      journeys: 13,
      content: 11,
      metadata: 1,
    };
    for (const [category, config] of Object.entries(TOOL_CATEGORIES)) {
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

    it('should have total of 151 tools', () => {
      const totalTools = Object.values(TOOL_CATEGORIES).reduce(
        (sum, config) => sum + Object.keys(config.operations).length,
        0
      );
      expect(totalTools).toBe(151);
    });
  });

  describe('Tool definitions validation', () => {
    it('should not have duplicate tool names', () => {
      // This test ensures that all MCP tools have unique names.
      // Duplicate tool names can cause VSCode to only load one of the tools
      // and may result in unpredictable behavior or missing functionality.
      const allTools = getAllToolDefinitions();
      const toolNames = allTools.map(tool => tool.name);
      const uniqueNames = new Set(toolNames);
      
      expect(toolNames.length).toBe(uniqueNames.size);
      
      // If this test fails, find the duplicates
      if (toolNames.length !== uniqueNames.size) {
        const duplicates = toolNames.filter((name, index) => toolNames.indexOf(name) !== index);
        const uniqueDuplicates = [...new Set(duplicates)];
        throw new Error(`Found duplicate tool names: ${uniqueDuplicates.join(', ')}`);
      }
    });

    it('should have all tools from definitions in TOOL_CATEGORIES', () => {
      const allTools = getAllToolDefinitions();
      const toolNames = allTools.map(tool => tool.name);
      
      const allCategoryTools = new Set<string>();
      for (const [_category, config] of Object.entries(TOOL_CATEGORIES)) {
        for (const toolName of Object.keys(config.operations)) {
          allCategoryTools.add(toolName);
        }
      }
      
      for (const toolName of toolNames) {
        expect(allCategoryTools.has(toolName)).toBe(true);
      }
    });

    it('should not have any extra tools in TOOL_CATEGORIES', () => {
      const allTools = getAllToolDefinitions();
      const toolNames = new Set(allTools.map(tool => tool.name));
      
      for (const [_category, config] of Object.entries(TOOL_CATEGORIES)) {
        for (const toolName of Object.keys(config.operations)) {
          expect(toolNames.has(toolName)).toBe(true);
        }
      }
    });
  });

  describe('Specific tool categorizations', () => {
  it('should categorize dashboard_users in dashboard_users category', () => {
    expect(TOOL_CATEGORIES.dashboard_users.operations['dashboard_users']).toBe('R');
  });    it('should have moved slipping_users to analytics', () => {
    expect(TOOL_CATEGORIES.analytics.operations['slipping_users']).toBe('R');
    expect(TOOL_CATEGORIES.dashboard_users.operations['slipping_users']).toBeUndefined();
    expect(TOOL_CATEGORIES.app_users.operations['slipping_users']).toBeUndefined();
  });

    it('should not have share/unshare crash tools', () => {
      expect(TOOL_CATEGORIES.crashes.operations).not.toHaveProperty('share_crash');
      expect(TOOL_CATEGORIES.crashes.operations).not.toHaveProperty('unshare_crash');
    });

    it('should have all crash management tools', () => {
      const crashTools = Object.keys(TOOL_CATEGORIES.crashes.operations);
      expect(crashTools).toContain('crash_groups_list');
      expect(crashTools).toContain('crashes_stats_get');
      expect(crashTools).toContain('crashes_get');
      expect(crashTools).toContain('crashes_resolve');
      expect(crashTools).toContain('crashes_unresolve');
      expect(crashTools).toContain('crashes_hide');
      expect(crashTools).toContain('crashes_show');
      expect(crashTools).toContain('crashes_comment_add');
      expect(crashTools).toContain('crashes_comment_update');
      expect(crashTools).toContain('crashes_comment_delete');
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
      
      expect(isToolAllowed('apps_list', config)).toBe(true);
      expect(isToolAllowed('apps_create', config)).toBe(true);
    });

    it('should deny tool when operation is not permitted', () => {
      const config = {
        apps: new Set<'C' | 'R' | 'U' | 'D'>(['R']),
      };
      
      expect(isToolAllowed('apps_create', config)).toBe(false);
      expect(isToolAllowed('apps_delete', config)).toBe(false);
    });

    it('should deny tool when category is disabled', () => {
      const config = {
        apps: new Set<'C' | 'R' | 'U' | 'D'>(),
      };
      
      expect(isToolAllowed('apps_list', config)).toBe(false);
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
        { name: 'apps_list' },
        { name: 'apps_create' },
        { name: 'apps_delete' },
      ];
      
      const config = {
        apps: new Set<'C' | 'R' | 'U' | 'D'>(['R']),
      };
      
      const filtered = filterTools(tools, config);
      expect(filtered).toHaveLength(1);
      expect(filtered[0].name).toBe('apps_list');
    });

    it('should allow all tools with full permissions', () => {
      const tools = [
        { name: 'apps_list' },
        { name: 'apps_create' },
        { name: 'apps_delete' },
      ];
      
      const config = {
        apps: new Set<'C' | 'R' | 'U' | 'D'>(['C', 'R', 'U', 'D']),
      };
      
      const filtered = filterTools(tools, config);
      expect(filtered).toHaveLength(3);
    });

    it('should filter out all tools when category is disabled', () => {
      const tools = [
        { name: 'apps_list' },
        { name: 'apps_create' },
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
      expect(isToolAllowed('apps_create', config)).toBe(false);
      expect(isToolAllowed('apps_delete', config)).toBe(false);
      expect(isToolAllowed('crashes_comment_add', config)).toBe(false);
      
      // All read operations should be allowed
      expect(isToolAllowed('apps_list', config)).toBe(true);
      expect(isToolAllowed('get_analytics_data', config)).toBe(true);
      expect(isToolAllowed('crashes_get', config)).toBe(true);
    });

    it('should support selective category access', () => {
      const config = loadToolsConfig({
        COUNTLY_TOOLS_ALL: 'NONE',
        COUNTLY_TOOLS_ANALYTICS: 'R',
        COUNTLY_TOOLS_APPS: 'R',
      });
      
      // Allowed categories
      expect(isToolAllowed('get_analytics_data', config)).toBe(true);
      expect(isToolAllowed('apps_list', config)).toBe(true);
      
      // Disabled categories
      expect(isToolAllowed('crash_groups_list', config)).toBe(false);
      expect(isToolAllowed('notes_create', config)).toBe(false);
      expect(isToolAllowed('databases_query', config)).toBe(false);
    });

    it('should support no-delete policy', () => {
      const config = loadToolsConfig({
        COUNTLY_TOOLS_ALL: 'CRU',
      });
      
      // Delete operations should be denied
      expect(isToolAllowed('apps_delete', config)).toBe(false);
      expect(isToolAllowed('app_users_delete', config)).toBe(false);
      expect(isToolAllowed('crashes_comment_delete', config)).toBe(false);
      expect(isToolAllowed('notes_delete', config)).toBe(false);
      
      // Other operations should be allowed
      expect(isToolAllowed('apps_create', config)).toBe(true);
      expect(isToolAllowed('apps_update', config)).toBe(true);
      expect(isToolAllowed('apps_list', config)).toBe(true);
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
      expect(categoriesRequiringCheck).toContain('hooks');
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
      expect(getRequiredPlugin('hooks')).toBe('hooks');
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
        { name: 'apps_list' },
        { name: 'alerts_list' },
        { name: 'crash_groups_list' },
        { name: 'views_table' },
        { name: 'app_analytics_summary' },
        { name: 'databases_query' },
      ];
      
      const config = loadToolsConfig({ COUNTLY_TOOLS_ALL: 'CRUD' });
      
      // With crashes, views, and dbviewer plugins
      const plugins1 = ['crashes', 'views', 'dbviewer'];
      const filtered1 = filterToolsByPlugins(mockTools, config, plugins1);
      expect(filtered1.map(t => t.name)).toContain('apps_list');
      expect(filtered1.map(t => t.name)).toContain('crash_groups_list');
      expect(filtered1.map(t => t.name)).toContain('views_table');
      expect(filtered1.map(t => t.name)).toContain('databases_query');
      expect(filtered1.map(t => t.name)).toContain('app_analytics_summary');
      expect(filtered1.map(t => t.name)).not.toContain('alerts_list');
      
      // With alerts plugin only
      const plugins2 = ['alerts'];
      const filtered2 = filterToolsByPlugins(mockTools, config, plugins2);
      expect(filtered2.map(t => t.name)).toContain('apps_list');
      expect(filtered2.map(t => t.name)).toContain('alerts_list');
      expect(filtered2.map(t => t.name)).toContain('app_analytics_summary');
      expect(filtered2.map(t => t.name)).not.toContain('crash_groups_list');
      expect(filtered2.map(t => t.name)).not.toContain('views_table');
      expect(filtered2.map(t => t.name)).not.toContain('databases_query');
      
      // With no optional plugins
      const plugins3: string[] = [];
      const filtered3 = filterToolsByPlugins(mockTools, config, plugins3);
      expect(filtered3.map(t => t.name)).toContain('apps_list');
      expect(filtered3.map(t => t.name)).toContain('app_analytics_summary');
      expect(filtered3.map(t => t.name)).not.toContain('alerts_list');
      expect(filtered3.map(t => t.name)).not.toContain('crash_groups_list');
      expect(filtered3.map(t => t.name)).not.toContain('views_table');
      expect(filtered3.map(t => t.name)).not.toContain('databases_query');
    });

    it('should combine config and plugin filtering', async () => {
      const { filterToolsByPlugins } = await import('../src/lib/tools-config.js');
      
      const mockTools = [
        { name: 'alerts_list' },
        { name: 'alerts_create' },
        { name: 'alerts_delete' },
      ];
      
      // Allow only read operations
      const config = loadToolsConfig({ COUNTLY_TOOLS_ALL: 'R' });
      const plugins = ['alerts']; // Plugin is available
      
      const filtered = filterToolsByPlugins(mockTools, config, plugins);
      expect(filtered.map(t => t.name)).toContain('alerts_list'); // R operation
      expect(filtered.map(t => t.name)).not.toContain('alerts_create'); // C operation
      expect(filtered.map(t => t.name)).not.toContain('alerts_delete'); // D operation
    });
  });
});

/**
 * Tool Handler Validation Tests
 * Ensures that all tool handlers map to existing methods on their respective classes
 */
describe('Tool Handler Validation', () => {
  // Create a minimal mock context for testing
  const mockContext: ToolContext = {
    resolveAppId: async () => 'test-app-id',
    getAuthParams: () => ({}),
    httpClient: {} as any,
    appCache: {
      getAll: () => [],
      findById: () => null,
      findByName: () => null,
      resolveAppName: () => 'test-app-id',
      clear: () => {},
      size: () => 0,
      isExpired: () => false,
      update: () => {},
    } as any,
    getApps: async () => [],
  };

  describe('Handler Method Existence', () => {
    it('should have all handler methods defined on their respective tool classes', () => {
      const toolMetadataList = getAllToolMetadata();

      for (const metadata of toolMetadataList) {
        // Create an instance of the tool class
        const instance = new metadata.toolClass(mockContext);

        // Check each handler mapping
        for (const [_toolName, methodName] of Object.entries(metadata.handlers)) {
          const method = (instance as any)[methodName];
          expect(typeof method).toBe('function');
          expect(method).toBeDefined();
        }
      }
    });

    it('should not have any undefined handler methods', () => {
      const toolMetadataList = getAllToolMetadata();

      for (const metadata of toolMetadataList) {
        // Create an instance of the tool class
        const instance = new metadata.toolClass(mockContext);

        // Check that no handler points to undefined methods
        for (const [_toolName, methodName] of Object.entries(metadata.handlers)) {
          const method = (instance as any)[methodName];
          expect(method).not.toBeUndefined();
          expect(method).not.toBeNull();
        }
      }
    });
  });

  describe('Handler Mapping Structure', () => {
    it('should have handlers as objects with string keys and string values', () => {
      const toolMetadataList = getAllToolMetadata();

      for (const metadata of toolMetadataList) {
        expect(typeof metadata.handlers).toBe('object');
        expect(metadata.handlers).not.toBeNull();

        for (const [toolName, methodName] of Object.entries(metadata.handlers)) {
          expect(typeof toolName).toBe('string');
          expect(typeof methodName).toBe('string');
          expect(toolName.length).toBeGreaterThan(0);
          expect(methodName.length).toBeGreaterThan(0);
        }
      }
    });
  });
});
