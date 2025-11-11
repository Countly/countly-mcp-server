# HTTP/SSE Connection Example

This example shows how to connect to Countly MCP Server using HTTP with Server-Sent Events (SSE) transport.

## Starting the Server in HTTP Mode

```bash
cd /path/to/countly-mcp-server

# Method 1: Using npm
npm start

# Method 2: Direct node command
node build/index.js --http --port 3000 --hostname localhost

# Method 3: With custom configuration
node build/index.js --http --port 8080 --hostname 0.0.0.0
```

Server will be available at:
- **MCP Endpoint**: `http://localhost:3000/mcp`
- **Health Check**: `http://localhost:3000/health`

## Testing the Connection

### 1. Health Check

```bash
curl http://localhost:3000/health
```

Expected response:
```json
{
  "status": "healthy",
  "timestamp": "2025-10-10T12:00:00.000Z"
}
```

### 2. MCP Protocol Connection

The `/mcp` endpoint uses Server-Sent Events (SSE) for real-time bidirectional communication.

**Note**: Direct curl testing of SSE/MCP endpoints is complex. Use an MCP client library instead.

## Using with MCP Client Libraries

### Python Client Example

```python
import asyncio
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

async def main():
    # For HTTP/SSE connection, use appropriate transport
    server_params = {
        "url": "http://localhost:3000/mcp",
        "headers": {
            # Auth can be passed via headers if needed
        }
    }
    
    async with stdio_client(server_params) as (read, write):
        async with ClientSession(read, write) as session:
            # Initialize
            await session.initialize()
            
            # List available tools
            tools = await session.list_tools()
            print("Available tools:", tools)
            
            # Call a tool
            result = await session.call_tool("list_apps", {})
            print("Apps:", result)

if __name__ == "__main__":
    asyncio.run(main())
```

### JavaScript/TypeScript Client Example

```typescript
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';

async function main() {
  const transport = new SSEClientTransport(
    new URL('http://localhost:3000/mcp')
  );
  
  const client = new Client({
    name: 'countly-test-client',
    version: '1.0.0',
  }, {
    capabilities: {}
  });

  await client.connect(transport);
  
  // List tools
  const tools = await client.listTools();
  console.log('Available tools:', tools);
  
  // Call a tool
  const result = await client.callTool({
    name: 'list_apps',
    arguments: {}
  });
  console.log('Result:', result);
  
  await client.close();
}

main().catch(console.error);
```

## Using with HTTP Client (Advanced)

While not recommended for production, you can test basic connectivity:

### Check Available Endpoints

```bash
# 404 response shows available endpoints
curl http://localhost:3000/unknown
```

Response:
```json
{
  "error": "Not Found",
  "message": "This server only handles MCP protocol requests",
  "availableEndpoints": {
    "mcp": "/mcp",
    "health": "/health"
  },
  "info": "Other endpoints on this server are available for other applications"
}
```

## Docker HTTP Server

### Run in HTTP Mode

```bash
docker run -d \
  --name countly-mcp-http \
  -p 3000:3000 \
  -e COUNTLY_SERVER_URL=https://your-countly-instance.com \
  -e COUNTLY_AUTH_TOKEN=your-token-here \
  countly-mcp-server
```

### With docker-compose

```yaml
version: '3.8'

services:
  countly-mcp-server:
    image: countly-mcp-server
    ports:
      - "3000:3000"
    environment:
      - COUNTLY_SERVER_URL=https://your-countly-instance.com
      - COUNTLY_AUTH_TOKEN=your-token-here
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
```

## Nginx Reverse Proxy

For production deployments behind a reverse proxy:

```nginx
server {
    listen 80;
    server_name countly-mcp.yourdomain.com;

    location /mcp {
        proxy_pass http://localhost:3000/mcp;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # SSE specific settings
        proxy_buffering off;
        proxy_cache off;
        chunked_transfer_encoding off;
    }

    location /health {
        proxy_pass http://localhost:3000/health;
        proxy_set_header Host $host;
    }
}
```

## Apache Reverse Proxy

