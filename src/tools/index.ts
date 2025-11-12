/**
 * Central export point for all Countly MCP tools
 * 
 * This file exports tool definitions and handler classes from all categories.
 * Each category is in a single file containing both definitions and handlers.
 */

// Core Tools
import { coreToolDefinitions, coreToolHandlers, coreToolMetadata, CoreTools } from './core.js';

export { coreToolDefinitions, coreToolHandlers, coreToolMetadata, CoreTools };

// App Management Tools
import { appManagementToolDefinitions, appManagementToolHandlers, appManagementToolMetadata, AppManagementTools } from './app-management.js';

export { appManagementToolDefinitions, appManagementToolHandlers, appManagementToolMetadata, AppManagementTools };

// Analytics & Dashboards
import { analyticsToolDefinitions, analyticsToolHandlers, analyticsToolMetadata, AnalyticsTools } from './analytics.js';

export { analyticsToolDefinitions, analyticsToolHandlers, analyticsToolMetadata, AnalyticsTools };

// Events
import { crashAnalyticsToolDefinitions, crashAnalyticsToolHandlers, crashAnalyticsToolMetadata, CrashAnalyticsTools } from './crash-analytics.js';
import { dashboardUsersToolDefinitions, dashboardUsersToolHandlers, dashboardUsersToolMetadata, DashboardUsersTools } from './dashboard-users.js';
import { databaseToolDefinitions, databaseToolHandlers, databaseToolMetadata, DatabaseTools } from './database.js';
import { eventsToolDefinitions, eventsToolHandlers, eventsToolMetadata, EventsTools } from './events.js';

export { eventsToolDefinitions, eventsToolHandlers, eventsToolMetadata, EventsTools };

// Dashboard User Management
export { dashboardUsersToolDefinitions, dashboardUsersToolHandlers, dashboardUsersToolMetadata, DashboardUsersTools };

// App User Management
import { appUsersToolDefinitions, appUsersToolHandlers, appUsersToolMetadata, AppUsersTools } from './app-users.js';

export { appUsersToolDefinitions, appUsersToolHandlers, appUsersToolMetadata, AppUsersTools };

// Alerts & Notifications
import { alertsToolDefinitions, alertsToolHandlers, alertsToolMetadata, AlertsTools } from './alerts.js';

export { alertsToolDefinitions, alertsToolHandlers, alertsToolMetadata, AlertsTools };

// Notes
import { notesToolDefinitions, notesToolHandlers, notesToolMetadata, NotesTools } from './notes.js';

export { notesToolDefinitions, notesToolHandlers, notesToolMetadata, NotesTools };

// Database Operations
export { databaseToolDefinitions, databaseToolHandlers, databaseToolMetadata, DatabaseTools };

// Crash Analytics

export { crashAnalyticsToolDefinitions, crashAnalyticsToolHandlers, crashAnalyticsToolMetadata, CrashAnalyticsTools };

// Views
import { viewsToolDefinitions, viewsToolHandlers, viewsToolMetadata, ViewsTools } from './views.js';

export { viewsToolDefinitions, viewsToolHandlers, viewsToolMetadata, ViewsTools };

// Drill
import { drillToolDefinitions, drillToolHandlers, drillToolMetadata, DrillTools } from './drill.js';

export { drillToolDefinitions, drillToolHandlers, drillToolMetadata, DrillTools };

// User Profiles
import { userProfilesToolDefinitions, userProfilesToolHandlers, userProfilesToolMetadata, UserProfilesTools } from './user-profiles.js';

export { userProfilesToolDefinitions, userProfilesToolHandlers, userProfilesToolMetadata, UserProfilesTools };

// Cohorts
import { cohortsToolDefinitions, cohortsToolHandlers, cohortsToolMetadata, CohortsTools } from './cohorts.js';

export { cohortsToolDefinitions, cohortsToolHandlers, cohortsToolMetadata, CohortsTools };

// Funnels
import { funnelsToolDefinitions, funnelsToolHandlers, funnelsToolMetadata, FunnelsTools } from './funnels.js';

export { funnelsToolDefinitions, funnelsToolHandlers, funnelsToolMetadata, FunnelsTools };

// Type definitions
export type { ToolContext, ToolResult } from './types.js';

/**
 * Helper function to get all tool definitions
 * Useful for registering all tools with the MCP server
 */
export function getAllToolDefinitions() {
  return [
    ...coreToolDefinitions,
    ...appManagementToolDefinitions,
    ...analyticsToolDefinitions,
    ...eventsToolDefinitions,
    ...dashboardUsersToolDefinitions,
    ...appUsersToolDefinitions,
    ...alertsToolDefinitions,
    ...notesToolDefinitions,
    ...databaseToolDefinitions,
    ...crashAnalyticsToolDefinitions,
    ...viewsToolDefinitions,
    ...drillToolDefinitions,
    ...userProfilesToolDefinitions,
    ...cohortsToolDefinitions,
    ...funnelsToolDefinitions,
  ];
}

/**
 * Helper function to get all tool handlers as a combined map
 * Maps tool names to their handler method names
 */
export function getAllToolHandlers() {
  return {
    ...coreToolHandlers,
    ...appManagementToolHandlers,
    ...analyticsToolHandlers,
    ...eventsToolHandlers,
    ...dashboardUsersToolHandlers,
    ...appUsersToolHandlers,
    ...alertsToolHandlers,
    ...notesToolHandlers,
    ...databaseToolHandlers,
    ...crashAnalyticsToolHandlers,
    ...viewsToolHandlers,
    ...drillToolHandlers,
    ...userProfilesToolHandlers,
    ...cohortsToolHandlers,
    ...funnelsToolHandlers,
  };
}

/**
 * Helper function to get all tool metadata
 * Returns an array of metadata objects for dynamic routing
 */
export function getAllToolMetadata() {
  return [
    coreToolMetadata,
    appManagementToolMetadata,
    analyticsToolMetadata,
    eventsToolMetadata,
    dashboardUsersToolMetadata,
    appUsersToolMetadata,
    alertsToolMetadata,
    notesToolMetadata,
    databaseToolMetadata,
    crashAnalyticsToolMetadata,
    viewsToolMetadata,
    drillToolMetadata,
    userProfilesToolMetadata,
    cohortsToolMetadata,
    funnelsToolMetadata,
  ];
}
