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

## Server Detection and Plugin-Based Tool Availability

On the first `tools/list` or `tools/call` for a server URL + token, the MCP server detects which Countly it is talking to and only exposes the tools that server supports. The result is cached per server URL and token for 10 minutes.

| Flavor | How it is detected |
|---|---|
| **Countly Platform** (countly-platform, new architecture) | `/v2/countly_version` answers with the v2 JSON envelope, and plugins come from `/v2/plugins/enabled`, readable by any user. Builds without the new UI have no `/v2` API; they are recognised by `/o/system/observability` (Platform-only, any user) or by the `kafka`/`clickhouse` plugins. |
| **Countly Enterprise** (countly-server + enterprise plugins) | No `/v2` API, and the plugin list contains enterprise-only plugins (drill, cohorts, funnels, users, block, …). |
| **Countly Lite** (countly-server) | No `/v2` API, and no enterprise-only plugins. |

On countly-server, `/o/system/plugins` is restricted to global admins. For other tokens the edition is still detected (a drill probe via `/o?method=drill_bookmarks` tells Lite from Enterprise), and the edition's **default plugin set** is assumed — `plugins.default.json` for Lite, `plugins.ee.json` for Enterprise, `plugins.default.json` for Platform — snapshotted in `src/lib/default-plugins.ts`.

Detection never hides tools on a guess. If the server cannot be reached or the result is inconclusive, all tools allowed by your configuration are shown. Calling a tool whose plugin is missing returns an error that names the plugin and the detected edition. `get_version` also reports the detected edition.

### User Permissions

Detection also reads the connected user's permissions (`/o/users/me`) and hides tools the user could never run, for example write tools for a read-only user or `apps_create` for anyone but a global admin. The required permission of each tool is taken from the validator of the Countly endpoint it calls (see `src/lib/tool-guards.ts`). A tool is shown if the user may use it on **at least one** app. Group permissions are included, since Countly merges them into the user record.

If `/o/users/me` cannot be read (e.g. tokens restricted to specific apps), no tools are hidden for permission reasons. Calling a hidden tool returns an error naming the missing permission.

### Countly Platform /v2 API

When the server serves the Platform `/v2` API (Platform with the new UI), some tools switch to it, keeping their names. Their definitions in `tools/list` change accordingly. The legacy `/o` and `/i` implementation stays for Lite, Enterprise and Platform builds without `/v2`.

- **Platform-only insight tools**, listed only when the server serves `/v2`:
  - `events_summary`, `events_top`, `events_movers`: event totals, rankings, and growers/newcomers vs. the previous period
  - `views_top`: top views per metric
  - `crash_group_breakdown`, `crash_group_users`: crash distribution over a field, and affected users
  - `funnels_breakdown`, `funnels_trends`, `funnels_user_progress`: step breakdown by property, daily conversion, one user's progress
  - `hooks_get` (requires the hooks plugin): one hook with its configuration, run counters and the last failed runs with error messages
  - `drill_query` (requires the drill plugin): ad-hoc metrics over raw events. Supports count, unique, sum, avg, min, max and percentile; cohort and formula metrics; filters, breakdowns, time series, sorting and cursor paging. Custom event keys are mapped to drill's storage format automatically.
  - `notes_update`: edit a graph note (owner or global admin). Editing a legacy note moves it to the new format, which the legacy dashboard no longer shows.
  - `journeys_complete`, `journeys_stats_blocks`, `journeys_stats_content`, `journeys_stats_active_users`, `journeys_templates` (require the journey_engine plugin): end a journey for good, per-block funnel, in-app content engagement, active users, and ready-made journey templates
- **Platform-only tools for features without a legacy tool**, also listed only on `/v2` (and only when their plugin is enabled):
  - `flows_list`, `flows_get`, `flows_data`, `flows_dropoff` (`flows`): saved user flows, their per-step results, and what users did instead of an expected step
  - `ratings_widgets_list`, `ratings_stats`, `ratings_comments` (`star-rating`): rating widgets, their score distribution and individual responses
  - `campaigns_list`, `campaigns_get`, `campaigns_results` (`campaigns`): push/in-app/survey/rating campaigns and their delivery funnel
  - `ai_assistants_analytics` (`ai-assistants`): LLM assistant analytics, one view (tab) per call
  - `tasks_list`, `task_result`: background tasks / long-running reports and their stored results
  - `notifications_list`: the connected user's dashboard notifications
  - `geo_locations_list` (`geo`), `revenue_iap_events` (`revenue`), `crash_jira_issues` (`crashes-jira`)
  - `drill_saved_query_run` (requires the drill plugin): runs a saved drill query (from `drill_bookmarks_list`), optionally re-windowed, and returns results like `drill_query`
  - `drill_property_values` (requires the drill plugin): distinct values of a user property, custom property, campaign property or event segment, for building exact filters
