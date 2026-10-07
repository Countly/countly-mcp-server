import { describe, expect, it } from 'vitest';

import { getToolRequiredPlugin, V2_ONLY_TOOLS } from '../src/lib/tools-config.js';
import { expectPlatformV2Tools } from './e2e/helpers/suite.js';

const tools = [...V2_ONLY_TOOLS];
const plugins = [...new Set(tools.map(getToolRequiredPlugin).filter((p): p is string => !!p))];
const withoutStage = tools.filter((tool) => !tool.startsWith('stage_'));
const withoutStagePlugin = plugins.filter((plugin) => plugin !== 'stage');

describe('live Platform tool visibility', () => {
  it('accepts a Platform server without the optional Stage plugin', () => {
    expect(() => expectPlatformV2Tools(withoutStage, withoutStagePlugin)).not.toThrow();
  });

  it('requires Stage tools when the plugin is enabled', () => {
    expect(() => expectPlatformV2Tools(tools, plugins)).not.toThrow();
    expect(() => expectPlatformV2Tools(withoutStage, plugins)).toThrow(/stage_reference/);
  });

  it('rejects Stage tools exposed without the plugin', () => {
    expect(() => expectPlatformV2Tools(tools, withoutStagePlugin)).toThrow(/stage_reference/);
  });

  it('still requires core v2 tools on a server without Stage', () => {
    expect(() => expectPlatformV2Tools(withoutStage.filter((tool) => tool !== 'notes_update'), withoutStagePlugin))
      .toThrow(/notes_update/);
  });
});
