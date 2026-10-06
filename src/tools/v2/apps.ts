/**
 * App and dashboard-member tools: Countly Platform /v2 variants
 *
 * - apps_list / apps_get_by_name: /v2/apps, which tags each app with the
 *   caller's role (admin or user) and adds created/edited times.
 * - dashboard_users: /v2/members (global admin), compacted to identity,
 *   role and app-access fields; secrets and UI settings are dropped.
 *
 * App id/name resolution for every other tool (context.resolveAppId) keeps
 * using /o/apps/mine. apps_create/update/delete/reset stay on the legacy
 * API: /v2/apps/create skips the legacy country/timezone/category
 * validation and defaults, and there is no v2 update/delete/reset.
 */

import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';

import { jsonResult, v2ErrorResult, v2Request } from '../../lib/v2-api.js';
import type { ToolContext, ToolResult } from '../types.js';

const iso = (sec: unknown): string | undefined =>
  typeof sec === 'number' && sec > 0 ? new Date(sec * 1000).toISOString() : undefined;

function compactApp(app: any): any {
  return {
    _id: app._id,
    name: app.name,
    role: app.role,
    key: app.key,
    category: app.category || undefined,
    country: app.country || undefined,
    timezone: app.timezone,
    salt: app.salt || undefined,
    locked: app.locked || undefined,
    created: iso(app.created_at),
    edited: iso(app.edited_at),
  };
}

export async function handleListAppsV2(context: ToolContext, _args: any): Promise<ToolResult> {
  try {
    const apps = await v2Request<any[]>(context, 'get', '/v2/apps');
    const lines = (apps || []).map((app) =>
      `- ${app.name} (ID: ${app._id}, role: ${app.role}${app.timezone ? `, timezone: ${app.timezone}` : ''})`);
    return { content: [{ type: 'text', text: `Available applications (${lines.length}):\n${lines.join('\n')}` }] };
  } catch (error) {
    return v2ErrorResult('list apps', error);
  }
}

export async function handleGetAppByNameV2(context: ToolContext, args: any): Promise<ToolResult> {
  let apps: any[];
  try {
    apps = (await v2Request<any[]>(context, 'get', '/v2/apps')) || [];
  } catch (error) {
    return v2ErrorResult('get app', error);
  }
  const wanted = String(args.app_name ?? '').toLowerCase();
  const app = apps.find((a) => String(a.name).toLowerCase() === wanted);
  if (!app) {
    throw new McpError(
      ErrorCode.InvalidParams,
      `App with name "${args.app_name}" not found. Available apps: ${apps.map((a) => a.name).join(', ')}`
    );
  }
  return jsonResult('App information', compactApp(app));
}

const flatIds = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return [...new Set((value.flat(2) as unknown[]).filter(Boolean).map(String))];
};

/** Identity, role and app access of a dashboard member */
export function compactMember(member: any): any {
  const perm = member.permission;
  const adminOf = perm?._ ? flatIds(perm._.a) : flatIds(member.admin_of);
  const userOf = perm?._ ? flatIds(perm._.u) : flatIds(member.user_of);
  return {
    id: member._id,
    full_name: member.full_name,
    username: member.username,
    email: member.email,
    global_admin: member.global_admin === true,
    ...(adminOf.length ? { admin_of: adminOf } : {}),
    ...(userOf.length ? { user_of: userOf.filter((id) => !adminOf.includes(id)) } : {}),
    ...(member.group_id && (!Array.isArray(member.group_id) || member.group_id.length) ? { groups: member.group_id } : {}),
    ...(member.locked ? { locked: true } : {}),
    ...(member.blocked ? { blocked: true } : {}),
    created: iso(member.created_at),
    last_login: iso(member.last_login),
    ...(member.is_current_user ? { is_current_user: true } : {}),
  };
}

export async function handleDashboardUsersV2(context: ToolContext, _args: any): Promise<ToolResult> {
  try {
    const members = await v2Request<any[]>(context, 'get', '/v2/members');
    const list = (Array.isArray(members) ? members : Object.values(members || {})).map(compactMember);
    return jsonResult(`Dashboard users (${list.length})`, list);
  } catch (error) {
    return v2ErrorResult('list dashboard users', error);
  }
}
