import { describe, it, expect, vi } from 'vitest';
import {
  getAllToolDefinitions,
  getAllToolMetadata,
  getAllToolHandlers,
} from '../src/tools/index.js';
import { ToolContext } from '../src/tools/types.js';

/**
 * Regression tests for tool registration and dispatch routing.
 *
 * Guards against the bug where hooks.ts and times-of-day.ts exported tools
 * that appeared in tools/list (getAllToolDefinitions) but were absent from
 * getAllToolMetadata(), which is the ONLY routing source the
 * CallToolRequestSchema dispatcher in src/index.ts uses. Calling those tools
 * threw McpError MethodNotFound ("Unknown tool") even though clients could
 * see them. Their inputSchemas were also live zod objects instead of JSON
 * Schema, so they serialized as zod internals in the tools/list response.
 */

function makeContext(): ToolContext {
  return {
    httpClient: {
      get: vi.fn().mockResolvedValue({ data: { result: 'success' } }),
      post: vi.fn(),
    } as any,
    appCache: vi.fn() as any,
    getAuthParams: vi.fn().mockReturnValue({ auth_token: 'test' }),
    resolveAppId: vi.fn().mockResolvedValue('app123'),
    getApps: vi.fn(),
  };
}

/**
 * Rebuild the routing tables exactly the way the dispatcher in
 * src/index.ts setupToolHandlers() does.
 */
function buildDispatchTables() {
  const toolHandlers: Record<string, string> = {};
  const instanceMap: Record<string, any> = {};

  for (const metadata of getAllToolMetadata()) {
    for (const [toolName, methodName] of Object.entries(metadata.handlers)) {
      toolHandlers[toolName] = methodName as string;
      instanceMap[toolName] = metadata;
    }
  }

  return { toolHandlers, instanceMap };
}

describe('every listed tool is routable by the dispatcher', () => {
  const { toolHandlers, instanceMap } = buildDispatchTables();

  it.each(getAllToolDefinitions().map((d) => [d.name]))(
    '%s has a metadata route with an existing handler method',
    (name) => {
      const methodName = toolHandlers[name];
      const metadata = instanceMap[name];

      // Missing route => dispatcher throws McpError MethodNotFound
      expect(methodName, `tool "${name}" is listed but not routable`).toBeDefined();
      expect(metadata).toBeDefined();

      // The method must actually exist on the tool class
      expect(typeof metadata.toolClass.prototype[methodName]).toBe('function');
    }
  );

  it('metadata routes and getAllToolHandlers() agree', () => {
    expect(getAllToolHandlers()).toEqual(toolHandlers);
  });

  it('no two metadata entries share an instanceKey with a different class', () => {
    const byKey: Record<string, any> = {};
    for (const metadata of getAllToolMetadata()) {
      if (byKey[metadata.instanceKey]) {
        expect(byKey[metadata.instanceKey]).toBe(metadata.toolClass);
      }
      byKey[metadata.instanceKey] = metadata.toolClass;
    }
  });
});

