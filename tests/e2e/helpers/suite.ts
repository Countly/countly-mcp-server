/**
 * The live e2e suite, defined once and instantiated per server (one file per
 * edition so vitest runs the servers in parallel).
 *
 * Assertions are about behaviour and structure only, never data values: the
 * dev servers' data changes daily.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { TOOL_GUARDS } from '../../../src/lib/tool-guards.js';
import * as toolsConfig from '../../../src/lib/tools-config.js';
import { findDeep, McpStdioClient, parseResultJson, resultText, type ToolInfo } from './mcp-client.js';
import {
  E2E_PREFIX,
  E2E_SERVERS,
  loadServerConfig,
  requiredEnvVars,
  requireSecrets,
  type E2eServerConfig,
  type Edition,
} from './servers.js';
import { formatSmokeFailures, isReadOnlyTool, smokeReadOnlyTools } from './smoke.js';

/** Tools the admin must NOT see on an edition, and the plugin they need */
const HIDDEN_FOR_ADMIN: Record<Edition, Array<{ tool: string; plugin: string }>> = {
  lite: [
    { tool: 'cohorts_list', plugin: 'cohorts' },
    { tool: 'drill_bookmarks_list', plugin: 'drill' },
  ],
  enterprise: [],
  platform: [
    { tool: 'server_logs_files_list', plugin: 'errorlogs' },
    { tool: 'server_logs_contents', plugin: 'errorlogs' },
  ],
};

/** Tools the admin must see on an edition */
const VISIBLE_FOR_ADMIN: Record<Edition, string[]> = {
  lite: ['apps_list', 'notes_list', 'notes_create', 'apps_create'],
  enterprise: ['cohorts_list', 'drill_bookmarks_list', 'apps_create'],
  platform: ['cohorts_list', 'drill_bookmarks_list', 'apps_create'],
};

/**
 * Tools backed only by Platform's /v2 API (exported once PR #196 lands; empty
 * before that, which skips the check).
 */
const optionalToolSet = (name: string): string[] =>
  [...((toolsConfig as unknown as Record<string, Set<string> | undefined>)[name] ?? [])];
const V2_ONLY_TOOLS = optionalToolSet('V2_ONLY_TOOLS');
/** Tools Platform can't run at all (e.g. databases_stats); also from PR #196 */
const NOT_ON_PLATFORM_TOOLS = optionalToolSet('NOT_ON_PLATFORM_TOOLS');

/** Write tools a read-only user must never see */
const HIDDEN_FOR_READ_ONLY = ['notes_create', 'notes_delete', 'crashes_resolve', 'apps_create', 'apps_delete', 'events_create'];

const STALE_AFTER_MS = 60 * 60 * 1000;
const isStale = (name: unknown) => {
  const match = typeof name === 'string' && name.startsWith(E2E_PREFIX) ? /^mcp-e2e-(\d+)/.exec(name) : null;
  return !!match && Date.now() - Number(match[1]) > STALE_AFTER_MS;
};

const names = (tools: ToolInfo[]) => tools.map((t) => t.name);

function expectDetected(client: McpStdioClient, config: E2eServerConfig) {
  expect(client.stderr).toContain(`Detected ${config.editionLabel}`);
}

async function expectGetVersion(client: McpStdioClient, config: E2eServerConfig) {
  const result = await client.callTool('get_version');
  expect(result.isError, resultText(result)).toBeFalsy();
  expect(resultText(result)).toContain(`Detected edition: ${config.editionLabel}`);
}

/**
 * Fail fast with one clear message when the server is down or rejects the
 * token, instead of every tool failing on its own. get_version needs a valid
 * token (ping doesn't).
 */
async function assertReachable(client: McpStdioClient, config: E2eServerConfig) {
  const result = await client.callTool('get_version')
    .catch((error) => ({ isError: true, content: [{ type: 'text', text: String(error) }] }));
  if (result.isError) {
    throw new Error(`${config.url} is unreachable or rejected the token: ${resultText(result).slice(0, 300)}`);
  }
}

