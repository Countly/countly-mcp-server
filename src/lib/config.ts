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
 * Validate URL format
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
