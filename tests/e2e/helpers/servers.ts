/**
 * Live Countly servers the e2e suite runs against. It runs locally only, not
 * in CI. Credentials come from the environment:
 *
 *   MCP_E2E_<KEY>_ADMIN_TOKEN  token of mcp-detect-admin (global admin)  required
 *   MCP_E2E_<KEY>_APP_ID       app the read-only user can see; writes go here  required
 *   MCP_E2E_<KEY>_USER_TOKEN   token of mcp-detect-user (read-only, one app)  optional
 *   MCP_E2E_<KEY>_URL          override the server URL; required for a
 *                              server without a default URL
 *
 * A server whose required variables are missing is skipped, unless
 * MCP_E2E_REQUIRE_SECRETS=1 and the server is `required`: then a missing
 * secret fails, so a run can't pass on zero coverage.
 *
 * Lite is optional and has no default server: Lite and Enterprise 25.03 no
 * longer change, and Enterprise covers nearly all legacy tools.
 */

export type Edition = 'lite' | 'enterprise' | 'platform';

export interface E2eServer {
  key: 'LITE' | 'ENTERPRISE' | 'PLATFORM';
  edition: Edition;
  /** Name describeCapabilities() prints for this edition */
  editionLabel: string;
  /** Without one, MCP_E2E_<KEY>_URL is required */
  defaultUrl?: string;
  /** MCP_E2E_REQUIRE_SECRETS=1 fails when this server's secrets are missing */
  required: boolean;
}

export interface E2eServerConfig extends E2eServer {
  url: string;
  adminToken: string;
  userToken?: string;
  appId: string;
}

export const E2E_SERVERS: Record<Edition, E2eServer> = {
  lite: { key: 'LITE', edition: 'lite', editionLabel: 'Countly Lite', required: false },
  enterprise: { key: 'ENTERPRISE', edition: 'enterprise', editionLabel: 'Countly Enterprise', defaultUrl: 'https://arturs.count.ly', required: true },
  platform: { key: 'PLATFORM', edition: 'platform', editionLabel: 'Countly Platform', defaultUrl: 'https://master.count.ly', required: true },
};

/** Prefix of everything the suite creates, so leftovers are easy to find */
export const E2E_PREFIX = 'mcp-e2e-';

export function requiredEnvVars(server: E2eServer): string[] {
  const vars = [`MCP_E2E_${server.key}_ADMIN_TOKEN`, `MCP_E2E_${server.key}_APP_ID`];
  return server.defaultUrl ? vars : [`MCP_E2E_${server.key}_URL`, ...vars];
}

export function loadServerConfig(server: E2eServer): E2eServerConfig | undefined {
  const env = (name: string) => process.env[`MCP_E2E_${server.key}_${name}`]?.trim() || undefined;
  const adminToken = env('ADMIN_TOKEN');
  const appId = env('APP_ID');
  const url = env('URL') || server.defaultUrl;
  if (!adminToken || !appId || !url) {
    return undefined;
  }
  return {
    ...server,
    url: url.replace(/\/+$/, ''),
    adminToken,
    userToken: env('USER_TOKEN'),
    appId,
  };
}

export const requireSecrets = process.env.MCP_E2E_REQUIRE_SECRETS === '1';
