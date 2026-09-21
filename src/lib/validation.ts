/**
 * Parameter validation for MCP tools
 * Pure functions for validating and transforming tool arguments
 */

import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';

/**
 * Validate required parameters are present
 */
export function validateRequiredParams(
  args: Record<string, any>,
  required: string[]
): void {
  const missing = required.filter((param) => !(param in args) || args[param] === undefined);

  if (missing.length > 0) {
    throw new McpError(
      ErrorCode.InvalidParams,
      `Missing required parameter(s): ${missing.join(', ')}`
    );
  }
}

/**
 * Validate app_id or app_name is provided
 */
export function validateAppIdentifier(args: {
  app_id?: string;
  app_name?: string;
}): void {
  if (!args.app_id && !args.app_name) {
    throw new McpError(
      ErrorCode.InvalidParams,
      'Either app_id or app_name must be provided'
    );
  }
}

/**
 * Parse JSON string safely
 */
export function parseJsonParam(
  value: any,
  paramName: string
): any {
  if (typeof value === 'object') {
    return value;
  }

  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch (error) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Invalid JSON in ${paramName}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  throw new McpError(
    ErrorCode.InvalidParams,
    `Parameter ${paramName} must be a JSON string or object`
  );
}

/**
 * Serialize a list-valued Countly query-string parameter.
 *
 * Countly reads list parameters (`projectionKey`, `byVal`, ...) as a
 * JSON-encoded array in a single query-string field. Handing axios a raw JS
 * array instead produces `key[]=a&key[]=b`, which Countly's `qstring.<key>`
 * lookup never matches: the parameter silently disappears and the server
 * answers as though it had never been sent.
 *
 * Accepts every form a caller realistically sends and normalizes all of them:
 *   - `["did"]`           -> `'["did"]'`
 *   - `'["did"]'`         -> `'["did"]'`
 *   - `'did'`             -> `'["did"]'`  (bare key treated as a one-item list)
 *   - `[]`, `''`, nullish -> `undefined`  (parameter omitted entirely, which
 *                            is what the previous code effectively did)
 *
 * Returns `undefined` when the parameter should not be sent, so callers keep
 * the existing `if (value) { params.key = value }` shape.
 */
export function serializeListParam(
  value: unknown,
  paramName: string
): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (Array.isArray(value)) {
    return encodeList(value, paramName);
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === '') {
      return undefined;
    }

    if (trimmed.startsWith('[')) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(trimmed);
      } catch {
        throw new McpError(
          ErrorCode.InvalidParams,
          `Parameter ${paramName} looks like a JSON array but could not be parsed: ${value}`
        );
      }
      if (!Array.isArray(parsed)) {
        throw new McpError(
          ErrorCode.InvalidParams,
          `Parameter ${paramName} must be an array of strings, got: ${value}`
        );
      }
      return encodeList(parsed, paramName);
    }

    return JSON.stringify([trimmed]);
  }

  throw new McpError(
    ErrorCode.InvalidParams,
    `Parameter ${paramName} must be an array of strings or a JSON array string, got: ${typeof value}`
  );
}

function encodeList(values: unknown[], paramName: string): string | undefined {
  if (values.length === 0) {
    return undefined;
  }

  const normalized = values.map((entry) => {
    if (typeof entry === 'string') {
      return entry;
    }
    if (typeof entry === 'number' || typeof entry === 'boolean') {
      return String(entry);
    }
    throw new McpError(
      ErrorCode.InvalidParams,
      `Parameter ${paramName} must contain only strings, got an entry of type ${entry === null ? 'null' : typeof entry}`
    );
  });

  return JSON.stringify(normalized);
}

/**
 * Validate and parse numeric parameter
 */
export function parseNumericParam(
  value: any,
  paramName: string,
  min?: number,
  max?: number
): number {
  const num = typeof value === 'number' ? value : Number(value);

  if (isNaN(num)) {
    throw new McpError(
      ErrorCode.InvalidParams,
      `Parameter ${paramName} must be a number, got: ${value}`
    );
  }

  if (min !== undefined && num < min) {
    throw new McpError(
      ErrorCode.InvalidParams,
      `Parameter ${paramName} must be >= ${min}, got: ${num}`
    );
  }

  if (max !== undefined && num > max) {
    throw new McpError(
      ErrorCode.InvalidParams,
      `Parameter ${paramName} must be <= ${max}, got: ${num}`
    );
  }

  return num;
}

/**
 * Validate enum value
 */
export function validateEnum<T extends string>(
  value: any,
  paramName: string,
  allowedValues: readonly T[]
): T {
  if (!allowedValues.includes(value)) {
    throw new McpError(
      ErrorCode.InvalidParams,
      `Parameter ${paramName} must be one of: ${allowedValues.join(', ')}. Got: ${value}`
    );
  }

  return value;
}

/**
 * Validate boolean parameter
 */
export function parseBooleanParam(value: any, paramName: string): boolean {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    const lower = value.toLowerCase();
    if (lower === 'true' || lower === '1') {
return true;
}
    if (lower === 'false' || lower === '0') {
return false;
}
  }

  throw new McpError(
    ErrorCode.InvalidParams,
    `Parameter ${paramName} must be a boolean, got: ${value}`
  );
}

/**
 * Provide default value if parameter is undefined
 */
export function withDefault<T>(value: T | undefined, defaultValue: T): T {
  return value !== undefined ? value : defaultValue;
}

/**
 * Validate period format (e.g., "30days", "[20240101,20241231]")
 */
export function validatePeriod(period: string): string {
  // Simple validation - could be expanded
  if (!period || typeof period !== 'string') {
    throw new McpError(
      ErrorCode.InvalidParams,
      'Period must be a non-empty string (e.g., "30days" or "[20240101,20241231]")'
    );
  }

  return period;
}

/**
 * Build query parameters for Countly API
 */
export function buildQueryParams(params: Record<string, any>): Record<string, string> {
  const query: Record<string, string> = {};

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) {
      if (typeof value === 'object') {
        query[key] = JSON.stringify(value);
      } else {
        query[key] = String(value);
      }
    }
  }

  return query;
}
