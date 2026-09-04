/*
 * Tests for the two modules that are not the layer bridge: One-Sided Stretch and
 * Layered Lock Alpha, plus the bundle plumbing that holds all three.
 *
 * The layer suites (run_tests.js, run_tests_52.js) run against a mock that has no
 * paint or transform machinery at all, which is on purpose: it proves those two
 * modules sit out cleanly when Blockbench cannot host them. This suite adds the
 * missing halves of Blockbench - Painter.edit, the transform gizmo's edit module,
 * a Cube - and drives the modules through the same seams they hook in the real app.
 *
 * The stand-ins are deliberately thin, and every formula they mirror is named. The
 * rendered-face formula in particular is Blockbench's own
 * adjustFromAndToForInflateAndStretch, repeated here so a test failure means the
 * plugin drifted, not that the harness did.
 */
const { loadPlugin, TextureLayer, Texture, PathModule } = require('./mock_blockbench');
const { createCanvas, CanvasRenderingContext2D } = require('canvas');

const PLUGIN_PATH = PathModule.resolve(__dirname, '..', 'embodytools.js');

let passes = 0;
let failures = 0;

function check(label, condition, detail) {
	if (condition) {
		passes++;
		console.log('  ok   ' + label);
	} else {
		failures++;
		console.log('  FAIL ' + label + (detail !== undefined ? ('  -> ' + JSON.stringify(detail)) : ''));
	}
}
function section(name) {
	console.log('\n' + name);
}
/** Floats: everything here lands on binary fractions, but do not bet the suite on it. */
function near(a, b, tolerance) {
	return Math.abs(a - b) <= (tolerance === undefined ? 1e-9 : tolerance);
}

// ---------------------------------------------------------------------------
// the parts of Blockbench the layer mock does not have
// ---------------------------------------------------------------------------

globalThis.CanvasRenderingContext2D = CanvasRenderingContext2D;

// --- paint ------------------------------------------------------------------
/*
 * Painter.edit resolves the active layer's canvas and hands it to the tool. That is
 * the one seam Layered Lock Alpha wraps, so the stand-in only has to do that much.
 * Note it enforces no lock alpha of its own: "the module is switched off" therefore
 * means "the paint lands everywhere", which is what makes the on/off comparison in
 * the tests below meaningful.
 */
let paint_started = 0;
let paint_stopped = 0;
const core_painter_edit = function (texture, callback, options) {
	const layer = texture.getActiveLayer();
	callback(layer.canvas, { layer });
	texture.updateLayerChanges(true);
	return texture;
};
globalThis.Painter = {
	lock_alpha: false,
	erase_mode: false,
	current: {},
	edit: core_painter_edit,
	startPaintTool() { paint_started++; },
	stopPaintTool() { paint_stopped++; },
};
const core_start_paint = globalThis.Painter.startPaintTool;
const core_stop_paint = globalThis.Painter.stopPaintTool;

globalThis.Toolbox = { selected: { id: 'brush_tool' } };
globalThis.BarItems.lock_alpha = { description: 'Only paint on pixels that are not transparent.' };
globalThis.BarItems.blend_mode = { value: 'default' };
const CORE_LOCK_ALPHA_TOOLTIP = globalThis.BarItems.lock_alpha.description;

// --- transform --------------------------------------------------------------
const core_calls = [];
const core_edit_module = {
	calculateOffset(context) { core_calls.push('calculateOffset'); return 'CORE_OFFSET'; },
	onStart(context) { core_calls.push('onStart'); return 'CORE_START'; },
	onMove(context) { core_calls.push('onMove'); return 'CORE_MOVE'; },
	onEnd(context) { core_calls.push('onEnd'); return 'CORE_END'; },
	onCancel(context) { core_calls.push('onCancel'); return 'CORE_CANCEL'; },
};
globalThis.TransformerModule = { modules: { edit: Object.assign({}, core_edit_module) } };
const edit_module = globalThis.TransformerModule.modules.edit;

globalThis.Outliner = { selected: [] };
globalThis.Pressing = { overrides: {} };
globalThis.trimFloatNumber = (number) => String(number);
globalThis.updateNslideValues = function () {};

/*
 * Cube.prototype.resize as core has it: it moves the face you dragged in unstretched
 * units and never looks at this.stretch. That omission is the bug the module fixes,
 * so the stand-in has to reproduce it faithfully rather than being "correct".
 */
