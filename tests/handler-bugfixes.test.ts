import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleCreateNote } from '../src/tools/notes.js';
import { hooksHandlers } from '../src/tools/hooks.js';
import { TOOL_CATEGORIES } from '../src/lib/tools-config.js';
import { ToolContext } from '../src/tools/types.js';

/**
 * Regression tests for specific handler bugs surfaced while rewriting
 * tool descriptions in PR #110. Each describe block names the bug it
 * guards against.
 */

function makeContext(): ToolContext {
  return {
    httpClient: {
      get: vi.fn().mockResolvedValue({ data: { result: 'success' } }),
      post: vi.fn(),
    } as any,
    appCache: vi.fn() as any,
    getAuthParams: vi.fn().mockReturnValue({ api_key: 'test' }),
    resolveAppId: vi.fn().mockResolvedValue('app123'),
    getApps: vi.fn(),
  };
}

describe('notes.ts handleCreateNote: color is optional', () => {
  let context: ToolContext;

  beforeEach(() => {
    context = makeContext();
  });

  it('does not crash when color is omitted', async () => {
    // Before the fix: unconditional `color.toLowerCase()` threw TypeError on undefined.
    await expect(
      handleCreateNote(context, {
        app_id: 'app123',
        note: 'Release v1.2.1',
        ts: 1700000000,
      })
    ).resolves.toBeDefined();
  });

  it('defaults color code to 1 (turquoise) when color is omitted', async () => {
    await handleCreateNote(context, {
      app_id: 'app123',
      note: 'Release v1.2.1',
      ts: 1700000000,
    });

    const call = (context.httpClient.get as any).mock.calls[0];
    const argsJson = call[1].params.args;
    const parsedArgs = JSON.parse(argsJson);
    expect(parsedArgs.color).toBe(1);
  });

  it('maps named colors to the correct code when provided', async () => {
    await handleCreateNote(context, {
      app_id: 'app123',
      note: 'Release v1.2.1',
      ts: 1700000000,
      color: 'orange',
    });

    const call = (context.httpClient.get as any).mock.calls[0];
    const parsedArgs = JSON.parse(call[1].params.args);
    expect(parsedArgs.color).toBe(3);
  });

  it('is case-insensitive on color name', async () => {
    await handleCreateNote(context, {
      app_id: 'app123',
      note: 'Release v1.2.1',
      ts: 1700000000,
      color: 'BLUE',
    });

    const call = (context.httpClient.get as any).mock.calls[0];
    const parsedArgs = JSON.parse(call[1].params.args);
    expect(parsedArgs.color).toBe(5);
  });
});

describe('hooks.ts handleUpdateHook: trigger_type and trigger_config must be paired', () => {
  let context: ToolContext;

  beforeEach(() => {
    context = makeContext();
    // hooks_update first lists hooks to resolve the existing record
    (context.httpClient.get as any).mockResolvedValueOnce({
      data: [
        {
          _id: 'hook-42',
          name: 'old name',
          description: '',
          apps: ['app123'],
          trigger: { type: 'ScheduledTrigger', configuration: { cron: '0 6 * * *' } },
          effects: [],
          enabled: true,
        },
      ],
    });
  });

  it('rejects supplying only trigger_type with an InvalidParams McpError', async () => {
    const handler = hooksHandlers.hooks_update;
    await expect(
      handler(
        {
          hook_id: 'hook-42',
          trigger_type: 'IncomingDataTrigger' as const,
        } as any,
        context
      )
    ).rejects.toSatisfy((err: unknown) => {
      return (
        err instanceof McpError &&
        err.code === ErrorCode.InvalidParams &&
        /trigger_type and trigger_config must be provided together/.test(err.message)
      );
    });
  });

  it('rejects supplying only trigger_config with an InvalidParams McpError', async () => {
    const handler = hooksHandlers.hooks_update;
    await expect(
      handler(
        {
          hook_id: 'hook-42',
          trigger_config: '{"event":["app123***foo"]}',
        } as any,
        context
      )
    ).rejects.toSatisfy((err: unknown) => {
      return (
        err instanceof McpError &&
        err.code === ErrorCode.InvalidParams &&
        /trigger_type and trigger_config must be provided together/.test(err.message)
      );
    });
  });

  it('accepts both fields together', async () => {
    // Second httpClient.get is the /i/hook/save call
    (context.httpClient.get as any).mockResolvedValueOnce({
      data: { result: 'success' },
    });

    const handler = hooksHandlers.hooks_update;
    await expect(
      handler(
        {
          hook_id: 'hook-42',
          trigger_type: 'IncomingDataTrigger' as const,
          trigger_config: '{"event":["app123***foo"]}',
        } as any,
        context
      )
    ).resolves.toBeDefined();
  });

  it('accepts neither (keeps existing trigger)', async () => {
    (context.httpClient.get as any).mockResolvedValueOnce({
      data: { result: 'success' },
    });

    const handler = hooksHandlers.hooks_update;
    await expect(
      handler(
        {
          hook_id: 'hook-42',
          name: 'renamed',
        } as any,
        context
      )
    ).resolves.toBeDefined();
  });
});

describe('tools-config: metadata_get is always available', () => {
  it('metadata_get lives in the metadata category, not drill', () => {
    expect(TOOL_CATEGORIES.metadata).toBeDefined();
    expect(TOOL_CATEGORIES.metadata.operations['metadata_get']).toBe('R');
    expect(TOOL_CATEGORIES.drill.operations).not.toHaveProperty('metadata_get');
  });

  it('metadata category is availableByDefault', () => {
    // The handler returns useful data (custom events, built-in [CLY]_* events,
    // system fields) even without the drill plugin; the category must not
    // require a plugin or it will be hidden on drill-less servers.
    expect(TOOL_CATEGORIES.metadata.availableByDefault).toBe(true);
    expect(TOOL_CATEGORIES.metadata.requiresPlugin).toBeUndefined();
  });
});
