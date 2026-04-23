#!/usr/bin/env node

// Load environment variables from .env file (quiet mode for MCP stdio compatibility)
import dotenv from 'dotenv';

dotenv.config({ quiet: true });


import { AsyncLocalStorage } from 'async_hooks';
import { realpathSync } from 'fs';
import http from 'http';
import { createRequire } from 'module';
import url from 'url';

// Load the package version at runtime so the MCP handshake, the well-known
// manifest, and any future self-identification share a single source of
// truth. Previously these drifted (handshake reported "1.0.0" while the
// manifest reported "1.0.1" and package.json said something else entirely).
const require = createRequire(import.meta.url);
const { version: PACKAGE_VERSION } = require('../package.json') as { version: string };

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
  McpError,
  CallToolRequest,
} from '@modelcontextprotocol/sdk/types.js';
import axios, { AxiosInstance } from 'axios';

import { AppCache, AppCacheRegistry, resolveAppIdentifier, type CountlyApp } from './lib/app-cache.js';
import { resolveAuthToken, createMissingAuthError } from './lib/auth.js';
import { analytics } from './lib/analytics.js';
import { assertSafeServerUrl, buildConfig } from './lib/config.js';
import {
  ConcurrencyLimiter,
  enforceBodySizeLimit,
  extractClientIp,
  formatRequestLog,
  parseCorsAllowed,
  RateLimiter,
  resolveCorsOrigin,
  sanitizeForLog,
} from './lib/http-security.js';
import { loadToolsConfig, filterTools, getConfigSummary, type ToolsConfig } from './lib/tools-config.js';
import { listResources, readResource } from './lib/resources.js';
import { listPrompts, getPrompt } from './lib/prompts.js';
import { 
  getAllToolDefinitions, 
  getAllToolMetadata,
} from './tools/index.js';
import { ToolContext } from './tools/types.js';

interface CountlyConfig {
  serverUrl: string;
  authToken?: string; // Authentication token - can come from client
  timeout?: number;
}

interface HttpConfig {
  port?: number;
  hostname?: string;
  cors?: boolean;
}

/**
 * Per-request authentication + endpoint context.
 *
 * In HTTP transport the MCP server is multi-tenant: each incoming request
 * may carry its own Countly auth token and server URL (via headers or URL
 * params). Previously those were mutated onto the shared `this.config` and
 * `this.httpClient.defaults`, which led to cross-tenant token mixing under
 * concurrency. We now stash per-request state in an AsyncLocalStorage so the
 * MCP tool handler can pick it up across await boundaries without sharing.
 */
interface RequestState {
  authToken?: string;
  serverUrl: string;
}

interface ToolCallHistory {
  toolName: string;
  args: any;
  timestamp: number;
  result?: any;
}

/**
 * Keys that are never worth keeping in the loop-detector history, and which
 * are sensitive enough that a crash/heap-dump shouldn't preserve them. Scrub
 * on ingress rather than on comparison so the stored history is clean from
 * the start.
 */
const SENSITIVE_ARG_KEYS = new Set<string>(['countly_auth_token']);

function scrubSensitiveArgs(args: any): any {
  if (!args || typeof args !== 'object' || Array.isArray(args)) {
    return args;
  }
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(args)) {
    out[k] = SENSITIVE_ARG_KEYS.has(k) ? '[REDACTED]' : v;
  }
  return out;
}

class LoopDetector {
  private history: ToolCallHistory[] = [];
  private readonly maxHistorySize = 20;
  private readonly loopThreshold = 3; // Number of similar calls to trigger warning
  private readonly timeWindow = 30000; // 30 seconds window

  addCall(toolName: string, args: any): { isLoop: boolean; warning?: string } {
    const now = Date.now();

    // Clean old entries
    this.history = this.history.filter(call => now - call.timestamp < this.timeWindow);

    // Strip secrets before we retain the args anywhere. The loop detector
    // keeps args in memory for up to 30s; any auth token passed as a tool
    // argument would otherwise survive in heap snapshots or crash reports.
    const safeArgs = scrubSensitiveArgs(args);

    // Create a normalized args signature for comparison
    const argsSignature = this.normalizeArgs(safeArgs);

    // Count similar calls in recent history
    const similarCalls = this.history.filter(call => {
      const callArgsSignature = this.normalizeArgs(call.args);
      return call.toolName === toolName && callArgsSignature === argsSignature;
    });

    // Add current call to history (scrubbed args — never raw)
    this.history.push({ toolName, args: safeArgs, timestamp: now });
    
    // Keep history size manageable
    if (this.history.length > this.maxHistorySize) {
      this.history = this.history.slice(-this.maxHistorySize);
    }
    
    // Check for potential loop
    if (similarCalls.length >= this.loopThreshold) {
      return {
        isLoop: true,
        warning: `⚠️ Potential infinite loop detected: Tool "${toolName}" has been called ${similarCalls.length + 1} times with similar parameters in the last ${this.timeWindow / 1000} seconds. Consider trying a different approach or checking your query parameters.`
      };
    }
    
    return { isLoop: false };
  }
  
  private normalizeArgs(args: any): string {
    if (!args || typeof args !== 'object') {
      return '';
    }
    
    // Create a normalized string representation of args
    // Sort keys and stringify to detect similar calls
    try {
      return JSON.stringify(args, Object.keys(args).sort());
    } catch {
      return String(args);
    }
  }
}

class CountlyMCPServer {
  private server: Server;
  private config: CountlyConfig;
  /**
   * Shared fallback axios client. Used only for stdio-mode operation where
   * a single long-lived process serves a single tenant via env/file
   * credentials. HTTP-transport callers each get a fresh per-request client
   * via `createRequestHttpClient()` so concurrent tenants can't mix tokens.
   */
  private httpClient: AxiosInstance;
  /**
   * Per-tenant app caches keyed by SHA-256(authToken). See the class comment
   * on AppCacheRegistry — sharing one AppCache across tenants is a
   * cross-tenant data-leak bug.
   */
  private appCacheRegistry: AppCacheRegistry;
  private toolsConfig: ToolsConfig;
  private loopDetector: LoopDetector;
  private lastTokenInUrlWarnAt: number = 0;
  /**
   * AsyncLocalStorage carrying the per-request auth token + serverUrl from
   * the HTTP middleware to the MCP tool handler across await boundaries.
   * Falls back to null (no store) in stdio mode where no middleware runs.
   */
  private requestContext: AsyncLocalStorage<RequestState>;

