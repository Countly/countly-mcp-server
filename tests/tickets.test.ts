import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  handleTicketsRagSearch,
  handleTicketsList,
  handleTicketsGet,
  handleTicketsStats,
} from '../src/tools/tickets.js';
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

  const sampleTicket = {
    _id: 'tick1',
    app_id: 'app123',
    number: 42,
    subject: 'CSV export timeout',
    status: 'open',
    status_category: 'open',
    priority: 3,
    assignee_id: 'member1',
    team_id: null,
    tags: ['export'],
    channel: 'widget',
    requester: { name: 'Rita Zebra (BMW)', email: 'rita@bmw.test', uid: 'u1', did: 'd1' },
    sla: { policy_id: null },
    csat: { score: null },
    created_at: 1784800000000,
    updated_at: 1784860000000,
  };

  describe('handleTicketsList', () => {
    it('maps filters, resolves assignee names, and formats results', async () => {
      mockContext.httpClient.get = vi.fn().mockImplementation((url: string) => {
        if (url === '/v2/tickets') {
          return Promise.resolve({ data: { data: { items: [sampleTicket], total: 1, page: 1 } } });
        }
        if (url === '/v2/members') {
          return Promise.resolve({ data: { data: [{ _id: 'member1', full_name: 'Arturs Sosins' }] } });
        }
        return Promise.reject(new Error('unexpected url ' + url));
      });

      const result = await handleTicketsList(mockContext, {
        requester_name: 'BMW',
        sort: 'created_at',
        direction: 'desc',
        limit: 1,
      });

      const listCall = (mockContext.httpClient.get as any).mock.calls.find((c: any[]) => c[0] === '/v2/tickets');
      expect(listCall[1].params).toMatchObject({
        api_key: 'testkey',
        requester_name: 'BMW',
        sort: 'created_at',
        direction: 'desc',
        pageSize: 1,
        page: 1,
      });
      expect(result.content[0].text).toContain('#42');
      expect(result.content[0].text).toContain('assignee: Arturs Sosins');
      expect(result.content[0].text).toContain('priority: high');
    });

    it('re-applies requester_name client-side for servers without the filter', async () => {
      const other = { ...sampleTicket, _id: 'tick2', number: 43, requester: { name: 'Someone Else' }, assignee_id: null };
      mockContext.httpClient.get = vi.fn().mockResolvedValue({ data: { data: { items: [sampleTicket, other], total: 2, page: 1 } } });

      const result = await handleTicketsList(mockContext, { requester_name: 'bmw', unassigned: false });

      expect(result.content[0].text).toContain('#42');
      expect(result.content[0].text).not.toContain('#43');
    });

    it('serializes the segments object filter', async () => {
      mockContext.httpClient.get = vi.fn().mockResolvedValue({ data: { data: { items: [], total: 0 } } });

      const result = await handleTicketsList(mockContext, { segments: { 'custom.organization': 'BMW' } });

      expect((mockContext.httpClient.get as any).mock.calls[0][1].params.segments).toBe('{"custom.organization":"BMW"}');
      expect(result.content[0].text).toContain('No tickets matched');
    });
  });

  describe('handleTicketsGet', () => {
    it('finds a ticket by number and appends the conversation when asked', async () => {
      mockContext.httpClient.get = vi.fn().mockImplementation((url: string) => {
        if (url === '/v2/tickets') {
          return Promise.resolve({ data: { data: { items: [sampleTicket], total: 1 } } });
        }
        if (url === '/v2/tickets/tick1') {
          return Promise.resolve({ data: { data: sampleTicket } });
        }
        if (url === '/v2/tickets/tick1/messages') {
          return Promise.resolve({ data: { data: { items: [
            { kind: 'reply', author: { type: 'requester', name: 'Rita Zebra (BMW)' }, content: '<p>Export fails.</p>' },
            { kind: 'note', author: { type: 'member', name: 'Arturs Sosins' }, content: '<p>Timeout in nginx.</p>' },
          ] } } });
        }
        if (url === '/v2/members') {
          return Promise.resolve({ data: { data: [{ _id: 'member1', full_name: 'Arturs Sosins' }] } });
        }
        return Promise.reject(new Error('unexpected url ' + url));
      });

      const result = await handleTicketsGet(mockContext, { number: 42, include_conversation: true });

      expect(result.content[0].text).toContain('assignee: Arturs Sosins');
      expect(result.content[0].text).toContain('Rita Zebra (BMW): Export fails.');
      expect(result.content[0].text).toContain('Arturs Sosins (internal note): Timeout in nginx.');
    });

    it('reports a missing number cleanly', async () => {
      mockContext.httpClient.get = vi.fn().mockResolvedValue({ data: { data: { items: [], total: 0 } } });

      const result = await handleTicketsGet(mockContext, { number: 9999 });

      expect(result.content[0].text).toContain('not found');
    });
  });

  describe('handleTicketsStats', () => {
    it('passes period_days through and returns the metrics blob', async () => {
      mockContext.httpClient.get = vi.fn().mockResolvedValue({ data: { data: { period_days: 7, created_total: 6, backlog: { total: 5 } } } });

      const result = await handleTicketsStats(mockContext, { period_days: 7 });

      expect((mockContext.httpClient.get as any).mock.calls[0][1].params.period).toBe(7);
      expect(result.content[0].text).toContain('last 7 days');
      expect(result.content[0].text).toContain('created_total');
    });
  });

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