let core_resize_calls = 0;
class Cube {
	constructor(from, to, stretch) {
		this.uuid = globalThis.guid();
		this.from = from.slice();
		this.to = to.slice();
		this.stretch = (stretch || [1, 1, 1]).slice();
		this.inflate = 0;
		this.visibility = true;
	}
	size(axis) {
		return this.to[axis] - this.from[axis];
	}
	resize(value, axis, negative, allow_negative, bidirectional) {
		core_resize_calls++;
		if (bidirectional) {
			this.from[axis] -= value;
			this.to[axis] += value;
		} else if (negative) {
			this.from[axis] -= value;
		} else {
			this.to[axis] += value;
		}
		return this;
	}
}
globalThis.Cube = Cube;
const core_cube_resize = Cube.prototype.resize;

globalThis.Format.stretch_cubes = true;

/** Blockbench's adjustFromAndToForInflateAndStretch, for asserting on. */
function renderedFace(cube, axis, high) {
	const half_size = cube.size(axis) / 2;
	const centre = cube.from[axis] + half_size;
	const reach = (half_size + (cube.inflate || 0)) * cube.stretch[axis];
	return high ? centre + reach : centre - reach;
}

// ---------------------------------------------------------------------------
// load
// ---------------------------------------------------------------------------

const registry = loadPlugin(PLUGIN_PATH);
const plugin = registry.embodytools;

section('0. the bundle registers once');
check('registered under the id "embodytools"', !!plugin);
check('and under nothing else', Object.keys(registry).length === 1, Object.keys(registry));
if (!plugin) process.exit(1);
check('variant is not desktop-only, so the web app gets two of the three modules',
	plugin.variant === 'both', plugin.variant);
check('version is a single semver string', /^\d+\.\d+\.\d+$/.test(plugin.version), plugin.version);
check('has a changelog tab', plugin.has_changelog === true);

plugin.onload();

section('1. all three modules load when Blockbench can host them');
check('the transform edit module was wrapped',
	edit_module.calculateOffset !== core_edit_module.calculateOffset);
check('Cube.prototype.resize was wrapped', Cube.prototype.resize !== core_cube_resize);
check('Painter.edit was wrapped', globalThis.Painter.edit !== core_painter_edit);
check('the stretch settings exist',
	!!settings.one_sided_stretch && !!settings.one_sided_stretch_step
	&& !!settings.one_sided_stretch_resize_anchor);
check('the paint settings exist',
	!!settings.lla_enabled && !!settings.lla_clamp && !!settings.lla_allow_erase
	&& !!settings.lla_include_hidden);
check('the layer settings exist too, in one plugin',
	!!settings.embodygames_persist_texture_layers && !!settings.embodygames_watch_layer_files);
check('every setting says which plugin owns it',
	[settings.one_sided_stretch, settings.lla_enabled, settings.embodygames_persist_texture_layers]
		.every((setting) => setting.plugin === 'embodytools'));
check('the Lock Alpha tooltip now explains the layer-aware behaviour',
	BarItems.lock_alpha.description !== CORE_LOCK_ALPHA_TOOLTIP
	&& /layer/i.test(BarItems.lock_alpha.description));

// ===========================================================================
// One-Sided Stretch
// ===========================================================================

section('2. the stretch drag value is a fixed step, not snapped distance');
// hytale_character's base scale is 1/64 = 0.015625 and the step setting is 0 (auto).
const STEP = 0.015625;
globalThis.Toolbox.selected = { id: 'stretch_tool' };

const three_units = edit_module.calculateOffset({ point: { x: 3, y: 0, z: 0 }, axis: 'x', direction: 1, event: {} });
check('three units of drag is three steps', near(three_units, 3 * STEP), three_units);

const rounded = edit_module.calculateOffset({ point: { x: 2.4, y: 0, z: 0 }, axis: 'x', direction: 1, event: {} });
check('2.4 units rounds to two steps rather than landing between them', near(rounded, 2 * STEP), rounded);

const negative = edit_module.calculateOffset({ point: { x: 3, y: 0, z: 0 }, axis: 'x', direction: -1, event: {} });
check('the negative handle gets the negative value', near(negative, -3 * STEP), negative);

