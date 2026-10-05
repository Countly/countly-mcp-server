/**
 * Tests for the library entry point (src/library.ts): the in-process handler a
 * host such as Countly mounts at /v2/mcp.
 *
 * A local HTTP server stands in for the Countly API and records every request
 * it receives; a second local server plays the host and hands requests to the
 * handler with a per-test McpRequestContext.
 */

import http from 'http';
import type { AddressInfo } from 'net';

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  createMcpHandler,
  getToolCatalog,
  getUnclassifiedTools,
  toolsCalledIn,
  type McpRequestContext,
  type ToolCallReport,
} from '../src/library.js';
import { TOOL_AREAS, TOOL_CATEGORIES } from '../src/lib/tools-config.js';
import { getAllToolDefinitions } from '../src/tools/index.js';

// ---------------------------------------------------------------------------
// Fake Countly
// ---------------------------------------------------------------------------

interface RecordedRequest {
  method: string;
  url: string;
  headers: http.IncomingHttpHeaders;
}

const APPS_BY_TOKEN: Record<string, Array<{ _id: string; name: string }>> = {
  'token-a': [
    { _id: 'app1', name: 'Alpha' },
    { _id: 'app2', name: 'Beta' },
  ],
  'token-b': [{ _id: 'app9', name: 'Gamma' }],
};

let countlyRequests: RecordedRequest[] = [];
let pingStatus = 200;
let countlyServer: http.Server;
let countlyUrl: string;

// ---------------------------------------------------------------------------
// Host
// ---------------------------------------------------------------------------

let hostServer: http.Server;
let hostUrl: string;
let reports: ToolCallReport[] = [];
let currentContext: McpRequestContext;
let throwingCallback = false;

function context(overrides: Partial<McpRequestContext> = {}): McpRequestContext {
  return {
    upstreamToken: 'token-a',
    grantId: 'grant-a',
    operations: ['C', 'R', 'U', 'D'],
    admin: true,
    ...overrides,
  };
}

function listen(server: http.Server): Promise<string> {
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      resolve(`http://127.0.0.1:${port}`);
    });
  });
}

beforeAll(async () => {
  countlyServer = http.createServer((req, res) => {
    countlyRequests.push({ method: req.method || '', url: req.url || '', headers: req.headers });
    const path = new URL(req.url || '/', 'http://x').pathname;
    const token = req.headers['countly-token'] as string;
    res.setHeader('Content-Type', 'application/json');
    if (path === '/o/apps/mine') {
      res.end(JSON.stringify(APPS_BY_TOKEN[token] || []));
      return;
    }
    if (path === '/o/ping') {
      res.statusCode = pingStatus;
      res.end(JSON.stringify(pingStatus === 200 ? { result: 'success' } : { result: 'Token not valid' }));
      return;
    }
    res.end(JSON.stringify({ result: 'ok' }));
  });
  countlyUrl = await listen(countlyServer);

  hostServer = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      const body = raw ? JSON.parse(raw) : undefined;
      handler.handle(req, res, body, currentContext).catch((err) => {
        res.statusCode = 500;
        res.end(String(err));
      });
    });
  });
  hostUrl = await listen(hostServer);
});

afterAll(async () => {
  await new Promise((r) => hostServer.close(r));
  await new Promise((r) => countlyServer.close(r));
});

// Created lazily so it captures countlyUrl after the fake Countly is listening.
let handler: ReturnType<typeof createMcpHandler>;

const ENV_KEYS = ['COUNTLY_AUTH_TOKEN', 'COUNTLY_SERVER_URL', 'COUNTLY_AUTH_TOKEN_FILE'];
const savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  countlyRequests = [];
  reports = [];
  pingStatus = 200;
  throwingCallback = false;
  currentContext = context();
  for (const key of ENV_KEYS) {
    savedEnv[key] = process.env[key];
  }
  // Credentials the standalone modes would pick up. Library mode must not.
  process.env.COUNTLY_AUTH_TOKEN = 'env-token';
  process.env.COUNTLY_SERVER_URL = 'http://127.0.0.1:1';
  handler = createMcpHandler({
    countlyUrl,
    onToolCall: (r) => {
      reports.push(r);
      if (throwingCallback) {
        throw new Error('callback exploded');
      }
    },
  });
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = savedEnv[key];
    }
  }
});