async function expectSmokePasses(client: McpStdioClient, tools: ToolInfo[], appId: string) {
  const outcomes = await smokeReadOnlyTools(client, tools, appId);
  const ok = outcomes.filter((o) => o.status === 'ok').length;
  const skipped = outcomes.filter((o) => o.status === 'skipped');
  console.warn(
    `smoke: ${ok} ok, ${skipped.length} skipped, ${outcomes.length - ok - skipped.length} failed` +
    (skipped.length ? `\n  skipped: ${skipped.map((s) => `${s.tool} (${s.detail})`).join(', ')}` : '')
  );
  const failures = formatSmokeFailures(outcomes);
  expect(failures, `Read-only tools returned isError:\n${failures}`).toBe('');
  expect(ok).toBeGreaterThan(0);
}

/**
 * vitest's JSON reporter (which feeds the nightly failure issue) drops errors
 * thrown from hooks, so setup failures are recorded and rethrown by each test.
 */
function setupGuard() {
  let error: unknown;
  return {
    run: async (fn: () => Promise<void>) => {
      try {
        await fn();
      } catch (e) {
        error = e;
      }
    },
    check: () => {
      if (error) {
        throw error;
      }
    },
  };
}

export function defineLiveSuite(edition: Edition): void {
  const server = E2E_SERVERS[edition];
  const config = loadServerConfig(server);

  if (!config) {
    const missing = requiredEnvVars(server).join(' and ');
    if (requireSecrets) {
      describe(server.editionLabel, () => {
        it('has its e2e secrets configured', () => {
          throw new Error(`MCP_E2E_REQUIRE_SECRETS=1 but ${missing} are not set`);
        });
      });
    } else {
      describe.skip(`${server.editionLabel} (set ${missing} to run)`, () => {
        it('live suite', () => {});
      });
    }
    return;
  }

  describe(`${config.editionLabel} @ ${config.url}`, () => {
    describe('as global admin', () => {
      const client = new McpStdioClient(config.url, config.adminToken);
      let tools: ToolInfo[] = [];
      const setup = setupGuard();

      beforeAll(() => setup.run(async () => {
        await client.start();
        await assertReachable(client, config);
        tools = await client.listTools();
      }));
      afterAll(() => client.stop());

      it('detects the edition', async () => {
        setup.check();
        expectDetected(client, config);
        await expectGetVersion(client, config);
      });

      it('lists the tools this edition supports and hides the rest', () => {
        setup.check();
        const listed = names(tools);
        for (const tool of VISIBLE_FOR_ADMIN[edition]) {
          expect(listed, `${tool} should be listed`).toContain(tool);
        }
        for (const { tool } of HIDDEN_FOR_ADMIN[edition]) {
          expect(listed, `${tool} should be hidden`).not.toContain(tool);
        }
        if (edition === 'platform') {
          for (const tool of NOT_ON_PLATFORM_TOOLS) {
            expect(listed, `${tool} should be hidden on Platform`).not.toContain(tool);
          }
        }
      });

      it.skipIf(HIDDEN_FOR_ADMIN[edition].length === 0)('refuses hidden tools with a missing-plugin message', async () => {
        setup.check();
        for (const { tool, plugin } of HIDDEN_FOR_ADMIN[edition]) {
          const result = await client.callTool(tool, { app_id: config.appId });
          const text = resultText(result);
          expect(result.isError, `${tool}: ${text}`).toBe(true);
          expect(text).toContain(`Tool "${tool}" is not available`);
          expect(text).toContain(`requires the "${plugin}" plugin`);
        }
      });

      it.skipIf(V2_ONLY_TOOLS.length === 0)(
        edition === 'platform' ? 'lists the /v2-only tools' : 'hides and refuses the /v2-only tools',
        async () => {
          setup.check();
          const listed = names(tools);
          if (edition === 'platform') {
            for (const tool of V2_ONLY_TOOLS) {
              expect(listed, `${tool} should be listed on Platform`).toContain(tool);
            }
            return;
          }
          for (const tool of V2_ONLY_TOOLS) {
            expect(listed, `${tool} should be hidden without /v2`).not.toContain(tool);
          }
          const result = await client.callTool(V2_ONLY_TOOLS[0], { app_id: config.appId });
          expect(result.isError, resultText(result)).toBe(true);
          expect(resultText(result)).toMatch(/not available/i);
        }
      );

      it('smoke-calls every visible read-only tool', async () => {
        setup.check();
        await expectSmokePasses(client, tools, config.appId);
      }, 600_000);

      describe('write round-trip', () => {
        const stamp = Date.now();
        const label = `${E2E_PREFIX}${stamp}`;
        let noteId: string | undefined;
        let dashboardId: string | undefined;

        const findNote = async (text: string) => {
          const list = await client.callTool('notes_list', { app_id: config.appId, period: '60days' });
          expect(list.isError, resultText(list)).toBeFalsy();
          return findDeep(parseResultJson(list), (n) => n.note === text)?._id as string | undefined;
        };
        const listDashboards = async () => {
          const list = await client.callTool('dashboards_list');
          expect(list.isError, resultText(list)).toBeFalsy();
          return parseResultJson(list);
        };
        const findDashboard = async (name: string) => {
          const node = findDeep(await listDashboards(), (n) => !Array.isArray(n) && n.name === name);
          return node ? String(node._id ?? node.id) : undefined;
        };

        // Best-effort removal of leftovers from earlier runs that died before
        // cleanup. Only entries older than an hour, so a concurrent run's
        // objects are left alone.
        beforeAll(async () => {
          try {
            const notes = parseResultJson(await client.callTool('notes_list', { app_id: config.appId, period: '60days' }));
            const stale: string[] = [];
            findDeep(notes, (n) => {
              if (isStale(n.note) && typeof n._id === 'string') {
                stale.push(n._id);
              }
              return false;
            });
            for (const id of stale) {
              await client.callTool('notes_delete', { note_id: id });
            }
            const boards: string[] = [];
            findDeep(parseResultJson(await client.callTool('dashboards_list')), (n) => {
              if (!Array.isArray(n) && isStale(n.name) && (n._id || n.id)) {
                boards.push(String(n._id ?? n.id));
              }
              return false;
            });
            for (const id of boards) {
              await client.callTool('dashboards_delete', { dashboard_id: id });
            }
          } catch (error) {
            console.warn(`leftover cleanup failed: ${error}`);
          }
        });

        afterAll(async () => {
          if (noteId) {
            await client.callTool('notes_delete', { note_id: noteId }).catch(() => undefined);
          }
          if (dashboardId) {
            await client.callTool('dashboards_delete', { dashboard_id: dashboardId }).catch(() => undefined);
          }
        });

        it('creates, reads back and deletes a note', async () => {
          setup.check();
          const created = await client.callTool('notes_create', {
            app_id: config.appId,
            note: label,
            ts: Date.now(),
            noteType: 'private',
          });
          expect(created.isError, resultText(created)).toBeFalsy();

          noteId = await findNote(label);
          if (!noteId) {
            const list = await client.callTool('notes_list', { app_id: config.appId, period: '60days' });
            expect.fail(`created note not found in notes_list. create said: ${resultText(created).slice(0, 300)}\n` +
              `notes_list said: ${resultText(list).slice(0, 1500)}`);
          }

          const deleted = await client.callTool('notes_delete', { note_id: noteId });
          expect(deleted.isError, resultText(deleted)).toBeFalsy();
          expect(await findNote(label), 'deleted note should be gone').toBeUndefined();
          noteId = undefined;
        });

        it(`creates, reads back and deletes a dashboard${edition === 'platform' ? ' with a widget' : ''}`, async () => {
          setup.check();
          const createTool = tools.find((t) => t.name === 'dashboards_create');
          expect(createTool, 'dashboards_create should be listed').toBeDefined();
          // Platform's /v2 dashboards take `visibility`; legacy ones `share_with`.
          const isV2 = !!createTool!.inputSchema.properties?.visibility;
          if (edition === 'platform') {
            expect(isV2, 'Platform should get the /v2 dashboard tools').toBe(true);
          }

          const created = await client.callTool(
            'dashboards_create',
            isV2 ? { name: label, visibility: 'private' } : { name: label, share_with: 'none' }
          );
          expect(created.isError, resultText(created)).toBeFalsy();
          const json = parseResultJson(created);
          dashboardId = typeof json === 'string' ? json : (json?.id ?? json?._id ?? await findDashboard(label));
          expect(dashboardId, 'dashboard id should be returned or listed').toBeTruthy();
          expect(await findDashboard(label), 'created dashboard should be listed').toBe(dashboardId);

          const data = await client.callTool('dashboards_data', { dashboard_id: dashboardId });
          expect(data.isError, resultText(data)).toBeFalsy();

          if (edition === 'platform') {
            const added = await client.callTool('dashboards_widget_add', {
              dashboard_id: dashboardId,
              widget: { kind: 'profiles', title: label, appIds: [config.appId] },
            });
            expect(added.isError, resultText(added)).toBeFalsy();
            const widgetId = /Widget (\S+) added/.exec(resultText(added))?.[1];
            expect(widgetId, resultText(added)).toBeTruthy();

            const withWidget = await client.callTool('dashboards_data', { dashboard_id: dashboardId, include_data: false });
            expect(withWidget.isError, resultText(withWidget)).toBeFalsy();
            expect(resultText(withWidget)).toContain(widgetId);

            const removed = await client.callTool('dashboards_widget_remove', { dashboard_id: dashboardId, widget_id: widgetId });
            expect(removed.isError, resultText(removed)).toBeFalsy();
          }

          const deleted = await client.callTool('dashboards_delete', { dashboard_id: dashboardId });
          expect(deleted.isError, resultText(deleted)).toBeFalsy();
          expect(await findDashboard(label), 'deleted dashboard should be gone').toBeUndefined();
          dashboardId = undefined;
        });
      });
    });

    describe.skipIf(!config.userToken)('as read-only user', () => {
      const client = new McpStdioClient(config.url, config.userToken || '');
      let tools: ToolInfo[] = [];
      let adminToolCount = 0;
      const setup = setupGuard();

      beforeAll(() => setup.run(async () => {
        await client.start();
        await assertReachable(client, config);
        tools = await client.listTools();
        // The admin's tool count, from its own server process, for comparison.
        const admin = new McpStdioClient(config.url, config.adminToken);
        try {
          await admin.start();
          adminToolCount = (await admin.listTools()).length;
        } finally {
          await admin.stop();
        }
      }));
      afterAll(() => client.stop());

      it('detects the edition', async () => {
        setup.check();
        expectDetected(client, config);
        await expectGetVersion(client, config);
      });

      it('gets fewer tools than the admin and no write tools', () => {
        setup.check();
        const listed = names(tools);
        expect(listed.length).toBeGreaterThan(0);
        expect(listed.length).toBeLessThan(adminToolCount);
        for (const tool of HIDDEN_FOR_READ_ONLY) {
          expect(listed, `${tool} should be hidden from a read-only user`).not.toContain(tool);
        }
        // Some writes only need read access on the server (own dashboards,
        // drill bookmarks), so they're legitimately visible. Every write that
        // needs create/update/delete or admin rights must be hidden.
        const needsWriteAccess = (name: string) => {
          const guard = TOOL_GUARDS[name];
          return !!guard && guard.kind !== 'any' && guard.kind !== 'app-read'
            && !(guard.kind === 'feature' && guard.access === 'r');
        };
        const writes = listed.filter((name) => !isReadOnlyTool(name) && needsWriteAccess(name));
        expect(writes, 'write tools visible to a read-only user').toEqual([]);
      });

      it('refuses hidden tools with a missing-permission message', async () => {
        setup.check();
        const note = await client.callTool('notes_create', {
          app_id: config.appId,
          note: `${E2E_PREFIX}${Date.now()}-must-not-exist`,
          ts: Date.now(),
        });
        expect(note.isError, resultText(note)).toBe(true);
        expect(resultText(note)).toContain('Tool "notes_create" is not available');
        expect(resultText(note)).toContain('which the connected Countly user does not have');

        const app = await client.callTool('apps_create', { name: `${E2E_PREFIX}${Date.now()}-must-not-exist` });
        expect(app.isError, resultText(app)).toBe(true);
        expect(resultText(app)).toContain('requires global admin rights');
      });

      it('smoke-calls every visible read-only tool', async () => {
        setup.check();
        await expectSmokePasses(client, tools, config.appId);
      }, 600_000);
    });
  });
}
