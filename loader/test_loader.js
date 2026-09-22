/*
 * Mock harness for the EmbodyTools loader.
 *
 * Proves the loader's own bookkeeping: that enabling a module registers the four kinds of
 * thing, that disabling it gives every one of them back including the menu structure entry,
 * and that toggling repeatedly does not grow anything. This is the spike's checks 7 to 9
 * against our own code. It cannot prove Blockbench accepts the registrations; that still
 * needs the real app.
 */
const fs = require('fs');
const path = require('path');

/*
 * The loader sits next to this file in the repo (loader/embodytools_next.js). Resolved
 * relative to __dirname so `node loader/test_loader.js` works from a clone on any machine;
 * an absolute path here meant the test silently did nothing outside the box it was written in.
 */
const LOADER = path.join(__dirname, 'embodytools_next.js');

// ---- the mock world -------------------------------------------------------
const settings = {};
const actions = {};
const listeners = {};
const cssHandles = [];

class Setting {
	constructor(id, options) {
		this.id = id; Object.assign(this, options);
		if (settings[id]) throw new Error('duplicate setting ' + id);
		settings[id] = this;
	}
	delete() { delete settings[this.id]; }
}

class Action {
	constructor(id, options) {
		this.id = id; Object.assign(this, options);
		if (actions[id]) throw new Error('duplicate action ' + id);
		actions[id] = this;
	}
	delete() { delete actions[this.id]; }
}

class Keybind { constructor(o) { Object.assign(this, o); } }

class Menu {
	constructor() { this.structure = []; }
	addAction(action, path) { this.structure.push(action); }
}

const textureMenu = new Menu();
const Texture = { prototype: { menu: textureMenu } };

/*
 * MenuBar deliberately models Blockbench's awkward shape: removeAction is addressed by
 * path and does nothing when the path does not match, and the per-menu structure array is
 * a separate thing that has to be swept. Making the mock forgiving here would hide exactly
 * the bug this harness is for.
 */
const toolsMenu = new Menu();
const MenuBar = {
	menus: { tools: toolsMenu },
	get entries() { return toolsMenu.structure; },
	addAction(action, path) {
		const menu = this.menus[path] || (this.menus[path] = new Menu());
		menu.addAction(action, path);
	},
	removeAction(path) {
		const parts = String(path).split('.');
		const menu = this.menus[parts[0]];
		if (!menu) return; // wrong path: silently does nothing, as the real one does
	},
};

const Blockbench = {
	isApp: false,
	isOlderThan: () => false,
	showQuickMessage: () => {},
	addCSS(styles) { const h = { styles, deleted: false, delete() { this.deleted = true; } }; cssHandles.push(h); return h; },
	on(event, cb) { (listeners[event] = listeners[event] || []).push(cb); },
	removeListener(event, cb) {
		if (!listeners[event]) return;
		listeners[event] = listeners[event].filter((f) => f !== cb);
		if (!listeners[event].length) delete listeners[event];
	},
};

let registered = null;
const BBPlugin = { register(id, options) { registered = { id, options }; } };

class Dialog { constructor(o) { Object.assign(this, o); } show() {} }

const store = {};
const localStorage = {
	getItem: (k) => (k in store ? store[k] : null),
	setItem: (k, v) => { store[k] = String(v); },
	removeItem: (k) => { delete store[k]; },
};

/*
 * These go on globalThis rather than being passed in as parameters, because that is where
 * Blockbench's own live. A module is evaluated with new Function, whose body sees the
 * global scope and nothing of the enclosing closure, so a mock passed as a parameter would
 * be invisible to modules in a way the real API is not.
 */
Object.assign(globalThis, {
	Blockbench, BBPlugin, Setting, Action, Keybind, Menu, Texture, MenuBar, Dialog,
	localStorage, Plugins: { path: null },
	// Blockbench exposes the settings registry as a global, and the loader's duplicate
	// guard reads it. Leaving it out made the harness disagree with the real app.
	settings,
	Settings: { saveLocalStorages() {} },
});
globalThis.require = undefined;