const shifted = edit_module.calculateOffset({ point: { x: 4, y: 0, z: 0 }, axis: 'x', direction: 1, event: { shiftKey: true } });
check('Shift halves the step', near(shifted, 4 * STEP / 2), shifted);
const ctrled = edit_module.calculateOffset({ point: { x: 4, y: 0, z: 0 }, axis: 'x', direction: 1, event: { ctrlKey: true } });
check('Ctrl quarters it', near(ctrled, 4 * STEP / 4), ctrled);
const both = edit_module.calculateOffset({ point: { x: 4, y: 0, z: 0 }, axis: 'x', direction: 1, event: { shiftKey: true, ctrlKey: true } });
check('both together take an eighth', near(both, 4 * STEP / 8), both);

settings.one_sided_stretch_step.value = 0.125; // stock Blockbench's own step
const stock = edit_module.calculateOffset({ point: { x: 2, y: 0, z: 0 }, axis: 'x', direction: 1, event: {} });
check('the step setting overrides the format default', near(stock, 0.25), stock);
settings.one_sided_stretch_step.value = 0;

globalThis.Toolbox.selected = { id: 'move_tool' };
check('with another tool selected core works out the offset, untouched',
	edit_module.calculateOffset({ point: { x: 3 }, axis: 'x', direction: 1, event: {} }) === 'CORE_OFFSET');
globalThis.Toolbox.selected = { id: 'stretch_tool' };

section('3. stretching moves the dragged face only');
/*
 * A drag, the way the real one arrives: onStart snapshots, core's calculateOffset ->
 * applyStretch puts the raw growth on element.stretch, then onMove runs. The suite
 * applies that growth by hand, which is exactly what core would have done.
 */
function stretchDrag(cube, raw_growth, context) {
	globalThis.Outliner.selected = [cube];
	edit_module.onStart({ axis: 'x', axis_number: 0, direction: 1, event: {} });
	cube.stretch[0] += raw_growth;
	edit_module.onMove(Object.assign({ axis: 'x', axis_number: 0, direction: 1, event: {} }, context));
	return cube;
}

let cube = new Cube([0, 0, 0], [8, 8, 8]);
const low_before = renderedFace(cube, 0, false);
const centred_high = 4 + 4 * (1 + 0.0625); // where stock's centred stretch puts the dragged face
stretchDrag(cube, 0.0625);
check('the anchored face has not moved at all',
	near(renderedFace(cube, 0, false), low_before), renderedFace(cube, 0, false));
check('the dragged face lands exactly where centred stretch would have put it',
	near(renderedFace(cube, 0, true), centred_high), renderedFace(cube, 0, true));
check('half the growth is applied, since all of it lands on one face',
	near(cube.stretch[0], 1.03125), cube.stretch[0]);
check('from and to moved by the amount the stretched half grew',
	near(cube.from[0], 0.125) && near(cube.to[0], 8.125), [cube.from[0], cube.to[0]]);

cube = new Cube([0, 0, 0], [8, 8, 8]);
const high_before = renderedFace(cube, 0, true);
globalThis.Outliner.selected = [cube];
edit_module.onStart({ axis: 'x', axis_number: 0, direction: -1, event: {} });
cube.stretch[0] += 0.0625;
edit_module.onMove({ axis: 'x', axis_number: 0, direction: -1, event: {} });
check('dragging the negative handle anchors the positive face instead',
	near(renderedFace(cube, 0, true), high_before), renderedFace(cube, 0, true));

cube = new Cube([0, 0, 0], [8, 8, 8]);
stretchDrag(cube, 0.0625, { event: { altKey: true } });
check('Alt gives back centred stretch: the full growth', near(cube.stretch[0], 1.0625), cube.stretch[0]);
check('and from/to are left where the drag started',
	cube.from[0] === 0 && cube.to[0] === 8, [cube.from[0], cube.to[0]]);

cube = new Cube([0, 0, 0], [8, 8, 8]);
globalThis.Outliner.selected = [cube];
edit_module.onStart({ axis: 'x', axis_number: 0, direction: 1, event: {} });
cube.stretch[0] += 0.0625;
edit_module.onMove({ axis: 'x', second_axis: 'y', axis_number: 0, direction: 1, event: {} });
check('the two-axis handles stay centred, like the Resize tool',
	cube.from[0] === 0 && cube.to[0] === 8 && near(cube.stretch[0], 1.0625));

