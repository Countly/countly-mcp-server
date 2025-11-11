#!/usr/bin/env node

// Load environment variables from .env file (quiet mode for MCP stdio compatibility)
import dotenv from 'dotenv';

dotenv.config({ quiet: true });


import http from 'http';
import url from 'url';

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
  CallToolRequest,
} from '@modelcontextprotocol/sdk/types.js';
import axios, { AxiosInstance } from 'axios';

import { AppCache, resolveAppIdentifier, type CountlyApp } from './lib/app-cache.js';
import { resolveAuthToken, createMissingAuthError } from './lib/auth.js';
import { buildConfig } from './lib/config.js';
import { loadToolsConfig, filterTools, getConfigSummary, type ToolsConfig } from './lib/tools-config.js';
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

class CountlyMCPServer {
  private server: Server;
  private config: CountlyConfig;
  private httpClient: AxiosInstance;
  private appCache: AppCache;
  private toolsConfig: ToolsConfig;

  constructor(testMode: boolean = false) {
    this.appCache = new AppCache();
    this.toolsConfig = loadToolsConfig(process.env);
    
    // Log configuration on startup (only in non-test mode)
    if (!testMode) {
      console.error(getConfigSummary(this.toolsConfig));
    }
    
    this.server = new Server(
      {
        name: 'countly-mcp-server',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {
            listChanged: true,
          },
        },
      }
    );

    this.setupToolHandlers();
    
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
    
    // If not found in metadata/args, use the one already configured (from headers or environment)
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
      let originalAuthToken: string | undefined;

      try {
        // Extract credentials from request (client-side)
        const credentials = this.getCredentials(request, args);
        
        // Store the original auth token temporarily for this request
        originalAuthToken = this.config.authToken;
        
        // Set the auth token in config and as header
        if (credentials.authToken) {
          this.config.authToken = credentials.authToken;
          this.setAuthHeader(credentials.authToken);
        }

        // Create tool context
        const context: ToolContext = {
          resolveAppId: async (args: any) => await this.resolveAppIdentifier(args),
          getAuthParams: () => this.getAuthParams(),
          httpClient: this.httpClient,
          appCache: this.appCache,
          getApps: async () => await this.getApps(),
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
        const result = await instance[methodName](args);
        
        return result as any;
      } catch (error) {
        
        if (error instanceof McpError) {
          throw error;
        }
        throw new McpError(
          ErrorCode.InternalError,
          `Error executing tool ${name}: ${error instanceof Error ? error.message : String(error)}`
        );
      } finally {
        // Restore original auth token and header
        this.config.authToken = originalAuthToken;
        this.setAuthHeader(originalAuthToken);
      }
    });
  }

  // Helper Methods
  private getAuthParams(): {} {
    // Auth is now handled via headers, not query params
    return {};
  }

  private setAuthHeader(token?: string): void {
    if (token) {
      this.httpClient.defaults.headers.common['countly-token'] = token;
    } else {
      delete this.httpClient.defaults.headers.common['countly-token'];
    }
  }

  private async getApps(): Promise<CountlyApp[]> {
    // Check if cache is still valid
    if (!this.appCache.isExpired()) {
      return this.appCache.getAll();
    }

    const params = this.getAuthParams();
    const response = await this.httpClient.get('/o/apps/mine', { params });
    
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
    
    this.appCache.update(apps);
    return apps;
  }

  private async resolveAppId(args: any): Promise<string> {
    const apps = await this.getApps();
    return resolveAppIdentifier(args, apps);
  }

  private async resolveAppIdentifier(args: any): Promise<string> {
    const apps = await this.getApps();
    return resolveAppIdentifier(args, apps);
  }

  async run(transportType: 'stdio' | 'http' = 'stdio', httpConfig?: HttpConfig) {
    // Track transport type with analytics

    if (transportType === 'http') {
      const port = httpConfig?.port || 3101;
      const hostname = httpConfig?.hostname || 'localhost';
      const corsEnabled = httpConfig?.cors || true;
      
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
        void (async () => {
        // Handle CORS for MCP and health endpoints only
        if (corsEnabled) {
          const parsedUrl = url.parse(req.url || '', true);
          const pathname = parsedUrl.pathname;
          
          // Only set CORS headers for our endpoints
          if (pathname === mcpEndpoint || pathname === '/health') {
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
            res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
            
            if (req.method === 'OPTIONS') {
              res.writeHead(200);
              res.end();
              return;
            }
          }
        }
        
        const parsedUrl = url.parse(req.url || '', true);
        const pathname = parsedUrl.pathname;
        
        // Simple health check endpoint for Docker/monitoring
        if (pathname === '/health') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ 
            status: 'healthy',
            timestamp: new Date().toISOString()
          }));
          return;
        }
        
        // MCP endpoint - ONLY endpoint that handles MCP protocol requests
        if (pathname === mcpEndpoint) {
          // Check for configuration in custom headers (secure way)
          const headerServerUrl = req.headers['x-countly-server-url'] as string;
          const headerAuthToken = req.headers['x-countly-auth-token'] as string;
          
          if (headerServerUrl) {
            // Remove trailing slashes safely without regex
            let cleanUrl = headerServerUrl;
            while (cleanUrl.endsWith('/')) {
              cleanUrl = cleanUrl.slice(0, -1);
            }
            this.config.serverUrl = cleanUrl;
            this.httpClient.defaults.baseURL = this.config.serverUrl;
            console.error('Using Countly server from headers:', this.config.serverUrl);
          }
          
          if (headerAuthToken) {
            this.config.authToken = headerAuthToken;
            this.setAuthHeader(headerAuthToken);
            console.error('Auth token configured from headers');
          }
          
          // Handle with StreamableHTTPServerTransport (modern protocol)
          await transport.handleRequest(req, res);
          return;
        }
        
        // Root page - show welcome guide
        if (pathname === '/') {
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
      <p>Connect via HTTP with custom headers:</p>
      <div class="example-box">
        <pre><span class="key">POST</span> ${mcpEndpoint}
<span class="key">X-Countly-Server-Url:</span> <span class="string">https://your-server.count.ly</span>
<span class="key">X-Countly-Auth-Token:</span> <span class="string">your-api-key</span>
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
            health: '/health'
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
      
      httpServer.listen(port, hostname, () => {
        console.error(`✅ Countly MCP server running on HTTP at http://${hostname}:${port}${mcpEndpoint}`);
        console.error(`✅ Health check available at: http://${hostname}:${port}/health`);
        console.error(`ℹ️  Other endpoints (not ${mcpEndpoint} or /health) are available for other applications`);
      });
      
      // Graceful shutdown
      process.on('SIGTERM', () => {
        console.error('Received SIGTERM, shutting down gracefully...');
        httpServer.close(() => {
          console.error('HTTP server closed.');
          process.exit(0);
        });
      });
      
      process.on('SIGINT', () => {
        console.error('Received SIGINT, shutting down gracefully...');
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

// Run the server only if this file is executed directly (not imported)
if (import.meta.url === `file://${process.argv[1]}`) {
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
