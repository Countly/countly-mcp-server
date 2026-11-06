import { describe, it, expect, vi } from 'vitest';
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import { handleGetSDKStats } from '../src/tools/sdks.js';
import { ToolContext } from '../src/tools/types.js';

/**
 * sdk_stats_get summary mode: per-SDK and per-version sessions, new users and
 * unique users from /o/analytics/metric. Without summary the tool must keep
 * returning the raw /o?method=sdks time series exactly as before.
 */

const APP = '6aed55516a766f5f696bb0d4';

// Real /o/analytics/metric answers from a Countly Lite 25.03 server (30days)
const SDK_ROWS = [
  { _id: 'java-native-android', t: 466, n: 52, u: 53 },
  { _id: 'objc-native-ios', t: 534, n: 48, u: 51 },
];
const VERSION_ROWS = [
  { _id: '[java-native-android]_26:10:1', t: 206, n: 25, u: 25 },
  { _id: '[objc-native-ios]_26:10:2', t: 191, n: 23, u: 25 },
  { _id: '[java-native-android]_26:10:2', t: 148, n: 18, u: 18 },
  { _id: '[objc-native-ios]_26:10:1', t: 224, n: 16, u: 16 },
  { _id: '[objc-native-ios]_26:10:0', t: 66, n: 7, u: 7 },
  { _id: '[java-native-android]_26:10:0', t: 65, n: 6, u: 6 },
  { _id: '[java-native-android]_26:11:0', t: 47, n: 3, u: 4 },
  { _id: '[objc-native-ios]_26:11:0', t: 53, n: 2, u: 3 },
];

// A slice of the raw /o?method=sdks time series
const RAW_SDKS = {
  2026: { 10: { 8: { r: 2, d_count: 2, '[java-native-android]_26:10:0': { n: 1, t: 1, u: 1 } } } },
  meta: { sdks: ['java-native-android'], sdk_version: ['[java-native-android]_26:10:0'] },
};

type Answer = { data: unknown } | Error;

/** Context whose GETs are answered by `answer(url, params)` */
function makeContext(answer: (url: string, params: any) => Answer): ToolContext {
  const get = vi.fn(async (url: string, config: any) => {
    const result = answer(url, config.params);
    if (result instanceof Error) {
      throw result;
    }
    return result;
  });
  return {
    httpClient: { get } as any,
    appCache: {} as any,
    getAuthParams: () => ({ auth_token: 'token' }),
    resolveAppId: vi.fn(async (args: any) => args.app_id ?? APP),
    getApps: vi.fn(),
  };
}

/** Answers the two summary calls with the given rows */
function metricContext(sdkRows: unknown, versionRows: unknown): ToolContext {
  return makeContext((url, params) => {
    if (url !== '/o/analytics/metric') {
      throw new Error(`unexpected request to ${url}`);
    }
    return { data: params.metric === 'sdks' ? sdkRows : versionRows };
  });
}

const getMock = (context: ToolContext) => context.httpClient.get as unknown as ReturnType<typeof vi.fn>;
const text = (result: any): string => result.content[0].text;
/** The JSON after the "SDK statistics for app … :" prefix */
const json = (result: any) => JSON.parse(text(result).slice(text(result).indexOf('\n\n') + 2));

describe('sdk_stats_get without summary', () => {
  it('returns the raw time series exactly as before', async () => {
    const context = makeContext(() => ({ data: RAW_SDKS }));
    const result = await handleGetSDKStats(context, { app_id: APP });

    // The pre-summary output format, byte for byte
    expect(text(result)).toBe(`SDK statistics for app ${APP} (period: 30days):\n\n${JSON.stringify(RAW_SDKS, null, 2)}`);
    expect(result.isError).toBeUndefined();
    expect(getMock(context)).toHaveBeenCalledTimes(1);
    expect(getMock(context)).toHaveBeenCalledWith('/o', {
      params: { auth_token: 'token', app_id: APP, method: 'sdks', period: '30days' },
    });
  });

  it('gives the same output for summary false and summary null as for no summary', async () => {
    const outputs = [];
    for (const summary of [undefined, false, null, 'false']) {
      const context = makeContext(() => ({ data: RAW_SDKS }));
      outputs.push(text(await handleGetSDKStats(context, { app_id: APP, period: '7days', summary })));
      expect(getMock(context).mock.calls[0][0]).toBe('/o');
    }
    expect(new Set(outputs).size).toBe(1);
  });
});

