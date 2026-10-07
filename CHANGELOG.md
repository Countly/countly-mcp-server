# Changelog

All notable changes to this project are documented here, following [Keep a Changelog](https://keepachangelog.com/en/1.0.0/) and [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.7.0] - 2026-10-07

### Security

- Prevented `formulas_run` from saving formulas in read-only deployments.
- Restricted `collections_aggregate` to approved read-only aggregation stages.
- Blocked browser requests using a server-side token unless their origin is explicitly allowed.
- Validated and escaped welcome-page endpoint URLs and prevented shared caching.
- Removed auth tokens and sensitive request details from debug and error logs.

### Added

- Added automatic tool filtering based on enabled plugins, server capabilities, and user permissions.
- Expanded tools for dashboards, events, views, crashes, funnels, journeys, flows, ratings, campaigns, and tasks on supported servers.
- Added Stage tools for creating, editing, validating, publishing, and managing scenes.
- Added MCP tool annotations for read-only, destructive, idempotent, and external actions.
- Added `countly-mcp-server/library` for embedding MCP tools with per-request authentication and permissions.
- Added per-call permission checks for tools that perform different operations depending on their arguments.
- Added tool areas and global-admin classification with complete registry checks.

### Fixed

- Fixed empty HTTP 500 responses after the first request.
- Fixed `notes_create` app assignment and defaults, and corrected `notes_list` counts.
- Fixed `hooks_update` handling of hook list responses.
- Corrected weekly email report days to Monday = 1 through Sunday = 7.
- Clarified when older campaign widgets require migration before they can be opened.
- Made tool listing, routing, permission checks, and errors consistent across all transport modes.
- Bounded capability and app caches and allowed failed capability detection to retry.
- Fixed server capability detection and tool routing in library mode.
- Refreshed the app cache after app creation, updates, and deletion in library mode.
- Made `alerts_create` available for existing-alert updates in update-only configurations and connections.
- Returned tool failures as `isError` results so clients can expose them to the model.
- Clarified real side effects of hook tests, email sending, and destructive tools.
- Fixed HTTP caller-token precedence when a server-side token is configured.
- Corrected the documented authentication priority order.
- Prevented malformed `Host` headers from causing HTTP 500 responses.
- Included apps accessible through user permissions in app lists and name lookups.
- Prevented `retention` from saving a report when `save_report` is false.

### Removed

- Removed the `databases_stats` tool and its dependency on MongoDB command-line utilities.
- Removed the stale static MCP manifest; the discovery endpoint uses the package version and current capabilities.

### Changed

- Added nightly live end-to-end checks and required them before package and Docker releases.
- Updated `@modelcontextprotocol/sdk` to ^1.31.0, `axios` to ^1.20.0, and development dependencies.
- Clarified HTTP server-token deployment guidance and bound Docker quick-start ports to localhost.

## [1.6.0] - 2026-09-21

### Added

- Added an optional `limit` of 1–10000 rows to `query_data` drill queries.
- Added a warning for drill breakdowns with more than three projection keys.

### Fixed

- Fixed `query_data` drill queries ignoring `projection_key` breakdowns.

## [1.5.0] - 2026-08-25

### Security

- Blocked caller-supplied hostnames resolving to private addresses and DNS rebinding. (#152)
- Prevented configured auth tokens from being sent to caller-supplied servers. (#152)
- Blocked the RFC 8215 local-use NAT64 address range. (#152)
- Reclassified `hooks_test` as a create operation because it executes real effects. (#165)

### Fixed

- Fixed HTTP request parsing with body-size limits enabled. (#153)
- Corrected welcome-page npm package names and installation commands.
- Clarified that authentication uses a Countly auth token from Token Manager.
- Updated VS Code setup instructions and added Claude Code examples.
- Made welcome-page tool categories and counts reflect the active configuration.
- Corrected manifest tool-category counts.
- Fixed welcome-page CLI examples to use absolute endpoint URLs.

### Added

- Added an embedded Countly favicon for self-hosted and offline deployments.
- Added regression checks for welcome-page setup instructions and tool listings.

### Changed

- Built Docker images on native amd64 and arm64 runners with release verification and timeouts.
- Made automated npm publishing opt-in until trusted publishing is configured.

### Dependencies

- Updated `@modelcontextprotocol/sdk` to ^1.30.0, `axios` to ^1.19.0, and development dependencies.
- Added `ipaddr.js` ^1.9.1 as an explicit dependency for address validation.

## [1.4.0] - 2026-07-09

### Fixed

- Fixed invisible tool parameters and missing defaults in datapoint, server-log, dashboard, and email-report tools. (#142)
- Fixed client-incompatible schemas and widget examples in `alerts_create` and `dashboards_widget_add`. (#142)
- Fixed routing, schemas, and defaults for `hooks_*` and `times_of_day` tools. (#141)
- Added regression checks for tool registration, routing, and JSON Schema compatibility. (#141, #142)

### Added

- Added journey statistics tools for summaries, block breakdowns, time series, and user lists.
- Added `journeys_block_reference` for journey schemas, validation rules, and examples.
- Added content asset listing, upload, update, deletion, and language discovery tools.
- Added journey creation, editing, publishing, pausing, resuming, and deletion tools.
- Added content block listing, preview, creation, editing, and deletion tools.

## [1.3.0] - 2026-04-23

### Security

- Isolated HTTP request credentials to prevent cross-tenant token mixing. (#110)
- Isolated app caches by token to prevent cross-tenant data exposure. (#110)
- Added URL validation to block caller-supplied private addresses and unsafe schemes. (#110)
- Deprecated auth tokens in URL parameters in favor of HTTP headers. (#110)
- Added configurable CORS origin allowlists. (#110)
- Added configurable per-IP request rate limits. (#110)
- Fixed `--no-cors` being ignored. (#110)
- Redacted auth tokens from loop-detection history. (#110)
- Redacted credentials from error messages. (#110)
- Fixed a development dependency denial-of-service vulnerability. (#110)
- Added a configurable request-body size limit, defaulting to 1 MiB. (#110)
- Added a configurable per-IP concurrent-connection limit, defaulting to 50. (#110)
- Tightened HTTP request, header, and connection timeouts. (#110)
- Added optional structured HTTP request logs without credentials or bodies. (#110)

### Removed

- Removed `jobs_list` and `job_runs`, which used undocumented endpoints. (#112)
- Removed `views_segments`; use `metadata_get` or `queriable_fields_list` instead. (#112)

### Changed

- Clarified tool descriptions, parameters, plugin requirements, and destructive-action warnings. (#110)
- Made `metadata_get` available without the Drill plugin. (#110)

### Fixed

- Fixed `notes_create` failing when `color` was omitted and marked required inputs correctly. (#110)
- Required `hooks_update` trigger type and configuration to be supplied together. (#110)
- Aligned handshake, manifest, and package version strings. (#110)

## [1.2.1] - 2026-04-22

### Fixed

- Fixed immediate startup exits when launched through `npx` or a bin symlink.

## [1.2.0] - 2026-04-22

### Added

- Added direct execution through `npx countly-mcp-server`. (#107)
- Added `events_delete` for deleting events and their app data. (#47)

### Fixed

- Fixed dashboard widget schema compatibility with MCP clients.
- Removed unsupported `allOf` from the `query_data` schema.
- Fixed `events_update` using the wrong endpoint.
- Fixed TypeScript build errors.

### Changed

- Updated runtime and development dependencies.
- Updated GitHub Actions and Docker build dependencies.

## [1.1.0] - 2025-11-12

### Added

- Added MCP resources for app configuration, event schemas, and analytics overviews.
- Added eight MCP prompts for engagement, crashes, retention, funnels, events, churn, and performance analysis.
- Added hook listing, testing, creation, editing, deletion, and trigger discovery.
- Added times-of-day analysis for daily and weekly user activity.
- Added dashboard management, widget editing, and dashboard data tools.
- Added email report creation, editing, preview, sending, and deletion.
- Added server log file listing and content retrieval.
- Added datapoint statistics, app rankings, and hourly load analysis.
- Added filtering rule listing, creation, editing, and deletion.
- Added consent history, user data export, and anonymization tools.
- Added SDK version and usage statistics.
- Added system log retrieval and filtering.
- Added A/B experiment creation, editing, lifecycle, and deletion tools.
- Added remote configuration parameter and targeting-condition management.
- Added user retention cohort analysis.
- Added live user counts, profiles, locations, session durations, and traffic sources.
- Added custom formula management and calculated metric retrieval.
- Added funnel analysis, user progression, drop-off, creation, editing, and deletion.
- Added cohort management, recalculation, user lists, and user counts.
- Added user profile search, retrieval, CSV export, and property discovery.
- Added Drill queries, property discovery, and bookmark management.
- Added background job listing and execution history.
- Added user loyalty, session duration, session frequency, and slipping-user analysis.

### Changed

- Expanded from 27 to 132 tools across 30 categories.
- Added support for 21 additional Countly plugins.
- Added automatic plugin availability checks for compatible tool exposure.
- Added server URL and auth-token URL parameters.
- Improved API error messages and formatting.
- Expanded transport and tool-configuration test coverage.
- Updated the README with new modules and tool descriptions.
- Added plugin-based tool filtering and configuration.
- Added an informational home page with project links.
- Added `.well-known/mcp-manifest.json` for server discovery.

### Fixed

- Updated security documentation with vulnerability levels and reward details.
- Improved server URL and auth-token URL parameter handling.

### Testing

- Added core job-management and error-handling tests.
- Added stdio and HTTP transport integration tests.
- Expanded configuration tests to cover all 30 categories and 132 tools.

## [1.0.1] - 2025-11-07

### Added

- Added integration tests for stdio and HTTP transports.
- Added HTTP header authentication through `X-Countly-Server-Url` and `X-Countly-Auth-Token`.
- Added automated npm publishing on version tags.

### Changed

- Migrated to stateless Streamable HTTP transport for improved MCP client compatibility.
- Allowed server URLs and credentials to be supplied through HTTP headers and client configuration.
- Improved Docker build stages, health checks, and configuration documentation.
- Updated environment, README, Docker, and VS Code setup examples.

### Fixed

- Updated authentication tests, optional server URL expectations, and error messages.

### Security

- Fixed a regular expression denial-of-service vulnerability in URL normalization.

## [1.0.0] - 2025-10-29

Initial release of Countly MCP Server.

### Features

- Added a Model Context Protocol server for Countly.
- Added stdio and HTTP/SSE transports.
- Added analytics data retrieval for sessions, users, locations, events, and views.
- Added crash analytics tools.
- Added app and dashboard-user management.
- Added alert configuration and note management.
- Added database, event, and app-user operations.
- Added environment-based configuration.
- Added Docker support with multi-architecture builds.
- Added automated tests and GitHub Actions CI/CD.

[1.3.0]: https://github.com/Countly/countly-mcp-server/compare/v1.2.1...v1.3.0
[1.2.1]: https://github.com/Countly/countly-mcp-server/compare/v1.2.0...v1.2.1
[1.2.0]: https://github.com/Countly/countly-mcp-server/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/Countly/countly-mcp-server/compare/v1.0.1...v1.1.0
[1.0.1]: https://github.com/Countly/countly-mcp-server/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/Countly/countly-mcp-server/releases/tag/v1.0.0

[Unreleased]: https://github.com/Countly/countly-mcp-server/compare/v1.7.0...HEAD
[1.7.0]: https://github.com/Countly/countly-mcp-server/compare/v1.6.0...v1.7.0