- **Existing tools switched to `/v2`** where it is strictly better. Each keeps its name; its schema may gain options.
  - `crash_groups_list`: server-side search and sorting, lean rows with shortened stack traces
  - `funnels_list`: paging with totals
  - `funnels_data`: adds median and p95 time between steps; conversion percentages are computed by the tool
  - `funnels_step_users`, `funnels_dropoff_users`: full user profiles, paginated (they fall back to legacy uids when drill profiles are unavailable or a filter is used)
  - `sdk_logs_list`: paging, plus filters by request type, SDK, time range, text and problem requests
  - `user_profiles_query`: free-text search, sorting, paging and total count (it falls back to legacy when drill profiles are unavailable)
  - `user_profiles_breakdown`: top-N values of a profile property with each value's share (falls back to legacy when the users route is unavailable)
  - `events_list`: search, paging, display names, metric labels and events only drill has seen; segments still come from the legacy events document (falls back to the legacy list when drill is unavailable)
  - `notes_list`, `notes_create`, `notes_delete`: `/v2/notes`. Notes gain private/shared/global visibility and an optional event scope. Notes created on `/v2` are hidden from the legacy dashboard; only the owner or a global admin can delete them.
  - `crashes_resolve`, `crashes_unresolve`, `crashes_hide`, `crashes_show`: `PUT /v2/crashes/crashgroups/:id`, returning the group's new state
  - `apps_list`, `apps_get_by_name`: `/v2/apps`, with the caller's role per app. App name/id resolution for other tools still uses `/o/apps/mine`.
  - `dashboard_users`: `/v2/members`, compacted to identity, role, app access and login times
  - `hooks_list`: hooks of one app or all apps, filters by enabled state and text, paging with totals, lean rows
  - `hooks_create`, `hooks_update`, `hooks_delete`, `hooks_test`: same arguments, sent to `/v2/hooks`. `hooks_update` changes only the supplied fields, and uses the status route when only `enabled` changes
  - `email_reports_list`: reports you own, receive or can see, optionally filtered by app and title, with a readable schedule
  - `email_reports_core_create`, `email_reports_dashboard_create`, `email_reports_update`, `email_reports_send`, `email_reports_delete`: same arguments, sent to `/v2/reports`. Reports created there are hidden from the legacy dashboard, and dashboard reports reference new-UI dashboards (the ids `dashboards_list` returns on Platform). `email_reports_update` keeps the stored schedule fields it is not asked to change
  - `email_reports_preview`: the rendered email reduced to readable text (one line per table row) instead of raw HTML
  - `live_users`, `live_last_hour`, `live_last_day`, `live_last_30_days`: also return new-user counts, as compact series with ISO timestamps and the peak (they fall back to legacy when the user cannot read the v2 route). `live_overall` (v2 has no peak timestamp) and `live_metrics` (no v2 breakdown) stay legacy.
  - `drill_bookmarks_list`, `drill_bookmarks_create`, `drill_bookmarks_delete`: work on Platform saved queries, which include bookmarks saved in the old drill UI. Listing covers all events of the app (or every app with `scope: "mine"`); creating accepts the same metrics, filter and breakdowns as `drill_query` (or `event_key` + `query_obj` + `by_val` for a count); deleting an old-UI bookmark goes through the legacy endpoint.
  - `queriable_fields_list`, `metadata_get`: read drill metadata from `/v2/drill`; `metadata_get` lists every custom event with its segments in one batched call (both fall back to legacy for users without drill rights)
  - `query_data`: unchanged behaviour (its `drill` mode keeps the classic segmentation response); on Platform its description points to `drill_query` for metrics, formulas and cohorts

  Tools where v2 is only equivalent, or misses data (e.g. crash comments in `crashes_get`), stay on the legacy API. Also legacy: `crashes_stats_get` (no v2 stats endpoint), `apps_create` (`/v2/apps/create` skips the country/timezone/category validation and defaults), `apps_update`/`apps_delete`/`apps_reset`, `events_create`/`events_delete`, `user_profiles_get` and `app_users_*` (no v2 equivalent).
- **Journeys** (`journeys_*`): all journey tools use `/v2/journey_engine`. This is required for writes: a journey written through `/v2` belongs to the new UI and the legacy write endpoints refuse it. The first `/v2` write on a journey created in the old dashboard moves it to the new UI for good. Block graphs keep the same JSON format. `journeys_list` gains status/search/sort/paging, `journeys_create`/`journeys_update` a description and conversion goal, `journeys_stats_uids` the `goal_converted` metric, and `journeys_stats_table` lists journey instances. `journeys_publish` cannot unpublish to draft on Platform (use `journeys_pause` or `journeys_complete`). Stats default to the last 30 days.
- **Content** (`content_blocks_*`, `content_assets_*`): Platform replaces content blocks with content messages (popup, banner, carousel, survey, push; slides of typed blocks). `content_blocks_list` returns native messages and legacy blocks (flagged `legacy`); get, preview and delete accept both, falling back to the classic API for legacy ids. `content_blocks_create`/`content_blocks_update` take the message format (`message_format`, `platform`, `slides`, ...); legacy blocks are read-only. Assets use the shared `/v2` asset store (PNG/JPEG/GIF/WebP/SVG, max 10MB) that native messages reference. `content_langs_list` stays on the classic API.
- **Dashboards** (`dashboards_*`): new-UI dashboards are stored separately and are not visible through the legacy endpoints. On Platform the tools list, read, create and edit these boards. `dashboards_data` returns each widget's results, and widgets use the Platform widget format (drill, funnel, retention, profiles, active-profiles, online-profiles).

