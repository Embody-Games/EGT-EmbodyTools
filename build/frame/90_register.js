// ===========================================================================
// ===== REGISTRATION ========================================================
// ===========================================================================
/*
 * One register call for the whole file. Everything below is about getting the three
 * modules up and down independently: a module that cannot run here, or that throws on
 * the way up, is skipped with a line in the console and does not take the others with
 * it.
 */

const MODULES = [DeltaLayersModule, AnchoredStretchModule, UnLeakyLayersModule, GradientMapLayerModule];

/*
 * The standalone plugins each module replaces, for the "you still have that one
 * installed" warning below.
 *
 * Every name a tool has gone by, not just the current one. Trimming this to current names
 * only was a mistake: the whole job of the warning is spotting an older copy still sitting
 * in the plugins folder, and an older copy is exactly the one with an older id. A machine
 * here had embodygames_texture_layer_bridge.js and one_sided_stretch.js enabled next to
 * the bundle and was told nothing.
 *
 * Two layer plugins independently restoring the same texture, and both writing sidecars on
 * save, is the worst of these to have running unnoticed.
 */
const REPLACES = {
	delta_layers: [
		{ id: 'delta_layers', name: 'Delta Layers' },
		{ id: 'embodygames_texture_layer_bridge', name: 'Texture Layers' },
	],
	anchored_stretch: [
		{ id: 'anchored_stretch', name: 'Anchored Stretch' },
		{ id: 'one_sided_stretch', name: 'One-Sided Stretch' },
	],
	unleakylayers: [
		{ id: 'unleakylayers', name: 'UnLeaky Layers' },
		{ id: 'layered_lock_alpha', name: 'Layered Lock Alpha' },
	],
	gradient_map_layer: [
		{ id: 'gradient_map_layer', name: 'Gradient Map Layer' },
	],
};

const TAG = '[embodytools]';
const say = (...args) => console.log(TAG, ...args);
const grumble = (...args) => console.warn(TAG, ...args);

let loaded_modules = [];

/**
 * One of the three plugins this file replaces is still installed. Two copies would
 * fight over the same setting ids and the same texture menu entries, and whichever
 * unloads first takes the other's settings with it.
 *
 * Two signals, because either can be the one that fires depending on load order: a
 * setting id that already exists before we create it can only have come from the old
 * plugin, and Blockbench's own plugin list names it outright even if it loads after us.
 *
 * Not fatal, and not something to fix silently either, so it gets said out loud once.
 */
function checkForLegacyPlugins() {
	const installed = new Set();
	try {
		if (typeof Plugins !== 'undefined' && Plugins.all instanceof Array) {
			for (const plugin of Plugins.all) {
				if (plugin && plugin.installed === true) installed.add(plugin.id);
			}
		}
	} catch (error) { /* plugin list not walkable, the settings check still stands */ }

	const names = [];
	for (const module of MODULES) {
		const previous = REPLACES[module.id] || [];
		if (!previous.length) continue;
		// Named outright by Blockbench's plugin list, whichever of us loaded first.
		const found = previous.filter((plugin) => installed.has(plugin.id));
		// Or, if the list was no help: one of our own setting ids already exists, which
		// can only be the plugin those ids came from. Gradient Map Layer has no settings,
		// so for that one the plugin list is the only signal there is.
		if (!found.length && typeof settings !== 'undefined' && module.settings.length
			&& module.settings.some((id) => !!settings[id])) {
			found.push(previous[0]);
		}
		for (const plugin of found) names.push(plugin.name + ' (' + plugin.id + '.js)');
	}
	if (!names.length) return;
	grumble('these plugins are still installed and do the same job as EmbodyTools:\n  '
		+ names.join('\n  ')
		+ '\nRemove them in Blockbench > Plugins, then reload, or the two copies will '
		+ 'fight over the same settings.');

	if (typeof Blockbench === 'undefined' || !Blockbench.showMessageBox) return;
	// Deferred: onload runs while the plugin list is still being walked.
	setTimeout(() => {
		Blockbench.showMessageBox({
			title: 'EmbodyTools replaces your older plugins',
			icon: 'extension',
			message: 'EmbodyTools contains the same tools as:\n\n'
				+ names.map((name) => '- ' + name).join('\n')
				+ '\n\nThose are still installed. Two copies of the same tool share the same '
				+ 'settings, so please remove the older ones under **Blockbench > Plugins** and '
				+ 'reload. Nothing is lost: your settings are stored per setting, not per plugin.',
			buttons: ['OK'],
		});
	}, 1000);
}

