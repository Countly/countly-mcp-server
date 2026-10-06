import { describe, it, expect } from 'vitest';

import { describeGuard, isToolPermitted, TOOL_GUARDS } from '../src/lib/tool-guards.js';
import { filterToolsByServer, loadToolsConfig } from '../src/lib/tools-config.js';
import { canUseGuard, parseMember } from '../src/lib/user-permissions.js';
import { getAllToolDefinitions } from '../src/tools/index.js';

const APP = '5ac7b7ad2e20a317a3619007';

// Shapes as returned by /o/users/me on real servers (Oct 2026)
const readOnlyUser = {
  global_admin: false,
  permission: { c: {}, r: { [APP]: { all: true, allowed: {} } }, u: {}, d: {}, _: { u: [[APP]], a: [] } },
};
const featureUser = {
  global_admin: false,
  permission: {
    c: { [APP]: { all: false, allowed: { crashes: true } } },
    r: { [APP]: { all: false, allowed: { core: true, crashes: true } } },
    u: { [APP]: { all: false, allowed: { crashes: true } } },
    d: {},
    _: { u: [[APP]], a: [] },
  },
};
const appAdmin = {
  global_admin: false,
  permission: { c: {}, r: {}, u: {}, d: {}, _: { u: [], a: [APP] } },
};
const allRightsUser = {
  global_admin: false,
  permission: {
    c: { [APP]: { all: true } }, r: { [APP]: { all: true } }, u: { [APP]: { all: true } }, d: { [APP]: { all: true } },
    _: { u: [[APP]], a: [] },
  },
};
const globalAdmin = { global_admin: true, permission: { c: {}, r: {}, u: {}, d: {}, _: { u: [], a: [] } } };
const legacyUser = { global_admin: false, user_of: [APP], admin_of: [] };

describe('parseMember', () => {
  it('reads admin and user apps', () => {
    expect(parseMember(readOnlyUser)).toMatchObject({ globalAdmin: false, adminApps: [], userApps: [APP], legacy: false });
    expect(parseMember(appAdmin)).toMatchObject({ adminApps: [APP], userApps: [APP] });
  });

  it('treats all four rights on an app as app admin', () => {
    expect(parseMember(allRightsUser)!.adminApps).toEqual([APP]);
  });

  it('handles legacy members without a permission object', () => {
    expect(parseMember(legacyUser)).toMatchObject({ legacy: true, adminApps: [], userApps: [APP] });
  });

  it('rejects non-member payloads', () => {
    expect(parseMember({ result: 'Token not valid' })).toBeNull();
    expect(parseMember(null)).toBeNull();
    expect(parseMember([])).toBeNull();
  });
});

describe('canUseGuard', () => {
  const m = (doc: any) => parseMember(doc)!;

  it('lets global admins do everything', () => {
    for (const guard of Object.values(TOOL_GUARDS)) {
      expect(canUseGuard(m(globalAdmin), guard)).toBe(true);
    }
  });

  it('limits a read-only user to read features', () => {
    const user = m(readOnlyUser);
    expect(canUseGuard(user, { kind: 'feature', feature: 'crashes', access: 'r' })).toBe(true);
    expect(canUseGuard(user, { kind: 'feature', feature: 'crashes', access: 'u' })).toBe(false);
    expect(canUseGuard(user, { kind: 'app-write' })).toBe(false);
    expect(canUseGuard(user, { kind: 'app-read' })).toBe(true);
    expect(canUseGuard(user, { kind: 'global-admin' })).toBe(false);
    expect(canUseGuard(user, { kind: 'any' })).toBe(true);
  });

  it('checks individual feature grants', () => {
    const user = m(featureUser);
    expect(canUseGuard(user, { kind: 'feature', feature: 'crashes', access: 'u' })).toBe(true);
    expect(canUseGuard(user, { kind: 'feature', feature: 'funnels', access: 'r' })).toBe(false);
    expect(canUseGuard(user, { kind: 'feature', feature: ['funnels', 'crashes'], access: 'r' })).toBe(true);
  });

  it('gives app admins every app-level guard but not global admin ones', () => {
    const user = m(appAdmin);
    expect(canUseGuard(user, { kind: 'feature', feature: 'cohorts', access: 'd' })).toBe(true);
    expect(canUseGuard(user, { kind: 'app-write' })).toBe(true);
    expect(canUseGuard(user, { kind: 'global-admin' })).toBe(false);
  });

  it('lets legacy user_of members read any feature but not write', () => {
    const user = m(legacyUser);
    expect(canUseGuard(user, { kind: 'feature', feature: 'drill', access: 'r' })).toBe(true);
    expect(canUseGuard(user, { kind: 'feature', feature: 'drill', access: 'c' })).toBe(false);
  });
});

describe('tool guards', () => {
  const allTools = getAllToolDefinitions();

  it('covers every tool', () => {
    expect(Object.keys(TOOL_GUARDS).sort()).toEqual(allTools.map((t) => t.name).sort());
  });

  it('hides write and admin tools from a read-only user', () => {
    const member = parseMember(readOnlyUser);
    const names = filterToolsByServer(allTools, loadToolsConfig({}), { plugins: null, member }).map((t) => t.name);
    expect(names).toContain('crash_groups_list');
    expect(names).toContain('dashboards_create'); // any user may create dashboards
    expect(names).not.toContain('notes_create');
    expect(names).not.toContain('crashes_resolve');
    expect(names).not.toContain('apps_create');
    expect(names).not.toContain('app_users_delete');
  });

  it('keeps everything when the member is unknown', () => {
    expect(filterToolsByServer(allTools, loadToolsConfig({}), { plugins: null, member: null, v2: true })).toHaveLength(allTools.length);
    expect(isToolPermitted('apps_delete', null)).toBe(true);
  });

  it('describes requirements', () => {
    expect(describeGuard('alerts_delete')).toBe('"update" permission for "alerts" on at least one app');
    expect(describeGuard('apps_delete')).toBe('global admin rights');
  });
});
