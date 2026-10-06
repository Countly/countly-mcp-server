import { describe, it, expect } from 'vitest';

import { applyEditOps, newLayerPieces } from '../src/tools/stage-edit.js';

const base = () => ({
  version: 1,
  name: 'Deck',
  width: 1920,
  height: 1080,
  layers: [
    { id: 'title', piece: 'caption', x: 0, y: 0, w: 800, h: 200, props: { title: 'Hello', size: 'lg' }, enter: { preset: 'rise', delay: 0, duration: 700 } },
    { id: 'app', piece: 'app-page', x: 0, y: 300, w: 1200, h: 700, props: {}, enter: { preset: 'fade', delay: 0, duration: 700 } },
  ],
  steps: [{ id: 's1', name: 'Intro', layers: ['title'], hold: 4000 }],
});

describe('stage scene edit operations', () => {
  it('adds a layer from the piece start props and puts it on steps', () => {
    const scene = applyEditOps(base(), [
      { op: 'set_step', id: 's2', name: 'Numbers' },
      { op: 'set_layer', id: 'kpi', piece: 'kpi-row', x: 100, y: 400, steps: ['s2'], props: { columns: 3 } },
    ], { 'kpi-row': { defaultSize: { w: 900, h: 160 }, startProps: { items: [{ label: 'Users' }] } } });
    const kpi = scene.layers.find((l: any) => l.id === 'kpi');
    expect(kpi).toMatchObject({ piece: 'kpi-row', x: 100, y: 400, w: 900, h: 160, props: { items: [{ label: 'Users' }], columns: 3 } });
    expect(scene.steps[1]).toEqual({ id: 's2', name: 'Numbers', layers: ['kpi'], hold: 4000 });
  });

  it('merges props, removes with null, replaces on request', () => {
    const merged = applyEditOps(base(), [{ op: 'set_layer', id: 'title', props: { title: 'Hi', size: null, eyebrow: 'New' } }]);
    expect(merged.layers[0].props).toEqual({ title: 'Hi', eyebrow: 'New' });
    const replaced = applyEditOps(base(), [{ op: 'set_layer', id: 'title', props: { title: 'Only' }, replace_props: true }]);
    expect(replaced.layers[0].props).toEqual({ title: 'Only' });
  });

  it('plays a scenario on an app layer, adding it to the step', () => {
    const scene = applyEditOps(base(), [{ op: 'set_step', id: 's1', play: { layer: 'app', scenario: 'drill-query', from: 'run', to: '' }, advance: 'click', dark: true }]);
    expect(scene.steps[0]).toMatchObject({ play: { layer: 'app', scenario: 'drill-query', from: 'run' }, advance: 'click', dark: true, layers: ['title', 'app'] });
    expect(() => applyEditOps(base(), [{ op: 'set_step', id: 's1', play: { layer: 'nope', scenario: 'x' } }])).toThrow(/ops\[0\].*not a layer/);
  });

  it('replacing a step\'s layers cannot drop the layer it plays', () => {
    const playing = applyEditOps(base(), [{ op: 'set_step', id: 's1', play: { layer: 'app', scenario: 'drill-query' } }]);
    expect(() => applyEditOps(playing, [{ op: 'set_step', id: 's1', layers: ['title'] }])).toThrow(/leaves out app, which this step plays/);
    const stopped = applyEditOps(playing, [{ op: 'set_step', id: 's1', layers: ['title'], play: null }]);
    expect(stopped.steps[0]).toEqual({ id: 's1', name: 'Intro', layers: ['title'], hold: 4000 });
  });

  it('set_layer steps cannot take a layer off a step that plays it', () => {
    const playing = applyEditOps(base(), [{ op: 'set_step', id: 's1', play: { layer: 'app', scenario: 'drill-query' } }]);
    expect(() => applyEditOps(playing, [{ op: 'set_layer', id: 'app', steps: [] }])).toThrow(/leaves out s1, which plays a scenario on this layer/);
    const moved = applyEditOps(playing, [{ op: 'set_step', id: 's1', play: null }, { op: 'set_layer', id: 'app', steps: [] }]);
    expect(moved.steps[0].layers).toEqual(['title']);
  });

  it('removing a layer clears it from steps, plays and breakpoints', () => {
    const scene = applyEditOps(base(), [
      { op: 'set_step', id: 's1', play: { layer: 'app', scenario: 'drill-query' } },
      { op: 'set_fit' },
      { op: 'set_breakpoint', id: 'phone', max_width: 480, boxes: { app: { x: 0, y: 0, w: 480, h: 300 } } },
      { op: 'remove_layer', id: 'app' },
    ]);
    expect(scene.layers.map((l: any) => l.id)).toEqual(['title']);
    expect(scene.steps[0].play).toBeUndefined();
    expect(scene.steps[0].layers).toEqual(['title']);
    expect(scene.variants[0].boxes).toEqual({});
  });

  it('removing a step can take its own layers with it', () => {
    const scene = applyEditOps(base(), [{ op: 'remove_step', id: 's1', remove_layers: true }]);
    expect(scene.steps).toBeUndefined();
    expect(scene.layers.map((l: any) => l.id)).toEqual(['app']);
  });

  it('makes a responsive section with breakpoints, and back', () => {
    const scene = applyEditOps(base(), [
      { op: 'set_fit', min_height: 500 },
      { op: 'set_breakpoint', id: 'tablet', max_width: 768, name: 'Tablet', boxes: { title: { x: 20, y: 20, w: 700, h: 150 } } },
    ]);
    expect(scene.fit).toEqual({ minHeight: 500, maxHeight: 760, minText: 13 });
    expect(scene.variants[0]).toMatchObject({ id: 'tablet', maxWidth: 768, width: 768, name: 'Tablet', boxes: { title: { x: 20, y: 20, w: 700, h: 150 } } });
    expect(() => applyEditOps(base(), [{ op: 'set_breakpoint', id: 'x', max_width: 480 }])).toThrow(/set_fit first/);
    expect(applyEditOps(scene, [{ op: 'set_fit', responsive: false }]).fit).toBeUndefined();
  });

  it('sets delivery and scene fields, paper included', () => {
    const scene = applyEditOps(base(), [
      { op: 'set_delivery', mode: 'click', click: { footer: 'Countly' } },
      { op: 'set_scene', look: 'web', paper: 'a4', company: '' },
    ]);
    expect(scene.delivery).toEqual({ mode: 'click', click: { footer: 'Countly' } });
    expect(scene).toMatchObject({ look: 'web', width: 794, height: 1123 });
  });

  it('reorders layers and steps', () => {
    const scene = applyEditOps(base(), [
      { op: 'set_step', id: 's0', name: 'Cover', position: 0 },
      { op: 'set_layer', id: 'app', position: 0 },
    ]);
    expect(scene.steps.map((s: any) => s.id)).toEqual(['s0', 's1']);
    expect(scene.layers.map((l: any) => l.id)).toEqual(['app', 'title']);
  });

  it('reads first-format slides as steps', () => {
    const { steps: _steps, ...rest } = base();
    const scene = applyEditOps({ ...rest, slides: [{ id: 'a', name: 'A', layers: [], hold: 3000 }] }, [{ op: 'set_step', id: 'a', name: 'B' }]);
    expect(scene.slides).toBeUndefined();
    expect(scene.steps[0].name).toBe('B');
  });

  it('refuses bad input without touching the scene, naming the operation', () => {
    const scene = base();
    expect(() => applyEditOps(scene, [{ op: 'set_layer', id: 'new' }])).toThrow(/ops\[0\] set_layer new: a new layer needs a piece/);
    expect(() => applyEditOps(scene, [{ op: 'explode' }])).toThrow(/unknown op/);
    expect(() => applyEditOps(scene, [])).toThrow(/non-empty/);
    expect(scene.layers).toHaveLength(2);
  });

  it('knows which new pieces need their start props', () => {
    expect(newLayerPieces(base(), [
      { op: 'set_layer', id: 'title', piece: 'quote' },
      { op: 'set_layer', id: 'n1', piece: 'quote' },
      { op: 'set_layer', id: 'n2', piece: 'badge' },
    ])).toEqual(['quote', 'badge']);
  });

  it('a layer removed and set again in one batch is new: its piece start props are needed', () => {
    expect(newLayerPieces(base(), [
      { op: 'remove_layer', id: 'title' },
      { op: 'set_layer', id: 'title', piece: 'quote' },
    ])).toEqual(['quote']);
    const scene = applyEditOps(base(), [
      { op: 'remove_layer', id: 'title' },
      { op: 'set_layer', id: 'title', piece: 'quote' },
    ], { quote: { defaultSize: { w: 700, h: 300 }, startProps: { text: 'Q' } } });
    expect(scene.layers.find((l: any) => l.id === 'title')).toMatchObject({ piece: 'quote', w: 700, props: { text: 'Q' } });
  });
});
