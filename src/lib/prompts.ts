/**
 * MCP Prompts Provider for Countly
 * 
 * Prompts provide pre-built templates for common Countly analysis tasks.
 * These can be exposed as slash commands in MCP clients.
 */

export interface Prompt {
  name: string;
  title?: string;
  description?: string;
  arguments?: PromptArgument[];
}

export interface PromptArgument {
  name: string;
  description?: string;
  required?: boolean;
}

export interface PromptMessage {
  role: 'user' | 'assistant';
  content: {
    type: 'text';
    text: string;
  };
}

export interface PromptResult {
  description?: string;
  messages: PromptMessage[];
}

/**
 * Get list of all available prompts
 */
export function listPrompts(): Prompt[] {
  return [
    {
      name: 'analyze_crash_trends',
      title: '🐛 Analyze Crash Trends',
      description: 'Analyze crash and error patterns for an application over a time period',
      arguments: [
        {
          name: 'app_name',
          description: 'Name of the Countly application to analyze',
          required: true
        },
        {
          name: 'period',
          description: 'Time period (e.g., "7days", "30days", "60days")',
          required: false
        }
      ]
    },
    {
      name: 'generate_engagement_report',
      title: '📊 Generate User Engagement Report',
      description: 'Create a comprehensive user engagement analysis report',
      arguments: [
        {
          name: 'app_name',
          description: 'Name of the Countly application',
          required: true
        },
        {
          name: 'metrics',
          description: 'Specific metrics to include (e.g., "sessions, users, events")',
          required: false
        }
      ]
    },
    {
      name: 'compare_app_versions',
      title: '🔄 Compare App Versions',
      description: 'Compare performance and engagement metrics between two app versions',
      arguments: [
        {
          name: 'app_name',
          description: 'Name of the Countly application',
          required: true
        },
        {
          name: 'version1',
          description: 'First version to compare',
          required: true
        },
        {
          name: 'version2',
          description: 'Second version to compare',
          required: true
        }
      ]
    },
    {
      name: 'user_retention_analysis',
      title: '🎯 User Retention Analysis',
      description: 'Analyze user retention patterns and cohort behavior',
      arguments: [
        {
          name: 'app_name',
          description: 'Name of the Countly application',
          required: true
        },
        {
          name: 'cohort_name',
          description: 'Specific cohort to analyze (optional)',
          required: false
        }
      ]
    },
    {
      name: 'funnel_optimization',
      title: '⏳ Funnel Optimization Suggestions',
      description: 'Analyze conversion funnel and suggest optimizations',
      arguments: [
        {
          name: 'app_name',
          description: 'Name of the Countly application',
          required: true
        },
        {
          name: 'funnel_name',
          description: 'Name of the funnel to analyze',
          required: true
        }
      ]
    },
    {
      name: 'event_health_check',
      title: '✅ Event Tracking Health Check',
      description: 'Check the health and quality of event tracking implementation',
      arguments: [
        {
          name: 'app_name',
          description: 'Name of the Countly application',
          required: true
        }
      ]
    },
    {
      name: 'identify_churn_risk',
      title: '⚠️ Identify Users at Churn Risk',
      description: 'Find users who are showing signs of decreased engagement',
      arguments: [
        {
          name: 'app_name',
          description: 'Name of the Countly application',
          required: true
        },
        {
          name: 'inactivity_days',
          description: 'Days of inactivity to consider (default: 7)',
          required: false
        }
      ]
    },
    {
      name: 'performance_dashboard',
      title: '⚡ Application Performance Overview',
      description: 'Get a comprehensive overview of application performance metrics',
      arguments: [
        {
          name: 'app_name',
          description: 'Name of the Countly application',
          required: true
        },
        {
          name: 'time_range',
          description: 'Time range for analysis (default: "30days")',
          required: false
        }
      ]
    }
  ];
}

/**
 * Get a specific prompt with arguments filled in
 */