cube = new Cube([0, 0, 0], [8, 8, 8]);
globalThis.Outliner.selected = [cube];
edit_module.onStart({ axis: 'x', axis_number: 0, direction: 1, event: {} });
edit_module.onEnd({});
cube.stretch[0] += 0.0625;
edit_module.onMove({ axis: 'x', axis_number: 0, direction: 1, event: {} });
check('a move after the drag ended does nothing, so nothing drifts',
	cube.from[0] === 0 && cube.to[0] === 8, [cube.from[0], cube.to[0]]);
check('core still saw every one of its own callbacks',
	['calculateOffset', 'onStart', 'onMove', 'onEnd'].every((name) => core_calls.includes(name)),
	core_calls);

section('4. resizing a stretched cube keeps the anchored face put');
cube = new Cube([0, 0, 0], [8, 8, 8], [1.5, 1, 1]);
const anchored_low = renderedFace(cube, 0, false);
const calls_before = core_resize_calls;
cube.resize(2, 0, false);
check('core did the resize', core_resize_calls === calls_before + 1);
check('the size grew by the full amount', near(cube.size(0), 10), cube.size(0));
check('and the face that was not dragged is still where it was',
	near(renderedFace(cube, 0, false), anchored_low), [renderedFace(cube, 0, false), anchored_low]);

cube = new Cube([0, 0, 0], [8, 8, 8], [1.5, 1, 1]);
const anchored_high = renderedFace(cube, 0, true);
cube.resize(2, 0, true);
check('same from the other side', near(renderedFace(cube, 0, true), anchored_high),
	[renderedFace(cube, 0, true), anchored_high]);

cube = new Cube([0, 0, 0], [8, 8, 8], [1.5, 1, 1]);
cube.resize(2, 0, false, undefined, true);
check('a bidirectional resize is left alone, it is centred by definition',
	cube.from[0] === -2 && cube.to[0] === 10, [cube.from[0], cube.to[0]]);

cube = new Cube([0, 0, 0], [8, 8, 8]);
cube.resize(2, 0, false);
check('an unstretched cube goes straight through to core',
	cube.from[0] === 0 && cube.to[0] === 10, [cube.from[0], cube.to[0]]);

cube = new Cube([0, 0, 0], [8, 8, 8], [1.5, 1, 1]);
settings.one_sided_stretch_resize_anchor.value = false;
cube.resize(2, 0, false);
check('with the anchor setting off, core\'s own drift is back',
	!near(renderedFace(cube, 0, false), -2), renderedFace(cube, 0, false));
settings.one_sided_stretch_resize_anchor.value = true;

// ===========================================================================
// Layered Lock Alpha
// ===========================================================================

section('5. Lock Alpha looks at every layer');

/** A texture with layers, and pixels painted by hand. */
function layeredTexture(size, paint_layers) {
	const texture = new Texture({ name: 'Texture.png' });
	texture.width = size;
	texture.height = size;
	texture.layers_enabled = true;
	texture.layers = [];
	for (const paint of paint_layers) {
		const layer = new TextureLayer({ name: 'layer ' + texture.layers.length }, texture);
		layer.setSize(size, size);
		paint(layer.ctx);
		texture.layers.push(layer);
	}
	texture.selected_layer = texture.layers[texture.layers.length - 1];
	return texture;
}
function pixel(layer, x, y) {
	const data = layer.ctx.getImageData(x, y, 1, 1).data;
	return [data[0], data[1], data[2], data[3]];
}
/** Paint the whole layer green, the way a fill or a big brush dab would. */
function paintGreen(texture) {
	Painter.edit(texture, (canvas) => {
		const ctx = canvas.getContext('2d');
		ctx.fillStyle = '#00ff00';
		ctx.fillRect(0, 0, texture.width, texture.height);
	}, { no_undo: true });
}

const LEFT_HALF_OPAQUE = (ctx) => {
	ctx.fillStyle = '#ff0000';
	ctx.fillRect(0, 0, 8, 16);
};
const EMPTY = () => {};

Painter.lock_alpha = true;