```apache
<VirtualHost *:80>
    ServerName countly-mcp.yourdomain.com

    ProxyPreserveHost On
    ProxyRequests Off

    # SSE/EventSource support
    ProxyPass /mcp http://localhost:3000/mcp keepalive=On
    ProxyPassReverse /mcp http://localhost:3000/mcp

    ProxyPass /health http://localhost:3000/health
    ProxyPassReverse /health http://localhost:3000/health

    # SSE specific headers
    RequestHeader set Connection ""
    Header set Cache-Control "no-cache"
</VirtualHost>
```

## Environment Variables

When running in HTTP mode, you can configure:

```bash
# Server configuration
export COUNTLY_SERVER_URL="https://your-countly-instance.com"
export COUNTLY_AUTH_TOKEN="your-token-here"
export COUNTLY_TIMEOUT="30000"

# Start server
node build/index.js --http --port 3000
```

## Security Considerations

### 1. Authentication

The server supports multiple authentication methods for HTTP connections:

**Method 1: HTTP Headers (Recommended - More Secure)**

```bash
# Pass credentials via custom headers
curl -X POST http://localhost:3000/mcp \
  -H "X-Countly-Server-Url: https://your-countly-instance.com" \
  -H "X-Countly-Auth-Token: your-token-here" \
  -H "Content-Type: application/json"
```

**Method 2: URL Parameters (Alternative - Less Secure)**

```bash
# Pass credentials via query string
curl -X POST "http://localhost:3000/mcp?server_url=https://your-countly-instance.com&auth_token=your-token-here" \
  -H "Content-Type: application/json"
```

**Method 3: Environment Variables**

```bash
# Set in environment
export COUNTLY_SERVER_URL="https://your-countly-instance.com"
export COUNTLY_AUTH_TOKEN="your-token"

# Or in metadata (client-specific)
# The client should pass token via MCP metadata
```

**Priority Order:** Headers > URL Parameters > Environment Variables

⚠️ **Security Note**: URL parameters are less secure than headers because:
- They may be logged in server access logs
- They appear in browser history
- They may be visible in monitoring tools
- Use headers when possible for production environments

### 2. HTTPS in Production

Always use HTTPS in production:

```bash
# Behind nginx with SSL
server {
    listen 443 ssl;
    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;
    
    location /mcp {
        proxy_pass http://localhost:3000/mcp;
        # ... other settings
    }
}
```

### 3. Firewall Rules

```bash
# Allow only specific IPs
sudo ufw allow from 192.168.1.0/24 to any port 3000

# Or use nginx/apache for IP filtering
```

## Monitoring

### Health Check Monitoring

```bash
# Simple ping
curl -f http://localhost:3000/health || echo "Server down"

# With timeout
timeout 5 curl -f http://localhost:3000/health
```

### Systemd Service

```ini
[Unit]
Description=Countly MCP Server
After=network.target

[Service]
Type=simple
User=countly
WorkingDirectory=/path/to/countly-mcp-server
Environment="COUNTLY_SERVER_URL=https://your-countly-instance.com"
Environment="COUNTLY_AUTH_TOKEN_FILE=/etc/countly-mcp/token.txt"
ExecStart=/usr/bin/node build/index.js --http --port 3000
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Enable and start:
```bash
sudo systemctl enable countly-mcp
sudo systemctl start countly-mcp
sudo systemctl status countly-mcp
```

## Troubleshooting

### Port Already in Use

```bash
# Find process using port 3000
lsof -i :3000

# Kill process
kill -9 <PID>

# Or use different port
node build/index.js --http --port 8080
```

### Connection Refused

```bash
# Check if server is running
curl http://localhost:3000/health

# Check firewall
sudo ufw status

# Check logs
node build/index.js --http  # Run in foreground to see logs
```

### SSE Connection Issues

1. Check browser console for errors
2. Verify CORS settings (enabled by default)
3. Check reverse proxy configuration
4. Verify no middleware is buffering responses

## Load Testing

```bash
# Using Apache Bench
ab -n 1000 -c 10 http://localhost:3000/health

# Using wrk
wrk -t4 -c100 -d30s http://localhost:3000/health
```

## Related Documentation

- [MCP Specification](https://modelcontextprotocol.io)
- [Server-Sent Events](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events)
- [Countly MCP Server README](../README.md)
- [Docker Deployment](../DOCKER.md)
