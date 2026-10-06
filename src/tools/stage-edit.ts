/**
 * Edit operations on a Stage scene (stage_scenes_edit), applied to the
 * scene JSON before one save. Pure: the tool fetches the scene, the pieces
 * new layers need, applies these, validates and saves.
 *
 * Scene format: countly-platform ui/src/shared/stage/scene.ts (version 1,
 * steps + delivery, as of countly-platform#1975).
 */

export type EditOp = Record<string, any> & { op: string };

/** What a new layer of a piece starts from, from GET /v2/stage/pieces/:id */
export interface PieceStart {
  defaultSize?: { w: number; h: number };
  startProps?: Record<string, unknown>;
}

export const EDIT_OPS = [
  'set_scene', 'set_layer', 'remove_layer', 'set_step', 'remove_step',
  'set_delivery', 'set_fit', 'set_breakpoint', 'remove_breakpoint',
] as const;

const PAPERS: Record<string, { width: number; height: number }> = {
  a4: { width: 794, height: 1123 },
  letter: { width: 816, height: 1056 },
};

const isRecord = (v: unknown): v is Record<string, any> => typeof v === 'object' && v !== null && !Array.isArray(v);
const ID = /^[\w-]{1,64}$/;

function need(cond: unknown, message: string): asserts cond {
  if (!cond) {
    throw new Error(message);
  }
}

function idOf(op: EditOp, what: string): string {
  const id = String(op.id ?? '').trim();
  need(ID.test(id), `${op.op}: ${what} id must be letters, digits, "_" or "-" (max 64)`);
  return id;
}

/** Pieces that new layers name and the scene does not use yet: their start props are needed */
export function newLayerPieces(scene: Record<string, any>, ops: EditOp[]): string[] {
  const existing = new Set((scene.layers ?? []).map((l: any) => l.id));
  const pieces = new Set<string>();
  // Follow the ops in order: a layer removed and set again is new again
  for (const op of ops) {
    if (op.op === 'remove_layer') {
      existing.delete(op.id);
    } else if (op.op === 'set_layer' && !existing.has(op.id) && typeof op.piece === 'string') {
      pieces.add(op.piece);
      existing.add(op.id);
    }
  }
  return [...pieces];
}

function setScene(scene: Record<string, any>, op: EditOp): void {
  for (const key of ['name', 'look', 'theme', 'transition', 'width', 'height', 'textScale'] as const) {
    if (op[key] !== undefined) {
      scene[key] = op[key];
    }
  }
  if (op.paper !== undefined) {
    const paper = PAPERS[op.paper];
    need(paper, `set_scene: paper must be one of ${Object.keys(PAPERS).join(', ')}`);
    Object.assign(scene, paper);
  }
  for (const key of ['company', 'lang'] as const) {
    if (op[key] === '' || op[key] === null) {
      delete scene[key];
    } else if (op[key] !== undefined) {
      scene[key] = op[key];
    }
  }
  if (op.pin_lang !== undefined) {
    if (op.pin_lang) {
      scene.pinLang = true;
    } else {
      delete scene.pinLang;
    }
  }
}

function setLayer(scene: Record<string, any>, op: EditOp, pieces: Record<string, PieceStart>): void {
  const id = idOf(op, 'layer');
  const layers: any[] = scene.layers;
  let index = layers.findIndex((l) => l.id === id);
  let layer: Record<string, any>;
  if (index < 0) {
    need(typeof op.piece === 'string', `set_layer ${id}: a new layer needs a piece (stage_pieces_list)`);
    const start = pieces[op.piece] ?? {};
    const size = start.defaultSize ?? { w: 600, h: 400 };
    layer = {
      id,
      piece: op.piece,
      x: 0,
      y: 0,
      w: size.w,
      h: size.h,
      props: op.use_start_props === false ? {} : structuredClone(start.startProps ?? {}),
      enter: { preset: 'rise', delay: 0, duration: 700 },
    };
    layers.push(layer);
    index = layers.length - 1;
  } else {
    layer = layers[index];
    if (op.piece !== undefined && op.piece !== layer.piece) {
      layer.piece = op.piece;
      layer.props = {};
    }
  }
  for (const key of ['x', 'y', 'w', 'h', 'scale', 'opacity', 'build', 'motion', 'fade', 'tilt', 'attach'] as const) {
    if (op[key] === null) {
      delete layer[key];
    } else if (op[key] !== undefined) {
      layer[key] = op[key];
    }
  }
  if (op.enter !== undefined) {
    need(isRecord(op.enter), `set_layer ${id}: enter is {preset, delay, duration}`);
    layer.enter = { ...(layer.enter ?? {}), ...op.enter };
  }
  if (op.props !== undefined) {
    need(isRecord(op.props), `set_layer ${id}: props must be an object`);
    const base = op.replace_props ? {} : (layer.props ?? {});
    const next: Record<string, unknown> = { ...base };
    for (const [key, value] of Object.entries(op.props)) {
      if (value === null) {
        delete next[key];
      } else {
        next[key] = value;
      }
    }
    layer.props = next;
  }
  if (op.hidden !== undefined) {
    if (op.hidden) {
      layer.hidden = true;
    } else {
      delete layer.hidden;
    }
  }
  if (op.steps !== undefined) {
    need(Array.isArray(op.steps), `set_layer ${id}: steps is a list of step ids`);
    for (const step of scene.steps ?? []) {
      const on = op.steps.includes(step.id);
      const has = step.layers.includes(id);
      if (on && !has) {
        step.layers.push(id);
      } else if (!on && has) {
        step.layers = step.layers.filter((l: string) => l !== id);
      }
    }
    const known = new Set((scene.steps ?? []).map((s: any) => s.id));
    const missing = op.steps.filter((s: string) => !known.has(s));
    need(missing.length === 0, `set_layer ${id}: no step ${missing.join(', ')} (add it with set_step first)`);
  }
  if (op.position !== undefined) {
    const to = Math.max(0, Math.min(layers.length - 1, Number(op.position)));
    layers.splice(index, 1);
    layers.splice(to, 0, layer);
  }
}

