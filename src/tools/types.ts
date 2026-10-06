import { AxiosInstance } from 'axios';

import { AppCache, CountlyApp } from '../lib/app-cache.js';
import type { ServerCapabilities } from '../lib/server-capabilities.js';

export interface ToolContext {
  httpClient: AxiosInstance;
  appCache: AppCache;
  getAuthParams: () => {};
  resolveAppId: (args: any) => Promise<string>;
  getApps: () => Promise<CountlyApp[]>;
  /** Detected server flavor and plugins; null when unknown or detection is off */
  getServerCapabilities?: () => Promise<ServerCapabilities | null>;
}

export interface ToolResult {
  content: Array<{
    type: string;
    text: string;
  }>;
  /** Set when the call failed, so the model sees the text as an error */
  isError?: boolean;
}
