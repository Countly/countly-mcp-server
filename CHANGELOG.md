# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Removed
- **Jobs module** — dropped the `jobs_list` and `job_runs` tools from the `core` category. Both called `/o?method=jobs`, which is not documented in the Countly API reference and has no first-party spec; operators looking for background-task visibility should use the documented `/o/tasks/*` endpoints directly.
- **`views_segments` tool** — removed the `views_segments` tool (was calling `/o?method=get_view_segments`, which is not documented in the Countly API reference). For view segmentation discovery use `metadata_get` or `queriable_fields_list` with the `[CLY]_view` event.

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

[1.2.1]: https://github.com/Countly/countly-mcp-server/compare/v1.2.0...v1.2.1
[1.2.0]: https://github.com/Countly/countly-mcp-server/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/Countly/countly-mcp-server/compare/v1.0.1...v1.1.0
[1.0.1]: https://github.com/Countly/countly-mcp-server/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/Countly/countly-mcp-server/releases/tag/v1.0.0
