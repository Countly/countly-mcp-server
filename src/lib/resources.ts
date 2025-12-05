/**
 * MCP Resources Provider for Countly
 * 
 * Resources provide read-only access to Countly data for AI context.
 * Uses countly:// URI scheme for resource identification.
 */

import { AxiosInstance } from 'axios';
import { AppCache, CountlyApp } from './app-cache.js';

export interface Resource {
  uri: string;
  name: string;
  title?: string;
  description?: string;
  mimeType?: string;
  annotations?: {
    audience?: string[];
    priority?: number;
    lastModified?: string;
  };
}

export interface ResourceContent {
  uri: string;
  mimeType: string;
  text?: string;
  blob?: string;
}

/**
 * Get list of all available resources for an app
 */
export async function listResources(
  httpClient: AxiosInstance,
  appCache: AppCache,
  getAuthParams: () => {},
  appId?: string
): Promise<Resource[]> {
  const resources: Resource[] = [];
  
  // Get all apps
  const apps = await getAppsForCache(httpClient, appCache, getAuthParams);
  
  // If specific app requested, filter to that app
  const targetApps = appId ? apps.filter(a => a._id === appId) : apps;
  
  for (const app of targetApps) {
    // App configuration resource
    resources.push({
      uri: `countly://app/${app._id}/config`,
      name: `${app.name} Configuration`,
      title: `📱 ${app.name} - App Configuration`,
      description: `Application settings, metadata, and configuration for ${app.name}`,
      mimeType: 'application/json',
      annotations: {
        audience: ['user', 'assistant'],
        priority: 0.8
      }
    });
    
    // Events schema resource
    resources.push({
      uri: `countly://app/${app._id}/events`,
      name: `${app.name} Events`,
      title: `📊 ${app.name} - Event Definitions`,
      description: `List of all configured events and their schemas for ${app.name}`,
      mimeType: 'application/json',
      annotations: {
        audience: ['assistant'],
        priority: 0.9
      }
    });
    
    // App overview resource
    resources.push({
      uri: `countly://app/${app._id}/overview`,
      name: `${app.name} Overview`,
      title: `📈 ${app.name} - Analytics Overview`,
      description: `Current analytics overview including user counts, sessions, and key metrics`,
      mimeType: 'application/json',
      annotations: {
        audience: ['user', 'assistant'],
        priority: 1.0
      }
    });
  }
  
  return resources;
}

/**
 * Read content of a specific resource
 */
export async function readResource(
  uri: string,
  httpClient: AxiosInstance,
  appCache: AppCache,
  getAuthParams: () => {}
): Promise<ResourceContent> {
  // Parse the URI: countly://app/{app_id}/{resource_type}
  const match = uri.match(/^countly:\/\/app\/([^\/]+)\/([^\/]+)$/);
  
  if (!match) {
    throw new Error(`Invalid resource URI: ${uri}`);
  }
  
  const [, appId, resourceType] = match;
  
  // Get app info
  const apps = await getAppsForCache(httpClient, appCache, getAuthParams);
  const app = apps.find(a => a._id === appId);
  
  if (!app) {
    throw new Error(`App not found: ${appId}`);
  }
  
  let content: any;
  
  switch (resourceType) {
    case 'config':
      content = await getAppConfig(app, httpClient);
      break;
      
    case 'events':
      content = await getAppEvents(appId, httpClient, getAuthParams);
      break;
      
    case 'overview':
      content = await getAppOverview(appId, httpClient, getAuthParams);
      break;
      
    default:
      throw new Error(`Unknown resource type: ${resourceType}`);
  }
  
  return {
    uri,
    mimeType: 'application/json',
    text: JSON.stringify(content, null, 2)
  };
}

/**
 * Helper to get apps from cache or fetch fresh
 */
