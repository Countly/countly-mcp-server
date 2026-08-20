/**
 * Configuration management for Countly MCP Server
 * Pure functions for processing and validating configuration
 */

import dns from 'node:dns';
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
 * Classify a literal IP (v4 or v6) using ipaddr.js range() detection. Only
 * globally-routable `unicast` addresses are considered safe; every other range
 * (loopback, private, link-local, unique-local, carrier-grade NAT, multicast,
 * reserved, unspecified, broadcast, NAT64, …) is unsafe.
 *
 * IPv4-mapped IPv6 (`::ffff:a.b.c.d`, e.g. `::ffff:127.0.0.1`) is unwrapped to
 * its embedded IPv4 address and re-classified, closing the representation
 * bypass where a mapped address is routed to IPv4 loopback/metadata by the OS
 * but slips past naive string/prefix checks.
 *
 * Returns the offending range name (e.g. "loopback"), the literal string
 * "unparseable" when the input cannot be parsed, or null when the IP is a safe
 * public unicast address.
 */
function blockedIpRange(ip: string): string | null {
  let parsed: ipaddr.IPv4 | ipaddr.IPv6;
  try {
    parsed = ipaddr.parse(ip);
  } catch {
    // Unparseable — refuse to be safe.
    return 'unparseable';
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

  // ipaddr.js@1.9.1 recognizes the well-known NAT64 prefix (64:ff9b::/96 ->
  // "rfc6052") but classifies the RFC 8215 local-use NAT64 prefix
  // (64:ff9b:1::/48) as generic unicast. A NAT64 gateway translates the embedded
  // IPv4 in the low 32 bits to an arbitrary destination, so reject the whole
  // prefix, matching how the well-known prefix is already rejected. (Network-
  // specific NAT64 prefixes carved from an operator's own global-unicast space
  // are indistinguishable from public addresses and cannot be excluded by prefix.)
  if (parsed.kind() === 'ipv6') {
    const nat64LocalUse = ipaddr.parseCIDR('64:ff9b:1::/48') as [ipaddr.IPv6, number];
    if ((parsed as ipaddr.IPv6).match(nat64LocalUse)) {
      return 'nat64-local-use';
    }
  }

  return range === 'unicast' ? null : range;
}

/**
 * Human-readable wrapper over blockedIpRange for the syntactic host check.
 * Returns a reason string when the IP is unsafe, or null when safe.
 */
function classifyIpLiteral(ip: string, original: string): string | null {
  const range = blockedIpRange(ip);
  if (range === null) {
    return null;
  }
  if (range === 'unparseable') {
    return `IP literal "${original}" could not be classified`;
  }
  return `IP "${original}" is in a non-public range (${range}) and is not allowed`;
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
 * Error thrown by safeLookup when a hostname resolves to a blocked address.
 * Carries a stable `code` so callers can distinguish an SSRF block from a
 * generic connection failure.
 */
export function blockedLookupError(hostname: string, address: string, range: string): Error {
  const err = new Error(
    `Blocked SSRF target: "${hostname}" resolved to non-public IP "${address}" (${range})`
  );
  (err as NodeJS.ErrnoException).code = 'ESSRFBLOCKED';
  return err;
}

type LookupAllCallback = (err: NodeJS.ErrnoException | null, addresses: dns.LookupAddress[]) => void;
type LookupSingleCallback = (
  err: NodeJS.ErrnoException | null,
  address?: string,
  family?: number
) => void;

/**
 * A `dns.lookup`-compatible function that resolves a hostname and then rejects
 * the lookup if the resolved address is private/reserved/internal.
 *
 * Passing this as the `lookup` option of a Node http/https Agent (which axios
 * honours via httpAgent/httpsAgent) validates the IP AT CONNECT TIME. This is
 * the piece that a parse-time-only string check cannot provide:
 *
 *  1. A hostname whose A/AAAA record simply points at a private/loopback/
 *     metadata IP is caught here (the syntactic host check never resolves
 *     names, so it would otherwise pass such a hostname straight through).
 *  2. DNS-rebinding (TOCTOU) is closed: even if a name resolved to a public
 *     IP a moment ago, the socket only ever connects to an address that
 *     passes blockedIpRange here, at the instant of connection.
 *
 * Mirrors countly-server's api/utils/ssrf-protection.js `safeLookup`.
 *
 * IMPORTANT: only wire this into the client used for CALLER-CONTROLLED server
 * URLs. The operator's own COUNTLY_SERVER_URL is frequently a private-IP
 * on-prem host and must NOT be forced through this guard.
 */
export function safeLookup(
  hostname: string,
  options: dns.LookupOneOptions | dns.LookupAllOptions | dns.LookupOptions | LookupSingleCallback,
  callback?: LookupSingleCallback | LookupAllCallback
): void {
  let opts: dns.LookupOptions;
  let cb: LookupSingleCallback | LookupAllCallback;
  if (typeof options === 'function') {
    cb = options;
    opts = {};
  } else {
    opts = options;
    cb = callback as LookupSingleCallback | LookupAllCallback;
  }

  // Use a single explicit signature to sidestep dns.lookup's overloads —
  // we handle both the single-address and options.all (array) shapes below.
  const doLookup = dns.lookup as (
    h: string,
    o: dns.LookupOptions,
    cb: (
      err: NodeJS.ErrnoException | null,
      address: string | dns.LookupAddress[],
      family?: number
    ) => void
  ) => void;
  doLookup(hostname, opts, (err, address, family) => {
    if (err) {
      (cb as LookupSingleCallback)(err);
      return;
    }
    // When options.all is true, `address` is an array of {address, family}.
    if (opts && (opts as dns.LookupAllOptions).all) {
      const list = (Array.isArray(address) ? address : [address]) as dns.LookupAddress[];
      for (const entry of list) {
        const range = blockedIpRange(entry.address);
        if (range) {
          (cb as LookupAllCallback)(blockedLookupError(hostname, entry.address, range), []);
          return;
        }
      }
      (cb as LookupAllCallback)(null, list);
      return;
    }
    const addr = address as unknown as string;
    const range = blockedIpRange(addr);
    if (range) {
      (cb as LookupSingleCallback)(blockedLookupError(hostname, addr, range));
      return;
    }
    (cb as LookupSingleCallback)(null, addr, family as number);
  });
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
