# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed
- **`hooks_*` and `times_of_day` tools were listed but impossible to call** (#141) — both modules (added in v1.0.2) were wired into `getAllToolDefinitions()`/`getAllToolHandlers()` but never into `getAllToolMetadata()`, which is the only routing source the `CallToolRequestSchema` dispatcher uses. Every call to `hooks_list`, `hooks_test`, `hooks_create`, `hooks_update`, `hooks_delete`, or `times_of_day` returned `McpError -32601 "Unknown tool"`. Their `inputSchema` fields were also raw zod objects, which serialize as `{"def":{...}}` (no `properties`, no descriptions) in the `tools/list` response, so clients saw the tools with zero visible parameters. Both modules are now migrated to the metadata/class pattern used by the rest of the codebase, with hand-written conservative JSON Schema (flat `type`/`properties`/`required`, inline descriptions, string enums — the same client-compatible subset as every other module). As a side effect, `hooks_create`'s `enabled: true` default now actually applies (the zod `.default()` never ran because the schema was never parsed at runtime).
- **Regression tests for tool registration** (#141) — new `tests/tool-registration.test.ts` asserts every tool returned by `getAllToolDefinitions()` has a dispatcher route in `getAllToolMetadata()` with a real method on its tool class, and that its schema is plain JSON-round-trip-safe JSON Schema. The four modules that still declare zod schemas (`datapoint`, `server-logs`, `dashboards`, `email-reports` — routable, but parameter-less in `tools/list`) are tracked in an explicit known-offenders list that must shrink, never grow.

### Added
- **Journey stats tools** — `journeys_stats_summary` (KPIs with period-over-period change), `journeys_stats_table` (per-block breakdown, taskmanager-aware: long queries return a task id that can be passed back as `task_id`), `journeys_stats_performance` (time series), and `journeys_stats_uids` (user UID lists per stat bucket), wrapping `/o/journey-engine/stats/*`.
- **`journeys_block_reference` tool** — static reference documentation for the journey block JSON schema (block types, per-subtype fields, filter/condition formats, publish-time validation rules, and sample graphs), compiled from the journey engine source. Includes runtime caveats the samples get wrong: the engine reads `nextBlock` (not `next_block`), only canonical `BlockSubTypes` strings match at runtime, and `call-webhook`/`run-code`/`repeat`/push/email blocks are not implemented. Referenced from the `blocks` parameter descriptions of `journeys_create`/`journeys_update` so models fetch the schema before authoring graphs.
- **Content asset tools** — `content_assets_list`, `content_assets_upload` (base64 in, multipart out, 5MB limit enforced client-side), `content_assets_update`, `content_assets_delete`, wrapping `/o/content/assets` and `/i/content/asset-*`, plus `content_langs_list` for translation-eligible languages via `/o/content/langs`.
- **Journeys tools** — new `journeys` category (requires the `journey_engine` plugin, Countly Enterprise): `journeys_list`, `journeys_get`, `journeys_create`, `journeys_update`, `journeys_delete`, `journeys_publish`, `journeys_pause`, `journeys_resume`. Write operations post JSON bodies to `/i/journey-engine/journeys/*` and reads use `/o/journey-engine/*`, matching the API exposed by both the current enterprise plugins and the new Countly platform codebase. Update/publish/pause/resume resolve the target journey version automatically when the journey has exactly one candidate version; otherwise they list the available versions and ask for `version_id`.
- **Content blocks tools** — new `content` category (requires the `content` plugin, Countly Enterprise): `content_blocks_list`, `content_blocks_get`, `content_blocks_preview`, `content_blocks_create`, `content_blocks_update`, `content_blocks_delete`, wrapping `/o/content`, `/o/content/by-id`, `/i/content/save`, and `/i/content/delete`. `content_blocks_update` fetches the existing block first so omitted fields (title, type, blocks, favorite) are preserved. `content_blocks_preview` validates the block exists, then returns a link to the server's public `/_external/content` renderer (the page SDK webviews load) so users can see the block rendered in a browser.

## [1.3.0] - 2026-04-23

### Changed
- **Anonymous server identification in telemetry** — every analytics event now carries a short opaque `server` segment: a 16-hex-char SHA-256 prefix of the normalized Countly server URL. This lets `stats.count.ly` aggregate per-distinct-server counts (for any event type) without ever seeing the raw URL. The device ID stays at `"mcp"` — only events carry the hash. In HTTP transport the hash is recomputed per request from the request-scoped server URL (via `AsyncLocalStorage`), so multi-tenant deployments naturally emit per-tenant counts. The README analytics section was updated to reflect what is (and isn't) tracked. Opt-in still required (`ENABLE_ANALYTICS=true`).

### Security
- **Cross-tenant auth token mixing (HTTP transport)** (#110) — the HTTP transport previously mutated a shared axios client and shared config on every incoming request. Concurrent requests could interleave at `await` boundaries, causing tenant A's in-flight API calls to go out with tenant B's token. Fixed by constructing a per-request axios instance (with the `countly-token` header baked in) and passing state from the HTTP middleware to the MCP handler through `AsyncLocalStorage`. The shared client is now used only as a stdio-mode fallback and is never mutated per-request.
- **Cross-tenant data leak via shared AppCache** (#110) — the apps cache was a single instance per process, so the first tenant's apps were visible to every other tenant's `resolveAppId` lookups for up to five minutes. Replaced with `AppCacheRegistry`, which keeps one `AppCache` per tenant keyed by SHA-256(token) so the raw token is never held as a Map key.
- **SSRF via `X-Countly-Server-Url` / `?server_url=`** (#110) — the HTTP transport accepted a caller-supplied Countly server URL and wired it into the outbound axios client with no validation, allowing any caller to redirect outbound requests at cloud metadata (169.254.169.254), Docker internal services, loopback, and private RFC 1918 ranges (with the response body returned in tool output). New `assertSafeServerUrl` rejects loopback, link-local, RFC 1918, carrier-grade NAT, `0.0.0.0/8`, IPv6 private ranges, `.local`/`.localhost` hostnames, and non-`http(s)` schemes. Not a full DNS-rebinding defense — that still requires egress firewalling — but closes the trivial syntactic bypass.
- **Telemetry default flipped to opt-in** (#110) — the README has always said "analytics disabled by default" but the code evaluated `process.env.ENABLE_ANALYTICS !== 'false'`, which was `true` for any empty/unset value. Analytics now fire only when `ENABLE_ANALYTICS=true` is explicitly set. README table (`Default: false`) and prose updated to match.
- **Auth token in URL query params deprecated** (#110) — tokens passed via `?auth_token=` leak into access logs, reverse-proxy logs, browser history, and Referer headers. The transport still accepts them for backward compatibility but now emits a rate-limited security warning to stderr and the behavior is scheduled for removal in a future release. Use `X-Countly-Auth-Token` header instead.
- **CORS allowlist is now configurable** (#110) — defaults remain `Access-Control-Allow-Origin: *` (backward compatible) but operators can lock it down via `COUNTLY_CORS_ALLOWED_ORIGINS="https://a.example.com,https://b.example.com"`. When a specific allowlist is set, the server echoes only allowed origins and adds `Vary: Origin`; pre-flight requests from disallowed origins get a `403`.
- **Per-IP rate limiting on `/mcp`** (#110) — sliding-window, in-memory. Defaults to 120 requests per minute per IP; tunable via `COUNTLY_RATE_LIMIT_RPM=<n>` (set to `0` to disable). Uses the socket address by default; honors `X-Forwarded-For` only when `COUNTLY_TRUST_PROXY=true` is set. Returns `429 Too Many Requests` with `Retry-After`.
- **CORS flag logic bug** (#110) — `httpConfig?.cors || true` always evaluated to `true` (it treats `false` as falsy), so `--no-cors` didn't actually disable CORS. Fixed to use nullish coalescing (`?? true`).
- **Auth-token residue in `LoopDetector` history** (#110) — when a caller passed `countly_auth_token` as a tool argument the loop detector retained the raw args for up to 30s, risking exposure in heap snapshots / crash dumps. The detector now scrubs sensitive arg keys (`countly_auth_token`) to `[REDACTED]` before storing.
- **Token redaction in error messages** (#110) — `extractErrorDetails` and `Analytics.trackError` now run error strings through `redactSensitiveInMessage`, which redacts `auth_token=`/`api_key=`/`token=` query-param values, `"auth_token":"..."` JSON fields, and `countly-token:`/`Authorization:` header lines. Defence-in-depth against an upstream Countly server accidentally echoing a token in an error body, and against the token reaching the telemetry endpoint when analytics is opted in.
- **Dev-dependency CVE** (#110) — `npm audit fix` applied; `brace-expansion` moderate DoS cleared.
- **Request-body size cap** (#110) — new `COUNTLY_MAX_BODY_BYTES` (default 1 MiB). Requests that declare (or stream) more bytes get `413 Payload Too Large` and the socket is destroyed so a malicious client can't keep shipping data.
- **Per-IP concurrent-connection cap** (#110) — new `COUNTLY_MAX_CONCURRENT_PER_IP` (default 50). Closes the connection-exhaustion and slow-loris amplification primitive that Node's raw `http.createServer` leaves wide open.
- **Server timeouts tightened** (#110) — `requestTimeout=30s`, `headersTimeout=10s`, `keepAliveTimeout=5s`, `timeout=60s`. Complements the concurrent-connection cap against slow clients.
- **Opt-in structured request log** (#110) — new `COUNTLY_REQUEST_LOG=true` emits one NDJSON line per request to stderr (`{ts, ip, method, path, status, durationMs, rateLimitHit}`). No tokens, bodies, or headers logged. Useful for piping into aggregators to spot abuse patterns.

### Removed
- **Jobs module** (#112) — dropped the `jobs_list` and `job_runs` tools from the `core` category. Both called `/o?method=jobs`, which is not documented in the Countly API reference; operators looking for background-task visibility should use the documented `/o/tasks/*` endpoints directly.
- **`views_segments` tool** (#112) — removed the `views_segments` tool (was calling `/o?method=get_view_segments`, which is not documented in the Countly API reference). For view segmentation discovery use `metadata_get` or `queriable_fields_list` with the `[CLY]_view` event.

### Changed
- **Tool descriptions rewritten for model-pickability** (#110) — rewrote the `description` string and every input-schema field description across all ~128 tool definitions in `src/tools/*.ts`. Descriptions now name the concrete endpoint, include a disambiguation sentence pointing to siblings, standardize `app_id`/`app_name`/`period` wording everywhere, add `WARNING: irreversible` to destructive tools, and add `Requires the <name> plugin` to plugin-gated tools. The original `app_analytics_summary` "will show available apps" false promise and similar lies across other tools are gone. No handler logic, schema types, or runtime behavior changed — description strings only.
- **`metadata_get` is now always available** (#110) — moved out of the `drill` category into a new `metadata` category with `availableByDefault: true`. The handler already degraded gracefully without the drill plugin (returning custom events, built-in `[CLY]_*` event segments, and system fields); it was just hidden on drill-less servers by its category classification.

### Fixed
- **`notes_create` TypeError when `color` omitted** (#110) — `handleCreateNote` called `color.toLowerCase()` unconditionally while `color` was optional. Guarded the call and marked `note` and `ts` as `required` in the schema (they were already dereferenced unguarded).
- **`hooks_update` silent asymmetry on trigger fields** (#110) — the handler silently ignored partial trigger updates when only one of `trigger_type` or `trigger_config` was supplied while still reporting success. Now throws `McpError(InvalidParams)` with a clear message; both fields must be supplied together, or neither.
- **Version string drift** (#110) — the MCP handshake (`Server({version})`), the well-known manifest, and `package.json` reported three different versions. All three now read from `package.json` at runtime via `createRequire(import.meta.url)`.

## [1.2.1] - 2026-04-22

### Fixed
- **npx startup crash**: Fixed the main-module detection so the server actually starts when launched through a `bin` symlink. The previous check compared `import.meta.url` directly against `` `file://${process.argv[1]}` ``, which never matched when Node invoked the script through `node_modules/.bin/countly-mcp-server` (argv[1] is the symlink path, `import.meta.url` is the resolved real path). As a result, `npx countly-mcp-server` and MCP clients that launched it would see the process exit immediately after receiving `initialize`. The check now resolves `argv[1]` via `realpathSync` and compares to `pathToFileURL(...).href`.

## [1.2.0] - 2026-04-22

### Added
- **npx execution support** (#107): The server can now be run directly via `npx countly-mcp-server` without cloning or building. Exposed `build/index.js` as a `bin` entry in `package.json` and added a `prepack` script so the published tarball always contains a freshly built entrypoint. README documents the new usage path with an example MCP client configuration.
- **Events module**: new `events_delete` tool (#47): deletes events and all their data for an application via `/i/events/delete_events`.

### Fixed
- **Schema compatibility**: replaced `z.union` with simple types in dashboard widget schemas to match MCP client expectations.
- **Schema compatibility**: removed unsupported `allOf` from the `query_data` tool schema.
- **Events**: `events_update` now calls the correct `/i/events/edit_map` endpoint; tests updated accordingly.
- TypeScript build errors.

### Changed
- Dependency bumps across runtime and dev dependencies (via Dependabot), including: `@modelcontextprotocol/sdk`, `axios`, `hono`, `@hono/node-server`, `express`, `express-rate-limit`, `body-parser`, `dotenv`, `qs`, `path-to-regexp`, `follow-redirects`, `picomatch`, `vite`, `rollup`, `glob`, `js-yaml`, `flatted`, `minimatch`, `ajv`, and multiple grouped development-dependency updates.
- CI dependency bumps: `actions/checkout`, `actions/upload-artifact`, `actions/download-artifact`, `docker/setup-buildx-action`, `docker/login-action`, `docker/setup-qemu-action`.

## [1.1.0] - 2025-11-12

### Added
- **MCP Resources Support**: Implemented full resources capability for providing read-only context to AI assistants
  - `resources/list`: List all available resources across applications
  - `resources/read`: Read specific resource content by URI
  - Resource types: app configuration (`countly://app/{id}/config`), event schemas (`countly://app/{id}/events`), analytics overview (`countly://app/{id}/overview`)
  - Resources provide AI context without requiring tool calls, improving efficiency

- **MCP Prompts Support**: Implemented full prompts capability with 8 pre-built analysis templates
  - `prompts/list`: List all available prompt templates
  - `prompts/get`: Get specific prompt with arguments
  - Prompt templates:
    * `analyze_crash_trends`: Analyze crash and error patterns over time
    * `generate_engagement_report`: Comprehensive user engagement analysis
    * `compare_app_versions`: Compare performance metrics between versions
    * `user_retention_analysis`: Analyze retention patterns and cohort behavior
    * `funnel_optimization`: Conversion funnel analysis with optimization suggestions
    * `event_health_check`: Event tracking implementation quality check
    * `identify_churn_risk`: Find users showing signs of decreased engagement
    * `performance_dashboard`: Comprehensive application performance overview
  - Prompts can be exposed as slash commands in MCP clients for guided workflows

- **Hooks Module** (6 tools): Webhook and automation management based on `hooks` plugin
  - `hooks_list`: List all webhooks/hooks configured for an app
  - `hooks_test`: Test hook configuration with mock data before creating
  - `hooks_create`: Create webhooks with multiple trigger types (IncomingDataTrigger, APIEndPointTrigger, InternalEventTrigger, ScheduledTrigger) and effects (HTTPEffect, EmailEffect, CustomCodeEffect)
  - `hooks_update`: Update existing webhook configurations
  - `hooks_delete`: Delete webhooks by ID
  - `hooks_internal_triggers_get`: Get list of 23 available internal Countly events for triggers

- **Times of Day Module** (1 tool): User behavior pattern analysis based on `times-of-day` plugin
  - `times_of_day`: Analyze when users are most active throughout the day/week in their local time

- **Dashboards Module** (8 tools): Custom dashboard management based on `dashboards` plugin
  - `dashboards_list`: List all available dashboards
  - `dashboards_data`: Get widgets and data for specific dashboard
  - `dashboards_create`: Create dashboards with sharing, auto-refresh, and themes
  - `dashboards_update`: Update dashboard configuration
  - `dashboards_delete`: Delete dashboards
  - `dashboards_widget_add`: Add widgets with full configuration
  - `dashboards_update_widget`: Update widget position/size in grid layout
  - `dashboards_widget_remove`: Remove widgets from dashboard

- **Email Reports Module** (7 tools): Periodic email report management based on `reports` plugin
  - `email_reports_list`: List all configured email reports
  - `email_reports_core_create`: Create reports with analytics, events, crashes, and star-rating metrics
  - `email_reports_dashboard_create`: Create reports for specific dashboards
  - `email_reports_update`: Update report configuration
  - `email_reports_preview`: Preview reports before sending
  - `email_reports_send`: Manually trigger report sending
  - `email_reports_delete`: Delete report configurations

- **Server Logs Module** (2 tools): Server log file access based on `errorlogs` plugin
  - `server_logs_files_list`: List available log files (api, dashboard, jobs)
  - `server_logs_contents`: View log file contents (non-Docker deployments only)

- **Datapoint Module** (3 tools): Data point monitoring for billing/capacity planning based on `server-stats` plugin
  - `datapoints_stats`: Get overall data point collection statistics
  - `get_top_apps_by_datapoints`: Rank apps by data point usage
  - `datapoints_punch_card`: Hourly load pattern visualization

- **Filtering Rules Module** (4 tools): Request blocking management based on `blocks` plugin
  - `filtering_rules_list`: List all configured blocking rules
  - `filtering_rules_create`: Create rules to block requests by IP, version, or properties
  - `filtering_rules_update`: Update existing blocking rules
  - `filtering_rules_delete`: Delete blocking rules

- **Compliance Hub Module** (4 tools): Data consent and privacy management based on `compliance-hub` plugin
  - `list_consents`: List all consent features configured for an app
  - `get_consent_history`: Get change history for a specific consent feature
  - `export_user_data`: Request data export for a specific user
  - `anonymize_user`: Anonymize user data while preserving analytics

- **SDKs Module** (2 tools): SDK version monitoring based on `sdks` plugin
  - `get_sdks_list`: List SDK versions used by apps
  - `get_sdks_stats`: Get detailed SDK usage statistics

- **Logger Module** (1 tool): System log viewing based on `logger` plugin
  - `get_logger_data`: Retrieve and filter system logs

- **AB Testing Module** (8 tools): A/B test experiment management based on `ab-testing` plugin
  - `list_experiments`: List all A/B testing experiments
  - `get_experiment`: Get detailed experiment information
  - `create_experiment`: Create new experiments with control/variant groups
  - `update_experiment`: Update experiment configuration
  - `start_experiment`: Start running an experiment
  - `stop_experiment`: Stop a running experiment
  - `finish_experiment`: Mark experiment as finished
  - `delete_experiment`: Delete experiments

- **Remote Config Module** (8 tools): Remote configuration management based on `remote-config` plugin
  - `list_remote_config_parameters`: List all parameters
  - `get_remote_config_parameter`: Get specific parameter details
  - `create_remote_config_parameter`: Create new parameters
  - `remote_config_parameters_update`: Update parameters
  - `remote_config_parameters_delete`: Delete parameters
  - `list_remote_config_conditions`: List targeting conditions
  - `create_remote_config_condition`: Create targeting conditions
  - `remote_config_conditions_delete`: Delete conditions

- **Retention Module** (1 tool): User retention analysis based on `retention_segments` plugin
  - `retention_data`: Analyze user retention cohorts over time

- **Live Users Module** (6 tools): Real-time concurrent user monitoring based on `concurrent_users` plugin
  - `live_users`: Get current concurrent users
  - `get_live_user_details`: Get detailed information about live users
  - `get_live_cities`: See cities with active users
  - `get_live_countries`: See countries with active users
  - `get_live_durations`: Analyze session durations of live users
  - `get_live_sources`: See traffic sources of live users

- **Formulas Module** (6 tools): Custom metric formula management based on `formulas` plugin
  - `formulas_list`: List all configured formulas
  - `get_formula`: Get specific formula details
  - `create_formula`: Create custom metric formulas
  - `update_formula`: Update formula configuration
  - `formulas_delete`: Delete formulas
  - `get_formula_data`: Get calculated formula data

- **Funnels Module** (7 tools): Conversion funnel analysis based on `funnels` plugin
  - `funnels_list`: List all configured funnels
  - `funnels_data`: Get funnel conversion data
  - `funnels_step_users`: Get users who reached a specific step
  - `funnels_dropoff_users`: Get users who dropped off between steps
  - `funnels_create`: Create conversion funnels with multiple steps
  - `funnels_update`: Update funnel configuration
  - `funnels_delete`: Delete funnels

- **Cohorts Module** (8 tools): User cohort management based on `cohorts` plugin
  - `cohorts_list`: List all cohorts
  - `cohorts_data`: Get cohort data over a period
  - `cohorts_create`: Create user cohorts with conditions
  - `cohorts_update`: Update cohort configuration
  - `cohorts_delete`: Delete cohorts
  - `cohorts_details_users`: Get users in a cohort
  - `recalculate_cohort`: Trigger cohort recalculation
  - `cohorts_details_user_count`: Get current user count

- **User Profiles Module** (4 tools): App user profile management based on `users` plugin
  - `search_user_profiles`: Search users with filters and sorting
  - `get_user_profile`: Get detailed user profile
  - `export_user_profiles`: Export user data to CSV
  - `get_user_profile_schema`: Get available user properties

- **Drill Module** (5 tools): Advanced query and segmentation based on `drill` plugin
  - `drill_query`: Execute custom drill queries
  - `get_drill_meta`: Get available drill properties
  - `get_drill_bookmarks`: List saved drill queries
  - `drill_bookmarks_create`: Save drill queries
  - `drill_bookmarks_delete`: Delete saved queries

- **Core Module Enhancements** (2 additional tools):
  - `jobs_list`: List background jobs with pagination and sorting
  - `job_runs`: Get execution history for specific jobs

- **Analytics Module Enhancements** (4 additional tools):
  - `user_loyalty`: Analyze user loyalty and session count distribution
  - `session_durations`: Analyze session duration patterns
  - `session_frequency`: Analyze time between user sessions
  - `slipping_users`: Identify users becoming inactive

### Changed
- **Tool Count**: Expanded from 27 tools to 132 tools across 30 categories
- **Plugin Coverage**: Added support for 21 additional Countly plugins
- **Plugin Availability**: Automatically check plugin availability for specific tools, ensuring only compatible tools are exposed based on server configuration
- **URL Parameter Authentication**: Added support for passing Server URL and auth token as URL parameters for flexible authentication
- **Analytics Tracking**: Added comprehensive anonymous usage analytics with opt-out capability
- **Error Handling**: Improved API error messages and formatting throughout all modules
- **Testing**: Expanded test suite with 223 tests including analytics, transport, and tool configuration tests
- **Documentation**: Updated README with all new modules and tool descriptions
- **Configuration**: Added plugin-based tool filtering and availability checks
- **Home Page**: Added informational home page with basic project information and links
- **Server Discovery**: Added `.well-known/mcp-manifest.json` endpoint for automated server discovery and capability detection

### Fixed
- **Security Updates**: Updated SECURITY.md with vulnerability levels and reward structure
- **URL Handling**: Improved URL parameter support for server URL and auth token

### Testing
- Added 748 new analytics tests covering tracking, sessions, events, and error handling
- Added 141 core tools tests for new job management features
- Added 399 error handler tests for improved error scenarios
- Added comprehensive transport integration tests for stdio and HTTP/SSE modes
- Updated tool configuration tests to cover all 30 categories and 132 tools

## [1.0.1] - 2025-11-07

### Added
- **Transport Integration Tests**: Added comprehensive integration tests for both stdio and HTTP/SSE transports (`tests/transport.test.ts`)
  - 13 new tests covering initialization, tool listing, health checks, CORS, and SSE streaming
  - Tests validate both stdio and HTTP/SSE transport modes work correctly
- **HTTP Header Authentication**: Added support for passing Countly credentials via custom HTTP headers
  - `X-Countly-Server-Url` header for specifying server URL
  - `X-Countly-Auth-Token` header for authentication token
  - Headers are extracted and applied dynamically per request
- **npm Publishing Workflow**: Added GitHub Actions workflow for automated npm package publishing on version tags

### Changed
- **Upgraded Transport Layer**: Migrated from deprecated `SSEServerTransport` to modern `StreamableHTTPServerTransport`
  - Uses MCP protocol version 2025-03-26 (Streamable HTTP specification)
  - Operates in stateless mode (`sessionIdGenerator: undefined`) for better client compatibility
  - Eliminates "legacy SSE" warnings in VS Code and other MCP clients
- **Enhanced Authentication Flexibility**: 
  - Server URL is now optional in environment variables - can be provided via HTTP headers or client configuration
  - Credentials fallback logic: metadata → args → config (from headers) → environment → file
  - `getCredentials()` method now checks `this.config.authToken` as fallback (set from HTTP headers)
- **Docker Configuration Improvements**:
  - Updated documentation to reflect environment-based configuration
  - Enhanced Dockerfile with proper build stages and health checks
- **Documentation Updates**:
  - Updated `.env.example` with clearer instructions for HTTP header-based authentication
  - Enhanced `README.md` with transport configuration examples
  - Updated `DOCKER.md` with secure configuration practices
  - Updated VS Code MCP integration example (`examples/vscode-mcp.md`)

### Fixed
- **Security: ReDoS Vulnerability**: Fixed Regular Expression Denial of Service (ReDoS) vulnerability in URL normalization
  - Replaced regex `/\/+$/` with iterative `while` loop approach
  - Prevents potential DoS attacks via maliciously crafted URLs
  - Applied fix in both `src/index.ts` and `src/lib/config.ts`
- **Test Suite Improvements**:
  - Updated authentication tests to reflect new priority order
  - Fixed test expectations for optional server URL configuration
  - Updated error messages in tests to match new authentication flow

### Security
- **ReDoS Mitigation**: Fixed Regular Expression Denial of Service vulnerability in URL normalization (CodeQL alert)

## [1.0.0] - 2025-10-29

Initial release of Countly MCP Server.

### Features
- Model Context Protocol (MCP) server for Countly analytics platform
- Support for stdio and HTTP/SSE transport layers
- Comprehensive Countly API integration:
  - Analytics data retrieval (sessions, users, locations, events, etc.)
  - Crash analytics
  - App management
  - Dashboard users management
  - Alerts configuration
  - Notes management
  - Views analytics
  - Database operations
  - Event management
  - App user management
- Environment-based configuration
- Docker support with multi-architecture builds
- Comprehensive test suite
- GitHub Actions CI/CD integration

[1.3.0]: https://github.com/Countly/countly-mcp-server/compare/v1.2.1...v1.3.0
[1.2.1]: https://github.com/Countly/countly-mcp-server/compare/v1.2.0...v1.2.1
[1.2.0]: https://github.com/Countly/countly-mcp-server/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/Countly/countly-mcp-server/compare/v1.0.1...v1.1.0
[1.0.1]: https://github.com/Countly/countly-mcp-server/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/Countly/countly-mcp-server/releases/tag/v1.0.0
