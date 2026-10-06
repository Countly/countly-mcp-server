/**
 * Hook tools: Countly Platform /v2 variants
 *
 * - hooks_list: cross-app or per-app list with enabled/search filters and
 *   paging; rows are compacted (no UI display strings, ISO timestamps)
 * - hooks_get (Platform only): one hook including its recent error logs
 * - hooks_create / hooks_update / hooks_delete / hooks_test: same arguments
 *   as the legacy tools, sent as real JSON to /v2/hooks. hooks_update sends
 *   a partial PATCH (no read-merge-write) and uses the status route when
 *   only `enabled` changes.
 */

import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { jsonResult, v2ErrorResult, v2Request } from '../../lib/v2-api.js';
import { parseJsonParam } from '../../lib/validation.js';
import type { ToolContext, ToolResult } from '../types.js';

const appProps = {
  app_id: { type: 'string', description: 'Application ID. Optional: when omitted (and no app_name), hooks of all apps you can read are listed.' },
  app_name: { type: 'string', description: 'Application name (alternative to app_id). Must match an existing app exactly.' },
};

export const hooksV2ToolDefinitions: Record<string, any> = {
  hooks_list: {
    name: 'hooks_list',
    description: 'List hooks (trigger + effects: webhooks, emails, custom code, scheduled jobs), newest first, paginated, optionally filtered by app, enabled state and name/description text. Rows include trigger counts and last trigger time; use hooks_get for one hook with its recent error logs. Requires the hooks plugin.',
    inputSchema: {
      type: 'object',
      properties: {
        ...appProps,
        enabled: { type: 'boolean', description: 'Only enabled (true) or only disabled (false) hooks. Omit for both.' },
        search: { type: 'string', description: 'Case-insensitive substring match on name and description.' },
        page: { type: 'number', description: 'Page number, 1-based (default 1).' },
        page_size: { type: 'number', description: 'Hooks per page (default 20).' },
      },
    },
  },
};

export const hooksGetToolDefinition = {
  name: 'hooks_get',
  description: 'Get one hook with its full trigger and effects configuration, run counters and the last (up to 10) failed runs with error messages. Use to debug a hook that does not fire or fails. Countly Platform only; requires the hooks plugin.',
  inputSchema: {
    type: 'object',
    properties: {
      hook_id: { type: 'string', description: 'Hook id from hooks_list.' },
    },
    required: ['hook_id'],
  },
};

const iso = (ms: unknown): string | undefined => (typeof ms === 'number' && ms > 0 ? new Date(ms).toISOString() : undefined);

function truncate(value: unknown, max: number): unknown {
  if (value === undefined || value === null) {
    return undefined;
  }
  const s = typeof value === 'string' ? value : JSON.stringify(value);
  return s.length > max ? `${s.slice(0, max)}… (${s.length - max} more chars)` : value;
}

/** Lean view of a v2 hook document */
export function compactHook(h: any): any {
  return {
    id: h._id,
    name: h.name,
    description: h.description || undefined,
    apps: h.apps,
    enabled: h.enabled,
    trigger: h.trigger,
    effects: h.effects,
    createdBy: h.createdByUser || h.createdBy || undefined,
    created: iso(h.created_at),
    updated: iso(h.updatedAt),
    triggerCount: h.triggerCount ?? 0,
    lastTriggered: iso(h.lastTriggerTimestamp),
  };
}

function compactErrorLog(log: any): any {
  return {
    time: iso(log.timestamp),
    effectStep: log.effectStep,
    error: truncate(log.e, 1000),
    params: truncate(log.params, 500),
  };
}

/** Build a hook body from the legacy tool arguments */
function hookBody(args: any, partial: boolean): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  if (args.name !== undefined) {
    body.name = args.name;
  }
  if (args.description !== undefined) {
    body.description = args.description;
  }
  if (args.apps !== undefined) {
    body.apps = args.apps;
  }
  if (args.trigger_type || args.trigger_config) {
    if (!args.trigger_type || !args.trigger_config) {
      throw new McpError(
        ErrorCode.InvalidParams,
        'hooks_update: trigger_type and trigger_config must be provided together. ' +
        'Supply both to change the trigger, or neither to keep it unchanged.'
      );
    }
    body.trigger = { type: args.trigger_type, configuration: parseJsonParam(args.trigger_config, 'trigger_config') };
  }
  if (args.effects) {
    body.effects = parseJsonParam(args.effects, 'effects');
  }
  if (args.enabled !== undefined) {
    body.enabled = args.enabled;
  } else if (!partial) {
    body.enabled = true;
  }
  return body;
}

async function optionalAppId(context: ToolContext, args: any): Promise<string | undefined> {
  return args.app_id || args.app_name ? context.resolveAppId(args) : undefined;
}

