import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  handleListKnowledgeBaseSpaces,
  handleSearchKnowledgeBase,
  handleAskKnowledgeBase,
  handleWriteKnowledgeBasePage,
} from '../src/tools/knowledge-base.js';
import { ToolContext } from '../src/tools/types.js';

describe('Knowledge Base Tools', () => {
  let mockContext: ToolContext;

  beforeEach(() => {
    mockContext = {
      httpClient: {
        post: vi.fn(),
        get: vi.fn(),
      } as any,
      appCache: vi.fn() as any,
      getAuthParams: vi.fn().mockReturnValue({ auth_token: 'token123' }),
      resolveAppId: vi.fn().mockResolvedValue('app123'),
      getApps: vi.fn(),
    };
  });

  describe('handleListKnowledgeBaseSpaces', () => {
    it('should list readable spaces', async () => {
      mockContext.httpClient.get = vi.fn().mockResolvedValue({
        data: [
          { _id: 'space1', name: 'Engineering', visibility: 'members' },
          { _id: 'space2', name: 'Public Docs', visibility: 'public' },
        ],
      });

      const result = await handleListKnowledgeBaseSpaces(mockContext, {});

      expect(mockContext.httpClient.get).toHaveBeenCalledWith(
        '/o/kb/spaces',
        { params: { auth_token: 'token123' } }
      );
      expect(result.content[0].text).toContain('Found 2 knowledge base space(s)');
      expect(result.content[0].text).toContain('Engineering');
    });
  });

  describe('handleSearchKnowledgeBase', () => {
    it('should search with query only', async () => {
      mockContext.httpClient.get = vi.fn().mockResolvedValue({
        data: {
          results: [
            {
              space_id: 'space1',
              page_id: 'page1',
              title: 'Billing',
              heading: 'Refunds',
              url: '/docs/space/page#refunds',
              snippet: 'Refunds are processed within 5 days.',
              score: 0.91,
            },
          ],
        },
      });

      const result = await handleSearchKnowledgeBase(mockContext, { query: 'refund policy' });

      expect(mockContext.httpClient.get).toHaveBeenCalledWith(
        '/o/kb/rag-search',
        { params: { auth_token: 'token123', query: 'refund policy' } }
      );
      expect(result.content[0].text).toContain('Found 1 knowledge base result(s)');
      expect(result.content[0].text).toContain('Refunds');
    });

    it('should pass limit and space_id when provided', async () => {
      mockContext.httpClient.get = vi.fn().mockResolvedValue({ data: { results: [] } });

      await handleSearchKnowledgeBase(mockContext, { query: 'q', limit: 5, space_id: 'space1' });

      expect(mockContext.httpClient.get).toHaveBeenCalledWith(
        '/o/kb/rag-search',
        { params: { auth_token: 'token123', query: 'q', limit: 5, space_id: 'space1' } }
      );
    });
  });

  describe('handleAskKnowledgeBase', () => {
    it('should ask a question and report answer mode', async () => {
      mockContext.httpClient.get = vi.fn().mockResolvedValue({
        data: {
          answer: 'Refunds take 5 days [1].',
          mode: 'llm',
          sources: [{ title: 'Billing', url: '/docs/space/page' }],
        },
      });

      const result = await handleAskKnowledgeBase(mockContext, { query: 'how long do refunds take?' });

      expect(mockContext.httpClient.get).toHaveBeenCalledWith(
        '/o/kb/ask',
        { params: { auth_token: 'token123', query: 'how long do refunds take?' } }
      );
      expect(result.content[0].text).toContain('llm mode');
      expect(result.content[0].text).toContain('Refunds take 5 days');
    });

    it('should pass limit and space_id when provided', async () => {
      mockContext.httpClient.get = vi.fn().mockResolvedValue({
        data: { answer: '', mode: 'extractive', sources: [] },
      });

      await handleAskKnowledgeBase(mockContext, { query: 'q', limit: 3, space_id: 'space2' });

      expect(mockContext.httpClient.get).toHaveBeenCalledWith(
        '/o/kb/ask',
        { params: { auth_token: 'token123', query: 'q', limit: 3, space_id: 'space2' } }
      );
    });
  });

  describe('handleWriteKnowledgeBasePage', () => {
    it('should create a page from markdown', async () => {
      mockContext.httpClient.post = vi.fn().mockResolvedValue({
        data: { result: 'Success', _id: 'page1', path: '/docs/space/feature-x', created: true },
      });

      const result = await handleWriteKnowledgeBasePage(mockContext, {
        space_id: 'space1',
        title: 'Feature X decisions',
        markdown: '# Feature X\n\n- decision one',
        external_ref: 'feature-x',
      });

      expect(mockContext.httpClient.post).toHaveBeenCalledWith(
        '/i/kb/page-write',
        null,
        {
          params: {
            auth_token: 'token123',
            space_id: 'space1',
            markdown: '# Feature X\n\n- decision one',
            title: 'Feature X decisions',
            external_ref: 'feature-x',
          },
        }
      );
      expect(result.content[0].text).toContain('Knowledge base page created');
    });

    it('should report an update when the same external_ref matched an existing page', async () => {
      mockContext.httpClient.post = vi.fn().mockResolvedValue({
        data: { result: 'Success', _id: 'page1', path: '/docs/space/feature-x', created: false },
      });

      const result = await handleWriteKnowledgeBasePage(mockContext, {
        space_id: 'space1',
        markdown: 'updated body',
        external_ref: 'feature-x',
      });

      expect(result.content[0].text).toContain('Knowledge base page updated');
    });

    it('should pass parent_id when provided', async () => {
      mockContext.httpClient.post = vi.fn().mockResolvedValue({
        data: { result: 'Success', _id: 'page2', path: '/p', created: true },
      });

      await handleWriteKnowledgeBasePage(mockContext, {
        space_id: 'space1',
        title: 'Child',
        markdown: 'body',
        parent_id: 'parent1',
      });

      const call = (mockContext.httpClient.post as any).mock.calls[0];
      expect(call[2].params.parent_id).toBe('parent1');
    });
  });
});
