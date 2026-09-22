/*
 * EmbodyTools - remote module loader
 * ==================================
 *
 * One Blockbench plugin that loads Embody Games tools from URLs at runtime, so the
 * individual tools never appear in Blockbench's plugin list and a tool can be updated
 * without anyone reinstalling anything.
 *
 * HOW IT FITS TOGETHER
 *
 *   EmbodyTools itself   installed once, from a URL, via Blockbench's own
 *                        "Load Plugin from URL". Blockbench re-fetches it from that
 *                        URL on every launch, so releasing a new version of this file
 *                        reaches everyone without them doing anything.
 *
 *   The modules          plain .js files at their own URLs, listed in REGISTRY below.
 *                        Fetched by us, evaluated with new Function, cached to disk.
 *                        Updating a module means pushing a new file to its URL.
 *                        Adding one means a line in REGISTRY and a release of this file.
 *
 * WHY THE LOADER OWNS REGISTRATION
 *
 * Modules do not call Plugin.register, and they do not create Settings, Actions or menu
 * entries directly. They ask the ctx object for them. Two reasons:
 *
 *   1. Attribution. Everything is created under this plugin's id, so Blockbench sees one
 *      plugin and the tools stay out of the plugin list.
 *   2. Teardown. Every registration is recorded on an undo stack the moment it is made,
 *      so turning a module off gives back exactly what it took, in reverse order, without
 *      trusting the module to remember. Menu entries are the reason this matters:
 *      Action.delete() does not touch a menu's structure array, and Texture.prototype.menu
 *      is a shared singleton that only ever grows. That exact bug shipped in Gradient Map
 *      Layer. With toggles on cards, load and unload happen constantly, so teardown is a
 *      normal-usage path rather than a rare one.
 *
 * A module that throws on the way up is torn down and skipped with a console line. It does
 * not take the others with it.
 */
