# Tools Configuration

The Countly MCP Server supports fine-grained control over which tools are available through environment variable configuration. You can enable/disable entire tool categories and control CRUD (Create, Read, Update, Delete) operations per category.

## Configuration Format

Set environment variables in this format:
```bash
COUNTLY_TOOLS_{CATEGORY}={OPERATIONS}
```

### Operations

Use any combination of these letters:
- **C** = Create operations
- **R** = Read operations  
- **U** = Update operations
- **D** = Delete operations

Special values:
- **CRUD**, **ALL**, or **\*** = All operations enabled (default)
- **NONE** or empty = Disable category completely

## Plugin-Based Tool Availability

Some tool categories require specific Countly plugins to be installed on your server. The MCP server will automatically check plugin availability via the `/o/system/plugins` endpoint and only expose tools for installed plugins.

### Categories Requiring Plugins

The following categories are **only available if their corresponding plugin is installed**:

- **alerts** → requires `alerts` plugin
- **crashes** → requires `crashes` plugin  
- **views** → requires `views` plugin
- **database** → requires `dbviewer` plugin
- **drill** → requires `drill` plugin

### Categories Available by Default

These categories are always available without plugin checks:

- **core**, **apps**, **analytics**, **notes**, **events**, **dashboard_users**, **app_users**

**Note**: You should call the `get_plugins` tool first to check which plugins are available before attempting to use plugin-dependent tools.

## Tool Categories

### core
**Tools**: `ping`, `get_version`, `get_plugins`, `search`, `fetch`

**Operations**:
- R: All core tools (read-only)

**Notes**: 
- `ping`: Check if Countly server is healthy and reachable
- `get_version`: Check what version of Countly is running on the server
- `get_plugins`: Check what plugins are enabled on the Countly server
- `search` and `fetch`: Provide MCP Connector required functionality for ChatGPT and similar clients

### apps
**Tools**: `list_apps`, `get_app_by_name`, `create_app`, `update_app`, `delete_app`, `reset_app`

**Operations**:
- C: create_app
- R: list_apps, get_app_by_name
- U: update_app
- D: delete_app, reset_app

### analytics
**Tools**: `get_analytics_data`, `get_dashboard_data`, `get_events_data`, `get_events_overview`, `get_top_events`, `get_slipping_away_users`

**Operations**:
- R: All analytics tools (read-only)

**Note**: `get_slipping_away_users` retrieves app users (end-users) who are becoming inactive based on inactivity period.

### crashes
**Tools**: `list_crash_groups`, `get_crash_statistics`, `view_crash`, `add_crash_comment`, `edit_crash_comment`, `delete_crash_comment`, `resolve_crash`, `unresolve_crash`, `hide_crash`, `show_crash`

**Operations**:
- C: add_crash_comment
- R: list_crash_groups, get_crash_statistics, view_crash
- U: edit_crash_comment, resolve_crash, unresolve_crash, hide_crash, show_crash
- D: delete_crash_comment

**⚠️ Requires Plugin**: `crashes` plugin must be installed on Countly server

### notes
**Tools**: `list_notes`, `create_note`, `delete_note`

**Operations**:
- C: create_note
- R: list_notes
- D: delete_note

### events
**Tools**: `create_event`

**Operations**:
- C: create_event

### alerts
**Tools**: `list_alerts`, `create_alert`, `delete_alert`

**Operations**:
- C: create_alert (also handles updates)
- R: list_alerts
- D: delete_alert

**⚠️ Requires Plugin**: `alerts` plugin must be installed on Countly server

### views
**Tools**: `get_views_table`, `get_view_segments`, `get_views_data`

**Operations**:
- R: All views tools (read-only)

**⚠️ Requires Plugin**: `views` plugin must be installed on Countly server

### database
**Tools**: `query_database`, `list_databases`, `get_document`, `aggregate_collection`, `get_collection_indexes`, `get_db_statistics`

**Operations**:
- R: All database tools (read-only)

**⚠️ Requires Plugin**: `dbviewer` plugin must be installed on Countly server

### dashboard_users
**Tools**: `get_all_dashboard_users`

**Operations**:
- R: get_all_dashboard_users

**Note**: Returns management/admin users who access the Countly dashboard. These are the users who log into Countly to analyze data, configure settings, and manage applications.

### drill
**Tools**: `get_segmentation_meta`, `run_segmentation_query`, `list_drill_bookmarks`, `create_drill_bookmark`, `delete_drill_bookmark`

**Operations**:
- R: get_segmentation_meta, run_segmentation_query, list_drill_bookmarks
- C: create_drill_bookmark
- D: delete_drill_bookmark

**Notes**:
- `get_segmentation_meta`: Get all user properties and event segments with their types. User properties must be prepended with "up." in queries. Types: d=date, n=number, s=string, l=list
- `run_segmentation_query`: Run drill segmentation queries with MongoDB query objects. Can break down by projection key (segment or user property). Supports buckets: hourly, daily, weekly, monthly
- `list_drill_bookmarks`: List all saved drill bookmarks for a specific event
- `create_drill_bookmark`: Create a new bookmark to save a query for later reuse in the dashboard
- `delete_drill_bookmark`: Delete an existing drill bookmark

