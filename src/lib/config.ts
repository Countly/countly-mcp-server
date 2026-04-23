/**
 * Configuration management for Countly MCP Server
 * Pure functions for processing and validating configuration
 */

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
  const lower = hostname.toLowerCase();

  // Block bare localhost aliases and mDNS names
  if (lower === 'localhost' || lower.endsWith('.localhost') || lower.endsWith('.local')) {
    return `hostname "${hostname}" points at the local machine`;
  }

  // Block IPv6 loopback / link-local / unique-local / unspecified
  if (lower === '::1' || lower === '[::1]' || lower === '::' || lower === '[::]') {
    return `IPv6 loopback/unspecified address "${hostname}" is not allowed`;
  }
  // IPv6 link-local (fe80::/10) and unique-local (fc00::/7) — strip brackets first
  const stripped = lower.replace(/^\[|\]$/g, '');
  if (stripped.startsWith('fe8') || stripped.startsWith('fe9') || stripped.startsWith('fea') || stripped.startsWith('feb') ||
      stripped.startsWith('fc') || stripped.startsWith('fd')) {
    return `IPv6 private/link-local address "${hostname}" is not allowed`;
  }

  // Parse IPv4 literal if present
  const ipv4Match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(lower);
  if (ipv4Match) {
    const [a, b] = ipv4Match.slice(1).map(n => parseInt(n, 10));
    if (a === 0) {
      return `IPv4 "${hostname}" in 0.0.0.0/8 (unspecified) is not allowed`;
    }
    if (a === 10) {
      return `IPv4 "${hostname}" in 10.0.0.0/8 (private) is not allowed`;
    }
    if (a === 127) {
      return `IPv4 "${hostname}" in 127.0.0.0/8 (loopback) is not allowed`;
    }
    if (a === 169 && b === 254) {
      // 169.254.0.0/16: link-local; also covers AWS IMDS (169.254.169.254)
      return `IPv4 "${hostname}" in 169.254.0.0/16 (link-local, includes cloud metadata) is not allowed`;
    }
    if (a === 172 && b >= 16 && b <= 31) {
      return `IPv4 "${hostname}" in 172.16.0.0/12 (private) is not allowed`;
    }
    if (a === 192 && b === 168) {
      return `IPv4 "${hostname}" in 192.168.0.0/16 (private) is not allowed`;
    }
    if (a === 100 && b >= 64 && b <= 127) {
      return `IPv4 "${hostname}" in 100.64.0.0/10 (shared carrier-grade NAT) is not allowed`;
    }
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
