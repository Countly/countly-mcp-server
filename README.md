# Countly MCP Server

A Model Context Protocol (MCP) server for [Countly Analytics Platform](https://countly.com). This server enables AI assistants and MCP clients to interact with Countly's analytics data, manage applications, view dashboards, track events, and perform comprehensive analytics operations.

## About Countly

Countly is an open-source, enterprise-grade product analytics platform. It helps track user behavior, monitor application performance, and gain insights into user engagement. This MCP server provides programmatic access to all major Countly features through a standard protocol interface.

## What is MCP?

The Model Context Protocol (MCP) is an open protocol that enables seamless integration between AI applications and external data sources. This server implements MCP to allow AI assistants like Claude to interact with your Countly analytics data naturally through conversation.

## Requirements

### Server Requirements
- **Node.js 18+** (for local installation) OR **Docker** (recommended)
- **Countly Server**: Access to a Countly instance (cloud or self-hosted): Countly Lite, Countly Enterprise or Countly Platform (see [Supported Countly Editions](#supported-countly-editions))
- **Auth Token**: Valid Countly authentication token with appropriate permissions

### Client Requirements
- **MCP Protocol Version**: `2025-03-26` (Streamable HTTP specification)
- **Compatible Clients**:
  - VS Code MCP Extension (latest version)
  - Claude Desktop (recent versions supporting 2025-03-26 spec)
  - Any MCP client implementing the Streamable HTTP transport protocol

> ⚠️ **Note**: For SSE type this server uses `StreamableHTTPServerTransport` which implements the modern MCP specification (2025-03-26). Older MCP clients that only support the legacy SSE protocol (2024-11-05) are not compatible. Please ensure your MCP client is up-to-date.

## Features

- **209 Tools** across 43 categories for comprehensive Countly operations
- **Resources** for AI context - Access read-only Countly data (app configs, event schemas, analytics overviews)
- **Prompts** for common tasks - Pre-built templates for crash analysis, engagement reports, and more
- **Multiple Transport Options**: Supports both stdio (recommended) and HTTP/SSE connections
- **Flexible Authentication**: Environment variables, HTTP headers, URL parameters, or token files
- **Edition-Aware**: Detects Countly Lite, Enterprise or Platform on connection and only exposes the tools that server and the connected user can use
- **Docker Support**: Pre-built Docker images with multi-architecture support (amd64, arm64)
- **Anonymous Analytics**: Optional usage tracking (disabled by default) to help improve the server
-

## Supported Countly Editions

The server works with every Countly flavor and detects which one it is talking to on the first request for a server URL and token. The result is cached for 10 minutes.

| Edition | What it is | How it is detected |
|---|---|---|
| **Countly Lite** | `countly-server` | No `/v2` API, no enterprise plugins |
| **Countly Enterprise** | `countly-server` + enterprise plugins | No `/v2` API, enterprise plugins present (drill, funnels, cohorts, …) |
| **Countly Platform** | `countly-platform`, the new architecture | Answers the `/v2` API (new UI), or Platform-only endpoints/plugins when running without it |

Based on the detection, `tools/list` only contains tools that will work:

- **Plugins**: tools whose Countly plugin is not enabled are hidden (e.g. cohorts on Lite, server logs on Platform). Global admins read the real plugin list. For other users the edition's default plugin set is assumed, because Countly only shows the plugin list to global admins.
- **User permissions**: tools the connected user could never run are hidden, based on the user's feature permissions (create/read/update/delete per app, app admin, global admin), including group permissions. A read-only user sees roughly half the tools.
- **Explanations instead of failures**: calling a hidden tool returns an error naming the missing plugin or permission, so the assistant can tell the user what is missing.

Detection never hides tools on a guess: if the server cannot be reached or the user's permissions cannot be read, the configured tools stay available. `get_version` reports the detected edition. Set `COUNTLY_AUTO_DETECT=false` to turn detection off. Details are in [TOOLS_CONFIGURATION.md](TOOLS_CONFIGURATION.md#server-detection-and-plugin-based-tool-availability).

## MCP Capabilities

This server implements the full MCP specification with support for:

### Tools (209 available)
Execute Countly operations like analytics queries, app management, crash analysis, etc. Each connection only sees the tools its Countly edition, plugins and user permissions support (see [Supported Countly Editions](#supported-countly-editions)).

### Resources
Read-only access to Countly data for AI context:
- `countly://app/{app_id}/config` - Application configuration and metadata
- `countly://app/{app_id}/events` - Event definitions and schemas  
- `countly://app/{app_id}/overview` - Current analytics overview with key metrics

Resources provide AI assistants with context without requiring tool calls, making conversations more efficient.

### Prompts
Pre-built analysis templates exposed as slash commands:
- `analyze_crash_trends` - Analyze crash and error patterns
- `generate_engagement_report` - Comprehensive user engagement analysis
- `compare_app_versions` - Compare performance between versions
- `user_retention_analysis` - Analyze retention patterns and cohorts
- `funnel_optimization` - Conversion funnel analysis and suggestions
- `event_health_check` - Event tracking implementation quality check
- `identify_churn_risk` - Find users showing decreased engagement
- `performance_dashboard` - Comprehensive performance overview

Prompts guide AI assistants through complex multi-step workflows automatically.

- 🔐 Multiple authentication methods (HTTP headers, environment variables, file-based)
- 📊 Comprehensive Countly API access
- ⚙️ Fine-grained tools configuration with CRUD operation control per category
- 🐳 Docker support with production-ready configuration
- 🔄 Support for both stdio and HTTP transports
- 🏥 Built-in health checks
- 🔒 Secure token handling with cryptographically secure session IDs
- 🌐 Multi-client support with per-client credential passing
- 🚨 **Enhanced error handling** with detailed API error messages

## Quick Start

### Prerequisites

Before starting, ensure you have:
- Access to a Countly instance (cloud or self-hosted)
- Valid Countly authentication token with appropriate permissions
- Node.js 18+ (for local installation) OR Docker (recommended)
- MCP client supporting protocol version 2025-03-26 (Streamable HTTP)

### Using npx (No Installation)

Run the published package directly with `npx` — no clone or build required:

```bash
# stdio mode (for MCP clients like Claude Desktop, VS Code)
COUNTLY_SERVER_URL=https://your-countly-instance.com \
COUNTLY_AUTH_TOKEN=your-countly-auth-token \
npx -y countly-mcp-server

# HTTP mode (binds localhost; see "Server-side token in HTTP mode" before exposing it)
COUNTLY_SERVER_URL=https://your-countly-instance.com \
COUNTLY_AUTH_TOKEN=your-countly-auth-token \
npx -y countly-mcp-server --http
```

Example MCP client configuration (stdio):

```json
{
  "mcpServers": {
    "countly": {
      "command": "npx",
      "args": ["-y", "countly-mcp-server"],
      "env": {
        "COUNTLY_SERVER_URL": "https://your-countly-instance.com",
        "COUNTLY_AUTH_TOKEN": "your-countly-auth-token"
      }
    }
  }
}
```

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

1. **Tool Arguments**
   - Passed as `countly_auth_token` parameter in individual tool calls
   - Overrides every other source for that call

2. **HTTP Headers** (recommended for HTTP/SSE transport)
   - Pass via `X-Countly-Server-Url` and `X-Countly-Auth-Token` headers
   - Supported by VS Code MCP extension and other HTTP clients
   - See [VS Code MCP Configuration](examples/vscode-mcp.md) for details

3. **URL Parameters** (alternative for HTTP/SSE transport)
   - Pass as query string: `?server_url=https://your-server.count.ly&auth_token=your-api-key`
   - Useful for quick testing or tools that don't support custom headers
   - Less secure than headers, use headers when possible

4. **Environment Variable**
   - Set `COUNTLY_AUTH_TOKEN` in environment
   - Recommended for stdio transport mode

5. **Token File** (recommended for production)
   - Set `COUNTLY_AUTH_TOKEN_FILE` pointing to a file containing the token
   - Useful with Docker secrets

A token the caller supplies (1–3) always wins over the server's own (4–5);
the server-side token is only used for a request that brings none.

## Configuration

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `COUNTLY_SERVER_URL` | Yes | `https://api.count.ly` | Your Countly server URL |
| `COUNTLY_AUTH_TOKEN` | No* | - | Authentication token (direct) |
| `COUNTLY_AUTH_TOKEN_FILE` | No* | - | Path to file containing auth token |
| `COUNTLY_TIMEOUT` | No | `30000` | Request timeout in milliseconds |
| `ENABLE_ANALYTICS` | No | `false` | Enable anonymous usage analytics (set to `true` to opt in) |
| `COUNTLY_AUTO_DETECT` | No | `true` | Detect Countly Lite / Enterprise / Platform and hide tools the server doesn't support (set to `false` to always show all configured tools) |
| `COUNTLY_TOOLS_{CATEGORY}` | No | `ALL` | Control available tools per category (see below) |
| `COUNTLY_TOOLS_ALL` | No | `ALL` | Default permission for all categories |
| `COUNTLY_CORS_ALLOWED_ORIGINS` | No | `*` | Comma-separated list of allowed CORS origins (HTTP transport). Leave unset or `*` for wide-open; use specific origins in production (e.g. `https://app.example.com,https://dash.example.com`). When a server-side token is configured, browser requests to `/mcp` are refused unless their origin is listed here explicitly; `*` does not count. |
| `COUNTLY_RATE_LIMIT_RPM` | No | `120` | Per-IP requests per minute on the `/mcp` endpoint (HTTP transport). Set to `0` to disable. |
| `COUNTLY_TRUST_PROXY` | No | `false` | When `true`, use `X-Forwarded-For` for the rate-limit client IP. Only enable when the server is behind a trusted reverse proxy that sets this header. |
| `COUNTLY_MAX_BODY_BYTES` | No | `1048576` | Maximum request-body size accepted on `/mcp` (HTTP transport). Requests over the limit get `413 Payload Too Large`. Set to `0` to disable. |
| `COUNTLY_MAX_CONCURRENT_PER_IP` | No | `50` | Maximum simultaneous TCP connections per client IP (HTTP transport). Over-limit connections are dropped. Set to `0` to disable. |
| `COUNTLY_REQUEST_LOG` | No | `false` | When `true`, emit one NDJSON line per request to stderr (`{ts, ip, method, path, status, durationMs, rateLimitHit}`). Useful for piping into a log aggregator to spot abuse patterns. |

*At least one authentication method must be configured

### Analytics Tracking (Optional)

The MCP server includes optional anonymous usage analytics to help improve the product. Analytics are **disabled by default** and can be opted into via the `ENABLE_ANALYTICS=true` environment variable.

**What is tracked:**
- Transport type used (stdio vs HTTP)
- Tool execution metrics (success/failure, duration, tool names)
- Authentication methods used (headers, env, file, args)
- HTTP endpoint access patterns
- Error occurrences (type and message, NO sensitive data)
- Server start/stop events
- A **truncated opaque hash** of your Countly server URL (64-bit SHA-256 prefix), attached as the `server` segment on every event — used for distinct-server aggregation. The raw URL is never sent.

**What is NOT tracked:**
- Authentication tokens or credentials
- Raw Countly server URLs or domains (only the opaque `server` hash above)
- User data or analytics content
- Personal information
- IP addresses or client identifiers
- Tool arguments or request/response bodies

**Privacy & Device ID:**
All analytics are aggregated under a single device ID `"mcp"` — Countly cannot distinguish individual operators from the device ID alone. The only per-deployment signal is the `server` hash on events, which is a truncated SHA-256 of the normalized server URL. The hash is intentionally coarse (64 bits) and the server URL is low-entropy, so do not assume the hash is unguessable for cloud patterns; it is meant for aggregation, not secrecy.

**To opt in:**
```bash
export ENABLE_ANALYTICS=true
```

Or in your `.env` file:
```
ENABLE_ANALYTICS=true
```

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

**Available Categories** (subset — see TOOLS_CONFIGURATION.md for all 42):
- `CORE` - Core tools (ping, get_version, get_plugins) (3 tools)
- `APPS` - Application management (6 tools)
- `ANALYTICS` - Analytics data retrieval (7 tools)
- `CRASHES` - Crash analytics and management (10 tools)
- `NOTES` - Notes management (3 tools)
- `EVENTS` - Event configuration (1 tool)
- `ALERTS` - Alert management (3 tools)
- `VIEWS` - Views analytics (3 tools)
- `DATABASE` - Direct database access (5 tools)
- `DASHBOARD_USERS` - Dashboard user management (1 tool)
- `APP_USERS` - App user management (3 tools)

For complete documentation, examples, and per-tool CRUD mappings, see **[TOOLS_CONFIGURATION.md](TOOLS_CONFIGURATION.md)**.

## Security & Production Hardening

The HTTP transport is designed to be usable both as a public-facing MCP
endpoint (e.g. `mcp.count.ly`) and as a self-hosted single-tenant server.
The defaults favor compatibility; operators should opt into the tighter
settings below based on their deployment model.

### Multi-tenant isolation

The HTTP transport is safe to use with multiple concurrent clients using
different Countly auth tokens. Each request gets its own outbound axios
instance with the `countly-token` header baked in, and each tenant's apps
cache is keyed by SHA-256(token) so one tenant's apps cannot leak into
another tenant's `resolveAppId` lookup.

No operator configuration is required for this.

### SSRF

Caller-supplied server URLs (via `X-Countly-Server-Url` header or
`?server_url=` query param) are validated against an SSRF denylist —
loopback, link-local, RFC 1918, carrier-grade NAT, cloud metadata
endpoints (`169.254.169.254`), `.local`/`.localhost`, and non-HTTP(S)
schemes are rejected with a 400. This is a syntactic check; defense
against DNS-rebinding still requires egress firewalling the server.

### Credentials in URLs are deprecated

Passing the auth token via `?auth_token=` is supported for backward
compatibility but emits a rate-limited security warning to stderr.
Tokens in URLs leak into access logs, browser history, and Referer
headers. Migrate callers to `X-Countly-Auth-Token` — URL-param support
will be removed in a future release.

### Rate limiting

The `/mcp` endpoint has a per-IP sliding-window rate limiter, defaulting
to 120 requests per minute. Tune via `COUNTLY_RATE_LIMIT_RPM=<n>`
(set to `0` to disable). Behind a trusted reverse proxy, set
`COUNTLY_TRUST_PROXY=true` so the first `X-Forwarded-For` hop is used as
the client IP.

### Resource-exhaustion defenses

Additional protections layered on top of the application-level rate limit:

- **Request body cap** (`COUNTLY_MAX_BODY_BYTES`, default 1 MiB) — `413
  Payload Too Large` + socket destroyed for oversize bodies. Checked both
  upfront via `Content-Length` and streamingly (for chunked / lying
  clients).
- **Per-IP concurrent connection cap** (`COUNTLY_MAX_CONCURRENT_PER_IP`,
  default 50) — over-limit TCP connections are dropped before the TLS
  handshake, closing the slow-loris amplification.
- **Server timeouts** — `requestTimeout=30s`, `headersTimeout=10s`,
  `keepAliveTimeout=5s`, `timeout=60s`. Slow clients can't keep sockets
  open indefinitely.

For operators that want per-request audit logs for abuse detection, set
`COUNTLY_REQUEST_LOG=true`. The server will emit one NDJSON line per
request to stderr, containing only the fields listed in the env-var
table — no auth tokens, no bodies, no headers.

### CORS

The default is `Access-Control-Allow-Origin: *` so browser-based MCP
clients from any origin can connect. If your deployment only needs to
serve specific origins, lock it down:

```bash
COUNTLY_CORS_ALLOWED_ORIGINS="https://dash.example.com,https://ops.example.com"
```

The server will then echo only allowed origins and add `Vary: Origin`.
Pre-flight requests from disallowed origins get a 403.

When the server holds its own token (`COUNTLY_AUTH_TOKEN` or
`COUNTLY_AUTH_TOKEN_FILE`), `/mcp` refuses every request that carries an
`Origin` header with a 403, unless that origin is listed explicitly in
`COUNTLY_CORS_ALLOWED_ORIGINS` (the `*` default does not count). MCP
clients such as Claude Desktop, Claude Code, VS Code and Cursor send no
`Origin` header and are unaffected. This stops a web page open in the
operator's browser, including one using DNS rebinding, from driving a
server that holds a token. Servers without a configured token, where every
caller brings its own, are not affected by this rule.

### Server-side token in HTTP mode

`COUNTLY_AUTH_TOKEN` and `COUNTLY_AUTH_TOKEN_FILE` exist for stdio mode,
where the MCP client launches the server as its own child process. In HTTP
mode the server does **not** authenticate its callers: when one is set,
any caller that reaches `/mcp` without supplying its own token acts with
the configured one, with all the permissions that token carries.

Only configure a server-side token in HTTP mode when the endpoint is
reachable from a trusted network alone: bound to localhost, behind a
firewall, or behind a reverse proxy that authenticates callers. The server
logs a warning at startup when it runs this way. For a shared or
internet-facing deployment, leave both variables unset and have each
client send its own token in the `X-Countly-Auth-Token` header.

### Self-hosted single-tenant deployments

If you're running this as a single-tenant server (e.g. `docker run` on a
VPS for your own AI assistant), prefer one of:

- **Bind to localhost only** and tunnel through SSH:
  `docker run -p 127.0.0.1:3000:3000 ...`
- **Bind behind a reverse proxy** (Caddy, Nginx, Traefik) that terminates
  TLS, adds authentication if needed, and sets a trusted `X-Forwarded-For`
  (then set `COUNTLY_TRUST_PROXY=true`).

The default Dockerfile binds to `0.0.0.0:3000` so it works inside a
container without extra flags. This means `docker run -p 3000:3000 ...`
exposes the MCP endpoint to the public internet — use an explicit local
bind, a reverse proxy, or an external firewall if that's not what you
want. This matters most when the container is given a server-side token:
see [Server-side token in HTTP mode](#server-side-token-in-http-mode).

### Telemetry

Analytics are **disabled by default**. Opt in with `ENABLE_ANALYTICS=true`.
No authentication tokens, server URLs, or tool arguments are ever sent
to `stats.count.ly`; error messages shipped to the analytics SDK are
redacted for token-shaped substrings.

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

**Using environment variable for token (alternative):**

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

### Other MCP Clients

This server is compatible with any MCP client that supports:
- **stdio transport** (default) - For local/desktop clients (uses environment variables for auth)
- **HTTP/SSE transport** - For web-based or remote clients (uses HTTP headers for auth)

For HTTP mode, clients should connect to: `http://your-server:3000/mcp`

## Available Tools

The server provides 209 tools across 43 categories for comprehensive Countly integration. Tools marked **(Platform)** exist only on Countly Platform with its `/v2` API. Tools marked **(v2 on Platform)** use the richer Platform `/v2` endpoints there, and the classic endpoints on Lite and Enterprise.

### Core Tools (OpenAI/ChatGPT Compatible)
- **`ping`** - Check if Countly server is healthy and reachable
- **`get_version`** - Check what version of Countly is running on the server
- **`get_plugins`** - Get list of installed plugins on the server

### App Management
- **`apps_list`** (v2 on Platform) - List all applications; on Platform with your role (admin/user) per app
- **`apps_get_by_name`** (v2 on Platform) - Get app details by name
- **`apps_create`** - Create new application
- **`apps_update`** - Update app settings
- **`apps_delete`** - Delete application
- **`apps_reset`** - Reset app data

### Analytics & Dashboards
- **`query_data`** - Analytics data by predefined methods (locations, carriers, devices, etc.), event data, or drill segmentation. On Platform, use `drill_query` for metrics, formulas and cohorts
- **`app_analytics_summary`** - General app summary and analytics overview
- **`slipping_users`** - Identify inactive app users
- **`session_frequency`** - Session frequency distribution across time buckets (f=0: first session, f=1: 1-24h, f=2: 1 day, through f=11: 30+ days)
- **`user_loyalty`** - User loyalty data showing session count distribution across loyalty buckets (1 session, 2 sessions, 3-5, 6-9, 10-19, 20-49, 50-99, 100-499, 500+)
- **`session_durations`** - Session duration distribution across duration buckets (0-10 sec, 11-30 sec, 31-60 sec, 1-3 min, 3-10 min, 10-30 min, 30-60 min, 1+ hour)

### Events
- **`events_create`** - Define event with metadata and configuration
- **`events_list`** (v2 on Platform) - List all events and their segments, including internal Countly events with exact database structure; on Platform with search, paging, display names and drill-only events
- **`events_summary`** (Platform) - All custom events with count, sum, duration and per-occurrence averages for a period
- **`events_top`** (Platform) - Events ranked by count, average sum and average duration
- **`events_movers`** (Platform) - Fastest-growing and newly appearing events vs the previous period, with daily series
- **`events_delete`** - Delete events and their data

### Dashboard User Management
- **`dashboard_users`** (v2 on Platform) - List all dashboard users (admin/management users who access the Countly dashboard); on Platform as compact rows with role and app access

### App User Management
- **`app_users_create`** - Create app user (end-user being tracked in your application)
- **`app_users_delete`** - Delete app users (end-users) matching a query
- **`app_users_update`** - Update app user properties

### Alerts & Notifications
- **`alerts_create`** - Create alert configuration
- **`alerts_delete`** - Delete alert
- **`alerts_list`** - List all alerts

### Notes
- **`notes_list`** (v2 on Platform) - List all dashboard notes
- **`notes_create`** (v2 on Platform) - Create note; on Platform with private/shared/global visibility and optional event scope (hidden from the legacy dashboard)
- **`notes_update`** (Platform) - Edit a note's text, time, color, visibility or event scope
- **`notes_delete`** (v2 on Platform) - Delete note

### Database Operations
- **`databases_list`** - List available databases
- **`databases_query`** - Query database collections
- **`databases_document`** - Get specific document
- **`collections_aggregate`** - Run aggregation pipelines
- **`collections_indexes`** - View collection indexes

### Crash Analytics
- **`crash_groups_list`** (v2 on Platform) - List crash groups for an app; on Platform with server-side search and sorting
- **`crashes_stats_get`** - Get crash statistics and graphs
- **`crashes_get`** - View crash details
- **`crash_group_breakdown`** (Platform) - Distribution of a crash group over a field (OS version, device, app version, …)
- **`crash_group_users`** (Platform) - Users affected by a crash group
- **`crash_jira_issues`** (Platform, requires `crashes-jira` plugin) - Jira issues linked to crash groups
- **`crashes_resolve`** (v2 on Platform) - Mark crash as resolved
- **`crashes_unresolve`** (v2 on Platform) - Mark crash as unresolved
- **`crashes_hide`** (v2 on Platform) - Hide crash from view
- **`crashes_show`** (v2 on Platform) - Show hidden crash
- **`crashes_comment_add`** - Add comment to crash
- **`crashes_comment_update`** - Edit crash comment
- **`crashes_comment_delete`** - Delete crash comment

### Drill Segmentation (requires `drill` plugin)
- **`drill_query`** (Platform) - Ad-hoc analytics over raw events: count, unique users, sum, average, percentiles, cohort and formula metrics, filters, breakdowns, time series and paging
- **`queriable_fields_list`** (v2 on Platform) - Get available properties for segmentation
- **`metadata_get`** (v2 on Platform) - Event definitions, segments and system fields for building queries
- **`drill_bookmarks_list`** (v2 on Platform) - List saved segmentation queries; on Platform all saved queries of an app (or all yours), including old-UI bookmarks
- **`drill_bookmarks_create`** (v2 on Platform) - Save a segmentation query; on Platform also any `drill_query` metrics, filter and breakdowns
- **`drill_bookmarks_delete`** (v2 on Platform) - Delete a saved query
- **`drill_saved_query_run`** (Platform) - Run a saved drill query, optionally over another period
- **`drill_property_values`** (Platform) - Distinct values of a user property, custom property or event segment, for building filters

### User Profiles (requires `users` plugin)
- **`user_profiles_query`** (v2 on Platform) - Query users with MongoDB filters; on Platform also free-text search, sorting, paging and totals
- **`user_profiles_breakdown`** (v2 on Platform) - Break down user counts by a property; on Platform with a top-N limit and each value's share
- **`user_profiles_get`** - Get specific user details by UID

### Cohorts (requires `cohorts` plugin)
- **`cohorts_list`** - List all user cohorts with filtering
- **`cohorts_data`** - Get cohort data over a period
- **`cohorts_create`** - Create behavioral cohort based on user actions
- **`cohorts_update`** - Update cohort configuration
- **`cohorts_delete`** - Delete a cohort

### Funnels (requires `funnels` plugin)
- **`funnels_list`** (v2 on Platform) - List all conversion funnels
- **`funnels_data`** (v2 on Platform) - Get funnel analytics data with filtering; on Platform adds median and p95 time between steps
- **`funnels_step_users`** (v2 on Platform) - Get users who reached a specific step; on Platform with full profiles
- **`funnels_dropoff_users`** (v2 on Platform) - Get users who dropped off between steps; on Platform with full profiles
- **`funnels_create`** - Create conversion funnel with event sequence
- **`funnels_update`** - Update funnel configuration
- **`funnels_delete`** - Delete a funnel
- **`funnels_breakdown`** (Platform) - Users who reached a step, split by a property
- **`funnels_trends`** (Platform) - Daily entered, completed and conversion rate
- **`funnels_user_progress`** (Platform) - How far one user got in every funnel

### Formulas (requires `formulas` plugin)
- **`formulas_run`** - Run mathematical formulas on metrics (sessions, events, users) with filters and segments
- **`formulas_list`** - List all saved formulas
- **`formulas_save`** - Create or update a saved formula
- **`formulas_delete`** - Delete a saved formula

### Live/Concurrent Users (requires `concurrent_users` plugin)
- **`live_users`** (v2 on Platform) - Get current online user count and new users at this moment
- **`live_metrics`** - Get breakdown by countries, devices and carriers for users currently online
- **`live_last_hour`** (v2 on Platform) - Get minute-by-minute data for the last hour (60 data points)
- **`live_last_day`** (v2 on Platform) - Get hour-by-hour data for the last day (24 data points)
- **`live_last_30_days`** (v2 on Platform) - Get daily data for the last 30 days (30 data points)
- **`live_overall`** - Get maximum values for online users (peak concurrent usage records)

### Retention (requires `retention_segments` plugin)
- **`retention`** - Get retention data showing consecutive event streaks. Supports three types: Full (strict - breaks on first skip), Classic (Day N - specific days independently), Unbounded (lenient - any return counts)

### Remote Config (requires `remote-config` plugin)
- **`remote_configs_list`** - List all remote config parameters and conditions
- **`remote_config_conditions_add`** - Add user segmentation condition using MongoDB queries
- **`remote_config_conditions_update`** - Update existing condition criteria
- **`remote_config_conditions_delete`** - Delete a condition (if not in use)
- **`remote_config_parameters_add`** - Add parameter with default and conditional values
- **`remote_config_parameters_update`** - Update parameter values, conditions, or status
- **`remote_config_parameters_delete`** - Delete a parameter

### A/B Testing (requires `ab-testing` plugin)
- **`ab_experiments_list`** - List all A/B testing experiments with statuses and results
- **`ab_experiments_details`** - Get detailed experiment info including variants and statistical significance
- **`ab_experiments_create`** - Create new experiment with variants, user targeting, and goals
- **`ab_experiments_start`** - Start experiment to begin collecting data
- **`ab_experiments_stop`** - Stop running experiment
- **`ab_experiments_delete`** - Delete experiment and all its data

### Logger (requires `logger` plugin)
- **`sdk_logs_list`** (v2 on Platform) - List incoming data logs sent by SDK to the server for debugging and monitoring; on Platform with paging and filters by request type, SDK, time range and problem requests

### SDKs (requires `sdk` plugin)
- **`sdk_stats_get`** - Get statistics about SDKs sending data (names, versions, request types, health checks)
- **`sdk_config_get`** - Get SDK configuration settings controlling SDK behavior and enabled features

### Compliance Hub (requires `compliance-hub` plugin)
- **`consents_stats`** - Get aggregated consent statistics showing which consents users gave and when
- **`consents_list`** - List specific users and their consent status
- **`consents_history_search`** - Search consent history records with detailed audit trail

### Filtering Rules (requires `block` plugin, Enterprise)
- **`filtering_rules_list`** - List all blocking rules that filter incoming requests
- **`filtering_rules_create`** - Create rule to block requests based on MongoDB conditions (IP, version, device properties)
- **`filtering_rules_update`** - Update existing blocking rule configuration
- **`filtering_rules_toggle_status`** - Enable or disable a blocking rule
- **`filtering_rules_delete`** - Delete a blocking rule

### Datapoint (requires `server-stats` plugin)
- **`datapoints_stats`** - Get data points collected per app per datapoint type. Data points measure collected data and are tied to server specs and billing.
- **`datapoints_top_apps`** - Get top apps ranked by data point collection for understanding data usage and billing
- **`datapoints_punch_card`** - Get hourly data point breakdown punchcard showing server load patterns for capacity planning

### Server Logs (requires `errorlogs` plugin)
- **`server_logs_files_list`** - List available server log files (only available in non-Docker deployments)
- **`server_logs_contents`** - Get contents of a specific server log file for debugging and monitoring (only available in non-Docker deployments)

### Email Reports (requires `reports` plugin)
- **`email_reports_list`** (v2 on Platform) - List all email reports configured for an app; on Platform across apps with an optional app and title filter
- **`email_reports_core_create`** (v2 on Platform) - Create a core email report with metrics like analytics, events, crashes, and star-rating
- **`email_reports_dashboard_create`** (v2 on Platform) - Create a dashboard email report for specific dashboards; on Platform for new-UI dashboards
- **`email_reports_update`** (v2 on Platform) - Update an existing email report configuration
- **`email_reports_preview`** (v2 on Platform) - Preview an email report to see what it will look like before sending; on Platform as readable text
- **`email_reports_send`** (v2 on Platform) - Manually trigger sending an email report immediately
- **`email_reports_delete`** (v2 on Platform) - Delete an email report configuration

### Views (requires `views` plugin)
- **`views_table`** - Per-view metrics table (views, users, duration, bounces, exits)
- **`views_data`** - View metrics over time
- **`views_top`** (Platform) - Top views per metric (count, duration, bounce rate, landings, exits, scroll depth)

### Dashboards (requires `dashboards` plugin)

On Countly Platform with the new UI, the dashboard tools work with the new-UI dashboards (v2). Their widgets use the Platform widget format (drill, funnel, retention, profiles, active and online users), and `dashboards_data` returns each widget's results.

- **`dashboards_list`** - List all available dashboards (with optional schema-only parameter)
- **`dashboards_data`** - Get widgets and data for a specific dashboard with time period filtering
- **`dashboards_create`** - Create a new dashboard with sharing settings, auto-refresh configuration, and theme
- **`dashboards_update`** - Update dashboard configuration (name, sharing, refresh rate, theme)
- **`dashboards_delete`** - Delete a dashboard by ID
- **`dashboards_widget_add`** - Add a widget to a dashboard with full configuration (title, feature, widget type, apps, metrics, visualization)
- **`dashboards_widget_update`** - Update a widget on a dashboard
- **`dashboards_widget_remove`** - Remove a widget from a dashboard

### Times of Day (requires `times-of-day` plugin)
- **`times_of_day`** - Get user behavior patterns in their local time for a specific event. Shows when users are most active throughout the day (by hour) and week (by day). Useful for understanding optimal engagement times and scheduling.

### Hooks (requires `hooks` plugin)
- **`hooks_list`** (v2 on Platform) - List all webhooks/hooks configured for an app. Shows triggers, effects, and configuration details. On Platform also across apps, with enabled/text filters, paging and run counters.
- **`hooks_get`** (Platform) - Get one hook with its configuration, run counters and its last failed runs with error messages.
- **`hooks_test`** (v2 on Platform) - Test a hook configuration with mock data before creating it. Useful for validating trigger conditions and effect actions.
- **`hooks_create`** (v2 on Platform) - Create a new webhook/hook with various trigger types (IncomingDataTrigger, APIEndPointTrigger, InternalEventTrigger, ScheduledTrigger) and effects (HTTPEffect, EmailEffect, CustomCodeEffect).
- **`hooks_update`** (v2 on Platform) - Update an existing webhook/hook configuration.
- **`hooks_delete`** (v2 on Platform) - Delete a webhook/hook by its ID.

### Journeys (requires `journey_engine` plugin)
On Countly Platform all journey tools use the `/v2` API. Its first write on a journey created in the old dashboard moves that journey to the new UI.
- **`journeys_list`** (v2 on Platform) - List journeys with status, versions and usage counters; on Platform with status/search filters, paging and counts per status
- **`journeys_get`** (v2 on Platform) - Get one journey with its versions and block graph
- **`journeys_create`** (v2 on Platform) - Create a new journey (definition plus first draft version) from a block graph; on Platform also with a description and conversion goal
- **`journeys_update`** (v2 on Platform) - Update a journey's name, per-user limit and/or the blocks of one of its versions; on Platform also description and goal
- **`journeys_delete`** (v2 on Platform) - Soft-delete a journey and all its versions
- **`journeys_publish`** (v2 on Platform) - Publish (activate) a journey version; on Lite/Enterprise it can also unpublish to draft
- **`journeys_pause`** (v2 on Platform) - Pause an active journey version and its running instances
- **`journeys_resume`** (v2 on Platform) - Resume a paused journey version
- **`journeys_complete`** (Platform) - End an active or paused journey for good
- **`journeys_block_reference`** - Get the journey block JSON schema reference (block types, per-subtype fields, validation rules, sample graphs) for authoring blocks
- **`journeys_templates`** (Platform) - Ready-made journey templates with their block graphs
- **`journeys_stats_summary`** (v2 on Platform) - Summary KPIs for a journey (users entered/engaged/completed/dropped off) with period-over-period change; on Platform also goal conversion
- **`journeys_stats_table`** (v2 on Platform) - Journey instances (one row per user run) with pagination
- **`journeys_stats_performance`** (v2 on Platform) - Time-series journey performance data for trend charts
- **`journeys_stats_uids`** (v2 on Platform) - List user UIDs behind a journey metric (entered, completed, dropped off, goal converted, ...)
- **`journeys_stats_blocks`** (Platform) - Per-block funnel: users who entered and completed each block
- **`journeys_stats_content`** (Platform) - In-app content engagement per message: shown, interacted, button clicks
- **`journeys_stats_active_users`** (Platform) - Users active in a journey, with a daily/weekly/monthly breakdown

### Content (requires `content` plugin)
On Countly Platform these tools manage the new content messages (popup, banner, carousel, survey, push). Legacy content blocks are listed too, and can be read, previewed and deleted, but not edited.
- **`content_blocks_list`** (v2 on Platform) - List content for an app; on Platform with search, status and format filters and paging
- **`content_blocks_get`** (v2 on Platform) - Get one content block / message with its full definition
- **`content_blocks_preview`** (v2 on Platform) - Get a browser preview URL showing the content rendered exactly as end users see it
- **`content_blocks_create`** (v2 on Platform) - Create content that can be delivered through journeys; on Platform a content message built from slides
- **`content_blocks_update`** (v2 on Platform) - Update existing content (on Lite/Enterprise: title, type, blocks, favorite; on Platform: name, status, slides, styling, placement, translations)
- **`content_blocks_delete`** (v2 on Platform) - Delete content (fails while it is still used in a journey or campaign)
- **`content_assets_list`** (v2 on Platform) - List uploaded content images with metadata; on Platform with search, tags and paging
- **`content_assets_upload`** (v2 on Platform) - Upload an image asset (base64; max 5MB, or 10MB on Platform)
- **`content_assets_update`** (v2 on Platform) - Update an asset's name and/or tags
- **`content_assets_delete`** (v2 on Platform) - Delete an uploaded content asset
- **`content_langs_list`** - List languages eligible for content translations

### Flows (requires `flows` plugin)
- **`flows_list`** (Platform) - List saved user flows with anchor, direction, period and status
- **`flows_get`** (Platform) - Definition of one saved flow
- **`flows_data`** (Platform) - Top events per step from the anchor event, with the strongest transitions
- **`flows_dropoff`** (Platform) - What users did instead of an expected next step

### Ratings (requires `star-rating` plugin)
- **`ratings_widgets_list`** (Platform) - Rating widgets with status, times shown, responses and average rating
- **`ratings_stats`** (Platform) - Responses, average and 1-5 distribution of one widget for a period
- **`ratings_comments`** (Platform) - Individual responses (rating, comment, email, user) of one widget

### Campaigns (requires `campaigns` plugin)
- **`campaigns_list`** (Platform) - Push, in-app, survey and rating campaigns with status and delivery counters
- **`campaigns_get`** (Platform) - Full definition of one campaign
- **`campaigns_results`** (Platform) - Delivery funnel of one campaign (events and users per stage)

### AI Assistants (requires `ai-assistants` plugin)
- **`ai_assistants_analytics`** (Platform) - LLM assistant analytics: overview, conversations, tools, models, quality, cost, performance, adoption

### Tasks & Notifications
- **`tasks_list`** (Platform) - Background tasks and long-running reports with status and timing
- **`task_result`** (Platform) - Stored result of a finished background task
- **`notifications_list`** (Platform) - The connected user's dashboard notifications and unread count

### Geo, Revenue
- **`geo_locations_list`** (Platform, requires `geo` plugin) - Saved geo locations (geofences)
- **`revenue_iap_events`** (Platform, requires `revenue` plugin) - Events configured as in-app purchases

All tools support flexible app identification via either `app_id` or `app_name` parameter.

### Stage (requires `stage` plugin and a Stage View or Edit level)
- **`stage_reference`** (Platform) - Scene and demo company format: looks, themes, steps, delivery modes, layers, paper sizes, accepted piece ids
- **`stage_status`** (Platform) - Whether the server serves Stage's public host, on which name, and why not
- **`stage_pieces_list`** (Platform) - Pieces the server accepts in scene layers, with what each renders and when to use it
- **`stage_pieces_get`** (Platform) - One piece's props (kinds, options, defaults), example start props and data grid
- **`stage_templates_list`** (Platform) - Starters and Library examples to start from: decks, one-pagers, responsive sections, patterns
- **`stage_templates_get`** (Platform) - One template's outline or full scene
- **`stage_scenarios_list`** (Platform) - Recorded product walkthroughs an app page plays, with their chapters
- **`stage_scenarios_get`** (Platform) - One scenario's chapters and, optionally, its script steps
- **`stage_scenes_list`** (Platform) - Scenes with canvas size, revision, authors and publishing state
- **`stage_scenes_get`** (Platform) - One scene: outline (look, delivery, steps, layers) or full JSON, versions, public URLs and embed snippet
- **`stage_scenes_create`** (Platform) - Create a scene draft from a template, from JSON, or empty with name, look, theme, delivery and size (A4 / Letter)
- **`stage_scenes_update`** (Platform) - Save a scene draft: replace its JSON or change single fields; concurrent saves are refused
- **`stage_scenes_edit`** (Platform) - Build or change a scene with operations: layers, steps, scenarios played, delivery, responsive fit and breakpoints; checked before saving
- **`stage_scenes_validate`** (Platform) - Dry-run a scene: would it save and publish, what the server drops, which props pieces ignore
- **`stage_scenes_delete`** (Platform) - Delete a never-published scene
- **`stage_scenes_publish`** (Platform) - Publish the saved scene as a new immutable version; returns URLs and embed snippets per delivery (presentation, player, single page)
- **`stage_scenes_set_latest`** (Platform) - Roll the published scene back or forward to a stored version
- **`stage_scenes_unpublish`** (Platform) - Hide a published scene (pinned version URLs keep working)
- **`stage_scenes_restore`** (Platform) - Show an unpublished scene again
- **`stage_companies_list`** (Platform) - Demo companies with public / referenced state
- **`stage_companies_get`** (Platform) - One demo company: base project, colours, renames, volume scale
- **`stage_companies_create`** (Platform) - Create a demo company that dresses a mock project for a prospect
- **`stage_companies_update`** (Platform) - Change a demo company (refused once a published version names it)

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

## Server Discovery

The server provides a `.well-known` discovery endpoint for automated configuration (HTTP mode only):

```bash
curl http://localhost:3000/.well-known/mcp-manifest.json
```

This manifest provides server metadata including:
- Server name, version, and description
- Supported MCP protocol version
- Available endpoints (MCP, health, etc.)
- Supported transports (stdio, HTTP/SSE)
- Server capabilities (tool count, categories, features)
- Authentication methods
- Documentation links
- Repository information

This endpoint can be used by MCP clients for automatic server discovery and capability detection.

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
- Transport layer (stdio and HTTP/SSE)
- End-to-end server connectivity
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
- GitHub Issues: [countly/countly-mcp-server](https://github.com/countly/countly-mcp-server)
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