describe('sdk_stats_get summary parameter', () => {
  it('accepts summary "true" given as text', async () => {
    const context = metricContext(SDK_ROWS, VERSION_ROWS);
    const result = await handleGetSDKStats(context, { app_id: APP, summary: 'true' });
    expect(json(result).sdks).toHaveLength(2);
    expect(getMock(context).mock.calls.every(([url]) => url === '/o/analytics/metric')).toBe(true);
  });

  it('rejects an invalid value with InvalidParams before any request', async () => {
    const context = metricContext(SDK_ROWS, VERSION_ROWS);
    const call = handleGetSDKStats(context, { app_id: APP, summary: 'maybe' });
    await expect(call).rejects.toBeInstanceOf(McpError);
    await expect(call).rejects.toMatchObject({ code: ErrorCode.InvalidParams });
    expect(getMock(context)).not.toHaveBeenCalled();
    expect(context.resolveAppId).not.toHaveBeenCalled();
  });
});

describe('sdk_stats_get summary', () => {
  it('calls /o/analytics/metric for sdks and sdk_version with the same app, period and auth', async () => {
    const context = metricContext(SDK_ROWS, VERSION_ROWS);
    await handleGetSDKStats(context, { app_id: APP, summary: true });

    const calls = getMock(context).mock.calls;
    expect(calls).toHaveLength(2);
    expect(calls.map(([url, config]) => [url, config.params]).sort((a, b) => (a[1].metric < b[1].metric ? -1 : 1)))
      .toEqual([
        ['/o/analytics/metric', { auth_token: 'token', app_id: APP, period: '30days', metric: 'sdk_version' }],
        ['/o/analytics/metric', { auth_token: 'token', app_id: APP, period: '30days', metric: 'sdks' }],
      ]);
  });

  it('groups versions under their SDK, sorts by sessions and converts versions', async () => {
    const result = await handleGetSDKStats(metricContext(SDK_ROWS, VERSION_ROWS), { app_id: APP, summary: true });
    const out = json(result);

    expect(text(result).startsWith(`SDK statistics for app ${APP} (period: 30days):\n\n`)).toBe(true);
    expect(out).toMatchObject({ period: '30days', app_id: APP });
    expect(out.sdks).toEqual([
      {
        sdk: 'objc-native-ios', sessions: 534, newUsers: 48, uniqueUsers: 51,
        versions: [
          { version: '26.10.1', sessions: 224, newUsers: 16, uniqueUsers: 16 },
          { version: '26.10.2', sessions: 191, newUsers: 23, uniqueUsers: 25 },
          { version: '26.10.0', sessions: 66, newUsers: 7, uniqueUsers: 7 },
          { version: '26.11.0', sessions: 53, newUsers: 2, uniqueUsers: 3 },
        ],
      },
      {
        sdk: 'java-native-android', sessions: 466, newUsers: 52, uniqueUsers: 53,
        versions: [
          { version: '26.10.1', sessions: 206, newUsers: 25, uniqueUsers: 25 },
          { version: '26.10.2', sessions: 148, newUsers: 18, uniqueUsers: 18 },
          { version: '26.10.0', sessions: 65, newUsers: 6, uniqueUsers: 6 },
          { version: '26.11.0', sessions: 47, newUsers: 3, uniqueUsers: 4 },
        ],
      },
    ]);
    expect(out).not.toHaveProperty('unmatched');
    expect(result.isError).toBeUndefined();
  });

  it('breaks ties in sessions by name', async () => {
    const out = json(await handleGetSDKStats(metricContext(
      [{ _id: 'b-sdk', t: 10, n: 1, u: 1 }, { _id: 'a-sdk', t: 10, n: 1, u: 1 }],
      [{ _id: '[a-sdk]_2:0:0', t: 5, n: 1, u: 1 }, { _id: '[a-sdk]_10:0:0', t: 5, n: 0, u: 1 }]
    ), { app_id: APP, summary: true }));

    expect(out.sdks.map((s: any) => s.sdk)).toEqual(['a-sdk', 'b-sdk']);
    expect(out.sdks[0].versions.map((v: any) => v.version)).toEqual(['10.0.0', '2.0.0']);
  });

  it('totals only sessions and new users, never unique users', async () => {
    const out = json(await handleGetSDKStats(metricContext(SDK_ROWS, VERSION_ROWS), { app_id: APP, summary: true }));

    expect(out.totals).toEqual({ sessions: 1000, newUsers: 100 });
    expect(Object.keys(out.totals).filter((key) => /uniq/i.test(key))).toEqual([]);
    expect(out.note).toMatch(/not users/);
    expect(out.note).toMatch(/never summed/);
  });

  it('forwards a custom period range unchanged to both calls', async () => {
    const period = '[1792454400000,1793059200000]';
    const context = metricContext(SDK_ROWS, VERSION_ROWS);
    const result = await handleGetSDKStats(context, { app_id: APP, summary: true, period });

    const calls = getMock(context).mock.calls;
    expect(calls).toHaveLength(2);
    expect(calls.map(([, config]) => config.params.period)).toEqual([period, period]);
    expect(json(result).period).toBe(period);
    expect(text(result)).toContain(`(period: ${period})`);
  });

  it('says clearly when there is no data, without an error', async () => {
    const result = await handleGetSDKStats(metricContext([], []), { app_id: APP, summary: true });
    expect(text(result)).toBe(`SDK statistics for app ${APP} (period: 30days): no SDK data for this app in this period.`);
    expect(result.isError).toBeUndefined();
  });

  it('lists rows that do not fit apart, with a reason, without failing', async () => {
    const out = json(await handleGetSDKStats(metricContext(
      [...SDK_ROWS, { t: 3, n: 1, u: 1 }],
      [...VERSION_ROWS, { _id: 'no-brackets_1:0', t: 2, n: 0, u: 1 }, { _id: '[unknown-sdk]_1:0:0', t: 1, n: 1, u: 1 }]
    ), { app_id: APP, summary: true }));

    expect(out.sdks).toHaveLength(2);
    expect(out.totals).toEqual({ sessions: 1000, newUsers: 100 });
    expect(out.unmatched).toEqual([
      { reason: 'SDK row without an SDK name' },
      { id: 'no-brackets_1:0', reason: 'version id does not match "[sdk]_version"' },
      { id: '[unknown-sdk]_1:0:0', reason: 'SDK "unknown-sdk" is not in the per-SDK rows' },
    ]);
  });

  it('puts every version in unmatched when the SDK list is empty', async () => {
    const result = await handleGetSDKStats(metricContext([], VERSION_ROWS), { app_id: APP, summary: true });
    const out = json(result);

    expect(out.sdks).toEqual([]);
    expect(out.totals).toEqual({ sessions: 0, newUsers: 0 });
    expect(out.unmatched).toHaveLength(VERSION_ROWS.length);
    expect(out.unmatched.every((row: any) => row.reason.startsWith('SDK "'))).toBe(true);
    expect(result.isError).toBeUndefined();
  });

  it('keeps SDKs with an empty version list when no version rows come back', async () => {
    const result = await handleGetSDKStats(metricContext(SDK_ROWS, []), { app_id: APP, summary: true });
    const out = json(result);

    expect(out.sdks.map((s: any) => [s.sdk, s.sessions, s.uniqueUsers, s.versions])).toEqual([
      ['objc-native-ios', 534, 51, []],
      ['java-native-android', 466, 53, []],
    ]);
    expect(out.totals).toEqual({ sessions: 1000, newUsers: 100 });
    expect(out).not.toHaveProperty('unmatched');
    expect(result.isError).toBeUndefined();
  });

  it('propagates the error when only one of the two calls fails', async () => {
    const httpError = Object.assign(new Error('Request failed with status code 500'), {
      isAxiosError: true,
      response: { status: 500, data: { result: 'Internal error' } },
    });
    const context = makeContext((_url, params) => (params.metric === 'sdk_version' ? httpError : { data: SDK_ROWS }));
    const call = handleGetSDKStats(context, { app_id: APP, summary: true });

    await expect(call).rejects.toBeInstanceOf(McpError);
    await expect(call).rejects.toThrow('Failed to get SDK summary (metric=sdk_version): HTTP 500 error: Internal error');
    expect(getMock(context)).toHaveBeenCalledTimes(2);
  });

  it('turns a 200 answer that is not a list into an error with the server text', async () => {
    const result = await handleGetSDKStats(metricContext({ result: 'Must provide metric' }, VERSION_ROWS), { app_id: APP, summary: true });
    expect(result.isError).toBe(true);
    expect(text(result)).toBe('Failed to get SDK summary (metric=sdks): unexpected response from Countly: Must provide metric');

    // A body without a result message is shown as JSON
    const other = await handleGetSDKStats(metricContext(SDK_ROWS, { rows: 0 }), { app_id: APP, summary: true });
    expect(other.isError).toBe(true);
    expect(text(other)).toBe('Failed to get SDK summary (metric=sdk_version): unexpected response from Countly: {"rows":0}');
  });

  it.each([[undefined], [null], ['']])('uses a fallback text for an empty %j body', async (body) => {
    const result = await handleGetSDKStats(metricContext(SDK_ROWS, body), { app_id: APP, summary: true });
    expect(result.isError).toBe(true);
    expect(text(result)).toBe('Failed to get SDK summary (metric=sdk_version): unexpected response from Countly: (empty response)');
  });

  it('reports server errors through safeApiCall', async () => {
    const httpError = Object.assign(new Error('Request failed with status code 401'), {
      isAxiosError: true,
      response: { status: 401, data: { result: 'App does not exist' } },
    });
    const context = makeContext(() => httpError);
    const call = handleGetSDKStats(context, { app_id: APP, summary: true });

    await expect(call).rejects.toBeInstanceOf(McpError);
    await expect(call).rejects.toThrow(/Failed to get SDK summary \(metric=(sdks|sdk_version)\): HTTP 401 error: App does not exist/);
  });
});
