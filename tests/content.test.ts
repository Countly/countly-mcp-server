import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  handleListContentBlocks,
  handleGetContentBlock,
  handlePreviewContentBlock,
  handleCreateContentBlock,
  handleUpdateContentBlock,
  handleDeleteContentBlock,
} from '../src/tools/content.js';
import { ToolContext } from '../src/tools/types.js';

describe('Content Tools', () => {
  let mockContext: ToolContext;

  beforeEach(() => {
    mockContext = {
      httpClient: {
        post: vi.fn(),
        get: vi.fn(),
      } as any,
      appCache: vi.fn() as any,
      getAuthParams: vi.fn().mockReturnValue({}),
      resolveAppId: vi.fn().mockResolvedValue('app123'),
      getApps: vi.fn(),
    };
  });

  const sampleContentBlock = {
    _id: 'content1',
    app: 'app123',
    type: 'Banner',
    blocks: [{ layout: 'banner', elements: { title: { text: 'Welcome' } } }],
    details: {
      title: 'Welcome Banner',
      created: 1567474533960,
      updated: 1567474533960,
      creatorId: 'member1',
      favorite: false,
    },
  };

  describe('handleListContentBlocks', () => {
    it('should list content blocks for an app', async () => {
      mockContext.httpClient.get = vi.fn().mockResolvedValue({ data: [sampleContentBlock] });

      const result = await handleListContentBlocks(mockContext, { app_id: 'app123' });

      expect(mockContext.httpClient.get).toHaveBeenCalledWith(
        '/o/content',
        { params: { app_id: 'app123' } }
      );
      expect(result.content[0].text).toContain('Welcome Banner');
    });
  });

  describe('handleGetContentBlock', () => {
    it('should get a content block by id', async () => {
      mockContext.httpClient.get = vi.fn().mockResolvedValue({ data: sampleContentBlock });

      const result = await handleGetContentBlock(mockContext, {
        app_id: 'app123',
        content_id: 'content1',
      });

      expect(mockContext.httpClient.get).toHaveBeenCalledWith(
        '/o/content/by-id',
        { params: { app_id: 'app123', _id: 'content1' } }
      );
      expect(result.content[0].text).toContain('Welcome Banner');
    });
  });

  describe('handlePreviewContentBlock', () => {
    it('should return a preview URL after validating the block exists', async () => {
      mockContext.httpClient.get = vi.fn().mockResolvedValue({ data: sampleContentBlock });
      (mockContext.httpClient as any).defaults = { baseURL: 'https://countly.example.com/' };

      const result = await handlePreviewContentBlock(mockContext, {
        app_id: 'app123',
        content_id: 'content1',
      });

      expect(mockContext.httpClient.get).toHaveBeenCalledWith(
        '/o/content/by-id',
        { params: { app_id: 'app123', _id: 'content1' } }
      );
      expect(result.content[0].text).toContain(
        'https://countly.example.com/_external/content/?id=content1&app_id=app123'
      );
      expect(result.content[0].text).toContain('Welcome Banner');
    });

    it('should propagate errors when the block does not exist', async () => {
      mockContext.httpClient.get = vi.fn().mockRejectedValue(new Error('Content not found'));
      (mockContext.httpClient as any).defaults = { baseURL: 'https://countly.example.com' };

      await expect(handlePreviewContentBlock(mockContext, {
        app_id: 'app123',
        content_id: 'missing',
      })).rejects.toThrow();
    });
  });

  describe('handleCreateContentBlock', () => {
    it('should create a content block with JSON-encoded params', async () => {
      mockContext.httpClient.post = vi.fn().mockResolvedValue({
        data: { status: 'Success', contentId: 'content1' },
      });

      const blocks = [{ layout: 'banner', elements: { title: { text: 'Welcome' } } }];
      const result = await handleCreateContentBlock(mockContext, {
        app_id: 'app123',
        title: 'Welcome Banner',
        type: 'Banner',
        blocks: JSON.stringify(blocks),
      });

      expect(mockContext.httpClient.post).toHaveBeenCalledWith(
        '/i/content/save',
        null,
        {
          params: {
            app_id: 'app123',
            type: 'Banner',
            blocks: JSON.stringify(blocks),
            details: JSON.stringify({ title: 'Welcome Banner', favorite: false }),
          },
        }
      );
      expect(result.content[0].text).toContain('Success');
    });

    it('should mark the block as favorite when requested', async () => {
      mockContext.httpClient.post = vi.fn().mockResolvedValue({
        data: { status: 'Success', contentId: 'content1' },
      });

      await handleCreateContentBlock(mockContext, {
        app_id: 'app123',
        title: 'Welcome Banner',
        type: 'Banner',
        blocks: '[]',
        favorite: true,
      });

      const callArgs = (mockContext.httpClient.post as any).mock.calls[0][2];
      expect(JSON.parse(callArgs.params.details)).toEqual({
        title: 'Welcome Banner',
        favorite: true,
      });
    });

    it('should reject invalid blocks JSON', async () => {
      const result = await handleCreateContentBlock(mockContext, {
        app_id: 'app123',
        title: 'Bad Block',
        type: 'Banner',
        blocks: 'not-json',
      });

      expect(result.content[0].text).toContain('Invalid blocks JSON');
      expect(mockContext.httpClient.post).not.toHaveBeenCalled();
    });

    it('should reject non-array blocks JSON', async () => {
      const result = await handleCreateContentBlock(mockContext, {
        app_id: 'app123',
        title: 'Bad Block',
        type: 'Banner',
        blocks: '{"layout":"banner"}',
      });

      expect(result.content[0].text).toContain('blocks must be an array');
      expect(mockContext.httpClient.post).not.toHaveBeenCalled();
    });
  });

  describe('handleUpdateContentBlock', () => {
    it('should preserve existing fields when omitted', async () => {
      mockContext.httpClient.get = vi.fn().mockResolvedValue({ data: sampleContentBlock });
      mockContext.httpClient.post = vi.fn().mockResolvedValue({
        data: { status: 'Success', contentId: 'content1' },
      });

      await handleUpdateContentBlock(mockContext, {
        app_id: 'app123',
        content_id: 'content1',
      });

      expect(mockContext.httpClient.get).toHaveBeenCalledWith(
        '/o/content/by-id',
        { params: { app_id: 'app123', _id: 'content1' } }
      );
      const callArgs = (mockContext.httpClient.post as any).mock.calls[0][2];
      expect(callArgs.params.content_id).toBe('content1');
      expect(callArgs.params.type).toBe('Banner');
      expect(JSON.parse(callArgs.params.blocks)).toEqual(sampleContentBlock.blocks);
      expect(JSON.parse(callArgs.params.details)).toEqual({
        title: 'Welcome Banner',
        favorite: false,
        created: 1567474533960,
        creatorId: 'member1',
      });
    });

    it('should apply new title, type, blocks, and favorite when provided', async () => {
      mockContext.httpClient.get = vi.fn().mockResolvedValue({ data: sampleContentBlock });
      mockContext.httpClient.post = vi.fn().mockResolvedValue({
        data: { status: 'Success', contentId: 'content1' },
      });

      const newBlocks = [{ layout: 'modal', elements: { title: { text: 'Updated' } } }];
      await handleUpdateContentBlock(mockContext, {
        app_id: 'app123',
        content_id: 'content1',
        title: 'Updated Banner',
        type: 'Modal',
        blocks: JSON.stringify(newBlocks),
        favorite: true,
      });

      const callArgs = (mockContext.httpClient.post as any).mock.calls[0][2];
      expect(callArgs.params.type).toBe('Modal');
      expect(JSON.parse(callArgs.params.blocks)).toEqual(newBlocks);
      const details = JSON.parse(callArgs.params.details);
      expect(details.title).toBe('Updated Banner');
      expect(details.favorite).toBe(true);
    });

    it('should reject invalid blocks JSON', async () => {
      mockContext.httpClient.get = vi.fn().mockResolvedValue({ data: sampleContentBlock });

      const result = await handleUpdateContentBlock(mockContext, {
        app_id: 'app123',
        content_id: 'content1',
        blocks: 'not-json',
      });

      expect(result.content[0].text).toContain('Invalid blocks JSON');
      expect(mockContext.httpClient.post).not.toHaveBeenCalled();
    });
  });

  describe('handleDeleteContentBlock', () => {
    it('should delete a content block by id', async () => {
      mockContext.httpClient.post = vi.fn().mockResolvedValue({ data: 'Success' });

      const result = await handleDeleteContentBlock(mockContext, {
        app_id: 'app123',
        content_id: 'content1',
      });

      expect(mockContext.httpClient.post).toHaveBeenCalledWith(
        '/i/content/delete',
        null,
        { params: { app_id: 'app123', _id: 'content1' } }
      );
      expect(result.content[0].text).toContain('Success');
    });
  });
});
