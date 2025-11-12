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

### views
**Tools**: `get_views_table`, `get_view_segments`, `get_views_data`

**Operations**:
- R: All views tools (read-only)

### database
**Tools**: `query_database`, `list_databases`, `get_document`, `aggregate_collection`, `get_collection_indexes`, `get_db_statistics`

**Operations**:
- R: All database tools (read-only)

### dashboard_users
**Tools**: `get_all_dashboard_users`

**Operations**:
- R: get_all_dashboard_users

**Note**: Returns management/admin users who access the Countly dashboard. These are the users who log into Countly to analyze data, configure settings, and manage applications.

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
