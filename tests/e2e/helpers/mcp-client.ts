/**
 * Minimal MCP client for the live e2e suite: spawns build/index.js over stdio
 * and speaks newline-delimited JSON-RPC to it.
 */

import { spawn, ChildProcess } from 'child_process';
import { existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const SERVER_ENTRY = join(projectRoot, 'build', 'index.js');

export interface ToolInfo {
  name: string;
  description?: string;
  inputSchema: { properties?: Record<string, any>; required?: string[] };
}

export interface ToolCallResult {
  content: Array<{ type: string; text?: string }>;
  isError?: boolean;
}

interface Pending {
  resolve: (value: any) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
}

export class McpStdioClient {
  private process: ChildProcess | undefined;
  private nextId = 1;
  private pending = new Map<number, Pending>();
  private stdoutBuffer = '';
  private stderrText = '';

  constructor(
    private readonly serverUrl: string,
    private readonly authToken: string,
    private readonly requestTimeoutMs = 90_000
  ) {}

  /** Everything the server wrote to stderr so far */
  get stderr(): string {
    return this.stderrText;
  }

  async start(): Promise<void> {
    if (!existsSync(SERVER_ENTRY)) {
      throw new Error(`${SERVER_ENTRY} not found: run "npm run build" first`);
    }

    // Don't leak the caller's Countly config or the other e2e tokens into the
    // server: COUNTLY_TOOLS_* filters or a stray auth token would skew results.
    const env: NodeJS.ProcessEnv = {};
    for (const [key, value] of Object.entries(process.env)) {
      if (!key.startsWith('COUNTLY_') && !key.startsWith('MCP_E2E_')) {
        env[key] = value;
      }
    }
    Object.assign(env, {
      COUNTLY_SERVER_URL: this.serverUrl,
      COUNTLY_AUTH_TOKEN: this.authToken,
      ENABLE_ANALYTICS: 'false',
    });

    this.process = spawn(process.execPath, [SERVER_ENTRY], { env, stdio: ['pipe', 'pipe', 'pipe'] });
    this.process.stdout!.on('data', (chunk: Buffer) => this.onStdout(chunk));
    this.process.stderr!.on('data', (chunk: Buffer) => {
      this.stderrText += chunk.toString();
    });
    this.process.on('exit', (code, signal) => {
      for (const [id, p] of this.pending) {
        clearTimeout(p.timer);
        p.reject(new Error(`MCP server exited (code ${code}, signal ${signal}) before answering request ${id}`));
      }
      this.pending.clear();
    });

    await this.request('initialize', {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 'countly-mcp-e2e', version: '1.0.0' },
    });
    this.notify('notifications/initialized');
  }

  async stop(): Promise<void> {
    const proc = this.process;
    if (!proc || proc.exitCode !== null) {
      return;
    }
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        proc.kill('SIGKILL');
        resolve();
      }, 3000);
      proc.once('exit', () => {
        clearTimeout(timer);
        resolve();
      });
      proc.kill();
    });
  }

  async listTools(): Promise<ToolInfo[]> {
    const result = await this.request('tools/list', {});
    return result.tools;
  }

  async callTool(name: string, args: Record<string, unknown> = {}): Promise<ToolCallResult> {
    return this.request('tools/call', { name, arguments: args });
  }

  request(method: string, params: unknown): Promise<any> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`${method} timed out after ${this.requestTimeoutMs} ms`));
      }, this.requestTimeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.write({ jsonrpc: '2.0', id, method, params });
    });
  }

  private notify(method: string, params?: unknown): void {
    this.write({ jsonrpc: '2.0', method, ...(params === undefined ? {} : { params }) });
  }

  private write(message: unknown): void {
    if (!this.process?.stdin?.writable) {
      throw new Error('MCP server is not running');
    }
    this.process.stdin.write(JSON.stringify(message) + '\n');
  }

  private onStdout(chunk: Buffer): void {
    this.stdoutBuffer += chunk.toString();
    let newline: number;
    while ((newline = this.stdoutBuffer.indexOf('\n')) !== -1) {
      const line = this.stdoutBuffer.slice(0, newline).trim();
      this.stdoutBuffer = this.stdoutBuffer.slice(newline + 1);
      if (!line) {
        continue;
      }
      let message: any;
      try {
        message = JSON.parse(line);
      } catch {
        continue; // not JSON-RPC; stdout should be clean, but don't crash on it
      }
      const pending = typeof message.id === 'number' ? this.pending.get(message.id) : undefined;
      if (!pending) {
        continue;
      }
      this.pending.delete(message.id);
      clearTimeout(pending.timer);
      if (message.error) {
        pending.reject(new Error(`JSON-RPC error ${message.error.code}: ${message.error.message}`));
      } else {
        pending.resolve(message.result);
      }
    }
  }
}

/** Concatenated text content of a tool result */
export function resultText(result: ToolCallResult): string {
  return (result.content || []).map((c) => c.text || '').join('\n');
}

/**
 * Tool handlers prefix their JSON with a human-readable header
 * ("Dashboard created successfully:\n\n{...}"). Return the first JSON value
 * that parses from the start of a line, or undefined.
 */
export function parseResultJson(result: ToolCallResult): any {
  const text = resultText(result);
  const starts = [0];
  for (let i = text.indexOf('\n'); i !== -1; i = text.indexOf('\n', i + 1)) {
    starts.push(i + 1);
  }
  for (const start of starts) {
    const candidate = text.slice(start).trim();
    if (!/^[[{"]/.test(candidate)) {
      continue;
    }
    try {
      return JSON.parse(candidate);
    } catch {
      // keep looking
    }
  }
  return undefined;
}

/** Depth-first search for the first value matching `predicate` */
export function findDeep(value: any, predicate: (node: any) => boolean, seen = new Set<any>()): any {
  if (value === null || typeof value !== 'object' || seen.has(value)) {
    return undefined;
  }
  seen.add(value);
  if (predicate(value)) {
    return value;
  }
  for (const child of Object.values(value)) {
    const found = findDeep(child, predicate, seen);
    if (found !== undefined) {
      return found;
    }
  }
  return undefined;
}

/** Run `fn` over `items` with at most `limit` in flight */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index]);
    }
  });
  await Promise.all(workers);
  return results;
}