function removeLayer(scene: Record<string, any>, op: EditOp): void {
  const id = idOf(op, 'layer');
  const before = scene.layers.length;
  scene.layers = scene.layers.filter((l: any) => l.id !== id);
  need(scene.layers.length < before, `remove_layer: no layer ${id}`);
  for (const step of scene.steps ?? []) {
    step.layers = step.layers.filter((l: string) => l !== id);
    if (step.play?.layer === id) {
      delete step.play;
    }
  }
  for (const variant of scene.variants ?? []) {
    delete variant.boxes?.[id];
    delete variant.overrides?.[id];
  }
}

function setStep(scene: Record<string, any>, op: EditOp): void {
  const id = idOf(op, 'step');
  scene.steps = scene.steps ?? [];
  const steps: any[] = scene.steps;
  let index = steps.findIndex((s) => s.id === id);
  let step: Record<string, any>;
  if (index < 0) {
    step = { id, name: op.name ?? id, layers: [], hold: 4000 };
    steps.push(step);
    index = steps.length - 1;
  } else {
    step = steps[index];
  }
  const layerIds = new Set(scene.layers.map((l: any) => l.id));
  const checkLayers = (list: unknown, field: string) => {
    need(Array.isArray(list), `set_step ${id}: ${field} is a list of layer ids`);
    const missing = (list as string[]).filter((l) => !layerIds.has(l));
    need(missing.length === 0, `set_step ${id}: no layer ${missing.join(', ')}`);
  };
  if (op.layers !== undefined) {
    checkLayers(op.layers, 'layers');
    step.layers = [...new Set(op.layers as string[])];
  }
  if (op.add_layers !== undefined) {
    checkLayers(op.add_layers, 'add_layers');
    step.layers = [...new Set([...step.layers, ...op.add_layers])];
  }
  for (const key of ['name', 'hold', 'notes', 'section'] as const) {
    if (op[key] === null) {
      delete step[key];
    } else if (op[key] !== undefined) {
      step[key] = op[key];
    }
  }
  if (op.advance !== undefined) {
    if (op.advance === 'click') {
      step.advance = 'click';
    } else {
      delete step.advance;
    }
  }
  if (op.dark !== undefined) {
    if (op.dark) {
      step.dark = true;
    } else {
      delete step.dark;
    }
  }
  if (op.play === null) {
    delete step.play;
  } else if (op.play !== undefined) {
    need(isRecord(op.play) && op.play.layer && op.play.scenario, `set_step ${id}: play is {layer, scenario, from?, to?}`);
    need(layerIds.has(op.play.layer), `set_step ${id}: play.layer ${op.play.layer} is not a layer (an app-page or device layer)`);
    step.play = Object.fromEntries(Object.entries(op.play).filter(([, v]) => v !== undefined && v !== null && v !== ''));
    if (!step.layers.includes(op.play.layer)) {
      step.layers.push(op.play.layer);
    }
  }
  if (op.position !== undefined) {
    const to = Math.max(0, Math.min(steps.length - 1, Number(op.position)));
    steps.splice(index, 1);
    steps.splice(to, 0, step);
  }
}

function removeStep(scene: Record<string, any>, op: EditOp): void {
  const id = idOf(op, 'step');
  const removed = (scene.steps ?? []).find((s: any) => s.id === id);
  need(removed, `remove_step: no step ${id}`);
  scene.steps = scene.steps.filter((s: any) => s.id !== id);
  if (op.remove_layers === true) {
    // Its layers that no other step shows go too (layers in no step show on every step)
    const used = new Set(scene.steps.flatMap((s: any) => s.layers));
    const only = new Set((removed.layers as string[]).filter((l) => !used.has(l)));
    scene.layers = scene.layers.filter((l: any) => !only.has(l.id));
  }
  if (scene.steps.length === 0) {
    delete scene.steps;
  }
}

