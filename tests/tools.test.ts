import { describe, it, expect, beforeEach } from 'vitest';
import { ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import {
  normalizeServerUrl,
  parseTimeout,
  loadConfigFromEnv,
  validateServerUrl,
  buildConfig,
} from '../src/lib/config.js';
import {
  AppCache,
  resolveAppIdentifier,
  type CountlyApp,
} from '../src/lib/app-cache.js';
import {
  validateRequiredParams,
  validateAppIdentifier,
  parseJsonParam,
  parseNumericParam,
  validateEnum,
  parseBooleanParam,
  withDefault,
  validatePeriod,
  buildQueryParams,
} from '../src/lib/validation.js';

/**
 * Configuration Tests
 */
describe('Configuration', () => {
  describe('normalizeServerUrl', () => {
    it('should remove single trailing slash', () => {
      expect(normalizeServerUrl('https://api.count.ly/')).toBe('https://api.count.ly');
    });

    it('should remove multiple trailing slashes', () => {
      expect(normalizeServerUrl('https://api.count.ly///')).toBe('https://api.count.ly');
    });

    it('should not modify URL without trailing slash', () => {
      expect(normalizeServerUrl('https://api.count.ly')).toBe('https://api.count.ly');
    });
  });

  describe('parseTimeout', () => {
    it('should return default when no timeout provided', () => {
      expect(parseTimeout(undefined, 30000)).toBe(30000);
    });

    it('should parse valid timeout string', () => {
      expect(parseTimeout('60000')).toBe(60000);
    });

    it('should throw error for invalid timeout', () => {
      expect(() => parseTimeout('invalid')).toThrow('Invalid timeout value');
    });

    it('should throw error for negative timeout', () => {
      expect(() => parseTimeout('-1000')).toThrow('Invalid timeout value');
    });

    it('should throw error for zero timeout', () => {
      expect(() => parseTimeout('0')).toThrow('Invalid timeout value');
    });
  });

  describe('loadConfigFromEnv', () => {
    it('should load config from environment', () => {
      const config = loadConfigFromEnv({
        COUNTLY_SERVER_URL: 'https://api.count.ly/',
        COUNTLY_TIMEOUT: '45000',
      });

      expect(config.serverUrl).toBe('https://api.count.ly');
      expect(config.timeout).toBe(45000);
    });

    it('should use default timeout', () => {
      const config = loadConfigFromEnv({
        COUNTLY_SERVER_URL: 'https://api.count.ly',
      });

      expect(config.timeout).toBe(30000);
    });

    it('should throw error when COUNTLY_SERVER_URL missing', () => {
      expect(() => loadConfigFromEnv({})).toThrow('COUNTLY_SERVER_URL');
    });

    it('should allow missing URL in test mode', () => {
      const config = loadConfigFromEnv({}, true);
      expect(config.serverUrl).toBe('');
    });
  });

  describe('validateServerUrl', () => {
    it('should validate HTTP URL', () => {
      expect(validateServerUrl('http://localhost:3000')).toBe(true);
    });

    it('should validate HTTPS URL', () => {
      expect(validateServerUrl('https://api.count.ly')).toBe(true);
    });

    it('should reject invalid URL', () => {
      expect(validateServerUrl('not-a-url')).toBe(false);
    });

    it('should reject non-HTTP protocols', () => {
      expect(validateServerUrl('ftp://example.com')).toBe(false);
    });
  });

  describe('buildConfig', () => {
    it('should build complete config', () => {
      const config = buildConfig(
        {
          COUNTLY_SERVER_URL: 'https://api.count.ly',
          COUNTLY_TIMEOUT: '60000',
        },
        'my-token'
      );

      expect(config.serverUrl).toBe('https://api.count.ly');
      expect(config.timeout).toBe(60000);
      expect(config.authToken).toBe('my-token');
    });

    it('should throw for invalid URL', () => {
      expect(() =>
        buildConfig(
          {
            COUNTLY_SERVER_URL: 'invalid-url',
          },
          'token'
        )
      ).toThrow('Invalid COUNTLY_SERVER_URL');
    });
  });
});

/**
 * App Cache Tests
 */
describe('AppCache', () => {
  const mockApps: CountlyApp[] = [
    { _id: 'app1', name: 'TestApp1', key: 'key1', created_at: 0, timezone: 'UTC' },
    { _id: 'app2', name: 'TestApp2', key: 'key2', created_at: 0, timezone: 'UTC' },
    { _id: 'app3', name: 'MyApp', key: 'key3', created_at: 0, timezone: 'America/New_York', category: 'Mobile' },
  ];

  describe('Cache Management', () => {
    it('should initialize with empty cache', () => {
      const cache = new AppCache();
      expect(cache.size()).toBe(0);
      expect(cache.getAll()).toEqual([]);
    });

    it('should update cache with apps', () => {
      const cache = new AppCache();
      cache.update(mockApps);
      expect(cache.size()).toBe(3);
      expect(cache.getAll()).toEqual(mockApps);
    });

    it('should start as expired', () => {
      const cache = new AppCache();
      expect(cache.isExpired()).toBe(true);
    });

    it('should not be expired immediately after update', () => {
      const cache = new AppCache();
      cache.update(mockApps);
      expect(cache.isExpired()).toBe(false);
    });

    it('should expire after cache duration', () => {
      const cache = new AppCache(100); // 100ms
      cache.update(mockApps);
      
      // Should not be expired immediately
      expect(cache.isExpired()).toBe(false);
      
      // Wait for expiry
      return new Promise((resolve) => {
        setTimeout(() => {
          expect(cache.isExpired()).toBe(true);
          resolve(undefined);
        }, 150);
      });
    });

    it('should clear cache', () => {
      const cache = new AppCache();
      cache.update(mockApps);
      cache.clear();
      
      expect(cache.size()).toBe(0);
      expect(cache.isExpired()).toBe(true);
    });
  });

  describe('App Lookup', () => {
    let cache: AppCache;

    beforeEach(() => {
      cache = new AppCache();
      cache.update(mockApps);
    });

    it('should find app by ID', () => {
      const app = cache.findById('app2');
      expect(app?.name).toBe('TestApp2');
    });

    it('should return undefined for non-existent ID', () => {
      const app = cache.findById('nonexistent');
      expect(app).toBeUndefined();
    });

    it('should find app by name', () => {
      const app = cache.findByName('MyApp');
      expect(app?._id).toBe('app3');
    });

    it('should return undefined for non-existent name', () => {
      const app = cache.findByName('NonExistent');
      expect(app).toBeUndefined();
    });

    it('should resolve app name to ID', () => {
      const appId = cache.resolveAppName('TestApp1');
      expect(appId).toBe('app1');
    });

    it('should throw error for non-existent app name', () => {
      expect(() => cache.resolveAppName('NonExistent')).toThrow('App not found: NonExistent');
    });

    it('should list available apps in error', () => {
      try {
        cache.resolveAppName('NonExistent');
      } catch (error) {
        expect((error as Error).message).toContain('TestApp1');
        expect((error as Error).message).toContain('TestApp2');
        expect((error as Error).message).toContain('MyApp');
      }
    });
  });

  describe('resolveAppIdentifier', () => {
    it('should return app_id when provided', () => {
      const result = resolveAppIdentifier({ app_id: 'app123' }, mockApps);
      expect(result).toBe('app123');
    });

    it('should resolve app_name to app_id', () => {
      const result = resolveAppIdentifier({ app_name: 'MyApp' }, mockApps);
      expect(result).toBe('app3');
    });

    it('should prioritize app_id over app_name', () => {
      const result = resolveAppIdentifier(
        { app_id: 'app999', app_name: 'MyApp' },
        mockApps
      );
      expect(result).toBe('app999');
    });

    it('should throw error when neither provided', () => {
      expect(() => resolveAppIdentifier({}, mockApps)).toThrow('Either app_id or app_name must be provided');
    });

    it('should throw error for non-existent app_name', () => {
      expect(() =>
        resolveAppIdentifier({ app_name: 'NonExistent' }, mockApps)
      ).toThrow('App not found: NonExistent');
    });
  });
});

/**
 * Parameter Validation Tests
 */
describe('Parameter Validation', () => {
  describe('validateRequiredParams', () => {
    it('should pass when all required params present', () => {
      expect(() =>
        validateRequiredParams({ name: 'test', age: 25 }, ['name', 'age'])
      ).not.toThrow();
    });

    it('should throw for missing params', () => {
      expect(() =>
        validateRequiredParams({ name: 'test' }, ['name', 'age'])
      ).toThrow('Missing required parameter(s): age');
    });

    it('should list all missing params', () => {
      try {
        validateRequiredParams({}, ['name', 'age', 'email']);
      } catch (error: any) {
        expect(error.message).toContain('name');
        expect(error.message).toContain('age');
        expect(error.message).toContain('email');
      }
    });

    it('should reject undefined values', () => {
      expect(() =>
        validateRequiredParams({ name: undefined }, ['name'])
      ).toThrow('Missing required parameter(s): name');
    });
  });

  describe('validateAppIdentifier', () => {
    it('should pass with app_id', () => {
      expect(() => validateAppIdentifier({ app_id: 'app123' })).not.toThrow();
    });

    it('should pass with app_name', () => {
      expect(() => validateAppIdentifier({ app_name: 'MyApp' })).not.toThrow();
    });

    it('should throw when neither provided', () => {
      expect(() => validateAppIdentifier({})).toThrow('Either app_id or app_name must be provided');
    });
  });

  describe('parseJsonParam', () => {
    it('should return object as-is', () => {
      const obj = { key: 'value' };
      expect(parseJsonParam(obj, 'test')).toBe(obj);
    });

    it('should parse JSON string', () => {
      const result = parseJsonParam('{"key":"value"}', 'test');
      expect(result).toEqual({ key: 'value' });
    });

    it('should throw for invalid JSON', () => {
      expect(() => parseJsonParam('{invalid}', 'test')).toThrow('Invalid JSON');
    });

    it('should throw for non-JSON types', () => {
      expect(() => parseJsonParam(123, 'test')).toThrow('must be a JSON string or object');
    });
  });

  describe('parseNumericParam', () => {
    it('should parse number', () => {
      expect(parseNumericParam(42, 'test')).toBe(42);
    });

    it('should parse numeric string', () => {
      expect(parseNumericParam('42', 'test')).toBe(42);
    });

    it('should throw for non-numeric', () => {
      expect(() => parseNumericParam('abc', 'test')).toThrow('must be a number');
    });

    it('should validate minimum', () => {
      expect(() => parseNumericParam(5, 'test', 10)).toThrow('must be >= 10');
    });

    it('should validate maximum', () => {
      expect(() => parseNumericParam(100, 'test', 0, 50)).toThrow('must be <= 50');
    });

    it('should pass min/max validation', () => {
      expect(parseNumericParam(25, 'test', 0, 100)).toBe(25);
    });
  });

  describe('validateEnum', () => {
    const colors = ['red', 'green', 'blue'] as const;

    it('should accept valid value', () => {
      expect(validateEnum('red', 'color', colors)).toBe('red');
    });

    it('should reject invalid value', () => {
      expect(() => validateEnum('yellow', 'color', colors)).toThrow('must be one of');
    });

    it('should list allowed values in error', () => {
      try {
        validateEnum('yellow', 'color', colors);
      } catch (error: any) {
        expect(error.message).toContain('red');
        expect(error.message).toContain('green');
        expect(error.message).toContain('blue');
      }
    });
  });

  describe('parseBooleanParam', () => {
    it('should accept boolean true', () => {
      expect(parseBooleanParam(true, 'test')).toBe(true);
    });

    it('should accept boolean false', () => {
      expect(parseBooleanParam(false, 'test')).toBe(false);
    });

    it('should parse "true" string', () => {
      expect(parseBooleanParam('true', 'test')).toBe(true);
    });

    it('should parse "false" string', () => {
      expect(parseBooleanParam('false', 'test')).toBe(false);
    });

    it('should parse "1" as true', () => {
      expect(parseBooleanParam('1', 'test')).toBe(true);
    });

    it('should parse "0" as false', () => {
      expect(parseBooleanParam('0', 'test')).toBe(false);
    });

    it('should be case insensitive', () => {
      expect(parseBooleanParam('TRUE', 'test')).toBe(true);
      expect(parseBooleanParam('False', 'test')).toBe(false);
    });

    it('should throw for invalid boolean', () => {
      expect(() => parseBooleanParam('yes', 'test')).toThrow('must be a boolean');
    });
  });

  describe('withDefault', () => {
    it('should return value when defined', () => {
      expect(withDefault(42, 100)).toBe(42);
    });

    it('should return default when undefined', () => {
      expect(withDefault(undefined, 100)).toBe(100);
    });

    it('should handle falsy values', () => {
      expect(withDefault(0, 100)).toBe(0);
      expect(withDefault('', 'default')).toBe('');
      expect(withDefault(false, true)).toBe(false);
    });
  });

  describe('validatePeriod', () => {
    it('should accept valid period string', () => {
      expect(validatePeriod('30days')).toBe('30days');
    });

    it('should accept date range format', () => {
      expect(validatePeriod('[20240101,20241231]')).toBe('[20240101,20241231]');
    });

    it('should throw for empty string', () => {
      expect(() => validatePeriod('')).toThrow('Period must be a non-empty string');
    });

    it('should throw for non-string', () => {
      expect(() => validatePeriod(123 as any)).toThrow('Period must be a non-empty string');
    });
  });

  describe('buildQueryParams', () => {
    it('should convert simple values to strings', () => {
      const result = buildQueryParams({
        name: 'test',
        age: 25,
        active: true,
      });

      expect(result).toEqual({
        name: 'test',
        age: '25',
        active: 'true',
      });
    });

    it('should stringify objects', () => {
      const result = buildQueryParams({
        filter: { name: 'test' },
      });

      expect(result).toEqual({
        filter: '{"name":"test"}',
      });
    });

    it('should skip undefined and null', () => {
      const result = buildQueryParams({
        name: 'test',
        age: undefined,
        email: null,
      });

      expect(result).toEqual({
        name: 'test',
      });
    });

    it('should handle empty object', () => {
      const result = buildQueryParams({});
      expect(result).toEqual({});
    });
    });
});