### ClickHouse on Countly Platform

On Platform, raw events and user profiles are stored in ClickHouse. The database tools can read them through the dbviewer plugin:
- `databases_list` shows the `clickhouse_countly_drill` database (`drill_events`, `app_users`, …).
- `databases_query` and `databases_document` read ClickHouse tables with the same Mongo-style filter, projection, sort and paging; the server translates them to SQL. Always filter `drill_events` by `a` (app id).
- `collections_aggregate` and `collections_indexes` apply to MongoDB only: ClickHouse has no aggregation pipelines or MongoDB-style indexes. The tools refuse ClickHouse databases up front. Use `drill_query` for counts, unique users, sums and breakdowns.

Set `COUNTLY_AUTO_DETECT=false` to turn detection off and always expose every configured tool.

### Categories Requiring Plugins

The following categories are **only available if their corresponding plugin is enabled**:

- **alerts** → `alerts`
- **crashes** → `crashes`
- **views** → `views`
- **database** → `dbviewer`
- **drill** → `drill` (Enterprise / Platform)
- **user_profiles** → `users` (Enterprise / Platform)
- **cohorts** → `cohorts` (Enterprise / Platform)
- **funnels** → `funnels` (Enterprise / Platform)
- **formulas** → `formulas` (Enterprise / Platform)
- **live** → `concurrent_users` (Enterprise / Platform)
- **retention** → `retention_segments` (Enterprise / Platform)
- **ab_testing** → `ab-testing` (Enterprise / Platform)
- **filtering_rules** → `block` (Enterprise / Platform)
- **journeys** → `journey_engine` (Platform)
- **content** → `content` (Platform)
- **server_logs** → `errorlogs` (not available on Platform)
- **flows** → `flows`, **ratings** → `star-rating`, **campaigns** → `campaigns`, **ai_assistants** → `ai-assistants`, **geo** → `geo`, **revenue** → `revenue`, **crashes_jira** → `crashes-jira` (Platform `/v2` only)
- **remote_config** → `remote-config`, **logger** → `logger`, **sdks** → `sdk`, **compliance_hub** → `compliance-hub`, **datapoint** → `server-stats`, **email_reports** → `reports`, **dashboards** → `dashboards`, **times_of_day** → `times-of-day`, **hooks** → `hooks`

### Categories Available by Default

These categories are always available without plugin checks:

- **core**, **apps**, **analytics**, **notes**, **events**, **metadata**, **dashboard_users**, **app_users**
- **tasks**, **notifications** (no plugin needed, but Platform `/v2` only)

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
**Tools**: `notes_list`, `notes_create`, `notes_update` (Platform only), `notes_delete`

**Operations**:
- C: notes_create
- R: notes_list
- U: notes_update
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
**Tools**: `databases_query`, `databases_list`, `databases_document`, `collections_aggregate`, `collections_indexes`

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
**Tools**: `journeys_list`, `journeys_get`, `journeys_create`, `journeys_update`, `journeys_delete`, `journeys_publish`, `journeys_pause`, `journeys_resume`, `journeys_block_reference`, `journeys_stats_summary`, `journeys_stats_table`, `journeys_stats_performance`, `journeys_stats_uids`, and on Countly Platform also `journeys_complete`, `journeys_stats_blocks`, `journeys_stats_content`, `journeys_stats_active_users`, `journeys_templates`

**Requires plugin**: `journey_engine` (Countly Enterprise / Platform)

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
**Tools**: `content_blocks_list`, `content_blocks_get`, `content_blocks_preview`, `content_blocks_create`, `content_blocks_update`, `content_blocks_delete`, `content_assets_list`, `content_assets_upload`, `content_assets_update`, `content_assets_delete`, `content_langs_list`

**Requires plugin**: `content` (Countly Enterprise / Platform)

On Countly Platform these tools manage the new content messages; see [Countly Platform /v2 API](#countly-platform-v2-api).

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

  // Get a browser preview URL (renders the block as end users see it)
  const preview = await tools.content_blocks_preview({
    app_name: 'MyApp',
    content_id: '507f1f77bcf86cd799439011'
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

### Platform /v2 only categories
All tools below are read-only (`R`) and listed only when the server serves the Platform `/v2` API.

| Category | Tools | Requires plugin |
|----------|-------|-----------------|
| flows | `flows_list`, `flows_get`, `flows_data`, `flows_dropoff` | `flows` |
| ratings | `ratings_widgets_list`, `ratings_stats`, `ratings_comments` | `star-rating` |
| campaigns | `campaigns_list`, `campaigns_get`, `campaigns_results` | `campaigns` |
| ai_assistants | `ai_assistants_analytics` | `ai-assistants` |
| tasks | `tasks_list`, `task_result` | — |
| notifications | `notifications_list` | — |
| geo | `geo_locations_list` | `geo` |
| revenue | `revenue_iap_events` | `revenue` |
| crashes_jira | `crash_jira_issues` | `crashes-jira` |
