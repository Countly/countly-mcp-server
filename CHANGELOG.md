# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
  - `list_hooks`: List all webhooks/hooks configured for an app
  - `test_hook`: Test hook configuration with mock data before creating
  - `create_hook`: Create webhooks with multiple trigger types (IncomingDataTrigger, APIEndPointTrigger, InternalEventTrigger, ScheduledTrigger) and effects (HTTPEffect, EmailEffect, CustomCodeEffect)
  - `update_hook`: Update existing webhook configurations
  - `delete_hook`: Delete webhooks by ID
  - `get_internal_events`: Get list of 23 available internal Countly events for triggers

- **Times of Day Module** (1 tool): User behavior pattern analysis based on `times-of-day` plugin
  - `get_times_of_day`: Analyze when users are most active throughout the day/week in their local time

- **Dashboards Module** (8 tools): Custom dashboard management based on `dashboards` plugin
  - `list_dashboards`: List all available dashboards
  - `get_dashboard_data`: Get widgets and data for specific dashboard
  - `create_dashboard`: Create dashboards with sharing, auto-refresh, and themes
  - `update_dashboard`: Update dashboard configuration
  - `delete_dashboard`: Delete dashboards
  - `add_dashboard_widget`: Add widgets with full configuration
  - `update_dashboard_widget`: Update widget position/size in grid layout
  - `remove_dashboard_widget`: Remove widgets from dashboard

- **Email Reports Module** (7 tools): Periodic email report management based on `reports` plugin
  - `list_email_reports`: List all configured email reports
  - `create_core_email_report`: Create reports with analytics, events, crashes, and star-rating metrics
  - `create_dashboard_email_report`: Create reports for specific dashboards
  - `update_email_report`: Update report configuration
  - `preview_email_report`: Preview reports before sending
  - `send_email_report`: Manually trigger report sending
  - `delete_email_report`: Delete report configurations

- **Server Logs Module** (2 tools): Server log file access based on `errorlogs` plugin
  - `list_server_log_files`: List available log files (api, dashboard, jobs)
  - `get_server_log_contents`: View log file contents (non-Docker deployments only)

- **Datapoint Module** (3 tools): Data point monitoring for billing/capacity planning based on `server-stats` plugin
  - `get_datapoint_statistics`: Get overall data point collection statistics
  - `get_top_apps_by_datapoints`: Rank apps by data point usage
  - `get_datapoint_punch_card`: Hourly load pattern visualization

- **Filtering Rules Module** (4 tools): Request blocking management based on `blocks` plugin
  - `list_filtering_rules`: List all configured blocking rules
  - `create_filtering_rule`: Create rules to block requests by IP, version, or properties
  - `update_filtering_rule`: Update existing blocking rules
  - `delete_filtering_rule`: Delete blocking rules

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
  - `update_remote_config_parameter`: Update parameters
  - `delete_remote_config_parameter`: Delete parameters
  - `list_remote_config_conditions`: List targeting conditions
  - `create_remote_config_condition`: Create targeting conditions
  - `delete_remote_config_condition`: Delete conditions

- **Retention Module** (1 tool): User retention analysis based on `retention_segments` plugin
  - `get_retention_data`: Analyze user retention cohorts over time

- **Live Users Module** (6 tools): Real-time concurrent user monitoring based on `concurrent_users` plugin
  - `get_live_users`: Get current concurrent users
  - `get_live_user_details`: Get detailed information about live users
  - `get_live_cities`: See cities with active users
  - `get_live_countries`: See countries with active users
  - `get_live_durations`: Analyze session durations of live users
  - `get_live_sources`: See traffic sources of live users

- **Formulas Module** (6 tools): Custom metric formula management based on `formulas` plugin
  - `list_formulas`: List all configured formulas
  - `get_formula`: Get specific formula details
  - `create_formula`: Create custom metric formulas
  - `update_formula`: Update formula configuration
  - `delete_formula`: Delete formulas
  - `get_formula_data`: Get calculated formula data

- **Funnels Module** (8 tools): Conversion funnel analysis based on `funnels` plugin
  - `list_funnels`: List all configured funnels
  - `get_funnel`: Get specific funnel details
  - `create_funnel`: Create conversion funnels with multiple steps
  - `update_funnel`: Update funnel configuration
  - `delete_funnel`: Delete funnels
  - `get_funnel_data`: Get funnel conversion data
  - `get_funnel_sessions`: Get user sessions that matched funnel
  - `get_funnel_steps`: Get detailed step-by-step breakdown

- **Cohorts Module** (8 tools): User cohort management based on `cohorts` plugin
  - `list_cohorts`: List all cohorts
  - `get_cohort`: Get specific cohort details
  - `create_cohort`: Create user cohorts with conditions
  - `update_cohort`: Update cohort configuration
  - `delete_cohort`: Delete cohorts
  - `get_cohort_users`: Get users in a cohort
  - `recalculate_cohort`: Trigger cohort recalculation
  - `get_cohort_user_count`: Get current user count

- **User Profiles Module** (4 tools): App user profile management based on `users` plugin
  - `search_user_profiles`: Search users with filters and sorting
  - `get_user_profile`: Get detailed user profile
  - `export_user_profiles`: Export user data to CSV
  - `get_user_profile_schema`: Get available user properties

- **Drill Module** (5 tools): Advanced query and segmentation based on `drill` plugin
  - `drill_query`: Execute custom drill queries
  - `get_drill_meta`: Get available drill properties
  - `get_drill_bookmarks`: List saved drill queries
  - `create_drill_bookmark`: Save drill queries
  - `delete_drill_bookmark`: Delete saved queries

- **Core Module Enhancements** (2 additional tools):
  - `list_jobs`: List background jobs with pagination and sorting
  - `get_job_runs`: Get execution history for specific jobs

- **Analytics Module Enhancements** (6 additional tools):
  - `get_user_loyalty`: Analyze user loyalty and session count distribution
  - `get_session_durations`: Analyze session duration patterns
  - `get_session_frequency`: Analyze time between user sessions
  - `get_slipping_away_users`: Identify users becoming inactive
  - `get_top_events`: Get most frequently occurring events
  - `get_events_overview`: Get event totals and segment overview

### Changed
- **Tool Count**: Expanded from 27 tools to 134 tools across 30 categories
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
- Updated tool configuration tests to cover all 30 categories and 134 tools

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

[1.0.1]: https://github.com/Countly/countly-mcp-server/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/Countly/countly-mcp-server/releases/tag/v1.0.0
