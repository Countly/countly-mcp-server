# Contributing to Countly MCP Server

We welcome contributions to the Countly MCP Server project! This document provides guidelines for contributing.

## Getting Started

1. Fork the repository on GitHub
2. Clone your fork locally
3. Create a feature branch from `main`
4. Make your changes
5. Test your changes
6. Submit a pull request

## Development Setup

1. **Prerequisites**
   - Node.js 18+
   - npm or yarn
   - Access to a Countly server for testing

2. **Local Development**
   ```bash
   git clone https://github.com/your-username/countly-mcp-server.git
   cd countly-mcp-server
   npm install
   cp .env.example .env
   # Edit .env with your Countly server details
   npm run build
   npm run dev  # Start in watch mode
   ```

3. **Testing**
   ```bash
   npm test              # Run validation tests
   npm run test:tools    # Test MCP tools
   ```

## Code Guidelines

### TypeScript Standards
- Use TypeScript for all new code
- Follow existing code style and patterns
- Add type definitions for new interfaces
- Document complex functions with JSDoc comments

### Code Structure
- Keep functions focused and single-purpose
- Use descriptive variable and function names
- Handle errors gracefully with proper error messages
- Add appropriate logging for debugging

### Testing
- Add tests for new functionality
- Ensure existing tests pass
- Test both success and error cases
- Include integration tests for new tools

## Submitting Changes

### Pull Request Process
1. Create a descriptive branch name (`feature/add-new-tool`, `fix/error-handling`)
2. Make focused commits with clear messages
3. Update documentation if needed
4. Ensure all tests pass
5. Submit a pull request with:
   - Clear description of changes
   - Reference to related issues
   - Screenshots if UI changes
   - Test results

### Commit Messages
Use clear, concise commit messages:
- `feat: add new analytics tool for user retention`
- `fix: handle undefined app_name in query functions`
- `docs: update API reference for new parameters`
- `test: add integration test for app management`

## Types of Contributions

### Bug Fixes
- Fix reported issues
- Add regression tests
- Update documentation if needed

### New Features
- Add new MCP tools
- Enhance existing functionality
- Improve error handling
- Add configuration options

### Adding New MCP Tools

The Countly MCP Server uses a modular architecture where tools are organized by category. Adding a new tool is straightforward and requires no changes to the main `index.ts` file.

#### Architecture Overview

Each tool category has:
1. **Tool Definitions**: JSON schemas describing the tool's interface
2. **Handler Functions**: Implementation logic for each tool
3. **Tool Class**: Wrapper class that provides methods for the MCP server
4. **Metadata**: Configuration for dynamic routing (instance key, class, handlers)

The main `index.ts` file uses dynamic routing - it automatically discovers and routes all tools based on their metadata. No hardcoded tool names or class instantiations are needed!

#### Adding a Tool to an Existing Category

If you're adding a tool to an existing category (e.g., analytics, user-management), follow these steps:

**Example: Adding a "Get Active Users" tool to user-management.ts**

```typescript
// 1. Add tool definition
export const getActiveUsersToolDefinition = {
  name: 'get_active_users',
  description: 'Get users who were active in the specified time period',
  inputSchema: {
    type: 'object',
    properties: {
      app_id: { type: 'string', description: 'Application ID (optional if app_name provided)' },
      app_name: { type: 'string', description: 'Application name (alternative to app_id)' },
      period: { type: 'string', description: 'Time period (e.g., "7days", "30days")' },
    },
    required: [],
  },
};

// 2. Add handler function
export async function handleGetActiveUsers(context: ToolContext, args: any): Promise<ToolResult> {
  const appId = await context.resolveAppId(args);
  const period = args.period || '7days';
  
  const params = {
    app_id: appId,
    method: 'users',
    period,
    ...context.getAuthParams(),
  };
  
  const response = await context.httpClient.get('/o', { params });
  
  return {
    content: [
      {
        type: 'text',
        text: `Active users for period ${period}:\n${JSON.stringify(response.data, null, 2)}`,
      },
    ],
  };
}

// 3. Add to definitions array
export const userManagementToolDefinitions = [
  getAllUsersToolDefinition,
  createAppUserToolDefinition,
  deleteAppUserToolDefinition,
  exportAppUsersToolDefinition,
  getSlippingAwayUsersToolDefinition,
  getActiveUsersToolDefinition, // Add here
];

// 4. Add to handlers map
export const userManagementToolHandlers = {
  'get_all_users': 'getAllUsers',
  'create_app_user': 'createAppUser',
  'delete_app_user': 'deleteAppUser',
  'export_app_users': 'exportAppUsers',
  'get_slipping_away_users': 'getSlippingAwayUsers',
  'get_active_users': 'getActiveUsers', // Add here
} as const;

// 5. Add method to class
export class UserManagementTools {
  constructor(private context: ToolContext) {}

  // ... existing methods ...

  async getActiveUsers(args: any): Promise<ToolResult> {
    return handleGetActiveUsers(this.context, args);
  }
}
```

