import { describe, it, expect, vi, beforeEach } from 'vitest';
import { McpError } from '@modelcontextprotocol/sdk/types.js';
import axios from 'axios';
import { handleQueryData } from '../src/tools/analytics.js';
import { handleListDrillUsers } from '../src/tools/drill.js';
import {
  handleListDatabases,
  handleQueryDatabase,
  handleAggregateCollection,
} from '../src/tools/database.js';
import { serializeListParam, serializeQueryParam } from '../src/lib/validation.js';
import { ToolContext } from '../src/tools/types.js';

/**
 * Regression tests for the two drill gaps reported against app
 * 6a9c3c6d8fcc943fdeaa1adb:
 *
 *  1. query_data(query_type="drill") forwarded `projection_key` to axios as a
 *     raw JS array, which serializes as `projectionKey[]=did`. Countly reads
 *     `qstring.projectionKey`, never saw the parameter, and answered with bare
 *     totals and an empty `meta` — indistinguishable from "no such segment".
 *
 *  2. Raw drill event documents are not reachable through the dbviewer tools on
 *     Countly 26.01+, where they live in ClickHouse rather than MongoDB. The
 *     tools returned an empty result with no explanation of where to look.
 */

function makeContext(responseData: any = { result: 'success' }): ToolContext {
  return {
    httpClient: {
      get: vi.fn().mockResolvedValue({ data: responseData }),
      post: vi.fn(),
    } as any,
    appCache: vi.fn() as any,
    getAuthParams: vi.fn().mockReturnValue({ api_key: 'test' }),
    resolveAppId: vi.fn().mockResolvedValue('6a9c3c6d8fcc943fdeaa1adb'),
    getApps: vi.fn(),
  };
}

/** The params object handed to the Nth (default: last) httpClient.get call. */
function paramsOfCall(context: ToolContext, index = -1): any {
  const calls = (context.httpClient.get as any).mock.calls;
  const call = index < 0 ? calls[calls.length + index] : calls[index];
  return call[1].params;
}

describe('serializeListParam', () => {
  it('encodes an array as a single JSON query-string value', () => {
    expect(serializeListParam(['did'], 'projection_key')).toBe('["did"]');
    expect(serializeListParam(['sg.via', 'sg.match_id'], 'projection_key')).toBe(
      '["sg.via","sg.match_id"]'
    );
  });

  it('passes an already JSON-encoded array through, normalized', () => {
    expect(serializeListParam('["did"]', 'projection_key')).toBe('["did"]');
    expect(serializeListParam('[ "did" , "up.country" ]', 'projection_key')).toBe(
      '["did","up.country"]'
    );
  });

  it('treats a bare key as a one-item list', () => {
    expect(serializeListParam('did', 'projection_key')).toBe('["did"]');
  });

  it('omits the parameter for nullish and empty input', () => {
    expect(serializeListParam(undefined, 'projection_key')).toBeUndefined();
    expect(serializeListParam(null, 'projection_key')).toBeUndefined();
    expect(serializeListParam([], 'projection_key')).toBeUndefined();
    expect(serializeListParam('', 'projection_key')).toBeUndefined();
    expect(serializeListParam('   ', 'projection_key')).toBeUndefined();
  });

  it('coerces numeric entries rather than emitting them unquoted', () => {
    expect(serializeListParam([1, 2], 'projection_key')).toBe('["1","2"]');
  });

  it('rejects input it cannot encode', () => {
    expect(() => serializeListParam('[unclosed', 'projection_key')).toThrow(McpError);
    expect(() => serializeListParam('{"not":"a list"}', 'projection_key')).not.toThrow();
    expect(() => serializeListParam('["a", {"b":1}]', 'projection_key')).toThrow(McpError);
    expect(() => serializeListParam([{ a: 1 }], 'projection_key')).toThrow(McpError);
    expect(() => serializeListParam(42, 'projection_key')).toThrow(McpError);
  });
});

describe('serializeQueryParam', () => {
  it('leaves strings untouched so existing callers are unaffected', () => {
    expect(serializeQueryParam('{"sg.via":"lobby"}', 'query_object')).toBe(
      '{"sg.via":"lobby"}'
    );
  });

  it('encodes an object that would otherwise be flattened by axios', () => {
    expect(serializeQueryParam({ 'sg.via': 'lobby' }, 'query_object')).toBe(
      '{"sg.via":"lobby"}'
    );
  });

  it('falls back to the default for absent or empty input', () => {
    expect(serializeQueryParam(undefined, 'query_object')).toBe('{}');
    expect(serializeQueryParam('', 'query_object')).toBe('{}');
    expect(serializeQueryParam(null, 'query_object')).toBe('{}');
  });
});

