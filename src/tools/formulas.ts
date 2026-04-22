import { ToolContext, ToolResult } from './types.js';
import { safeApiCall } from '../lib/error-handler.js';

// ============================================================================
// RUN_FORMULA TOOL
// ============================================================================

export const runFormulaToolDefinition = {
  name: 'formulas_run',
  description: 'Execute a calculated-metric formula combining sessions, users, events, and numeric values with filters and segments, via /o?method=calculated_metrics. Requires the formulas plugin. IMPORTANT: each variable is a SEPARATE object in the formula array (not all variables inside one object). To persist a formula use formulas_save.',
  inputSchema: {
    type: 'object',
    properties: {
      app_id: { type: 'string', description: 'Application ID. Either app_id or app_name must be provided; call apps_list first if you do not know it.' },
      app_name: { type: 'string', description: 'Application name (alternative to app_id). Must match an existing app exactly; call apps_list to find valid names.' },
      formula: {
        type: 'string',
        description: 'Formula as a JSON-encoded array; EACH VARIABLE is its own formula object. Every formula has: id (number), variables (one-element array). Each variable has: id (number), symbol ("A","B",...), selectedFunction ("number-of-sessions", "number-of-users", "event-count", ...), selectedEvent (event key or ""), selectedSegment ("" if none), selectedCohort ("" if none), selectedNumericValue (0), selectedOperator ("add"), queryWrapper ({"query":{},"queryText":""}), group ({"id":0,"parentId":0,"attemptFrom":false,"previewId":false,"lpt":false,"rpt":false,"before":0,"after":0}), ex ({"_do":"numberOf","_args":["sessions"]}). Example (sessions/users): [{"id":0,"variables":[{"id":0,"symbol":"A","selectedFunction":"number-of-sessions","selectedEvent":"","selectedSegment":"","selectedCohort":"","selectedNumericValue":0,"selectedOperator":"add","queryWrapper":{"query":{},"queryText":""},"group":{"id":0,"parentId":0,"attemptFrom":false,"previewId":false,"lpt":false,"rpt":false,"before":0,"after":0},"ex":{"_do":"numberOf","_args":["sessions"]}}]},{"id":1,"variables":[{"id":1,"symbol":"B","selectedFunction":"number-of-users","selectedEvent":"","selectedSegment":"","selectedCohort":"","selectedNumericValue":0,"selectedOperator":"add","queryWrapper":{"query":{},"queryText":""},"group":{"id":0,"parentId":0,"attemptFrom":false,"previewId":false,"lpt":false,"rpt":false,"before":0,"after":0},"ex":{"_do":"numberOf","_args":["users"]}}]}]'
      },
      period: {
        type: 'string',
        description: 'Time period. One of "month", "60days", "30days", "7days", "yesterday", "hour", or a custom range as [startMilliseconds,endMilliseconds]. Defaults to "30days".'
      },
      bucket: {
        type: 'string',
        description: 'Time-bucket breakdown as a JSON-encoded array. Options: ["daily"], ["weekly"], ["monthly"], ["single"], or combinations. Defaults to \'["single"]\'.'
      },
      format: {
        type: 'string',
        enum: ['float', 'integer', 'percentage'],
        description: 'Result formatting. Defaults to "float".'
      },
      dplaces: {
        type: 'number',
        description: 'Number of decimal places to round to. Defaults to 2.'
      },
      unit: {
        type: 'string',
        description: 'Display unit (e.g. "%", "$", "ms"). Defaults to empty string.'
      },
      previous: {
        type: 'boolean',
        description: 'When true, also compute the previous period for comparison. Defaults to true.'
      },
      allow_longtask: {
        type: 'boolean',
        description: 'When true, permit execution beyond the nginx timeout (server may queue as a long task). Defaults to false.'
      },
      mode: {
        type: 'string',
        enum: ['unsaved', 'saved'],
        description: '"unsaved" runs ad-hoc; "saved" also persists the formula (supply formulaMeta). Defaults to "unsaved".'
      },
      report_name: {
        type: 'string',
        description: 'Report name used when allow_longtask produces a background task. Optional.'
      },
      formulaMeta: {
        type: 'string',
        description: 'Required when mode="saved". JSON string with {name, description, key, visibility ("private"|"public"), format, dplaces, unit, sharedEmailEdit}. Example: \'{"name":"My Formula","description":"","key":"my_formula","visibility":"private","format":"float","dplaces":2,"unit":"","sharedEmailEdit":[]}\'.'
      },
    },
    required: ['formula'],
  },
};

