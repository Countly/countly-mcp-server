import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleTicketsRagSearch } from '../src/tools/tickets.js';
import { ToolContext } from '../src/tools/types.js';

describe('Tickets Tools', () => {
  let mockContext: ToolContext;

  beforeEach(() => {
    mockContext = {
      httpClient: {
        post: vi.fn(),
        get: vi.fn(),
      } as any,
      appCache: vi.fn() as any,
      getAuthParams: vi.fn().mockReturnValue({ api_key: 'testkey' }),
      resolveAppId: vi.fn().mockResolvedValue('app123'),
      getApps: vi.fn(),
    };
  });

  const sampleHit = {
    app_id: 'app123',
    ticket_id: 'tick1',
    number: 42,
    title: 'CSV export timeout',
    snippet: 'Ticket #42: CSV export timeout\nCustomer: my export fails with a timeout.',
    url: '/support/42',
    score: 0.5222,
  };

  describe('handleTicketsRagSearch', () => {
    it('searches across all readable apps when no app is given', async () => {
      mockContext.httpClient.get = vi.fn().mockResolvedValue({ data: { data: [sampleHit] } });

      const result = await handleTicketsRagSearch(mockContext, { q: 'export timeout' });

      expect(mockContext.httpClient.get).toHaveBeenCalledWith(
        '/v2/tickets/rag/search',
        { params: { api_key: 'testkey', q: 'export timeout' } }
      );
      // No app scoping requested — resolveAppId must not be consulted.
      expect(mockContext.resolveAppId).not.toHaveBeenCalled();
      expect(result.content[0].text).toContain('#42');
      expect(result.content[0].text).toContain('CSV export timeout');
      expect(result.content[0].text).toContain('0.522');
    });

    it('scopes to one app and forwards limit when provided', async () => {
      mockContext.httpClient.get = vi.fn().mockResolvedValue({ data: { data: [sampleHit] } });

      await handleTicketsRagSearch(mockContext, { q: 'export timeout', app_name: 'Test', limit: 3 });

      expect(mockContext.resolveAppId).toHaveBeenCalled();
      expect(mockContext.httpClient.get).toHaveBeenCalledWith(
        '/v2/tickets/rag/search',
        { params: { api_key: 'testkey', q: 'export timeout', app_id: 'app123', limit: 3 } }
      );
    });

    it('reports an empty result set without failing', async () => {
      mockContext.httpClient.get = vi.fn().mockResolvedValue({ data: { data: [] } });

      const result = await handleTicketsRagSearch(mockContext, { q: 'nothing like this' });

      expect(result.content[0].text).toContain('No ticket conversations matched');
    });

    it('propagates API errors (e.g. feature disabled returns 404)', async () => {
      mockContext.httpClient.get = vi.fn().mockRejectedValue(new Error('Request failed with status code 404'));

      await expect(handleTicketsRagSearch(mockContext, { q: 'anything' })).rejects.toThrow();
    });
  });
});
