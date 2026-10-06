import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { CountlyMCPServer } from '../src/index.js';

/**
 * Per-request token precedence on the server itself.
 *
 * In HTTP mode the middleware stores the caller's X-Countly-Auth-Token in
 * AsyncLocalStorage. That token must win over a server-level
 * COUNTLY_AUTH_TOKEN / COUNTLY_AUTH_TOKEN_FILE: previously resolveAuthToken
 * read process.env before the per-request state was consulted, so a request
 * presenting one identity silently ran as the env one.
 */

type Internals = {
  requestContext: { run<T>(state: { authToken?: string; serverUrl: string }, fn: () => T): T };
  getCredentials(request?: unknown, args?: unknown): { authToken?: string };
  buildPerRequestClient(request: unknown): { authToken: string | undefined };
};

const SAVED = ['COUNTLY_AUTH_TOKEN', 'COUNTLY_AUTH_TOKEN_FILE'] as const;

describe('request token precedence', () => {
  let saved: Record<string, string | undefined>;
  let tempDir: string;

  beforeEach(() => {
    saved = Object.fromEntries(SAVED.map((k) => [k, process.env[k]]));
    for (const k of SAVED) {
      delete process.env[k];
    }
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'countly-precedence-'));
  });

  afterEach(() => {
    for (const k of SAVED) {
      if (saved[k] === undefined) {
        delete process.env[k];
      } else {
        process.env[k] = saved[k];
      }
    }
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const server = (): Internals => new CountlyMCPServer(true) as unknown as Internals;
  const withHeader = <T>(s: Internals, token: string | undefined, fn: () => T): T =>
    s.requestContext.run({ authToken: token, serverUrl: 'https://example.count.ly' }, fn);

  it('uses the header token over COUNTLY_AUTH_TOKEN for tool calls', () => {
    process.env.COUNTLY_AUTH_TOKEN = 'ENV_TOKEN';
    const s = server();
    expect(withHeader(s, 'HEADER_TOKEN', () => s.getCredentials())).toEqual({ authToken: 'HEADER_TOKEN' });
  });

  it('uses the header token over COUNTLY_AUTH_TOKEN for resources and prompts', () => {
    process.env.COUNTLY_AUTH_TOKEN = 'ENV_TOKEN';
    const s = server();
    expect(withHeader(s, 'HEADER_TOKEN', () => s.buildPerRequestClient({}).authToken)).toBe('HEADER_TOKEN');
  });

  it('uses the header token over COUNTLY_AUTH_TOKEN_FILE', () => {
    const file = path.join(tempDir, 'token.txt');
    fs.writeFileSync(file, 'FILE_TOKEN\n');
    process.env.COUNTLY_AUTH_TOKEN_FILE = file;
    const s = server();
    expect(withHeader(s, 'HEADER_TOKEN', () => s.getCredentials())).toEqual({ authToken: 'HEADER_TOKEN' });
  });

  it('still lets a tool argument override the header', () => {
    const s = server();
    expect(
      withHeader(s, 'HEADER_TOKEN', () => s.getCredentials(undefined, { countly_auth_token: 'ARG_TOKEN' }))
    ).toEqual({ authToken: 'ARG_TOKEN' });
  });

  it('falls back to COUNTLY_AUTH_TOKEN when the request carries none', () => {
    process.env.COUNTLY_AUTH_TOKEN = 'ENV_TOKEN';
    const s = server();
    expect(withHeader(s, undefined, () => s.getCredentials())).toEqual({ authToken: 'ENV_TOKEN' });
    expect(s.getCredentials()).toEqual({ authToken: 'ENV_TOKEN' });
  });

  it('falls back to COUNTLY_AUTH_TOKEN_FILE when the request carries none', () => {
    const file = path.join(tempDir, 'token.txt');
    fs.writeFileSync(file, 'FILE_TOKEN\n');
    process.env.COUNTLY_AUTH_TOKEN_FILE = file;
    const s = server();
    expect(s.getCredentials()).toEqual({ authToken: 'FILE_TOKEN' });
  });

  it('throws when no source supplies a token', () => {
    const s = server();
    expect(() => s.getCredentials()).toThrow();
  });
});