export async function handleRunFormula(context: ToolContext, args: any): Promise<ToolResult> {
  const app_id = await context.resolveAppId(args);
  
  const params: any = {
    ...context.getAuthParams(),
    app_id,
    method: 'calculated_metrics',
    allow_longtask: args.allow_longtask !== undefined ? args.allow_longtask : false,
    previous: args.previous !== undefined ? args.previous : true,
    period: args.period || '30days',
    period_local: args.period || '30days',
    bucket: args.bucket || '["single"]',
    mode: args.mode || 'unsaved',
    formula: args.formula,
    format: args.format || 'float',
    dplaces: args.dplaces !== undefined ? args.dplaces : 2,
    unit: args.unit || '',
  };

  if (args.report_name) {
    params.report_name = args.report_name;
  }

  if (args.formulaMeta) {
    params.formulaMeta = args.formulaMeta;
  }

  const response = await safeApiCall(
    () => context.httpClient.get('/o', { params }),
    'Failed to run formula'
  );

  let resultText = `Formula calculation results for app ${app_id}:\n\n`;
  resultText += `**Configuration:**\n`;
  resultText += `- Period: ${params.period}\n`;
  resultText += `- Format: ${params.format}\n`;
  resultText += `- Decimal Places: ${params.dplaces}\n`;
  resultText += `- Unit: ${params.unit || '(none)'}\n`;
  resultText += `- Bucket: ${params.bucket}\n`;
  resultText += `- Mode: ${params.mode}\n\n`;
  resultText += `**Results:**\n`;
  resultText += JSON.stringify(response.data, null, 2);

  return {
    content: [
      {
        type: 'text',
        text: resultText,
      },
    ],
  };
}

// ============================================================================
// LIST_FORMULAS TOOL
// ============================================================================

export const listFormulasToolDefinition = {
  name: 'formulas_list',
  description: 'List saved calculated-metric formulas for an app (metadata and definitions) via /o/calculated_metrics/metrics. Requires the formulas plugin. To run a formula use formulas_run.',
  inputSchema: {
    type: 'object',
    properties: {
      app_id: { type: 'string', description: 'Application ID. Either app_id or app_name must be provided; call apps_list first if you do not know it.' },
      app_name: { type: 'string', description: 'Application name (alternative to app_id). Must match an existing app exactly; call apps_list to find valid names.' },
    },
  },
};

export async function handleListFormulas(context: ToolContext, args: any): Promise<ToolResult> {
  const app_id = await context.resolveAppId(args);

  const params = {
    ...context.getAuthParams(),
    app_id,
  };

  const response = await safeApiCall(
    () => context.httpClient.get('/o/calculated_metrics/metrics', { params }),
    'Failed to list formulas'
  );

  let resultText = `Saved formulas for app ${app_id}:\n\n`;
  
  if (response.data && Array.isArray(response.data)) {
    if (response.data.length === 0) {
      resultText += 'No saved formulas found.\n';
    } else {
      resultText += `Found ${response.data.length} formula(s):\n\n`;
      resultText += JSON.stringify(response.data, null, 2);
    }
  } else {
    resultText += JSON.stringify(response.data, null, 2);
  }

  return {
    content: [
      {
        type: 'text',
        text: resultText,
      },
    ],
  };
}

// ============================================================================
// DELETE_FORMULA TOOL
// ============================================================================

export const deleteFormulaToolDefinition = {
  name: 'formulas_delete',
  description: 'Delete a saved calculated-metric formula by _id via /i/calculated_metrics/delete. Requires the formulas plugin. WARNING: irreversible.',
  inputSchema: {
    type: 'object',
    properties: {
      app_id: { type: 'string', description: 'Application ID. Either app_id or app_name must be provided; call apps_list first if you do not know it.' },
      app_name: { type: 'string', description: 'Application name (alternative to app_id). Must match an existing app exactly; call apps_list to find valid names.' },
      formula_id: {
        type: 'string',
        description: 'Formula identifier (_id) to delete. Obtain it from formulas_list.',
      },
    },
    required: ['formula_id'],
  },
};

export async function handleDeleteFormula(context: ToolContext, args: any): Promise<ToolResult> {
  const app_id = await context.resolveAppId(args);

  const params = {
    ...context.getAuthParams(),
    app_id,
    id: args.formula_id,
  };

  const response = await safeApiCall(
    () => context.httpClient.get('/i/calculated_metrics/delete', { params }),
    'Failed to delete formula'
  );

  return {
    content: [
      {
        type: 'text',
        text: `Formula ${args.formula_id} deleted successfully for app ${app_id}.\n\n${JSON.stringify(response.data, null, 2)}`,
      },
    ],
  };
}