  constructor(testMode: boolean = false) {
    this.appCacheRegistry = new AppCacheRegistry();
    this.toolsConfig = loadToolsConfig(process.env);
    this.loopDetector = new LoopDetector();
    this.requestContext = new AsyncLocalStorage<RequestState>();
    
    // Initialize analytics. Opt-in: enabled only when ENABLE_ANALYTICS=true.
    // README has always documented this as "disabled by default"; the previous
    // `!== 'false'` check silently opted users in. Flip to explicit opt-in.
    //
    // The getServerUrl callback lets analytics attach a short opaque SHA-256
    // hash of the current Countly server URL (as the `server` segment) to
    // every event, so stats.count.ly can aggregate distinct-server counts
    // without ever seeing raw URLs.
    //
    // Priority:
    //   1. HTTP per-request URL from AsyncLocalStorage (multi-tenant)
    //   2. static server config (stdio after constructor finishes)
    //   3. process.env.COUNTLY_SERVER_URL (pre-config fallback — the
    //      `server_started` event fires from inside analytics.init() which
    //      runs before this.config is assigned, so without this fallback
    //      the very first event would ship without the `server` segment)
    const analyticsEnabled = (process.env.ENABLE_ANALYTICS || '').toLowerCase() === 'true';
    analytics.init(analyticsEnabled, () => {
      const reqState = this.requestContext.getStore();
      return (
        reqState?.serverUrl
        || this.config?.serverUrl
        || process.env.COUNTLY_SERVER_URL
      );
    });
    
    // Log configuration on startup (only in non-test mode)
    if (!testMode) {
      console.error(getConfigSummary(this.toolsConfig));
    }
    
    this.server = new Server(
      {
        name: 'countly-mcp-server',
        version: PACKAGE_VERSION,
      },
      {
        capabilities: {
          tools: {
            listChanged: true,
          },
          resources: {
            subscribe: false,
            listChanged: false,
          },
          prompts: {
            listChanged: false,
          },
        },
      }
    );

    this.setupToolHandlers();
    this.setupResourceHandlers();
    this.setupPromptHandlers();
    
    // Initialize config from environment variables using lib/config.ts
    // Auth token can be loaded from environment or overridden per-request from client metadata
    this.config = buildConfig(process.env, undefined, testMode);

    this.httpClient = axios.create({
      baseURL: this.config.serverUrl,
      timeout: this.config.timeout,
    });

    // Set auth header if token is available from environment
    if (this.config.authToken) {
      this.setAuthHeader(this.config.authToken);
    }
  }

  /**
   * Extract auth token from request metadata, arguments, or environment
   * Priority: request metadata > arguments > current config (set from headers) > environment variables > file
   * Uses lib/auth.ts resolveAuthToken function
   */
  private getCredentials(request?: CallToolRequest, args?: any): { authToken?: string } {
    const metadata = (request as any)?._meta || (request as any)?.meta;

    // Try to get from metadata or args first
    let authToken = resolveAuthToken({ metadata, args });

    // Per-request HTTP state from AsyncLocalStorage (HTTP middleware sets it)
    if (!authToken) {
      const reqState = this.requestContext.getStore();
      if (reqState?.authToken) {
        authToken = reqState.authToken;
      }
    }

    // Server-level config fallback (env / file in stdio mode)
    if (!authToken && this.config.authToken) {
      authToken = this.config.authToken;
    }

    if (!authToken) {
      throw createMissingAuthError();
    }

    return { authToken };
  }

