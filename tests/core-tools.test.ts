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

});
