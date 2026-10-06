/**
 * Stage Tools
 *
 * Countly Platform's Stage plugin (/v2/stage): the team's builder for
 * marketing scenes, decks, one-pagers and website embeds. Scenes are shared
 * drafts that publish as immutable numbered versions on a public host of
 * their own; demo companies dress the mock product for a prospect.
 *
 * Access is one server-wide level per member (permission.stage: View or
 * Edit; global admins are always Edit), not a per-app permission, so no
 * tool here takes an app. Listed only when the server serves /v2 and has
 * the `stage` plugin enabled.
 *
 * Scene format: version 1 as of countly-platform#1975 (steps with a
 * delivery mode, `look` web/product and `theme`, per-step `dark`, paper
 * sizes). Older stored shapes (`slides`, `deck`, `slideTransition`) are
 * still read by the server and converted on the next save.
 */

import { jsonResult, V2ApiError, v2ErrorResult, v2Request } from '../lib/v2-api.js';
import { applyEditOps, EDIT_OPS, newLayerPieces, type EditOp, type PieceStart } from './stage-edit.js';
import type { ToolContext, ToolResult } from './types.js';

const enc = encodeURIComponent;

// ─── Format reference (ui/src/shared/stage, countly-platform) ────────────────

/**
 * STAGE_PIECE_ID_LIST (piece-ids.generated.ts): a layer naming any other
 * piece is refused. Fallback only, for servers without GET /v2/stage/pieces
 * (countly-platform#1990), which serves the server's own catalog.
 */
export const STAGE_PIECE_IDS = [
  'alert-builder', 'app-page', 'app-top-bar', 'arrow', 'badge', 'bento', 'big-number',
  'breakdown-bar-chart', 'breakdown-column-chart', 'bullet-list', 'bump-chart', 'button',
  'calendar-heatmap', 'callout-card', 'campaign-table', 'capacity-meter', 'caption', 'card-list',
  'cee-panel', 'code', 'cohort-builder', 'column-distribution', 'command-palette', 'composition-bar',
  'countly-logo', 'crash-detail', 'crash-table', 'cursor', 'dashboard-grid', 'date-range-picker',
  'device', 'divider', 'drill-builder', 'drill-workspace', 'dumbbell-breakdown', 'event-picker',
  'events-table', 'filter-bar', 'floating', 'flow-chart', 'flow-diagram', 'footer', 'funnel-builder',
  'funnel-chart', 'funnel-progress', 'gauge-card', 'geo-map', 'grid-glow', 'grouped-column-chart',
  'heatmap', 'highlight', 'histogram', 'icicle-chart', 'icon-grid', 'insight-list', 'journey-canvas',
  'kpi-row', 'layer-stack', 'marker', 'message-editor', 'metric-breakdown-chart', 'metric-card',
  'metric-selector', 'metric-tabs-chart', 'movers-section', 'multi-line-chart', 'multi-line-chart-legend',
  'multi-line-chart-tabs', 'notification-inbox', 'orbit', 'percentage-stacked-bar-chart',
  'profile-detail', 'progress-card', 'project-picker', 'punch-card', 'push-preview', 'qr-code', 'quote',
  'ranked-bar-chart', 'ranking-table', 'retention-comparison', 'retention-grid', 'retention-grid-surface',
  'scatter-plot', 'shape', 'sidebar', 'slope-chart', 'sparkline-card', 'spotlight', 'stack',
  'stacked-area-chart', 'stage-funnel', 'table', 'text-block', 'ticker', 'time-stacked-bar-chart',
  'tour-panel', 'treemap-chart', 'trend-chart', 'vertical-progress-card', 'wall', 'waterfall-chart',
];

/** COMPANY_BASES (company.ts): the mock portfolio projects a demo company can dress */
export const COMPANY_BASES = [
  'automotive', 'healthtech', 'technology', 'fintech', 'banking', 'healthcare',
  'telecom', 'insurance', 'enterprise', 'ecommerce', 'gaming', 'ai',
];

/** PAPERS (paper.ts): a scene is on paper when its canvas is exactly one of these */
export const PAPERS: Record<string, { label: string; width: number; height: number }> = {
  a4: { label: 'A4', width: 794, height: 1123 },
  letter: { label: 'US Letter', width: 816, height: 1056 },
};

const LOOKS = ['web', 'product'];
const THEMES = ['light', 'dark'];
const DELIVERY_MODES = ['autoplay', 'click', 'player'];
const TRANSITIONS = ['fade', 'slide', 'none'];
const SCENE_LANGS = ['en', 'tr', 'de', 'fr', 'es', 'it', 'pt', 'ja', 'ko', 'zh'];

/** The scene id rule (scene-id.ts), shared by slugs and company ids */
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export function isSlug(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 64 && value !== 'index' && SLUG.test(value);
}

const SCENE_REFERENCE = {
  format: 'Scene JSON, version 1 (countly-platform ui/src/shared/stage/scene.ts). The server parses it with the shared rule: unknown keys are dropped, numbers are clamped, and a layer whose piece is unknown or invalid makes the save fail. Max 2 MB.',
  scene: {
    version: '1 (required)',
    name: 'string, max 80 chars; shown in the builder, not rendered',
    width: 'canvas px, 200-4000 (default 1440). A4 = 794x1123, US Letter = 816x1056 (portrait paper for one-pagers / PDF)',
    height: 'canvas px, 200-4000 (default 900)',
    look: '"web" (the website: Bricolage Grotesque headlines, Inter body, ink buttons) or "product" (the dashboard\'s own tokens). Default "product". The look owns colours, fonts, frames and shadows: layers do not store them.',
    theme: '"light" (default) or "dark"',
    layers: 'array (required, max 160) of layers, drawn in order',
    steps: 'optional sequence, max 30. Layers in no step are always shown; without steps the scene is one step showing every layer',
    transition: '"fade" (default), "slide" or "none" between steps',
    delivery: '{mode: "autoplay" | "click" | "player", click?: {arrows, dots, numbered, footer?, backdrop: "none"|"scene"}, player?: {list, controls, tryIt, upNext, upNextMs (1000-15000), closing?: {eyebrow?, title?, body?, cta?, url?}, backdrop}}. Default autoplay; click and player need steps (or chapters) to step through',
    company: 'optional demo company id (stage_companies_list); app frames show that prospect',
    lang: `optional language of the pieces' copy: ${SCENE_LANGS.join(', ')}; pinLang: true makes it win over the page's language`,
    textScale: 'type size in percent of the pieces\' own, 40-200 (default 100)',
    fit: 'optional {minHeight, maxHeight, minText}: a responsive section sized by its container (the canvas is the safe area)',
    variants: 'optional other layouts (other aspect ratios, or breakpoints with maxWidth): {id, width, height, maxWidth?, name?, boxes: {layerId: {x,y,w,h,scale?,hidden?}}, overrides?}',
  },
  layer: {
    id: 'unique string',
    piece: 'a piece id: stage_pieces_list lists them, stage_pieces_get shows one piece\'s props',
    'x, y, w, h': 'box in scene px',
    props: 'piece-specific props, normalised by the piece (unknown keys dropped). stage_pieces_get lists each prop with its kind, options and default, and startProps as example content',
    enter: '{preset: none|fade|rise|drop|scale|zoom|blur|slide-left|slide-right, delay: ms, duration: ms}',
    optional: 'scale (25-400 %), opacity (0-100), fade {edge, size}, tilt {x, y, perspective}, motion {keys: [{at, x?, y?, scale?, rotate?, opacity?, ease?}], loop?}, build (1-20: the click on its step that brings it in), hidden, baseHidden, locked, attach',
  },
  step: {
    id: 'unique string',
    name: 'title, max 60 chars (i18n: {lang: text} optional)',
    layers: 'layer ids shown in this step',
    hold: 'ms on screen, 1000-120000',
    optional: 'notes (speaker notes, plain text, max 4000), advance "click" (default auto), play {layer, scenario, from?, to?} (an app-page / device layer plays a scenario), section (guide section id), dark: true (a dark slide whatever the scene theme)',
  },
  sceneText: 'Text a viewer reads in a delivery (closing card) is a string or {text, i18n: {lang: text}}, max 400 chars. In text pieces, ==word== marks a highlighted word.',
  pieces: STAGE_PIECE_IDS,
  papers: PAPERS,
  company: {
    id: 'scene id rule: lowercase letters, digits, single hyphens, max 64, not "index"',
    name: 'prospect name, max 60 chars',
    base: `mock project it dresses: ${COMPANY_BASES.join(', ')}`,
    optional: 'appName, logo (PNG/JPEG data URL, max 150 KB; no SVG, no links), primary / accent colours, renames {base text: prospect text} (max 60), volumeScale (0.1-10, default 1), public (true = served on the public host)',
  },
  tips: [
    'Fastest route to a good result: stage_templates_list, stage_scenes_create with a template, then stage_scenes_edit to replace content, add or remove steps and layers. The template brings the layout, motion and breakpoints.',
    'Pick pieces with stage_pieces_list, then read each one with stage_pieces_get before writing its layer: start from its startProps (example content) and change what you need. stage_scenes_edit set_layer does this for a new layer.',
    'Product walkthroughs: an app-page (or a device with an app page) layer plays a scenario (stage_scenarios_list) from a step: set_step play {layer, scenario, from, to}. A walkthrough no scenario covers is recorded in the builder (preview_url, the recorder on an app-page layer), by a person or an agent with a browser; do not hand-write scripts.',
    'Deliveries: a presentation is click with steps, a guide or course is player, a single page or website section is autoplay; set_fit plus set_breakpoint makes a section responsive.',
    'Check before saving with stage_scenes_validate; stage_scenes_edit does so on every save.',
    'A piece with a data grid takes props.dataset (a preset id from its grid.presets) or props.data ({columns, rows}).',
    'An existing scene (stage_scenes_get, view "full") shows how pieces are combined.',
    'A working scene may have no layers; a published one needs at least one.',
    'Publishing needs a slug on the first publish only; it never changes afterwards.',
    'A scene that names a company publishes only when that company exists and is public.',
  ],
};

