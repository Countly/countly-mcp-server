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
- **user_profiles** → requires `users` plugin
- **cohorts** → requires `cohorts` plugin
- **funnels** → requires `funnels` plugin
- **journeys** → requires `journey_engine` plugin (Countly Enterprise)
- **content** → requires `content` plugin (Countly Enterprise)

### Categories Available by Default

These categories are always available without plugin checks:

- **core**, **apps**, **analytics**, **notes**, **events**, **dashboard_users**, **app_users**

**Note**: You should call the `get_plugins` tool first to check which plugins are available before attempting to use plugin-dependent tools.

## Tool Categories

### core
**Tools**: `ping`, `get_version`, `get_plugins`

**Operations**:
- R: All core tools (read-only)

**Notes**: 
- `ping`: Check if Countly server is healthy and reachable
- `get_version`: Check what version of Countly is running on the server
- `get_plugins`: Check what plugins are enabled on the Countly server

### apps
**Tools**: `apps_list`, `apps_get_by_name`, `apps_create`, `apps_update`, `apps_delete`, `apps_reset`

**Operations**:
- C: apps_create
- R: apps_list, apps_get_by_name
- U: apps_update
- D: apps_delete, apps_reset

### analytics
**Tools**: `get_analytics_data`, `app_analytics_summary`, `slipping_users`, `session_frequency`, `user_loyalty`, `session_durations`

**Operations**:
- R: All analytics tools (read-only)

**Note**: Analytics tools provide various data insights about applications. `slipping_users` retrieves app users (end-users) who are becoming inactive based on inactivity period. `events_list` shows both custom events and internal Countly events with their exact database structure.

### crashes
**Tools**: `crash_groups_list`, `crashes_stats_get`, `crashes_get`, `crashes_comment_add`, `crashes_comment_update`, `crashes_comment_delete`, `crashes_resolve`, `uncrashes_resolve`, `crashes_hide`, `crashes_show`

**Operations**:
- C: crashes_comment_add
- R: crash_groups_list, crashes_stats_get, crashes_get
- U: crashes_comment_update, crashes_resolve, uncrashes_resolve, crashes_hide, crashes_show
- D: crashes_comment_delete

**⚠️ Requires Plugin**: `crashes` plugin must be installed on Countly server

### notes
**Tools**: `notes_list`, `notes_create`, `notes_delete`

**Operations**:
- C: notes_create
- R: notes_list
- D: notes_delete

### events
**Tools**: `events_create`, `events_list`, `get_events_data`

**Operations**:
- C: events_create
- R: events_list, get_events_data

### alerts
**Tools**: `alerts_list`, `alerts_create`, `alerts_delete`

**Operations**:
- C: alerts_create (also handles updates)
- R: alerts_list
- D: alerts_delete

**⚠️ Requires Plugin**: `alerts` plugin must be installed on Countly server

### views
**Tools**: `views_table`, `views_data`

**Operations**:
- R: All views tools (read-only)

**⚠️ Requires Plugin**: `views` plugin must be installed on Countly server

### database
**Tools**: `databases_query`, `databases_list`, `databases_document`, `collections_aggregate`, `collections_indexes`, `databases_stats`

**Operations**:
- R: All database tools (read-only)

**⚠️ Requires Plugin**: `dbviewer` plugin must be installed on Countly server

### dashboard_users
**Tools**: `dashboard_users`

**Operations**:
- R: dashboard_users

**Note**: Returns management/admin users who access the Countly dashboard. These are the users who log into Countly to analyze data, configure settings, and manage applications.

### drill
**Tools**: `queriable_fields_list`, `run_query`, `drill_bookmarks_list`, `drill_bookmarks_create`, `drill_bookmarks_delete`

**Operations**:
- R: queriable_fields_list, run_query, drill_bookmarks_list
- C: drill_bookmarks_create
- D: drill_bookmarks_delete

**Notes**:
- `queriable_fields_list`: Get all user properties and event segments with their types. User properties must be prepended with "up." in queries. Types: d=date, n=number, s=string, l=list
- `run_query`: Run drill segmentation queries with MongoDB query objects. Can break down by projection key (segment or user property). Supports buckets: hourly, daily, weekly, monthly
- `drill_bookmarks_list`: List all saved drill bookmarks for a specific event
- `drill_bookmarks_create`: Create a new bookmark to save a query for later reuse in the dashboard
- `drill_bookmarks_delete`: Delete an existing drill bookmark

**⚠️ Requires Plugin**: `drill` plugin must be installed on Countly server

### app_users
**Tools**: `apps_create_user`, `app_users_update`, `apps_delete_user`, `export_app_users`

**Operations**:
- C: apps_create_user
- U: app_users_update
- D: apps_delete_user

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
const apps = await tools.apps_list({});

// 3. Use plugin-dependent features only if available
if (plugins.includes('crashes')) {
  const crashes = await tools.crash_groups_list({ app_name: 'MyApp' });
}

if (plugins.includes('alerts')) {
  const alerts = await tools.alerts_list({ app_name: 'MyApp' });
}

