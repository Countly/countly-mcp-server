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
import { eventsToolDefinitions, eventsToolHandlers, eventsToolMetadata, EventsTools } from './events.js';
export { eventsToolDefinitions, eventsToolHandlers, eventsToolMetadata, EventsTools };

// Dashboard User Management
import { dashboardUsersToolDefinitions, dashboardUsersToolHandlers, dashboardUsersToolMetadata, DashboardUsersTools } from './dashboard-users.js';
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
import { databaseToolDefinitions, databaseToolHandlers, databaseToolMetadata, DatabaseTools } from './database.js';
export { databaseToolDefinitions, databaseToolHandlers, databaseToolMetadata, DatabaseTools };

// Crash Analytics
import { crashAnalyticsToolDefinitions, crashAnalyticsToolHandlers, crashAnalyticsToolMetadata, CrashAnalyticsTools } from './crash-analytics.js';
export { crashAnalyticsToolDefinitions, crashAnalyticsToolHandlers, crashAnalyticsToolMetadata, CrashAnalyticsTools };

// Views
import { viewsToolDefinitions, viewsToolHandlers, viewsToolMetadata, ViewsTools } from './views.js';
export { viewsToolDefinitions, viewsToolHandlers, viewsToolMetadata, ViewsTools };

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
  ];
}
