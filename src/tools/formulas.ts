import { ToolContext, ToolResult } from './types.js';
import { safeApiCall } from '../lib/error-handler.js';

// ============================================================================
// RUN_FORMULA TOOL
// ============================================================================

export const runFormulaToolDefinition = {
  name: 'run_formula',
  description: 'Run a formula calculation on number properties using mathematical equations. Formulas can combine various metrics like sessions, events, users with filters and segments.',
  inputSchema: {
    type: 'object',
    properties: {
      app_id: { type: 'string', description: 'Application ID (optional if app_name is provided)' },
      app_name: { type: 'string', description: 'Application name (alternative to app_id)' },
      formula: {
        type: 'string',
        description: 'Formula definition as JSON string. Array of formula objects with variables. Each variable has: id, symbol (e.g., "A", "B"), selectedFunction (e.g., "number-of-sessions", "event-count"), selectedEvent (event key if using events), selectedSegment, queryWrapper with query object for filtering, and ex object with _do and _args. Example: [{"id":0,"variables":[{"id":0,"symbol":"A","selectedFunction":"number-of-sessions","ex":{"_do":"numberOf","_args":["sessions"]}}]}]'
      },
      period: {
        type: 'string',
        description: 'Time period for calculation. Possible values: "month", "60days", "30days", "7days", "yesterday", "hour", or custom range. Defaults to "30days".'
      },
      bucket: {
        type: 'string',
        description: 'Time bucket breakdown as JSON array. Options: ["daily"], ["weekly"], ["monthly"], ["single"], or combinations like ["daily","weekly","monthly","single"]. Defaults to ["single"].'
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
    anyOf: [
      { required: ['app_id'] },
      { required: ['app_name'] }
    ],
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
  name: 'list_formulas',
  description: 'List all saved formulas for an application.',
  inputSchema: {
    type: 'object',
    properties: {
      app_id: { type: 'string', description: 'Application ID (optional if app_name is provided)' },
      app_name: { type: 'string', description: 'Application name (alternative to app_id)' },
    },
    anyOf: [
      { required: ['app_id'] },
      { required: ['app_name'] }
    ],
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
  name: 'delete_formula',
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
    anyOf: [
      { required: ['app_id'] },
      { required: ['app_name'] }
    ],
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
// EXPORTS
// ============================================================================

export const formulasToolDefinitions = [
  runFormulaToolDefinition,
  listFormulasToolDefinition,
  deleteFormulaToolDefinition,
];

export const formulasToolHandlers = {
  'run_formula': 'runFormula',
  'list_formulas': 'listFormulas',
  'delete_formula': 'deleteFormula',
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
}

// Metadata for dynamic routing (must be after class declaration)
export const formulasToolMetadata = {
  instanceKey: 'formulas',
  toolClass: FormulasTools,
  handlers: formulasToolHandlers,
} as const;
