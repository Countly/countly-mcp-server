import { AxiosInstance } from 'axios';
import { AppCache, CountlyApp } from '../lib/app-cache.js';

export interface ToolContext {
  httpClient: AxiosInstance;
  appCache: AppCache;
  getAuthParams: () => {};
  resolveAppId: (args: any) => Promise<string>;
  getApps: () => Promise<CountlyApp[]>;
}

export interface ToolResult {
  content: Array<{
    type: string;
    text: string;
  }>;
}