BBPlugin.register(PLUGIN_ID, {
	title: 'EmbodyTools',
	author: 'Embody Games',
	description: 'Embody Games internal toolset. Keeps texture layers alive across saves for '
		+ 'formats that cannot store them, anchors the face you are not dragging when stretching, '
		+ 'and makes Lock Alpha Channel respect every layer.',
	about: [
		'Four tools that used to be four plugins. Each one can be turned off on its own, and each keeps its settings where you would look for it.',
		'',
		'## Delta Layers (Settings > Export)',
		'',
		'Keeps a texture\'s layer stack (image, blend mode, opacity, offset, visibility, order, and 5.2 layer groups) alive across a save and reload for formats whose file has no concept of layers, such as Hytale\'s `.blockymodel`. The model file is never touched: the stack goes in a sidecar next to the texture PNG, `Texture.layers.json` plus a `Texture.layers/` folder with one PNG per layer. Anything that only cares about the model plus flat texture never sees it.',
		'',
		'- Layer PNGs edited in another program are picked up while the project is open, the way Blockbench does it for unlayered textures. Those are the files to open in Photoshop or Aseprite.',
		'- A texture edited outside Blockbench since the stack was saved asks before anything is replaced, and can bring the outside edit back as an extra top layer.',
		'- Save, reload and delete by hand from the texture\'s right-click menu.',
		'- Desktop app only, since it needs real filesystem access.',
		'',
		'## Anchored Stretch (Settings > Edit)',
		'',
		'Blockbench\'s Stretch tool scales cubes around their centre, so both faces on an axis move when you drag one handle. With this the dragged face moves and the opposite face stays put: the cube\'s from/to are repositioned by the same amount the stretched half grew.',
		'',
		'- Since all the growth lands on one face, the applied stretch is halved, so the face you drag tracks at the rate it always did rather than twice as fast.',
		'- **Stretch per Drag Step** sets a fixed step instead of stock\'s snapped-distance maths, so the value lands on round numbers and the tool no longer gets coarser as you zoom out. It defaults to the format\'s base scale: 0.015625 for Hytale characters, 0.03125 for props.',
		'- Hold **Shift** for half a step, **Ctrl** for a quarter, both for an eighth. Hold **Alt** while dragging for centred stretch.',
		'- The Vertex Snap tool gains a **Stretch** mode: pick a corner, pick a target, and the cube stretches to reach it with the opposite corner anchored. Core\'s scale mode is hidden in the Hytale formats because it would break integer sizes; stretching leaves size and UVs alone.',
		'- Next to it, **Resize + Stretch** puts as much of the gap as it can into whole units of size and leaves only the remainder in stretch, so the cube reaches the target without ending up on an odd stretch value.',
		'- **Bake Stretch into Size**, next to the stretch sliders, rolls a cube\'s stretch into whole units of size without moving it on screen. Stretch keeps only the fraction that will not fit in a whole unit.',
		'- Works on the single-axis stretch handles. The plane and uniform handles stay centred, same as with the Resize tool.',
		'- It also fixes the other half of the problem: **resizing** a cube that already has stretch moves the anchored face too, because Blockbench applies the size change to from/to without accounting for the stretch multiplier. The anchored face is now put back where it was, on the gizmo, the size sliders and keyboard nudges alike.',
		'- Only active in formats that support cube stretching, such as the Hytale formats.',
		'',
		'## UnLeaky Layers (Settings > Paint)',
		'',
		'Lock Alpha Channel only looks at the layer you are painting on, so on a fresh layer above your artwork everything is locked and the brush does nothing. This makes it consider the combined alpha of every layer: a pixel is locked only when it is transparent on all of them, and strokes are clipped to the combined silhouette.',
		'',
		'- The eraser works on an upper layer again. Lowering alpha is blocked only where that layer is the only thing holding the pixel up, so erasing above your artwork reveals what is underneath instead of punching a hole in the silhouette.',
		'- Written by quinten.bench.',
		'',
		'## Gradient Map Layer (Tools menu)',
		'',
		'Colourises a value or luminance map through a saved 256x16 gradient ramp, as a new layer that keeps following the layer it was made from. The greyscale stays the thing you paint; the colour is a view of it, the way an adjustment layer works.',
		'',
		'- The generated layer re-renders as you paint on its source, and the result is previewed on the model while the dialog is open. Cancelling puts the texture back.',
		'- Gradients live in a library you build up, importable and exportable as PNG or Photoshop `.grd`, grouped however you like.',
		'- The only one of the four with no Blockbench settings: its library, groups and options are in `localStorage`, so a standalone copy of the plugin shares the same gradients.',
		'- Reachable from the Tools menu, the Filter menu, a texture\'s right-click menu and a layer\'s right-click menu.',
		'- Written by quinten.bench.',
		'',
		'---',
		'',
		'Embody Games internal tool. Source: https://github.com/Embody-Games/EGT-EmbodyTools'
	].join('\n'),
	icon: ICON,
	version: PLUGIN_VERSION,
	tags: ['Texturing', 'Layers', 'Hytale'],
	// Texture Layers needs the desktop app and says so itself; the other two run
	// anywhere, so the plugin as a whole is not desktop-only.
	variant: 'both',
	min_version: '5.0.5',
	// Adds a Changelog tab in the plugin browser. Blockbench reads it from
	// this.path.replace(/\w+\.js$/, 'changelog.json') for a file-loaded plugin, so
	// changelog.json has to sit in the SAME FOLDER as this file.
	has_changelog: true,

	onload() {
		checkForLegacyPlugins();

		loaded_modules = [];
		const skipped = [];
		for (const module of MODULES) {
			let reason = null;
			try {
				reason = module.blocked();
			} catch (error) {
				reason = 'its own availability check threw: ' + error.message;
			}
			if (reason) {
				skipped.push(module.title + ' (' + reason + ')');
				continue;
			}
			try {
				module.load();
				loaded_modules.push(module);
			} catch (error) {
				console.error(TAG, 'could not load ' + module.title, error);
				// Half-loaded is worse than not loaded: give it a chance to clean up.
				try {
					module.unload();
				} catch (cleanup_error) {
					console.error(TAG, 'and could not clean up after it', cleanup_error);
				}
			}
		}

		say('v' + PLUGIN_VERSION + ' ready: ' + (loaded_modules.map((m) => m.title).join(', ') || 'nothing'));
		if (skipped.length) say('not active here: ' + skipped.join(', '));
	},

	onunload() {
		// Reverse order, so a module that wrapped something another one had already
		// wrapped gives it back first.
		for (const module of loaded_modules.slice().reverse()) {
			try {
				module.unload();
			} catch (error) {
				console.error(TAG, 'could not unload ' + module.title, error);
			}
		}
		loaded_modules = [];
		say('unloaded');
	},
});

})();