  private setupToolHandlers() {
    // Use the modular tool definitions from tools/index.ts and filter by configuration
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      const allTools = getAllToolDefinitions();
      const filteredTools = filterTools(allTools, this.toolsConfig);
      return { tools: filteredTools };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      const startTime = Date.now();

      try {
        // Extract credentials from request (client-side)
        const credentials = this.getCredentials(request, args);

        // Track authentication method used
        const metadata = (request as any)?._meta || (request as any)?.meta;
        if (metadata?.countlyAuthToken) {
          analytics.trackAuthMethod('metadata');
        } else if (args?.countly_auth_token) {
          analytics.trackAuthMethod('args');
        } else if (this.requestContext.getStore()?.authToken) {
          analytics.trackAuthMethod('headers');
        } else if (process.env.COUNTLY_AUTH_TOKEN) {
          analytics.trackAuthMethod('env');
        }

        // Resolve the per-request endpoint (header/URL-param override via
        // AsyncLocalStorage falls through to the server-level config).
        const reqState = this.requestContext.getStore();
        const serverUrl = reqState?.serverUrl || this.config.serverUrl;
        const authToken = credentials.authToken;

        // Build a fresh axios client for this request so concurrent tenants
        // cannot share headers / baseURL on the same object. The shared
        // `this.httpClient` is intentionally untouched.
        const perReqHttpClient = this.createRequestHttpClient(authToken, serverUrl);

        // Per-tenant app cache. Keyed by SHA-256(authToken) inside the
        // registry so one tenant's apps cannot leak into another's
        // resolveAppId lookup.
        const perTenantAppCache = this.appCacheRegistry.for(authToken);

        // Create tool context
        const context: ToolContext = {
          resolveAppId: async (a: any) =>
            await this.resolveAppIdentifierWithContext(a, perReqHttpClient, perTenantAppCache, authToken),
          getAuthParams: () => (authToken ? { auth_token: authToken } : {}),
          httpClient: perReqHttpClient,
          appCache: perTenantAppCache,
          getApps: async () =>
            await this.getAppsWithContext(perReqHttpClient, perTenantAppCache, authToken),
        };
        
        // Get all tool metadata and filter based on tools configuration
        const toolMetadataList = getAllToolMetadata();
        const allowedToolNames = new Set(
          filterTools(getAllToolDefinitions(), this.toolsConfig).map(t => t.name)
        );
        
        const toolInstances: Record<string, any> = {};
        const toolHandlers: Record<string, string> = {};
        const instanceMap: Record<string, string> = {};
        
        // Loop through metadata to build routing information
        for (const metadata of toolMetadataList) {
          // Instantiate the tool class if not already done
          if (!toolInstances[metadata.instanceKey]) {
            toolInstances[metadata.instanceKey] = new metadata.toolClass(context);
          }
          
          // Add handler mappings only for allowed tools
          for (const [toolName, methodName] of Object.entries(metadata.handlers)) {
            if (allowedToolNames.has(toolName)) {
              toolHandlers[toolName] = methodName;
              instanceMap[toolName] = metadata.instanceKey;
            }
          }
        }
        
        // Look up the handler method and instance
        const methodName = toolHandlers[name];
        const instanceKey = instanceMap[name];
        
        if (!methodName || !instanceKey) {
          throw new McpError(
            ErrorCode.MethodNotFound,
            `Unknown tool: ${name}`
          );
        }
        
        const instance = toolInstances[instanceKey];
        
        // Check for potential infinite loops before executing the tool
        const loopCheck = this.loopDetector.addCall(name, args);
        if (loopCheck.isLoop) {
          console.warn(loopCheck.warning);
          // Still allow the call but log the warning
        }
        
        const result = await instance[methodName](args);
        
        // Track successful tool execution
        const duration = Date.now() - startTime;
        analytics.trackToolExecution(name, true, duration);
        
        // Track tool category based on prefix (e.g., "get_", "create_", "list_")
        const category = name.split('_')[0] || 'unknown';
        analytics.trackToolCategory(category);
        
        return result as any;
      } catch (error) {
        // Track failed tool execution
        const duration = Date.now() - startTime;
        analytics.trackToolExecution(name, false, duration);
        analytics.trackError(
          error instanceof McpError ? error.code.toString() : 'unknown',
          error instanceof Error ? error.message : String(error),
          name
        );
        
        if (error instanceof McpError) {
          throw error;
        }
        throw new McpError(
          ErrorCode.InternalError,
          `Error executing tool ${name}: ${error instanceof Error ? error.message : String(error)}`
        );
      }
      // No finally {} needed — per-request httpClient and cache are local to
      // this handler. Nothing shared was mutated.
    });
  }

  private setupResourceHandlers() {
    // Handle resources/list requests
    this.server.setRequestHandler(ListResourcesRequestSchema, async (request) => {
      try {
        const { client, cache, authToken } = this.buildPerRequestClient(request);
        const getAuthParams = () => (authToken ? { auth_token: authToken } : {});
        const resources = await listResources(client, cache, getAuthParams);
        analytics.trackHttpRequest('/resources/list', 'MCP');
        return { resources };
      } catch (error) {
        analytics.trackError(
          'resource_list_error',
          error instanceof Error ? error.message : String(error),
          'resources/list'
        );
        throw new McpError(
          ErrorCode.InternalError,
          `Failed to list resources: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    });

    // Handle resources/read requests
    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      try {
        const { client, cache, authToken } = this.buildPerRequestClient(request);
        const getAuthParams = () => (authToken ? { auth_token: authToken } : {});
        const { uri } = request.params;
        const content = await readResource(uri, client, cache, getAuthParams);
        analytics.trackHttpRequest('/resources/read', 'MCP');
        return { contents: [content] };
      } catch (error) {
        analytics.trackError(
          'resource_read_error',
          error instanceof Error ? error.message : String(error),
          'resources/read'
        );
        if (error instanceof Error && error.message.includes('not found')) {
          throw new McpError(
            -32002, // Resource not found error code
            error.message
          );
        }
        throw new McpError(
          ErrorCode.InternalError,
          `Failed to read resource: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    });
  }

  private setupPromptHandlers() {
    // Handle prompts/list requests
    this.server.setRequestHandler(ListPromptsRequestSchema, async () => {
      try {
        const prompts = listPrompts();
        
        analytics.trackHttpRequest('/prompts/list', 'MCP');
        
        return { prompts };
      } catch (error) {
        analytics.trackError(
          'prompt_list_error',
          error instanceof Error ? error.message : String(error),
          'prompts/list'
        );
        throw new McpError(
          ErrorCode.InternalError,
          `Failed to list prompts: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    });

    // Handle prompts/get requests
    this.server.setRequestHandler(GetPromptRequestSchema, async (request) => {
      try {
        const { name, arguments: args } = request.params;
        
        const result = getPrompt(name, args || {});
        
        analytics.trackHttpRequest('/prompts/get', 'MCP');
        
        return {
          description: result.description,
          messages: result.messages
        };
      } catch (error) {
        analytics.trackError(
          'prompt_get_error',
          error instanceof Error ? error.message : String(error),
          'prompts/get'
        );
        
        if (error instanceof Error && error.message.includes('Unknown prompt')) {
          throw new McpError(
            ErrorCode.InvalidParams,
            error.message
          );
        }
        
        throw new McpError(
          ErrorCode.InternalError,
          `Failed to get prompt: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    });
  }

  // Helper Methods
  private getAuthParams(): {} {
    // Return auth_token as query param for endpoints that require it (e.g., /o/apps/mine)
    if (this.config.authToken) {
      return { auth_token: this.config.authToken };
    }
    return {};
  }

  private setAuthHeader(token?: string): void {
    if (token) {
      this.httpClient.defaults.headers.common['countly-token'] = token;
    } else {
      delete this.httpClient.defaults.headers.common['countly-token'];
    }
  }

  /**
   * Warn when a caller passes the auth token via ?auth_token= URL query
   * parameter instead of via the X-Countly-Auth-Token header. Tokens in URLs
   * leak into access logs, reverse-proxy logs, browser history, and Referer
   * headers. Support is kept for now for backward compatibility but will be
   * removed in a future release. Rate-limited to once per minute so busy HTTP
   * traffic does not flood stderr.
   */
  private warnTokenInUrl(): void {
    const now = Date.now();
    if (now - this.lastTokenInUrlWarnAt < 60_000) {
      return;
    }
    this.lastTokenInUrlWarnAt = now;
    console.error(
      '⚠️  SECURITY: auth token was passed via ?auth_token= URL query parameter. ' +
      'This leaks into access logs, browser history, and Referer headers. ' +
      'Migrate callers to the X-Countly-Auth-Token header. ' +
      'URL-parameter support is deprecated and will be removed in a future release.'
    );
  }

  /**
   * Build a fresh axios instance for a single MCP request. Baking the
   * auth token into the per-request instance's default headers (instead of
   * the shared `this.httpClient`) means concurrent tenants never see each
   * other's credentials — even if their handlers interleave across await
   * points.
   */
  private createRequestHttpClient(
    authToken: string | undefined,
    serverUrl: string
  ): AxiosInstance {
    const headers: Record<string, string> = {};
    if (authToken) {
      headers['countly-token'] = authToken;
    }
    return axios.create({
      baseURL: serverUrl,
      timeout: this.config.timeout,
      headers,
    });
  }

  /**
   * Resolve the effective auth token + build a per-request axios client and
   * a per-tenant AppCache for non-tool MCP requests (resources, prompts).
   * Priority order: tool args > MCP metadata > AsyncLocalStorage (HTTP
   * middleware) > server-level config (env/file).
   */
  private buildPerRequestClient(request: any): {
    client: AxiosInstance;
    cache: AppCache;
    authToken: string | undefined;
  } {
    const metadata = request?._meta || request?.meta;
    const args = request?.params || {};
    let authToken = resolveAuthToken({ metadata, args });
    const reqState = this.requestContext.getStore();
    if (!authToken && reqState?.authToken) {
      authToken = reqState.authToken;
    }
    if (!authToken && this.config.authToken) {
      authToken = this.config.authToken;
    }
    if (!authToken && process.env.COUNTLY_AUTH_TOKEN) {
      authToken = process.env.COUNTLY_AUTH_TOKEN;
    }
    const serverUrl = reqState?.serverUrl || this.config.serverUrl;
    const client = this.createRequestHttpClient(authToken, serverUrl);
    const cache = this.appCacheRegistry.for(authToken);
    return { client, cache, authToken };
  }

  private async getAppsWithContext(
    client: AxiosInstance,
    cache: AppCache,
    authToken: string | undefined
  ): Promise<CountlyApp[]> {
    if (!cache.isExpired()) {
      return cache.getAll();
    }
    const params = authToken ? { auth_token: authToken } : {};
    const response = await client.get('/o/apps/mine', { params });

    let apps: CountlyApp[];
    if (response.data && Array.isArray(response.data)) {
      apps = response.data;
    } else if (response.data && response.data.admin_of) {
      apps = Object.values(response.data.admin_of) as CountlyApp[];
    } else if (response.data && response.data.apps) {
      apps = response.data.apps;
    } else {
      apps = [];
    }

    cache.update(apps);
    return apps;
  }

  private async resolveAppIdentifierWithContext(
    args: any,
    client: AxiosInstance,
    cache: AppCache,
    authToken: string | undefined
  ): Promise<string> {
    const apps = await this.getAppsWithContext(client, cache, authToken);
    return resolveAppIdentifier(args, apps);
  }

  async run(transportType: 'stdio' | 'http' = 'stdio', httpConfig?: HttpConfig) {
    // Track transport type with analytics
    analytics.trackTransport(transportType);
    analytics.trackSession('begin');

    if (transportType === 'http') {
      const port = httpConfig?.port || 3101;
      const hostname = httpConfig?.hostname || 'localhost';
      // Note: was `httpConfig?.cors || true` which always evaluates to true
      // (|| treats `false` as falsy). Switch to nullish-coalescing so
      // `--no-cors` actually disables CORS.
      const corsEnabled = httpConfig?.cors ?? true;

      // CORS allowlist: defaults to "*" for backward compatibility, but
      // operators running the MCP server behind a browser-facing origin
      // should set COUNTLY_CORS_ALLOWED_ORIGINS to a specific comma-
      // separated list (e.g. "https://my-app.example.com").
      const corsAllowed = parseCorsAllowed(process.env.COUNTLY_CORS_ALLOWED_ORIGINS);

      // Rate limiter for /mcp endpoint. Defaults to 120 req/min per IP.
      // Tunable via COUNTLY_RATE_LIMIT_RPM=<number> or 0 to disable.
      const rateLimitRpm = process.env.COUNTLY_RATE_LIMIT_RPM !== undefined
        ? Math.max(0, parseInt(process.env.COUNTLY_RATE_LIMIT_RPM, 10) || 0)
        : 120;
      const rateLimiter = rateLimitRpm > 0
        ? new RateLimiter({ windowMs: 60_000, maxRequests: rateLimitRpm })
        : null;
      const trustProxy = (process.env.COUNTLY_TRUST_PROXY || '').toLowerCase() === 'true';

      // Max request body bytes. Defaults to 1 MiB (MCP JSON-RPC bodies are
      // typically a few KB). Configurable via COUNTLY_MAX_BODY_BYTES.
      const maxBodyBytes = process.env.COUNTLY_MAX_BODY_BYTES !== undefined
        ? Math.max(0, parseInt(process.env.COUNTLY_MAX_BODY_BYTES, 10) || 0)
        : 1024 * 1024;

      // Concurrent-connection ceiling per IP. Defaults to 50. 0 disables.
      // Tunable via COUNTLY_MAX_CONCURRENT_PER_IP.
      const maxConcurrentPerIp = process.env.COUNTLY_MAX_CONCURRENT_PER_IP !== undefined
        ? Math.max(0, parseInt(process.env.COUNTLY_MAX_CONCURRENT_PER_IP, 10) || 0)
        : 50;
      const concurrencyLimiter = maxConcurrentPerIp > 0
        ? new ConcurrencyLimiter(maxConcurrentPerIp)
        : null;

      // Opt-in structured NDJSON request log. Set COUNTLY_REQUEST_LOG=true
      // (or "ndjson") to enable. Output goes to stderr.
      const requestLogEnabled = ['true', 'ndjson', '1'].includes(
        (process.env.COUNTLY_REQUEST_LOG || '').toLowerCase()
      );

      // MCP server only responds to /mcp endpoint - other endpoints are available for other applications
      const mcpEndpoint = '/mcp';
      
      console.error(`Starting Countly MCP server on HTTP at http://${hostname}:${port}${mcpEndpoint}`);
      console.error(`MCP server will ONLY handle requests to: ${mcpEndpoint}`);
      console.error(`Health check available at: /health`);
      console.error(`All other endpoints are available for other applications on this server`);
      
      // Create a single StreamableHTTPServerTransport instance in stateless mode
      // Stateless mode (sessionIdGenerator: undefined) allows clients to manage their own sessions
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
      });
      
      await this.server.connect(transport);
      
      const httpServer = http.createServer((req, res) => {
        // Per-request wall-clock for the request log emitted at the bottom
        // of this handler (when COUNTLY_REQUEST_LOG is on).
        const reqStart = Date.now();
        let rateLimitHit = false;

        const writeRequestLog = (): void => {
          if (!requestLogEnabled) {
            return;
          }
          const clientIp = extractClientIp(req.headers, req.socket.remoteAddress, trustProxy);
          const parsed = url.parse(req.url || '', true);
          console.error(formatRequestLog({
            ts: new Date().toISOString(),
            ip: clientIp,
            method: req.method || 'UNKNOWN',
            path: parsed.pathname || '',
            status: res.statusCode,
            durationMs: Date.now() - reqStart,
            rateLimitHit,
          }));
        };
        res.on('finish', writeRequestLog);
        res.on('close', () => {
          if (!res.writableFinished) {
            writeRequestLog();
          }
        });

        void (async () => {
        // Handle CORS for MCP and health endpoints only. Allowlist is
        // configured via COUNTLY_CORS_ALLOWED_ORIGINS; see parseCorsAllowed.
        if (corsEnabled) {
          const parsedUrl = url.parse(req.url || '', true);
          const pathname = parsedUrl.pathname;

          if (pathname === mcpEndpoint || pathname === '/health' || pathname === '/.well-known/mcp-manifest.json') {
            const requestOrigin = (req.headers.origin as string | undefined);
            const allowOrigin = resolveCorsOrigin(corsAllowed, requestOrigin);
            if (allowOrigin !== null) {
              res.setHeader('Access-Control-Allow-Origin', allowOrigin);
              // When we echo a specific origin (not "*"), browsers require
              // Vary: Origin so caches don't serve the response to another
              // origin. See MDN on CORS + caching.
              if (allowOrigin !== '*') {
                res.setHeader('Vary', 'Origin');
              }
              res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
              res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Countly-Auth-Token, X-Countly-Server-Url');

              if (req.method === 'OPTIONS') {
                res.writeHead(200);
                res.end();
                return;
              }
            } else if (req.method === 'OPTIONS') {
              // Pre-flight from a disallowed origin — refuse cleanly.
              res.writeHead(403);
              res.end();
              return;
            }
          }
        }
        
        const parsedUrl = url.parse(req.url || '', true);
        const pathname = parsedUrl.pathname;
        
        // Simple health check endpoint for Docker/monitoring
        if (pathname === '/health') {
          analytics.trackHttpRequest('/health', req.method || 'GET');
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ 
            status: 'healthy',
            timestamp: new Date().toISOString()
          }));
          return;
        }
        
        // MCP manifest discovery endpoint
        if (pathname === '/.well-known/mcp-manifest.json') {
          analytics.trackHttpRequest('/.well-known/mcp-manifest.json', req.method || 'GET');
          res.writeHead(200, { 'Content-Type': 'application/json' });
          
          // Get filtered tools based on configuration
          const filteredTools = filterTools(getAllToolDefinitions(), this.toolsConfig);
          const prompts = listPrompts();
          
          const manifest = {
            name: 'countly-mcp-server',
            version: PACKAGE_VERSION,
            description: 'Model Context Protocol server for Countly Analytics Platform',
            protocol: {
              version: '2025-06-18',
              name: 'Model Context Protocol'
            },
            endpoints: {
              mcp: mcpEndpoint,
              health: '/health',
              manifest: '/.well-known/mcp-manifest.json'
            },
            transports: ['stdio', 'http-sse'],
            capabilities: {
              tools: {
                count: filteredTools.length,
                categories: [...new Set(filteredTools.map((t: { name: string }) => t.name.split('_')[0]))].length,
                listChanged: true
              },
              resources: {
                supported: true,
                subscribe: false,
                listChanged: false,
                types: ['app-config', 'event-schemas', 'analytics-overview'],
                uri_scheme: 'countly://'
              },
              prompts: {
                supported: true,
                count: prompts.length,
                listChanged: false,
                templates: prompts.map(p => p.name)
              },
              features: [
                'analytics',
                'crash-analytics',
                'app-management',
                'user-management',
                'events',
                'views',
                'dashboards',
                'alerts',
                'hooks',
                'database-operations',
                'resources',
                'prompts'
              ]
            },
            authentication: {
              methods: [
                'environment-variables',
                'http-headers',
                'url-parameters',
                'token-file'
              ],
              required: true
            },
            documentation: {
              readme: 'https://github.com/countly/countly-mcp-server/blob/main/README.md',
              tools: 'https://github.com/countly/countly-mcp-server/blob/main/TOOLS_CONFIGURATION.md',
              contributing: 'https://github.com/countly/countly-mcp-server/blob/main/CONTRIBUTING.md'
            },
            repository: {
              type: 'git',
              url: 'https://github.com/countly/countly-mcp-server'
            },
            license: 'MIT',
            vendor: 'Countly',
            homepage: 'https://count.ly'
          };
          
          res.end(JSON.stringify(manifest, null, 2));
          return;
        }
        
        // MCP endpoint - ONLY endpoint that handles MCP protocol requests
        if (pathname === mcpEndpoint) {
          analytics.trackHttpRequest(mcpEndpoint, req.method || 'POST');

          // Per-IP rate limiting. Configurable via COUNTLY_RATE_LIMIT_RPM
          // (default 120 requests per minute). Set to 0 to disable. IP is
          // taken from the socket unless COUNTLY_TRUST_PROXY=true, in which
          // case we honor X-Forwarded-For.
          if (rateLimiter) {
            const clientIp = extractClientIp(req.headers, req.socket.remoteAddress, trustProxy);
            const result = rateLimiter.check(clientIp);
            if (!result.ok) {
              rateLimitHit = true;
              res.writeHead(429, {
                'Content-Type': 'application/json',
                'Retry-After': String(result.retryAfterSeconds),
              });
              res.end(JSON.stringify({
                error: 'Rate limit exceeded',
                retry_after_seconds: result.retryAfterSeconds,
              }));
              return;
            }
          }

          // Enforce the body-size limit. Checks Content-Length upfront and
          // streams-counts any subsequent chunks. If the limit is exceeded
          // we respond 413 Payload Too Large and destroy the socket so a
          // malicious client can't keep dumping bytes. 0 disables the check.
          if (maxBodyBytes > 0) {
            const ok = enforceBodySizeLimit(req, res, maxBodyBytes);
            if (!ok) {
              return;
            }
          }

          // Check for configuration in custom headers (secure way, recommended)
          const headerServerUrl = req.headers['x-countly-server-url'] as string;
          const headerAuthToken = req.headers['x-countly-auth-token'] as string;
          
          // Also check URL parameters (alternative method)
          const urlParams = new URL(req.url || '', `http://${req.headers.host}`).searchParams;
          const paramServerUrl = urlParams.get('server_url') || urlParams.get('serverUrl');
          const paramAuthToken = urlParams.get('auth_token') || urlParams.get('authToken');
          
          // Priority: Headers > URL parameters
          const serverUrl = headerServerUrl || paramServerUrl;
          const authToken = headerAuthToken || paramAuthToken;
          
          // Build per-request state. Instead of mutating `this.config` and
          // `this.httpClient.defaults` (which would be shared across
          // concurrent tenants and race), stash state in AsyncLocalStorage
          // and let the MCP handlers pull their per-request axios client out
          // of the registry keyed by token.
          let effectiveServerUrl = this.config.serverUrl;
          if (serverUrl) {
            // Remove trailing slashes safely without regex
            let cleanUrl = serverUrl;
            while (cleanUrl.endsWith('/')) {
              cleanUrl = cleanUrl.slice(0, -1);
            }
            // SSRF guard: the serverUrl is caller-controlled over HTTP, so
            // reject private/loopback/link-local targets (including cloud
            // metadata endpoints like 169.254.169.254) before using it.
            try {
              assertSafeServerUrl(cleanUrl);
            } catch (err) {
              // Sanitize before logging — the URL came from an HTTP
              // header, so it's under attacker control and could carry
              // newlines / ANSI escapes used for log injection (CWE-117).
              const rawMsg = err instanceof Error ? err.message : String(err);
              console.error(`Rejected serverUrl override: ${sanitizeForLog(rawMsg)}`);
              // Respond with a constant generic message instead of echoing
              // the error detail (which embeds the caller's URL). Keeps
              // the server-side log useful for debugging while denying
              // log-injection / information-leak downstream.
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({
                error: 'Invalid server_url',
                message: 'The provided Countly server URL was rejected. It must be an http(s) URL that does not target loopback, private, link-local, or cloud-metadata addresses.',
              }));
              return;
            }
            effectiveServerUrl = cleanUrl;
            const source = headerServerUrl ? 'headers' : 'URL parameters';
            console.error(`Using Countly server from ${source}:`, sanitizeForLog(effectiveServerUrl));
          }

          if (authToken) {
            const source = headerAuthToken ? 'headers' : 'URL parameters';
            // `source` is one of two hard-coded strings — no log-injection
            // risk here. Leave as-is.
            console.error(`Auth token configured from ${source}`);
            if (!headerAuthToken && paramAuthToken) {
              this.warnTokenInUrl();
            }
          }

          // Run the MCP SDK handler inside an AsyncLocalStorage scope so the
          // CallTool / resource handlers (which execute across await points)
          // can read the per-request auth token + serverUrl without any
          // shared-state mutation. This closes the cross-tenant token-mixing
          // window previously present in the HTTP transport.
          await this.requestContext.run(
            { authToken: authToken || undefined, serverUrl: effectiveServerUrl },
            async () => {
              await transport.handleRequest(req, res);
            }
          );
          return;
        }
        
        // Root page - show welcome guide
        if (pathname === '/') {
          analytics.trackView('welcome_page');
          analytics.trackHttpRequest('/', req.method || 'GET');
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Countly MCP Server</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
      background: white;
      min-height: 100vh;
      color: #2d3748;
    }
    .container {
      max-width: 100%;
      margin: 0;
      background: white;
    }
    .top-bar {
      background: white;
      padding: 12px 20px;
      border-bottom: 1px solid #e2e8f0;
    }
    .top-bar-content {
      max-width: 1200px;
      margin: 0 auto;
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 15px;
    }
    .top-bar-logo {
      display: flex;
      align-items: center;
      gap: 10px;
      color: #1a202c;
      font-weight: 700;
      font-size: 18px;
      text-decoration: none;
    }
    .top-bar-logo:hover {
      color: #1ea45c;
    }
    .top-bar-nav {
      display: flex;
      gap: 25px;
      align-items: center;
      flex-wrap: wrap;
    }
    .top-bar-link {
      color: #4a5568;
      text-decoration: none;
      font-size: 14px;
      font-weight: 500;
      transition: color 0.2s ease;
      display: flex;
      align-items: center;
      gap: 5px;
    }
    .top-bar-link:hover {
      color: #1ea45c;
    }
    .header {
      background: white;
      color: #1a202c;
      padding: 80px 20px;
      text-align: center;
      border-bottom: 1px solid #e2e8f0;
    }
    .header-content {
      max-width: 1200px;
      margin: 0 auto;
    }
    .header h1 {
      font-size: 42px;
      font-weight: 700;
      margin-bottom: 16px;
      letter-spacing: -0.5px;
      color: #1a202c;
    }
    .header p {
      font-size: 18px;
      color: #4a5568;
      max-width: 700px;
      margin: 0 auto;
      line-height: 1.6;
    }
    .header-cta {
      margin-top: 30px;
      display: flex;
      gap: 15px;
      justify-content: center;
      flex-wrap: wrap;
    }
    .cta-button {
      display: inline-block;
      padding: 14px 30px;
      background: #1ea45c;
      color: white;
      text-decoration: none;
      border-radius: 6px;
      font-weight: 600;
      font-size: 16px;
      transition: all 0.2s ease;
    }
    .cta-button:hover {
      background: #178f4d;
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(30, 164, 92, 0.3);
    }
    .cta-button-secondary {
      background: white;
      color: #1ea45c;
      border: 2px solid #1ea45c;
    }
    .cta-button-secondary:hover {
      background: #f7fafc;
    }
    .header h1 {
      font-size: 42px;
      font-weight: 700;
      margin-bottom: 16px;
      letter-spacing: -0.5px;
    }
    .header p {
      font-size: 18px;
      opacity: 0.95;
      max-width: 600px;
      margin: 0 auto;
      line-height: 1.6;
    }
    .content {
      padding: 80px 20px;
      max-width: 1200px;
      margin: 0 auto;
    }
    .status {
      background: #1ea45c;
      color: white;
      padding: 20px 30px;
      border-radius: 12px;
      margin-bottom: 60px;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 12px;
      font-size: 16px;
      font-weight: 600;
    }
    .status::before {
      content: "✓";
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 28px;
      height: 28px;
      background: rgba(255, 255, 255, 0.3);
      border-radius: 50%;
      font-size: 18px;
      font-weight: bold;
    }
    h2 {
      color: #1a202c;
      font-size: 32px;
      font-weight: 700;
      margin: 80px 0 40px 0;
      text-align: center;
    }
    h2:first-of-type {
      margin-top: 0;
    }
    h3 {
      color: #2d3748;
      font-size: 22px;
      font-weight: 600;
      margin: 50px 0 20px 0;
    }
    .section {
      margin-bottom: 80px;
    }
    .section-alt {
      background: #f8f9fa;
      margin: 0 -20px;
      padding: 80px 20px;
    }
    .section-content {
      max-width: 1200px;
      margin: 0 auto;
    }
    .endpoint-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
      gap: 30px;
      margin: 40px 0;
    }
    .endpoint-card {
      background: white;
      border: 2px solid #e2e8f0;
      padding: 35px;
      border-radius: 12px;
      transition: all 0.3s ease;
    }
    .endpoint-card:hover {
      transform: translateY(-6px);
      box-shadow: 0 12px 30px rgba(30, 164, 92, 0.15);
      border-color: #1ea45c;
    }
    .endpoint-card strong {
      display: block;
      color: #1ea45c;
      font-size: 18px;
      margin-bottom: 8px;
      font-family: 'Courier New', monospace;
    }
    .endpoint-card p {
      color: #4a5568;
      font-size: 14px;
      line-height: 1.6;
      margin: 0;
    }
    .badge {
      display: inline-block;
      padding: 4px 12px;
      background: #1ea45c;
      color: white;
      border-radius: 20px;
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-left: 8px;
    }
    .example-box {
      background: #1a202c;
      color: #e2e8f0;
      padding: 25px;
      border-radius: 12px;
      margin: 20px 0;
      overflow-x: auto;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
    }
    .example-box pre {
      margin: 0;
      font-family: 'Courier New', Monaco, monospace;
      font-size: 13px;
      line-height: 1.6;
      color: #a0aec0;
    }
    .example-box .key {
      color: #1ea45c;
    }
    .example-box .string {
      color: #68d391;
    }
    .example-box .comment {
      color: #718096;
    }
    .tools-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 25px;
      margin: 40px 0;
    }
    .tool-item {
      background: white;
      border: 2px solid #e2e8f0;
      padding: 30px;
      border-radius: 10px;
      transition: all 0.2s ease;
    }
    .tool-item:hover {
      border-color: #1ea45c;
      background: #f7fafc;
    }
    .tool-item strong {
      display: block;
      color: #1ea45c;
      font-size: 16px;
      margin-bottom: 6px;
    }
    .tool-item p {
      color: #4a5568;
      font-size: 13px;
      line-height: 1.5;
      margin: 0;
    }
    .docs-links {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 20px;
      margin: 40px 0;
    }
    .doc-link {
      display: block;
      padding: 25px;
      background: white;
      border: 2px solid #e2e8f0;
      border-radius: 10px;
      color: #1ea45c;
      text-decoration: none;
      font-weight: 600;
      transition: all 0.2s ease;
      text-align: center;
      font-size: 16px;
    }
    .doc-link:hover {
      background: #1ea45c;
      color: white;
      transform: translateY(-4px);
      box-shadow: 0 8px 20px rgba(30, 164, 92, 0.25);
      border-color: #1ea45c;
    }
    .config-list {
      background: #f7fafc;
      border-left: 4px solid #1ea45c;
      padding: 25px;
      border-radius: 8px;
      margin: 20px 0;
    }
    .config-list ul {
      list-style: none;
      margin: 0;
      padding: 0;
    }
    .config-list li {
      padding: 10px 0;
      color: #2d3748;
      font-size: 15px;
      display: flex;
      align-items: flex-start;
      gap: 10px;
    }
    .config-list li::before {
      content: "→";
      color: #1ea45c;
      font-weight: bold;
      font-size: 18px;
      flex-shrink: 0;
    }
    .config-list code {
      background: #e2e8f0;
      padding: 3px 8px;
      border-radius: 4px;
      font-family: 'Courier New', monospace;
      font-size: 13px;
      color: #1ea45c;
    }
    .footer {
      background: #1a202c;
      color: white;
      padding: 40px 20px;
      text-align: center;
    }
    .footer-content {
      max-width: 1200px;
      margin: 0 auto;
    }
    .footer p {
      color: #a0aec0;
      font-size: 14px;
      margin: 8px 0;
    }
    .footer code {
      background: rgba(255, 255, 255, 0.1);
      padding: 4px 8px;
      border-radius: 4px;
      font-family: 'Courier New', monospace;
      color: #68d391;
    }
    @media (max-width: 768px) {
      .top-bar-content {
        flex-direction: column;
        align-items: flex-start;
      }
      .top-bar-nav {
        width: 100%;
        flex-direction: column;
        gap: 12px;
      }
      .header {
        padding: 50px 20px;
      }
      .header h1 {
        font-size: 28px;
      }
      .header p {
        font-size: 16px;
      }
      .header-cta {
        flex-direction: column;
      }
      .cta-button {
        width: 100%;
      }
      .content {
        padding: 50px 20px;
      }
      h2 {
        font-size: 26px;
        margin: 50px 0 30px 0;
      }
      .section-alt {
        margin: 0 -20px;
        padding: 50px 20px;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="top-bar">
      <div class="top-bar-content">
        <a href="https://countly.com" class="top-bar-logo" target="_blank">
          <span>⚡</span> Countly MCP Server
        </a>
        <nav class="top-bar-nav">
          <a href="https://countly.com/" class="top-bar-link" target="_blank">About Countly</a>
          <a href="https://github.com/Countly/countly-server" class="top-bar-link" target="_blank">Countly Server</a>
          <a href="https://github.com/Countly/countly-mcp-server" class="top-bar-link" target="_blank">Countly MCP Server</a>
          <a href="https://support.countly.com/hc/en-us" class="top-bar-link" target="_blank">Read Documentation</a>
          <a href="/health" class="top-bar-link">💚 Health</a>
        </nav>
      </div>
    </div>

    <div class="header">
      <div class="header-content">
        <h1>Model Context Protocol Server</h1>
        <p>Connect your AI assistants to Countly's powerful analytics platform. Access real-time data, manage applications, and analyze user behavior through the Model Context Protocol.</p>
        <div class="header-cta">
          <a href="https://github.com/Countly/countly-mcp-server" class="cta-button" target="_blank">View on GitHub</a>
          <a href="https://support.count.ly" class="cta-button cta-button-secondary" target="_blank">Read Documentation</a>
        </div>
      </div>
    </div>

    <div class="content">
      <div class="status">
        Server is running and ready to accept connections
      </div>

      <div class="section">
        <h2>📡 Available Endpoints</h2>
        
        <div class="endpoint-grid">
          <div class="endpoint-card">
            <strong>${mcpEndpoint}</strong>
            <span class="badge">MCP Protocol</span>
            <p>Model Context Protocol endpoint for AI assistants and MCP clients</p>
          </div>
          
          <div class="endpoint-card">
            <strong>/health</strong>
            <span class="badge">Health Check</span>
            <p>Monitoring endpoint for Docker health checks and uptime verification</p>
          </div>
          
          <div class="endpoint-card">
            <strong>/.well-known/mcp-manifest.json</strong>
            <span class="badge">Discovery</span>
            <p>Server capabilities manifest for automated discovery and configuration</p>
          </div>
        </div>
      </div>
    </div>

    <div class="section-alt">
      <div class="section-content">
        <h2>🔌 Connection Methods</h2>

        <h3>VS Code Integration (Recommended)</h3>
        <p>Add this configuration to your VS Code <code>settings.json</code>:</p>
        <div class="example-box">
        <pre>{
  <span class="key">"mcp.servers"</span>: {
    <span class="key">"countly"</span>: {
      <span class="key">"type"</span>: <span class="string">"stdio"</span>,
      <span class="key">"command"</span>: <span class="string">"npx"</span>,
      <span class="key">"args"</span>: [<span class="string">"-y"</span>, <span class="string">"@countly/countly-mcp-server"</span>],
      <span class="key">"env"</span>: {
        <span class="key">"COUNTLY_SERVER_URL"</span>: <span class="string">"https://your-server.count.ly"</span>,
        <span class="key">"COUNTLY_AUTH_TOKEN"</span>: <span class="string">"your-api-key"</span>
      }
    }
  }
}</pre>
      </div>

      <h3>Claude Desktop Integration</h3>
      <p>Configure Claude Desktop to connect with Countly:</p>
      <div class="example-box">
        <pre>{
  <span class="key">"mcpServers"</span>: {
    <span class="key">"countly"</span>: {
      <span class="key">"command"</span>: <span class="string">"npx"</span>,
      <span class="key">"args"</span>: [<span class="string">"-y"</span>, <span class="string">"@countly/countly-mcp-server"</span>],
      <span class="key">"env"</span>: {
        <span class="key">"COUNTLY_SERVER_URL"</span>: <span class="string">"https://your-server.count.ly"</span>,
        <span class="key">"COUNTLY_AUTH_TOKEN"</span>: <span class="string">"your-api-key"</span>
      }
    }
  }
}</pre>
      </div>

      <h3>HTTP/SSE Connection</h3>
      <p>Connect via HTTP with custom headers (recommended):</p>
      <div class="example-box">
        <pre><span class="key">POST</span> ${mcpEndpoint}
<span class="key">X-Countly-Server-Url:</span> <span class="string">https://your-server.count.ly</span>
<span class="key">X-Countly-Auth-Token:</span> <span class="string">your-api-key</span>
<span class="key">Content-Type:</span> <span class="string">application/json</span></pre>
      </div>

      <p>Or use URL parameters:</p>
      <div class="example-box">
        <pre><span class="key">POST</span> ${mcpEndpoint}?server_url=https://your-server.count.ly&auth_token=your-api-key
<span class="key">Content-Type:</span> <span class="string">application/json</span></pre>
      </div>
      </div>
    </div>

    <div class="content">
      <div class="section">
        <h2>🛠️ Available Analytics Tools</h2>
        
        <div class="tools-grid">
        <div class="tool-item">
          <strong>📊 Analytics</strong>
          <p>Sessions, users, events, locations, carriers, and device data</p>
        </div>
        <div class="tool-item">
          <strong>💥 Crash Analytics</strong>
          <p>Crash reports, statistics, and error tracking</p>
        </div>
        <div class="tool-item">
          <strong>📱 App Management</strong>
          <p>Create and manage applications</p>
        </div>
        <div class="tool-item">
          <strong>👥 User Management</strong>
          <p>Dashboard users and permissions</p>
        </div>
        <div class="tool-item">
          <strong>🔔 Alerts</strong>
          <p>Configure and manage alert rules</p>
        </div>
        <div class="tool-item">
          <strong>🎯 Events</strong>
          <p>Query and analyze custom events</p>
        </div>
        <div class="tool-item">
          <strong>👁️ Views</strong>
          <p>Page and screen analytics</p>
        </div>
        <div class="tool-item">
          <strong>📝 Notes</strong>
          <p>Create and manage annotations</p>
        </div>
        <div class="tool-item">
          <strong>🗄️ Database</strong>
          <p>Execute database queries</p>
        </div>
      </div>
      </div>

      <div class="section">
        <h2>🔧 Configuration Options</h2>
        
        <div class="config-list">
        <ul>
          <li><strong>Environment Variables:</strong> <code>COUNTLY_SERVER_URL</code>, <code>COUNTLY_AUTH_TOKEN</code></li>
          <li><strong>HTTP Headers:</strong> <code>X-Countly-Server-Url</code>, <code>X-Countly-Auth-Token</code></li>
          <li><strong>URL Parameters:</strong> <code>?server_url=...&auth_token=...</code></li>
          <li><strong>Configuration File:</strong> <code>countly_token.txt</code> for authentication</li>
        </ul>
      </div>
      </div>

      <div class="section">
        <h2>📚 Documentation & Resources</h2>
        
        <div class="docs-links">
        <a class="doc-link" href="https://github.com/Countly/countly-mcp-server" target="_blank">📦 GitHub</a>
        <a class="doc-link" href="https://www.npmjs.com/package/@countly/countly-mcp-server" target="_blank">📦 npm Package</a>
        <a class="doc-link" href="https://support.count.ly" target="_blank">📖 Documentation</a>
        <a class="doc-link" href="https://countly.com" target="_blank">🌐 Countly.com</a>
      </div>
      </div>
    </div>

    <div class="footer">
      <div class="footer-content">
        <p>Server started: <code>${new Date().toISOString()}</code></p>
        <p style="margin-top: 10px;">© ${new Date().getFullYear()} Countly — Privacy-focused digital analytics</p>
      </div>
    </div>
  </div>
</body>
</html>`);
          return;
        }
        
        // All other endpoints - return 404 with helpful message
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ 
          error: 'Not Found',
          message: 'This server only handles MCP protocol requests',
          availableEndpoints: {
            root: '/',
            mcp: mcpEndpoint,
            health: '/health',
            manifest: '/.well-known/mcp-manifest.json'
          },
          hint: 'Visit / in your browser for connection instructions'
        }));
        })().catch(error => {
          console.error('Error handling request:', error);
          if (!res.headersSent) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Internal server error' }));
          }
        });
      });
      
      // Slow-loris / resource-exhaustion defenses. Node's defaults leave the
      // server wide open: sockets can sit idle forever, and a single client
      // can open thousands of connections. We set conservative timeouts and
      // a per-IP concurrent-connection ceiling.
      //
      //   requestTimeout   max time from first byte to full request  (30s)
      //   headersTimeout   max time to receive headers                (10s)
      //   keepAliveTimeout close idle kept-alive connections          (5s)
      //   timeout          socket inactivity                          (60s)
      httpServer.requestTimeout = 30_000;
      httpServer.headersTimeout = 10_000;
      httpServer.keepAliveTimeout = 5_000;
      httpServer.timeout = 60_000;

      if (concurrencyLimiter) {
        httpServer.on('connection', (socket) => {
          const ip = socket.remoteAddress ?? 'unknown';
          if (!concurrencyLimiter.accept(ip)) {
            // Too many open connections for this IP. Kill immediately —
            // don't let them consume a file descriptor or TLS handshake.
            socket.destroy();
            return;
          }
          socket.once('close', () => concurrencyLimiter.release(ip));
        });
      }

      httpServer.listen(port, hostname, () => {
        console.error(`✅ Countly MCP server running on HTTP at http://${hostname}:${port}${mcpEndpoint}`);
        console.error(`✅ Health check available at: http://${hostname}:${port}/health`);
        console.error(`ℹ️  Other endpoints (not ${mcpEndpoint} or /health) are available for other applications`);
      });
      
      // Graceful shutdown
      process.on('SIGTERM', () => {
        console.error('Received SIGTERM, shutting down gracefully...');
        analytics.trackSession('end');
        analytics.flush();
        httpServer.close(() => {
          console.error('HTTP server closed.');
          process.exit(0);
        });
      });
      
      process.on('SIGINT', () => {
        console.error('Received SIGINT, shutting down gracefully...');
        analytics.trackSession('end');
        analytics.flush();
        httpServer.close(() => {
          console.error('HTTP server closed.');
          process.exit(0);
        });
      });
      
    } else {
      // Default stdio transport
      const transport = new StdioServerTransport();
      await this.server.connect(transport);
      console.error('Countly MCP server running on stdio');
    }
  }
}