function setDelivery(scene: Record<string, any>, op: EditOp): void {
  const delivery = isRecord(scene.delivery) ? scene.delivery : { mode: 'autoplay' };
  if (op.mode !== undefined) {
    need(['autoplay', 'click', 'player'].includes(op.mode), 'set_delivery: mode is autoplay, click or player');
    delivery.mode = op.mode;
  }
  for (const key of ['click', 'player'] as const) {
    if (op[key] !== undefined) {
      need(isRecord(op[key]), `set_delivery: ${key} is an object of options`);
      delivery[key] = { ...(delivery[key] ?? {}), ...op[key] };
    }
  }
  scene.delivery = delivery;
}

function setFit(scene: Record<string, any>, op: EditOp): void {
  if (op.responsive === false) {
    delete scene.fit;
    return;
  }
  scene.fit = {
    minHeight: op.min_height ?? scene.fit?.minHeight ?? 480,
    maxHeight: op.max_height ?? scene.fit?.maxHeight ?? 760,
    minText: op.min_text ?? scene.fit?.minText ?? 13,
  };
}

function setBreakpoint(scene: Record<string, any>, op: EditOp): void {
  const id = idOf(op, 'breakpoint');
  need(scene.fit, `set_breakpoint ${id}: breakpoints are for responsive scenes; set_fit first`);
  scene.variants = scene.variants ?? [];
  let variant = scene.variants.find((v: any) => v.id === id);
  if (!variant) {
    need(Number.isFinite(op.max_width), `set_breakpoint ${id}: a new breakpoint needs max_width (CSS px, e.g. 768 tablet, 480 phone)`);
    variant = { id, width: op.max_width, height: op.height ?? scene.height, maxWidth: op.max_width, boxes: {} };
    scene.variants.push(variant);
  }
  if (op.max_width !== undefined) {
    variant.maxWidth = op.max_width;
    variant.width = op.width ?? op.max_width;
  }
  if (op.height !== undefined) {
    variant.height = op.height;
  }
  if (op.name !== undefined) {
    variant.name = op.name;
  }
  if (op.min_height !== undefined || op.max_height !== undefined) {
    variant.fit = { minHeight: op.min_height ?? variant.fit?.minHeight ?? scene.fit.minHeight, maxHeight: op.max_height ?? variant.fit?.maxHeight ?? scene.fit.maxHeight };
  }
  if (op.boxes !== undefined) {
    need(isRecord(op.boxes), `set_breakpoint ${id}: boxes is {layerId: {x, y, w, h, hidden?, scale?}}`);
    const layerIds = new Set(scene.layers.map((l: any) => l.id));
    for (const [layer, box] of Object.entries(op.boxes)) {
      need(layerIds.has(layer), `set_breakpoint ${id}: no layer ${layer}`);
      if (box === null) {
        delete variant.boxes[layer];
      } else {
        variant.boxes[layer] = { ...(variant.boxes[layer] ?? {}), ...(box as object) };
      }
    }
  }
  if (op.overrides !== undefined) {
    need(isRecord(op.overrides), `set_breakpoint ${id}: overrides is {layerId: {props?, look?}}`);
    variant.overrides = { ...(variant.overrides ?? {}), ...op.overrides };
  }
}

function removeBreakpoint(scene: Record<string, any>, op: EditOp): void {
  const id = idOf(op, 'breakpoint');
  const before = (scene.variants ?? []).length;
  scene.variants = (scene.variants ?? []).filter((v: any) => v.id !== id);
  need(scene.variants.length < before, `remove_breakpoint: no breakpoint ${id}`);
}

/**
 * Apply operations in order to a copy of the scene.
 * @param pieces - start data of the pieces new layers name (newLayerPieces)
 */
export function applyEditOps(scene: Record<string, any>, ops: EditOp[], pieces: Record<string, PieceStart> = {}): Record<string, any> {
  need(Array.isArray(ops) && ops.length > 0, 'ops must be a non-empty list of operations');
  const next = structuredClone(scene);
  next.layers = Array.isArray(next.layers) ? next.layers : [];
  // A scene in the first stored format reads `slides` as steps; edit those
  if (!Array.isArray(next.steps) && Array.isArray(next.slides)) {
    next.steps = next.slides;
    delete next.slides;
  }
  ops.forEach((op, i) => {
    need(isRecord(op) && typeof op.op === 'string', `ops[${i}] needs an "op"`);
    try {
      switch (op.op) {
      case 'set_scene': setScene(next, op); break;
      case 'set_layer': setLayer(next, op, pieces); break;
      case 'remove_layer': removeLayer(next, op); break;
      case 'set_step': setStep(next, op); break;
      case 'remove_step': removeStep(next, op); break;
      case 'set_delivery': setDelivery(next, op); break;
      case 'set_fit': setFit(next, op); break;
      case 'set_breakpoint': setBreakpoint(next, op); break;
      case 'remove_breakpoint': removeBreakpoint(next, op); break;
      default: throw new Error(`unknown op "${op.op}"; use one of ${EDIT_OPS.join(', ')}`);
      }
    } catch (error) {
      throw new Error(`ops[${i}] ${error instanceof Error ? error.message : String(error)}`);
    }
  });
  return next;
}