(function () {
'use strict';

/*
 * Deliberately not 'embodytools' while this is a test build. Blockbench keeps its own copy
 * of an installed plugin at plugins/<id>.js, so a file called embodytools.js loaded next to
 * the installed 1.4.1 gets saved as embodytools-1.js, and then the base name no longer
 * matches the id in Plugin.register and it refuses to load. Its own id sidesteps that and
 * lets 1.4.1 keep working alongside it. Rename both when this actually replaces the bundle.
 */
const PLUGIN_ID = 'embodytools_next';
// Bumped on every deploy during testing, so the plugin page shows at a glance whether the
// running copy is the latest file. If the page does not say this number, Blockbench is
// reading some other file.
const PLUGIN_VERSION = '2.6.0';
const TAG = '[embodytools]';

const say = (...args) => console.log(TAG, ...args);
const grumble = (...args) => console.warn(TAG, ...args);
const complain = (...args) => console.error(TAG, ...args);

// ===========================================================================
// ===== REGISTRY ============================================================
// ===========================================================================
/*
 * The tools this build knows about. `url` is fetched verbatim, so for GitHub use the raw
 * host and a branch or tag you control:
 *
 *   https://raw.githubusercontent.com/Embody-Games/EGT-DeltaLayers/main/module/delta_layers.js
 *
 * Pin to a tag if you want releases to be deliberate; point at a branch if you want every
 * push to reach everyone on next launch. The fetch is unauthenticated, so the repo has to
 * be public. EGT-AnchorStretch, EGT-DeltaLayers, EGT-UnLeakyLayers and EGT-EmbodyTools all
 * are, so any of them can host a module.
 *
 * `id` must match the id the module returns, and is what its cache file and its enabled
 * state are keyed by. Do not recycle an id for a different tool.
 *
 * Everything except id, name and url is presentation for the card, used until the module
 * has actually been fetched, after which the module's own values win.
 */
const REGISTRY = [
	{
		id: 'demo_module',
		name: 'Demo Module',
		author: 'Embody Games',
		description: 'Proves the loader works end to end. Registers a setting, an action with '
			+ 'a keybind, a texture menu entry and an event listener, then gives them all back '
			+ 'when switched off. Delete this entry once the real tools are listed.',
		tags: ['Demo'],
		url: 'embodytools://demo',
	},
	{
		id: 'anchored_stretch',
		name: 'Anchored Stretch',
		author: 'Embody Games',
		description: 'Only the side you drag ever expands. Makes the Stretch tool one-sided '
			+ 'instead of centred, and stops resizing a stretched cube from creeping outward '
			+ 'on the anchored side. Adds a Stretch mode to Vertex Snap.',
		tags: ['Transform', 'Hytale'],
		url: 'https://raw.githubusercontent.com/Embody-Games/EGT-AnchorStretch/main/module/anchored_stretch.js',
	},
	{
		id: 'delta_layers',
		name: 'Delta Layers',
		author: 'Embody Games',
		description: 'Keeps a texture\'s layer stack alive across a save and reload for formats '
			+ 'whose file has no concept of layers, by writing a sidecar next to the texture PNG. '
			+ 'Desktop only.',
		tags: ['Texturing', 'Layers', 'Hytale'],
		url: 'https://raw.githubusercontent.com/Embody-Games/EGT-DeltaLayers/main/module/delta_layers.js',
	},
];

/*
 * Where the registry really comes from. The fetched list REPLACES the array above, which
 * is now only a fallback for a first run with no network and nothing cached.
 *
 * This is the piece that means adding a tool needs no release of this file: commit one
 * more entry to registry.json and every contractor sees the new card on their next start.
 * The last good fetch is cached to disk, so an offline start still shows the cards.
 *
 * Note that the demo module is deliberately absent from the hosted list. It lives in the
 * fallback array for development and disappears the moment the real registry loads.
 */
const REGISTRY_URL = 'https://raw.githubusercontent.com/Embody-Games/EGT-EmbodyTools/main/loader/registry.json';

// How long to wait on the network before falling back to the disk cache.
const FETCH_TIMEOUT_MS = 8000;

// ===========================================================================
// ===== ENVIRONMENT =========================================================
// ===========================================================================

/*
 * Getting at the filesystem.
 *
 * Blockbench evaluates a plugin as
 *   new Function('requireNativeModule', 'require', code)
 * so `require` is a parameter of the function wrapping this file, not a global, and it is
 * not Node's require either. It is permission-gated: asking for 'fs' shows the user a
 * dialog the first time and returns null if they say no. `PathModule` by contrast is a
 * plain global, since joining paths grants nobody anything.
 *
 * Two earlier versions of this got it wrong in opposite directions. The first tested
 * `Blockbench.isApp`, which does not exist (the global is a bare `isApp`), so it never
 * even tried. The second assumed `fs` was a global like PathModule and declared
 * `let fs = null`, which shadowed nothing useful and was null forever.
 *
 * When to prompt, following what Delta Layers does: never for the cache, which is a
 * convenience and can silently not happen, and always for a `file:` module, because the
 * user just asked for a tool that cannot load without it.
 */
const isDesktop = (typeof isApp !== 'undefined') ? !!isApp : false;
const nodePath = (typeof PathModule !== 'undefined' && PathModule) ? PathModule : null;
const nativeRequire = (typeof requireNativeModule === 'function') ? requireNativeModule
	: (typeof require === 'function') ? require : null;

let native_fs = null;
let fs_refused = false;

function getFs(prompt) {
	if (native_fs) return native_fs;
	if (!nativeRequire) return null;
	if (!prompt && fs_refused) return null;
	try {
		const granted = nativeRequire('fs', {
			message: 'EmbodyTools keeps a copy of each tool it downloads so they still work '
				+ 'offline, and can load a tool straight off disk while you are building one.',
			show_permission_dialog: prompt ? undefined : false,
		});
		if (granted) {
			native_fs = granted;
			fs_refused = false;
		} else if (prompt) {
			fs_refused = true;
			grumble('file access was not granted, so tools cannot be cached or read off disk');
		}
		return native_fs;
	} catch (error) {
		complain('could not get file access', error);
		return null;
	}
}

/*
 * Cache directory. A subfolder, deliberately: Blockbench tracks installed plugins in its
 * own list rather than by scanning, but a stray .js sitting directly in the plugins folder
 * is still the sort of thing that gets picked up by hand later and loaded twice.
 */
function cacheDir() {
	const nodeFs = getFs(false);
	if (!nodeFs || !nodePath) return null;
	try {
		const base = (typeof Plugins !== 'undefined' && Plugins.path) ? Plugins.path : null;
		if (!base) return null;
		const dir = nodePath.join(base, 'embodytools_modules');
		if (!nodeFs.existsSync(dir)) nodeFs.mkdirSync(dir, { recursive: true });
		return dir;
	} catch (error) {
		grumble('could not prepare the cache directory', error);
		return null;
	}
}

function readCache(name) {
	const nodeFs = getFs(false);
	const dir = cacheDir();
	if (!nodeFs || !dir) return null;
	try {
		const file = nodePath.join(dir, name);
		if (!nodeFs.existsSync(file)) return null;
		return nodeFs.readFileSync(file, 'utf8');
	} catch (error) {
		return null;
	}
}

function writeCache(name, contents) {
	const nodeFs = getFs(false);
	const dir = cacheDir();
	if (!nodeFs || !dir) return false;
	try {
		nodeFs.writeFileSync(nodePath.join(dir, name), contents, 'utf8');
		return true;
	} catch (error) {
		grumble('could not write the cache for ' + name, error);
		return false;
	}
}

// ===========================================================================
// ===== ENABLED STATE =======================================================
// ===========================================================================
/*
 * Which modules are switched on.
 *
 * One Blockbench Setting per module, rather than a list in localStorage. The setting is
 * the state, not a mirror of it, so there is exactly one place the answer lives and the
 * plugin page and the card browser cannot drift apart.
 *
 * The reason it is settings at all: Blockbench renders a plugin's own settings on its
 * plugin page, so this is what makes the module list show up there natively. The Features
 * tab is generated by Blockbench from what we registered and the About tab is sanitised
 * markdown, so neither can host a control. Settings can.
 *
 * localStorage still holds a copy, purely so the choices survive uninstalling and
 * reinstalling the plugin, which throws the settings away.
 */
const STATE_KEY = 'embodytools.enabled_modules';
const settingIdFor = (id) => 'embodytools_module_' + id;

// Which module checkboxes this load has created. Cleared on unload with everything else.
const made_setting_ids = new Set();

// Set while we are writing a setting ourselves, so our own write does not come back
// through onChange and load the module a second time.
let suppressChange = false;

function readEnabled() {
	const enabled = new Set();
	let anySetting = false;
	for (const descriptor of registry) {
		const setting = typeof settings !== 'undefined' && settings[settingIdFor(descriptor.id)];
		if (!setting) continue;
		anySetting = true;
		if (setting.value) enabled.add(descriptor.id);
	}
	if (anySetting) return enabled;

	// Before the settings exist (first load, or a fresh install), fall back to the copy.
	try {
		const raw = localStorage.getItem(STATE_KEY);
		const list = raw ? JSON.parse(raw) : [];
		return new Set(Array.isArray(list) ? list : []);
	} catch (error) {
		return new Set();
	}
}

function rememberEnabled() {
	try {
		localStorage.setItem(STATE_KEY, JSON.stringify(Array.from(readEnabled())));
	} catch (error) {
		grumble('could not remember which modules are enabled', error);
	}
}

/*
 * A checkbox per module on the plugin's own page. Registered for every module in the
 * registry, on or off, because a module you have not enabled yet still needs somewhere to
 * be enabled from.
 */
function registerModuleSettings() {
	if (!loader) return;
	const remembered = readEnabled();
	let made = 0;
	let existing = 0;
	for (const descriptor of registry) {
		const setting_id = settingIdFor(descriptor.id);
		// Two guards, because this runs twice: once synchronously in onload so the plugin
		// page credits the settings to us, and again after the registry fetch in case it
		// brought new tools. Blockbench's `settings` global is the real check, but leaning
		// on it alone means that if it is ever missing the guard never fires and the second
		// pass throws a duplicate for every id. So we also remember what we made.
		if (made_setting_ids.has(setting_id)) { existing++; continue; }
		if (typeof settings !== 'undefined' && settings[setting_id]) { existing++; continue; }
		try {
			loader.ctx.setting(setting_id, {
				name: descriptor.name || descriptor.id,
				description: descriptor.description || '',
				category: 'general',
				type: 'checkbox',
				value: remembered.has(descriptor.id),
				onChange(value) {
					if (suppressChange) return;
					setEnabled(descriptor.id, !!value);
				},
			});
			made_setting_ids.add(setting_id);
			made++;
		} catch (error) {
			complain('could not add the settings checkbox for ' + descriptor.id, error);
		}
	}
	say('module checkboxes: ' + made + ' added, ' + existing + ' already there'
		+ ' (Settings tab, or Settings > General)');
}

// Put a value into a module's setting without that write bouncing back as a change.
function writeSetting(id, on) {
	const setting = typeof settings !== 'undefined' && settings[settingIdFor(id)];
	if (!setting) return;
	suppressChange = true;
	try {
		setting.value = on;
		if (typeof Settings !== 'undefined' && Settings.saveLocalStorages) Settings.saveLocalStorages();
	} catch (error) {
		grumble('could not write the setting for ' + id, error);
	} finally {
		suppressChange = false;
	}
}

// ===========================================================================
// ===== THE MODULE CONTEXT ==================================================
// ===========================================================================
/*
 * What a module is handed. Everything it registers goes through here so that it can be
 * given back without the module being asked to remember anything.
 *
 * A module looks like this, as plain JS with no Plugin.register anywhere in it:
 *
 *   return {
 *     id: 'my_tool',
 *     title: 'My Tool',
 *     version: '1.0.0',
 *     variant: 'both',            // or 'desktop'
 *     min_version: '5.0.5',
 *     blocked(ctx) { return null },   // a reason string to sit this one out, or null
 *     load(ctx) { ... },
 *     unload() { ... }            // optional, for anything ctx could not track
 *   };
 */
/*
 * The sweep that Action.delete() does not do. A menu's structure array holds the entry
 * independently of the action registry, so deleting the action leaves a dead entry behind
 * and re-adding it later leaves two. Every menu we touch gets swept by id.
 */
function removeFromMenuStructure(menu, actionId) {
	if (!menu || !Array.isArray(menu.structure)) return;
	for (let i = menu.structure.length - 1; i >= 0; i--) {
		const entry = menu.structure[i];
		const entryId = typeof entry === 'string' ? entry : (entry && entry.id);
		if (entryId === actionId) menu.structure.splice(i, 1);
	}
}

function createContext(id) {
	// Undone in reverse, so a patch that wrapped something another registration depends on
	// comes off before the thing underneath it.
	const undo = [];
	const record = (label, fn) => undo.push({ label, fn });

	const ctx = {
		id: id,
		plugin: PLUGIN_ID,
		version: PLUGIN_VERSION,

		// A Blockbench setting, attributed to EmbodyTools rather than to the module, since
		// as far as Blockbench is concerned the module does not exist.
		setting(setting_id, options) {
			const setting = new Setting(setting_id, Object.assign({ plugin: PLUGIN_ID }, options));
			record('setting ' + setting_id, () => setting.delete());
			return setting;
		},

		// An action. Pass `keybind` in options the usual way; it comes off with the action.
		action(action_id, options) {
			const action = new Action(action_id, options);
			record('action ' + action_id, () => action.delete());
			return action;
		},

		// Put an action in a menu. This is the one that leaks if you do it by hand:
		// Action.delete() leaves the menu's structure array untouched.
		menu(menu, action, path) {
			const action_id = typeof action === 'string' ? action : action.id;
			if (menu && typeof menu.addAction === 'function') {
				menu.addAction(action, path);
			}
			record('menu entry ' + action_id, () => removeFromMenuStructure(menu, action_id));
			return action;
		},

		/*
		 * A menu bar entry, e.g. ctx.menuBar(action, 'tools').
		 *
		 * Both halves are needed. MenuBar.removeAction is the supported way in, but it is
		 * addressed by path and silently does nothing if the path is not what it expects,
		 * which is how a toggled module grows a duplicate entry every cycle. The sweep
		 * afterwards is what actually guarantees the entry is gone.
		 */
		menuBar(action, path) {
			const action_id = typeof action === 'string' ? action : action.id;
			if (typeof MenuBar !== 'undefined' && MenuBar.addAction) {
				MenuBar.addAction(action, path);
			}
			record('menu bar entry ' + action_id, () => {
				if (typeof MenuBar === 'undefined') return;
				try {
					if (MenuBar.removeAction) {
						MenuBar.removeAction(path ? path + '.' + action_id : action_id);
					}
				} catch (error) { /* swept below regardless */ }
				try {
					const menu = MenuBar.menus && path ? MenuBar.menus[path] : null;
					if (menu) removeFromMenuStructure(menu, action_id);
				} catch (error) { /* nothing more to try */ }
			});
			return action;
		},

		on(event, callback) {
			Blockbench.on(event, callback);
			record('listener on ' + event, () => Blockbench.removeListener(event, callback));
			return callback;
		},

		// Monkey-patch something and have the original put back on unload. Returns the
		// original so the replacement can call through to it.
		patch(target, key, wrap) {
			const original = target[key];
			target[key] = wrap(original);
			record('patch of ' + key, () => { target[key] = original; });
			return original;
		},

		css(styles) {
			const handle = Blockbench.addCSS(styles);
			record('stylesheet', () => { try { handle.delete(); } catch (error) { /* gone already */ } });
			return handle;
		},

		/*
		 * Append a line to plugins/embodytools_modules/debug.log. For working out what a
		 * module is doing when the dev console is not to hand. Best-effort and silent:
		 * a module must never break because logging failed.
		 */
		log(...parts) {
			try {
				const nodeFs = getFs(false);
				const dir = cacheDir();
				if (!nodeFs || !dir) return;
				const line = '[' + new Date().toISOString() + '] ' + id + ' ' + parts.map((p) => {
					if (typeof p === 'string') return p;
					try { return JSON.stringify(p); } catch (error) { return String(p); }
				}).join(' ') + '\n';
				nodeFs.appendFileSync(nodePath.join(dir, 'debug.log'), line, 'utf8');
			} catch (error) { /* logging must never be the thing that breaks a tool */ }
		},

		// Anything the helpers above do not cover.
		cleanup(label, fn) {
			record(typeof label === 'string' ? label : 'cleanup', typeof label === 'function' ? label : fn);
		},
	};

	const teardown = () => {
		for (const step of undo.slice().reverse()) {
			try {
				step.fn();
			} catch (error) {
				complain('could not give back ' + step.label + ' from ' + id, error);
			}
		}
		undo.length = 0;
	};

	return { ctx, teardown };
}

// ===========================================================================
// ===== FETCHING AND EVALUATING =============================================
// ===========================================================================

// Built-in demo module, so the whole path can be exercised before anything is hosted.
const DEMO_SOURCE = `
return {
	id: 'demo_module',
	title: 'Demo Module',
	version: '1.0.0',
	variant: 'both',
	description: 'Loader self-test. Registers one of each kind of thing and gives them all back.',
	blocked: function (ctx) { return null; },
	load: function (ctx) {
		ctx.setting('demo_module_setting', {
			name: 'Demo Module enabled a setting',
			description: 'Created by a module the loader fetched and evaluated at runtime.',
			category: 'general',
			type: 'checkbox',
			value: false
		});

		var action = ctx.action('demo_module_action', {
			name: 'Demo Module Action',
			icon: 'science',
			keybind: new Keybind({ key: 74, ctrl: true, shift: true }),
			click: function () { Blockbench.showQuickMessage('Demo Module action fired'); }
		});
		ctx.menuBar(action, 'tools');

		var entry = ctx.action('demo_module_menu_entry', {
			name: 'Demo Module Entry',
			icon: 'science',
			click: function (texture) {
				Blockbench.showQuickMessage('Demo Module entry on ' + (texture && texture.name));
			}
		});
		if (typeof Texture !== 'undefined' && Texture.prototype && Texture.prototype.menu) {
			ctx.menu(Texture.prototype.menu, entry, 'edit');
		}

		ctx.on('select_project', function () { console.log('[demo_module] select_project'); });
	},
	unload: function () {}
};
`;

async function fetchSource(descriptor) {
	const cache_name = descriptor.id + '.js';

	if (descriptor.url === 'embodytools://demo') {
		return { source: DEMO_SOURCE, origin: 'built in' };
	}

	/*
	 * A module read straight off disk, for working on one before it is hosted anywhere.
	 * `file:C:/path/to/module.js`. Desktop only, and not something to ship in a registry
	 * anyone else uses, since the path is only true on one machine.
	 */
	if (descriptor.url.indexOf('file:') === 0) {
		const nodeFs = getFs(true);
		if (!nodeFs) throw new Error('file access was declined, so this tool cannot be read off disk');
		const local = descriptor.url.slice('file:'.length);
		if (!nodeFs.existsSync(local)) throw new Error('no file at ' + local);
		return { source: nodeFs.readFileSync(local, 'utf8'), origin: 'local file' };
	}

	// Cache-busted, because the whole point is that pushing a new file reaches people. The
	// disk cache is what makes an offline start work, not the HTTP cache.
	const url = descriptor.url + (descriptor.url.includes('?') ? '&' : '?') + 'v=' + Date.now();

	try {
		const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
		const timer = controller ? setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS) : null;
		const response = await fetch(url, controller ? { signal: controller.signal } : undefined);
		if (timer) clearTimeout(timer);
		if (!response.ok) throw new Error('HTTP ' + response.status);
		const source = await response.text();
		if (!source || !source.trim()) throw new Error('empty response');
		writeCache(cache_name, source);
		return { source: source, origin: 'network' };
	} catch (error) {
		const cached = readCache(cache_name);
		if (cached) {
			grumble('could not fetch ' + descriptor.id + ', using the cached copy', error.message);
			return { source: cached, origin: 'cache' };
		}
		throw error;
	}
}

/*
 * Turn source into a module object. The same thing Blockbench does to every plugin it
 * loads, one level further in: this is a function body, so a module ends with `return {...}`
 * and anything it declares stays inside its own scope.
 */
function evaluateModule(source, ctx) {
	const factory = new Function('ctx', source);
	const module = factory(ctx);
	if (!module || typeof module !== 'object') {
		throw new Error('the module did not return an object');
	}
	if (typeof module.load !== 'function') {
		throw new Error('the module has no load()');
	}
	return module;
}

function versionBlocked(module) {
	if (module.variant === 'desktop' && !isDesktop) return 'desktop app only';
	if (module.variant === 'web' && isDesktop) return 'web app only';
	if (module.min_version && typeof Blockbench.isOlderThan === 'function'
		&& Blockbench.isOlderThan(module.min_version)) {
		return 'needs Blockbench ' + module.min_version + ' or newer';
	}
	return null;
}

// ===========================================================================
// ===== THE LOADER ==========================================================
// ===========================================================================

// id -> { descriptor, module, ctx, teardown, status, detail, origin }
const live = new Map();
let registry = REGISTRY.slice();

function stateOf(id) {
	const entry = live.get(id);
	if (!entry) return { status: 'off', detail: '' };
	return { status: entry.status, detail: entry.detail || '', origin: entry.origin || '' };
}

async function loadModule(descriptor) {
	if (live.has(descriptor.id)) return live.get(descriptor.id);

	const entry = { descriptor, status: 'loading', detail: '', origin: '' };
	live.set(descriptor.id, entry);

	let created = null;
	try {
		const fetched = await fetchSource(descriptor);
		entry.origin = fetched.origin;

		created = createContext(descriptor.id);
		const module = evaluateModule(fetched.source, created.ctx);
		entry.module = module;
		entry.ctx = created.ctx;
		entry.teardown = created.teardown;

		const unavailable = versionBlocked(module);
		if (unavailable) {
			entry.status = 'blocked';
			entry.detail = unavailable;
			created.teardown();
			return entry;
		}

		let reason = null;
		if (typeof module.blocked === 'function') {
			try {
				reason = module.blocked(created.ctx);
			} catch (error) {
				reason = 'its own availability check threw: ' + error.message;
			}
		}
		if (reason) {
			entry.status = 'blocked';
			entry.detail = reason;
			created.teardown();
			return entry;
		}

		module.load(created.ctx);
		entry.status = 'on';
		say('loaded ' + (module.title || descriptor.id) + ' (' + fetched.origin + ')');
	} catch (error) {
		entry.status = 'error';
		entry.detail = error.message || String(error);
		complain('could not load ' + descriptor.id, error);
		// Half-loaded is worse than not loaded.
		if (created) {
			try { created.teardown(); } catch (cleanup_error) { complain('and could not clean up', cleanup_error); }
		}
	}
	return entry;
}

function unloadModule(id) {
	const entry = live.get(id);
	if (!entry) return;
	try {
		// The module's own unload first, for anything ctx could not track, then the
		// tracked stack. A module that throws here still gets its registrations back.
		if (entry.module && typeof entry.module.unload === 'function') entry.module.unload();
	} catch (error) {
		complain('unload() of ' + id + ' threw', error);
	}
	try {
		if (entry.teardown) entry.teardown();
	} catch (error) {
		complain('could not tear down ' + id, error);
	}
	live.delete(id);
	say('unloaded ' + id);
}

async function setEnabled(id, on) {
	const descriptor = registry.find((entry) => entry.id === id);
	if (!descriptor) return;

	writeSetting(id, on);
	if (on) {
		await loadModule(descriptor);
	} else {
		unloadModule(id);
	}
	rememberEnabled();
}

/*
 * Accepts either a bare array of tools or `{version, tools: [...]}`. The wrapped form is
 * what registry.json uses, because it leaves room for a version and for comments; the bare
 * array is accepted so an older cached copy still parses.
 */
function parseRegistry(parsed) {
	const list = Array.isArray(parsed) ? parsed
		: (parsed && Array.isArray(parsed.tools)) ? parsed.tools
		: [];
	// Anything without an id and a url is unusable and would only produce a broken card.
	return list.filter((entry) => entry && typeof entry.id === 'string' && typeof entry.url === 'string');
}

async function fetchRegistry() {
	if (!REGISTRY_URL) return;
	try {
		const url = REGISTRY_URL + (REGISTRY_URL.includes('?') ? '&' : '?') + 'v=' + Date.now();
		const response = await fetch(url);
		if (!response.ok) throw new Error('HTTP ' + response.status);
		const list = parseRegistry(await response.json());
		if (list.length) {
			registry = list;
			writeCache('registry.json', JSON.stringify(list));
			return;
		}
		throw new Error('the registry was empty or not a list');
	} catch (error) {
		const cached = readCache('registry.json');
		if (cached) {
			try {
				const list = parseRegistry(JSON.parse(cached));
				if (list.length) {
					registry = list;
					grumble('could not fetch the registry, using the cached copy', error.message);
					return;
				}
			} catch (parse_error) { /* fall through to the built-in list */ }
		}
		grumble('could not fetch the registry, using the built-in list', error.message);
	}
}

async function loadEnabledModules() {
	const enabled = readEnabled();
	for (const descriptor of registry) {
		if (enabled.has(descriptor.id)) {
			await loadModule(descriptor);
		}
	}
	const on = Array.from(live.values()).filter((entry) => entry.status === 'on');
	say('v' + PLUGIN_VERSION + ' ready: ' + (on.map((e) => e.descriptor.name || e.descriptor.id).join(', ') || 'no modules enabled'));
}

function unloadAll() {
	for (const id of Array.from(live.keys())) unloadModule(id);
}

// ===========================================================================
// ===== THE CARD BROWSER ====================================================
// ===========================================================================

const BROWSER_CSS = `
.et-browser { display: flex; flex-direction: column; gap: 14px; min-height: 260px; }
.et-bar { display: flex; align-items: center; gap: 10px; }
.et-search {
	flex: 1; padding: 7px 11px; border-radius: 6px;
	background: var(--color-back); color: var(--color-text);
	border: 1px solid var(--color-border); font-size: 13px;
}
.et-search:focus { outline: none; border-color: var(--color-accent); }
.et-refresh {
	padding: 7px 13px; border-radius: 6px; cursor: pointer; white-space: nowrap;
	background: var(--color-button); color: var(--color-text);
	border: 1px solid var(--color-border); font-size: 13px;
}
.et-refresh:hover { background: var(--color-selected); }
.et-grid {
	display: grid; gap: 12px; overflow-y: auto; max-height: 62vh; padding: 2px;
	grid-template-columns: repeat(auto-fill, minmax(268px, 1fr));
}
.et-card {
	display: flex; flex-direction: column; gap: 9px; padding: 14px;
	background: var(--color-ui); border: 1px solid var(--color-border);
	border-radius: 9px; transition: border-color .15s ease, transform .15s ease;
}
.et-card:hover { border-color: var(--color-accent); transform: translateY(-1px); }
.et-card.et-on { border-color: var(--color-accent); }
.et-head { display: flex; align-items: flex-start; gap: 10px; }
.et-icon {
	flex: none; width: 34px; height: 34px; border-radius: 8px;
	display: grid; place-items: center;
	background: var(--color-accent); color: var(--color-accent_text);
	font-weight: 700; font-size: 15px; text-transform: uppercase;
}
.et-titles { flex: 1; min-width: 0; }
.et-name {
	font-weight: 600; font-size: 14px; color: var(--color-text);
	white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.et-meta { font-size: 11px; color: var(--color-subtle_text); margin-top: 2px; }
.et-desc {
	font-size: 12px; line-height: 1.45; color: var(--color-subtle_text);
	display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical;
	overflow: hidden; min-height: 51px;
}
.et-tags { display: flex; flex-wrap: wrap; gap: 5px; }
.et-tag {
	font-size: 10px; padding: 2px 7px; border-radius: 20px;
	background: var(--color-back); color: var(--color-subtle_text);
	border: 1px solid var(--color-border);
}
.et-foot {
	display: flex; align-items: center; justify-content: space-between; gap: 8px;
	margin-top: auto; padding-top: 9px; border-top: 1px solid var(--color-border);
}
.et-status { font-size: 11px; color: var(--color-subtle_text); flex: 1; min-width: 0;
	overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.et-status.et-bad { color: #e5533d; }
.et-status.et-good { color: var(--color-accent); }
/*
 * Every dimension is pinned and the native appearance stripped, because Blockbench
 * styles bare <button> elements inside its own pages (min-width among them). Left to
 * itself this stretched into a long pill while the knob still travelled only 18px, so
 * it never reached the right-hand end.
 */
.et-switch {
	flex: 0 0 40px; width: 40px; min-width: 40px; max-width: 40px;
	height: 22px; min-height: 22px; box-sizing: border-box;
	border: none; padding: 0; margin: 0; border-radius: 22px;
	cursor: pointer; position: relative; background: var(--color-border);
	appearance: none; -webkit-appearance: none;
	transition: background .18s ease;
}
.et-switch[disabled] { opacity: .45; cursor: default; }
.et-switch.et-switch-on { background: var(--color-accent); }
.et-knob {
	position: absolute; top: 3px; left: 3px; width: 16px; height: 16px;
	box-sizing: border-box; border-radius: 50%; background: #fff;
	transition: left .18s ease;
}
/* 40 width - 16 knob - 3 inset = 21, so the gap matches the 3px on the other end. */
.et-switch-on .et-knob { left: 21px; }
.et-empty { padding: 34px; text-align: center; color: var(--color-subtle_text); font-size: 13px; }
.et-foot-note { font-size: 11px; color: var(--color-subtle_text); }

/* The same cards, embedded in Blockbench's own plugin page rather than in a dialog. */
.et-page { padding: 14px 0 4px 0; }
.et-page .et-grid { max-height: none; }
#et_page_tab { cursor: pointer; }
`;

function openBrowser() {
	const dialog = new Dialog({
		id: 'embodytools_browser',
		title: 'EmbodyTools ' + PLUGIN_VERSION,
		width: 940,
		buttons: ['Close'],
		component: {
			data() {
				return { query: '', tick: 0, busy: {} };
			},
			computed: {
				cards() {
					// `tick` is read so that Vue recomputes after a toggle changes live state.
					void this.tick;
					const enabled = readEnabled();
					const query = this.query.trim().toLowerCase();
					return registry
						.filter((descriptor) => {
							if (!query) return true;
							return (descriptor.name + ' ' + (descriptor.description || '') + ' '
								+ (descriptor.tags || []).join(' ')).toLowerCase().includes(query);
						})
						.map((descriptor) => {
							const entry = live.get(descriptor.id);
							const module = entry && entry.module;
							const state = stateOf(descriptor.id);
							return {
								id: descriptor.id,
								name: (module && module.title) || descriptor.name || descriptor.id,
								author: descriptor.author || 'Embody Games',
								version: (module && module.version) || descriptor.version || '',
								description: (module && module.description) || descriptor.description || '',
								tags: descriptor.tags || [],
								initial: ((descriptor.name || descriptor.id)[0] || '?'),
								on: enabled.has(descriptor.id),
								status: state.status,
								detail: state.detail,
								origin: state.origin,
							};
						});
				},
			},
			methods: {
				statusText(card) {
					if (this.busy[card.id]) return 'working...';
					if (card.status === 'error') return 'failed: ' + card.detail;
					if (card.status === 'blocked') return card.detail;
					if (card.status === 'on') return card.origin === 'cache' ? 'on (cached copy)' : 'on';
					return 'off';
				},
				statusClass(card) {
					if (card.status === 'error') return 'et-bad';
					if (card.status === 'on') return 'et-good';
					return '';
				},
				async toggle(card) {
					if (this.busy[card.id]) return;
					this.$set(this.busy, card.id, true);
					this.tick++;
					try {
						await setEnabled(card.id, !card.on);
					} finally {
						this.$set(this.busy, card.id, false);
						this.tick++;
					}
				},
				async refresh() {
					// Re-fetch everything that is on, so a pushed update lands without a restart.
					const enabled = Array.from(readEnabled());
					for (const id of enabled) unloadModule(id);
					await fetchRegistry();
					for (const id of enabled) {
						const descriptor = registry.find((entry) => entry.id === id);
						if (descriptor) await loadModule(descriptor);
					}
					this.tick++;
					Blockbench.showQuickMessage('EmbodyTools refreshed');
				},
			},
			template: `
				<div class="et-browser">
					<div class="et-bar">
						<input class="et-search" v-model="query" placeholder="Search tools..." />
						<button class="et-refresh" @click="refresh">Refresh</button>
					</div>
					<div class="et-grid" v-if="cards.length">
						<div v-for="card in cards" :key="card.id"
							class="et-card" :class="{ 'et-on': card.status === 'on' }">
							<div class="et-head">
								<div class="et-icon">{{ card.initial }}</div>
								<div class="et-titles">
									<div class="et-name">{{ card.name }}</div>
									<div class="et-meta">
										{{ card.author }}<span v-if="card.version"> &middot; v{{ card.version }}</span>
									</div>
								</div>
							</div>
							<div class="et-desc">{{ card.description }}</div>
							<div class="et-tags" v-if="card.tags.length">
								<span class="et-tag" v-for="tag in card.tags" :key="tag">{{ tag }}</span>
							</div>
							<div class="et-foot">
								<span class="et-status" :class="statusClass(card)" :title="statusText(card)">
									{{ statusText(card) }}
								</span>
								<button class="et-switch" :class="{ 'et-switch-on': card.on }"
									:disabled="busy[card.id]" @click="toggle(card)">
									<span class="et-knob"></span>
								</button>
							</div>
						</div>
					</div>
					<div class="et-empty" v-else>
						Nothing matches that.
					</div>
					<div class="et-foot-note">
						Tools load from their own URLs and update on their own. Switching one off gives
						back everything it registered.
					</div>
				</div>
			`,
		},
	});
	dialog.show();
	return dialog;
}

// ===========================================================================
// ===== CARDS ON THE PLUGIN PAGE ============================================
// ===========================================================================
/*
 * Blockbench gives a plugin no way to put its own UI on its plugin page. The Features tab
 * is generated from what we registered, and About is markdown run through DOMPurify, which
 * strips anything clickable. So this reaches into the page's DOM directly.
 *
 * How it works. Blockbench's plugin page renders a tab bar with a stable id,
 * `#plugin_browser_page_tab_bar`, and every built-in tab body is shown by comparing a Vue
 * value called `page_tab` against its own name. Set `page_tab` to a name none of them use
 * and they all hide, which leaves the space free. So we add a tab of our own, point
 * `page_tab` at it, and draw the cards underneath.
 *
 * This is unsupported and it is held together by a MutationObserver: Vue re-renders the bar
 * whenever the tab changes and wipes our additions, so we put them back. Plain DOM rather
 * than a Vue component, deliberately, so there is no second reactivity system to fight.
 * If Blockbench changes that id or the `page_tab` scheme this stops working, and the whole
 * thing is wrapped so that when it breaks it breaks quietly and the dialog still opens.
 */
const PAGE_TAB = 'embodytools_modules';
let page_observer = null;
let page_sync_queued = false;

// Walk up from an element to the Vue view-model that owns `selected_plugin`.
function pluginPageVue() {
	const bar = document.getElementById('plugin_browser_page_tab_bar');
	if (!bar) return null;
	let node = bar;
	while (node) {
		if (node.__vue__) {
			let vm = node.__vue__;
			while (vm) {
				if (vm.selected_plugin !== undefined) return vm;
				vm = vm.$parent;
			}
		}
		node = node.parentElement;
	}
	return null;
}

function buildCardPanel(vm) {
	const panel = document.createElement('div');
	panel.id = 'et_page_panel';
	panel.className = 'et-browser et-page';

	const bar = document.createElement('div');
	bar.className = 'et-bar';
	const search = document.createElement('input');
	search.className = 'et-search';
	search.placeholder = 'Search tools...';
	const refresh = document.createElement('button');
	refresh.className = 'et-refresh';
	refresh.textContent = 'Refresh';
	bar.appendChild(search);
	bar.appendChild(refresh);

	const grid = document.createElement('div');
	grid.className = 'et-grid';

	const draw = () => {
		const query = search.value.trim().toLowerCase();
		grid.innerHTML = '';
		const enabled = readEnabled();
		const shown = registry.filter((d) => !query
			|| ((d.name || '') + ' ' + (d.description || '') + ' ' + (d.tags || []).join(' '))
				.toLowerCase().includes(query));
		if (!shown.length) {
			const empty = document.createElement('div');
			empty.className = 'et-empty';
			empty.textContent = 'Nothing matches that.';
			grid.appendChild(empty);
			return;
		}
		for (const descriptor of shown) {
			const entry = live.get(descriptor.id);
			const module = entry && entry.module;
			const state = stateOf(descriptor.id);
			const on = enabled.has(descriptor.id);

			const card = document.createElement('div');
			card.className = 'et-card' + (state.status === 'on' ? ' et-on' : '');

			const head = document.createElement('div');
			head.className = 'et-head';
			const icon = document.createElement('div');
			icon.className = 'et-icon';
			icon.textContent = ((descriptor.name || descriptor.id)[0] || '?');
			const titles = document.createElement('div');
			titles.className = 'et-titles';
			const name = document.createElement('div');
			name.className = 'et-name';
			name.textContent = (module && module.title) || descriptor.name || descriptor.id;
			const meta = document.createElement('div');
			meta.className = 'et-meta';
			const version = (module && module.version) || descriptor.version || '';
			meta.textContent = (descriptor.author || 'Embody Games') + (version ? ' · v' + version : '');
			titles.appendChild(name);
			titles.appendChild(meta);
			head.appendChild(icon);
			head.appendChild(titles);

			const desc = document.createElement('div');
			desc.className = 'et-desc';
			desc.textContent = (module && module.description) || descriptor.description || '';

			const tags = document.createElement('div');
			tags.className = 'et-tags';
			for (const tag of (descriptor.tags || [])) {
				const chip = document.createElement('span');
				chip.className = 'et-tag';
				chip.textContent = tag;
				tags.appendChild(chip);
			}

			const foot = document.createElement('div');
			foot.className = 'et-foot';
			const status = document.createElement('span');
			status.className = 'et-status'
				+ (state.status === 'error' ? ' et-bad' : (state.status === 'on' ? ' et-good' : ''));
			status.textContent = state.status === 'error' ? 'failed: ' + state.detail
				: state.status === 'blocked' ? state.detail
				: state.status === 'on' ? (state.origin === 'cache' ? 'on (cached copy)' : 'on')
				: 'off';
			const toggle = document.createElement('button');
			toggle.className = 'et-switch' + (on ? ' et-switch-on' : '');
			const knob = document.createElement('span');
			knob.className = 'et-knob';
			toggle.appendChild(knob);
			toggle.addEventListener('click', async () => {
				toggle.disabled = true;
				status.textContent = 'working...';
				try {
					await setEnabled(descriptor.id, !on);
				} finally {
					draw();
				}
			});
			foot.appendChild(status);
			foot.appendChild(toggle);

			card.appendChild(head);
			card.appendChild(desc);
			if (tags.childNodes.length) card.appendChild(tags);
			card.appendChild(foot);
			grid.appendChild(card);
		}
	};

	search.addEventListener('input', draw);
	refresh.addEventListener('click', async () => {
		refresh.disabled = true;
		refresh.textContent = 'Refreshing...';
		try {
			const on = Array.from(readEnabled());
			for (const id of on) unloadModule(id);
			await fetchRegistry();
			registerModuleSettings();
			for (const id of on) {
				const descriptor = registry.find((e) => e.id === id);
				if (descriptor) await loadModule(descriptor);
			}
		} finally {
			refresh.disabled = false;
			refresh.textContent = 'Refresh';
			draw();
		}
	});

	panel.appendChild(bar);
	panel.appendChild(grid);
	draw();
	return panel;
}

function syncPluginPage() {
	const bar = document.getElementById('plugin_browser_page_tab_bar');
	const stale = document.getElementById('et_page_panel');
	if (!bar) {
		if (stale) stale.remove();
		return;
	}
	const vm = pluginPageVue();
	const ours = vm && vm.selected_plugin && vm.selected_plugin.id === PLUGIN_ID;
	if (!ours) {
		if (stale) stale.remove();
		const tab = document.getElementById('et_page_tab');
		if (tab) tab.remove();
		return;
	}

	// Our tab in Blockbench's own tab bar.
	let tab = document.getElementById('et_page_tab');
	if (!tab || tab.parentElement !== bar) {
		if (tab) tab.remove();
		tab = document.createElement('li');
		tab.id = 'et_page_tab';
		tab.textContent = 'Tools';
		tab.addEventListener('click', () => {
			vm.page_tab = PAGE_TAB;
			queuePageSync();
		});
		bar.appendChild(tab);
	}
	const active = vm.page_tab === PAGE_TAB;
	tab.className = active ? 'selected' : '';

	if (!active) {
		if (stale) stale.remove();
		return;
	}
	if (stale && stale.previousElementSibling === bar) return; // already in place
	if (stale) stale.remove();
	bar.parentNode.insertBefore(buildCardPanel(vm), bar.nextSibling);
}

// Vue rewrites the tab bar on every tab change, so we watch and put ourselves back.
// Debounced through a microtask, since our own insertion also trips the observer.
function queuePageSync() {
	if (page_sync_queued) return;
	page_sync_queued = true;
	Promise.resolve().then(() => {
		page_sync_queued = false;
		try { syncPluginPage(); } catch (error) { /* stay quiet, the dialog still works */ }
	});
}

function watchPluginPage() {
	if (page_observer || typeof MutationObserver === 'undefined') return;
	page_observer = new MutationObserver(queuePageSync);
	page_observer.observe(document.body, { childList: true, subtree: true });
}

function unwatchPluginPage() {
	if (page_observer) {
		page_observer.disconnect();
		page_observer = null;
	}
	if (typeof document === 'undefined') return;
	for (const id of ['et_page_panel', 'et_page_tab']) {
		const node = document.getElementById(id);
		if (node) node.remove();
	}
}

// ===========================================================================
// ===== REGISTRATION ========================================================
// ===========================================================================

/*
 * The loader registers its own things through the same context the modules get, rather
 * than by hand. The first version of this file did it by hand and leaked a menu bar entry
 * on every reload, which is precisely the bug the context exists to prevent. If it is good
 * enough for the modules it is good enough for us.
 */
let loader = null;

const registrar = (typeof BBPlugin !== 'undefined') ? BBPlugin : Plugin;

registrar.register(PLUGIN_ID, {
	title: 'EmbodyTools (next)',
	author: 'Embody Games',
	description: 'Embody Games internal toolset. Tools load from their own URLs and are '
		+ 'switched on and off from a list inside the plugin.',
	icon: 'extension',
	version: PLUGIN_VERSION,
	tags: ['Texturing', 'Layers', 'Hytale'],
	variant: 'both',
	min_version: '5.0.5',

	onload() {
		loader = createContext(PLUGIN_ID);
		loader.ctx.css(BROWSER_CSS);

		const action = loader.ctx.action('embodytools_browser', {
			name: 'EmbodyTools',
			description: 'Browse and switch on Embody Games tools',
			icon: 'extension',
			click: () => openBrowser(),
		});

		// Same call Gradient Map Layer uses, which is known to work in this Blockbench.
		loader.ctx.menuBar(action, 'tools');

		// Deferred so that the plugin list has settled and a slow network does not hold up
		// Blockbench's own startup.
		/*
		 * Synchronously, inside onload, for the built-in registry. Blockbench builds a
		 * plugin's Features list from what it registered while loading, so anything
		 * created later in a setTimeout is not credited to the plugin even when it passes
		 * the right plugin id. Whatever the remote registry adds gets its checkbox below.
		 */
		watchPluginPage();
		loader.ctx.cleanup('plugin page cards', unwatchPluginPage);

		try {
			registerModuleSettings();
		} catch (error) {
			complain('could not add the module checkboxes', error);
		}

		setTimeout(async () => {
			await fetchRegistry();
			registerModuleSettings();
			await loadEnabledModules();
		}, 0);
	},

	onunload() {
		unloadAll();
		made_setting_ids.clear();
		if (loader) {
			loader.teardown();
			loader = null;
		}
		say('unloaded');
	},
});

})();