export function getPrompt(name: string, args: Record<string, string>): PromptResult {
  const promptGenerators: Record<string, (args: Record<string, string>) => PromptResult> = {
    analyze_crash_trends: generateCrashTrendsPrompt,
    generate_engagement_report: generateEngagementReportPrompt,
    compare_app_versions: generateCompareVersionsPrompt,
    user_retention_analysis: generateRetentionAnalysisPrompt,
    funnel_optimization: generateFunnelOptimizationPrompt,
    event_health_check: generateEventHealthCheckPrompt,
    identify_churn_risk: generateChurnRiskPrompt,
    performance_dashboard: generatePerformanceDashboardPrompt
  };
  
  const generator = promptGenerators[name];
  if (!generator) {
    throw new Error(`Unknown prompt: ${name}`);
  }
  
  return generator(args);
}

// Prompt generators

function generateCrashTrendsPrompt(args: Record<string, string>): PromptResult {
  const appName = args.app_name || '[app name]';
  const period = args.period || '30days';
  
  return {
    description: `Analyze crash trends for ${appName}`,
    messages: [
      {
        role: 'user',
        content: {
          type: 'text',
          text: `Please analyze the crash and error trends for the "${appName}" application over the ${period} period. 

I need you to:
1. Use list_crash_groups to get recent crashes for ${appName}
2. Use get_crash_statistics to get overall crash metrics
3. Identify the most common crash patterns
4. Analyze trends (increasing/decreasing crash rates)
5. Highlight any critical issues that need immediate attention
6. Suggest potential root causes based on crash data

Please provide a comprehensive analysis with actionable recommendations.`
        }
      }
    ]
  };
}

function generateEngagementReportPrompt(args: Record<string, string>): PromptResult {
  const appName = args.app_name || '[app name]';
  const metrics = args.metrics || 'sessions, users, events, retention';
  
  return {
    description: `Generate engagement report for ${appName}`,
    messages: [
      {
        role: 'user',
        content: {
          type: 'text',
          text: `Create a comprehensive user engagement report for "${appName}" including these metrics: ${metrics}.

Please:
1. Use get_dashboard_data to fetch current analytics
2. Use get_user_loyalty to understand user engagement levels
3. Use get_session_frequency to analyze usage patterns
4. Use get_top_events to identify key user actions
5. Use get_slipping_away_users to identify users at risk

Provide a detailed analysis covering:
- Overall engagement trends
- User behavior patterns
- Key events and their frequency
- User segments by engagement level
- Recommendations for improving engagement`
        }
      }
    ]
  };
}

function generateCompareVersionsPrompt(args: Record<string, string>): PromptResult {
  const appName = args.app_name || '[app name]';
  const version1 = args.version1 || '[version 1]';
  const version2 = args.version2 || '[version 2]';
  
  return {
    description: `Compare versions ${version1} and ${version2} for ${appName}`,
    messages: [
      {
        role: 'user',
        content: {
          type: 'text',
          text: `Compare app versions "${version1}" and "${version2}" for the "${appName}" application.

Please:
1. Use get_analytics_data with appropriate filters to get metrics for each version
2. Compare key metrics: sessions, users, crashes, session duration
3. Analyze any significant changes in user behavior
4. Check for version-specific crashes using list_crash_groups
5. Identify any performance regressions or improvements

Provide a side-by-side comparison highlighting:
- Performance differences
- User engagement changes
- Stability improvements or regressions
- Recommendations for the development team`
        }
      }
    ]
  };
}

function generateRetentionAnalysisPrompt(args: Record<string, string>): PromptResult {
  const appName = args.app_name || '[app name]';
  const cohortName = args.cohort_name;
  
  const cohortText = cohortName ? ` for the "${cohortName}" cohort` : '';
  
  return {
    description: `Analyze user retention for ${appName}`,
    messages: [
      {
        role: 'user',
        content: {
          type: 'text',
          text: `Analyze user retention patterns${cohortText} in the "${appName}" application.

Please:
1. Use get_retention_data to get retention cohort analysis
2. Use get_user_loyalty to understand repeat usage patterns
3. Use get_session_frequency to analyze time between sessions${cohortName ? `\n4. Use get_cohort_users to analyze the specific cohort "${cohortName}"` : ''}

Provide insights on:
- Retention rates by cohort
- Critical drop-off points
- Factors affecting retention
- User segments with best/worst retention
- Actionable recommendations to improve retention`
        }
      }
    ]
  };
}

