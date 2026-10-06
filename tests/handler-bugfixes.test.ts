import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleCreateNote, handleListNotes } from '../src/tools/notes.js';
import { handleCreateHook, handleUpdateHook } from '../src/tools/hooks.js';
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

describe('notes.ts handleCreateNote: app binding and visibility', () => {
  it('sends app_id as a top-level parameter', async () => {
    // Countly binds the note to the top-level app_id and ignores args.app_id;
    // without it notes were saved with app_id "undefined" and never listed.
    const context = makeContext();
    await handleCreateNote(context, { app_id: 'app123', note: 'Release', ts: 1700000000 });

    const params = (context.httpClient.get as any).mock.calls[0][1].params;
    expect(params.app_id).toBe('app123');
    expect(JSON.parse(params.args).app_id).toBe('app123');
  });

  it('defaults noteType to private, which Countly requires', async () => {
    const context = makeContext();
    await handleCreateNote(context, { app_id: 'app123', note: 'Release', ts: 1700000000 });

    const params = (context.httpClient.get as any).mock.calls[0][1].params;
    expect(JSON.parse(params.args).noteType).toBe('private');
  });
});

describe('notes.ts handleListNotes: note count', () => {
  it('counts the aaData rows, not the response keys', async () => {
    const context = makeContext();
    (context.httpClient.get as any).mockResolvedValue({
      data: { aaData: [], iTotalDisplayRecords: 0, iTotalRecords: 0, sEcho: 1 },
    });
    const result = await handleListNotes(context, { app_id: 'app123' });
    expect(result.content[0].text).toMatch(/^Found 0 note\(s\)/);
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
    await expect(
      handleUpdateHook(context, {
        hook_id: 'hook-42',
        trigger_type: 'IncomingDataTrigger',
      })
    ).rejects.toSatisfy((err: unknown) => {
      return (
        err instanceof McpError &&
        err.code === ErrorCode.InvalidParams &&
        /trigger_type and trigger_config must be provided together/.test(err.message)
      );
    });
  });

  it('rejects supplying only trigger_config with an InvalidParams McpError', async () => {
    await expect(
      handleUpdateHook(context, {
        hook_id: 'hook-42',
        trigger_config: '{"event":["app123***foo"]}',
      })
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

    await expect(
      handleUpdateHook(context, {
        hook_id: 'hook-42',
        trigger_type: 'IncomingDataTrigger',
        trigger_config: '{"event":["app123***foo"]}',
      })
    ).resolves.toBeDefined();
  });

  it('accepts neither (keeps existing trigger)', async () => {
    (context.httpClient.get as any).mockResolvedValueOnce({
      data: { result: 'success' },
    });

    await expect(
      handleUpdateHook(context, {
        hook_id: 'hook-42',
        name: 'renamed',
      })
    ).resolves.toBeDefined();
  });
});

describe('hooks.ts: malformed JSON params surface as InvalidParams, not raw SyntaxError', () => {
  const isInvalidParams = (paramName: string) => (err: unknown) =>
    err instanceof McpError &&
    err.code === ErrorCode.InvalidParams &&
    err.message.includes(paramName);

  it('hooks_create rejects invalid trigger_config JSON', async () => {
    await expect(
      handleCreateHook(makeContext(), {
        app_id: 'app123',
        name: 'notify',
        description: 'notify on event',
        apps: ['app123'],
        trigger_type: 'IncomingDataTrigger',
        trigger_config: '{not json',
        effects: '[]',
      })
    ).rejects.toSatisfy(isInvalidParams('trigger_config'));
  });

  it('hooks_create rejects invalid effects JSON', async () => {
    await expect(
      handleCreateHook(makeContext(), {
        app_id: 'app123',
        name: 'notify',
        description: 'notify on event',
        apps: ['app123'],
        trigger_type: 'IncomingDataTrigger',
        trigger_config: '{"event":["app123***foo"]}',
        effects: '[not json',
      })
    ).rejects.toSatisfy(isInvalidParams('effects'));
  });

  it('hooks_update rejects invalid trigger_config JSON', async () => {
    const context = makeContext();
    (context.httpClient.get as any).mockResolvedValueOnce({
      data: [{ _id: 'hook-42', name: 'n', apps: ['app123'], trigger: {}, effects: [], enabled: true }],
    });
    await expect(
      handleUpdateHook(context, {
        hook_id: 'hook-42',
        trigger_type: 'IncomingDataTrigger',
        trigger_config: '{not json',
      })
    ).rejects.toSatisfy(isInvalidParams('trigger_config'));
  });

  it('hooks_update rejects invalid effects JSON', async () => {
    const context = makeContext();
    (context.httpClient.get as any).mockResolvedValueOnce({
      data: [{ _id: 'hook-42', name: 'n', apps: ['app123'], trigger: {}, effects: [], enabled: true }],
    });
    await expect(
      handleUpdateHook(context, {
        hook_id: 'hook-42',
        effects: '[not json',
      })
    ).rejects.toSatisfy(isInvalidParams('effects'));
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
