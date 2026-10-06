import { describe, it, expect, vi, afterEach } from 'vitest';
import { CountlyMCPServer } from '../src/index.js';
import {
  loadToolsConfig,
  isToolAllowed,
  filterTools,
  getArgumentRefusal,
  restrictToolArguments,
} from '../src/lib/tools-config.js';
import { getAllToolDefinitions } from '../src/tools/index.js';
import { handleRunFormula, runFormulaToolDefinition } from '../src/tools/formulas.js';
import type { ToolContext } from '../src/tools/types.js';

/**
 * formulas_run is a read, so read-only deployments keep ad-hoc formula runs.
 * Its mode: "saved" also persists the formula, which needs Create on the
 * formulas category; without it the call is refused and the schema stops
 * offering "saved".
 */

const FORMULA = '[{"id":0,"variables":[]}]';

function modeEnum(tool: any): string[] {
  return tool.inputSchema.properties.mode.enum;
}

describe('formulas_run mode "saved" under the tools configuration', () => {
  describe('read-only deployments', () => {
    for (const env of [{ COUNTLY_TOOLS_ALL: 'R' }, { COUNTLY_TOOLS_FORMULAS: 'R' }, { COUNTLY_TOOLS_FORMULAS: 'RUD' }]) {
      it(`refuses mode "saved" with ${JSON.stringify(env)}`, () => {
        const config = loadToolsConfig(env);
        expect(isToolAllowed('formulas_run', config)).toBe(true);

        const refusal = getArgumentRefusal('formulas_run', { formula: FORMULA, mode: 'saved' }, config);
        expect(refusal).toMatch(/mode "unsaved"/);
      });
    }

    it('still allows ad-hoc runs', () => {
      const config = loadToolsConfig({ COUNTLY_TOOLS_ALL: 'R' });
      expect(getArgumentRefusal('formulas_run', { formula: FORMULA }, config)).toBeUndefined();
      expect(getArgumentRefusal('formulas_run', { formula: FORMULA, mode: 'unsaved' }, config)).toBeUndefined();
    });

    it('points to formulas_save only when it is available', () => {
      const readOnly = loadToolsConfig({ COUNTLY_TOOLS_ALL: 'R' });
      expect(getArgumentRefusal('formulas_run', { mode: 'saved' }, readOnly)).not.toMatch(/formulas_save/);
    });

    it('drops "saved" from the listed schema', () => {
      const config = loadToolsConfig({ COUNTLY_TOOLS_ALL: 'R' });
      const listed = filterTools(getAllToolDefinitions(), config)
        .map((tool) => restrictToolArguments(tool, config))
        .find((tool) => tool.name === 'formulas_run');

      expect(listed).toBeDefined();
      expect(modeEnum(listed)).toEqual(['unsaved']);
      // the shared definition is not mutated
      expect(modeEnum(runFormulaToolDefinition)).toEqual(['unsaved', 'saved']);
    });
  });

  describe('deployments with Create on formulas', () => {
    for (const env of [{}, { COUNTLY_TOOLS_ALL: 'CRUD' }, { COUNTLY_TOOLS_ALL: 'R', COUNTLY_TOOLS_FORMULAS: 'CR' }]) {
      it(`allows mode "saved" with ${JSON.stringify(env)}`, () => {
        const config = loadToolsConfig(env);
        expect(getArgumentRefusal('formulas_run', { formula: FORMULA, mode: 'saved' }, config)).toBeUndefined();
        expect(modeEnum(restrictToolArguments(runFormulaToolDefinition, config))).toEqual(['unsaved', 'saved']);
      });
    }

    it('forwards mode and formulaMeta to calculated_metrics', async () => {
      const get = vi.fn().mockResolvedValue({ data: {} });
      const context = {
        resolveAppId: async () => 'app1',
        getAuthParams: () => ({ auth_token: 't' }),
        httpClient: { get },
      } as unknown as ToolContext;

      await handleRunFormula(context, { formula: FORMULA, mode: 'saved', formulaMeta: '{"name":"x"}' });

      expect(get).toHaveBeenCalledWith('/o', expect.objectContaining({
        params: expect.objectContaining({ method: 'calculated_metrics', mode: 'saved', formulaMeta: '{"name":"x"}' }),
      }));
    });
  });

  describe('CallTool dispatcher', () => {
    const SAVED = ['COUNTLY_TOOLS_ALL', 'COUNTLY_TOOLS_FORMULAS', 'COUNTLY_AUTO_DETECT'] as const;
    const saved = Object.fromEntries(SAVED.map((k) => [k, process.env[k]]));

    afterEach(() => {
      for (const k of SAVED) {
        if (saved[k] === undefined) {
          delete process.env[k];
        } else {
          process.env[k] = saved[k];
        }
      }
    });

    function dispatcher(env: Record<string, string>) {
      Object.assign(process.env, { COUNTLY_AUTO_DETECT: 'false', ...env });
      const server = new CountlyMCPServer(true) as any;
      const handlers = server.server._requestHandlers as Map<string, (req: any, extra: any) => Promise<any>>;
      return {
        call: (args: Record<string, unknown>) =>
          handlers.get('tools/call')!({ method: 'tools/call', params: { name: 'formulas_run', arguments: args } }, {}),
        list: () => handlers.get('tools/list')!({ method: 'tools/list', params: {} }, {}),
      };
    }

    it('refuses mode "saved" before any request is sent in a read-only deployment', async () => {
      const { call } = dispatcher({ COUNTLY_TOOLS_ALL: 'R' });
      const result = await call({ app_id: 'app1', formula: FORMULA, mode: 'saved', countly_auth_token: 'TEST_TOKEN' });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toMatch(/mode "unsaved"/);
    });

    it('lists formulas_run without "saved" in a read-only deployment', async () => {
      const { list } = dispatcher({ COUNTLY_TOOLS_FORMULAS: 'R' });
      const { tools } = await list();
      expect(modeEnum(tools.find((t: any) => t.name === 'formulas_run'))).toEqual(['unsaved']);
    });

    it('lists "saved" when formulas allows Create', async () => {
      const { list } = dispatcher({ COUNTLY_TOOLS_ALL: 'CRUD' });
      const { tools } = await list();
      expect(modeEnum(tools.find((t: any) => t.name === 'formulas_run'))).toEqual(['unsaved', 'saved']);
    });
  });
});
