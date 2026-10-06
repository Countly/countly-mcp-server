/**
 * Current-user permission checks
 *
 * Mirrors the permission model in Countly's api/utils/rights.js closely
 * enough to decide whether a tool is worth showing to the connected user.
 * The server stays the authority: this only hides tools that would certainly
 * be rejected, and anything uncertain stays visible.
 */

import { AxiosInstance } from 'axios';

export type AccessType = 'c' | 'r' | 'u' | 'd';

/**
 * What a tool's endpoint checks before running:
 * - feature:      validateRead/Create/Update/Delete(feature) on an app
 * - app-read:     any read access to an app (validateUserForRead and friends)
 * - app-write:    write access to an app (validateUserForWrite and friends)
 * - app-admin:    admin of an app (validateAppAdmin)
 * - global-admin: global admin only
 * - any:          any authenticated user
 */
export type ToolGuard =
  | { kind: 'feature'; feature: string | string[]; access: AccessType }
  | { kind: 'app-read' }
  | { kind: 'app-write' }
  | { kind: 'app-admin' }
  | { kind: 'global-admin' }
  | { kind: 'any' };

interface AppRights {
  all?: boolean;
  allowed?: Record<string, boolean>;
}

export interface MemberPermissions {
  globalAdmin: boolean;
  /** Apps the user administers (full access): permission._.a, all four rights, or legacy admin_of */
  adminApps: string[];
  /** Apps the user can read at all: permission._.u + _.a, or legacy user_of */
  userApps: string[];
  /** Per access type, per app rights */
  rights: Record<AccessType, Record<string, AppRights>>;
  /** Member predates the permission object; rights come from admin_of/user_of */
  legacy: boolean;
}

const ACCESS_TYPES: AccessType[] = ['c', 'r', 'u', 'd'];

const ids = (value: unknown): string[] => (Array.isArray(value) ? value.flat().map(String) : []);

/** Normalise a member document from /o/users/me (see rights.js hasAdminAccess / getUserApps) */
export function parseMember(doc: any): MemberPermissions | null {
  if (!doc || typeof doc !== 'object' || Array.isArray(doc) || !('global_admin' in doc || 'permission' in doc)) {
    return null;
  }
  const legacy = !doc.permission || typeof doc.permission !== 'object';
  const permission = legacy ? {} : doc.permission;
  const rights = {} as MemberPermissions['rights'];
  for (const type of ACCESS_TYPES) {
    rights[type] = permission[type] && typeof permission[type] === 'object' ? permission[type] : {};
  }

  const adminApps = new Set(legacy ? ids(doc.admin_of) : ids(permission._?.a));
  if (!legacy) {
    for (const app of Object.keys(rights.r)) {
      if (ACCESS_TYPES.every((type) => rights[type][app]?.all === true)) {
        adminApps.add(app);
      }
    }
  }
  const userApps = new Set([...adminApps, ...(legacy ? ids(doc.user_of) : ids(permission._?.u))]);

  return {
    globalAdmin: doc.global_admin === true,
    adminApps: [...adminApps],
    userApps: [...userApps],
    rights,
    legacy,
  };
}

function hasFeature(rights: AppRights | undefined, features: string[]): boolean {
  return !!rights && (rights.all === true || features.some((f) => rights.allowed?.[f] === true));
}

/**
 * Whether the member could pass `guard` on at least one app. Tools take an
 * app as an argument, so being allowed on any app is enough to show them.
 */
export function canUseGuard(member: MemberPermissions, guard: ToolGuard): boolean {
  if (member.globalAdmin) {
    return true;
  }
  const isAppAdmin = member.adminApps.length > 0;
  switch (guard.kind) {
  case 'global-admin':
    return false;
  case 'any':
    return true;
  case 'app-admin':
  case 'app-write':
    return isAppAdmin;
  case 'app-read':
    return member.userApps.length > 0;
  case 'feature': {
    if (isAppAdmin) {
      return true;
    }
    if (member.legacy) {
      // validateRead lets legacy user_of members read any feature
      return guard.access === 'r' && member.userApps.length > 0;
    }
    const features = Array.isArray(guard.feature) ? guard.feature : [guard.feature];
    return Object.values(member.rights[guard.access]).some((rights) => hasFeature(rights, features));
  }
  }
}

/** Fetch the connected user's member record; null when unavailable */
export async function fetchMemberPermissions(
  client: AxiosInstance,
  params: Record<string, string>,
  timeoutMs: number
): Promise<MemberPermissions | null> {
  try {
    const res = await client.get('/o/users/me', { params, timeout: timeoutMs, validateStatus: () => true });
    return res.status === 200 ? parseMember(res.data) : null;
  } catch {
    return null;
  }
}
