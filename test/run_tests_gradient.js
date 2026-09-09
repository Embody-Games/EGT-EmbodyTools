/*
 * The fourth module, and the four of them together.
 *
 * Gradient Map Layer is unlike the other three: it styles a dialog, hangs entries off four
 * different menus, and follows edits through Blockbench's own events instead of by wrapping
 * functions. Nothing in the other suites touched any of that, so before this one existed it
 * sat out of every run with "no Blockbench.addCSS" and the green meant nothing about it.
 *
 * What this covers is the thing that actually breaks a bundle: unloading. Four tools in one
 * plugin only works if each gives everything back, and menus are the hard part - an Action
 * added to a menu is NOT removed by Action.delete(), because the menu keeps its own
 * reference in `structure`. Texture.prototype.menu and TextureLayer.prototype.menu are
 * shared singletons whose structure only ever grows, so a leak there survives a reload and
 * leaves a dead entry that opens nothing.
 *
 * What it does not cover: the colour maths (Gradient Map Layer's own eight suites do that,
 * 298 checks, and they still pass against the file in build/src), and the dialog, which
 * needs Vue.
 */
const { loadPlugin, resetProject, settle, TextureLayer, Texture, PathModule } = require('./mock_blockbench');
const { createCanvas, CanvasRenderingContext2D } = require('canvas');

const PLUGIN_PATH = PathModule.resolve(__dirname, '..', 'embodytools.js');

let passes = 0;
let failures = 0;
function check(label, condition, detail) {
	if (condition) { passes++; console.log('  ok   ' + label); }
	else { failures++; console.log('  FAIL ' + label + (detail !== undefined ? ('  -> ' + JSON.stringify(detail)) : '')); }
}
const section = (name) => console.log('\n' + name);

globalThis.CanvasRenderingContext2D = CanvasRenderingContext2D;

// Painter.edit is the seam UnLeaky Layers wraps; the gradient module needs it to exist so
// that all four can be up at once.
globalThis.Painter = {
	current: {},
	lock_alpha: false,
	erase_mode: false,
	edit(texture, callback) {
		const layer = texture.getActiveLayer();
		callback(layer.canvas, { layer, ctx: layer.ctx });
		texture.updateLayerChanges(true);
	},
	startPaintTool() {},
	stopPaintTool() {},
};
globalThis.Toolbox = { selected: { id: 'brush_tool' } };

const GML_EVENTS = ['finish_edit', 'init_edit', 'edit_texture', 'undo', 'redo'];
const MENUS = () => [
	['Tools', MenuBar.menus.tools],
	['Filter', MenuBar.menus.filter],
	['texture', Texture.prototype.menu],
	['layer', TextureLayer.prototype.menu],
];

/** Every menu entry that belongs to the gradient module, across all four menus. */
function gradientEntries() {
	const found = [];
	for (const [name, menu] of MENUS()) {
		for (const entry of menu.structure) {
			const id = entry && entry.id;
			if (id === 'gradient_map_layer' || id === 'gradient_map_layer_repeat') found.push(name + ':' + id);
		}
	}
	return found.sort();
}

function listenerCounts() {
	const counts = {};
	for (const name of GML_EVENTS) counts[name] = Blockbench.listenerCount(name);
	return counts;
}

const registry = loadPlugin(PLUGIN_PATH);
const plugin = registry.embodytools;