describe('every tool definition ships a JSON Schema, not a zod schema', () => {
  // KNOWN OFFENDERS: these modules still declare inputSchema with zod, which
  // serializes as {"def":{...}} (no properties, no descriptions) in the
  // tools/list response. They route correctly, but clients cannot see their
  // parameters. Remove entries from this set as each module is migrated to
  // plain JSON Schema — do NOT add new entries.
  const KNOWN_ZOD_SCHEMA_MODULES = new Set([
    // datapoint.ts
    'datapoints_stats', 'datapoints_top_apps', 'datapoints_punch_card',
    // server-logs.ts
    'server_logs_files_list', 'server_logs_contents',
    // dashboards.ts
    'dashboards_list', 'dashboards_data', 'dashboards_create',
    'dashboards_update', 'dashboards_delete', 'dashboards_widget_add',
    'dashboards_widget_update', 'dashboards_widget_remove',
    // email-reports.ts
    'email_reports_list', 'email_reports_core_create',
    'email_reports_dashboard_create', 'email_reports_update',
    'email_reports_preview', 'email_reports_send', 'email_reports_delete',
  ]);

  const definitionsToCheck = getAllToolDefinitions().filter(
    (d) => !KNOWN_ZOD_SCHEMA_MODULES.has(d.name)
  );

  it.each(definitionsToCheck.map((d) => [d.name, d]))(
    '%s inputSchema is a plain JSON Schema object',
    (_name, definition: any) => {
      const schema = definition.inputSchema;

      expect(schema).toBeTypeOf('object');
      // A zod schema exposes parse/safeParse and internals — JSON Schema must not
      expect(schema.safeParse).toBeUndefined();
      expect(schema._def).toBeUndefined();
      expect(schema.def).toBeUndefined();
      expect(schema.type).toBe('object');
      expect(schema.properties).toBeTypeOf('object');

      // Must survive the JSON round-trip the MCP transport performs unchanged
      expect(JSON.parse(JSON.stringify(schema))).toEqual(schema);
    }
  );

  it('the known-offender list does not contain already-migrated tools', () => {
    for (const definition of getAllToolDefinitions() as any[]) {
      if (KNOWN_ZOD_SCHEMA_MODULES.has(definition.name)) {
        expect(
          typeof definition.inputSchema.safeParse,
          `"${definition.name}" is migrated — remove it from KNOWN_ZOD_SCHEMA_MODULES`
        ).toBe('function');
      }
    }
  });
});

describe('hooks and times_of_day dispatch end-to-end via metadata routing', () => {
  const { toolHandlers, instanceMap } = buildDispatchTables();

  async function dispatch(name: string, args: Record<string, unknown>) {
    const methodName = toolHandlers[name];
    const metadata = instanceMap[name];
    expect(methodName).toBeDefined();
    const instance = new metadata.toolClass(makeContext());
    return instance[methodName](args);
  }

  it('hooks_list executes and returns MCP content', async () => {
    const result = await dispatch('hooks_list', { app_id: 'app123' });
    expect(result.content[0].type).toBe('text');
    expect(result.content[0].text).toContain('Hooks for app app123');
  });

  it('hooks_create executes with a full config', async () => {
    const result = await dispatch('hooks_create', {
      app_id: 'app123',
      name: 'notify',
      description: 'notify on event',
      apps: ['app123'],
      trigger_type: 'IncomingDataTrigger',
      trigger_config: '{"event":["app123***purchase"]}',
      effects: '[{"type":"HTTPEffect","configuration":{"url":"https://example.com","method":"post"}}]',
    });
    expect(result.content[0].text).toContain('Hook created successfully');
  });

  it('hooks_create defaults enabled to true when omitted', async () => {
    const context = makeContext();
    const metadata = instanceMap['hooks_create'];
    const instance = new metadata.toolClass(context);
    await instance[toolHandlers['hooks_create']]({
      app_id: 'app123',
      name: 'notify',
      description: 'notify on event',
      apps: ['app123'],
      trigger_type: 'IncomingDataTrigger',
      trigger_config: '{"event":["app123***purchase"]}',
      effects: '[]',
    });

    const call = (context.httpClient.get as any).mock.calls[0];
    expect(call[0]).toBe('/i/hook/save');
    const hookConfig = JSON.parse(call[1].params.hook_config);
    expect(hookConfig.enabled).toBe(true);
  });

  it('times_of_day executes and passes event key and period through', async () => {
    const context = makeContext();
    const metadata = instanceMap['times_of_day'];
    const instance = new metadata.toolClass(context);
    const result = await instance[toolHandlers['times_of_day']]({
      app_id: 'app123',
      event_key: '[CLY]_session',
      period: '30days',
    });

    expect(result.content[0].text).toContain('Times of day pattern for app app123');
    const call = (context.httpClient.get as any).mock.calls[0];
    expect(call[0]).toBe('/o');
    expect(call[1].params.method).toBe('times-of-day');
    expect(call[1].params.tod_type).toBe('[CLY]_session');
    expect(call[1].params.period).toBe('30days');
  });
});
