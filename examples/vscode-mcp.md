# VS Code - MCP Configuration

This example shows how to configure VS Code's MCP support to connect to Countly MCP Server.

> **Note**: VS Code's MCP support is currently in preview/experimental phase. Make sure you have the latest version of VS Code Insiders or the MCP extension installed.

## Prerequisites

1. **VS Code** version 1.102. and higher
2. **Countly Server** where you collect your data

## Setup Instructions

### 1. Get your Countly auth token:
   - Log into your Countly dashboard
   - Go to My Profile → Token manager or navigate to https://your-countly-instance.com/dashboard#/manage/token_manager
   - Create your auth token with needed permissions, expiration and usage
   - Copy your created auth token

### 2. Build Countly MCP Server:
   ```bash
   cd /path/to/countly-mcp-server
   npm install
   npm run build
   ```

### 3. Configuring VS Code :
   - Open Command Palette (Ctrl+Shift+P / Cmd+Shift+P)
   - Search for "MCP Open User Configuration" (if you do not have one, your VSCode might be too old)
   - This should creare mcp.json file where you would provide server configuration

**Method 1: Connecting to local server pass both Countly Server URL and your auth token**

```json
{
  "servers": {
    "countly": {
      "type": "stdio",
      "command": "node",
      "args": [
        "/absolute/path/to/countly-mcp-server/build/index.js"
      ],
      "env": {
        "COUNTLY_SERVER_URL": "https://your-countly-instance.com",
        "COUNTLY_AUTH_TOKEN": "your-auth-token-here"
      }
    }
  },
  "inputs": []
}
```

**Method 2: Connecting to remote server pass your Countly Auth Token**

```json
{
  "servers": {
    "countly": {
      "type": "sse",
      "url": "http://localhost:3000/mcp",
      "metadata": {
        "countlyAuthToken": "your-auth-token-here"
      }
    }
  },
  "inputs": []
}
```

**Note**: The client can pass authentication via `metadata.countlyAuthToken`. The server will use this token to authenticate with your Countly instance.

**Method 3: Docker Container (stdio)**

```json
{
  "servers": {
    "countly": {
      "type": "stdio",
      "command": "docker",
      "args": [
        "run",
        "-i",
        "--rm",
        "-e", "COUNTLY_SERVER_URL=https://your-countly-instance.com",
        "-e", "COUNTLY_AUTH_TOKEN=your-auth-token-here",
        "countly-mcp-server",
        "node", "build/index.js"
      ]
    }
  },
  "inputs": []
}
```

- Replace `/absolute/path/to/countly-mcp-server` with your actual path
- Replace `https://your-countly-instance.com` with your Countly URL
- Replace `your-auth-token-here` with your actual token

**Workspace-Specific Configuration**
For project-specific configuration, create `.vscode/mcp.json` in your workspace:


### 4. Start MCP server in VS Code:
   - Use Command Palette → "MCP: Show Installed Servers"
   - It should open pane with countly MCP server
   - If it does not, restart your VS Code

## Using the MCP Server in VS Code

Once configured, you can use the Countly MCP server through:

### GitHub Copilot Chat
```
@countly list my apps
@countly show dashboard for MyApp
@countly get top events
```

### Language Model API
The server will be available to any VS Code extension using the Language Model API with MCP support.

## Verification

1. **Check MCP Status**:
   - Open Command Palette
   - Type "MCP: Show Status"
   - Verify "countly" server is listed and connected

2. **View Logs**:
   - Open Output panel (View → Output)
   - Select "MCP" from the dropdown
   - Check for connection messages

3. **Test Connection**:
   ```
   @countly Can you list my Countly applications?
   ```

## Troubleshooting

### Server Not Starting

1. Check VS Code Output logs (MCP channel)
2. Verify Node.js path:
   ```bash
   which node  # macOS/Linux
   where node  # Windows
   ```
3. Test the server manually:
   ```bash
   node /path/to/countly-mcp-server/build/index.js
   ```

### Authentication Errors

1. Verify token is valid:
   ```bash
   curl "https://your-countly-instance.com/o/apps/mine?auth_token=your-token"
   ```

2. Check token permissions in Countly

### HTTP/SSE Connection Issues

1. Verify server is running:
   ```bash
   curl http://localhost:3000/health
   ```

2. Check firewall settings
3. Verify port 3000 is not in use:
   ```bash
   lsof -i :3000  # macOS/Linux
   netstat -ano | findstr :3000  # Windows
   ```

## Best Practices

1. **Use workspace-specific settings** for project-based configurations
2. **Use environment variables** for sensitive data (tokens)
3. **Use HTTP/SSE mode** for remote servers or shared instances
4. **Use stdio mode** for local development (more secure, faster)
5. **Monitor logs** through VS Code's Output panel

## Security Notes

- Never commit `.vscode/mcp.json` with tokens to git
- Add `.vscode/mcp.json` to `.gitignore` if it contains secrets
- Use environment variables or token files for production
- Consider using VS Code's Secret Storage API for tokens (if extension supports it)

## Related Documentation

- [VS Code MCP Documentation](https://code.visualstudio.com/docs/copilot/mcp)
- [MCP Specification](https://modelcontextprotocol.io)
- [Countly MCP Server README](../README.md)
- [Countly Auth token creation](https://support.countly.com/hc/en-us/articles/15331695235481-Navigating-Through-Countly-Dashboard#h_01GRP82V1YQ8K29Q94KZMAK3SG)
