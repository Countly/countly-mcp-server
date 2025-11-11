import { describe, it, expect, vi } from 'vitest';
import { AxiosError } from 'axios';
import { extractErrorDetails, wrapApiError, safeApiCall } from '../src/lib/error-handler.js';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';

/**
 * Error Handler Tests
 * Tests error extraction and wrapping functionality
 */

describe('Error Handler', () => {
  describe('extractErrorDetails', () => {
    it('should extract details from Axios error with response', () => {
      const axiosError = {
        name: 'AxiosError',
        message: 'Request failed with status code 400',
        isAxiosError: true,
        response: {
          status: 400,
          data: {
            error: 'Invalid input parameter',
          },
        },
        config: {
          url: '/api/endpoint',
          method: 'POST',
        },
      } as unknown as AxiosError;

      const result = extractErrorDetails(axiosError);

      expect(result.statusCode).toBe(400);
      expect(result.message).toContain('HTTP 400 error');
      expect(result.message).toContain('Invalid input parameter');
      expect(result.message).toContain('POST /api/endpoint');
      expect(result.details).toEqual({ error: 'Invalid input parameter' });
    });

    it('should extract message field from response data', () => {
      const axiosError = {
        name: 'AxiosError',
        message: 'Request failed',
        isAxiosError: true,
        response: {
          status: 500,
          data: {
            message: 'Internal server error occurred',
          },
        },
        config: {
          url: '/api/test',
          method: 'GET',
        },
      } as unknown as AxiosError;

      const result = extractErrorDetails(axiosError);

      expect(result.message).toContain('HTTP 500 error');
      expect(result.message).toContain('Internal server error occurred');
    });

    it('should extract result field from response data', () => {
      const axiosError = {
        name: 'AxiosError',
        message: 'Request failed',
        isAxiosError: true,
        response: {
          status: 403,
          data: {
            result: 'Forbidden: Insufficient permissions',
          },
        },
        config: {
          url: '/api/protected',
          method: 'DELETE',
        },
      } as unknown as AxiosError;

      const result = extractErrorDetails(axiosError);

      expect(result.message).toContain('HTTP 403 error');
      expect(result.message).toContain('Forbidden: Insufficient permissions');
    });

    it('should handle string response data', () => {
      const axiosError = {
        name: 'AxiosError',
        message: 'Request failed',
        isAxiosError: true,
        response: {
          status: 404,
          data: 'Resource not found',
        },
        config: {
          url: '/api/resource/123',
          method: 'GET',
        },
      } as unknown as AxiosError;

      const result = extractErrorDetails(axiosError);

      expect(result.message).toContain('HTTP 404 error');
      expect(result.message).toContain('Resource not found');
    });

    it('should handle structured response data', () => {
      const axiosError = {
        name: 'AxiosError',
        message: 'Request failed',
        isAxiosError: true,
        response: {
          status: 422,
          data: {
            field: 'email',
            validation: 'must be valid email',
          },
        },
        config: {
          url: '/api/users',
          method: 'POST',
        },
      } as unknown as AxiosError;

      const result = extractErrorDetails(axiosError);

      expect(result.message).toContain('HTTP 422 error');
      expect(result.message).toContain('field');
      expect(result.message).toContain('validation');
    });

    it('should truncate long response data', () => {
      const longData = { data: 'x'.repeat(300) };
      const axiosError = {
        name: 'AxiosError',
        message: 'Request failed',
        isAxiosError: true,
        response: {
          status: 500,
          data: longData,
        },
        config: {
          url: '/api/test',
          method: 'GET',
        },
      } as unknown as AxiosError;

      const result = extractErrorDetails(axiosError);

      expect(result.message).toContain('...');
      expect(result.message.length).toBeLessThan(400);
    });

    it('should handle request errors without response', () => {
      const axiosError = {
        name: 'AxiosError',
        message: 'Network Error',
        isAxiosError: true,
        request: {},
        config: {
          url: '/api/endpoint',
          method: 'GET',
        },
      } as unknown as AxiosError;

      const result = extractErrorDetails(axiosError);

      expect(result.statusCode).toBeUndefined();
      expect(result.message).toContain('No response from server');
      expect(result.message).toContain('Network Error');
      expect(result.message).toContain('GET /api/endpoint');
    });

    it('should handle errors without URL', () => {
      const axiosError = {
        name: 'AxiosError',
        message: 'Request failed',
        isAxiosError: true,
        response: {
          status: 400,
          data: { error: 'Bad request' },
        },
        config: {},
      } as unknown as AxiosError;

      const result = extractErrorDetails(axiosError);

      expect(result.message).toContain('HTTP 400 error');
      expect(result.message).toContain('Bad request');
      expect(result.message).not.toContain('undefined');
    });

    it('should handle regular Error objects', () => {
      const error = new Error('Something went wrong');

      const result = extractErrorDetails(error);

      expect(result.message).toBe('Something went wrong');
      expect(result.statusCode).toBeUndefined();
    });

    it('should handle non-Error objects', () => {
      const error = 'Simple string error';

      const result = extractErrorDetails(error);

      expect(result.message).toBe('Simple string error');
      expect(result.statusCode).toBeUndefined();
    });
  });

  describe('wrapApiError', () => {
    it('should wrap 401 error as InvalidRequest', () => {
      const axiosError = {
        name: 'AxiosError',
        message: 'Unauthorized',
        isAxiosError: true,
        response: {
          status: 401,
          data: { error: 'Invalid token' },
        },
        config: {
          url: '/api/protected',
          method: 'GET',
        },
      } as unknown as AxiosError;

      const mcpError = wrapApiError(axiosError);

      expect(mcpError).toBeInstanceOf(McpError);
      expect(mcpError.code).toBe(ErrorCode.InvalidRequest);
      expect(mcpError.message).toContain('HTTP 401 error');
      expect(mcpError.message).toContain('Invalid token');
    });

    it('should wrap 403 error as InvalidRequest', () => {
      const axiosError = {
        name: 'AxiosError',
        message: 'Forbidden',
        isAxiosError: true,
        response: {
          status: 403,
          data: { error: 'Access denied' },
        },
        config: {},
      } as unknown as AxiosError;

      const mcpError = wrapApiError(axiosError);

      expect(mcpError.code).toBe(ErrorCode.InvalidRequest);
    });

    it('should wrap 404 error as InvalidRequest', () => {
      const axiosError = {
        name: 'AxiosError',
        message: 'Not Found',
        isAxiosError: true,
        response: {
          status: 404,
          data: 'Resource not found',
        },
        config: {},
      } as unknown as AxiosError;

      const mcpError = wrapApiError(axiosError);

      expect(mcpError.code).toBe(ErrorCode.InvalidRequest);
    });

    it('should wrap 4xx errors as InvalidRequest', () => {
      const axiosError = {
        name: 'AxiosError',
        message: 'Client Error',
        isAxiosError: true,
        response: {
          status: 422,
          data: { error: 'Validation failed' },
        },
        config: {},
      } as unknown as AxiosError;

      const mcpError = wrapApiError(axiosError);

      expect(mcpError.code).toBe(ErrorCode.InvalidRequest);
    });

    it('should wrap 5xx errors as InternalError', () => {
      const axiosError = {
        name: 'AxiosError',
        message: 'Internal Server Error',
        isAxiosError: true,
        response: {
          status: 500,
          data: { error: 'Database connection failed' },
        },
        config: {},
      } as unknown as AxiosError;

      const mcpError = wrapApiError(axiosError);

      expect(mcpError.code).toBe(ErrorCode.InternalError);
    });

    it('should wrap network errors as InternalError', () => {
      const axiosError = {
        name: 'AxiosError',
        message: 'Network Error',
        isAxiosError: true,
        request: {},
        config: {},
      } as unknown as AxiosError;

      const mcpError = wrapApiError(axiosError);

      expect(mcpError.code).toBe(ErrorCode.InternalError);
    });

    it('should include context in error message', () => {
      const axiosError = {
        name: 'AxiosError',
        message: 'Bad Request',
        isAxiosError: true,
        response: {
          status: 400,
          data: { error: 'Invalid parameter' },
        },
        config: {},
      } as unknown as AxiosError;

      const mcpError = wrapApiError(axiosError, 'Failed to create user');

      expect(mcpError.message).toContain('Failed to create user');
      expect(mcpError.message).toContain('HTTP 400 error');
      expect(mcpError.message).toContain('Invalid parameter');
    });
  });

  describe('safeApiCall', () => {
    it('should return result on successful API call', async () => {
      const mockApiCall = vi.fn().mockResolvedValue({ data: { success: true } });

      const result = await safeApiCall(mockApiCall);

      expect(result).toEqual({ data: { success: true } });
      expect(mockApiCall).toHaveBeenCalledOnce();
    });

    it('should wrap errors thrown by API call', async () => {
      const axiosError = {
        name: 'AxiosError',
        message: 'Request failed',
        isAxiosError: true,
        response: {
          status: 500,
          data: { error: 'Server error' },
        },
        config: {
          url: '/api/test',
          method: 'GET',
        },
      } as unknown as AxiosError;

      const mockApiCall = vi.fn().mockRejectedValue(axiosError);

      await expect(safeApiCall(mockApiCall, 'Test API call')).rejects.toThrow(McpError);
      
      try {
        await safeApiCall(mockApiCall, 'Test API call');
      } catch (error) {
        expect(error).toBeInstanceOf(McpError);
        expect((error as McpError).message).toContain('Test API call');
        expect((error as McpError).message).toContain('Server error');
      }
    });

    it('should work without context message', async () => {
      const axiosError = {
        name: 'AxiosError',
        message: 'Request failed',
        isAxiosError: true,
        response: {
          status: 404,
          data: 'Not found',
        },
        config: {},
      } as unknown as AxiosError;

      const mockApiCall = vi.fn().mockRejectedValue(axiosError);

      await expect(safeApiCall(mockApiCall)).rejects.toThrow(McpError);
      
      try {
        await safeApiCall(mockApiCall);
      } catch (error) {
        expect(error).toBeInstanceOf(McpError);
        expect((error as McpError).message).toContain('HTTP 404 error');
      }
    });
  });
});