**⚠️ Requires Plugin**: `drill` plugin must be installed on Countly server

### app_users
**Tools**: `create_app_user`, `edit_app_user`, `delete_app_user`, `export_app_users`

**Operations**:
- C: create_app_user
- U: edit_app_user
- D: delete_app_user

**Note**: Manages end-users of the applications being tracked by Countly. These are the users of your mobile apps, websites, or other applications that send data to Countly for analytics.

## Configuration Examples

### Example 1: Read-only mode for everything
```bash
COUNTLY_TOOLS_ALL=R
```

Only read operations (list, get, view, etc.) will be available across all categories.

### Example 2: Apps read-only, full crash access
```bash
COUNTLY_TOOLS_APPS=R
COUNTLY_TOOLS_CRASHES=CRUD
```

- Apps: Can only list and view apps
- Crashes: Full access to all crash tools
- Other categories: Default (all operations)

### Example 3: Disable database and user management
```bash
COUNTLY_TOOLS_DATABASE=NONE
COUNTLY_TOOLS_USERS=NONE
```

Completely disables all database and user management tools.

### Example 4: No delete operations anywhere
```bash
COUNTLY_TOOLS_ALL=CRU
```

Allows create, read, and update operations but disables all delete operations.

### Example 5: Analytics and crashes only, read-only
```bash
COUNTLY_TOOLS_ALL=NONE
COUNTLY_TOOLS_ANALYTICS=R
COUNTLY_TOOLS_CRASHES=R
```

Only analytics and crash viewing tools are available, all in read-only mode.

### Example 6: Fine-grained control
```bash
# Default: all operations
COUNTLY_TOOLS_ALL=CRUD

# Apps: Read and create only (no updates or deletes)
COUNTLY_TOOLS_APPS=CR

# Database: Read-only
COUNTLY_TOOLS_DATABASE=R

# Users: Disabled
COUNTLY_TOOLS_USERS=NONE

# Notes: Full access
COUNTLY_TOOLS_NOTES=CRD
```

## Configuration File

You can add these variables to your `.env` file:

```bash
# Copy the example file
cp .env.tools.example .env

# Edit with your preferred settings
# nano .env
```

Or set them directly in your MCP client configuration (e.g., Claude Desktop, VS Code).

## Checking Plugin Availability

Before using plugin-dependent tools, you should check which plugins are installed:

```javascript
// First, check available plugins
const pluginsResponse = await tools.get_plugins({});
// Response: { plugins: ['crashes', 'push', 'views', 'star-rating', ...] }

// Now you know which tool categories are available:
// - crashes tools: ✓ available (crashes plugin present)
// - alerts tools: ✗ not available (alerts plugin not in list)
// - views tools: ✓ available (views plugin present)
// - database tools: ✗ not available (dbviewer plugin not in list)
// - drill tools: ✗ not available (drill plugin not in list)
```

The server will automatically filter out tools for categories whose plugins are not installed, so you won't see them in the available tools list. However, checking `get_plugins` first allows you to:

1. **Inform users** which features are available
2. **Avoid errors** by not attempting to use unavailable tools
3. **Adjust workflows** based on server capabilities

### Recommended Usage Pattern

```javascript
// 1. Check server health and capabilities
await tools.ping({});
await tools.get_version({});
const { plugins } = await tools.get_plugins({});

// 2. Use core features (always available)
const apps = await tools.list_apps({});

// 3. Use plugin-dependent features only if available
if (plugins.includes('crashes')) {
  const crashes = await tools.list_crash_groups({ app_name: 'MyApp' });
}

if (plugins.includes('alerts')) {
  const alerts = await tools.list_alerts({ app_name: 'MyApp' });
}

if (plugins.includes('views')) {
  const views = await tools.get_views_table({ app_name: 'MyApp' });
}

if (plugins.includes('dbviewer')) {
  const databases = await tools.list_databases({});
}

if (plugins.includes('drill')) {
  // Get user properties and event segments metadata
  const meta = await tools.get_segmentation_meta({ 
    app_name: 'MyApp',
    event: 'Account Created' 
  });
  
  // Run segmentation query
  const results = await tools.run_segmentation_query({
    app_name: 'MyApp',
    event: 'Account Created',
    query_object: '{"up.country":"US"}',
    period: '30days',
    bucket: 'daily'
  });
  
  // List existing bookmarks
  const bookmarks = await tools.list_drill_bookmarks({
    app_name: 'MyApp',
    event_key: 'Account Created'
  });
  
  // Create a bookmark
  await tools.create_drill_bookmark({
    app_name: 'MyApp',
    event_key: 'Account Created',
    name: 'US Users',
    query_obj: '{"up.country":"US"}',
    desc: 'Users from United States'
  });
}
```

## Verification

The server will log the active configuration on startup:

```
Tools Configuration:
  apps: CR
  analytics: R
  crashes: CRUD
  notes: NONE
  events: C
  alerts: CRD
  views: R
  database: R
  users: DISABLED
```

## Default Behavior

If no configuration is provided, all tools and operations are enabled (equivalent to `COUNTLY_TOOLS_ALL=CRUD`).
