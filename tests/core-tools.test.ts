import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CoreTools } from '../src/tools/core.js';
import type { ToolContext } from '../src/tools/types.js';

describe('Core Tools', () => {
  let mockContext: ToolContext;
  let coreTools: CoreTools;

  beforeEach(() => {
    mockContext = {
      httpClient: {
        get: vi.fn(),
        post: vi.fn(),
      },
      appCache: {
        get: vi.fn(),
        set: vi.fn(),
        getAll: vi.fn(),
        refresh: vi.fn(),
      },
    } as any;

    coreTools = new CoreTools(mockContext);
  });

  describe('ping', () => {
    it('should call /o/ping endpoint', async () => {
      const mockResponse = { data: { result: 'pong' } };
      vi.mocked(mockContext.httpClient.get).mockResolvedValue(mockResponse);

      const result = await coreTools.ping({});

      expect(mockContext.httpClient.get).toHaveBeenCalledWith('/o/ping');
      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe('text');
      expect(result.content[0].text).toContain('pong');
    });

    it('should handle ping errors', async () => {
      vi.mocked(mockContext.httpClient.get).mockRejectedValue(new Error('Network error'));

      await expect(coreTools.ping({})).rejects.toThrow();
    });
  });

  describe('get_version', () => {
    it('should call /o/system/version endpoint', async () => {
      const mockResponse = { data: { version: '23.11.0' } };
      vi.mocked(mockContext.httpClient.get).mockResolvedValue(mockResponse);

      const result = await coreTools.get_version({});

      expect(mockContext.httpClient.get).toHaveBeenCalledWith('/o/system/version');
      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe('text');
      expect(result.content[0].text).toContain('23.11.0');
    });

    it('should handle version errors', async () => {
      vi.mocked(mockContext.httpClient.get).mockRejectedValue(new Error('Unauthorized'));

      await expect(coreTools.get_version({})).rejects.toThrow();
    });
  });

  describe('get_plugins', () => {
    it('should call /o/system/plugins endpoint', async () => {
      const mockResponse = { 
        data: { 
          plugins: ['crashes', 'push', 'views', 'star-rating'] 
        } 
      };
      vi.mocked(mockContext.httpClient.get).mockResolvedValue(mockResponse);

      const result = await coreTools.get_plugins({});

      expect(mockContext.httpClient.get).toHaveBeenCalledWith('/o/system/plugins');
      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe('text');
      expect(result.content[0].text).toContain('crashes');
      expect(result.content[0].text).toContain('push');
    });

    it('should handle plugins errors', async () => {
      vi.mocked(mockContext.httpClient.get).mockRejectedValue(new Error('Forbidden'));

      await expect(coreTools.get_plugins({})).rejects.toThrow();
    });
  });

  describe('search', () => {
    it('should search apps by name', async () => {
      const mockApps = [
        { _id: 'app1', name: 'Test App', key: 'key1', created_at: 1234567890, timezone: 'UTC' },
        { _id: 'app2', name: 'Another App', key: 'key2', created_at: 1234567890, timezone: 'UTC' },
      ];
      vi.mocked(mockContext.appCache.getAll).mockReturnValue(mockApps as any);

      const result = await coreTools.search({ query: 'test' });

      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe('text');
      expect(result.content[0].text).toContain('Test App');
      expect(result.content[0].text).not.toContain('Another App');
    });

    it('should return empty results when no matches', async () => {
      vi.mocked(mockContext.appCache.getAll).mockReturnValue([]);

      const result = await coreTools.search({ query: 'nonexistent' });

      expect(result.content).toHaveLength(1);
      expect(result.content[0].text).toContain('[]');
    });
  });

  describe('fetch', () => {
    it('should fetch document by ID', async () => {
      const mockApps = [
        { _id: 'app1', name: 'Test App', key: 'key1', created_at: 1234567890, timezone: 'UTC' },
      ];
      vi.mocked(mockContext.appCache.getAll).mockReturnValue(mockApps as any);

      const result = await coreTools.fetch({ id: 'app1' });

      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe('text');
      expect(result.content[0].text).toContain('app1');
      expect(result.content[0].text).toContain('Test App');
    });

    it('should return not found message for invalid ID', async () => {
      vi.mocked(mockContext.appCache.getAll).mockReturnValue([]);

      const result = await coreTools.fetch({ id: 'invalid' });

      expect(result.content).toHaveLength(1);
      expect(result.content[0].text).toContain('not found');
    });
  });
});