describe('axios serialization contract', () => {
  it('flattens a raw array into repeated keys Countly cannot read', () => {
    // This is the exact behavior that caused the bug. Guards against anyone
    // "simplifying" the handler back to passing the array straight through.
    expect(axios.getUri({ url: '/o', params: { projectionKey: ['did'] } })).toBe(
      '/o?projectionKey%5B%5D=did'
    );
    expect(
      axios.getUri({ url: '/o', params: { projectionKey: '["did"]' } })
    ).toBe('/o?projectionKey=%5B%22did%22%5D');
  });
});

describe('query_data drill: projection_key reaches Countly', () => {
  let context: ToolContext;

  beforeEach(() => {
    context = makeContext({ u: 7, t: 14, meta: {} });
  });

  it('sends an array projection_key as a JSON-encoded string', async () => {
    await handleQueryData(context, {
      app_id: '6a9c3c6d8fcc943fdeaa1adb',
      query_type: 'drill',
      event: 'pvp_match_started',
      period: '60days',
      query_object: '{}',
      bucket: 'monthly',
      projection_key: ['did'],
    });

    // First get() is the drill-availability probe; the query itself is last.
    expect(paramsOfCall(context).projectionKey).toBe('["did"]');
  });

  it('sends a multi-key breakdown as one JSON array', async () => {
    await handleQueryData(context, {
      query_type: 'drill',
      event: 'pvp_match_started',
      projection_key: ['sg.opponent_is_bot', 'sg.via', 'sg.match_id'],
    });

    expect(paramsOfCall(context).projectionKey).toBe(
      '["sg.opponent_is_bot","sg.via","sg.match_id"]'
    );
  });

  it('omits projectionKey entirely when not requested', async () => {
    await handleQueryData(context, {
      query_type: 'drill',
      event: 'pvp_match_started',
    });

    expect(paramsOfCall(context)).not.toHaveProperty('projectionKey');
  });

  it('omits projectionKey for an empty array, matching the previous no-breakdown behavior', async () => {
    await handleQueryData(context, {
      query_type: 'drill',
      event: 'pvp_match_started',
      projection_key: [],
    });

    expect(paramsOfCall(context)).not.toHaveProperty('projectionKey');
  });

  it('leaves the other drill parameters exactly as before', async () => {
    await handleQueryData(context, {
      query_type: 'drill',
      event: 'pvp_match_started',
      period: '60days',
      query_object: '{"sg.via":"lobby"}',
      bucket: 'monthly',
      projection_key: ['did'],
    });

    const params = paramsOfCall(context);
    expect(params.method).toBe('segmentation');
    expect(params.queryObject).toBe('{"sg.via":"lobby"}');
    expect(params.bucket).toBe('monthly');
    expect(params.event).toBe('pvp_match_started');
    expect(params.period).toBe('60days');
    expect(params.app_id).toBe('6a9c3c6d8fcc943fdeaa1adb');
  });

  it('still defaults queryObject to {} and bucket to daily', async () => {
    await handleQueryData(context, { query_type: 'drill', event: 'e' });

    const params = paramsOfCall(context);
    expect(params.queryObject).toBe('{}');
    expect(params.bucket).toBe('daily');
  });
});

describe('query_data drill: output shape is backward compatible', () => {
  it('keeps the raw payload as the first content block', async () => {
    const payload = { u: 7, t: 14, meta: { did: { a: 1 } } };
    const context = makeContext(payload);

    const result = await handleQueryData(context, {
      query_type: 'drill',
      event: 'pvp_match_started',
      projection_key: ['did'],
    });

    expect(result.content[0].type).toBe('text');
    expect(result.content[0].text).toBe(
      `Drill query results:\n${JSON.stringify(payload, null, 2)}`
    );
  });

  it('adds no extra block when the breakdown came back populated', async () => {
    const context = makeContext({ u: 7, t: 14, meta: { did: { a: 1 } } });

    const result = await handleQueryData(context, {
      query_type: 'drill',
      event: 'pvp_match_started',
      projection_key: ['did'],
    });

    expect(result.content).toHaveLength(1);
  });

  it('explains an empty breakdown in a second block, leaving the first intact', async () => {
    const payload = { u: 7, t: 14, meta: {} };
    const context = makeContext(payload);

    const result = await handleQueryData(context, {
      query_type: 'drill',
      event: 'pvp_match_started',
      projection_key: ['did'],
    });

    expect(result.content).toHaveLength(2);
    expect(result.content[0].text).toBe(
      `Drill query results:\n${JSON.stringify(payload, null, 2)}`
    );
    expect(result.content[1].text).toContain('queriable_fields_list');
    expect(result.content[1].text).toContain('drill_users_list');
  });

  it('adds no hint when no breakdown was requested', async () => {
    const context = makeContext({ u: 7, t: 14, meta: {} });

    const result = await handleQueryData(context, {
      query_type: 'drill',
      event: 'pvp_match_started',
    });

    expect(result.content).toHaveLength(1);
  });

  it('adds no hint for non-drill query types', async () => {
    const context = makeContext({ meta: {} });

    const result = await handleQueryData(context, {
      query_type: 'events',
      event: 'pvp_match_started',
    });

    expect(result.content).toHaveLength(1);
  });
});

