/**
 * Guards for the welcome page and manifest served by the HTTP transport.
 *
 * The landing page is customer-facing setup documentation that happens to live
 * inside src/index.ts, so it drifts silently: it once told people to install
 * `@countly/countly-mcp-server` (a package that has never existed), to paste
 * "your-api-key" into COUNTLY_AUTH_TOKEN, and to configure VS Code through a
 * settings key that VS Code no longer reads. Nothing failed, because no test
 * looked at prose.
 *
 * These tests assert the page's claims against the code that implements them.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { TOOL_CATEGORIES } from '../src/lib/tools-config.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');

const indexSource = readFileSync(join(projectRoot, 'src/index.ts'), 'utf-8');
const packageJson = JSON.parse(
  readFileSync(join(projectRoot, 'package.json'), 'utf-8')
) as { name: string };

/** The welcome-page template literal, isolated from the rest of index.ts. */
const welcomePage = (() => {
  const start = indexSource.indexOf('<!DOCTYPE html>');
  const end = indexSource.indexOf('</html>', start);
  expect(start, 'welcome page template not found in src/index.ts').toBeGreaterThan(-1);
  expect(end, 'welcome page has no closing </html>').toBeGreaterThan(start);
  return indexSource.slice(start, end);
})();

describe('welcome page', () => {
  describe('install instructions', () => {
    it('never references a scoped @countly/ package', () => {
      // The published package is unscoped. `npx -y @countly/countly-mcp-server`
      // fails with E404, so any scoped reference is a broken copy-paste.
      expect(welcomePage).not.toContain('@countly/');
    });

    it('installs the package name that package.json actually publishes', () => {
      const npxRefs = welcomePage.match(/[\w@./-]*countly-mcp-server[\w@./-]*/g) ?? [];
      expect(npxRefs.length).toBeGreaterThan(0);

      for (const ref of npxRefs) {
        // Strip an optional @version / @latest suffix before comparing.
        const bare = ref.replace(/@[\w.-]+$/, '');
        expect(
          bare === packageJson.name || bare.endsWith(`/${packageJson.name}`),
          `"${ref}" does not match published package name "${packageJson.name}"`
        ).toBe(true);
      }
    });

    it('does not call the auth token an API key', () => {
      // There is no API-key auth path anywhere in this server. Calling the
      // token an "api-key" sends people to the wrong screen in Countly.
      expect(welcomePage).not.toMatch(/your-api-key/i);
      expect(welcomePage).not.toMatch(/["']?api[_-]?key["']?\s*[:=]/i);
    });

    it('uses the VS Code servers key, not the retired mcp.servers setting', () => {
      expect(welcomePage).not.toContain('"mcp.servers"');
      expect(welcomePage).toContain('"servers"');
    });

    it('covers Claude Desktop, VS Code and Claude Code', () => {
      expect(welcomePage).toContain('Claude Desktop');
      expect(welcomePage).toContain('VS Code');
      expect(welcomePage).toContain('Claude Code');
    });

    it('gives CLI examples an absolute URL, not a bare path', () => {
      // `claude mcp add --transport http countly /mcp` is not a usable command;
      // the endpoint has to carry scheme and host.
      const cliLines = welcomePage
        .split('\n')
        .filter((line) => line.includes('claude mcp add --transport http'));
      expect(cliLines.length).toBeGreaterThan(0);
      for (const line of cliLines) {
        expect(line, `"${line.trim()}" must interpolate an absolute URL`).toContain(
          '${pageEndpointUrl}'
        );
      }
    });
  });

  describe('configuration claims', () => {
    it('only advertises environment variables the server reads', () => {
      const advertised = new Set(welcomePage.match(/COUNTLY_[A-Z_]+/g) ?? []);
      expect(advertised.size).toBeGreaterThan(0);

      // Everything the codebase actually consults, minus the page itself.
      const implemented = new Set(
        (indexSource.replace(welcomePage, '').match(/COUNTLY_[A-Z_]+/g) ?? [])
      );
      for (const file of ['src/lib/tools-config.ts', 'src/lib/auth.ts', 'src/lib/config.ts']) {
        const src = readFileSync(join(projectRoot, file), 'utf-8');
        for (const name of src.match(/COUNTLY_[A-Z_]+/g) ?? []) {
          implemented.add(name);
        }
      }

      for (const name of advertised) {
        // COUNTLY_TOOLS_* is built dynamically per category, so accept any
        // documented category that really exists. A bare COUNTLY_TOOLS_ is the
        // page's own `COUNTLY_TOOLS_<CATEGORY>` placeholder, not a claim.
        if (name === 'COUNTLY_TOOLS_') {
          continue;
        }
        if (name.startsWith('COUNTLY_TOOLS_')) {
          const category = name.slice('COUNTLY_TOOLS_'.length).toLowerCase();
          expect(
            category === 'all' || category in TOOL_CATEGORIES,
            `page documents ${name} but "${category}" is not a tool category`
          ).toBe(true);
          continue;
        }
        expect(
          implemented.has(name),
          `page documents ${name} but nothing in the server reads it`
        ).toBe(true);
      }
    });

    it('flags URL-parameter auth as deprecated wherever it is mentioned', () => {
      if (!welcomePage.includes('auth_token=')) {
        return;
      }
      expect(welcomePage.toLowerCase()).toContain('deprecated');
    });

    it('documents the token-file variable rather than a bare filename', () => {
      expect(welcomePage).toContain('COUNTLY_AUTH_TOKEN_FILE');
    });
  });

  describe('tool inventory', () => {
    it('derives the advertised tools from the tool registry, not a fixed list', () => {
      // A hardcoded grid is how the page came to claim nine categories while
      // the server exposed thirty-three.
      expect(welcomePage).toContain('pageCategories.map');
      expect(welcomePage).toContain('pageTools.length');
    });

    it('reflects operator restrictions by filtering through toolsConfig', () => {
      expect(indexSource).toContain('const pageTools = filterTools(getAllToolDefinitions(), this.toolsConfig)');
    });
  });

  describe('favicon', () => {
    it('links a favicon in the document head', () => {
      expect(welcomePage).toMatch(/<link\s+rel="icon"/);
    });

    it('serves both /favicon.svg and the /favicon.ico browsers ask for', () => {
      expect(indexSource).toContain("pathname === '/favicon.svg'");
      expect(indexSource).toContain("pathname === '/favicon.ico'");
    });

    it('inlines the icon so self-hosted deployments need no CDN', () => {
      const favicon = readFileSync(join(projectRoot, 'src/lib/favicon.ts'), 'utf-8');
      expect(favicon).toContain('<svg');
      // The xmlns namespace is a bare identifier, not a fetch. What must not
      // appear is anything the renderer would actually go to the network for.
      expect(favicon).not.toMatch(/(?:href|src|xlink:href)\s*=\s*["']https?:/i);
      expect(favicon).not.toMatch(/url\(\s*["']?https?:/i);
    });
  });
});

describe('manifest tool categories', () => {
  it('counts categories from the registry, not tool-name prefixes', () => {
    // Splitting tool names on the first underscore reported 38 categories for
    // a server that has 33: `crash_groups_list` and `crashes_get` land in the
    // same category but produce different prefixes.
    expect(indexSource).not.toContain("t.name.split('_')[0]))].length");

    const prefixCount = new Set(
      Object.values(TOOL_CATEGORIES)
        .flatMap((data) => Object.keys(data.operations))
        .map((name) => name.split('_')[0])
    ).size;
    const realCount = Object.keys(TOOL_CATEGORIES).length;

    // Guards the premise: if these ever coincide, this test proves nothing.
    expect(prefixCount).not.toBe(realCount);
  });
});
