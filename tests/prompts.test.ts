import { describe, it, expect } from 'vitest';
import { listPrompts, getPrompt } from '../src/lib/prompts.js';

describe('Prompts', () => {
  describe('listPrompts', () => {
    it('should return array of available prompts', () => {
      const prompts = listPrompts();

      expect(Array.isArray(prompts)).toBe(true);
      expect(prompts.length).toBeGreaterThan(0);

      // Check structure of first prompt
      const firstPrompt = prompts[0];
      expect(firstPrompt).toHaveProperty('name');
      expect(firstPrompt).toHaveProperty('title');
      expect(firstPrompt).toHaveProperty('description');
      expect(firstPrompt).toHaveProperty('arguments');

      // Check that all prompts have required properties
      prompts.forEach(prompt => {
        expect(prompt.name).toBeDefined();
        expect(typeof prompt.name).toBe('string');
        if (prompt.arguments) {
          expect(Array.isArray(prompt.arguments)).toBe(true);
          prompt.arguments.forEach(arg => {
            expect(arg.name).toBeDefined();
            expect(typeof arg.name).toBe('string');
          });
        }
      });
    });

    it('should include specific known prompts', () => {
      const prompts = listPrompts();
      const promptNames = prompts.map(p => p.name);

      expect(promptNames).toContain('analyze_crash_trends');
      expect(promptNames).toContain('generate_engagement_report');
      expect(promptNames).toContain('compare_app_versions');
      expect(promptNames).toContain('user_retention_analysis');
    });
  });

  describe('getPrompt', () => {
    it('should return prompt result for valid prompt name', () => {
      const result = getPrompt('analyze_crash_trends', { app_name: 'TestApp' });

      expect(result).toHaveProperty('description');
      expect(result).toHaveProperty('messages');
      expect(Array.isArray(result.messages)).toBe(true);
      expect(result.messages.length).toBeGreaterThan(0);

      // Check message structure
      const firstMessage = result.messages[0];
      expect(firstMessage).toHaveProperty('role');
      expect(firstMessage).toHaveProperty('content');
      expect(firstMessage.content).toHaveProperty('type', 'text');
      expect(firstMessage.content).toHaveProperty('text');
    });

    it('should include provided arguments in the prompt', () => {
      const result = getPrompt('analyze_crash_trends', {
        app_name: 'MyTestApp',
        period: '30days'
      });

      expect(result.description).toContain('MyTestApp');
      expect(result.messages[0].content.text).toContain('MyTestApp');
      expect(result.messages[0].content.text).toContain('30days');
    });

    it('should use default values when arguments not provided', () => {
      const result = getPrompt('analyze_crash_trends', { app_name: 'TestApp' });

      expect(result.messages[0].content.text).toContain('TestApp');
      expect(result.messages[0].content.text).toContain('30days'); // default period
    });

    it('should throw error for unknown prompt name', () => {
      expect(() => getPrompt('unknown_prompt', {})).toThrow('Unknown prompt: unknown_prompt');
    });

    it('should generate different prompts for different names', () => {
      const crashResult = getPrompt('analyze_crash_trends', { app_name: 'TestApp' });
      const engagementResult = getPrompt('generate_engagement_report', { app_name: 'TestApp' });

      expect(crashResult.description).not.toBe(engagementResult.description);
      expect(crashResult.messages[0].content.text).not.toBe(engagementResult.messages[0].content.text);
    });

    it('should generate engagement report prompt', () => {
      const result = getPrompt('generate_engagement_report', {
        app_name: 'EngagementApp',
        metrics: 'sessions, users, events'
      });

      expect(result.description).toContain('EngagementApp');
      expect(result.messages[0].content.text).toContain('EngagementApp');
      expect(result.messages[0].content.text).toContain('sessions, users, events');
      expect(result.messages[0].content.text).toContain('get_dashboard_data');
      expect(result.messages[0].content.text).toContain('get_user_loyalty');
    });

    it('should generate compare versions prompt', () => {
      const result = getPrompt('compare_app_versions', {
        app_name: 'VersionApp',
        version1: '1.0.0',
        version2: '1.1.0'
      });

      expect(result.description).toContain('VersionApp');
      expect(result.description).toContain('1.0.0');
      expect(result.description).toContain('1.1.0');
      expect(result.messages[0].content.text).toContain('VersionApp');
      expect(result.messages[0].content.text).toContain('1.0.0');
      expect(result.messages[0].content.text).toContain('1.1.0');
      expect(result.messages[0].content.text).toContain('get_analytics_data');
    });

    it('should generate retention analysis prompt', () => {
      const result = getPrompt('user_retention_analysis', {
        app_name: 'RetentionApp',
        cohort_name: 'NewUsers'
      });

      expect(result.description).toContain('RetentionApp');
      expect(result.messages[0].content.text).toContain('RetentionApp');
      expect(result.messages[0].content.text).toContain('NewUsers');
      expect(result.messages[0].content.text).toContain('get_retention_data');
      expect(result.messages[0].content.text).toContain('get_cohort_users');
    });

    it('should generate retention analysis prompt without cohort', () => {
      const result = getPrompt('user_retention_analysis', {
        app_name: 'RetentionApp'
      });

      expect(result.description).toContain('RetentionApp');
      expect(result.messages[0].content.text).toContain('RetentionApp');
      expect(result.messages[0].content.text).toContain('get_retention_data');
      expect(result.messages[0].content.text).not.toContain('get_cohort_users');
    });

    it('should generate funnel optimization prompt', () => {
      const result = getPrompt('funnel_optimization', {
        app_name: 'FunnelApp',
        funnel_name: 'PurchaseFunnel'
      });

      expect(result.description).toContain('FunnelApp');
      expect(result.description).toContain('PurchaseFunnel');
      expect(result.messages[0].content.text).toContain('FunnelApp');
      expect(result.messages[0].content.text).toContain('PurchaseFunnel');
      expect(result.messages[0].content.text).toContain('list_funnels');
      expect(result.messages[0].content.text).toContain('get_funnel_data');
    });

    it('should generate event health check prompt', () => {
      const result = getPrompt('event_health_check', {
        app_name: 'HealthApp'
      });

      expect(result.description).toContain('HealthApp');
      expect(result.messages[0].content.text).toContain('HealthApp');
      expect(result.messages[0].content.text).toContain('get_events_overview');
      expect(result.messages[0].content.text).toContain('get_top_events');
      expect(result.messages[0].content.text).toContain('countly://app/');
    });

    it('should generate churn risk prompt', () => {
      const result = getPrompt('identify_churn_risk', {
        app_name: 'ChurnApp',
        inactivity_days: '14'
      });

      expect(result.description).toContain('ChurnApp');
      expect(result.messages[0].content.text).toContain('ChurnApp');
      expect(result.messages[0].content.text).toContain('period=14');
      expect(result.messages[0].content.text).toContain('get_slipping_away_users');
      expect(result.messages[0].content.text).toContain('get_user_loyalty');
    });

    it('should generate churn risk prompt with default inactivity days', () => {
      const result = getPrompt('identify_churn_risk', {
        app_name: 'ChurnApp'
      });

      expect(result.messages[0].content.text).toContain('period=7'); // default value
    });

    it('should generate performance dashboard prompt', () => {
      const result = getPrompt('performance_dashboard', {
        app_name: 'PerfApp',
        time_range: '60days'
      });

      expect(result.description).toContain('PerfApp');
      expect(result.messages[0].content.text).toContain('PerfApp');
      expect(result.messages[0].content.text).toContain('60days');
      expect(result.messages[0].content.text).toContain('get_dashboard_data');
      expect(result.messages[0].content.text).toContain('get_crash_statistics');
      expect(result.messages[0].content.text).toContain('countly://app/');
    });

    it('should use default values for optional arguments in engagement report', () => {
      const result = getPrompt('generate_engagement_report', { app_name: 'TestApp' });

      expect(result.messages[0].content.text).toContain('sessions, users, events, retention'); // default metrics
    });

    it('should use default values for optional arguments in compare versions', () => {
      const result = getPrompt('compare_app_versions', {
        app_name: 'TestApp',
        version1: '1.0',
        version2: '2.0'
      });

      // This should not contain default placeholders since we provided versions
      expect(result.description).toContain('1.0');
      expect(result.description).toContain('2.0');
    });

    it('should use default values for optional arguments in performance dashboard', () => {
      const result = getPrompt('performance_dashboard', { app_name: 'TestApp' });

      expect(result.messages[0].content.text).toContain('30days'); // default time_range
    });

    it('should use default app name placeholder when not provided', () => {
      const result = getPrompt('analyze_crash_trends', {});

      expect(result.description).toContain('[app name]');
      expect(result.messages[0].content.text).toContain('[app name]');
    });

    it('should use default period when not provided', () => {
      const result = getPrompt('analyze_crash_trends', { app_name: 'TestApp' });

      expect(result.messages[0].content.text).toContain('30days'); // default period
    });

    it('should use default funnel name placeholder when not provided', () => {
      const result = getPrompt('funnel_optimization', { app_name: 'TestApp' });

      expect(result.description).toContain('[funnel name]');
      expect(result.messages[0].content.text).toContain('[funnel name]');
    });

    it('should use default inactivity days when not provided', () => {
      const result = getPrompt('identify_churn_risk', { app_name: 'TestApp' });

      expect(result.messages[0].content.text).toContain('period=7'); // default inactivity days
    });
  });
});