// ─── Definitions ──────────────────────────────────────────────────────────────

const sceneIdProp = {
  scene_id: { type: 'string', description: 'Scene id (24-hex) from stage_scenes_list.' },
};

const revProp = {
  rev: { type: 'number', description: 'The scene revision you based this on (from stage_scenes_list / stage_scenes_get). The call fails with a conflict when someone saved since; omit to use the current revision.' },
};

const sceneFields = {
  name: { type: 'string', description: 'Scene name (max 80 chars).' },
  look: { type: 'string', enum: LOOKS, description: '"web" (the website\'s look) or "product" (the dashboard\'s look).' },
  theme: { type: 'string', enum: THEMES, description: 'Light or dark theme of the look.' },
  delivery_mode: { type: 'string', enum: DELIVERY_MODES, description: 'How it is watched: "autoplay" (video, hero), "click" (deck, carousel; needs steps), "player" (guide, walkthrough; needs steps or chapters). Other delivery options keep their values.' },
  transition: { type: 'string', enum: TRANSITIONS, description: 'Transition between steps.' },
  company: { type: 'string', description: 'Demo company id to show in app frames (stage_companies_list). Pass an empty string to remove it.' },
  lang: { type: 'string', enum: [...SCENE_LANGS, ''], description: 'Language the pieces\' copy renders in. Pass an empty string to remove it (follow the page).' },
  paper: { type: 'string', enum: Object.keys(PAPERS), description: 'Set the canvas to a portrait paper size (a4 = 794x1123, letter = 816x1056) for one-pagers and PDF export. Overrides width/height.' },
  width: { type: 'number', description: 'Canvas width in px (200-4000).' },
  height: { type: 'number', description: 'Canvas height in px (200-4000).' },
};

export const stageReferenceTool = {
  name: 'stage_reference',
  description: 'Reference for writing Stage scenes and demo companies: the scene JSON format (looks, themes, steps, delivery modes, layers, paper sizes), the piece ids the server accepts and the company fields. Read before stage_scenes_create, or before editing scene layers with stage_scenes_update. Countly Platform only.',
  inputSchema: { type: 'object', properties: {}, required: [] },
};

export const stagePiecesListTool = {
  name: 'stage_pieces_list',
  description: 'List the pieces this server\'s Stage accepts in scene layers (charts, metrics, tables, product surfaces, app pages, text, annotations, effects), each with what it renders and when to use it, its category and default size. Use it to choose pieces, then stage_pieces_get for one piece\'s props. Countly Platform only.',
  inputSchema: {
    type: 'object',
    properties: {
      category: { type: 'string', description: 'Only pieces of this category id, e.g. "charts", "metrics", "text", "pages" (the result lists the categories).' },
      search: { type: 'string', description: 'Only pieces whose id, label or description contains this text (case-insensitive).' },
    },
    required: [],
  },
};

export const stagePiecesGetTool = {
  name: 'stage_pieces_get',
  description: 'One Stage piece in full, to write a layer of it: every prop it takes (key, kind, options, ranges, hints), the defaults it uses for props left out, example start props for a new layer, its data grid (columns and preset names) when it takes data, and whether it can be nested in a wall or device. Countly Platform only.',
  inputSchema: {
    type: 'object',
    properties: {
      piece: { type: 'string', description: 'Piece id from stage_pieces_list, or up to 10 ids separated by commas, e.g. "trend-chart,caption".' },
    },
    required: ['piece'],
  },
};

export const stageTemplatesListTool = {
  name: 'stage_templates_list',
  description: 'Scenes to start from instead of a blank canvas: the builder\'s starters (deck, carousel, promo, responsive website section, walkthrough, course) and the Library\'s finished examples (presentations, one-pagers, stories, patterns such as a responsive hero, a device playing a scenario, a wall of charts). Each with what it is, look, size, delivery, step count, whether it is responsive, and the scenarios it plays. Create from one with stage_scenes_create template. Countly Platform only.',
  inputSchema: {
    type: 'object',
    properties: {
      kind: { type: 'string', enum: ['starter', 'presentation', 'one-pager', 'story', 'pattern'], description: 'Only this kind.' },
      search: { type: 'string', description: 'Only templates whose id, label or description contains this text.' },
    },
    required: [],
  },
};

export const stageTemplatesGetTool = {
  name: 'stage_templates_get',
  description: 'One Stage template: an outline of its steps and layers (view "summary", default) or its full scene JSON (view "full"), to see how a designer built it before starting from it. Countly Platform only.',
  inputSchema: {
    type: 'object',
    properties: {
      template: { type: 'string', description: 'Template id from stage_templates_list, e.g. "starter/deck" or "example/responsive-hero".' },
      view: { type: 'string', enum: ['summary', 'full'], description: '"summary" (default) or "full".' },
    },
    required: ['template'],
  },
};