let texture = layeredTexture(16, [LEFT_HALF_OPAQUE, EMPTY]);
let top = texture.layers[1];
paintGreen(texture);
check('painting an empty top layer works where a lower layer holds the pixel',
	pixel(top, 2, 2)[3] === 255 && pixel(top, 2, 2)[1] === 255, pixel(top, 2, 2));
check('and is still locked out where every layer is transparent',
	pixel(top, 12, 2)[3] === 0, pixel(top, 12, 2));

texture = layeredTexture(16, [LEFT_HALF_OPAQUE, EMPTY]);
top = texture.layers[1];
settings.lla_enabled.value = false;
paintGreen(texture);
check('with the module switched off nothing clips the stroke',
	pixel(top, 12, 2)[3] === 255, pixel(top, 12, 2));
settings.lla_enabled.value = true;

texture = layeredTexture(16, [
	(ctx) => { ctx.fillStyle = 'rgba(255,0,0,0.5)'; ctx.fillRect(0, 0, 16, 16); },
	EMPTY,
]);
top = texture.layers[1];
paintGreen(texture);
const clamped = pixel(top, 4, 4)[3];
check('a stroke over a half transparent layer is clamped to it, so edges fade out',
	clamped > 100 && clamped < 160, clamped);

texture = layeredTexture(16, [
	(ctx) => { ctx.fillStyle = 'rgba(255,0,0,0.5)'; ctx.fillRect(0, 0, 16, 16); },
	EMPTY,
]);
top = texture.layers[1];
settings.lla_clamp.value = false;
paintGreen(texture);
check('turning the clamp off paints at full opacity instead', pixel(top, 4, 4)[3] === 255, pixel(top, 4, 4));
settings.lla_clamp.value = true;

const single = layeredTexture(16, [LEFT_HALF_OPAQUE]);
paintGreen(single);
check('a texture with one layer is vanilla\'s business, not ours',
	pixel(single.layers[0], 12, 2)[3] === 255, pixel(single.layers[0], 12, 2));

Painter.lock_alpha = false;
texture = layeredTexture(16, [LEFT_HALF_OPAQUE, EMPTY]);
top = texture.layers[1];
paintGreen(texture);
check('with Lock Alpha off the brush is not clipped at all',
	pixel(top, 12, 2)[3] === 255, pixel(top, 12, 2));
Painter.lock_alpha = true;

section('6. erasing an upper layer reveals what is under it');
/** Erase the left 4 columns, the way the eraser does. */
function eraseStripe(texture) {
	Painter.edit(texture, (canvas) => {
		canvas.getContext('2d').clearRect(0, 0, 4, 16);
	}, { no_undo: true });
}
const BLUE_EVERYWHERE = (ctx) => {
	ctx.fillStyle = '#0000ff';
	ctx.fillRect(0, 0, 16, 16);
};

globalThis.Toolbox.selected = { id: 'eraser' };
texture = layeredTexture(16, [LEFT_HALF_OPAQUE, BLUE_EVERYWHERE]);
top = texture.layers[1];
eraseStripe(texture);
check('the eraser works where another layer still covers the pixel',
	pixel(top, 1, 1)[3] === 0, pixel(top, 1, 1));

texture = layeredTexture(16, [EMPTY, BLUE_EVERYWHERE]);
top = texture.layers[1];
eraseStripe(texture);
check('but not where this layer is the only thing holding the silhouette up',
	pixel(top, 1, 1)[3] === 255 && pixel(top, 1, 1)[2] === 255, pixel(top, 1, 1));

texture = layeredTexture(16, [LEFT_HALF_OPAQUE, BLUE_EVERYWHERE]);
top = texture.layers[1];
settings.lla_allow_erase.value = false;
eraseStripe(texture);
check('and the setting can freeze alpha outright, like vanilla',
	pixel(top, 1, 1)[3] === 255, pixel(top, 1, 1));
settings.lla_allow_erase.value = true;
globalThis.Toolbox.selected = { id: 'brush_tool' };

section('7. hidden layers only count when you say so');
const HIDE_IT = (ctx) => { ctx.fillStyle = '#ff0000'; ctx.fillRect(0, 0, 16, 16); };
texture = layeredTexture(16, [HIDE_IT, EMPTY]);
texture.layers[0].visible = false;
top = texture.layers[1];
paintGreen(texture);
check('a hidden layer does not make the area paintable', pixel(top, 4, 4)[3] === 0, pixel(top, 4, 4));