// Export the class for testing
export { CountlyMCPServer };

// Run the server only if this file is executed directly (not imported).
// We resolve argv[1] via realpathSync so this works when invoked through
// a `bin` symlink (e.g. `npx countly-mcp-server`), where process.argv[1]
// points at the symlink in node_modules/.bin while import.meta.url resolves
// to the real build/index.js path.
const isMainModule = (() => {
  try {
    return import.meta.url === url.pathToFileURL(realpathSync(process.argv[1])).href;
  } catch {
    return false;
  }
})();

if (isMainModule) {
  const server = new CountlyMCPServer();

  // Parse command line arguments
  const args = process.argv.slice(2);
  const transportType = args.includes('--http') ? 'http' : 'stdio';

  if (transportType === 'http') {
    const portIndex = args.findIndex(arg => arg === '--port');
    const hostnameIndex = args.findIndex(arg => arg === '--hostname');
    const corsDisabled = args.includes('--no-cors');
    
    const httpConfig: HttpConfig = {
      port: portIndex !== -1 && args[portIndex + 1] ? parseInt(args[portIndex + 1]) : 3101,
      hostname: hostnameIndex !== -1 && args[hostnameIndex + 1] ? args[hostnameIndex + 1] : 'localhost',
      cors: !corsDisabled
    };
    
    server.run('http', httpConfig).catch(console.error);
  } else {
    server.run().catch(console.error);
  }
}
