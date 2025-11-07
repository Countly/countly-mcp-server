# Countly MCP Server

A Model Context Protocol (MCP) server for [Countly Analytics Platform](https://countly.com). This server enables AI assistants and MCP clients to interact with Countly's analytics data, manage applications, view dashboards, track events, and perform comprehensive analytics operations.

## About Countly

Countly is an open-source, enterprise-grade product analytics platform. It helps track user behavior, monitor application performance, and gain insights into user engagement. This MCP server provides programmatic access to all major Countly features through a standard protocol interface.

## What is MCP?

The Model Context Protocol (MCP) is an open protocol that enables seamless integration between AI applications and external data sources. This server implements MCP to allow AI assistants like Claude to interact with your Countly analytics data naturally through conversation.

## Features

- 🔐 Multiple authentication methods (metadata, environment variables, file-based)
- 📊 Comprehensive Countly API access
- �️ Fine-grained tools configuration with CRUD operation control per category
- �🐳 Docker support with production-ready configuration
- 🔄 Support for both stdio and HTTP transports
- 🏥 Built-in health checks
- 🔒 Secure token handling with Docker secrets support

## Quick Start

### Prerequisites

- **Countly Server**: Access to a Countly instance (cloud or self-hosted)
- **Auth Token**: Valid Countly authentication token with appropriate permissions
- **Node.js 18+** (for local installation) OR **Docker** (recommended)

### Using Docker (Recommended)

1. **Create a token file:**
   ```bash
   echo "your-countly-auth-token" > countly_token.txt
   ```

2. **Create a `.env` file:**
   ```bash
   cp .env.example .env
   # Edit .env and set your COUNTLY_SERVER_URL
   ```

3. **Run with Docker Compose:**
   ```bash
   docker-compose up -d
   ```

4. **Access the server:**
   - HTTP/SSE mode: `http://localhost:3000/mcp`
   - Health check: `http://localhost:3000/health`
   - Default port: 3000 (configurable)

### Using Docker Run

```bash
docker run -d \
  --name countly-mcp-server \
  -p 3000:3000 \
  -e COUNTLY_SERVER_URL=https://your-countly-instance.com \
  -e COUNTLY_AUTH_TOKEN_FILE=/run/secrets/countly_token \
  -v $(pwd)/countly_token.txt:/run/secrets/countly_token:ro \
  countly-mcp-server
```

### Using Node.js

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Build the project:**
   ```bash
   npm run build
   ```

3. **Configure environment:**
   ```bash
   cp .env.example .env
   # Edit .env with your settings
   ```

4. **Run the server:**
   ```bash
   # HTTP mode
   npm start
   
   # stdio mode (for MCP clients)
   npm run start:stdio
   ```

## Authentication

The server supports multiple authentication methods (in priority order):

1. **MCP Client Metadata** (highest priority)
   - Passed via `metadata.countlyAuthToken`
   
2. **Tool Arguments**
   - Passed as `countly_auth_token` parameter

3. **Environment Variable**
   - Set `COUNTLY_AUTH_TOKEN` in environment

4. **Token File** (recommended for production)
   - Set `COUNTLY_AUTH_TOKEN_FILE` pointing to a file containing the token

## Configuration

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `COUNTLY_SERVER_URL` | Yes | `https://api.count.ly` | Your Countly server URL |
| `COUNTLY_AUTH_TOKEN` | No* | - | Authentication token (direct) |
| `COUNTLY_AUTH_TOKEN_FILE` | No* | - | Path to file containing auth token |
| `COUNTLY_TIMEOUT` | No | `30000` | Request timeout in milliseconds |
| `COUNTLY_TOOLS_{CATEGORY}` | No | `ALL` | Control available tools per category (see below) |
| `COUNTLY_TOOLS_ALL` | No | `ALL` | Default permission for all categories |

*At least one authentication method must be configured

### Tools Configuration

The server supports fine-grained control over which MCP tools are available and which CRUD operations they can perform. This is useful for security, governance, or creating read-only deployments.

Configure tools by category using environment variables:

```bash
# Format: COUNTLY_TOOLS_{CATEGORY}=CRUD
# Where CRUD letters represent: Create, Read, Update, Delete operations

# Examples:
COUNTLY_TOOLS_APPS=CR          # Apps: Create and Read only
COUNTLY_TOOLS_DATABASE=R       # Database: Read-only access
COUNTLY_TOOLS_CRASHES=CRUD     # Crashes: Full access
COUNTLY_TOOLS_ALERTS=NONE      # Alerts: Completely disabled

# Set default for all categories:
COUNTLY_TOOLS_ALL=R            # Read-only mode for all tools
```

**Available Categories:**
- `CORE` - Core tools (search, fetch) (2 tools)
- `APPS` - Application management (6 tools)
- `ANALYTICS` - Analytics data retrieval (6 tools)
- `CRASHES` - Crash analytics and management (10 tools)
- `NOTES` - Notes management (3 tools)
- `EVENTS` - Event configuration (1 tool)
- `ALERTS` - Alert management (3 tools)
- `VIEWS` - Views analytics (3 tools)
- `DATABASE` - Direct database access (6 tools)
- `DASHBOARD_USERS` - Dashboard user management (1 tool)
- `APP_USERS` - App user management (3 tools)

**Total: 44 tools across 11 categories**

For complete documentation, examples, and per-tool CRUD mappings, see **[TOOLS_CONFIGURATION.md](TOOLS_CONFIGURATION.md)**.

## Docker Deployment

### Docker Hub

Pull the image from Docker Hub:
```bash
docker pull countly/countly-mcp-server:latest
```

### Build Locally

```bash
docker build -t countly-mcp-server .
```

### Docker Compose

The included `docker-compose.yml` provides a production-ready setup with:
- Docker secrets for secure token storage
- Health checks
- Resource limits
- Automatic restart
- Proper logging configuration

### Docker Swarm / Kubernetes

For orchestrated deployments, use external secrets:

**Docker Swarm:**
```bash
# Create secret
echo "your-token" | docker secret create countly_token -

# Deploy stack
docker stack deploy -c docker-compose.yml countly
```

**Kubernetes:**
```yaml
apiVersion: v1
kind: Secret
metadata:
  name: countly-token
type: Opaque
stringData:
  token: your-countly-auth-token
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: countly-mcp-server
spec:
  replicas: 1
  selector:
    matchLabels:
      app: countly-mcp-server
  template:
    metadata:
      labels:
        app: countly-mcp-server
    spec:
      containers:
      - name: countly-mcp-server
        image: countly-mcp-server:latest
        ports:
        - containerPort: 3000
        env:
        - name: COUNTLY_SERVER_URL
          value: "https://your-countly-instance.com"
        - name: COUNTLY_AUTH_TOKEN_FILE
          value: "/run/secrets/countly_token"
        volumeMounts:
        - name: token
          mountPath: /run/secrets
          readOnly: true
      volumes:
      - name: token
        secret:
          secretName: countly-token
          items:
          - key: token
            path: countly_token
```

## MCP Client Configuration

### Claude Desktop

The most common use case is with Claude Desktop. Add to your Claude configuration file:

**Location**: 
- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

**Using Docker:**

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

**Using local installation:**

```json
{
  "mcpServers": {
    "countly": {
      "command": "node",
      "args": ["/path/to/countly-mcp-server/build/index.js"],
      "env": {
        "COUNTLY_SERVER_URL": "https://your-countly-instance.com",
        "COUNTLY_AUTH_TOKEN": "your-token-here"
      }
    }
  }
}
```

**Using metadata for token (more secure):**

```json
{
  "mcpServers": {
    "countly": {
      "command": "node",
      "args": ["/path/to/countly-mcp-server/build/index.js"],
      "env": {
        "COUNTLY_SERVER_URL": "https://your-countly-instance.com"
      },
      "metadata": {
        "countlyAuthToken": "your-token-here"
      }
    }
  }
}
```

### Other MCP Clients

This server is compatible with any MCP client that supports:
- **stdio transport** (default) - For local/desktop clients
- **HTTP/SSE transport** - For web-based or remote clients

For HTTP mode, clients should connect to: `http://your-server:3000/mcp`

## Available Tools

The server provides over 40 tools for comprehensive Countly integration:

### Core Tools (OpenAI/ChatGPT Compatible)
- **`search`** - Search for relevant content in Countly data
- **`fetch`** - Retrieve specific documents by ID

### App Management
- **`list_apps`** - List all applications
- **`get_app_by_name`** - Get app details by name
- **`create_app`** - Create new application
- **`update_app`** - Update app settings
- **`delete_app`** - Delete application
- **`reset_app`** - Reset app data

### Analytics & Dashboards
- **`get_analytics_data`** - General analytics data retrieval
- **`get_dashboard_data`** - Dashboard overview
- **`get_events_overview`** - Events overview and totals
- **`get_top_events`** - Most frequently occurring events
- **`get_slipping_away_users`** - Identify inactive app users

### Events
- **`create_event`** - Define event with metadata and configuration

### Dashboard User Management
- **`get_all_dashboard_users`** - List all dashboard users (admin/management users who access the Countly dashboard)

### App User Management
- **`create_app_user`** - Create app user (end-user being tracked in your application)
- **`delete_app_user`** - Delete app user (end-user)
- **`export_app_users`** - Export app user data (end-users)

### Alerts & Notifications
- **`create_alert`** - Create alert configuration
- **`delete_alert`** - Delete alert
- **`list_alerts`** - List all alerts

### Notes
- **`list_notes`** - List all dashboard notes
- **`create_note`** - Create note
- **`delete_note`** - Delete note

### Database Operations
- **`list_databases`** - List available databases
- **`query_database`** - Query database collections
- **`get_document`** - Get specific document
- **`aggregate_collection`** - Run aggregation pipelines
- **`get_collection_indexes`** - View collection indexes
- **`get_db_statistics`** - Database statistics

### Crash Analytics
- **`list_crash_groups`** - List crash groups for an app
- **`get_crash_statistics`** - Get crash statistics and graphs
- **`view_crash`** - View crash details
- **`resolve_crash`** - Mark crash as resolved
- **`unresolve_crash`** - Mark crash as unresolved
- **`hide_crash`** - Hide crash from view
- **`show_crash`** - Show hidden crash
- **`add_crash_comment`** - Add comment to crash
- **`edit_crash_comment`** - Edit crash comment
- **`delete_crash_comment`** - Delete crash comment

All tools support flexible app identification via either `app_id` or `app_name` parameter.

## Health Check

The server includes a health check endpoint at `/health` (HTTP mode only):

```bash
curl http://localhost:3000/health
```

Response:
```json
{
  "status": "healthy",
  "timestamp": "2025-10-10T12:00:00.000Z"
}
```

## MCP Endpoint

When running in HTTP mode, the MCP protocol endpoint is available at:
- **Path**: `/mcp`
- **Transport**: Server-Sent Events (SSE)
- **Full URL**: `http://localhost:3000/mcp`

This endpoint handles all MCP protocol communication using the SSE transport method.

## Project Structure

```
countly-mcp-server/
├── src/
│   └── index.ts          # Main server implementation
├── build/                # Compiled JavaScript output
├── docs/                 # Additional documentation
├── .env.example          # Environment configuration template
├── docker-compose.yml    # Docker Compose configuration
├── Dockerfile            # Docker image definition
├── DOCKER.md             # Detailed Docker deployment guide
└── README.md             # This file
```

## Development

### Watch Mode

```bash
npm run dev
```

## Testing

Run automated tests:

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Generate coverage report
npm run test:coverage

# Run tests for CI
npm run test:ci
```

**Testing Documentation:**
- See [docs/TESTING.md](./docs/TESTING.md) for complete testing guide
- See [docs/TESTING_SUMMARY.md](./docs/TESTING_SUMMARY.md) for testing strategy

**Current Coverage:**
- Authentication and credential handling
- Tool handlers and parameter validation
- HTTP client configuration
- Error handling

---

1. **Never commit tokens** to version control
2. **Use Docker secrets** or environment variables for production
3. **Restrict file permissions** on token files (`chmod 600`)
4. **Use HTTPS** for Countly server connections
5. **Rotate tokens** regularly
6. **Use read-only mounts** for token files in Docker

## Troubleshooting

### Connection Issues

```bash
# Test connectivity
curl https://your-countly-instance.com/o/apps/mine?auth_token=your-token

# Check Docker logs
docker logs countly-mcp-server

# Check container health
docker ps
```

### Authentication Errors

Verify your token and ensure it has proper permissions in Countly.

## License

MIT

## Support

For issues and questions:
- GitHub Issues: [countly/mcp-server](https://github.com/countly/mcp-server)
- Countly Community: [https://community.count.ly](https://community.count.ly)

## CI/CD

This project uses GitHub Actions for automated testing and deployment:

- **Automated Tests**: Run on every pull request and push to main/develop
  - Tests across Node.js 18, 20, and 22
  - TypeScript compilation verification
  - Test coverage reporting
  - Build smoke tests
- **Docker Publishing**: Automated builds on version tags (`v*.*.*`)
  - Multi-architecture support (amd64, arm64)
  - Automatic latest tag updates
  - Tests must pass before publishing

See [.github/AUTOMATED_TESTING.md](./.github/AUTOMATED_TESTING.md) for details.

## Contributing

Contributions are welcome! Please read our contributing guidelines before submitting PRs.

**Development Workflow:**
1. Fork the repository
2. Create a feature branch
3. Make your changes and add tests
4. Run `npm test` locally
5. Submit a pull request
6. GitHub Actions will automatically run tests
7. Address any feedback and ensure tests pass