export const stageScenariosListTool = {
  name: 'stage_scenarios_list',
  description: 'Scenarios: recorded walkthroughs of the real product (Drill, funnels, journeys, crashes, cohorts, ...) that an app-page or device layer plays on mock data, with a cursor, clicks, typing and camera zooms. Each with what it shows, where it starts, its project and its chapters. A step plays one with set_step play {layer, scenario, from?, to?} (chapter ids) in stage_scenes_edit. For a walkthrough no scenario covers, record it in the builder: open the scene\'s preview_url in a browser and use the recorder on an app-page layer; the recording is saved into the same scene. Countly Platform only.',
  inputSchema: {
    type: 'object',
    properties: {
      kind: { type: 'string', enum: ['overview', 'story', 'task'], description: '"overview" (one feature), "story" (across features on one project\'s data), "task" (one use case).' },
      search: { type: 'string', description: 'Only scenarios whose id, label, description or start page contains this text.' },
    },
    required: [],
  },
};

export const stageScenariosGetTool = {
  name: 'stage_scenarios_get',
  description: 'One Stage scenario with its chapters (captions and focus), and optionally each chapter\'s script steps (camera, move, click, type, hold), which show how an app-page layer\'s own `script` is written. Countly Platform only.',
  inputSchema: {
    type: 'object',
    properties: {
      scenario: { type: 'string', description: 'Scenario id from stage_scenarios_list.' },
      include_steps: { type: 'boolean', description: 'Include the script steps (default false).' },
    },
    required: ['scenario'],
  },
};

export const stageScenesValidateTool = {
  name: 'stage_scenes_validate',
  description: 'Dry-run a Stage scene without saving: whether a save would be accepted and the scene could be published, what the server would drop or clamp, and which layer props their pieces would ignore (unknown props, values not among a field\'s options, numbers out of range). Pass a scene JSON, or scene_id to check the stored draft. Countly Platform only.',
  inputSchema: {
    type: 'object',
    properties: {
      scene: { type: 'object', description: 'Scene JSON to check.' },
      scene_id: { type: 'string', description: 'Or: a scene id, to check its saved content.' },
    },
    required: [],
  },
};

export const stageScenesEditTool = {
  name: 'stage_scenes_edit',
  description: [
    'Edit a Stage scene draft with a list of operations, applied in order and saved once (checked with the server first; nothing is saved when it would be refused). Build a whole deck or section in one call. Returns the new revision, an outline, what the server dropped or what pieces will ignore, and a preview link. Countly Platform only.',
    'Operations ("op" plus its fields):',
    '- set_scene: name, look (web|product), theme (light|dark), transition (fade|slide|none), width, height, paper (a4|letter), textScale, company (""=none), lang (""=none), pin_lang.',
    '- set_layer: id (new or existing); piece (required for a new layer; it starts from the piece\'s example content unless use_start_props: false); x, y, w, h (scene px); props (merged; a null value removes a prop; replace_props: true replaces all); enter {preset, delay, duration}; steps (the step ids it shows on; omit to keep, and a layer in no step shows on every step); build (1-20: the click on its step that brings it in); hidden; scale; opacity; motion; position (stack index, 0 = bottom).',
    '- remove_layer: id (also leaves every step and breakpoint).',
    '- set_step: id (new or existing); name; layers (replace) or add_layers; hold (ms, 1000-120000); notes (speaker notes); advance ("click" waits for a click, "auto"); dark (a dark slide); play {layer, scenario, from?, to?} (an app-page/device layer plays a scenario\'s chapters; null removes); section; position (order).',
    '- remove_step: id; remove_layers: true also removes its layers that no other step shows.',
    '- set_delivery: mode (autoplay|click|player); click {arrows, dots, numbered, footer, backdrop}; player {list, controls, tryIt, upNext, upNextMs, closing {eyebrow, title, body, cta, url}, backdrop}.',
    '- set_fit: make it a responsive section sized by its container: min_height, max_height, min_text; responsive: false makes it fixed-size again.',
    '- set_breakpoint: id; max_width (CSS px: the layout for containers up to this wide, e.g. 768, 480); name; height; min_height, max_height; boxes {layerId: {x, y, w, h, hidden?, scale?} | null} in the breakpoint\'s own canvas (max_width wide); overrides {layerId: {props?, look?}}. Layers without a box are the base layout scaled to fit.',
    '- remove_breakpoint: id.',
  ].join('\n'),
  inputSchema: {
    type: 'object',
    properties: {
      ...sceneIdProp,
      ...revProp,
      ops: {
        type: 'array',
        description: 'Operations, applied in order.',
        items: {
          type: 'object',
          properties: { op: { type: 'string', enum: [...EDIT_OPS] } },
          required: ['op'],
          additionalProperties: true,
        },
      },
      dry_run: { type: 'boolean', description: 'Apply and check, but do not save (default false).' },
    },
    required: ['scene_id', 'ops'],
  },
};

export const stageStatusTool = {
  name: 'stage_status',
  description: 'Whether this server serves Stage\'s public host (where published scenes and the embed script are served), on which host name, and if not, why. Countly Platform only.',
  inputSchema: { type: 'object', properties: {}, required: [] },
};

export const stageScenesListTool = {
  name: 'stage_scenes_list',
  description: 'List Stage scenes (shared drafts of the whole team), last edited first: id, name, canvas size, revision, who created / last saved it, and publishing state (slug, latest version, unpublished, versions). Countly Platform only.',
  inputSchema: {
    type: 'object',
    properties: {
      search: { type: 'string', description: 'Only scenes whose name or slug contains this text (case-insensitive).' },
      published: { type: 'string', enum: ['all', 'published', 'unpublished', 'draft'], description: '"published" (live, has a latest version), "unpublished" (hidden), "draft" (never published), or "all" (default).' },
      limit: { type: 'number', description: 'Maximum number of scenes (default 50).' },
    },
    required: [],
  },
};

export const stageScenesGetTool = {
  name: 'stage_scenes_get',
  description: 'One Stage scene with its publishing history. view "summary" (default) outlines the content: look, theme, delivery, steps and layers (piece and box). view "full" returns the scene JSON as stored, for editing layers or props. Countly Platform only.',
  inputSchema: {
    type: 'object',
    properties: {
      ...sceneIdProp,
      view: { type: 'string', enum: ['summary', 'full'], description: '"summary" (default) or "full" scene JSON.' },
    },
    required: ['scene_id'],
  },
};

export const stageScenesCreateTool = {
  name: 'stage_scenes_create',
  description: 'Create a Stage scene (a shared draft; nothing is public until stage_scenes_publish). Start from a template (stage_templates_list: a designed deck, section, one-pager...) and change its content with stage_scenes_edit, or pass a whole `scene` JSON, or just a name and format fields for an empty scene. Field arguments override the same fields of the template or scene. Returns a preview link. Countly Platform only.',
  inputSchema: {
    type: 'object',
    properties: {
      template: { type: 'string', description: 'Template id from stage_templates_list, e.g. "starter/deck" or "example/responsive-hero".' },
      scene: { type: 'object', description: 'Scene JSON, version 1 (stage_reference). Defaults: version 1, no layers. Ignored with template.' },
      ...sceneFields,
    },
    required: [],
  },
};

export const stageScenesUpdateTool = {
  name: 'stage_scenes_update',
  description: 'Save changes to a Stage scene draft. Either replace the whole content with `scene` (from stage_scenes_get view "full", edited), or change only the fields you pass (name, look, theme, delivery mode, transition, company, language, size) on the stored content. The published versions do not change until you publish again. Countly Platform only.',
  inputSchema: {
    type: 'object',
    properties: {
      ...sceneIdProp,
      ...revProp,
      scene: { type: 'object', description: 'Complete new scene JSON, replacing the stored content. Requires rev (the revision it was read at). Field arguments are applied on top.' },
      ...sceneFields,
    },
    required: ['scene_id'],
  },
};

