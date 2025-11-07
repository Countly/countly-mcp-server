# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
