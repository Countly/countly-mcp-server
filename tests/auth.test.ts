import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  resolveAuthToken,
  readTokenFromFile,
  createMissingAuthError,
  requireAuthToken,
} from '../src/lib/auth.js';

/**
 * Authentication Tests
 * Tests pure authentication functions without external dependencies
 */

describe('Authentication', () => {
  let tempDir: string;
  let tokenFilePath: string;

  beforeEach(() => {
    // Create temp directory for test files
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'countly-test-'));
    tokenFilePath = path.join(tempDir, 'token.txt');
  });

  afterEach(() => {
    // Clean up temp directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('resolveAuthToken', () => {
    it('should prioritize metadata token over all others', () => {
      const result = resolveAuthToken({
        metadata: { countlyAuthToken: 'metadata-token' },
        args: { countly_auth_token: 'args-token' },
        env: {
          COUNTLY_AUTH_TOKEN: 'env-token',
        },
      });

      expect(result).toBe('metadata-token');
    });

    it('should use args token when metadata is not provided', () => {
      const result = resolveAuthToken({
        args: { countly_auth_token: 'args-token' },
        env: {
          COUNTLY_AUTH_TOKEN: 'env-token',
        },
      });

      expect(result).toBe('args-token');
    });

    it('should use env token when metadata and args not provided', () => {
      const result = resolveAuthToken({
        env: {
          COUNTLY_AUTH_TOKEN: 'env-token',
        },
      });

      expect(result).toBe('env-token');
    });

    it('should read from file when only file path is provided', () => {
      fs.writeFileSync(tokenFilePath, 'file-token');

      const result = resolveAuthToken({
        env: {
          COUNTLY_AUTH_TOKEN_FILE: tokenFilePath,
        },
      });

      expect(result).toBe('file-token');
    });

    it('should return undefined when no token source provided', () => {
      const result = resolveAuthToken({
        env: {},
      });

      expect(result).toBeUndefined();
    });

    it('should handle missing metadata gracefully', () => {
      const result = resolveAuthToken({
        metadata: undefined,
        args: { countly_auth_token: 'args-token' },
      });

      expect(result).toBe('args-token');
    });
  });

  describe('readTokenFromFile', () => {
    it('should read token from valid file', () => {
      fs.writeFileSync(tokenFilePath, 'my-token');

      const result = readTokenFromFile(tokenFilePath);

      expect(result).toBe('my-token');
    });

    it('should trim whitespace from token', () => {
      fs.writeFileSync(tokenFilePath, '  my-token\n\n  ');

      const result = readTokenFromFile(tokenFilePath);

      expect(result).toBe('my-token');
    });

    it('should throw error for missing file', () => {
      expect(() => {
        readTokenFromFile('/nonexistent/token.txt');
      }).toThrow('Token file not found');
    });

    it('should throw error for empty file', () => {
      fs.writeFileSync(tokenFilePath, '   \n\n   ');

      expect(() => {
        readTokenFromFile(tokenFilePath);
      }).toThrow('Token file is empty');
    });

    it('should throw error for unreadable file', () => {
      fs.writeFileSync(tokenFilePath, 'token');
      fs.chmodSync(tokenFilePath, 0o000);

      expect(() => {
        readTokenFromFile(tokenFilePath);
      }).toThrow('Permission denied');

      // Cleanup
      fs.chmodSync(tokenFilePath, 0o644);
    });
  });

  describe('createMissingAuthError', () => {
    it('should create error with helpful message', () => {
      const error = createMissingAuthError();

      expect(error.message).toContain('No authentication token provided');
      expect(error.message).toContain('metadata.countlyAuthToken');
      expect(error.message).toContain('countly_auth_token');
      expect(error.message).toContain('COUNTLY_AUTH_TOKEN');
      expect(error.message).toContain('COUNTLY_AUTH_TOKEN_FILE');
    });
  });

  describe('requireAuthToken', () => {
    it('should return token when available', () => {
      const result = requireAuthToken({
        env: { COUNTLY_AUTH_TOKEN: 'my-token' },
      });

      expect(result).toBe('my-token');
    });

    it('should throw error when no token available', () => {
      expect(() => {
        requireAuthToken({ env: {} });
      }).toThrow('No authentication token provided');
    });
  });
});
