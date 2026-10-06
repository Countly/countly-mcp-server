/**
 * Checks that the default plugin sets snapshotted in src/lib/default-plugins.ts
 * still match upstream. They decide which tools a non-admin token sees, so a
 * stale snapshot silently hides or shows the wrong tools.
 *
 * Needs MCP_E2E_GITHUB_TOKEN with read access to the (partly private) source
 * repos. Skipped without it, and by the release gate
 * (MCP_E2E_SKIP_PLUGIN_SNAPSHOT=1): upstream drift shouldn't block a release.
 */

import { describe, expect, it } from 'vitest';

import {
  ENTERPRISE_DEFAULT_PLUGINS,
  LITE_DEFAULT_PLUGINS,
  PLATFORM_DEFAULT_PLUGINS,
} from '../../src/lib/default-plugins.js';

const token = process.env.MCP_E2E_GITHUB_TOKEN?.trim();
const skip = !token || process.env.MCP_E2E_SKIP_PLUGIN_SNAPSHOT === '1';

const SOURCES = [
  { name: 'LITE_DEFAULT_PLUGINS', repo: 'Countly/countly-server', ref: 'master', path: 'plugins/plugins.default.json', snapshot: LITE_DEFAULT_PLUGINS },
  { name: 'ENTERPRISE_DEFAULT_PLUGINS', repo: 'Countly/countly-enterprise-plugins', ref: 'master', path: 'plugins/plugins.ee.json', snapshot: ENTERPRISE_DEFAULT_PLUGINS },
  { name: 'PLATFORM_DEFAULT_PLUGINS', repo: 'Countly/countly-platform', ref: 'main', path: 'plugins/plugins.default.json', snapshot: PLATFORM_DEFAULT_PLUGINS },
];

async function fetchUpstream(repo: string, ref: string, path: string): Promise<string[]> {
  const res = await fetch(`https://api.github.com/repos/${repo}/contents/${path}?ref=${ref}`, {
    headers: {
      Accept: 'application/vnd.github.raw',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });
  if (!res.ok) {
    throw new Error(`GET ${repo}/${path}@${ref}: HTTP ${res.status} (does MCP_E2E_GITHUB_TOKEN have read access?)`);
  }
  const list = await res.json();
  if (!Array.isArray(list) || !list.every((p) => typeof p === 'string')) {
    throw new Error(`${repo}/${path} is not a JSON array of plugin names`);
  }
  return list;
}

describe.skipIf(skip)('default plugin snapshots match upstream', () => {
  it.each(SOURCES)('$name matches $repo/$path@$ref', async ({ name, repo, ref, path, snapshot }) => {
    const upstream = new Set(await fetchUpstream(repo, ref, path));
    const local = new Set(snapshot);
    const add = [...upstream].filter((p) => !local.has(p));
    const remove = [...local].filter((p) => !upstream.has(p));
    expect(
      { add, remove },
      `${name} in src/lib/default-plugins.ts is out of date with ${repo}/${path}@${ref}: ` +
      `add [${add.join(', ')}], remove [${remove.join(', ')}]`
    ).toEqual({ add: [], remove: [] });
  });
});
