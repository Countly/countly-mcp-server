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
 * Countly reads list parameters (`projectionKey`, `byVal`, `events`, ...) as a
 * JSON-encoded array in a single query-string field. Handing axios a raw JS
 * array instead produces `key[]=a&key[]=b`, which Countly's `qstring.<key>`
 * lookup never sees — the parameter silently disappears and the server answers
 * as though it had not been sent.
 *
 * Accepts what tool callers realistically send and normalizes all of it:
 *   - `["did"]`          -> `'["did"]'`
 *   - `'["did"]'`        -> `'["did"]'`  (already-encoded, passed through)
 *   - `'did'`            -> `'["did"]'`  (bare key treated as a one-item list)
 *   - `[]`, `''`, nullish -> `undefined` (caller omits the parameter entirely,
 *                            matching the pre-existing "no breakdown" behavior)
 *
 * Returns `undefined` when the parameter should not be sent at all, so callers
 * keep using `if (value) { params.key = value }`.
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

    // An already JSON-encoded array is re-encoded rather than forwarded
    // verbatim, so whitespace and element types are normalized the same way
    // for every input form.
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

    // A bare key such as "did" is a list of one.
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
 * Serialize a MongoDB-style query parameter that Countly reads as a
 * JSON-encoded string (`queryObject`, `filter`, ...).
 *
 * Tool schemas declare these as strings, but callers sometimes send a real
 * object; axios would then flatten it into `queryObject[up.country]=US`, which
 * Countly cannot parse as a query. Objects are encoded, strings pass through
 * unchanged (so existing callers are byte-for-byte unaffected), and an absent
 * or empty value becomes the supplied default.
 */
export function serializeQueryParam(
  value: unknown,
  paramName: string,
  defaultValue = '{}'
): string {
  if (value === undefined || value === null || value === '') {
    return defaultValue;
  }

  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'object') {
    return JSON.stringify(value);
  }

  throw new McpError(
    ErrorCode.InvalidParams,
    `Parameter ${paramName} must be a JSON string or object, got: ${typeof value}`
  );
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