That's it! The tool is now automatically discovered and routed by the main server.

#### Updating CRUD Permissions Configuration

**CRITICAL**: When adding a new tool, you **MUST** update the CRUD permissions configuration in `src/lib/tools-config.ts`. This allows administrators to control access to your tool through environment variables.

Each tool must be classified with one of these CRUD operations:
- **C (Create)** - Tools that create new resources (e.g., `create_app`, `create_note`, `add_crash_comment`)
- **R (Read)** - Tools that read/retrieve data (e.g., `list_apps`, `get_dashboard_data`, `view_crash`)
- **U (Update)** - Tools that modify existing resources (e.g., `update_app`, `edit_crash_comment`, `resolve_crash`)
- **D (Delete)** - Tools that delete resources (e.g., `delete_app`, `delete_note`, `reset_app`)

**Example: Adding the `get_active_users` tool**

In `src/lib/tools-config.ts`, find the appropriate category and add your tool with its CRUD operation:

```typescript
export const TOOL_CATEGORIES: Record<string, { operations: Record<string, CrudOperation> }> = {
  // ... other categories ...
  
  users: {
    operations: {
      'create_app_user': 'C',
      'delete_app_user': 'D',
      'export_app_users': 'R',
      'get_slipping_away_users': 'R',
      'get_all_users': 'R',
      'get_active_users': 'R',  // ADD YOUR TOOL HERE with appropriate CRUD operation
    }
  },
  
  // ... other categories ...
};
```

**For a new category**, add a complete new section:

```typescript
export const TOOL_CATEGORIES: Record<string, { operations: Record<string, CrudOperation> }> = {
  // ... existing categories ...
  
  monitoring: {  // NEW CATEGORY
    operations: {
      'health_check': 'R',  // Read operation
      'get_system_info': 'R',  // Read operation
    }
  },
};
```

**Guidelines for CRUD classification:**
- If unsure between C and U, use C (creation takes precedence)
- If a tool both reads and modifies, use U or D (the modification operation)
- Read-only analytics tools are always R
- Tools that "reset" or "clear" data are D (delete)
- Tools that "resolve", "hide", "archive" are U (update)

After updating `tools-config.ts`, also update the documentation:
1. **TOOLS_CONFIGURATION.md** - Add your tool to the appropriate category section
2. **.env.tools.example** - Update the comment showing tools in that category
3. **README.md** - Add your tool to the Available Categories comment (if count changed)

This ensures administrators can properly control access to your new tool using environment variables like `COUNTLY_TOOLS_USERS=R` (read-only) or `COUNTLY_TOOLS_MONITORING=NONE` (disabled).

#### Creating a New Tool Category

If you're adding a completely new category of tools, create a new file in `src/tools/`:

**Example: Creating monitoring.ts for system monitoring tools**