export const stageScenesDeleteTool = {
  name: 'stage_scenes_delete',
  description: 'Delete a Stage scene draft permanently (irreversible: its content and history are gone). Only a scene that was never published can be deleted. A scene that was ever published cannot be deleted (websites may pin its versions): use stage_scenes_unpublish instead. Countly Platform only.',
  inputSchema: { type: 'object', properties: { ...sceneIdProp }, required: ['scene_id'] },
};

export const stageScenesPublishTool = {
  name: 'stage_scenes_publish',
  description: 'Publish the saved content of a Stage scene as a new immutable version on the public host, and return its URLs and embed snippet. The first publish needs a slug, which is fixed for good. Publishing makes the version the latest unless the scene is unpublished (it stays hidden until stage_scenes_restore). A scene that names a demo company publishes only when that company is public. Countly Platform only.',
  inputSchema: {
    type: 'object',
    properties: {
      ...sceneIdProp,
      ...revProp,
      slug: { type: 'string', description: 'Public id for the first publish: lowercase letters, digits and single hyphens, max 64, not "index". Ignored afterwards (the slug never changes). Defaults to the scene name slugified on the first publish.' },
    },
    required: ['scene_id'],
  },
};

export const stageScenesSetLatestTool = {
  name: 'stage_scenes_set_latest',
  description: 'Make a stored version of a published Stage scene the latest one websites show (roll back or forward). Pinned version URLs are unaffected. Countly Platform only.',
  inputSchema: {
    type: 'object',
    properties: {
      ...sceneIdProp,
      version: { type: 'number', description: 'Version number from stage_scenes_get.' },
    },
    required: ['scene_id', 'version'],
  },
};

export const stageScenesUnpublishTool = {
  name: 'stage_scenes_unpublish',
  description: 'Hide a published Stage scene: its latest URL and index entry disappear, while pinned version URLs (<slug>@<n>) keep working. Undo with stage_scenes_restore. Countly Platform only.',
  inputSchema: { type: 'object', properties: { ...sceneIdProp }, required: ['scene_id'] },
};

export const stageScenesRestoreTool = {
  name: 'stage_scenes_restore',
  description: 'Show an unpublished Stage scene again at its latest version. Countly Platform only.',
  inputSchema: { type: 'object', properties: { ...sceneIdProp }, required: ['scene_id'] },
};

const companyFields = {
  name: { type: 'string', description: 'Prospect name (max 60 chars); also {company} in captions.' },
  base: { type: 'string', enum: COMPANY_BASES, description: 'Mock portfolio project the company dresses.' },
  app_name: { type: 'string', description: 'Project name when it is not the company name, e.g. "Acme Driver App". Empty string removes it.' },
  logo: { type: 'string', description: 'Logo as a PNG or JPEG data URL (data:image/png;base64,...), max 150 KB. Links and SVG are refused. Empty string removes it.' },
  primary: { type: 'string', description: 'Primary brand colour, e.g. "#1a73e8" (used when there is no logo). Empty string removes it.' },
  accent: { type: 'string', description: 'Accent brand colour. Empty string removes it.' },
  renames: { type: 'object', additionalProperties: { type: 'string' }, description: 'Base project text → the prospect\'s word for it, e.g. {"Charging Completed": "Order Delivered"} (max 60).' },
  volume_scale: { type: 'number', description: 'Multiplier on the base project\'s mock volumes, 0.1-10 (default 1).' },
  public: { type: 'boolean', description: 'Serve the company on the public host, so published scenes and embeds can use it. Default false: a company names a prospect and the host is public.' },
};

export const stageCompaniesListTool = {
  name: 'stage_companies_list',
  description: 'List Stage demo companies (prospect name, logo, colours and renames that dress a mock project): id, name, public, referenced (named by a published version, which makes it immutable), size and last change. Countly Platform only.',
  inputSchema: { type: 'object', properties: {}, required: [] },
};

export const stageCompaniesGetTool = {
  name: 'stage_companies_get',
  description: 'One Stage demo company with its content (base project, colours, renames, volume scale; the logo is shortened unless include_logo is true). Countly Platform only.',
  inputSchema: {
    type: 'object',
    properties: {
      company_id: { type: 'string', description: 'Company id from stage_companies_list.' },
      include_logo: { type: 'boolean', description: 'Return the full logo data URL (default false).' },
    },
    required: ['company_id'],
  },
};

export const stageCompaniesCreateTool = {
  name: 'stage_companies_create',
  description: 'Create a Stage demo company that dresses a mock project for a prospect. Countly Platform only.',
  inputSchema: {
    type: 'object',
    properties: {
      company_id: { type: 'string', description: 'New company id: lowercase letters, digits and single hyphens, max 64. Defaults to the name slugified.' },
      ...companyFields,
    },
    required: ['name', 'base'],
  },
};

export const stageCompaniesUpdateTool = {
  name: 'stage_companies_update',
  description: 'Change a Stage demo company: only the fields you pass change. A company named by a published scene version is immutable (the call fails): create a new company and publish a new scene version that names it instead. Countly Platform only.',
  inputSchema: {
    type: 'object',
    properties: {
      company_id: { type: 'string', description: 'Company id from stage_companies_list.' },
      ...companyFields,
    },
    required: ['company_id'],
  },
};

export const stageToolDefinitions = [
  stageReferenceTool,
  stageStatusTool,
  stagePiecesListTool,
  stagePiecesGetTool,
  stageTemplatesListTool,
  stageTemplatesGetTool,
  stageScenariosListTool,
  stageScenariosGetTool,
  stageScenesListTool,
  stageScenesGetTool,
  stageScenesCreateTool,
  stageScenesUpdateTool,
  stageScenesEditTool,
  stageScenesValidateTool,
  stageScenesDeleteTool,
  stageScenesPublishTool,
  stageScenesSetLatestTool,
  stageScenesUnpublishTool,
  stageScenesRestoreTool,
  stageCompaniesListTool,
  stageCompaniesGetTool,
  stageCompaniesCreateTool,
  stageCompaniesUpdateTool,
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function run(action: string, fn: () => Promise<ToolResult>): Promise<ToolResult> {
  try {
    return await fn();
  } catch (error) {
    return v2ErrorResult(action, error);
  }
}

const isRecord = (v: unknown): v is Record<string, any> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Drop undefined and null values */
function clean<T extends Record<string, unknown>>(obj: T): Partial<T> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined && v !== null)) as Partial<T>;
}

/** A name as an id, like the builder's slugify (list/publishing.ts) */
export function slugify(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
    .replace(/-+$/, '');
}

function sceneIdOf(args: any): string {
  const id = String(args.scene_id ?? '').trim();
  if (!/^[0-9a-f]{24}$/i.test(id)) {
    throw new Error('scene_id must be the 24-hex id from stage_scenes_list');
  }
  return id;
}

function companyIdOf(value: unknown): string {
  if (!isSlug(value)) {
    throw new Error('company_id must be lowercase letters, digits and single hyphens, at most 64 characters, and not "index"');
  }
  return value;
}

/** Publishing state of a scene row, in one word */
export function sceneState(row: any): 'draft' | 'published' | 'unpublished' {
  if (row?.unpublished) {
    return 'unpublished';
  }
  return Number.isInteger(row?.latest) ? 'published' : 'draft';
}

/** Public host URLs of a published scene, or undefined when the host does not serve */
/**
 * Public host URLs and embed snippets of a published scene.
 * @param latest - the version websites get (or, unpublished, the one to pin)
 * @param options.scene - the content of that version, for the per-delivery
 *   snippets and the responsive note; omit when unknown (a draft edited since)
 * @param options.unpublished - the scene has no live latest: only the pinned
 *   version serves, so only pinned links are given
 */
