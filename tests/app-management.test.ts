import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleListApps, handleGetAppByName } from '../src/tools/app-management.js';
import { ToolContext } from '../src/tools/types.js';

describe('App Management Tools', () => {
  let mockContext: ToolContext;

  beforeEach(() => {
    mockContext = {
      httpClient: vi.fn() as any,
      appCache: vi.fn() as any,
      getAuthParams: vi.fn(),
      resolveAppId: vi.fn(),
      getApps: vi.fn(),
    };
  });

  describe('handleListApps', () => {
    it('should return formatted list of apps', async () => {
      const mockApps = [
        { _id: 'app1', name: 'TestApp1' },
        { _id: 'app2', name: 'TestApp2' },
      ];

      mockContext.getApps = vi.fn().mockResolvedValue(mockApps);

      const result = await handleListApps(mockContext, {});

      expect(mockContext.getApps).toHaveBeenCalled();
      expect(result.content[0].type).toBe('text');
      expect(result.content[0].text).toContain('Available applications:');
      expect(result.content[0].text).toContain('TestApp1 (ID: app1)');
      expect(result.content[0].text).toContain('TestApp2 (ID: app2)');
    });

    it('should handle empty apps list', async () => {
      mockContext.getApps = vi.fn().mockResolvedValue([]);

      const result = await handleListApps(mockContext, {});

      expect(result.content[0].text).toBe('Available applications:\n');
    });
  });

  describe('handleGetAppByName', () => {
    it('should return app information for valid name', async () => {
      const mockApps = [
        { _id: 'app1', name: 'TestApp', key: 'key1' },
        { _id: 'app2', name: 'OtherApp', key: 'key2' },
      ];
      mockContext.getApps = vi.fn().mockResolvedValue(mockApps);

      const result = await handleGetAppByName(mockContext, { app_name: 'TestApp' });

      expect(mockContext.getApps).toHaveBeenCalled();
      expect(result.content[0].type).toBe('text');
      expect(result.content[0].text).toContain('App information:');
      expect(result.content[0].text).toContain('"name": "TestApp"');
    });

    it('should throw error for non-existent app', async () => {
      const mockApps = [{ _id: 'app1', name: 'TestApp' }];
      mockContext.getApps = vi.fn().mockResolvedValue(mockApps);

      await expect(handleGetAppByName(mockContext, { app_name: 'NonExistent' })).rejects.toThrow(
        'App with name "NonExistent" not found'
      );
    });

    it('should be case insensitive', async () => {
      const mockApps = [{ _id: 'app1', name: 'TestApp', key: 'key1' }];
      mockContext.getApps = vi.fn().mockResolvedValue(mockApps);

      const result = await handleGetAppByName(mockContext, { app_name: 'testapp' });

      expect(result.content[0].text).toContain('"name": "TestApp"');
    });
  });
});