function generateFunnelOptimizationPrompt(args: Record<string, string>): PromptResult {
  const appName = args.app_name || '[app name]';
  const funnelName = args.funnel_name || '[funnel name]';
  
  return {
    description: `Optimize funnel "${funnelName}" for ${appName}`,
    messages: [
      {
        role: 'user',
        content: {
          type: 'text',
          text: `Analyze and optimize the "${funnelName}" conversion funnel in the "${appName}" application.

Please:
1. Use list_funnels to find the funnel
2. Use get_funnel_data to get conversion metrics
3. Use get_funnel_steps to analyze each step
4. Use get_funnel_sessions to understand user behavior

Provide analysis including:
- Overall conversion rate
- Step-by-step drop-off analysis
- Bottlenecks in the funnel
- User segments with different conversion patterns
- Specific recommendations to improve conversion at each step`
        }
      }
    ]
  };
}

function generateEventHealthCheckPrompt(args: Record<string, string>): PromptResult {
  const appName = args.app_name || '[app name]';
  
  return {
    description: `Check event tracking health for ${appName}`,
    messages: [
      {
        role: 'user',
        content: {
          type: 'text',
          text: `Perform a health check on event tracking implementation for "${appName}".

Please:
1. Use get_events_overview to see all tracked events
2. Use get_top_events to identify most used events
3. Check the countly://app/{app_id}/events resource for event schemas

Analyze and report on:
- Event tracking coverage (are all important events being tracked?)
- Event naming consistency
- Event frequency and patterns
- Missing or underutilized events
- Events with unusual patterns that might indicate tracking errors
- Recommendations for improving event tracking strategy`
        }
      }
    ]
  };
}

function generateChurnRiskPrompt(args: Record<string, string>): PromptResult {
  const appName = args.app_name || '[app name]';
  const inactivityDays = args.inactivity_days || '7';
  
  return {
    description: `Identify users at churn risk for ${appName}`,
    messages: [
      {
        role: 'user',
        content: {
          type: 'text',
          text: `Identify users who are at risk of churning from the "${appName}" application.

Please:
1. Use get_slipping_away_users with period=${inactivityDays} to find inactive users
2. Use get_user_loyalty to understand typical usage patterns
3. Use get_session_frequency to analyze session timing
4. Compare at-risk users with active users to identify patterns

Provide analysis including:
- Number of users at risk
- Common characteristics of at-risk users
- Recent behavior changes
- Recommendations for re-engagement campaigns
- Suggested interventions to reduce churn`
        }
      }
    ]
  };
}

function generatePerformanceDashboardPrompt(args: Record<string, string>): PromptResult {
  const appName = args.app_name || '[app name]';
  const timeRange = args.time_range || '30days';
  
  return {
    description: `Performance overview for ${appName}`,
    messages: [
      {
        role: 'user',
        content: {
          type: 'text',
          text: `Provide a comprehensive performance overview for "${appName}" over the ${timeRange} period.

Please gather data from:
1. get_dashboard_data for overall metrics
2. get_crash_statistics for stability metrics
3. get_session_durations for performance insights
4. get_analytics_data for detailed breakdowns
5. Check the countly://app/{app_id}/overview resource

Create a dashboard-style report covering:
- Key performance indicators (users, sessions, engagement)
- Application stability (crash rates, error rates)
- Performance metrics (session duration, response times)
- Growth trends
- Geographic distribution
- Device/platform breakdown
- Critical issues requiring attention
- Overall health score and recommendations`
        }
      }
    ]
  };
}
