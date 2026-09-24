import axios from 'axios';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { McpError } from '@modelcontextprotocol/sdk/types.js';
import { handleQueryData } from '../src/tools/analytics.js';
import { serializeListParam } from '../src/lib/validation.js';
import { ToolContext } from '../src/tools/types.js';

/**
 * Regression tests for query_data drill queries: projection_key used to be
 * forwarded as a raw array (axios encodes it as `projectionKey[]=did`, which
 * Countly ignores), and there was no way to raise Countly's 10-row limit.
 */

function makeContext(): ToolContext {
  return {
    httpClient: {
      get: vi.fn().mockResolvedValue({ data: { result: 'success' } }),
      post: vi.fn(),
    } as any,
    appCache: vi.fn() as any,
    getAuthParams: vi.fn().mockReturnValue({ api_key: 'test' }),
    resolveAppId: vi.fn().mockResolvedValue('app123'),
    getApps: vi.fn(),
  };
}

// The drill availability probe is the first GET; the query itself is the last.
function queryParams(context: ToolContext): Record<string, any> {
  const calls = (context.httpClient.get as any).mock.calls;
  return calls[calls.length - 1][1].params;
}

describe('serializeListParam', () => {
  it.each([
    [['did'], '["did"]'],
    [['did', 'ts'], '["did","ts"]'],
    ['["did"]', '["did"]'],
    ['  ["did", "ts"] ', '["did","ts"]'],
    ['did', '["did"]'],
    [[1, true], '["1","true"]'],
  ])('encodes %j as %s', (input, expected) => {
    expect(serializeListParam(input, 'p')).toBe(expected);
  });

  it.each([[[]], [''], ['   '], [undefined], [null], ['[]']])('omits %j', (input) => {
    expect(serializeListParam(input, 'p')).toBeUndefined();
  });

  it.each([['[did'], ['[{"a":1}]'], [[{ a: 1 }]], [[null]], [42], [{ did: 1 }]])('rejects %j', (input) => {
    expect(() => serializeListParam(input, 'p')).toThrow(McpError);
  });

  it('produces a single query-string field under axios', () => {
    const uri = axios.getUri({ url: 'http://x/o', params: { projectionKey: serializeListParam(['did'], 'p') } });
    expect(uri).toBe('http://x/o?projectionKey=%5B%22did%22%5D');
  });
});

describe('handleQueryData drill', () => {
  let context: ToolContext;

  beforeEach(() => {
    context = makeContext();
  });

  it('sends projectionKey as a JSON-encoded string, not an array', async () => {
    await handleQueryData(context, { query_type: 'drill', event: 'Purchase', projection_key: ['did'] });
    expect(queryParams(context).projectionKey).toBe('["did"]');
  });

  it('omits projectionKey and limit when not supplied', async () => {
    await handleQueryData(context, { query_type: 'drill', event: 'Purchase' });
    const params = queryParams(context);
    expect(params).not.toHaveProperty('projectionKey');
    expect(params).not.toHaveProperty('limit');
  });

  it('forwards limit, accepting numeric strings', async () => {
    await handleQueryData(context, { query_type: 'drill', event: 'Purchase', limit: '500' });
    expect(queryParams(context).limit).toBe(500);
  });

  it.each([[0], [10001], [2.5], ['abc']])('rejects limit %j', async (limit) => {
    await expect(handleQueryData(context, { query_type: 'drill', event: 'Purchase', limit })).rejects.toThrow(McpError);
  });

  it('does not send limit for non-drill queries', async () => {
    await handleQueryData(context, { query_type: 'analytics', method: 'sessions', limit: 500 });
    expect(queryParams(context)).not.toHaveProperty('limit');
  });

  it('warns past three projection keys but still runs the query', async () => {
    const result = await handleQueryData(context, {
      query_type: 'drill',
      event: 'Purchase',
      projection_key: ['a', 'b', 'c', 'd'],
    });
    expect(result.content[0].text).toMatch(/^\*\*Warning:\*\* this query used 4 projection keys/);
    expect(queryParams(context).projectionKey).toBe('["a","b","c","d"]');
  });

  it('does not warn at three projection keys', async () => {
    const result = await handleQueryData(context, {
      query_type: 'drill',
      event: 'Purchase',
      projection_key: ['a', 'b', 'c'],
    });
    expect(result.content[0].text).toMatch(/^Drill query results:/);
  });
});
