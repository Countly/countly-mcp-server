import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleCreateEvent } from '../src/tools/events.js';
import { ToolContext } from '../src/tools/types.js';

describe('Events Tools', () => {
  let mockContext: ToolContext;

  beforeEach(() => {
    mockContext = {
      httpClient: {
        post: vi.fn(),
        get: vi.fn(),
      } as any,
      appCache: vi.fn() as any,
      getAuthParams: vi.fn(),
      resolveAppId: vi.fn(),
      getApps: vi.fn(),
    };
  });

  describe('handleCreateEvent', () => {
    it('should create event with required parameters', async () => {
      mockContext.resolveAppId = vi.fn().mockResolvedValue('app123');
      mockContext.httpClient.get = vi.fn().mockResolvedValue({
        data: { result: 'success' }
      });

      const result = await handleCreateEvent(mockContext, {
        app_id: 'app123',
        key: 'test_event',
        name: 'Test Event'
      });

      expect(mockContext.resolveAppId).toHaveBeenCalledWith({ app_id: 'app123', key: 'test_event', name: 'Test Event' });
      expect(mockContext.httpClient.get).toHaveBeenCalledWith(
        '/i/data-manager/event',
        expect.objectContaining({
          params: expect.objectContaining({
            app_id: 'app123',
            event: expect.stringContaining('"key":"test_event"')
          })
        })
      );
      expect(result.content[0].text).toContain('Event definition created');
    });

    it('should create event with all parameters', async () => {
      mockContext.resolveAppId = vi.fn().mockResolvedValue('app123');
      mockContext.httpClient.get = vi.fn().mockResolvedValue({
        data: { result: 'success' }
      });

      const result = await handleCreateEvent(mockContext, {
        app_id: 'app123',
        key: 'purchase_event',
        name: 'Purchase Event',
        description: 'Event for purchases',
        category: 'ecommerce'
      });

      expect(mockContext.resolveAppId).toHaveBeenCalledWith({
        app_id: 'app123',
        key: 'purchase_event',
        name: 'Purchase Event',
        description: 'Event for purchases',
        category: 'ecommerce'
      });
      expect(mockContext.httpClient.get).toHaveBeenCalledWith(
        '/i/data-manager/event',
        expect.objectContaining({
          params: expect.objectContaining({
            app_id: 'app123',
            event: expect.stringContaining('"key":"purchase_event"')
          })
        })
      );
      expect(result.content[0].text).toContain('Event definition created');
    });

    it('should handle API errors', async () => {
      mockContext.resolveAppId = vi.fn().mockResolvedValue('app123');
      mockContext.httpClient.get = vi.fn().mockRejectedValue(new Error('API Error'));

      await expect(handleCreateEvent(mockContext, {
        app_id: 'app123',
        key: 'test_event',
        name: 'Test Event'
      })).rejects.toThrow('API Error');
    });
  });
});