import { ToolContext, ToolResult } from './types.js';
import { safeApiCall } from '../lib/error-handler.js';

// ============================================================================
// RUN_FORMULA TOOL
// ============================================================================

export const runFormulaToolDefinition = {
  name: 'formulas_run',
  description: 'Run a formula calculation on number properties using mathematical equations. Formulas can combine various metrics like sessions, events, users with filters and segments. IMPORTANT: Each variable must be a separate formula object in the array, not all variables in one object.',
  inputSchema: {
    type: 'object',
    properties: {
      app_id: { type: 'string', description: 'Application ID (optional if app_name is provided)' },
      app_name: { type: 'string', description: 'Application name (alternative to app_id)' },
      formula: {
        type: 'string',
        description: 'Formula definition as JSON string. MUST be an array where EACH VARIABLE is a SEPARATE object (not all variables in one object). Each formula object contains: id (number), variables (array with single variable object). Each variable object MUST include: id (number), symbol (string: "A", "B", etc.), selectedFunction (string: "number-of-sessions", "number-of-users", "event-count", etc.), selectedEvent (string: event key or empty), selectedSegment (string: segment or empty), selectedCohort (string: cohort or empty), selectedNumericValue (number: 0), selectedOperator (string: "add"), queryWrapper (object: {"query":{},"queryText":""}), group (object: {"id":0,"parentId":0,"attemptFrom":false,"previewId":false,"lpt":false,"rpt":false,"before":0,"after":0}), ex (object: {"_do":"numberOf","_args":["sessions"|"users"|etc]}). Example for sessions/users: [{"id":0,"variables":[{"id":0,"symbol":"A","selectedFunction":"number-of-sessions","selectedEvent":"","selectedSegment":"","selectedCohort":"","selectedNumericValue":0,"selectedOperator":"add","queryWrapper":{"query":{},"queryText":""},"group":{"id":0,"parentId":0,"attemptFrom":false,"previewId":false,"lpt":false,"rpt":false,"before":0,"after":0},"ex":{"_do":"numberOf","_args":["sessions"]}}]},{"id":1,"variables":[{"id":1,"symbol":"B","selectedFunction":"number-of-users","selectedEvent":"","selectedSegment":"","selectedCohort":"","selectedNumericValue":0,"selectedOperator":"add","queryWrapper":{"query":{},"queryText":""},"group":{"id":0,"parentId":0,"attemptFrom":false,"previewId":false,"lpt":false,"rpt":false,"before":0,"after":0},"ex":{"_do":"numberOf","_args":["users"]}}]}]'
      },
      period: {
        type: 'string',
        description: 'Time period for calculation. Possible values: "month", "60days", "30days", "7days", "yesterday", "hour", or custom range. Defaults to "30days".'
      },
      bucket: {
        type: 'string',
        description: 'Time bucket breakdown as JSON array string. Options: ["daily"], ["weekly"], ["monthly"], ["single"], or combinations like ["daily","weekly","monthly","single"]. Defaults to ["single"].'
      },
      format: {
        type: 'string',
        enum: ['float', 'integer', 'percentage'],
        description: 'Result format type. Defaults to "float".'
      },
      dplaces: {
        type: 'number',
        description: 'Number of decimal places for the result. Defaults to 2.'
      },
      unit: {
        type: 'string',
        description: 'Unit of measurement for the result (e.g., "%", "$", "ms"). Defaults to empty string.'
      },
      previous: {
        type: 'boolean',
        description: 'Include previous period for comparison. Defaults to true.'
      },
      allow_longtask: {
        type: 'boolean',
        description: 'Allow running longer than nginx timeout. Defaults to false.'
      },
      mode: {
        type: 'string',
        enum: ['unsaved', 'saved'],
        description: 'Whether to save the formula for later use. Defaults to "unsaved".'
      },
      report_name: {
        type: 'string',
        description: 'Report name if the task runs longer than nginx timeout. Optional.'
      },
      formulaMeta: {
        type: 'string',
        description: 'Formula metadata as JSON string if mode is "saved". Should include: name, description, key, visibility ("private" or "public"), format, dplaces, unit, sharedEmailEdit array. Example: {"name":"My Formula","description":"","key":"my_formula","visibility":"private","format":"float","dplaces":2,"unit":"","sharedEmailEdit":[]}'
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
  description: 'List all saved formulas for an application.',
  inputSchema: {
    type: 'object',
    properties: {
      app_id: { type: 'string', description: 'Application ID (optional if app_name is provided)' },
      app_name: { type: 'string', description: 'Application name (alternative to app_id)' },
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
  description: 'Delete a saved formula by its ID.',
  inputSchema: {
    type: 'object',
    properties: {
      app_id: { type: 'string', description: 'Application ID (optional if app_name is provided)' },
      app_name: { type: 'string', description: 'Application name (alternative to app_id)' },
      formula_id: {
        type: 'string',
        description: 'The ID of the formula to delete',
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
  description: 'Save a formula for later use. The formula will be stored and can be retrieved using formulas_list.',
  inputSchema: {
    type: 'object',
    properties: {
      app_id: { type: 'string', description: 'Application ID (optional if app_name is provided)' },
      app_name: { type: 'string', description: 'Application name (alternative to app_id)' },
      title: {
        type: 'string',
        description: 'Human-readable title for the formula (e.g., "Sessions per User")'
      },
      description: {
        type: 'string',
        description: 'Optional description of what the formula calculates',
        default: ''
      },
      key: {
        type: 'string',
        description: 'Unique identifier key for the formula (e.g., "sessions_per_user"). Use "unnamed_formula" if not specified.',
        default: 'unnamed_formula'
      },
      visibility: {
        type: 'string',
        enum: ['private', 'public'],
        description: 'Visibility of the formula. "private" (only you) or "public" (shared with team)',
        default: 'private'
      },
      format: {
        type: 'string',
        enum: ['float', 'integer', 'percentage'],
        description: 'Result format type',
        default: 'float'
      },
      dplaces: {
        type: 'number',
        description: 'Number of decimal places for the result',
        default: 2
      },
      unit: {
        type: 'string',
        description: 'Unit of measurement (e.g., "%", "$", "ms")',
        default: ''
      },
      formula: {
        type: 'string',
        description: 'Formula definition as JSON string. MUST be an array where EACH VARIABLE is a SEPARATE object. Same format as formulas_run tool. Example: [{"id":0,"variables":[{"id":0,"symbol":"A","selectedFunction":"number-of-sessions","selectedEvent":"","selectedSegment":"","selectedCohort":"","selectedNumericValue":0,"selectedOperator":"add","queryWrapper":{"query":{},"queryText":""},"group":{"id":0,"parentId":0,"attemptFrom":false,"previewId":false,"lpt":false,"rpt":false,"before":0,"after":0},"ex":{"_do":"numberOf","_args":["sessions"]}}]},{"id":1,"variables":[{"id":1,"symbol":"B","selectedFunction":"number-of-users","selectedEvent":"","selectedSegment":"","selectedCohort":"","selectedNumericValue":0,"selectedOperator":"add","queryWrapper":{"query":{},"queryText":""},"group":{"id":0,"parentId":0,"attemptFrom":false,"previewId":false,"lpt":false,"rpt":false,"before":0,"after":0},"ex":{"_do":"numberOf","_args":["users"]}}]}]'
      },
      shared_email_edit: {
        type: 'array',
        description: 'Array of email addresses for users who can edit this formula',
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
