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
