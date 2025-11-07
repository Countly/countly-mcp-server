/**
 * Authentication logic for Countly MCP Server
 * Pure functions that can be easily tested
 */

import fs from 'fs';

/**
 * Priority order for authentication token resolution:
 * 1. Tool arguments (countly_auth_token) - per-request override
 * 2. MCP metadata (countlyAuthToken) - rarely supported by clients
 * 3. Environment variable (COUNTLY_AUTH_TOKEN)
 * 4. Environment file path (COUNTLY_AUTH_TOKEN_FILE)
 * 
 * Note: For HTTP/SSE transport, credentials are typically passed via HTTP headers
 * (X-Countly-Auth-Token) which are extracted and stored in config before reaching this function.
 */

export interface AuthSources {
  metadata?: any;
  args?: any;
  env?: NodeJS.ProcessEnv;
}

/**
 * Resolve authentication token from various sources in priority order
 */
export function resolveAuthToken(sources: AuthSources): string | undefined {
  const { metadata, args, env = process.env } = sources;

  // Priority 1: Arguments (per-request override)
  if (args?.countly_auth_token) {
    return args.countly_auth_token;
  }

  // Priority 2: MCP metadata (rarely supported by clients)
  if (metadata?.countlyAuthToken) {
    return metadata.countlyAuthToken;
  }

  // Priority 3: Environment variable
  if (env.COUNTLY_AUTH_TOKEN) {
    return env.COUNTLY_AUTH_TOKEN;
  }

  // Priority 4: File path from environment
  if (env.COUNTLY_AUTH_TOKEN_FILE) {
    return readTokenFromFile(env.COUNTLY_AUTH_TOKEN_FILE);
  }

  return undefined;
}

/**
 * Read and parse token from a file
 * Throws descriptive errors if file cannot be read
 */
export function readTokenFromFile(filePath: string): string {
  try {
    const token = fs.readFileSync(filePath, 'utf-8');
    const trimmed = token.trim();
    
    if (!trimmed) {
      throw new Error(`Token file is empty: ${filePath}`);
    }
    
    return trimmed;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(
        `Token file not found: ${filePath}\n` +
        'Make sure COUNTLY_AUTH_TOKEN_FILE points to a valid file.'
      );
    }
    if ((error as NodeJS.ErrnoException).code === 'EACCES') {
      throw new Error(
        `Permission denied reading token file: ${filePath}\n` +
        'Make sure the file is readable (chmod 600 or higher).'
      );
    }
    throw new Error(
      `Failed to read token file ${filePath}: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

/**
 * Generate a helpful error message when no authentication is provided
 */
export function createMissingAuthError(): Error {
  return new Error(
    'No authentication token provided. Please provide credentials via:\n' +
    '1. HTTP headers: X-Countly-Auth-Token (for HTTP/SSE transport)\n' +
    '2. Tool arguments: countly_auth_token\n' +
    '3. Environment variable: COUNTLY_AUTH_TOKEN\n' +
    '4. Token file: COUNTLY_AUTH_TOKEN_FILE'
  );
}

/**
 * Validate that a token is present and throw if missing
 */
export function requireAuthToken(sources: AuthSources): string {
  const token = resolveAuthToken(sources);
  
  if (!token) {
    throw createMissingAuthError();
  }
  
  return token;
}