async function getAppsForCache(
  httpClient: AxiosInstance,
  appCache: AppCache,
  _getAuthParams: () => {}
): Promise<CountlyApp[]> {
  if (!appCache.isExpired()) {
    return appCache.getAll();
  }
  
  try {
    // Debug: print headers before request
     
    console.error('[DEBUG] Axios headers for /o/apps/mine:', JSON.stringify(httpClient.defaults.headers.common));
    const authHeader = httpClient.defaults.headers.common['countly-token'];
    const params: any = {};
    // If auth is in headers, also try sending as query param for compatibility
    if (authHeader) {
      params.auth_token = authHeader;
    }
    const response = await httpClient.get('/o/apps/mine', { params });
    
    let apps: CountlyApp[];
    if (response.data && Array.isArray(response.data)) {
      apps = response.data;
    } else if (response.data && response.data.admin_of) {
      apps = Object.values(response.data.admin_of) as CountlyApp[];
    } else if (response.data && response.data.apps) {
      apps = response.data.apps;
    } else {
      apps = [];
    }
    
    appCache.update(apps);
    return apps;
  } catch (error: any) {
    // Provide more detailed error information
    const errorMessage = error?.message || String(error);
    const errorCode = error?.code;
    const errorStatus = error?.response?.status;
    const errorData = error?.response?.data;
    throw new Error(`Failed to fetch apps: ${errorMessage} (status: ${errorStatus}, code: ${errorCode}, data: ${JSON.stringify(errorData)})`);
  }
}

/**
 * Get app configuration details
 */
async function getAppConfig(app: CountlyApp, _httpClient: AxiosInstance): Promise<any> {
  return {
    id: app._id,
    name: app.name,
    key: app.key,
    category: app.category,
    timezone: app.timezone,
    created_at: app.created_at,
    settings: {
      description: 'App configuration and metadata',
      note: 'This resource provides read-only access to app settings'
    }
  };
}

/**
 * Get app events schema
 */
async function getAppEvents(appId: string, httpClient: AxiosInstance, getAuthParams: () => {}): Promise<any> {
  try {
    const response = await httpClient.get('/o', {
      params: {
        ...getAuthParams(),
        app_id: appId,
        method: 'get_events'
      }
    });
    const events = response.data?.events || response.data || {};
    return {
      app_id: appId,
      events: Object.entries(events).map(([key, value]: [string, any]) => ({
        key,
        name: value.name || key,
        description: value.description || '',
        count: value.count || 0,
        segments: value.segments || {},
        duration: value.duration,
        sum: value.sum
      })),
      total: Object.keys(events).length,
      description: 'Complete list of events tracked in this application'
    };
  } catch {
    return {
      app_id: appId,
      events: [],
      total: 0,
      error: 'Could not fetch events. Events plugin may not be enabled.',
      description: 'Event definitions and schemas for this application'
    };
  }
}

/**
 * Get app analytics overview
 */
async function getAppOverview(appId: string, httpClient: AxiosInstance, getAuthParams: () => {}): Promise<any> {
  try {
    // Get dashboard data for 30 days
    const response = await httpClient.get('/o/analytics/dashboard', {
      params: {
        ...getAuthParams(),
        app_id: appId,
        period: '30days'
      }
    });

    const data = response.data || {};
    
    return {
      app_id: appId,
      period: '30days',
      summary: {
        total_users: data.total_users || 0,
        new_users: data.new_users || 0,
        total_sessions: data.total_sessions || 0,
        total_events: data.total_events || 0,
        crashes: data.crashes || 0,
        description: '30-day analytics overview with key metrics'
      },
      last_updated: new Date().toISOString()
    };
  } catch {
    return {
      app_id: appId,
      period: '30days',
      summary: {
        total_users: 0,
        new_users: 0,
        total_sessions: 0,
        total_events: 0,
        crashes: 0,
        description: 'Could not fetch overview data'
      },
      error: 'Could not fetch analytics overview',
      last_updated: new Date().toISOString()
    };
  }
}