/*
 * No network from a test. Without this the harness really did fetch REGISTRY_URL, which
 * made it slow, dependent on GitHub being up, and dependent on whether registry.json
 * happened to be pushed yet. Failing immediately exercises the fallback path, which is
 * the behaviour worth pinning anyway: the built-in list is what an offline start uses.
 */
globalThis.fetch = () => Promise.reject(new Error('no network in tests'));

const source = fs.readFileSync(LOADER, 'utf8');
new Function(source)();

// ---- helpers --------------------------------------------------------------
let failures = 0;
function check(label, condition, detail) {
	if (condition) { console.log('  pass  ' + label); }
	else { console.log('  FAIL  ' + label + (detail ? '  -> ' + detail : '')); failures++; }
}
function counts() {
	return {
		settings: Object.keys(settings).length,
		actions: Object.keys(actions).length,
		menuStructure: textureMenu.structure.length,
		menuBar: MenuBar.entries.length,
		listeners: Object.values(listeners).reduce((n, l) => n + l.length, 0),
	};
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SETTLE = 60; // enough for the deferred load chain to finish

// ---- the run --------------------------------------------------------------
(async () => {
	console.log('\nloading the plugin');
	registered.options.onload();
	await sleep(SETTLE);

	const baseline = counts();
	console.log('  baseline ' + JSON.stringify(baseline));
	check('the loader registered its own browser action', !!actions.embodytools_browser);
	check('no module is on before anything is ticked', !settings.demo_module_setting);

	// Reach the loader's toggle the way the card does, through the registered action's
	// module scope. The dialog is not constructible here, so drive state directly.
	const enable = async (on) => {
		localStorage.setItem('embodytools.enabled_modules', JSON.stringify(on ? ['demo_module'] : []));
		registered.options.onunload();
		registered.options.onload();
		await sleep(SETTLE);
	};

	console.log('\nturning the demo module on');
	await enable(true);
	const on = counts();
	console.log('  ' + JSON.stringify(on));
	check('a setting was registered', !!settings.demo_module_setting);
	// Attributed to the loader itself, whatever it is called, rather than to the module:
	// that is what keeps the tools out of Blockbench's plugin list.
	check('the setting is attributed to the loader plugin',
		settings.demo_module_setting && settings.demo_module_setting.plugin === registered.id,
		settings.demo_module_setting && settings.demo_module_setting.plugin);
	check('an action was registered', !!actions.demo_module_action);
	check('the action has a keybind', !!(actions.demo_module_action || {}).keybind);
	check('a texture menu entry was added', textureMenu.structure.length === 1);
	check('an event listener was added', (listeners.select_project || []).length === 1);

	console.log('\nturning it off again');
	await enable(false);
	const off = counts();
	console.log('  ' + JSON.stringify(off));
	check('the setting is gone', !settings.demo_module_setting);
	check('the action is gone', !actions.demo_module_action);
	check('the texture menu structure is clean', textureMenu.structure.length === 0,
		'structure still holds ' + textureMenu.structure.length);
	check('the listener is gone', !(listeners.select_project || []).length);
	check('counts are back to baseline', JSON.stringify(off) === JSON.stringify(baseline),
		JSON.stringify(off) + ' vs ' + JSON.stringify(baseline));

	console.log('\ntoggling ten times');
	for (let i = 0; i < 10; i++) { await enable(true); await enable(false); }
	const after = counts();
	console.log('  ' + JSON.stringify(after));
	check('nothing grew over ten cycles', JSON.stringify(after) === JSON.stringify(baseline),
		JSON.stringify(after) + ' vs ' + JSON.stringify(baseline));

	console.log('\nleaving it on, then unloading the whole plugin');
	await enable(true);
	registered.options.onunload();
	const final = counts();
	console.log('  ' + JSON.stringify(final));
	check('everything is gone after plugin unload',
		final.settings === 0 && final.actions === 0 && final.menuStructure === 0
		&& final.menuBar === 0 && final.listeners === 0, JSON.stringify(final));
	check('the stylesheet was deleted', cssHandles.every((h) => h.deleted));

	console.log('\n' + (failures ? failures + ' FAILED' : 'all checks passed') + '\n');
	process.exit(failures ? 1 : 0);
})();