```typescript
// src/tools/monitoring.ts
import { ToolContext, ToolResult } from './types.js';

// ============================================================================
// HEALTH CHECK TOOL
// ============================================================================

export const healthCheckToolDefinition = {
  name: 'health_check',
  description: 'Check the health status of the Countly server',
  inputSchema: {
    type: 'object',
    properties: {},
    required: [],
  },
};

export async function handleHealthCheck(context: ToolContext, args: any): Promise<ToolResult> {
  try {
    const response = await context.httpClient.get('/o/ping');
    const isHealthy = response.status === 200;
    
    return {
      content: [
        {
          type: 'text',
          text: `Server health: ${isHealthy ? 'OK' : 'ERROR'}\n${JSON.stringify(response.data, null, 2)}`,
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: `Health check failed: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export const monitoringToolDefinitions = [
  healthCheckToolDefinition,
];

export const monitoringToolHandlers = {
  'health_check': 'healthCheck',
} as const;

export class MonitoringTools {
  constructor(private context: ToolContext) {}

  async healthCheck(args: any): Promise<ToolResult> {
    return handleHealthCheck(this.context, args);
  }
}

// Metadata for dynamic routing (must be after class declaration)
export const monitoringToolMetadata = {
  instanceKey: 'monitoring',
  toolClass: MonitoringTools,
  handlers: monitoringToolHandlers,
} as const;
```

Then update `src/tools/index.ts`:

```typescript
// Add import
import { monitoringToolDefinitions, monitoringToolHandlers, monitoringToolMetadata, MonitoringTools } from './monitoring.js';
export { monitoringToolDefinitions, monitoringToolHandlers, monitoringToolMetadata, MonitoringTools };

// Add to getAllToolDefinitions()
export function getAllToolDefinitions() {
  return [
    // ... existing categories ...
    ...monitoringToolDefinitions, // Add here
  ];
}

// Add to getAllToolMetadata()
export function getAllToolMetadata() {
  return [
    // ... existing metadata ...
    monitoringToolMetadata, // Add here
  ];
}
```

**That's it!** The new category is automatically integrated. No changes to `src/index.ts` are needed.

#### Tool Development Best Practices

1. **Use Existing Patterns**: Follow the structure of existing tools in the same category
2. **Validate Input**: Check required parameters and provide clear error messages
3. **Handle Errors**: Use try-catch blocks and return meaningful error responses
4. **Document Parameters**: Provide clear descriptions in the inputSchema
5. **Test Thoroughly**: Test with various inputs including edge cases
6. **Use Context**: Access shared resources via the `ToolContext` parameter:
   - `context.resolveAppId(args)` - Resolve app_id or app_name to app_id
   - `context.getAuthParams()` - Get authentication parameters
   - `context.httpClient` - Axios instance for API calls
   - `context.appCache` - Cached list of apps

#### Testing Your Tool

```bash
# Build the project
npm run build

# Run tests
npm test

# Test in VS Code
# 1. Completely restart VS Code (quit and reopen, not just reload window)
# 2. The MCP server will automatically reinitialize with new tool definitions
# 3. Try your new tool in Copilot Chat
```

**Important:** When you change tool schemas (add/remove parameters, modify enums, etc.), VS Code caches the tool definitions. You must fully restart VS Code (Quit and reopen) to pick up schema changes. Simply reloading the window or restarting the MCP server may not be sufficient.

### Documentation
- Fix typos and unclear sections
- Add examples and tutorials
- Update API reference
- Improve setup instructions

### Performance
- Optimize API calls
- Improve response times
- Reduce memory usage
- Add caching where appropriate

## Code Review Process

1. All submissions require review
2. Maintainers will review within 1-2 weeks
3. Address feedback promptly
4. Be open to suggestions and changes
5. Maintain a positive, collaborative tone

## Reporting Issues

### Bug Reports
Include:
- Steps to reproduce
- Expected vs actual behavior
- Environment details (Node.js version, OS)
- Error messages and logs
- Minimal reproduction case

### Feature Requests
Include:
- Clear description of the feature
- Use cases and benefits
- Proposed implementation approach
- Examples of similar features

## Getting Help

- Check existing issues and documentation first
- Ask questions in GitHub Discussions
- Join community channels if available
- Be respectful and patient

## License

By contributing, you agree that your contributions will be licensed under the MIT License.

Thank you for contributing to Countly MCP Server! 🚀