// ============================================================================
// SAVE_FORMULA TOOL
// ============================================================================

export const saveFormulaToolDefinition = {
  name: 'formulas_save',
  description: 'Persist a calculated-metric formula for later reuse (listable via formulas_list, runnable via formulas_run). Posts to /i/calculated_metrics/save. Requires the formulas plugin.',
  inputSchema: {
    type: 'object',
    properties: {
      app_id: { type: 'string', description: 'Application ID. Either app_id or app_name must be provided; call apps_list first if you do not know it.' },
      app_name: { type: 'string', description: 'Application name (alternative to app_id). Must match an existing app exactly; call apps_list to find valid names.' },
      title: {
        type: 'string',
        description: 'Display title for the saved formula (e.g. "Sessions per User").'
      },
      description: {
        type: 'string',
        description: 'Optional free-form description. Defaults to empty string.',
        default: ''
      },
      key: {
        type: 'string',
        description: 'Stable slug identifier (e.g. "sessions_per_user"). Defaults to "unnamed_formula".',
        default: 'unnamed_formula'
      },
      visibility: {
        type: 'string',
        enum: ['private', 'public'],
        description: 'Who can see the formula: "private" (owner only) or "public" (shared with team). Defaults to "private".',
        default: 'private'
      },
      format: {
        type: 'string',
        enum: ['float', 'integer', 'percentage'],
        description: 'Result format. Defaults to "float".',
        default: 'float'
      },
      dplaces: {
        type: 'number',
        description: 'Decimal places to round to. Defaults to 2.',
        default: 2
      },
      unit: {
        type: 'string',
        description: 'Display unit (e.g. "%", "$", "ms"). Defaults to empty string.',
        default: ''
      },
      formula: {
        type: 'string',
        description: 'Formula definition as a JSON-encoded array. Same structure as formulas_run.formula (one variable per formula object). See formulas_run for a full example.'
      },
      shared_email_edit: {
        type: 'array',
        description: 'Email addresses of dashboard users granted edit access when visibility is "public". Defaults to [].',
        items: { type: 'string' },
        default: []
      },
    },
    required: ['title', 'formula'],
  },
};

export async function handleSaveFormula(context: ToolContext, args: any): Promise<ToolResult> {
  const app_id = await context.resolveAppId(args);

  const metric = {
    title: args.title,
    description: args.description || '',
    key: args.key || 'unnamed_formula',
    visibility: args.visibility || 'private',
    format: args.format || 'float',
    dplaces: args.dplaces !== undefined ? args.dplaces : 2,
    unit: args.unit || '',
    formula: args.formula,
    shared_email_edit: args.shared_email_edit || [],
    app: app_id,
  };

  const params = {
    ...context.getAuthParams(),
    app_id,
    metric: JSON.stringify(metric),
  };

  const response = await safeApiCall(
    () => context.httpClient.get('/i/calculated_metrics/save', { params }),
    'Failed to save formula'
  );

  return {
    content: [
      {
        type: 'text',
        text: `Formula "${args.title}" saved successfully for app ${app_id}.\n\n${JSON.stringify(response.data, null, 2)}`,
      },
    ],
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export const formulasToolDefinitions = [
  runFormulaToolDefinition,
  listFormulasToolDefinition,
  deleteFormulaToolDefinition,
  saveFormulaToolDefinition,
];

export const formulasToolHandlers = {
  'formulas_run': 'runFormula',
  'formulas_list': 'listFormulas',
  'formulas_delete': 'deleteFormula',
  'formulas_save': 'saveFormula',
} as const;

export class FormulasTools {
  constructor(private context: ToolContext) {}

  async runFormula(args: any): Promise<ToolResult> {
    return handleRunFormula(this.context, args);
  }

  async listFormulas(args: any): Promise<ToolResult> {
    return handleListFormulas(this.context, args);
  }

  async deleteFormula(args: any): Promise<ToolResult> {
    return handleDeleteFormula(this.context, args);
  }

  async saveFormula(args: any): Promise<ToolResult> {
    return handleSaveFormula(this.context, args);
  }
}

// Metadata for dynamic routing (must be after class declaration)
export const formulasToolMetadata = {
  instanceKey: 'formulas',
  toolClass: FormulasTools,
  handlers: formulasToolHandlers,
} as const;
