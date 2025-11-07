#!/usr/bin/env node

// Load environment variables from .env file (quiet mode for MCP stdio compatibility)
import dotenv from 'dotenv';
dotenv.config({ quiet: true });

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
  CallToolRequest,
} from '@modelcontextprotocol/sdk/types.js';
import axios, { AxiosInstance } from 'axios';
import http from 'http';
import url from 'url';
import { resolveAuthToken, requireAuthToken, createMissingAuthError } from './lib/auth.js';
import { buildConfig, normalizeServerUrl } from './lib/config.js';
import { AppCache, resolveAppIdentifier, type CountlyApp } from './lib/app-cache.js';
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

interface CountlyResponse<T = any> {
  result?: T;
  error?: string;
  [key: string]: any;
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
   * Priority: request metadata > arguments > environment variables > file
   * Uses lib/auth.ts resolveAuthToken function
   */
  private getCredentials(request?: CallToolRequest, args?: any): { authToken?: string } {
    const metadata = (request as any)?._meta || (request as any)?.meta;
    const authToken = resolveAuthToken({ metadata, args });
    
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
      let success = false;
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
        
        success = true;
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
      
      const httpServer = http.createServer((req, res) => {
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
          try {
            const transport = new SSEServerTransport(mcpEndpoint, res);
            this.server.connect(transport).catch((error) => {
              console.error('MCP transport connection error:', error);
              if (!res.headersSent) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'MCP connection failed' }));
              }
            });
          } catch (error) {
            console.error('MCP transport creation error:', error);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Failed to create MCP transport' }));
          }
          return;
        }
        
        // All other endpoints - return 404 with clear message that this is MCP server only
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ 
          error: 'Not Found',
          message: 'This server only handles MCP protocol requests',
          availableEndpoints: {
            mcp: mcpEndpoint,
            health: '/health'
          },
          info: 'Other endpoints on this server are available for other applications'
        }));
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