export function publicLinks(
  host: any,
  slug: string | null | undefined,
  latest?: number | null,
  options: { scene?: unknown; unpublished?: boolean } = {}
): Record<string, any> | undefined {
  if (!host?.serving || !host.publicHost || !slug) {
    return undefined;
  }
  const pinned = Number.isInteger(latest);
  if (options.unpublished && !pinned) {
    return undefined;
  }
  const { scene } = options;
  const base = `https://${host.publicHost}/v2/stage/host/`;
  const script = `<script type="module" src="${base}v1/countly-stage.js"></script>`;
  // An unpublished scene has no latest; its pinned versions keep serving
  const ref = options.unpublished ? `${slug}@${latest}` : slug;
  const element = (attrs: string) => `${script}\n<countly-stage scene="${ref}"${attrs}></countly-stage>`;
  // <countly-stage delivery="..."> asks for another delivery the sequence offers
  const own = isRecord(scene) ? scene.delivery?.mode ?? 'autoplay' : undefined;
  const stepped = isRecord(scene) && stepsOf(scene).length > 0;
  const deliveries = own === undefined ? undefined : Object.fromEntries(
    ['autoplay', ...(stepped ? ['click', 'player'] : [])].map((mode) => [
      { autoplay: 'single_page', click: 'presentation', player: 'player' }[mode] as string,
      element(mode === own ? '' : ` delivery="${mode}"`),
    ])
  );
  return clean({
    latest_url: options.unpublished ? undefined : `${base}scenes/${slug}.json`,
    pinned_url: pinned ? `${base}scenes/${slug}@${latest}.json` : undefined,
    embed_snippet: element(''),
    embed_note_unpublished: options.unpublished
      ? `The scene is unpublished: these links pin version ${latest}; the latest URL works again after stage_scenes_restore.`
      : undefined,
    embed_by_delivery: deliveries,
    embed_note: isRecord(scene) && scene.fit
      ? 'Responsive scene: it takes the width of its container and picks its breakpoint; the height follows within its min/max (or set height="..." on the element).'
      : undefined,
  });
}

/** Field arguments applied to a scene (create and partial update) */
export function applySceneFields(scene: Record<string, any>, args: any): Record<string, any> {
  const next = { ...scene };
  for (const key of ['name', 'look', 'theme', 'transition', 'width', 'height'] as const) {
    if (args[key] !== undefined) {
      next[key] = args[key];
    }
  }
  if (args.paper !== undefined) {
    const paper = PAPERS[args.paper];
    if (!paper) {
      throw new Error(`paper must be one of: ${Object.keys(PAPERS).join(', ')}`);
    }
    next.width = paper.width;
    next.height = paper.height;
  }
  if (args.delivery_mode !== undefined) {
    if (!DELIVERY_MODES.includes(args.delivery_mode)) {
      throw new Error(`delivery_mode must be one of: ${DELIVERY_MODES.join(', ')}`);
    }
    next.delivery = { ...(isRecord(next.delivery) ? next.delivery : {}), mode: args.delivery_mode };
  }
  for (const key of ['company', 'lang'] as const) {
    if (args[key] === '') {
      delete next[key];
    } else if (args[key] !== undefined) {
      next[key] = args[key];
    }
  }
  if (args.lang === '') {
    delete next.pinLang;
  }
  if (next.company !== undefined && !isSlug(next.company)) {
    throw new Error('company must be a demo company id from stage_companies_list');
  }
  return next;
}

/** Steps of a scene: the current `steps`, or the first format's `slides` */
function stepsOf(scene: Record<string, any>): any[] {
  if (Array.isArray(scene.steps)) {
    return scene.steps;
  }
  return Array.isArray(scene.slides) ? scene.slides : [];
}

/** Lean outline of a scene for the model: format, delivery, steps, layers */
export function summariseScene(scene: unknown): Record<string, unknown> | null {
  if (!isRecord(scene)) {
    return null;
  }
  const paper = Object.entries(PAPERS).find(([, p]) => p.width === scene.width && p.height === scene.height)?.[0];
  const layers: any[] = Array.isArray(scene.layers) ? scene.layers : [];
  const steps = stepsOf(scene);
  const pieces: Record<string, number> = {};
  for (const layer of layers) {
    pieces[layer?.piece] = (pieces[layer?.piece] ?? 0) + 1;
  }
  return clean({
    name: scene.name,
    width: scene.width,
    height: scene.height,
    paper,
    look: scene.look ?? 'product',
    theme: scene.theme ?? 'light',
    delivery: scene.delivery?.mode ?? (isRecord(scene.deck) ? 'click (legacy deck)' : 'autoplay'),
    transition: steps.length ? scene.transition ?? scene.slideTransition ?? 'fade' : undefined,
    company: scene.company,
    lang: scene.lang,
    textScale: scene.textScale,
    responsive: scene.fit ? true : undefined,
    variants: Array.isArray(scene.variants) && scene.variants.length ? scene.variants.length : undefined,
    legacyFormat: !Array.isArray(scene.steps) && Array.isArray(scene.slides) ? 'slides (converted to steps on the next save)' : undefined,
    pieces,
    steps: steps.map((s: any) => clean({
      id: s.id,
      name: s.name,
      layers: Array.isArray(s.layers) ? s.layers.length : 0,
      hold: s.hold,
      advance: s.advance,
      dark: s.dark,
      plays: s.play ? `${s.play.scenario} on ${s.play.layer}` : undefined,
      section: s.section,
      notes: typeof s.notes === 'string' && s.notes ? `${s.notes.slice(0, 80)}${s.notes.length > 80 ? '…' : ''}` : undefined,
    })),
    layers: layers.map((l: any) => clean({
      id: l.id,
      piece: l.piece,
      box: [l.x, l.y, l.w, l.h].join(','),
      build: l.build,
      hidden: l.hidden,
    })),
  });
}

function sceneRowOut(row: any): Record<string, unknown> {
  return clean({
    id: row.id,
    name: row.name,
    size: row.width && row.height ? `${row.width}x${row.height}` : undefined,
    rev: row.rev,
    state: sceneState(row),
    slug: row.slug,
    latest: row.latest,
    versions: Array.isArray(row.versions) && row.versions.length ? row.versions : undefined,
    createdBy: row.createdBy?.name,
    updatedAt: row.updatedAt,
    updatedBy: row.updatedBy?.name,
  });
}

/** Company fields from tool arguments onto a stored (or new) company */
export function applyCompanyFields(company: Record<string, any>, args: any): Record<string, any> {
  const next = { ...company };
  const map: Record<string, string> = {
    name: 'name', base: 'base', app_name: 'appName', logo: 'logo', primary: 'primary', accent: 'accent',
    renames: 'renames', volume_scale: 'volumeScale', public: 'public',
  };
  for (const [arg, field] of Object.entries(map)) {
    if (args[arg] === undefined) {
      continue;
    }
    if (args[arg] === '' && ['appName', 'logo', 'primary', 'accent'].includes(field)) {
      delete next[field];
    } else {
      next[field] = args[arg];
    }
  }
  if (next.public !== true) {
    delete next.public;
  }
  return next;
}

