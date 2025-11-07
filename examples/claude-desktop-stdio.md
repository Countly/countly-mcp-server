# Claude Desktop - stdio Configuration

This example shows how to configure Claude Desktop to connect to Countly MCP Server using stdio transport (recommended for local installations).

## Prerequisites

1. **Claude Desktops** installed
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

### 3. Configure Claude Desktop

Go to Claude -> Settings -> Developer -> Local MCP Servers -> Edit Config

or find/create it manually at:

- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
- **Linux**: `~/.config/Claude/claude_desktop_config.json`

**Method 1: Local Installation (Recommended)**

```json
{
  "mcpServers": {
    "countly": {
      "command": "node",
      "args": [
        "/absolute/path/to/countly-mcp-server/build/index.js"
      ],
      "env": {
        "COUNTLY_SERVER_URL": "https://your-countly-instance.com",
        "COUNTLY_AUTH_TOKEN": "your-auth-token-here"
      }
    }
  }
}
```

**Method 2: Using Docker**

```json
{
  "mcpServers": {
    "countly": {
      "command": "docker",
      "args": [
        "run",
        "-i",
        "--rm",
        "-e", "COUNTLY_SERVER_URL=https://your-countly-instance.com",
        "-e", "COUNTLY_AUTH_TOKEN=your-token-here",
        "countly-mcp-server",
        "node", "build/index.js"
      ]
    }
  }
}
```

- Replace `/absolute/path/to/countly-mcp-server` with your actual path
- Replace `https://your-countly-instance.com` with your Countly URL
- Replace `your-auth-token-here` with your actual token

### 4. Restart Claude Desktop:
   - Completely quit Claude Desktop
   - Reopen Claude Desktop
   - The Countly MCP server should now be available

## Verification

After restarting Claude, you can verify the connection by asking:

> "Can you list my Countly apps?"

or

> "Show me a dashboard for [your app name]"

## Troubleshooting

### Server Not Showing Up

1. Check the Claude logs:
   - macOS: `~/Library/Logs/Claude/`
   - Windows: `%APPDATA%\Claude\logs\`

2. Verify the path to `index.js` is correct and absolute

3. Make sure Node.js is in your PATH:
   ```bash
   which node  # macOS/Linux
   where node  # Windows
   ```

### Authentication Errors

1. Verify your token is valid:
   ```bash
   curl "https://your-countly-instance.com/o/apps/mine?auth_token=your-token"
   ```

2. Check token permissions in Countly dashboard

### Connection Issues

1. Verify Countly server URL is accessible:
   ```bash
   curl https://your-countly-instance.com
   ```

2. Check firewall settings if using self-hosted Countly

## Notes

- **stdio** transport is the recommended method for Claude Desktop
- The server runs as a subprocess of Claude Desktop
- Logs are captured by Claude Desktop's logging system
- The server automatically shuts down when Claude Desktop closes
