import { describe, it, expect, vi, beforeEach } from 'vitest';
import { listResources, readResource } from '../src/lib/resources.js';
import { AppCache } from '../src/lib/app-cache.js';

describe('Resources', () => {
  let mockHttpClient: any;
  let mockAppCache: AppCache;
  let mockGetAuthParams: () => {};

  beforeEach(() => {
    mockHttpClient = {
      get: vi.fn(),
      post: vi.fn(),
      defaults: {
        headers: {
          common: {}
        }
      }
    };
    mockAppCache = {
      getAll: vi.fn(),
      update: vi.fn(),
      size: vi.fn(),
      isExpired: vi.fn(),
      get: vi.fn(),
      clear: vi.fn(),
    } as any;
    mockGetAuthParams = vi.fn();
  });

  describe('listResources', () => {
    it('should return resources for all apps when no appId specified', async () => {
      const mockApps = [
        { _id: 'app1', name: 'TestApp1', key: 'key1' },
        { _id: 'app2', name: 'TestApp2', key: 'key2' },
      ];

      mockAppCache.isExpired = vi.fn().mockReturnValue(true);
      mockAppCache.getAll = vi.fn().mockReturnValue([]);
      mockHttpClient.get = vi.fn().mockResolvedValue({
        data: mockApps
      });

      const resources = await listResources(mockHttpClient, mockAppCache, mockGetAuthParams);

      expect(mockHttpClient.get).toHaveBeenCalledWith('/o/apps/mine', expect.any(Object));
      expect(resources.length).toBeGreaterThan(0);

      // Should have resources for each app
      const appResources = resources.filter(r => r.uri.includes('/app/'));
      expect(appResources.length).toBe(mockApps.length * 3); // config, events, overview per app
    });

    it('should return resources for specific app when appId specified', async () => {
      const mockApps = [
        { _id: 'app1', name: 'TestApp1', key: 'key1' },
        { _id: 'app2', name: 'TestApp2', key: 'key2' },
      ];

      mockAppCache.getAll = vi.fn().mockReturnValue(mockApps);

      const resources = await listResources(mockHttpClient, mockAppCache, mockGetAuthParams, 'app1');

      // Should only have resources for app1
      const appResources = resources.filter(r => r.uri.includes('/app/app1'));
      expect(appResources.length).toBe(3); // config, events, overview
      expect(appResources.every(r => r.uri.includes('app1'))).toBe(true);
    });

    it('should handle empty apps list', async () => {
      mockAppCache.getAll = vi.fn().mockReturnValue([]);
      mockHttpClient.get = vi.fn().mockResolvedValue({ data: [] });

      const resources = await listResources(mockHttpClient, mockAppCache, mockGetAuthParams);

      expect(resources.length).toBe(0);
    });
  });

  describe('readResource', () => {
    it('should read app config resource', async () => {
      const mockApp = { _id: 'app1', name: 'TestApp', key: 'key1' };
      mockAppCache.getAll = vi.fn().mockReturnValue([mockApp]);
      // getAppConfig doesn't make HTTP calls, just returns app data

      const result = await readResource(
        'countly://app/app1/config',
        mockHttpClient,
        mockAppCache,
        mockGetAuthParams
      );

      expect(result.uri).toBe('countly://app/app1/config');
      expect(result.mimeType).toBe('application/json');
      expect(result.text).toContain('"id": "app1"');
      expect(result.text).toContain('"name": "TestApp"');
    });

    it('should read app events resource', async () => {
      const mockApp = { _id: 'app1', name: 'TestApp', key: 'key1' };
      mockAppCache.getAll = vi.fn().mockReturnValue([mockApp]);
      mockHttpClient.get = vi.fn().mockResolvedValue({
        data: {
          event1: { name: 'Event 1', count: 100 },
          event2: { name: 'Event 2', count: 50 }
        }
      });

      const result = await readResource(
        'countly://app/app1/events',
        mockHttpClient,
        mockAppCache,
        mockGetAuthParams
      );

      expect(mockHttpClient.get).toHaveBeenCalledWith('/o', expect.objectContaining({
        params: expect.objectContaining({
          app_id: 'app1',
          method: 'get_events'
        })
      }));
      expect(result.text).toContain('event1');
      expect(result.text).toContain('Event 1');
    });

    it('should read app overview resource', async () => {
      const mockApp = { _id: 'app1', name: 'TestApp', key: 'key1' };
      mockAppCache.getAll = vi.fn().mockReturnValue([mockApp]);
      mockHttpClient.get = vi.fn().mockResolvedValue({
        data: {
          total_users: 1000,
          new_users: 100,
          total_sessions: 500,
          total_events: 2000,
          crashes: 5
        }
      });

      const result = await readResource(
        'countly://app/app1/overview',
        mockHttpClient,
        mockAppCache,
        mockGetAuthParams
      );

      expect(mockHttpClient.get).toHaveBeenCalledWith('/o/analytics/dashboard', expect.objectContaining({
        params: expect.objectContaining({
          app_id: 'app1',
          period: '30days'
        })
      }));
      expect(result.text).toContain('1000');
      expect(result.text).toContain('500');
    });

    it('should throw error for unknown resource URI', async () => {
      mockAppCache.getAll = vi.fn().mockReturnValue([]);

      await expect(readResource(
        'countly://unknown/resource',
        mockHttpClient,
        mockAppCache,
        mockGetAuthParams
      )).rejects.toThrow('Invalid resource URI');
    });

    it('should throw error for non-existent app', async () => {
      mockAppCache.getAll = vi.fn().mockReturnValue([]);

      await expect(readResource(
        'countly://app/nonexistent/config',
        mockHttpClient,
        mockAppCache,
        mockGetAuthParams
      )).rejects.toThrow('App not found');
    });
  });
});