import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  handleListContentBlocks,
  handleGetContentBlock,
  handlePreviewContentBlock,
  handleCreateContentBlock,
  handleUpdateContentBlock,
  handleDeleteContentBlock,
  handleListContentAssets,
  handleUploadContentAsset,
  handleUpdateContentAsset,
  handleDeleteContentAsset,
  handleListContentLanguages,
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

  describe('handleListContentAssets', () => {
    it('should list assets for an app', async () => {
      mockContext.httpClient.get = vi.fn().mockResolvedValue({ data: [{ _id: 'asset1', filename: 'hero.png' }] });

      const result = await handleListContentAssets(mockContext, { app_id: 'app123' });

      expect(mockContext.httpClient.get).toHaveBeenCalledWith(
        '/o/content/assets',
        { params: { app_id: 'app123' } }
      );
      expect(result.content[0].text).toContain('hero.png');
    });
  });

  describe('handleUploadContentAsset', () => {
    it('should upload a base64 file as multipart form data', async () => {
      mockContext.httpClient.post = vi.fn().mockResolvedValue({
        data: { status: 'Success', assetId: 'asset1' },
      });

      const fileBase64 = Buffer.from('fake-image-bytes').toString('base64');
      const result = await handleUploadContentAsset(mockContext, {
        app_id: 'app123',
        file_name: 'hero.png',
        file_base64: fileBase64,
        mime_type: 'image/png',
        tags: ['banner'],
      });

      const [url, body, options] = (mockContext.httpClient.post as any).mock.calls[0];
      expect(url).toBe('/i/content/asset-upload');
      expect(body).toBeInstanceOf(FormData);
      expect(options.params).toEqual({
        app_id: 'app123',
        name: 'hero.png',
        tags: JSON.stringify(['banner']),
      });
      expect(result.content[0].text).toContain('asset1');
    });

    it('should reject files over 5MB', async () => {
      const bigBase64 = Buffer.alloc(5 * 1024 * 1024 + 1).toString('base64');

      const result = await handleUploadContentAsset(mockContext, {
        app_id: 'app123',
        file_name: 'big.png',
        file_base64: bigBase64,
        mime_type: 'image/png',
      });

      expect(result.content[0].text).toContain('exceeds the 5MB limit');
      expect(mockContext.httpClient.post).not.toHaveBeenCalled();
    });

    it('should reject empty base64 data', async () => {
      const result = await handleUploadContentAsset(mockContext, {
        app_id: 'app123',
        file_name: 'empty.png',
        file_base64: '',
        mime_type: 'image/png',
      });

      expect(result.content[0].text).toContain('Invalid file_base64');
      expect(mockContext.httpClient.post).not.toHaveBeenCalled();
    });
  });

  describe('handleUpdateContentAsset', () => {
    it('should update asset name and tags', async () => {
      mockContext.httpClient.post = vi.fn().mockResolvedValue({ data: { status: 'Success' } });

      await handleUpdateContentAsset(mockContext, {
        app_id: 'app123',
        asset_id: 'asset1',
        name: 'renamed.png',
        tags: ['new-tag'],
      });

      expect(mockContext.httpClient.post).toHaveBeenCalledWith(
        '/i/content/asset-update',
        null,
        {
          params: {
            app_id: 'app123',
            asset_id: 'asset1',
            asset_name: 'renamed.png',
            asset_tags: JSON.stringify(['new-tag']),
          },
        }
      );
    });

    it('should require at least one field to update', async () => {
      const result = await handleUpdateContentAsset(mockContext, {
        app_id: 'app123',
        asset_id: 'asset1',
      });

      expect(result.content[0].text).toContain('at least one of name or tags');
      expect(mockContext.httpClient.post).not.toHaveBeenCalled();
    });
  });

  describe('handleDeleteContentAsset', () => {
    it('should delete an asset by id', async () => {
      mockContext.httpClient.post = vi.fn().mockResolvedValue({ data: { status: 'Success' } });

      await handleDeleteContentAsset(mockContext, {
        app_id: 'app123',
        asset_id: 'asset1',
      });

      expect(mockContext.httpClient.post).toHaveBeenCalledWith(
        '/i/content/asset-delete',
        null,
        { params: { app_id: 'app123', asset_id: 'asset1' } }
      );
    });
  });

  describe('handleListContentLanguages', () => {
    it('should list eligible languages, optionally scoped to a content block', async () => {
      mockContext.httpClient.get = vi.fn().mockResolvedValue({ data: ['en', 'es'] });

      await handleListContentLanguages(mockContext, {
        app_id: 'app123',
        content_id: 'content1',
      });

      expect(mockContext.httpClient.get).toHaveBeenCalledWith(
        '/o/content/langs',
        { params: { app_id: 'app123', content_id: 'content1' } }
      );
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