describe('drill_users_list', () => {
  it('queries segmentation_users with an encoded queryObject', async () => {
    const context = makeContext(['uid1', 'uid2']);

    await handleListDrillUsers(context, {
      app_id: '6a9c3c6d8fcc943fdeaa1adb',
      event: 'pvp_match_started',
      query_object: '{"sg.via":"lobby"}',
      period: '60days',
    });

    const params = paramsOfCall(context);
    expect(params.method).toBe('segmentation_users');
    expect(params.event).toBe('pvp_match_started');
    expect(params.queryObject).toBe('{"sg.via":"lobby"}');
    expect(params.period).toBe('60days');
  });

  it('defaults the event to [CLY]_session and the query to {}', async () => {
    const context = makeContext([]);

    await handleListDrillUsers(context, {});

    const params = paramsOfCall(context);
    expect(params.event).toBe('[CLY]_session');
    expect(params.queryObject).toBe('{}');
    expect(params).not.toHaveProperty('period');
  });

  it('reports the matching uids', async () => {
    const context = makeContext(['uid1', 'uid2', 'uid3']);

    const result = await handleListDrillUsers(context, { event: 'e' });

    expect(result.content[0].text).toContain('Matching users (3)');
    expect(result.content[0].text).toContain('uid2');
  });

  it('falls back to the raw payload for an unrecognized shape', async () => {
    const context = makeContext({ unexpected: true });

    const result = await handleListDrillUsers(context, { event: 'e' });

    expect(result.content[0].text).toContain('"unexpected": true');
  });
});

describe('dbviewer tools explain where drill events actually live', () => {
  it('notes the absence of drill_events when listing databases', async () => {
    const context = makeContext([
      {
        name: 'countly_drill',
        collections: ['drill_cache', 'drill_bookmarks', 'drill_meta'],
      },
    ]);

    const result = await handleListDatabases(context, {});

    expect(result.content).toHaveLength(2);
    expect(result.content[1].text).toContain('ClickHouse');
    expect(result.content[1].text).toContain('drill_users_list');
  });

  it('stays silent when drill_events collections are present', async () => {
    const context = makeContext([
      { name: 'countly_drill', collections: ['drill_events12ab', 'drill_meta'] },
    ]);

    const result = await handleListDatabases(context, {});

    expect(result.content).toHaveLength(1);
  });

  it('stays silent when countly_drill is not in the listing at all', async () => {
    const context = makeContext([{ name: 'countly', collections: ['apps'] }]);

    const result = await handleListDatabases(context, {});

    expect(result.content).toHaveLength(1);
  });

  it('explains an empty drill_events find', async () => {
    const context = makeContext({ iTotalRecords: 0, aaData: [] });

    const result = await handleQueryDatabase(context, {
      database: 'countly_drill',
      collection: 'drill_events',
    });

    expect(result.content).toHaveLength(2);
    expect(result.content[1].text).toContain('ClickHouse');
  });

  it('explains an empty drill_events aggregation', async () => {
    const context = makeContext({ aaData: [] });

    const result = await handleAggregateCollection(context, {
      database: 'countly_drill',
      collection: 'drill_events',
      aggregation: '[]',
    });

    expect(result.content).toHaveLength(2);
    expect(result.content[1].text).toContain('ClickHouse');
  });

  it('stays silent for an empty result on an unrelated collection', async () => {
    const context = makeContext({ aaData: [] });

    const result = await handleQueryDatabase(context, {
      database: 'countly',
      collection: 'apps',
    });

    expect(result.content).toHaveLength(1);
  });

  it('stays silent when the drill_events query did return documents', async () => {
    const context = makeContext({ aaData: [{ _id: 'x' }] });

    const result = await handleQueryDatabase(context, {
      database: 'countly_drill',
      collection: 'drill_events12ab',
    });

    expect(result.content).toHaveLength(1);
  });

  it('keeps the raw payload as the first block in every case', async () => {
    const payload = { iTotalRecords: 0, aaData: [] };
    const context = makeContext(payload);

    const result = await handleQueryDatabase(context, {
      database: 'countly_drill',
      collection: 'drill_events',
    });

    expect(result.content[0].text).toBe(
      `Query results from countly_drill.drill_events:\n${JSON.stringify(payload, null, 2)}`
    );
  });
});

