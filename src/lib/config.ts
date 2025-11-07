/**
 * Configuration management for Countly MCP Server
 * Pure functions for processing and validating configuration
 */

export interface CountlyConfig {
  serverUrl: string;
  authToken?: string;
  timeout?: number;
}

export interface ServerEnvironment {
  COUNTLY_SERVER_URL?: string;
  COUNTLY_TIMEOUT?: string;
  [key: string]: string | undefined;
}

/**
 * Normalize URL by removing trailing slashes
 */
export function normalizeServerUrl(url: string): string {
  return url.replace(/\/+$/, '');
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
 * Throws if required config is missing
 */
export function loadConfigFromEnv(
  env: ServerEnvironment = process.env,
  testMode = false
): Omit<CountlyConfig, 'authToken'> {
  const serverUrl = env.COUNTLY_SERVER_URL;

  if (!serverUrl && !testMode) {
    throw new Error(
      'COUNTLY_SERVER_URL environment variable is required.\n' +
      'Example: COUNTLY_SERVER_URL=https://your-countly-instance.com'
    );
  }

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
 */
export function buildConfig(
  env: ServerEnvironment = process.env,
  authToken?: string,
  testMode = false
): CountlyConfig {
  const config = loadConfigFromEnv(env, testMode);

  if (!testMode && !validateServerUrl(config.serverUrl)) {
    throw new Error(
      `Invalid COUNTLY_SERVER_URL: ${config.serverUrl}\n` +
      'Must be a valid HTTP or HTTPS URL.'
    );
  }

  return {
    ...config,
    authToken,
  };
}