function companyOut(company: any, includeLogo: boolean): any {
  if (!isRecord(company) || includeLogo || typeof company.logo !== 'string') {
    return company;
  }
  return { ...company, logo: `${company.logo.slice(0, 32)}… (${Math.round(company.logo.length / 1024)} KB; include_logo: true for all of it)` };
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

export class StageTools {
  constructor(private context: ToolContext) {}

  /** The public host's status; a failed lookup is kept as `error`, not read as "off" */
  private async hostStatus(): Promise<{ host: any; error?: string }> {
    try {
      const data = await v2Request<any>(this.context, 'get', '/v2/stage/status');
      return { host: data?.host ?? null };
    } catch (error) {
      return { host: null, error: `could not read the public host's status (${error instanceof Error ? error.message : String(error)}); public URLs and embed snippets are left out, try again` };
    }
  }

  /** The builder on the dashboard, where a person sees, presents and edits the scene */
  private previewUrl(id: string): string | undefined {
    const base = String(this.context.httpClient?.defaults?.baseURL ?? '').replace(/\/+$/, '');
    return base ? `${base}/stage/${id}` : undefined;
  }

  /** POST /v2/stage/validate; null on a server without it (before countly-platform#1990) */
  private async checkScene(scene: unknown): Promise<any | null> {
    try {
      return await v2Request<any>(this.context, 'post', '/v2/stage/validate', { body: { scene } });
    } catch (error) {
      if (error instanceof V2ApiError && (error.status === 404 || error.status === 405)) {
        return null;
      }
      throw error;
    }
  }

  private async getTemplate(id: string): Promise<any> {
    const [source, name, ...rest] = String(id ?? '').split('/');
    if (!/^(starter|example)$/.test(source) || !/^[a-z0-9-]+$/.test(name ?? '') || rest.length) {
      throw new Error('template must be an id from stage_templates_list, e.g. "starter/deck"');
    }
    try {
      return await v2Request<any>(this.context, 'get', `/v2/stage/templates/${source}/${name}`);
    } catch (error) {
      if (error instanceof V2ApiError && error.status === 404) {
        const list = await v2Request<any>(this.context, 'get', '/v2/stage/templates').catch(() => null);
        throw new Error(list ? `no template ${id}; see stage_templates_list` : 'this server does not serve templates (it predates GET /v2/stage/templates)');
      }
      throw error;
    }
  }

  private async getScene(id: string): Promise<any> {
    return v2Request<any>(this.context, 'get', `/v2/stage/scenes/${enc(id)}`);
  }

  /** GET /v2/stage/pieces, or null on a server without the route (before countly-platform#1990) */
  private async pieceCatalog(): Promise<{ categories: any[]; pieces: any[] } | null> {
    try {
      const data = await v2Request<any>(this.context, 'get', '/v2/stage/pieces');
      return Array.isArray(data?.pieces) ? data : null;
    } catch (error) {
      if (error instanceof V2ApiError && error.status === 404) {
        return null;
      }
      throw error;
    }
  }

  async stage_reference(_args: any): Promise<ToolResult> {
    return run('get the Stage reference', async () => {
      // Only a server without the route falls back (pieceCatalog answers null);
      // any other failure is the server's and is reported
      const catalog = await this.pieceCatalog();
      const pieces = catalog
        ? catalog.pieces.map((p: any) => p.id)
        : STAGE_PIECE_IDS;
      return jsonResult('Stage scene and company format', {
        ...SCENE_REFERENCE,
        pieces,
        piecesSource: catalog
          ? 'this server\'s catalog: stage_pieces_list describes them, stage_pieces_get gives their props'
          : 'built-in list (this server does not serve its piece catalog); props are undocumented: copy them from a layer of an existing scene',
      });
    });
  }

  async stage_pieces_list(args: any): Promise<ToolResult> {
    return run('list Stage pieces', async () => {
      const catalog = await this.pieceCatalog();
      if (!catalog) {
        return jsonResult(
          'This server does not describe its pieces (it predates GET /v2/stage/pieces). Piece ids it accepts as of the scene format this tool knows; for props, copy a layer from an existing scene (stage_scenes_get, view "full")',
          STAGE_PIECE_IDS
        );
      }
      let pieces = catalog.pieces;
      if (args.category) {
        pieces = pieces.filter((p: any) => p.category === args.category);
      }
      if (args.search) {
        const needle = String(args.search).toLowerCase();
        pieces = pieces.filter((p: any) => [p.id, p.label, p.description].some((v) => String(v ?? '').toLowerCase().includes(needle)));
      }
      const rows = pieces.map((p: any) => clean({
        id: p.id,
        label: p.label,
        category: p.category,
        description: p.description,
        size: p.defaultSize ? `${p.defaultSize.w}x${p.defaultSize.h}` : undefined,
        appFrame: p.usesFrame || undefined,
        data: p.data || undefined,
      }));
      return jsonResult(`Stage pieces (${rows.length} of ${catalog.pieces.length}; stage_pieces_get for props)`, {
        categories: catalog.categories,
        pieces: rows,
      });
    });
  }

  async stage_pieces_get(args: any): Promise<ToolResult> {
    return run('get Stage piece', async () => {
      const ids: string[] = (Array.isArray(args.piece) ? args.piece : String(args.piece ?? '').split(','))
        .map((id: unknown) => String(id ?? '').trim())
        .filter(Boolean);
      if (ids.length === 0 || ids.length > 10) {
        throw new Error('piece must be 1 to 10 piece ids from stage_pieces_list');
      }
      if (!ids.every((id) => /^[a-z0-9][a-z0-9-]{0,63}$/.test(id))) {
        throw new Error('piece ids are lowercase letters, digits and hyphens (see stage_pieces_list)');
      }
      const docs = await Promise.all(ids.map(async (id) => {
        try {
          return await v2Request<any>(this.context, 'get', `/v2/stage/pieces/${enc(id)}`);
        } catch (error) {
          if (error instanceof V2ApiError && error.status === 404) {
            const known = await this.pieceCatalog().catch(() => null);
            if (!known) {
              throw new Error('this server does not describe its pieces (it predates GET /v2/stage/pieces); copy a layer of this piece from an existing scene (stage_scenes_get, view "full")');
            }
            return { id, error: 'no such piece on this server; see stage_pieces_list' };
          }
          throw error;
        }
      }));
      return jsonResult(ids.length === 1 ? `Stage piece ${ids[0]}` : `Stage pieces ${ids.join(', ')}`, ids.length === 1 ? docs[0] : docs);
    });
  }

  async stage_status(_args: any): Promise<ToolResult> {
    return run('get Stage status', async () => {
      const data = await v2Request<any>(this.context, 'get', '/v2/stage/status');
      const host = data?.host ?? {};
      const title = host.serving
        ? `Stage public host serves on ${host.publicHost}`
        : `Stage public host is off${host.reason ? ` (${host.reason})` : ''}: published scenes cannot be embedded from this server`;
      return jsonResult(title, host);
    });
  }

  async stage_scenes_list(args: any): Promise<ToolResult> {
    return run('list Stage scenes', async () => {
      const data = await v2Request<any>(this.context, 'get', '/v2/stage/scenes');
      let rows: any[] = data?.scenes || [];
      const total = rows.length;
      if (args.search) {
        const needle = String(args.search).toLowerCase();
        rows = rows.filter((r) => String(r.name ?? '').toLowerCase().includes(needle) || String(r.slug ?? '').includes(needle));
      }
      if (args.published && args.published !== 'all') {
        rows = rows.filter((r) => sceneState(r) === args.published);
      }
      const limit = Number(args.limit) > 0 ? Number(args.limit) : 50;
      const shown = rows.slice(0, limit).map(sceneRowOut);
      return jsonResult(`Stage scenes (${rows.length} matching of ${total}, showing ${shown.length})`, shown);
    });
  }

  async stage_scenes_get(args: any): Promise<ToolResult> {
    return run('get Stage scene', async () => {
      const id = sceneIdOf(args);
      const data = await this.getScene(id);
      const full = args.view === 'full';
      const status = data.slug ? await this.hostStatus() : { host: null };
      const host = status.host;
      const latestVersion = (data.versionDetails || []).find((v: any) => v.version === data.latest);
      // The draft describes the published version only if nothing was saved after it
      const draftIsLatest = !!latestVersion?.publishedAt && !!data.updatedAt
        && Date.parse(data.updatedAt) <= Date.parse(latestVersion.publishedAt);
      return jsonResult(`Stage scene ${id} (rev ${data.rev}, ${sceneState(data)})`, clean({
        ...sceneRowOut(data),
        preview_url: this.previewUrl(id),
        public: publicLinks(host, data.slug, data.latest, { scene: draftIsLatest ? data.scene : undefined, unpublished: data.unpublished === true }),
        public_links_error: status.error,
        draft_note: data.latest && !draftIsLatest
          ? `The draft was saved after version ${data.latest} was published: websites show version ${data.latest} until stage_scenes_publish.`
          : undefined,
        versionDetails: (data.versionDetails || []).map((v: any) => clean({
          version: v.version,
          title: v.title,
          publishedAt: v.publishedAt,
          publishedBy: v.publishedBy?.name,
        })),
        ...(full ? { scene: data.scene } : { outline: summariseScene(data.scene) }),
      }));
    });
  }

  async stage_scenes_create(args: any): Promise<ToolResult> {
    return run('create Stage scene', async () => {
      if (args.scene !== undefined && !isRecord(args.scene)) {
        throw new Error('scene must be a JSON object (see stage_reference)');
      }
      const template = args.template ? await this.getTemplate(args.template) : null;
      const base = { version: 1, layers: [], ...(template ? template.scene : args.scene || {}) };
      const scene = applySceneFields(base, args);
      const created = await v2Request<any>(this.context, 'post', '/v2/stage/scenes', { body: { scene } });
      return jsonResult(`Stage scene created (draft; change it with stage_scenes_edit, publish with stage_scenes_publish)`, clean({
        id: created.id,
        rev: created.rev,
        name: scene.name ?? 'Untitled scene',
        template: template?.id,
        preview_url: this.previewUrl(created.id),
        outline: template ? summariseScene(scene) : undefined,
      }));
    });
  }

  async stage_scenes_update(args: any): Promise<ToolResult> {
    return run('update Stage scene', async () => {
      const id = sceneIdOf(args);
      if (args.scene !== undefined && !isRecord(args.scene)) {
        throw new Error('scene must be a JSON object (from stage_scenes_get view "full")');
      }
      if (args.scene !== undefined && args.rev === undefined) {
        // The scene was read earlier: saving it over the current revision would
        // silently overwrite whatever was saved since
        throw new Error('pass rev with scene: the revision stage_scenes_get returned with the content you edited');
      }
      let rev = args.rev;
      let content = args.scene;
      if (content === undefined || rev === undefined) {
        const current = await this.getScene(id);
        rev = rev ?? current.rev;
        content = content ?? current.scene;
      }
      if (!isRecord(content)) {
        throw new Error('the stored scene is not readable; pass a whole `scene`');
      }
      const scene = applySceneFields(content, args);
      const saved = await v2Request<any>(this.context, 'put', `/v2/stage/scenes/${enc(id)}`, {
        body: { scene, rev: Number(rev) },
      });
      return jsonResult(`Stage scene ${id} saved (published versions unchanged)`, { id, rev: saved.rev });
    });
  }

  async stage_scenes_delete(args: any): Promise<ToolResult> {
    return run('delete Stage scene', async () => {
      const id = sceneIdOf(args);
      await v2Request<any>(this.context, 'delete', `/v2/stage/scenes/${enc(id)}`);
      return { content: [{ type: 'text', text: `Stage scene ${id} deleted.` }] };
    });
  }

  async stage_scenes_publish(args: any): Promise<ToolResult> {
    return run('publish Stage scene', async () => {
      const id = sceneIdOf(args);
      const current = await this.getScene(id);
      const rev = args.rev ?? current.rev;
      let slug: string | undefined;
      if (!current.slug) {
        slug = args.slug ?? slugify(String(current.scene?.name ?? current.name ?? ''));
        if (!isSlug(slug)) {
          throw new Error('pass a slug: lowercase letters, digits and single hyphens, at most 64 characters, and not "index"');
        }
      }
      const published = await v2Request<any>(this.context, 'post', `/v2/stage/scenes/${enc(id)}/versions`, {
        body: clean({ rev: Number(rev), slug }),
      });
      const status = await this.hostStatus();
      const host = status.host;
      const note = current.unpublished
        ? ' The scene is unpublished: the version is stored and pinnable, but hidden until stage_scenes_restore.'
        : '';
      return jsonResult(`Published ${published.slug} version ${published.version}.${note}`, clean({
        slug: published.slug,
        version: published.version,
        public: publicLinks(host, published.slug, published.version, { scene: current.scene, unpublished: current.unpublished === true }),
        host: host && !host.serving ? `public host is off${host.reason ? `: ${host.reason}` : ''}` : undefined,
        // The publish succeeded; only its links are missing
        public_links_error: status.error,
      }));
    });
  }

  private async patchState(action: string, id: string, body: Record<string, unknown>): Promise<ToolResult> {
    const data = await v2Request<any>(this.context, 'patch', `/v2/stage/scenes/${enc(id)}`, { body });
    return jsonResult(action, data);
  }

  async stage_scenes_set_latest(args: any): Promise<ToolResult> {
    return run('change the latest Stage scene version', async () => {
      const id = sceneIdOf(args);
      const version = Number(args.version);
      if (!Number.isInteger(version) || version < 1) {
        throw new Error('version must be a positive integer from stage_scenes_get');
      }
      return this.patchState(`Stage scene ${id} now serves version ${version}`, id, { latest: version });
    });
  }

  async stage_scenes_unpublish(args: any): Promise<ToolResult> {
    return run('unpublish Stage scene', async () => {
      const id = sceneIdOf(args);
      return this.patchState(`Stage scene ${id} unpublished (pinned versions keep working)`, id, { unpublished: true });
    });
  }

  async stage_scenes_restore(args: any): Promise<ToolResult> {
    return run('restore Stage scene', async () => {
      const id = sceneIdOf(args);
      return this.patchState(`Stage scene ${id} restored`, id, { unpublished: false });
    });
  }

  async stage_templates_list(args: any): Promise<ToolResult> {
    return run('list Stage templates', async () => {
      const data = await v2Request<any>(this.context, 'get', '/v2/stage/templates');
      let rows: any[] = data?.templates || [];
      if (args.kind) {
        rows = rows.filter((t) => t.kind === args.kind);
      }
      if (args.search) {
        const needle = String(args.search).toLowerCase();
        rows = rows.filter((t) => [t.id, t.label, t.description].some((v) => String(v ?? '').toLowerCase().includes(needle)));
      }
      const out = rows.map((t) => clean({
        id: t.id,
        kind: t.kind,
        label: t.label,
        description: t.description,
        format: `${t.look}/${t.theme}, ${t.width}x${t.height}${t.paper ? ` (${t.paper})` : ''}`,
        delivery: t.delivery,
        steps: t.steps || undefined,
        responsive: t.responsive ? `yes, ${t.breakpoints ?? 0} breakpoint(s)` : undefined,
        scenarios: t.scenarios,
      }));
      return jsonResult(`Stage templates (${out.length}; create from one with stage_scenes_create template)`, out);
    });
  }

  async stage_templates_get(args: any): Promise<ToolResult> {
    return run('get Stage template', async () => {
      const doc = await this.getTemplate(args.template);
      const { scene, ...meta } = doc;
      return jsonResult(`Stage template ${doc.id}`, args.view === 'full' ? { ...meta, scene } : { ...meta, outline: summariseScene(scene) });
    });
  }

  async stage_scenarios_list(args: any): Promise<ToolResult> {
    return run('list Stage scenarios', async () => {
      const data = await v2Request<any>(this.context, 'get', '/v2/stage/scenarios');
      let rows: any[] = data?.scenarios || [];
      if (args.kind) {
        rows = rows.filter((s) => s.kind === args.kind);
      }
      if (args.search) {
        const needle = String(args.search).toLowerCase();
        rows = rows.filter((s) => [s.id, s.label, s.description, s.start?.page, s.start?.state].some((v) => String(v ?? '').toLowerCase().includes(needle)));
      }
      const out = rows.map((s) => clean({
        id: s.id,
        label: s.label,
        kind: s.kind,
        description: s.description,
        starts: s.start?.page ?? (s.start?.state ? `state ${s.start.state}` : undefined),
        project: s.pinsProject ? `${s.project} (always)` : s.project,
        chapters: (s.chapters || []).map((c: any) => `${c.id}: ${c.label}`),
      }));
      return jsonResult(`Stage scenarios (${out.length}; a step plays one with set_step play {layer, scenario, from?, to?})`, out);
    });
  }

  async stage_scenarios_get(args: any): Promise<ToolResult> {
    return run('get Stage scenario', async () => {
      const id = String(args.scenario ?? '').trim();
      if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(id)) {
        throw new Error('scenario must be an id from stage_scenarios_list');
      }
      const doc = await v2Request<any>(this.context, 'get', `/v2/stage/scenarios/${enc(id)}`);
      const chapters = (doc.chapters || []).map((c: any) => (args.include_steps ? c : { ...c, steps: undefined, stepCount: c.steps?.length }));
      return jsonResult(`Stage scenario ${id}`, { ...doc, chapters: chapters.map((c: any) => clean(c)) });
    });
  }

  async stage_scenes_validate(args: any): Promise<ToolResult> {
    return run('validate Stage scene', async () => {
      let scene = args.scene;
      if (scene === undefined && args.scene_id !== undefined) {
        scene = (await this.getScene(sceneIdOf(args))).scene;
      }
      if (!isRecord(scene)) {
        throw new Error('pass a scene JSON object, or scene_id');
      }
      const result = await this.checkScene(scene);
      if (!result) {
        throw new Error('this server has no save dry run (it predates POST /v2/stage/validate); a save reports refusals only');
      }
      const title = !result.valid
        ? `A save would be refused: ${result.error}`
        : `A save would be accepted${result.publishable ? ' and the scene could be published' : `; publishing would fail: ${result.publishError}`}`;
      return jsonResult(title, result);
    });
  }

  async stage_scenes_edit(args: any): Promise<ToolResult> {
    return run('edit Stage scene', async () => {
      const id = sceneIdOf(args);
      const ops: EditOp[] = Array.isArray(args.ops) ? args.ops : [];
      const current = await this.getScene(id);
      if (!isRecord(current.scene)) {
        throw new Error('the stored scene is not readable');
      }
      const rev = args.rev ?? current.rev;
      const pieces: Record<string, PieceStart> = {};
      for (const piece of newLayerPieces(current.scene, ops)) {
        pieces[piece] = await v2Request<any>(this.context, 'get', `/v2/stage/pieces/${enc(piece)}`).catch((error: unknown) => {
          if (error instanceof V2ApiError && error.status === 404) {
            return {};
          }
          throw error;
        });
      }
      const scene = applyEditOps(current.scene, ops, pieces);
      const check = await this.checkScene(scene);
      if (check && !check.valid) {
        return {
          content: [{ type: 'text', text: `Not saved: a save would be refused: ${check.error}\n${JSON.stringify(clean({ props: check.props?.length ? check.props : undefined }), null, 2)}` }],
          isError: true,
        };
      }
      const notes = check ? clean({
        changes: check.changes?.length ? check.changes : undefined,
        ignored_props: check.props?.length ? check.props : undefined,
        publishable: check.publishable,
        publishError: check.publishError,
      }) : undefined;
      if (args.dry_run) {
        return jsonResult(`Dry run: ${ops.length} operation(s) applied, nothing saved`, clean({ outline: summariseScene(scene), notes }));
      }
      const saved = await v2Request<any>(this.context, 'put', `/v2/stage/scenes/${enc(id)}`, { body: { scene, rev: Number(rev) } });
      return jsonResult(`Stage scene ${id} saved (rev ${saved.rev}; published versions unchanged)`, clean({
        id,
        rev: saved.rev,
        preview_url: this.previewUrl(id),
        notes,
        outline: summariseScene(scene),
      }));
    });
  }

  async stage_companies_list(_args: any): Promise<ToolResult> {
    return run('list Stage demo companies', async () => {
      const data = await v2Request<any>(this.context, 'get', '/v2/stage/companies');
      const rows = (data?.companies || []).map((c: any) => clean({
        id: c.id,
        name: c.name,
        public: c.public,
        referenced: c.referenced || undefined,
        size: c.size,
        updatedAt: c.updatedAt,
        updatedBy: c.updatedBy?.name,
      }));
      return jsonResult(`Stage demo companies (${rows.length})`, rows);
    });
  }

  async stage_companies_get(args: any): Promise<ToolResult> {
    return run('get Stage demo company', async () => {
      const id = companyIdOf(args.company_id);
      const data = await v2Request<any>(this.context, 'get', `/v2/stage/companies/${enc(id)}`);
      return jsonResult(`Stage demo company ${id}${data.referenced ? ' (referenced by a published version: immutable)' : ''}`, {
        ...clean({ public: data.public, referenced: data.referenced, updatedAt: data.updatedAt, updatedBy: data.updatedBy?.name }),
        company: companyOut(data.company, args.include_logo === true),
      });
    });
  }

  async stage_companies_create(args: any): Promise<ToolResult> {
    return run('create Stage demo company', async () => {
      const id = companyIdOf(args.company_id ?? slugify(String(args.name ?? '')));
      const company = applyCompanyFields({ id, renames: {}, volumeScale: 1 }, args);
      const created = await v2Request<any>(this.context, 'post', '/v2/stage/companies', { body: { company } });
      return jsonResult(`Stage demo company created`, { id: created.id, public: company.public === true });
    });
  }

  async stage_companies_update(args: any): Promise<ToolResult> {
    return run('update Stage demo company', async () => {
      const id = companyIdOf(args.company_id);
      const current = await v2Request<any>(this.context, 'get', `/v2/stage/companies/${enc(id)}`);
      if (!isRecord(current.company)) {
        throw new Error('the stored company is not readable');
      }
      const company = applyCompanyFields({ ...current.company, id }, args);
      await v2Request<any>(this.context, 'put', `/v2/stage/companies/${enc(id)}`, { body: { company } });
      return jsonResult(`Stage demo company ${id} saved`, { id, public: company.public === true });
    });
  }
}

export const stageToolHandlers = Object.fromEntries(
  stageToolDefinitions.map((t) => [t.name, t.name])
) as Record<string, string>;

export const stageToolMetadata = {
  instanceKey: 'stage',
  toolClass: StageTools,
  handlers: stageToolHandlers,
} as const;
