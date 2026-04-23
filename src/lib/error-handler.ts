// Helper to robustly check for plain objects
function isPlainObject(obj: any): boolean {
  return typeof obj === 'object' &&
    obj !== null &&
    Object.prototype.toString.call(obj) === '[object Object]';
}
/**
 * Error handling utilities for API requests
 * Provides better error messages by extracting details from API responses
 */

import { AxiosError } from 'axios';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';

/**
 * Replace obviously-sensitive substrings in a free-form error message so we
 * don't propagate auth tokens into MCP error responses, analytics events,
 * or operator logs.
 *
 * Matches:
 *  - `auth_token=<value>` / `api_key=<value>` / `token=<value>` inside a URL
 *    or JSON blob (value ends at `&`, `"`, whitespace, or end of string)
 *  - `countly-token: <value>` style HTTP header lines
 *  - JSON field values for the same keys (e.g. `"auth_token":"xxx"`)
 *
 * This is best-effort — it can't catch tokens that don't appear next to a
 * labelled key. Useful as a last-line-of-defense when the upstream Countly
 * server echoes parts of the request back in its error body.
 */
export function redactSensitiveInMessage(message: string): string {
  if (!message) {
    return message;
  }
  return message
    // url / form style: auth_token=... until & or whitespace or end
    .replace(/(auth_token|api_key|token|countly_auth_token|countly-token)\s*=\s*[^&\s"']+/gi,
      '$1=[REDACTED]')
    // JSON-style: "auth_token":"..."
    .replace(/"(auth_token|api_key|token|countly_auth_token|countly-token)"\s*:\s*"[^"]*"/gi,
      '"$1":"[REDACTED]"')
    // HTTP header style: `countly-token: xxx` or `Authorization: Bearer xxx`
    // — grab the whole value to end-of-line so we also catch the token after
    // a scheme word ("Bearer", "Token", etc).
    .replace(/(countly-token|authorization)\s*:\s*[^\r\n]+/gi,
      '$1: [REDACTED]');
}

/**
 * Extract detailed error information from an Axios error
 */
export function extractErrorDetails(error: unknown): {
  message: string;
  statusCode?: number;
  details?: any;
} {
  // Check if this looks like an Axios error (has response or request properties)
  const isAxiosLike = error && typeof error === 'object' && 
    ('response' in error || 'request' in error || 'isAxiosError' in error);
  
  if (isAxiosLike) {
    const axiosError = error as AxiosError;
    const statusCode = axiosError.response?.status;
    const responseData = axiosError.response?.data;
    
    // Build a detailed error message
    let message = (axiosError as any).message || 'Request failed';
    
    // If there's a response, extract more details
    if (axiosError.response) {
      const status = statusCode || 'unknown';
      message = `HTTP ${status} error`;
      
      // Try to extract error message from response body
      if (responseData) {
        if (typeof responseData === 'string') {
          message += `: ${responseData}`;
        } else if (isPlainObject(responseData)) {
          // Robust check for plain objects (not Date, RegExp, Array, etc.)
          const data = responseData as any;
          if (data.error) {
            message += `: ${data.error}`;
          } else if (data.message) {
            message += `: ${data.message}`;
          } else if (data.result) {
            message += `: ${data.result}`;
          } else {
            // Include the full response data if it's structured
            try {
              const dataStr = JSON.stringify(responseData);
              if (dataStr.length < 200) {
                message += `: ${dataStr}`;
              } else {
                message += `: ${dataStr.substring(0, 200)}...`;
              }
            } catch {
              message += ': Unable to parse response body';
            }
          }
        }
      }
      
      // Add URL info for context
      if (axiosError.config?.url) {
        message += ` (${axiosError.config.method?.toUpperCase()} ${axiosError.config.url})`;
      }
    } else if (axiosError.request) {
      // Request was made but no response received
      message = `No response from server: ${(axiosError as any).message || 'Network Error'}`;
      if (axiosError.config?.url) {
        message += ` (${axiosError.config.method?.toUpperCase()} ${axiosError.config.url})`;
      }
    }
    
    return {
      message: redactSensitiveInMessage(message),
      statusCode,
      details: responseData,
    };
  }

  // For non-Axios errors
  if (error instanceof Error) {
    return {
      message: redactSensitiveInMessage(error.message),
    };
  }

  return {
    message: redactSensitiveInMessage(String(error)),
  };
}

/**
 * Wrap an Axios error into an MCP error with detailed information
 */
export function wrapApiError(error: unknown, context?: string): McpError {
  const { message, statusCode } = extractErrorDetails(error);
  
  // Determine appropriate error code based on status
  let errorCode = ErrorCode.InternalError;
  
  if (statusCode) {
    if (statusCode === 401 || statusCode === 403) {
      errorCode = ErrorCode.InvalidRequest;
    } else if (statusCode === 404) {
      errorCode = ErrorCode.InvalidRequest;
    } else if (statusCode >= 400 && statusCode < 500) {
      errorCode = ErrorCode.InvalidRequest;
    }
  }
  
  // Build final message with context
  const finalMessage = context ? `${context}: ${message}` : message;
  
  return new McpError(errorCode, finalMessage);
}

/**
 * Safe wrapper for API calls that provides detailed error information
 */
export async function safeApiCall<T>(
  apiCall: () => Promise<T>,
  context?: string
): Promise<T> {
  try {
    return await apiCall();
  } catch (error) {
    throw wrapApiError(error, context);
  }
}