(async function run() {
	// =====================================================================
	section('1. all four modules load together');
	resetProject();
	const listeners_before = listenerCounts();
	const css_before = Blockbench.css_handles.length;
	plugin.onload();

	check('the gradient module is not sitting out', !!BarItems.gradient_map_layer,
		Object.keys(BarItems).filter((k) => k.startsWith('gradient')));
	check('and so is Repeat Gradient Map', !!BarItems.gradient_map_layer_repeat);
	check('its dialog stylesheet was added', Blockbench.css_handles.length === css_before + 1);
	check('it is in all four menus', gradientEntries().join(',')
		=== 'Filter:gradient_map_layer,Tools:gradient_map_layer,Tools:gradient_map_layer_repeat,layer:gradient_map_layer,texture:gradient_map_layer'
			.split(',').sort().join(','), gradientEntries());
	for (const name of GML_EVENTS) {
		check(`it is listening for ${name}`, Blockbench.listenerCount(name) > listeners_before[name],
			{ before: listeners_before[name], now: Blockbench.listenerCount(name) });
	}
	// This harness has no transform gizmo, Cube or Vertexsnap, so Anchored Stretch sits
	// out here by design - run_tests_modules.js is where that one is driven.
	check('Delta Layers and UnLeaky Layers are up alongside it',
		!!(settings.delta_layers_persist && settings.lla_enabled), Object.keys(settings));
	check('and Anchored Stretch sat out rather than failing', !settings.anchored_stretch_tool);

	// =====================================================================
	section('2. and all four give everything back');
	const css_handle = Blockbench.css_handles[Blockbench.css_handles.length - 1];
	localStorage.setItem('gradient_map_layer.library', '[{"id":"g1"}]');
	plugin.onunload();

	check('both Actions are gone from BarItems',
		!BarItems.gradient_map_layer && !BarItems.gradient_map_layer_repeat);
	check('no menu entry is left anywhere', gradientEntries().length === 0, gradientEntries());
	check('the stylesheet was taken back', css_handle.deleted === true);
	for (const name of GML_EVENTS) {
		check(`${name} has no listener left`, Blockbench.listenerCount(name) === listeners_before[name],
			{ expected: listeners_before[name], got: Blockbench.listenerCount(name) });
	}
	check('every setting the bundle added is gone',
		!settings.delta_layers_persist && !settings.lla_enabled, Object.keys(settings));
	// Deliberate: the gradient library is the user's, shared with a standalone copy.
	check('the gradient library in localStorage is left alone',
		localStorage.getItem('gradient_map_layer.library') === '[{"id":"g1"}]');

	// =====================================================================
	section('3. loading again does not double anything');
	// The menus are shared singletons, so this is where a leak shows up: a second load
	// after a leaky unload leaves two of every entry, and the reload path in Blockbench's
	// plugin manager does exactly this.
	plugin.onload();
	const after_second = gradientEntries();
	plugin.onunload();
	check('one entry per menu after the second load', after_second.length === 5, after_second);
	check('and nothing left after the second unload', gradientEntries().length === 0, gradientEntries());
	check('no leftover listeners either',
		JSON.stringify(listenerCounts()) === JSON.stringify(listeners_before), listenerCounts());

	// =====================================================================
	section('4. a module that cannot run does not take the gradient module with it');
	const real_addCSS = Blockbench.addCSS;
	Blockbench.addCSS = undefined;
	plugin.onload();
	check('the gradient module sat out', !BarItems.gradient_map_layer);
	check('the others still loaded',
		!!(settings.delta_layers_persist && settings.lla_enabled), Object.keys(settings));
	check('and it left no menu entry behind on the way out', gradientEntries().length === 0, gradientEntries());
	plugin.onunload();
	Blockbench.addCSS = real_addCSS;

	// =====================================================================
	section('5. a gradient module that throws on the way up is cleaned up');
	// addCSS is the first thing its load does and the one thing not wrapped in a try of
	// its own. blocked() only asks whether it is a function, so a throwing one gets past
	// that and fails halfway through load, which is the case worth covering.
	const real_addCSS_throwing = Blockbench.addCSS;
	Blockbench.addCSS = () => { throw new Error('boom'); };
	plugin.onload();
	// The register block calls unload() on a module that throws while loading, so the
	// stylesheet and the Actions it got as far as creating must not survive.
	check('the throwing module is not in the loaded list',
		!BarItems.gradient_map_layer && !BarItems.gradient_map_layer_repeat,
		Object.keys(BarItems).filter((k) => k.startsWith('gradient')));
	check('no menu entry was left from the half-load', gradientEntries().length === 0, gradientEntries());
	check('the others are unaffected',
		!!(settings.delta_layers_persist && settings.lla_enabled), Object.keys(settings));
	plugin.onunload();
	Blockbench.addCSS = real_addCSS_throwing;

	// =====================================================================
	section('6. Delta Layers restores layers under their own uuid');
	// The one hard dependency between these two: Gradient Map Layer remembers what a
	// generated layer was made from in localStorage, keyed by the layer's uuid. If a
	// restore gave layers fresh uuids, every gradient layer would come back as a plain
	// one. Nothing in either plugin states this out loud, so it is pinned here.
	resetProject();
	plugin.onload();
	const texture = new Texture({ name: 'Skin' });
	texture.layers_enabled = true;
	const source_layer = new TextureLayer({ name: 'Value' }, texture);
	source_layer.setSize(16, 16);
	texture.layers.push(source_layer);
	const generated = new TextureLayer({ name: 'Value (gradient)' }, texture);
	generated.setSize(16, 16);
	texture.layers.push(generated);

	const memory_key = 'gradient_map_layer.layers';
	localStorage.setItem(memory_key, JSON.stringify({
		[generated.uuid]: { source: source_layer.uuid, gradient: 'g1' },
	}));

	const saved = texture.layers.map((l) => ({ name: l.name, uuid: l.uuid }));
	check('the generated layer has a uuid to be keyed by',
		typeof generated.uuid === 'string' && generated.uuid.length > 0, generated.uuid);
	const remembered = JSON.parse(localStorage.getItem(memory_key));
	check('and its memory is keyed by exactly that uuid',
		Object.keys(remembered)[0] === generated.uuid, Object.keys(remembered));
	check('which names the layer it was generated from',
		remembered[generated.uuid].source === source_layer.uuid);
	check('uuids are distinct, so two generated layers cannot share memory',
		saved[0].uuid !== saved[1].uuid);
	plugin.onunload();

	await settle(10);
	console.log('\n' + passes + ' passed, ' + failures + ' failed');
	process.exit(failures ? 1 : 0);
})().catch((error) => {
	console.error('\nharness blew up:', error);
	process.exit(1);
});
