import { readFileSync } from 'fs';

import { describe, it, expect } from 'vitest';

import { TOOL_CATEGORIES } from '../src/lib/tools-config.js';
import { getAllToolDefinitions } from '../src/tools/index.js';

/**
 * README "Available Tools" must list exactly the registered tools, and its
 * headline counts must match, so the docs cannot drift from the code.
 */
describe('README tool list', () => {
  const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');
  const listed = [...readme.matchAll(/^- \*\*`([a-z0-9_]+)`\*\*/gm)].map((m) => m[1]);
  const tools = getAllToolDefinitions().map((t) => t.name);

  it('lists every tool exactly once', () => {
    expect(listed.filter((name, i) => listed.indexOf(name) !== i)).toEqual([]);
    expect([...listed].sort()).toEqual([...tools].sort());
  });

  it('states the right counts', () => {
    const categories = Object.keys(TOOL_CATEGORIES).length;
    expect(readme).toContain(`**${tools.length} Tools** across ${categories} categories`);
    expect(readme).toContain(`### Tools (${tools.length} available)`);
    expect(readme).toContain(`The server provides ${tools.length} tools across ${categories} categories`);
  });
});
