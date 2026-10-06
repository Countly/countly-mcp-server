import { describe, it, expect } from 'vitest';
import { getAllToolDefinitions, getV2ToolDefinitionOverrides } from '../src/tools/index.js';
import { getToolAnnotations, withAnnotations } from '../src/lib/tool-annotations.js';
import { TOOL_CATEGORIES } from '../src/lib/tools-config.js';

const allToolNames = [
  ...new Set([
    ...getAllToolDefinitions().map(t => t.name),
    ...Object.keys(getV2ToolDefinitionOverrides()),
  ]),
];

function operationOf(name: string): string | undefined {
  for (const category of Object.values(TOOL_CATEGORIES)) {
    if (name in category.operations) {
      return category.operations[name];
    }
  }
  return undefined;
}

describe('tool annotations', () => {
  it('annotates every tool, so clients never fall back to "may be destructive" for all', () => {
    expect(allToolNames.filter(name => !getToolAnnotations(name))).toEqual([]);
  });

  it('marks exactly the read tools as read-only', () => {
    for (const name of allToolNames) {
      expect({ name, readOnly: getToolAnnotations(name)!.readOnlyHint })
        .toEqual({ name, readOnly: operationOf(name) === 'R' });
    }
  });

  it('marks every delete tool as destructive', () => {
    const deletes = allToolNames.filter(name => operationOf(name) === 'D');
    expect(deletes).toContain('apps_delete');
    expect(deletes).toContain('apps_reset');
    for (const name of deletes) {
      expect({ name, ...getToolAnnotations(name) }).toMatchObject({ name, destructiveHint: true });
    }
  });

  it('keeps create tools non-destructive unless they can also overwrite', () => {
    expect(getToolAnnotations('notes_create')).toMatchObject({ destructiveHint: false });
    // alerts_create updates an existing alert when alert_config._id is given
    expect(getToolAnnotations('alerts_create')).toMatchObject({ destructiveHint: true });
  });

  it('flags tools that send emails or call webhooks as open-world', () => {
    for (const name of ['hooks_test', 'email_reports_send', 'hooks_create', 'alerts_create']) {
      expect({ name, ...getToolAnnotations(name) }).toMatchObject({ name, openWorldHint: true });
    }
    expect(getToolAnnotations('apps_delete')).toMatchObject({ openWorldHint: false });
    // hooks_test really runs the effects, it is not a dry run
    expect(getToolAnnotations('hooks_test')).toMatchObject({ readOnlyHint: false, destructiveHint: true });
  });

  it('treats reversible status changes as non-destructive', () => {
    expect(getToolAnnotations('crashes_resolve')).toMatchObject({ destructiveHint: false, idempotentHint: true });
  });

  it('attaches annotations without mutating the definition', () => {
    const definition = { name: 'apps_delete', description: 'x', inputSchema: { type: 'object' } };
    const annotated = withAnnotations(definition);
    expect(annotated.annotations).toMatchObject({ destructiveHint: true });
    expect(definition).not.toHaveProperty('annotations');
  });
});

describe('destructive tool descriptions', () => {
  it('warn about irreversible effects on every delete tool', () => {
    const definitions = [
      ...getAllToolDefinitions(),
      ...Object.values(getV2ToolDefinitionOverrides()) as Array<{ name: string; description: string }>,
    ];
    const missing = definitions
      .filter(d => operationOf(d.name) === 'D')
      .filter(d => !/WARNING|irreversib|permanent/i.test(d.description))
      .map(d => d.name);
    expect(missing).toEqual([]);
  });
});