texture = layeredTexture(16, [HIDE_IT, EMPTY]);
texture.layers[0].visible = false;
top = texture.layers[1];
settings.lla_include_hidden.value = true;
paintGreen(texture);
check('unless the setting says to count it', pixel(top, 4, 4)[3] === 255, pixel(top, 4, 4));
settings.lla_include_hidden.value = false;

section('8. the stroke hooks are handed through to core');
const started_before = paint_started;
Painter.startPaintTool('a', 'b');
Painter.stopPaintTool();
check('startPaintTool still reaches core', paint_started === started_before + 1);
check('stopPaintTool too', paint_stopped >= 1);

// ===========================================================================
// bundle plumbing
// ===========================================================================

section('9. unload puts Blockbench back exactly as it was');
plugin.onunload();
check('Painter.edit restored', globalThis.Painter.edit === core_painter_edit);
check('Painter.startPaintTool restored', globalThis.Painter.startPaintTool === core_start_paint);
check('Painter.stopPaintTool restored', globalThis.Painter.stopPaintTool === core_stop_paint);
check('the Lock Alpha tooltip restored', BarItems.lock_alpha.description === CORE_LOCK_ALPHA_TOOLTIP);
check('the transform edit module restored',
	edit_module.calculateOffset === core_edit_module.calculateOffset
	&& edit_module.onStart === core_edit_module.onStart
	&& edit_module.onMove === core_edit_module.onMove
	&& edit_module.onEnd === core_edit_module.onEnd
	&& edit_module.onCancel === core_edit_module.onCancel);
check('Cube.prototype.resize restored', Cube.prototype.resize === core_cube_resize);
check('every setting the bundle added is gone', ![
	'one_sided_stretch', 'one_sided_stretch_step', 'one_sided_stretch_resize_anchor',
	'lla_enabled', 'lla_clamp', 'lla_allow_erase', 'lla_include_hidden',
	'embodygames_persist_texture_layers', 'embodygames_watch_layer_files',
].some((id) => !!settings[id]), Object.keys(settings));

section('10. a module Blockbench cannot host sits out on its own');
// Take the transform machinery away and load again: One-Sided Stretch has nothing to
// hook, and the other two must not care.
const parked_transformer = globalThis.TransformerModule;
delete globalThis.TransformerModule;
plugin.onload();
check('the stretch module skipped itself', !settings.one_sided_stretch);
check('Layered Lock Alpha loaded anyway', !!settings.lla_enabled && globalThis.Painter.edit !== core_painter_edit);
check('Texture Layers loaded anyway', !!settings.embodygames_persist_texture_layers);
plugin.onunload();
check('and unloading a partial bundle is still clean',
	globalThis.Painter.edit === core_painter_edit && !settings.lla_enabled);
globalThis.TransformerModule = parked_transformer;

// Same again, for the desktop-only module.
const parked_is_app = globalThis.isApp;
globalThis.isApp = false;
plugin.onload();
check('in the web app Texture Layers sits out', !settings.embodygames_persist_texture_layers);
check('and the other two still work', !!settings.one_sided_stretch && !!settings.lla_enabled);
plugin.onunload();
globalThis.isApp = parked_is_app;

section('11. a module that throws while starting up does not take the others with it');
console.log('       (the stack traces below are on purpose: a hook is being broken deliberately)');
const parked_painter_edit = globalThis.Painter.edit;
// Painter.edit still reads as a function, so the module is not skipped: it gets part
// way through load() - its settings are already in - and then blows up on the hook.
Object.defineProperty(globalThis.Painter, 'edit', {
	configurable: true,
	get() { return parked_painter_edit; },
	set() { throw new Error('boom'); },
});
plugin.onload();
check('the other two loaded', !!settings.one_sided_stretch && !!settings.embodygames_persist_texture_layers);
check('the half-loaded one was cleaned up, settings and all', !settings.lla_enabled, Object.keys(settings));
plugin.onunload();
Object.defineProperty(globalThis.Painter, 'edit', {
	configurable: true,
	writable: true,
	value: parked_painter_edit,
});
check('and Painter.edit is the untouched original afterwards', globalThis.Painter.edit === core_painter_edit);

console.log('\n' + passes + ' passed, ' + failures + ' failed');
process.exit(failures ? 1 : 0);
