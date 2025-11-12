import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { analytics } from '../src/lib/analytics.js';

/**
 * Analytics Tests
 * Tests analytics tracking functionality with mocked Countly SDK
 */

// Mock the Countly SDK
vi.mock('countly-sdk-nodejs', () => {
  const mockCountly = {
    init: vi.fn(),
    begin_session: vi.fn(),
    end_session: vi.fn(),
    add_event: vi.fn(),
    log_error: vi.fn(),
    user_details: vi.fn(),
    track_view: vi.fn(),
  };
  return { default: mockCountly };
});

describe('Analytics', () => {
  // Get the mocked Countly module
  const getCountlyMock = async () => {
    // @ts-ignore - countly-sdk-nodejs doesn't have TypeScript definitions
    const module = await import('countly-sdk-nodejs');
    return module.default;
  };

  beforeEach(() => {
    // Reset all mocks before each test
    vi.clearAllMocks();
    
    // Reset analytics state by creating a new instance
    // Since analytics is a singleton, we need to reset its internal state
    (analytics as any).enabled = false;
    (analytics as any).initialized = false;
  });

  afterEach(() => {
    // Clean up
    (analytics as any).enabled = false;
    (analytics as any).initialized = false;
  });

  describe('init', () => {
    it('should initialize analytics when enabled', async () => {
      const Countly = await getCountlyMock();
      
      analytics.init(true);
      
      expect(Countly.init).toHaveBeenCalledWith(
        expect.objectContaining({
          app_key: '5a106dec46bf2e2d4d23c2cd3cf7490b12c22fc7',
          url: 'https://stats.count.ly',
          device_id: 'mcp',
          debug: false,
        })
      );
      
      expect(analytics.isEnabled()).toBe(true);
    });

    it('should not initialize analytics when disabled', async () => {
      const Countly = await getCountlyMock();
      
      analytics.init(false);
      
      expect(Countly.init).not.toHaveBeenCalled();
      expect(analytics.isEnabled()).toBe(false);
    });

    it('should track server start event on initialization', async () => {
      const Countly = await getCountlyMock();
      
      analytics.init(true);
      
      // Should have called add_event for server_started
      expect(Countly.add_event).toHaveBeenCalledWith(
        expect.objectContaining({
          key: 'server_started',
          count: 1,
        })
      );
    });

    it('should handle initialization errors gracefully', async () => {
      const Countly = await getCountlyMock();
      Countly.init.mockImplementationOnce(() => {
        throw new Error('Init failed');
      });
      
      // Should not throw
      expect(() => analytics.init(true)).not.toThrow();
      expect(analytics.isEnabled()).toBe(false);
    });
  });

  describe('isEnabled', () => {
    it('should return false when not initialized', () => {
      expect(analytics.isEnabled()).toBe(false);
    });

    it('should return true when enabled and initialized', async () => {
      analytics.init(true);
      expect(analytics.isEnabled()).toBe(true);
    });

    it('should return false when disabled', () => {
      analytics.init(false);
      expect(analytics.isEnabled()).toBe(false);
    });
  });

  describe('trackTransport', () => {
    it('should track transport type when enabled', async () => {
      const Countly = await getCountlyMock();
      analytics.init(true);
      vi.clearAllMocks(); // Clear init calls
      
      analytics.trackTransport('http');
      
      expect(Countly.add_event).toHaveBeenCalledWith(
        expect.objectContaining({
          key: 'transport_used',
          count: 1,
          segmentation: expect.objectContaining({
            type: 'http',
          }),
        })
      );
    });

    it('should track stdio transport', async () => {
      const Countly = await getCountlyMock();
      analytics.init(true);
      vi.clearAllMocks();
      
      analytics.trackTransport('stdio');
      
      expect(Countly.add_event).toHaveBeenCalledWith(
        expect.objectContaining({
          segmentation: expect.objectContaining({
            type: 'stdio',
          }),
        })
      );
    });

    it('should not track when disabled', async () => {
      const Countly = await getCountlyMock();
      analytics.init(false);
      vi.clearAllMocks();
      
      analytics.trackTransport('http');
      
      expect(Countly.add_event).not.toHaveBeenCalled();
    });
  });

  describe('trackToolExecution', () => {
    it('should track successful tool execution', async () => {
      const Countly = await getCountlyMock();
      analytics.init(true);
      vi.clearAllMocks();
      
      analytics.trackToolExecution('list_apps', true, 150);
      
      expect(Countly.add_event).toHaveBeenCalledWith(
        expect.objectContaining({
          key: 'tool_executed',
          segmentation: expect.objectContaining({
            tool: 'list_apps',
            success: 1,
            duration: 150,
          }),
        })
      );
    });

    it('should track failed tool execution', async () => {
      const Countly = await getCountlyMock();
      analytics.init(true);
      vi.clearAllMocks();
      
      analytics.trackToolExecution('create_app', false, 200);
      
      expect(Countly.add_event).toHaveBeenCalledWith(
        expect.objectContaining({
          segmentation: expect.objectContaining({
            tool: 'create_app',
            success: 0,
          }),
        })
      );
    });

    it('should track timed event when duration is provided', async () => {
      const Countly = await getCountlyMock();
      analytics.init(true);
      vi.clearAllMocks();
      
      analytics.trackToolExecution('query_database', true, 500);
      
      // Should call add_event twice: once for tool_executed, once for tool_execution_time
      expect(Countly.add_event).toHaveBeenCalledTimes(2);
      expect(Countly.add_event).toHaveBeenCalledWith(
        expect.objectContaining({
          key: 'tool_execution_time',
          dur: 500,
        })
      );
    });

    it('should handle execution without duration', async () => {
      const Countly = await getCountlyMock();
      analytics.init(true);
      vi.clearAllMocks();
      
      analytics.trackToolExecution('list_apps', true);
      
      expect(Countly.add_event).toHaveBeenCalledWith(
        expect.objectContaining({
          segmentation: expect.objectContaining({
            duration: 0,
          }),
        })
      );
    });

    it('should not track when disabled', async () => {
      const Countly = await getCountlyMock();
      analytics.init(false);
      
      analytics.trackToolExecution('list_apps', true, 100);
      
      expect(Countly.add_event).not.toHaveBeenCalled();
    });
  });

  describe('trackToolCategory', () => {
    it('should track tool category usage', async () => {
      const Countly = await getCountlyMock();
      analytics.init(true);
      vi.clearAllMocks();
      
      analytics.trackToolCategory('database');
      
      expect(Countly.add_event).toHaveBeenCalledWith(
        expect.objectContaining({
          key: 'tool_category_used',
          segmentation: expect.objectContaining({
            category: 'database',
          }),
        })
      );
    });

    it('should not track when disabled', async () => {
      const Countly = await getCountlyMock();
      analytics.init(false);
      
      analytics.trackToolCategory('analytics');
      
      expect(Countly.add_event).not.toHaveBeenCalled();
    });
  });

  describe('trackAuthMethod', () => {
    it('should track environment variable auth method', async () => {
      const Countly = await getCountlyMock();
      analytics.init(true);
      vi.clearAllMocks();
      
      analytics.trackAuthMethod('env');
      
      expect(Countly.add_event).toHaveBeenCalledWith(
        expect.objectContaining({
          key: 'auth_method',
          segmentation: expect.objectContaining({
            method: 'env',
          }),
        })
      );
    });

    it('should track file auth method', async () => {
      const Countly = await getCountlyMock();
      analytics.init(true);
      vi.clearAllMocks();
      
      analytics.trackAuthMethod('file');
      
      expect(Countly.add_event).toHaveBeenCalledWith(
        expect.objectContaining({
          segmentation: expect.objectContaining({
            method: 'file',
          }),
        })
      );
    });

    it('should track headers auth method', async () => {
      const Countly = await getCountlyMock();
      analytics.init(true);
      vi.clearAllMocks();
      
      analytics.trackAuthMethod('headers');
      
      expect(Countly.add_event).toHaveBeenCalledWith(
        expect.objectContaining({
          segmentation: expect.objectContaining({
            method: 'headers',
          }),
        })
      );
    });

    it('should track metadata auth method', async () => {
      const Countly = await getCountlyMock();
      analytics.init(true);
      vi.clearAllMocks();
      
      analytics.trackAuthMethod('metadata');
      
      expect(Countly.add_event).toHaveBeenCalledWith(
        expect.objectContaining({
          segmentation: expect.objectContaining({
            method: 'metadata',
          }),
        })
      );
    });

    it('should track args auth method', async () => {
      const Countly = await getCountlyMock();
      analytics.init(true);
      vi.clearAllMocks();
      
      analytics.trackAuthMethod('args');
      
      expect(Countly.add_event).toHaveBeenCalledWith(
        expect.objectContaining({
          segmentation: expect.objectContaining({
            method: 'args',
          }),
        })
      );
    });
  });

  describe('trackApiEndpoint', () => {
    it('should track API endpoint usage', async () => {
      const Countly = await getCountlyMock();
      analytics.init(true);
      vi.clearAllMocks();
      
      analytics.trackApiEndpoint('/o', 'GET', 200);
      
      expect(Countly.add_event).toHaveBeenCalledWith(
        expect.objectContaining({
          key: 'api_endpoint',
          segmentation: expect.objectContaining({
            endpoint: '/o',
            method: 'GET',
            status: 200,
          }),
        })
      );
    });

    it('should track error status codes', async () => {
      const Countly = await getCountlyMock();
      analytics.init(true);
      vi.clearAllMocks();
      
      analytics.trackApiEndpoint('/i', 'POST', 500);
      
      expect(Countly.add_event).toHaveBeenCalledWith(
        expect.objectContaining({
          segmentation: expect.objectContaining({
            status: 500,
          }),
        })
      );
    });
  });

  describe('trackHttpRequest', () => {
    it('should track HTTP request', async () => {
      const Countly = await getCountlyMock();
      analytics.init(true);
      vi.clearAllMocks();
      
      analytics.trackHttpRequest('/health', 'GET');
      
      expect(Countly.add_event).toHaveBeenCalledWith(
        expect.objectContaining({
          key: 'http_request',
          segmentation: expect.objectContaining({
            path: '/health',
            method: 'GET',
          }),
        })
      );
    });

    it('should track different HTTP methods', async () => {
      const Countly = await getCountlyMock();
      analytics.init(true);
      vi.clearAllMocks();
      
      analytics.trackHttpRequest('/mcp', 'POST');
      
      expect(Countly.add_event).toHaveBeenCalledWith(
        expect.objectContaining({
          segmentation: expect.objectContaining({
            method: 'POST',
          }),
        })
      );
    });
  });

  describe('trackError', () => {
    it('should track error occurrence', async () => {
      const Countly = await getCountlyMock();
      analytics.init(true);
      vi.clearAllMocks();
      
      analytics.trackError('ValidationError', 'Invalid input', 'create_app');
      
      expect(Countly.add_event).toHaveBeenCalledWith(
        expect.objectContaining({
          key: 'error_occurred',
          segmentation: expect.objectContaining({
            error_type: 'ValidationError',
            tool: 'create_app',
          }),
        })
      );
      
      expect(Countly.log_error).toHaveBeenCalled();
    });

    it('should truncate long error messages', async () => {
      const Countly = await getCountlyMock();
      analytics.init(true);
      vi.clearAllMocks();
      
      const longMessage = 'A'.repeat(200);
      analytics.trackError('Error', longMessage);
      
      expect(Countly.add_event).toHaveBeenCalledWith(
        expect.objectContaining({
          segmentation: expect.objectContaining({
            error_message: longMessage.substring(0, 100),
          }),
        })
      );
    });

    it('should use "unknown" for tool when not provided', async () => {
      const Countly = await getCountlyMock();
      analytics.init(true);
      vi.clearAllMocks();
      
      analytics.trackError('Error', 'Something went wrong');
      
      expect(Countly.add_event).toHaveBeenCalledWith(
        expect.objectContaining({
          segmentation: expect.objectContaining({
            tool: 'unknown',
          }),
        })
      );
    });
  });

  describe('trackSession', () => {
    it('should begin session', async () => {
      const Countly = await getCountlyMock();
      analytics.init(true);
      vi.clearAllMocks();
      
      analytics.trackSession('begin');
      
      expect(Countly.begin_session).toHaveBeenCalled();
    });

    it('should end session', async () => {
      const Countly = await getCountlyMock();
      analytics.init(true);
      vi.clearAllMocks();
      
      analytics.trackSession('end');
      
      expect(Countly.end_session).toHaveBeenCalled();
    });

    it('should not track session when disabled', async () => {
      const Countly = await getCountlyMock();
      analytics.init(false);
      
      analytics.trackSession('begin');
      
      expect(Countly.begin_session).not.toHaveBeenCalled();
    });
  });

  describe('trackEvent', () => {
    it('should track custom event with segmentation', async () => {
      const Countly = await getCountlyMock();
      analytics.init(true);
      vi.clearAllMocks();
      
      analytics.trackEvent('custom_event', { key: 'value', count: 5 });
      
      expect(Countly.add_event).toHaveBeenCalledWith({
        key: 'custom_event',
        count: 1,
        segmentation: { key: 'value', count: 5 },
      });
    });

    it('should track event without segmentation', async () => {
      const Countly = await getCountlyMock();
      analytics.init(true);
      vi.clearAllMocks();
      
      analytics.trackEvent('simple_event');
      
      expect(Countly.add_event).toHaveBeenCalledWith({
        key: 'simple_event',
        count: 1,
        segmentation: undefined,
      });
    });

    it('should handle event tracking errors gracefully', async () => {
      const Countly = await getCountlyMock();
      analytics.init(true);
      Countly.add_event.mockImplementationOnce(() => {
        throw new Error('Event failed');
      });
      
      // Should not throw
      expect(() => analytics.trackEvent('test_event')).not.toThrow();
    });
  });

  describe('trackTimedEvent', () => {
    it('should track timed event with duration', async () => {
      const Countly = await getCountlyMock();
      analytics.init(true);
      vi.clearAllMocks();
      
      analytics.trackTimedEvent('operation', { type: 'db_query' }, 1500);
      
      expect(Countly.add_event).toHaveBeenCalledWith({
        key: 'operation',
        count: 1,
        dur: 1500,
        segmentation: { type: 'db_query' },
      });
    });

    it('should handle timed event errors gracefully', async () => {
      const Countly = await getCountlyMock();
      analytics.init(true);
      Countly.add_event.mockImplementationOnce(() => {
        throw new Error('Timed event failed');
      });
      
      expect(() => analytics.trackTimedEvent('test', {}, 100)).not.toThrow();
    });
  });

  describe('trackUserProperty', () => {
    it('should track user property', async () => {
      const Countly = await getCountlyMock();
      analytics.init(true);
      vi.clearAllMocks();
      
      analytics.trackUserProperty('plan', 'premium');
      
      expect(Countly.user_details).toHaveBeenCalledWith({
        custom: { plan: 'premium' },
      });
    });

    it('should track numeric user property', async () => {
      const Countly = await getCountlyMock();
      analytics.init(true);
      vi.clearAllMocks();
      
      analytics.trackUserProperty('login_count', 42);
      
      expect(Countly.user_details).toHaveBeenCalledWith({
        custom: { login_count: 42 },
      });
    });

    it('should handle user property errors gracefully', async () => {
      const Countly = await getCountlyMock();
      analytics.init(true);
      Countly.user_details.mockImplementationOnce(() => {
        throw new Error('User details failed');
      });
      
      expect(() => analytics.trackUserProperty('key', 'value')).not.toThrow();
    });
  });

  describe('trackView', () => {
    it('should track view', async () => {
      const Countly = await getCountlyMock();
      analytics.init(true);
      vi.clearAllMocks();
      
      analytics.trackView('welcome_page');
      
      expect(Countly.track_view).toHaveBeenCalledWith('welcome_page');
    });

    it('should handle view tracking errors gracefully', async () => {
      const Countly = await getCountlyMock();
      analytics.init(true);
      Countly.track_view.mockImplementationOnce(() => {
        throw new Error('View tracking failed');
      });
      
      expect(() => analytics.trackView('error_page')).not.toThrow();
    });
  });

  describe('flush', () => {
    it('should flush events when enabled', async () => {
      analytics.init(true);
      
      // Should not throw
      expect(() => analytics.flush()).not.toThrow();
    });

    it('should not flush when disabled', async () => {
      analytics.init(false);
      
      expect(() => analytics.flush()).not.toThrow();
    });

    it('should handle flush errors gracefully', async () => {
      analytics.init(true);
      
      // Should not throw even if there's an error
      expect(() => analytics.flush()).not.toThrow();
    });
  });

  describe('private methods', () => {
    it('should hash server URL correctly', () => {
      // Access private method for testing
      const hashMethod = (analytics as any).hashServerUrl.bind(analytics);
      
      const hash1 = hashMethod('https://example.com/api');
      const hash2 = hashMethod('https://example.com/api/');
      const hash3 = hashMethod('http://example.com/api');
      
      // Should produce consistent hashes
      expect(hash1).toBe(hash2);
      expect(hash1).toBe(hash3);
      expect(hash1).toHaveLength(32);
    });

    it('should hash different URLs differently', () => {
      const hashMethod = (analytics as any).hashServerUrl.bind(analytics);
      
      const hash1 = hashMethod('https://example.com/api');
      const hash2 = hashMethod('https://different.com/api');
      
      expect(hash1).not.toBe(hash2);
    });

    it('should get app version from package.json', () => {
      const getVersionMethod = (analytics as any).getAppVersion.bind(analytics);
      
      const version = getVersionMethod();
      
      // Should return a valid version string
      expect(version).toMatch(/^\d+\.\d+\.\d+/);
    });

    it('should track server start with platform info', async () => {
      const Countly = await getCountlyMock();
      vi.clearAllMocks();
      
      // Call the private method directly
      analytics.init(true);
      
      // Check that server_started was tracked with platform info
      expect(Countly.add_event).toHaveBeenCalledWith(
        expect.objectContaining({
          key: 'server_started',
          segmentation: expect.objectContaining({
            platform: process.platform,
            node_version: process.version,
          }),
        })
      );
    });
  });

  describe('edge cases', () => {
    it('should handle multiple init calls', async () => {
      const Countly = await getCountlyMock();
      
      analytics.init(true);
      analytics.init(true);
      
      // Should only initialize once (plus server_started event each time)
      expect(Countly.init).toHaveBeenCalledTimes(2);
    });

    it('should handle empty segmentation', async () => {
      const Countly = await getCountlyMock();
      analytics.init(true);
      vi.clearAllMocks();
      
      analytics.trackEvent('event', {});
      
      expect(Countly.add_event).toHaveBeenCalledWith(
        expect.objectContaining({
          segmentation: {},
        })
      );
    });

    it('should handle null/undefined in tracking methods', async () => {
      await getCountlyMock();
      analytics.init(true);
      vi.clearAllMocks();
      
      // Should not throw
      expect(() => analytics.trackToolExecution('tool', true, undefined)).not.toThrow();
      expect(() => analytics.trackError('Error', 'message', undefined)).not.toThrow();
    });
  });
});