if (plugins.includes('views')) {
  const views = await tools.views_table({ app_name: 'MyApp' });
}

if (plugins.includes('dbviewer')) {
  const databases = await tools.databases_list({});
}

if (plugins.includes('drill')) {
  // Get user properties and event segments metadata
  const meta = await tools.queriable_fields_list({ 
    app_name: 'MyApp',
    event: 'Account Created' 
  });
  
  // Run segmentation query
  const results = await tools.run_query({
    app_name: 'MyApp',
    event: 'Account Created',
    query_object: '{"up.country":"US"}',
    period: '30days',
    bucket: 'daily'
  });
  
  // List existing bookmarks
  const bookmarks = await tools.drill_bookmarks_list({
    app_name: 'MyApp',
    event_key: 'Account Created'
  });
  
  // Create a bookmark
  await tools.drill_bookmarks_create({
    app_name: 'MyApp',
    event_key: 'Account Created',
    name: 'US Users',
    query_obj: '{"up.country":"US"}',
    desc: 'Users from United States'
  });
}
```

### user_profiles
**Tools**: `user_profiles_query`, `user_profiles_breakdown`, `user_profiles_get`

**Requires plugin**: `users`

Query user profiles and manage user notes. Note that user properties in queries do NOT use the "up." prefix (different from drill queries).

**Examples:**
```typescript
async function userProfileExamples() {
  // Query users with MongoDB filters (NO "up." prefix)
  const users = await tools.user_profiles_query({
    app_name: 'MyApp',
    query: '{"country":"US"}',  // Note: no "up." prefix
    period: '30days'
  });
  
  // Break down users by property with grouping
  const breakdown = await tools.user_profiles_breakdown({
    app_name: 'MyApp',
    projection_key: '{"country":"$country","plan":"$custom.plan"}',
    period: '30days'
  });
  
  // Get specific user details by UID
  const user = await tools.user_profiles_get({
    app_name: 'MyApp',
    uid: 'user123'
  });
  
}
```

### cohorts
**Tools**: `cohorts_list`, `cohorts_data`, `cohorts_create`, `cohorts_update`, `cohorts_delete`

**Requires plugin**: `cohorts`

Manage user cohorts - groups of users based on behavioral criteria or manual selection. Create sophisticated user segments based on events they did or did not perform.

**Examples:**
```typescript
async function cohortExamples() {
  // List all cohorts
  const cohorts = await tools.cohorts_list({
    app_name: 'MyApp',
    type: 'auto',  // or 'manual'
    limit: 10
  });
  
  // Get cohort data
  const cohortData = await tools.cohorts_data({
    app_name: 'MyApp',
    cohort_id: 'e8b5dfea315315c3a4d4bbc077999c2c',
    period: '12months'
  });
  
  // Create behavioral cohort
  // Users who had sessions with app version 5:10:0 but did not view any pages in the last 7 days
  const steps = [
    {
      type: 'did',
      event: '[CLY]_session',
      times: '{"$gte":1}',
      period: '0days',  // all time
      query: '{"up.av":{"$in":["5:10:0"]}}',
      queryText: 'App Version = 5:10:0',
      byVal: '',
      group: 0,
      conj: 'and'
    },
    {
      type: 'didnot',
      event: '[CLY]_view',
      times: '{"$gte":1}',
      period: '7days',
      query: '{}',
      queryText: '',
      byVal: '',
      group: 1,
      conj: 'and'
    }
  ];
  
  await tools.cohorts_create({
    app_name: 'MyApp',
    name: 'Inactive Users on Old Version',
    description: 'Users on version 5:10:0 who haven\'t viewed pages in 7 days',
    visibility: 'global',
    steps: JSON.stringify(steps),
    user_segmentation: JSON.stringify({
      query: '{"up.av":{"$in":["5:10:2"]}}',
      queryText: 'App Version = 5:10:2'
    })
  });
  
  // Update existing cohort
  await tools.cohorts_update({
    app_name: 'MyApp',
    cohort_id: 'e8b5dfea315315c3a4d4bbc077999c2c',
    description: 'Updated description',
    visibility: 'private'
  });
  
  // Delete cohort
  await tools.cohorts_delete({
    app_name: 'MyApp',
    cohort_id: 'e8b5dfea315315c3a4d4bbc077999c2c'
  });
}
```

### funnels
**Tools**: `funnels_list`, `funnels_data`, `funnels_step_users`, `funnels_dropoff_users`, `funnels_create`, `funnels_update`, `funnels_delete`

**Requires plugin**: `funnels`

Manage conversion funnels to track user progression through sequential events. Analyze drop-off rates, identify bottlenecks, and get user lists for specific steps.

**Examples:**
```typescript
async function funnelExamples() {
  // List all funnels
  const funnels = await tools.funnels_list({
    app_name: 'MyApp',
    limit: 10
  });
  
  // Create a purchase funnel
  await tools.funnels_create({
    app_name: 'MyApp',
    name: 'E-commerce Purchase Flow',
    description: 'Track user journey from product view to purchase',
    type: 'session-independent',  // or 'same-session'
    steps: [
      '[CLY]_session',
      'Product Viewed',
      'Added to Cart',
      'Checkout Started',
      'Purchase Completed'
    ],
    queries: [
      '{"up.p":{"$in":["Android"]}}',  // Filter: Android users only for first step
      '{}',
      '{}',
      '{}',
      '{}'
    ],
    query_texts: [
      'Platform = Android',
      '',
      '',
      '',
      ''
    ],
    step_groups: [
      {c: 'and', g: 0},
      {c: 'and', g: 1},
      {c: 'and', g: 2},
      {c: 'and', g: 3},
      {c: 'and', g: 4}
    ]
  });
  
  // Get funnel analytics data for last 30 days
  const data = await tools.funnels_data({
    app_name: 'MyApp',
    funnel_id: '3a3adcf59207776125297286960504ff',
    period: '30days',
    filter: '{"up.country":"US"}'  // Additional filter
  });
  
  // Get users who reached step 2 (Added to Cart)
  const stepUsers = await tools.funnels_step_users({
    app_name: 'MyApp',
    funnel_id: '3a3adcf59207776125297286960504ff',
    step: 2,
    period: '30days'
  });
  
  // Get users who dropped off between step 2 and 3
  const dropoffUsers = await tools.funnels_dropoff_users({
    app_name: 'MyApp',
    funnel_id: '3a3adcf59207776125297286960504ff',
    from_step: 2,
    to_step: 3,
    period: '30days'
  });
  
  // Update existing funnel
  await tools.funnels_update({
    app_name: 'MyApp',
    funnel_id: '3a3adcf59207776125297286960504ff',
    description: 'Updated funnel description',
    type: 'same-session'  // Change to require same session
  });
  
  // Delete funnel
  await tools.funnels_delete({
    app_name: 'MyApp',
    funnel_id: '3a3adcf59207776125297286960504ff'
  });
}
```

### journeys
**Tools**: `journeys_list`, `journeys_get`, `journeys_create`, `journeys_update`, `journeys_delete`, `journeys_publish`, `journeys_pause`, `journeys_resume`

**Requires plugin**: `journey_engine` (Countly Enterprise)

Manage user journeys - automated multi-step engagement flows built from trigger, logical, engagement, and data-pipeline blocks. A journey consists of a definition and one or more versions; each version holds the block graph. New journeys start as drafts and must be published to run.

**Examples:**
```typescript
async function journeyExamples() {
  // List all journeys
  const journeys = await tools.journeys_list({
    app_name: 'MyApp'
  });

  // Create a journey triggered by session start
  const journey = await tools.journeys_create({
    app_name: 'MyApp',
    name: 'Onboarding Journey',
    blocks: JSON.stringify([
      {
        id: 'block_1',
        blockType: 'trigger',
        subType: 'incoming-data',
        filters: [
          { key: '[CLY]_session', conditions: {} }
        ],
        nextBlock: 'block_2'
      },
      {
        id: 'block_2',
        blockType: 'end',
        subType: 'journey-exit'
      }
    ])
  });

  // Publish the journey (activates its version)
  await tools.journeys_publish({
    app_name: 'MyApp',
    journey_id: '67164f4a1f1bd90d6354430a'
  });

  // Pause and resume
  await tools.journeys_pause({
    app_name: 'MyApp',
    journey_id: '67164f4a1f1bd90d6354430a'
  });
  await tools.journeys_resume({
    app_name: 'MyApp',
    journey_id: '67164f4a1f1bd90d6354430a'
  });

  // Soft-delete the journey
  await tools.journeys_delete({
    app_name: 'MyApp',
    journey_id: '67164f4a1f1bd90d6354430a'
  });
}
```

### content
**Tools**: `content_blocks_list`, `content_blocks_get`, `content_blocks_create`, `content_blocks_update`, `content_blocks_delete`

**Requires plugin**: `content` (Countly Enterprise)

Manage content blocks - reusable in-app content (banners, modals, surveys) delivered to users, typically through journey "in-app-content" engagement blocks.

**Examples:**
```typescript
async function contentExamples() {
  // List all content blocks
  const blocks = await tools.content_blocks_list({
    app_name: 'MyApp'
  });

  // Create a welcome banner
  const created = await tools.content_blocks_create({
    app_name: 'MyApp',
    title: 'Welcome Banner',
    type: 'Banner',
    blocks: JSON.stringify([
      {
        layout: 'banner',
        placement: {
          small: { position: 'center', heightMultiplier: 1, fullScreenOverride: false }
        },
        elements: {
          title: { text: 'Welcome to MyApp!' }
        }
      }
    ])
  });

  // Update the title only (other fields preserved)
  await tools.content_blocks_update({
    app_name: 'MyApp',
    content_id: '507f1f77bcf86cd799439011',
    title: 'Updated Welcome Banner'
  });

  // Delete (fails if the block is still used in a journey)
  await tools.content_blocks_delete({
    app_name: 'MyApp',
    content_id: '507f1f77bcf86cd799439011'
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
