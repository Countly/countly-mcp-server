/**
 * Countly Platform /v2 REST API helpers
 *
 * Tools keep their legacy (/o, /i) implementation for Lite, Enterprise and
 * Platform builds without the new UI, and switch to /v2 when the connected
 * server serves it. v2 answers `{data}` on success and
 * `{error: {code, message}}` on failure.
 */

import type { ToolContext, ToolResult } from '../tools/types.js';

/** Whether this request's server serves the Platform /v2 API */
export async function usesV2(context: ToolContext): Promise<boolean> {
  try {
    const caps = await context.getServerCapabilities?.();
    return caps?.v2 === true;
  } catch {
    return false;
  }
}

export class V2ApiError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string) {
    super(message);
    this.name = 'V2ApiError';
  }
}

type Method = 'get' | 'post' | 'put' | 'patch' | 'delete';

/** Call a /v2 endpoint and return its unwrapped `data` */
export async function v2Request<T = any>(
  context: ToolContext,
  method: Method,
  path: string,
  options: { params?: Record<string, unknown>; body?: unknown } = {}
): Promise<T> {
  const response = await context.httpClient.request({
    method,
    url: path,
    // The per-request client sends the token in the countly-token header;
    // never copy it into the query string (access logs, proxies).
    params: options.params || {},
    data: options.body,
    validateStatus: () => true,
  });
  const payload = response.data;
  if (response.status >= 200 && response.status < 300) {
    return payload && typeof payload === 'object' && 'data' in payload ? payload.data : payload;
  }
  const error = payload?.error;
  const message = typeof error?.message === 'string'
    ? error.message
    : typeof payload?.result === 'string' ? payload.result : `HTTP ${response.status}`;
  throw new V2ApiError(message, response.status, error?.code);
}

/** Format a v2 failure as a tool error result */
export function v2ErrorResult(action: string, error: unknown): ToolResult & { isError: true } {
  const message = error instanceof Error ? error.message : String(error);
  return {
    content: [{ type: 'text', text: `Failed to ${action}: ${message}` }],
    isError: true,
  };
}

export function jsonResult(title: string, data: unknown): ToolResult {
  return { content: [{ type: 'text', text: `${title}:\n${JSON.stringify(data, null, 2)}` }] };
}

/**
 * Serve skip/limit on top of a page/pageSize API. When the offset is not
 * page-aligned, the window spans two pages: fetch both and slice.
 */
export async function fetchByOffset<P extends { items: any[] }>(
  skip: number,
  limit: number,
  fetchPage: (page: number, pageSize: number) => Promise<P>
): Promise<P> {
  const firstPage = Math.floor(skip / limit) + 1;
  const first = await fetchPage(firstPage, limit);
  const start = skip % limit;
  if (start === 0) {
    return first;
  }
  const second = first.items.length === limit ? await fetchPage(firstPage + 1, limit) : { items: [] };
  return { ...first, items: [...first.items, ...second.items].slice(start, start + limit) };
}
