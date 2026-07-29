/**
 * Configuration management for Countly MCP Server
 * Pure functions for processing and validating configuration
 */

import { isIP } from 'node:net';
import ipaddr from 'ipaddr.js';

export interface CountlyConfig {
  serverUrl: string;
  timeout?: number;
  authToken?: string;
}

export interface ServerEnvironment {
  COUNTLY_SERVER_URL?: string;
  COUNTLY_TIMEOUT?: string;
  [key: string]: string | undefined;
}

/**
 * Normalize URL by removing trailing slashes
 * Uses iterative approach to avoid ReDoS vulnerability
 */
export function normalizeServerUrl(url: string): string {
  // Remove trailing slashes safely without regex
  let cleanUrl = url;
  while (cleanUrl.endsWith('/')) {
    cleanUrl = cleanUrl.slice(0, -1);
  }
  return cleanUrl;
}

/**
 * Parse timeout from string or return default
 */
export function parseTimeout(timeoutStr?: string, defaultTimeout = 30000): number {
  if (!timeoutStr) {
    return defaultTimeout;
  }

  const timeout = parseInt(timeoutStr, 10);

  if (isNaN(timeout) || timeout <= 0) {
    throw new Error(
      `Invalid timeout value: ${timeoutStr}. Must be a positive number.`
    );
  }

  return timeout;
}

/**
 * Load configuration from environment variables
 * Server URL is optional - can be provided by client or environment
 */
export function loadConfigFromEnv(
  env: ServerEnvironment = process.env
): Omit<CountlyConfig, 'authToken'> {
  const serverUrl = env.COUNTLY_SERVER_URL;

  // Server URL is optional - can be provided by client configuration
  const timeout = parseTimeout(env.COUNTLY_TIMEOUT);

  return {
    serverUrl: serverUrl ? normalizeServerUrl(serverUrl) : '',
    timeout,
  };
}

/**
 * Validate URL format (shape only).
 * Accepts any http(s) URL. For SSRF protection use assertSafeServerUrl().
 */
export function validateServerUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Hostnames known to serve cloud-metadata / internal orchestration services.
 * Matched case-insensitively as an exact hostname. Kept in sync with the
 * countly-server `api/utils/ssrf-protection.js` blocklist.
 */
const BLOCKED_HOSTNAMES = new Set([
  'metadata.google.internal',
  'metadata.goog',
  'metadata.google.com',
  'kubernetes.default.svc',
  'kubernetes.default',
  'kubernetes',
]);

/**
 * Classify a literal IP (v4 or v6) using ipaddr.js range() detection and
 * decide whether it must be blocked for SSRF safety. Only globally-routable
 * `unicast` addresses are considered safe; every other range (loopback,
 * private, link-local, unique-local, carrier-grade NAT, multicast, reserved,
 * unspecified, broadcast, NAT64, …) is blocked.
 *
 * IPv4-mapped IPv6 (`::ffff:a.b.c.d`, e.g. `::ffff:127.0.0.1`) is unwrapped to
 * its embedded IPv4 address and re-classified, closing the representation
 * bypass where a mapped address is routed to IPv4 loopback/metadata by the OS
 * but slips past naive string/prefix checks.
 *
 * Returns a human-readable reason when the IP is unsafe, or null when safe.
 */
function classifyIpLiteral(ip: string, original: string): string | null {
  let parsed: ipaddr.IPv4 | ipaddr.IPv6;
  try {
    parsed = ipaddr.parse(ip);
  } catch {
    // Unparseable despite net.isIP accepting it — refuse to be safe.
    return `IP literal "${original}" could not be classified`;
  }

  let range = parsed.range();

  // Unwrap IPv4-mapped IPv6 (::ffff:0:0/96) and classify the inner IPv4 so
  // e.g. ::ffff:127.0.0.1 is treated as 127.0.0.1 (loopback).
  if (
    parsed.kind() === 'ipv6' &&
    (parsed as ipaddr.IPv6).isIPv4MappedAddress()
  ) {
    range = (parsed as ipaddr.IPv6).toIPv4Address().range();
  }

  if (range !== 'unicast') {
    return `IP "${original}" is in a non-public range (${range}) and is not allowed`;
  }
  return null;
}

/**
 * Test whether a hostname or literal IP resolves to a "sensitive" network
 * target that the MCP server must refuse to call. This is an SSRF mitigation
 * for the HTTP transport, where the Countly server URL is attacker-controllable
 * via request headers.
 *
 * Returns a human-readable reason string when the host is unsafe, or null when
 * the host is considered safe.
 *
 * NOTE: this is a best-effort syntactic check — it cannot prevent DNS-rebinding
 * attacks where a public hostname resolves to a private IP at connect time.
 * Defense-in-depth requires egress firewalling the MCP server.
 */
export function assertSafeServerHost(hostname: string): string | null {
  if (!hostname) {
    return 'hostname is empty';
  }

  // URL parsers hand back bracketed IPv6 literals ("[::1]"); strip the
  // brackets so net.isIP / ipaddr.js can classify the address.
  let host = hostname;
  if (host.startsWith('[') && host.endsWith(']')) {
    host = host.slice(1, -1);
  }
  const lower = host.toLowerCase();

  // Block bare localhost aliases, mDNS, and internal orchestration TLDs
  if (
    lower === 'localhost' ||
    lower.endsWith('.localhost') ||
    lower.endsWith('.local') ||
    lower.endsWith('.internal')
  ) {
    return `hostname "${hostname}" points at the local machine or an internal service`;
  }

  // Block known cloud-metadata / internal-service hostnames
  if (BLOCKED_HOSTNAMES.has(lower)) {
    return `hostname "${hostname}" is a blocked internal/metadata service`;
  }

  // If the host is a literal IP (v4 or v6, in any representation), classify it
  // with ipaddr.js. This covers dotted-quad, integer/hex-collapsed forms that
  // Node's URL parser already normalizes, full IPv6, and IPv4-mapped IPv6.
  if (isIP(lower)) {
    return classifyIpLiteral(lower, hostname);
  }

  return null;
}

/**
 * Throw if the URL is invalid or targets a sensitive network.
 * Used on every caller-supplied serverUrl in the HTTP transport to block SSRF.
 */
export function assertSafeServerUrl(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`Invalid server URL: "${url}"`);
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(
      `Refusing server URL with scheme "${parsed.protocol}" — only http:/https: are allowed.`
    );
  }
  // Reject embedded credentials (user:pass@host) — they are never needed for a
  // Countly server URL and are a common SSRF/credential-smuggling vector.
  if (parsed.username || parsed.password) {
    throw new Error(
      `Refusing server URL "${url}" for SSRF safety: embedded credentials are not allowed.`
    );
  }
  const reason = assertSafeServerHost(parsed.hostname);
  if (reason) {
    throw new Error(
      `Refusing to use server URL "${url}" for SSRF safety: ${reason}.`
    );
  }
}

/**
 * Build full configuration with validation
 * Server URL is optional - can be provided by client or environment
 */
export function buildConfig(
  env: ServerEnvironment = process.env,
  authToken?: string,
  testMode = false
): CountlyConfig {
  const config = loadConfigFromEnv(env);

  // Only validate server URL if provided
  if (!testMode && config.serverUrl && !validateServerUrl(config.serverUrl)) {
    throw new Error(
      `Invalid COUNTLY_SERVER_URL: ${config.serverUrl}\n` +
      'Must be a valid HTTP or HTTPS URL.'
    );
  }

  // Return config with authToken if provided
  return authToken ? { ...config, authToken } : config;
}