// ---------------------------------------------------------------------------
// Minimal MCP client
// ---------------------------------------------------------------------------

let nextId = 1;

async function rpc(
  method: string,
  params: Record<string, unknown> = {},
  opts: { headers?: Record<string, string>; query?: string } = {}
): Promise<any> {
  const id = nextId++;
  const response = await fetch(`${hostUrl}/v2/mcp${opts.query || ''}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      ...(opts.headers || {}),
    },
    body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
  });
  const text = await response.text();
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('text/event-stream')) {
    const data = text
      .split('\n')
      .filter((line) => line.startsWith('data:'))
      .map((line) => JSON.parse(line.slice(5).trim()))
      .find((msg) => msg.id === id);
    return data;
  }
  return JSON.parse(text);
}

async function listToolNames(): Promise<string[]> {
  const res = await rpc('tools/list');
  return res.result.tools.map((t: { name: string }) => t.name);
}

function callTool(name: string, args: Record<string, unknown> = {}, opts = {}) {
  return rpc('tools/call', { name, arguments: args }, opts);
}

// ---------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------

describe('getToolCatalog', () => {
  it('classifies every registered tool (category, operation, area)', () => {
    expect(getUnclassifiedTools()).toEqual([]);
    const catalog = getToolCatalog();
    const registered = getAllToolDefinitions().map((t) => t.name).sort();
    expect(catalog.map((t) => t.name).sort()).toEqual(registered);
    for (const tool of catalog) {
      expect(tool.category, tool.name).toBeTruthy();
      expect(['C', 'R', 'U', 'D'], tool.name).toContain(tool.operation);
      expect(TOOL_AREAS, tool.name).toContain(tool.area);
      expect(typeof tool.adminOnly, tool.name).toBe('boolean');
    }
  });

  it('gives every category an area', () => {
    for (const [category, data] of Object.entries(TOOL_CATEGORIES)) {
      expect(TOOL_AREAS, category).toContain(data.area);
    }
  });

  it('marks global-admin tools as adminOnly', () => {
    const byName = new Map(getToolCatalog().map((t) => [t.name, t]));
    for (const name of ['apps_create', 'apps_update', 'apps_delete', 'apps_reset', 'get_plugins',
      'dashboard_users', 'databases_query', 'server_logs_contents', 'datapoints_stats']) {
      expect(byName.get(name)?.adminOnly, name).toBe(true);
    }
    for (const name of ['apps_list', 'ping', 'events_list', 'funnels_data']) {
      expect(byName.get(name)?.adminOnly, name).toBe(false);
    }
  });

  it('matches the catalog snapshot', () => {
    const catalog = getToolCatalog()
      .map((t) => `${t.name} ${t.category} ${t.operation} ${t.area}${t.adminOnly ? ' admin' : ''}${t.requiresPlugin ? ` plugin=${t.requiresPlugin}` : ''}`)
      .sort();
    expect(catalog).toMatchSnapshot();
  });

  it('returns copies so callers cannot mutate the catalog', () => {
    const first = getToolCatalog();
    first[0].adminOnly = !first[0].adminOnly;
    expect(getToolCatalog()[0].adminOnly).toBe(!first[0].adminOnly);
  });
});

// ---------------------------------------------------------------------------
// toolsCalledIn
// ---------------------------------------------------------------------------

describe('toolsCalledIn', () => {
  it('returns the tool of a single call', () => {
    expect(toolsCalledIn({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'apps_list' } }))
      .toEqual(['apps_list']);
  });

  it('collects tools from a batch, once each', () => {
    expect(toolsCalledIn([
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'apps_list' } },
      { jsonrpc: '2.0', id: 2, method: 'tools/list' },
      { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'apps_delete', arguments: {} } },
      { jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'apps_list' } },
    ])).toEqual(['apps_list', 'apps_delete']);
  });

  it('ignores non-call methods and malformed input', () => {
    expect(toolsCalledIn({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} })).toEqual([]);
    expect(toolsCalledIn({ jsonrpc: '2.0', method: 'notifications/initialized' })).toEqual([]);
    expect(toolsCalledIn({ method: 'tools/call' })).toEqual([]);
    expect(toolsCalledIn({ method: 'tools/call', params: { name: 42 } })).toEqual([]);
    expect(toolsCalledIn(null)).toEqual([]);
    expect(toolsCalledIn(undefined)).toEqual([]);
    expect(toolsCalledIn('tools/call')).toEqual([]);
    expect(toolsCalledIn([null, 1, 'x'])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Credentials
// ---------------------------------------------------------------------------

describe('library mode credentials', () => {
  it('uses only context.upstreamToken and options.countlyUrl', async () => {
    const res = await callTool(
      'ping',
      { countly_auth_token: 'arg-token' },
      {
        headers: {
          'X-Countly-Auth-Token': 'header-token',
          'X-Countly-Server-Url': 'http://127.0.0.1:2',
        },
        query: '?auth_token=query-token&server_url=http://127.0.0.1:3',
      }
    );
    expect(res.result.content[0].text).toContain('success');
    expect(countlyRequests).toHaveLength(1);
    const [request] = countlyRequests;
    expect(request.url).toBe('/o/ping');
    expect(request.headers['countly-token']).toBe('token-a');
    const everything = JSON.stringify(countlyRequests);
    for (const leaked of ['arg-token', 'header-token', 'query-token', 'env-token']) {
      expect(everything).not.toContain(leaked);
    }
  });

  it('never puts the token in the query string', async () => {
    await callTool('apps_list');
    expect(countlyRequests.map((r) => r.url)).toEqual(['/o/apps/mine']);
    expect(countlyRequests[0].headers['countly-token']).toBe('token-a');
  });

  it('rejects a context without a token', async () => {
    const res = { on: () => undefined } as unknown as http.ServerResponse;
    await expect(handler.handle({} as http.IncomingMessage, res, {}, context({ upstreamToken: '' })))
      .rejects.toThrow(/upstreamToken/);
  });

  it('requires options.countlyUrl', () => {
    expect(() => createMcpHandler({} as any)).toThrow(/countlyUrl/);
  });
});

// ---------------------------------------------------------------------------
// Filtering
// ---------------------------------------------------------------------------

describe('tool filtering', () => {
  it('lists no create/update/delete tools for a read-only context', async () => {
    currentContext = context({ operations: ['R'] });
    const names = await listToolNames();
    expect(names.length).toBeGreaterThan(0);
    const byName = new Map(getToolCatalog().map((t) => [t.name, t]));
    for (const name of names) {
      expect(byName.get(name)?.operation, name).toBe('R');
    }
    expect(names).not.toContain('events_create');
    expect(names).not.toContain('events_delete');
  });

  it('refuses a call to a filtered tool with a JSON-RPC error and no Countly request', async () => {
    currentContext = context({ operations: ['R'] });
    const res = await callTool('events_create', { app_id: 'app1', key: 'purchase' });
    expect(res.error).toBeDefined();
    expect(res.result).toBeUndefined();
    expect(countlyRequests).toHaveLength(0);
    expect(reports).toHaveLength(1);
    expect(reports[0]).toMatchObject({ tool: 'events_create', operation: 'C', outcome: 'no_access' });
  });

  it('hides admin-only tools unless the context is admin', async () => {
    currentContext = context({ admin: false });
    const names = await listToolNames();
    expect(names).not.toContain('apps_delete');
    expect(names).not.toContain('get_plugins');
    expect(names).toContain('apps_list');

    const res = await callTool('get_plugins');
    expect(res.error).toBeDefined();
    expect(countlyRequests).toHaveLength(0);

    currentContext = context({ admin: true });
    const adminNames = await listToolNames();
    expect(adminNames).toContain('apps_delete');
    expect(adminNames).toContain('get_plugins');
  });

  it('answers an unknown tool like a filtered one', async () => {
    const res = await callTool('no_such_tool');
    expect(res.error).toBeDefined();
    expect(reports).toHaveLength(0);
  });

  it('applies the optional plugin check', async () => {
    handler = createMcpHandler({ countlyUrl, isPluginEnabled: (p) => p !== 'crashes' });
    const names = await listToolNames();
    expect(names).not.toContain('crash_groups_list');
    expect(names).toContain('funnels_list');
    expect(names).toContain('ping');
  });
});

// ---------------------------------------------------------------------------
// App allow-list
// ---------------------------------------------------------------------------

describe('app allow-list', () => {
  it('limits app lists to context.apps', async () => {
    currentContext = context({ apps: ['app1'] });
    const res = await callTool('apps_list');
    const text = res.result.content[0].text;
    expect(text).toContain('app1');
    expect(text).not.toContain('app2');
  });

  it('refuses an app outside context.apps without calling Countly', async () => {
    currentContext = context({ apps: ['app1'] });
    const res = await callTool('events_list', { app_id: 'app2' });
    expect(res.error).toBeDefined();
    expect(countlyRequests).toHaveLength(0);
    expect(reports[0]).toMatchObject({ outcome: 'no_access', appId: 'app2' });
  });

  it('does not resolve an app name outside context.apps', async () => {
    currentContext = context({ apps: ['app1'] });
    const res = await callTool('events_list', { app_name: 'Beta' });
    expect(res.error).toBeDefined();
    expect(countlyRequests.map((r) => r.url)).toEqual(['/o/apps/mine']);
  });
});

// ---------------------------------------------------------------------------
// onToolCall
// ---------------------------------------------------------------------------

describe('onToolCall', () => {
  it('reports success with duration', async () => {
    await callTool('ping');
    expect(reports).toHaveLength(1);
    expect(reports[0]).toMatchObject({
      tool: 'ping', category: 'core', operation: 'R', area: 'Other', outcome: 'success', grantId: 'grant-a',
    });
    expect(reports[0].durationMs).toBeGreaterThanOrEqual(0);
  });

  it('reports the app a call resolved', async () => {
    await callTool('events_list', { app_name: 'Alpha' });
    expect(reports[0]).toMatchObject({ tool: 'events_list', appId: 'app1', outcome: 'success' });
  });

  it('reports no_access when Countly answers 401 or 403', async () => {
    for (const status of [401, 403]) {
      reports = [];
      pingStatus = status;
      const res = await callTool('ping');
      expect(res.error).toBeDefined();
      expect(reports[0].outcome).toBe('no_access');
    }
  });

  it('reports failed for other errors', async () => {
    pingStatus = 500;
    const res = await callTool('ping');
    expect(res.error).toBeDefined();
    expect(reports[0].outcome).toBe('failed');
  });

  it('does not let a throwing callback break the call', async () => {
    throwingCallback = true;
    const res = await callTool('ping');
    expect(res.result.content[0].text).toContain('success');
    expect(reports).toHaveLength(1);
  });

  it('does not let a rejecting async callback break the call', async () => {
    // A host may pass an async callback despite the void signature.
    const rejecting = (() => Promise.reject(new Error('async callback exploded'))) as unknown as
      (report: ToolCallReport) => void;
    handler = createMcpHandler({ countlyUrl, onToolCall: rejecting });
    const res = await callTool('ping');
    expect(res.result.content[0].text).toContain('success');
  });
});

// ---------------------------------------------------------------------------
// Cache isolation
// ---------------------------------------------------------------------------

describe('app cache isolation', () => {
  it('does not share app caches between grants', async () => {
    currentContext = context({ upstreamToken: 'token-a', grantId: 'grant-a' });
    const a = await callTool('apps_list');
    expect(a.result.content[0].text).toContain('Alpha');

    // Same grant: served from cache, no second Countly request.
    await callTool('apps_list');
    expect(countlyRequests).toHaveLength(1);

    currentContext = context({ upstreamToken: 'token-b', grantId: 'grant-b' });
    const b = await callTool('apps_list');
    const text = b.result.content[0].text;
    expect(text).toContain('Gamma');
    expect(text).not.toContain('Alpha');
    expect(countlyRequests).toHaveLength(2);
    expect(countlyRequests[1].headers['countly-token']).toBe('token-b');
  });
});

// ---------------------------------------------------------------------------
// Prompts
// ---------------------------------------------------------------------------

describe('prompts and resources', () => {
  it('serves the static prompts', async () => {
    const res = await rpc('prompts/list');
    expect(res.result.prompts.length).toBeGreaterThan(0);
  });

  it('does not expose resources', async () => {
    const res = await rpc('resources/list');
    expect(res.error).toBeDefined();
  });
});