export async function handleListHooksV2(context: ToolContext, args: any): Promise<ToolResult> {
  try {
    const app_id = await optionalAppId(context, args);
    const params: Record<string, unknown> = {
      page: Math.max(1, Number(args.page ?? 1)),
      pageSize: Math.max(1, Number(args.page_size ?? 20)),
    };
    if (app_id) {
      params.app_id = app_id;
    }
    if (typeof args.enabled === 'boolean') {
      params.enabled = String(args.enabled);
    }
    if (args.search) {
      params.search = args.search;
    }
    const data = await v2Request<any>(context, 'get', '/v2/hooks', { params });
    const scope = app_id ? `app ${app_id}` : 'all apps';
    return jsonResult(
      `Hooks for ${scope} (page ${data.page}, ${data.items?.length ?? 0} of ${data.total} total)`,
      (data.items || []).map(compactHook)
    );
  } catch (error) {
    return v2ErrorResult('list hooks', error);
  }
}

export async function handleGetHookV2(context: ToolContext, args: any): Promise<ToolResult> {
  try {
    const hook = await v2Request<any>(context, 'get', `/v2/hooks/${encodeURIComponent(args.hook_id)}`);
    const logs = Array.isArray(hook.error_logs) ? hook.error_logs : [];
    return jsonResult(`Hook ${hook._id}`, {
      ...compactHook(hook),
      // Stored oldest-first; show the newest failure first
      errorLogs: logs.slice().reverse().map(compactErrorLog),
    });
  } catch (error) {
    return v2ErrorResult('get hook', error);
  }
}

export async function handleCreateHookV2(context: ToolContext, args: any): Promise<ToolResult> {
  const body = hookBody(args, false);
  try {
    await context.resolveAppId(args);
    const created = await v2Request<any>(context, 'post', '/v2/hooks', { body });
    return jsonResult('Hook created', compactHook(created));
  } catch (error) {
    return v2ErrorResult('create hook', error);
  }
}

export async function handleUpdateHookV2(context: ToolContext, args: any): Promise<ToolResult> {
  const body = hookBody(args, true);
  const id = encodeURIComponent(args.hook_id);
  try {
    // The report/hook id is enough on /v2; an app, if given, is still validated
    if (args.app_id || args.app_name) {
      await context.resolveAppId(args);
    }
    const keys = Object.keys(body);
    if (keys.length === 0) {
      return v2ErrorResult('update hook', new Error('nothing to update, pass at least one field to change'));
    }
    const updated = keys.length === 1 && keys[0] === 'enabled'
      ? await v2Request<any>(context, 'put', `/v2/hooks/${id}/status`, { body })
      : await v2Request<any>(context, 'patch', `/v2/hooks/${id}`, { body });
    return jsonResult('Hook updated', compactHook(updated));
  } catch (error) {
    return v2ErrorResult('update hook', error);
  }
}

export async function handleDeleteHookV2(context: ToolContext, args: any): Promise<ToolResult> {
  try {
    // The report/hook id is enough on /v2; an app, if given, is still validated
    if (args.app_id || args.app_name) {
      await context.resolveAppId(args);
    }
    const data = await v2Request<any>(context, 'delete', `/v2/hooks/${encodeURIComponent(args.hook_id)}`);
    return jsonResult('Hook deleted', data);
  } catch (error) {
    return v2ErrorResult('delete hook', error);
  }
}

/** One dry-run step without the echoed hook config */
function compactTestStep(step: any, index: number): any {
  if (!step || typeof step !== 'object') {
    return step;
  }
  return {
    step: index === 0 ? 'trigger' : `effect ${step.effectStep ?? index - 1}${step.effect?.type ? ` (${step.effect.type})` : ''}`,
    params: truncate(step.params, 2000),
    ...(step.error !== undefined ? { error: truncate(step.error, 1000) } : {}),
    ...(Array.isArray(step.logs) && step.logs.length > 0 ? { logs: step.logs.slice(0, 20) } : {}),
  };
}

export async function handleTestHookV2(context: ToolContext, args: any): Promise<ToolResult> {
  const config = parseJsonParam(args.hook_config, 'hook_config') as Record<string, any>;
  const mockData = args.mock_data ? parseJsonParam(args.mock_data, 'mock_data') : undefined;
  try {
    const app_id = await context.resolveAppId(args);
    // v2 validates the dry-run config like a create body
    const hook = {
      name: config.name || 'Hook test',
      description: config.description ?? '',
      apps: Array.isArray(config.apps) && config.apps.length > 0 ? config.apps : [app_id],
      trigger: config.trigger,
      effects: config.effects,
      enabled: typeof config.enabled === 'boolean' ? config.enabled : true,
    };
    const steps = await v2Request<any[]>(context, 'post', '/v2/hooks/test', {
      body: { hook, ...(mockData ? { mockData } : {}) },
    });
    if (!Array.isArray(steps) || steps.length === 0) {
      return jsonResult('Hook test result', { matched: false, note: 'The trigger did not match the mock data, so no effects ran.' });
    }
    return jsonResult('Hook test result', { matched: true, steps: steps.map(compactTestStep) });
  } catch (error) {
    return v2ErrorResult('test hook', error);
  }
}
