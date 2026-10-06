/**
 * Live Countly servers the e2e suite runs against. Credentials come from the
 * environment only (GitHub secrets in CI, a local shell otherwise):
 *
 *   MCP_E2E_<KEY>_ADMIN_TOKEN  token of mcp-detect-admin (global admin)  required
 *   MCP_E2E_<KEY>_APP_ID       app the read-only user can see; writes go here  required
 *   MCP_E2E_<KEY>_USER_TOKEN   token of mcp-detect-user (read-only, one app)  optional
 *   MCP_E2E_<KEY>_URL          override the server URL  optional
 *
 * A server whose required variables are missing is skipped, unless
 * MCP_E2E_REQUIRE_SECRETS=1 (set by the release gate), which turns a missing
 * secret into a failure so a release can't pass on zero coverage.
 */

export type Edition = 'lite' | 'enterprise' | 'platform';

export interface E2eServer {
  key: 'LITE' | 'ENTERPRISE' | 'PLATFORM';
  edition: Edition;
  /** Name describeCapabilities() prints for this edition */
  editionLabel: string;
  defaultUrl: string;
}

export interface E2eServerConfig extends E2eServer {
  url: string;
  adminToken: string;
  userToken?: string;
  appId: string;
}

export const E2E_SERVERS: Record<Edition, E2eServer> = {
  lite: { key: 'LITE', edition: 'lite', editionLabel: 'Countly Lite', defaultUrl: 'https://ce.count.ly' },
  enterprise: { key: 'ENTERPRISE', edition: 'enterprise', editionLabel: 'Countly Enterprise', defaultUrl: 'https://arturs.count.ly' },
  platform: { key: 'PLATFORM', edition: 'platform', editionLabel: 'Countly Platform', defaultUrl: 'https://master.count.ly' },
};

/** Prefix of everything the suite creates, so leftovers are easy to find */
export const E2E_PREFIX = 'mcp-e2e-';

export function requiredEnvVars(server: E2eServer): string[] {
  return [`MCP_E2E_${server.key}_ADMIN_TOKEN`, `MCP_E2E_${server.key}_APP_ID`];
}

export function loadServerConfig(server: E2eServer): E2eServerConfig | undefined {
  const env = (name: string) => process.env[`MCP_E2E_${server.key}_${name}`]?.trim() || undefined;
  const adminToken = env('ADMIN_TOKEN');
  const appId = env('APP_ID');
  if (!adminToken || !appId) {
    return undefined;
  }
  return {
    ...server,
    url: (env('URL') || server.defaultUrl).replace(/\/+$/, ''),
    adminToken,
    userToken: env('USER_TOKEN'),
    appId,
  };
}

export const requireSecrets = process.env.MCP_E2E_REQUIRE_SECRETS === '1';