/**
 * Both cases below were found by running the tools against a live Countly
 * 26.x server (trina flex instance, app 6a9c3c6d8fcc943fdeaa1adb). The unit
 * tests above passed while these two were broken, so the payload shapes here
 * are copied from real responses rather than invented.
 */
describe('breakdown detection matches real server payloads', () => {
  // Real shape: `meta` comes back as an EMPTY ARRAY even on a successful
  // breakdown; the per-value data lives in `segments` and inline in
  // `data.<bucket>.<period>.<value>.keys`. Checking only `meta` flagged a
  // perfectly good breakdown as missing.
  const realDidBreakdown = {
    data: {
      monthly: {
        '2026.m9': {
          'cb8b6a6e-e4dd-4662-a982-ddd21dbe7608': {
            u: 1, t: 1, s: 0, dur: 0,
            keys: { did: 'cb8b6a6e-e4dd-4662-a982-ddd21dbe7608' },
          },
          'cefaf8b5-55c4-48cb-b20e-ac307b96a61c': {
            u: 1, t: 4, s: 0, dur: 0,
            keys: { did: 'cefaf8b5-55c4-48cb-b20e-ac307b96a61c' },
          },
        },
      },
    },
    meta: [],
    totals: { u: 7, t: 14, s: 0, dur: 0 },
    buckets: ['monthly'],
  };

  const realSegmentBreakdown = {
    data: { monthly: { '2026.m9': { steam: { u: 7, t: 14, keys: { 'sg.via': 'steam' } } } } },
    meta: [],
    segments: { steam: { u: 7, t: 14, keys: { 'sg.via': 'steam' }, segment: 'steam' } },
    totals: { u: 7, t: 14 },
  };

  // Real shape of a genuinely empty result: no segments, and the period entry
  // holds plain totals with no `keys`.
  const realNoBreakdown = {
    data: { monthly: { '2026.m9': { u: 7, t: 14, s: 0, dur: 0 } } },
    meta: {},
    snapshots: {},
    totals: { u: 7, t: 14, s: 0, dur: 0 },
    buckets: ['monthly'],
  };

  it('does not warn when the breakdown arrived inline under data', async () => {
    const context = makeContext(realDidBreakdown);

    const result = await handleQueryData(context, {
      query_type: 'drill', event: 'pvp_match_started', projection_key: ['did'],
    });

    expect(result.content).toHaveLength(1);
  });

  it('does not warn when the breakdown arrived as segments', async () => {
    const context = makeContext(realSegmentBreakdown);

    const result = await handleQueryData(context, {
      query_type: 'drill', event: 'pvp_match_started', projection_key: ['sg.via'],
    });

    expect(result.content).toHaveLength(1);
  });

  it('treats an empty array meta as no breakdown, not as a populated one', async () => {
    const context = makeContext({ ...realNoBreakdown, meta: [] });

    const result = await handleQueryData(context, {
      query_type: 'drill', event: 'pvp_match_started', projection_key: ['nope'],
    });

    expect(result.content).toHaveLength(2);
    expect(result.content[1].text).toContain('queriable_fields_list');
  });

  it('still warns on a real no-breakdown payload', async () => {
    const context = makeContext(realNoBreakdown);

    const result = await handleQueryData(context, {
      query_type: 'drill', event: 'pvp_match_started', projection_key: ['nope'],
    });

    expect(result.content).toHaveLength(2);
  });

  it('honours a legacy populated meta', async () => {
    const context = makeContext({ u: 7, t: 14, meta: { did: { a: 1 } } });

    const result = await handleQueryData(context, {
      query_type: 'drill', event: 'pvp_match_started', projection_key: ['did'],
    });

    expect(result.content).toHaveLength(1);
  });
});

describe('drill_users_list sends the bucket Countly requires', () => {
  // Without it the live server answers HTTP 400
  // "Missing request parameter: bucket", so every call failed.
  it('defaults bucket to daily', async () => {
    const context = makeContext(['uid1']);

    await handleListDrillUsers(context, { event: 'pvp_match_started' });

    expect(paramsOfCall(context).bucket).toBe('daily');
  });

  it('forwards an explicit bucket', async () => {
    const context = makeContext(['uid1']);

    await handleListDrillUsers(context, { event: 'pvp_match_started', bucket: 'monthly' });

    expect(paramsOfCall(context).bucket).toBe('monthly');
  });
});
