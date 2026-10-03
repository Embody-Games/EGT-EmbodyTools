/*
 * EmbodyTools - remote module loader
 * ==================================
 *
 * The release build. Embody Games makes it from its working copy and publishes it here,
 * so a change made straight to this file is lost at the next release.
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

// Must match the filename, embodytools.js: Blockbench works a plugin's id out from it. It is
// the 1.x bundle's id, so installing from the bundle's link replaces the bundle.
const PLUGIN_ID = 'embodytools';
// Bumped on every deploy during testing, so the plugin page shows at a glance whether the
// running copy is the latest file. If the page does not say this number, Blockbench is
// reading some other file.
const PLUGIN_VERSION = '3.0.1';
const TAG = '[embodytools]';

/*
 * The plugin's icon, embedded so the loader stays one file wherever it's loaded from:
 * Blockbench draws any data:image/ icon as a picture (getIconNode), and a bare name such as
 * 'extension' as a font icon, the puzzle piece. The picture is embody_tools_icon.png in
 * EGT-EmbodyTools, the one the Discord posts show. Change that, then run `npm run icon` to
 * write it in here. The release build refuses an icon that isn't that file.
 */
const ICON = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADAAAAAwCAYAAABXAvmHAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsIAAA7CARUoSoAAAAAZdEVYdFNvZnR3YXJlAFBhaW50Lk5FVCA1LjEuMTGKCBbOAAAAuGVYSWZJSSoACAAAAAUAGgEFAAEAAABKAAAAGwEFAAEAAABSAAAAKAEDAAEAAAACAAAAMQECABEAAABaAAAAaYcEAAEAAABsAAAAAAAAAPJ2AQDoAwAA8nYBAOgDAABQYWludC5ORVQgNS4xLjExAAADAACQBwAEAAAAMDIzMAGgAwABAAAAAQAAAAWgBAABAAAAlgAAAAAAAAACAAEAAgAEAAAAUjk4AAIABwAEAAAAMDEwMAAAAABc7WH6CeiquwAACnhJREFUaEPVmGtsHFcZhp9vLnux1+usvbbjpHWSNonTljS9UVpKMaUNtCWUXum9palSoJRbflAQElSCH4AQKhIg8Q8BFRVqVUBQQblIFAqq1LRQUGoSOzff7Wy89nq9O3vmzOHHzNrrjZ3GjoPEK32yZ/acOe9zvu+cObvStanb8H8sq/7GqqrogTm783N2AERgeBp99w2YdVnwg/oWq6azA3CiSHDjZZTfexUydBycszMMZwVABMkPULr3FtAaOXogzMhZ0uoDFMrou25l+tJ34PYdwZA5q+tgdQFEkIkJig/cho65OG/2Qsea+larqtUFOHQc/4l7yF9yEYkTeazXe6EhVt9qVbV6AEEArkvh9pswiQTx4TGk763F618A5cPk7OKfL0OrAyCCHD2I+tJ9FDZvAt/HPTYUfrZY/R+bQn/kffi7dyGHes8IYnUAShXM5guYvvl6jG1j+T7OgUMY0vUtQ/kBVBS5h+9Cfe4TZwRx5gAiyMghvCfup3hOJwQBTnEWe38ftCyxgDtT2K/vxwQWY49+DPWpT64Y4swBPEVw7XuYuu7q8FqEeG4SeaUXGuP1rUPFHWTfv0kM5dCJNOMPPYx6bGUQZwYgggz1U959F+VsKxIEIEJsaBSZHV76DWxZQJnYsTHwwI+lGb9/N2rPZ5YNscQIp6lcEX3PHeSvvhxMdN4xAe7hgfD/pYwYA8Rw+49B2YBnQoi7HkE98tkQgiX61mnlAAIyNYD3gWtR6SYkqO42gnfRViARbq1LyGTbsA/0YRcqoGwoG3ynifHbHkU9uBc5fHqZWDlAJJ1pBua3SgkCprZvQ336IeTI4IK28xLk+BDqwksJiIMSUFaYCTvF+K7dqHv3IoNvn4mVA2iDoQ3Vmqn1jwkgsOIUdt2EiS+yjYogh3tRj36eifffgtEueAIVKwyPMBM37kHd+gVk+NQQKwcoK8zVm1Fr0qFrA0YDvkDZUDj3PCp7H4HDAzWlIDByFH3rA0zc8gCB1QAe4ewrmY+ywbebGLthD2rXF5GJpSFWDjBWINi+lUpTCnwwfs0sVgS0w/R7d8LFF4JSYR/lYa7oIXfP46hkJlzAypqPav+onLSVYqznMSrXfxmZWhxixQDCcfzzNxJILDRcHbgaZcNsyzrKd9yLDPSHWfAVQaYdL5mBcnXma8zXXkfP0JJi/N17UFd9GZk9GWLFAABqw0bw7ZONzM2kkL/sWoJrdkJxBhpSOL/9MemDB0E7YbnUznr9M1SUCWli7F2fQL3jSfAOLfCwMgBfY9Zvwst2hrOvZPEseFBpyFK6+T5kbBCMwSSFhr//AZn1w+2ztvaXyoRn0JJGpzcgfmWBlZUBzJYx2y/AS2XmdxAVzviCqISD57e8E73zHiiMQ+Z8nFeeITV4DLRbN+t1MLVAZY2dH8I4C62sCEByo/hbuvHtRqjU1fKcmQjIA99NU+y5G8lPguUgszlS/3g5XMSLlZCKYOaAbOyywpo6CnbrAi8rAgAff8NmCNyFgy9lpmzIn7sD/6YnYGYEkzkf99Wf0TA+Gq2Ft3uGYHwX3bgV0bkFC3n5AFbYxWvvCgG0A74T1XP9LM6XhjFJCu+8E9wmsGxk8i2aev8+b3ZR4/P9A51govtx1LlfRdT8bmQ3Z7JPzZmrghkDvoayB5NTyMQAks8h+RyUiojv46QzuMoQm57BKSlEgQlsjHYgcEK4wAlfbL6AAi+RpcEXnN7nMOlN2PkxvI3Xo60UqOgl6FthqOjvXAiBSVJqvoykl8DOPw92G9K1qdugNXJsCChFBAnMlvMw69cRrF1H0NaBzq5Fr2lDNbdijE1sdAx3cAArN4GVz4FXAjdOkGohaF6LTnegG7MUOrah4hlQBgKbhtwQ2WceAr+IlA5R3PksxzffDEqDljB8AW1FEYEFUYiNowq0H/wezth3ka6uLca0ZfCvuwa9bh1+JovfnEE1pPHjjWg3SSAuGDt6YHUAAR9QBquscIpl3MIM7lQeZ3ICJzeKPX4MnTmH41fcje82he0Dm459Pyfxx09iUhsIWq5k9Lqn8e00+GYeQlvYlTKaRgis+eM6gBUjWTxC2767kS7Sxv/8IwzveRSs2JypMKVR1Jquj+psBVHMQQIqwCl5mMBBW4kIwCFeyNH+648j068gukyh5yVOdF67MAvapqP/p6B9ptZ9iHKyPSxtsXEredoOPI0z8QPs5q6up6yxcZLFWdySQgIHTRxwQdtRPdbU5qI1Wq1zibZV5voEJo4xbs0zQFtN0HIJiaF9SGUIWzdTbOsJ148KJ0F8Q3rwFyQOPolrtzPTejWIg1uZpL33G7hj3wRnA3ZzS9tTzJZwfvMr4r98gYZ9b5AaGiQxXcRRoCVOYCXAuPNmT1pgVaAIpLoYF9yrbQtevBOTeReJ8X9jH38e03o7Xmx9WEbGwg480sPPI/4bmMQOCh034Ko87b3fwhn/NsbdBphoF7IsyGTDKJewXn+N2O9fIPniz0kNHqVxfJR4sYQQQ0sDhnh4BqrO+kkgVeOL3a+BiHUSNF9FYvzPOBWHmdZrQCwQC1fNkBr8Ceg+iF2MWnMp2QPfWWAeiHahpSSCjPaiPvhp1KZLcAcOQuDjt2/C6+im2LwhXJyBE60XM79m6mNuZ6m9FjAuTZP7yby5m8kdP6aQ3gpAQ3GA7Gs3gylh3A2Y+Aas6Z+CvXXhN8BTApgAVJETe59lprMbSh7x6WmS4yPEB/bjHvgz+tzL8Tq2U8qcRzmexZCMDBrQ5uTFXwsSRC8eyyU9+U+Sk28wtvEBEJumqf1k9m0HexsYBWYarNYF5nk7AJn8D5UPfJGRGx+v2WEskDiNI320/vAqxNMAmJbt6PU9VDqvxFvTTanhHJSVjrJjov08yk4gYOq+nIhFzMuh3GaMHScz/hfS/+xZUC6LaemjhAkwsSTFi3ZCEAuPCn54bJDCLOk3X0ICjcl0YzLbwFSwjzxHw8sPsebFHtb+8QnW/uOHtBz7K8mp0RBUx8I3dL35aLxKrAUjFiDYlRP1LRbV0hko9uNf8SmGP/wkGAd7dpbk5CjJkQPE+v+G3f8LcJvre82fR4Ii4g9AACa5A938flTmSsrNF1Fo2hIZXUTiEPMmaN//FFb+BbCW+Hky0tIA5Qn0hXdSvPwO4iN9uH2vYB39HVLMYRobIX5OfY8lJGA8CA4jFfA79zK8/esYcRYpDSFWOUHb/q/hnPg+xjl1+XBKACQ8r0wPhB4aW8HNgNj1DU9Tgqheihf8kuPrd4HxT/o8O/ISieHnsKd+dFrmOeUawIDTgGnZhsl0Qyx7BuYBozCxSyhmdpxsTCzEaOJjLy7LPKcGqOr0HvS20v342dsoJddGPyBFEgeMJpN7FbvwMsbZsqwxTwNgdSQGytkeEDe6Eb5xG2cOse6tb5H61/sgmF22peW1XqlMgaDxRmaaLwh/HxKbRHmc9iPP0vr6R3FGvxK+sKpwy9D/BiCYxCQ2ou04idII7Ueeof21O0n2PQjBdGh+GWVTq1PsQqspAzgETdcgpX6s0p8wThdIw4qNV/U/AiA0GgyBZEBSZ2y8qv8CgSg3IbtMe6EAAAAASUVORK5CYII=';

/*
 * The Google sign-in for the team tools, from Part 1 of the plan: the "EmbodyTools desktop"
 * OAuth client in the embodytools-sign-in project, audience Internal, so only embodygames.com
 * accounts can sign in. Only the client ID is here. It goes in the browser's address at every
 * sign-in, so it isn't secret. The client secret stays in the access service, which swaps the
 * code from Google's page and renews the sign-in (plan Part 6). TEAM TOOLS below uses this.
 */
const GOOGLE_CLIENT_ID = '1032123754601-0k4bniat4crvg8bo4mcfsf0teo3mipd5.apps.googleusercontent.com';

const say = (...args) => console.log(TAG, ...args);
const grumble = (...args) => console.warn(TAG, ...args);
const complain = (...args) => console.error(TAG, ...args);

/*
 * Kept from the moment this file runs, before any tool it loads has had a chance to change
 * them. A tool that swapped the global Function could catch the file access handed to the
 * next tool as it is evaluated, and one that wrapped fetch could read the sign-in on its way
 * to the access service. A plugin Blockbench loads before EmbodyTools can still do both:
 * nothing in one shared page can stop that, but the tools EmbodyTools runs itself can't.
 */
const NativeFunction = Function;
const nativeFetch = (typeof fetch === 'function') ? fetch.bind(globalThis) : null;

// ===========================================================================
// ===== REGISTRY ============================================================
// ===========================================================================
/*
 * The outside tools this build knows about: tools that aren't the team's, loaded from their
 * own public link with no sign-in. The team's tools are not here. They come only from the
 * access service, for a signed-in Embody account (TEAM TOOLS below), and a link into the
 * Embody-Games GitHub organization is never loaded directly, whichever list it is in.
 *
 * `url` is fetched verbatim. `id` must match the id the tool registers, and is what its
 * cache file and its enabled state are keyed by. Do not recycle an id for a different tool.
 *
 * Everything except id, name and url is presentation for the card, used until the tool has
 * actually been fetched, after which the tool's own values win.
 *
 * A `file:` entry here is a developer's override: it replaces the service's tool of the same
 * id, so a build can be tried off disk before it is pushed. It is only true on one machine.
 */
const REGISTRY = [
	{
		// An ordinary Blockbench plugin hosted by its author, loaded as it is and picked up
		// fresh on every start, so it stays current without anyone converting it.
		id: 'wynncraft_content_tools',
		name: 'Wynncraft Content Tools',
		author: 'Crunkle',
		description: 'Wynncraft model tools: embed and validate textures, clean up a model for '
			+ 'Wynncraft, and set texture drivers, billboard pivots, block and sky brightness and '
			+ 'skin shaders. Adds the Wynncraft Actor format.',
		tags: ['Wynncraft'],
		url: 'https://s3.jared.im/persist/wynncraft_content_tools.js',
	},
];

/*
 * Where the registry really comes from. The fetched list REPLACES the array above, which
 * is now only a fallback for a first run with no network and nothing cached.
 *
 * This is the piece that means adding a tool needs no release of this file: commit one
 * more entry to registry.json and every contractor sees the new card on their next start.
 * The last good fetch is cached to disk, so an offline start still shows the cards.
 */
const REGISTRY_URL = 'https://raw.githubusercontent.com/Embody-Games/EGT-EmbodyTools/main/loader/registry.json';

// How long to wait on the network before falling back to the disk cache.
const FETCH_TIMEOUT_MS = 8000;

/*
 * One request with its whole answer read, within FETCH_TIMEOUT_MS. The time limit runs until
 * the body is in: a server that sends its headers and then stalls would otherwise hold the
 * caller for good, and with it the start, or every check-in after it. Resolves to the
 * response and its text, and rejects on no answer in time.
 */
async function fetchWithin(url, options) {
	if (!nativeFetch) throw new TypeError('no network here');
	const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
	let timer = null;
	const late = new Promise((resolve, reject) => {
		timer = setTimeout(() => {
			reject(new Error('no answer within ' + (FETCH_TIMEOUT_MS / 1000) + ' seconds'));
			if (controller) controller.abort();
		}, FETCH_TIMEOUT_MS);
	});
	try {
		return await Promise.race([
			(async () => {
				const response = await nativeFetch(url, Object.assign({}, options, controller ? { signal: controller.signal } : {}));
				const text = await response.text();
				return { response: response, text: text };
			})(),
			late,
		]);
	} finally {
		clearTimeout(timer);
	}
}

const parseJson = (text) => { try { return JSON.parse(text); } catch (error) { return null; } };

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
 * Cache directory, for the outside tools' copies, the tool list and debug.log. In
 * Blockbench's own folder beside plugins/, next to the saved sign-in, never inside plugins/:
 * Blockbench tracks installed plugins in its own list rather than by scanning, but a .js
 * sitting in the plugins folder is the sort of thing that gets picked up by hand later and
 * loaded twice. Earlier versions used plugins/embodytools_modules, which the cleanup of old
 * copies empties and removes (retireOldFolder).
 */
function cacheDir() {
	const nodeFs = getFs(false);
	if (!nodeFs || !nodePath) return null;
	try {
		const base = (typeof Plugins !== 'undefined' && Plugins.path) ? Plugins.path : null;
		if (!base) return null;
		const userData = nodePath.dirname(String(base).replace(/[\\/]+$/, ''));
		const dir = nodePath.join(userData, 'embody', 'embodytools_cache');
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

/*
 * Tools added from the Add button on the Tools tab. They live on this computer only, in
 * localStorage, and are merged in after the shared registry. Two deliberate limits: a local
 * entry can never replace a shared one with the same id, and a local entry never gets file
 * access, whatever it says. The shared registry is a reviewed file behind a commit; this is
 * a text box, so anything that needs to read or write files goes through registry.json.
 */
const LOCAL_TOOLS_KEY = 'embodytools.local_tools';

function readLocalTools() {
	try {
		const raw = localStorage.getItem(LOCAL_TOOLS_KEY);
		const list = raw ? JSON.parse(raw) : [];
		// Only what the Add button itself would have saved: an https link and a plain id. A
		// hand-edited entry pointing at a file on disk, or with an id that is really a path,
		// would otherwise reach the disk reader and the cache writer.
		const team_ids = teamToolIds();
		return parseRegistry(list)
			.filter((entry) => /^https:\/\//i.test(entry.url) && /^[a-z0-9_]+$/.test(entry.id)
				&& !isTeamLink(entry.url) && !team_ids.has(entry.id))
			.map((entry) => Object.assign({}, entry, { local: true, native: false }));
	} catch (error) {
		return [];
	}
}

function writeLocalTools(list) {
	try {
		const clean = list.map((entry) => ({
			id: entry.id, name: entry.name, author: entry.author,
			description: entry.description, tags: entry.tags || [], url: entry.url,
		}));
		localStorage.setItem(LOCAL_TOOLS_KEY, JSON.stringify(clean));
		return true;
	} catch (error) {
		complain('could not save the tools added on this computer', error);
		return false;
	}
}

// The shared list, then whatever was added on this computer that it does not already have.
function withLocalTools(list) {
	const ids = new Set(list.map((entry) => entry.id));
	return list.concat(readLocalTools().filter((entry) => !ids.has(entry.id)));
}

// `https://host/path/embody_jira.js?x=1` -> `embody_jira`, lowercased to something safe.
function idFromUrl(url) {
	const file = String(url).split(/[?#]/)[0].split('/').pop() || '';
	return file.replace(/\.js$/i, '').toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '');
}

/*
 * Card details read out of a tool's source as text, without running it. Running someone's
 * plugin just to fill in a form would create its actions and menus as a side effect. For a
 * plugin the fields follow its register call; for one of our modules, its final `return {`.
 */
function readToolDetails(source) {
	const text = String(source || '');
	let from = text.search(/(?:BB)?Plugin\.register\s*\(/);
	if (from === -1) from = text.lastIndexOf('return {');
	const scope = from === -1 ? text : text.slice(from, from + 6000);
	const field = (name) => {
		const match = scope.match(new RegExp('\\b' + name + '\\s*:\\s*(["\'`])((?:(?!\\1)[^\\\\]|\\\\.)*)\\1'));
		return match ? match[2].replace(/\\(.)/g, '$1').trim() : '';
	};
	let id = '';
	const registered = text.match(/(?:BB)?Plugin\.register\s*\(\s*["'`]([a-zA-Z0-9_\-]+)["'`]/);
	const constant = text.match(/\bPLUGIN_ID\s*=\s*["'`]([a-zA-Z0-9_\-]+)["'`]/);
	if (registered) id = registered[1];
	else if (constant) id = constant[1];
	else if (/^[a-zA-Z0-9_\-]+$/.test(field('id'))) id = field('id'); // one of our modules
	return { id: id, title: field('title'), author: field('author'), description: field('description'), version: field('version') };
}

/*
 * A GitHub file page, `github.com/<owner>/<repo>/blob/<branch>/<path>`, is what you get by
 * copying the address bar, and it is a web page about the file rather than the file. It
 * also ends in .js and even contains the code, so nothing downstream would notice until the
 * tool failed to load. Turned into the raw link it stands for.
 */
function rawGitHubUrl(url) {
	const match = String(url).match(/^https:\/\/github\.com\/([^/]+)\/([^/]+)\/blob\/(.+)$/i);
	return match ? 'https://raw.githubusercontent.com/' + match[1] + '/' + match[2] + '/' + match[3] : url;
}

/*
 * Download the link, check it looks like something the loader can run, and add it. Throws
 * with a sentence meant for the person at the keyboard.
 */
async function addLocalTool(form) {
	const url = rawGitHubUrl(String(form.url || '').trim());
	if (!/^https:\/\/\S+\.js(?:[?#].*)?$/i.test(url)) {
		throw new Error('That needs to be an https link to a .js file.');
	}
	if (isTeamLink(url)) {
		throw new Error('That is one of the team\'s tools. They load through your Embody sign-in, not from a link.');
	}

	let source;
	let landed = '';
	try {
		const { response, text } = await fetchWithin(url + (url.includes('?') ? '&' : '?') + 'v=' + Date.now());
		if (!response.ok) throw new Error('HTTP ' + response.status);
		source = text;
		landed = response.url || '';
	} catch (error) {
		throw new Error('Could not download it: ' + error.message + '. Check the link opens in a browser.');
	}
	// A link that only redirects there, such as a short link, is still one of them.
	if (isTeamLink(landed)) {
		throw new Error('That is one of the team\'s tools. They load through your Embody sign-in, not from a link.');
	}
	if (/^\s*</.test(source)) {
		throw new Error('That link opens a web page, not the .js file itself. '
			+ 'On GitHub, open the file and copy the link from its Raw button.');
	}
	const looks_like_plugin = /(?:BB)?Plugin\.register\s*\(/.test(source);
	const looks_like_module = /return\s*\{/.test(source) && /\bload\s*(?::|\()/.test(source);
	if (!looks_like_plugin && !looks_like_module) {
		throw new Error('That file is not a Blockbench plugin: it never calls Plugin.register.');
	}

	const details = readToolDetails(source);
	const id = (details.id || idFromUrl(url)).toLowerCase().replace(/[^a-z0-9_]+/g, '_');
	if (!id) throw new Error('Could not work out a name for it from the link.');
	// Whatever link it came from, a copy of one of the team's tools still calls itself by
	// the team tool's id, so this also stops mirrors and copies hosted somewhere else.
	if (teamToolIds().has(id)) {
		throw new Error('That is one of the team\'s tools. They load through your Embody sign-in, not from a link.');
	}
	const clash = registry.find((entry) => entry.id === id);
	if (clash) throw new Error('"' + (clash.name || id) + '" is already in the list.');

	const tags = String(form.tags || '').split(',').map((tag) => tag.trim()).filter(Boolean);
	const entry = {
		id: id,
		name: String(form.name || '').trim() || details.title || id,
		author: String(form.author || '').trim() || details.author || '',
		description: String(form.description || '').trim() || details.description || '',
		tags: tags,
		url: url,
	};
	const list = readLocalTools().filter((existing) => existing.id !== id);
	list.push(entry);
	if (!writeLocalTools(list)) throw new Error('Could not save it on this computer.');

	// Straight into the live list, with its checkbox, switched off until someone flips it.
	registry.push(Object.assign({}, entry, { local: true, native: false }));
	registerModuleSettings();
	say('added ' + id + ' on this computer (' + url + ')');
	return entry;
}

async function removeLocalTool(id) {
	if (live.has(id)) await setEnabled(id, false);
	writeLocalTools(readLocalTools().filter((entry) => entry.id !== id));
	registry = registry.filter((entry) => !(entry.local && entry.id === id));

	// Its checkbox too, or Settings keeps offering a switch for a tool that is gone. Also
	// forgotten from what this load made, so adding the same link again gets a fresh one.
	const setting_id = settingIdFor(id);
	const setting = typeof settings !== 'undefined' && settings[setting_id];
	if (setting && typeof setting.delete === 'function') {
		try { setting.delete(); } catch (error) { grumble('could not remove the checkbox for ' + id, error); }
	}
	made_setting_ids.delete(setting_id);

	rememberEnabled();
	say('removed ' + id + ' from this computer');
}

// The same entry, shaped for registry.json, so sharing it is a paste and a commit.
function registryEntryText(descriptor) {
	const entry = {
		id: descriptor.id,
		name: descriptor.name,
		author: descriptor.author || undefined,
		description: descriptor.description || undefined,
		tags: (descriptor.tags && descriptor.tags.length) ? descriptor.tags : undefined,
		url: descriptor.url,
	};
	return JSON.stringify(entry, null, 2);
}

function copyText(text) {
	try {
		if (typeof Clipbench !== 'undefined' && Clipbench && typeof Clipbench.setText === 'function') {
			Clipbench.setText(text);
			return true;
		}
		if (typeof navigator !== 'undefined' && navigator.clipboard) {
			navigator.clipboard.writeText(text);
			return true;
		}
	} catch (error) { /* fall through */ }
	return false;
}

function openAddToolDialog(onAdded) {
	if (typeof Dialog === 'undefined') return;
	let busy = false;
	const dialog = new Dialog({
		id: 'embodytools_add_tool',
		title: 'Add a tool',
		width: 560,
		form: {
			url: { label: 'Link to the .js file', type: 'text', value: '', placeholder: 'https://.../plugin.js' },
			name: { label: 'Name', type: 'text', value: '', placeholder: 'Leave empty to use the plugin\'s own name' },
			author: { label: 'Author', type: 'text', value: '', placeholder: 'Leave empty to use the plugin\'s own' },
			description: { label: 'Description', type: 'textarea', value: '', placeholder: 'Leave empty to use the plugin\'s own' },
			tags: { label: 'Tags', type: 'text', value: '', placeholder: 'Comma separated, e.g. Wynncraft, Texturing' },
			note: {
				type: 'info',
				text: 'This adds it on this computer only, and it will not get file access. '
					+ 'To give it to everyone, use Copy entry on its card and paste that into registry.json.',
			},
		},
		onConfirm(form) {
			if (busy) return false;
			busy = true;
			Blockbench.showQuickMessage('Checking the link...', 1500);
			addLocalTool(form).then((entry) => {
				dialog.hide();
				if (typeof dialog.delete === 'function') dialog.delete();
				Blockbench.showQuickMessage('Added ' + entry.name + '. Switch it on from its card.', 2500);
				if (onAdded) onAdded(entry);
			}).catch((error) => {
				busy = false;
				Blockbench.showMessageBox({ title: 'Could not add that tool', message: error.message, icon: 'error' });
			});
			// Kept open while the link is checked; closed from the promise above.
			return false;
		},
		onCancel() {
			if (typeof dialog.delete === 'function') setTimeout(() => dialog.delete(), 0);
		},
	});
	dialog.show();
}
const settingIdFor = (id) => 'embodytools_module_' + id;

// Which module checkboxes this load has created. Cleared on unload with everything else.
const made_setting_ids = new Set();

// Set while we are writing a setting ourselves, so our own write does not come back
// through onChange and load the module a second time.
let suppressChange = false;

/*
 * The tools the 1.x bundle had built in, which were always on. The first time this loader
 * runs on a computer they start switched on, so someone moving over from the bundle only
 * has to sign in to get them back. They stay locked until then, like any team tool.
 */
const FIRST_RUN_ENABLED = ['delta_layers', 'anchored_stretch', 'unleakylayers', 'gradient_map_layer'];

function readRememberedEnabled() {
	try {
		const raw = localStorage.getItem(STATE_KEY);
		if (raw === null) return FIRST_RUN_ENABLED.slice();
		const list = raw ? JSON.parse(raw) : [];
		return Array.isArray(list) ? list.filter((id) => typeof id === 'string') : [];
	} catch (error) {
		return [];
	}
}

/*
 * Tool by tool: its checkbox when it has one, otherwise the copy. It used to be one or the
 * other for the whole list, so a tool that joined the list after the first checkboxes were
 * made, such as a team tool once someone signs in, read as off whatever the copy said.
 */
function readEnabled() {
	const enabled = new Set();
	let remembered = null;
	for (const descriptor of registry) {
		const setting = typeof settings !== 'undefined' && settings[settingIdFor(descriptor.id)];
		if (setting) {
			if (setting.value) enabled.add(descriptor.id);
			continue;
		}
		if (!remembered) remembered = new Set(readRememberedEnabled());
		if (remembered.has(descriptor.id)) enabled.add(descriptor.id);
	}
	return enabled;
}

// Tools not in the list right now, such as the team tools while signed out, keep their place
// in the copy, so they come back switched on.
function rememberEnabled() {
	try {
		const listed = new Set(registry.map((descriptor) => descriptor.id));
		const elsewhere = readRememberedEnabled().filter((id) => !listed.has(id));
		localStorage.setItem(STATE_KEY, JSON.stringify(elsewhere.concat(Array.from(readEnabled()))));
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
		 * Append a line to debug.log in the cache directory. For working out what a
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

async function fetchSource(descriptor) {
	const cache_name = descriptor.id + '.js';

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
		const { response, text: source } = await fetchWithin(url);
		if (!response.ok) throw new Error('HTTP ' + response.status);
		// An outside link that redirects into the team's GitHub is still a team link.
		if (isTeamLink(response.url)) throw new Error('its link leads to one of the team\'s repos, which never load from a link');
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
/*
 * The objects a plugin calls register on. In Blockbench, Plugin and BBPlugin are the same
 * class under two names, but a plugin can reach for either, so both are covered.
 */
function registerHolders() {
	const holders = [];
	for (const holder of [
		typeof Plugin !== 'undefined' ? Plugin : null,
		typeof BBPlugin !== 'undefined' ? BBPlugin : null,
	]) {
		if (holder && typeof holder.register === 'function' && !holders.includes(holder)) holders.push(holder);
	}
	return holders;
}

/*
 * Turn source into a module object. Two shapes are accepted:
 *
 *  - Our own module format: a function body that ends in `return { id, load(ctx), ... }`.
 *  - An ordinary, unmodified Blockbench plugin, the kind that calls Plugin.register. This
 *    is what a third-party plugin hosted somewhere else looks like, and converting it is
 *    not an option: it changes whenever its author updates it, and the whole point of
 *    loading from a URL is to pick that up.
 *
 * For the second, register is swapped for a stand-in while the source runs, so the plugin
 * hands its definition to us instead of to Blockbench and never appears in Blockbench's own
 * plugin list. That relies on the plugin registering while it is being read, which is what
 * plugins do. One that registers later, after an await, cannot be captured, and would go
 * on to register itself with Blockbench for real.
 *
 * File access (requireNativeModule, require) is handed over only when the registry entry
 * says `"native": true`. Blockbench grants it per plugin, and here every tool would be
 * asking as EmbodyTools: without the flag, a tool whose code lives on someone else's server
 * would get our permission silently, including in any future version of it.
 */
function evaluateModule(source, ctx, descriptor) {
	const native = !!(descriptor && descriptor.native === true);
	const captured = [];
	const holders = registerHolders();
	const originals = holders.map((holder) => holder.register);
	for (const holder of holders) {
		holder.register = function (id, options) {
			const definition = options || {};
			captured.push({ id: id, options: definition });
			// Blockbench returns the Plugin instance; the definition, carrying its id, is the
			// closest thing we have, and plugins rarely use the return value anyway.
			definition.id = id;
			return definition;
		};
	}

	let result;
	try {
		const factory = new NativeFunction('ctx', 'requireNativeModule', 'require', source);
		result = factory(ctx,
			(native && typeof requireNativeModule === 'function') ? requireNativeModule : undefined,
			(native && typeof require === 'function') ? require : undefined);
	} finally {
		holders.forEach((holder, index) => { holder.register = originals[index]; });
	}

	// Plugins are often written as an async IIFE, so a throw inside comes back as a rejected
	// promise rather than an exception. Surface it rather than lose it.
	const label = (descriptor && descriptor.id) || 'a tool';
	if (result && typeof result.then === 'function') {
		result.then(null, (error) => complain('error inside ' + label, error));
	}

	if (result && typeof result === 'object' && typeof result.load === 'function') {
		return result;
	}
	if (captured.length) {
		if (captured.length > 1) grumble(label + ' registered ' + captured.length + ' plugins; only the first is used');
		return adaptPlugin(captured[0], descriptor);
	}
	throw new Error('it neither returned a module nor registered a plugin while it was being read');
}

/*
 * Wrap a captured plugin definition so it can be switched on and off like a module. Its
 * own onload and onunload do the work, called with `this` as the definition, which is
 * what Blockbench's Plugin instance amounts to from inside a plugin.
 */
function adaptPlugin(registration, descriptor) {
	const definition = registration.options;
	if (descriptor && registration.id !== descriptor.id) {
		grumble('registry id "' + descriptor.id + '" loaded a plugin that calls itself "' + registration.id + '"');
	}
	return {
		id: registration.id,
		kind: 'plugin',
		title: definition.title,
		version: definition.version,
		description: definition.description,
		author: definition.author,
		variant: definition.variant,
		min_version: definition.min_version,
		load: function (ctx) {
			// Recorded before onload runs, so one that throws halfway still gets its onunload
			// when the half-loaded tool is torn down, and leaves nothing behind.
			ctx.cleanup('onunload of ' + registration.id, function () {
				if (typeof definition.onunload === 'function') definition.onunload.call(definition);
			});
			if (typeof definition.onload === 'function') definition.onload.call(definition);
		},
	};
}

/*
 * A plugin's onunload is written by someone else, and plugins often forget half of it:
 * Action.delete() does not take an action out of the menus it was added to, so a plugin
 * that only deletes its actions leaves dead entries behind, and switching it back on then
 * adds a second copy of each. Tracked here by difference, since a plugin creates its
 * actions directly rather than through ctx.
 */
function allMenus() {
	const menus = [];
	const add = (menu) => { if (menu && Array.isArray(menu.structure) && !menus.includes(menu)) menus.push(menu); };
	if (typeof MenuBar !== 'undefined' && MenuBar && MenuBar.menus) {
		for (const key of Object.keys(MenuBar.menus)) add(MenuBar.menus[key]);
	}
	for (const name of ['Texture', 'TextureLayer', 'TextureLayerGroup', 'Group', 'Cube', 'Mesh',
		'Locator', 'NullObject', 'TextureMesh', 'Armature', 'ArmatureBone', 'SplineMesh', 'Billboard']) {
		const type = globalThis[name];
		add(type && type.prototype && type.prototype.menu);
	}
	return menus;
}

function barItemIds() {
	return (typeof BarItems !== 'undefined' && BarItems) ? Object.keys(BarItems) : [];
}

function sweepPluginLeftovers(created_ids) {
	let removed = 0;
	for (const id of created_ids) {
		if (typeof BarItems !== 'undefined' && BarItems && BarItems[id]) {
			try { BarItems[id].delete(); removed++; } catch (error) { /* nothing more to do */ }
		}
		for (const menu of allMenus()) {
			const before = menu.structure.length;
			removeFromMenuStructure(menu, id);
			removed += before - menu.structure.length;
		}
	}
	return removed;
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
	if (!entry) {
		const descriptor = registry.find((d) => d.id === id);
		const locked = ownCopyLock(descriptor) || teamLock(descriptor);
		return locked ? { status: 'locked', detail: locked } : { status: 'off', detail: '' };
	}
	return { status: entry.status, detail: entry.detail || '', origin: entry.origin || '' };
}

async function loadModule(descriptor) {
	if (live.has(descriptor.id)) return live.get(descriptor.id);

	// A team tool that can't be used right now is not loaded, and not remembered as tried,
	// so it loads as soon as a sign-in or a check-in allows it. That includes one installed
	// on its own and switched on in Blockbench: that copy runs, and the two must never run
	// at once.
	const locked = ownCopyLock(descriptor) || teamLock(descriptor);
	if (locked) return { descriptor, status: 'locked', detail: locked, origin: '' };

	const entry = { descriptor, status: 'loading', detail: '', origin: '' };
	live.set(descriptor.id, entry);

	let created = null;
	try {
		let fetched;
		try {
			fetched = descriptor.team ? await fetchTeamSource(descriptor) : await fetchSource(descriptor);
		} catch (error) {
			// Only a failed download is worth trying again later, not a tool that breaks.
			entry.fetchFailed = true;
			throw error;
		}
		entry.origin = fetched.origin;
		// Switched off, or every team tool removed, while this was downloading.
		if (live.get(descriptor.id) !== entry) return entry;
		// A team tool's file access is what the service listed, or what its sealed copy says.
		const effective = fetched.native === undefined ? descriptor
			: Object.assign({}, descriptor, { native: fetched.native });

		created = createContext(descriptor.id);
		const bar_items_before = new Set(barItemIds());
		const module = evaluateModule(fetched.source, created.ctx, effective);
		entry.module = module;

		if (module.kind === 'plugin') {
			// Recorded first so it runs last, after the plugin's own onunload has had its go.
			// The ids are worked out when the sweep runs, which catches actions created while
			// the plugin was read as well as in onload, whether or not onload got that far.
			created.ctx.cleanup('what ' + descriptor.id + ' left behind', () => {
				const created_ids = entry.created_ids
					|| barItemIds().filter((id) => !bar_items_before.has(id));
				const removed = sweepPluginLeftovers(created_ids);
				if (removed) grumble(descriptor.id + ' left ' + removed + ' menu entries or actions behind; removed them');
			});
		}
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
		if (module.kind === 'plugin') {
			// Once it is up, remember everything it made, so the sweep still knows the ids its
			// onunload deletes from BarItems but leaves sitting in a menu.
			entry.created_ids = barItemIds().filter((id) => !bar_items_before.has(id));
		}
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

/*
 * What the fetched or cached list may hold: outside tools at an https link, with a plain id,
 * never one of the team's by its id or its link. A tool list cached by an earlier version
 * listed only the team's tools, by their old links, and a list with nothing usable left must
 * not stand in for the built-in one. A file: entry is a developer's build tried off disk and
 * only ever belongs in the built-in list of a test build, so from a list it's dropped: one
 * pushed to registry.json by mistake would otherwise reach every computer. The id becomes a
 * cache file name, so it can't be a path either.
 */
function outsideOnly(list) {
	const team_ids = teamToolIds();
	return list.filter((entry) => /^https:\/\//i.test(entry.url) && /^[a-z0-9_]+$/.test(entry.id)
		&& !isTeamLink(entry.url) && !team_ids.has(entry.id));
}

async function fetchRegistry() {
	if (!REGISTRY_URL) return;
	try {
		const url = REGISTRY_URL + (REGISTRY_URL.includes('?') ? '&' : '?') + 'v=' + Date.now();
		const { response, text } = await fetchWithin(url);
		if (!response.ok) throw new Error('HTTP ' + response.status);
		const list = outsideOnly(parseRegistry(parseJson(text)));
		if (list.length) {
			outside_list = list;
			rebuildRegistry();
			writeCache('registry.json', JSON.stringify(list));
			return;
		}
		throw new Error('the registry was empty or not a list');
	} catch (error) {
		const cached = readCache('registry.json');
		if (cached) {
			try {
				const list = outsideOnly(parseRegistry(JSON.parse(cached)));
				if (list.length) {
					outside_list = list;
					rebuildRegistry();
					grumble('could not fetch the registry, using the cached copy', error.message);
					return;
				}
			} catch (parse_error) { /* fall through to the built-in list */ }
		}
		grumble('could not fetch the registry, using the built-in list', error.message);
	}
}

// Still the EmbodyTools that started this, not switched off or reloaded since.
const stillRunning = (generation) => !!loader && generation === load_generation;

async function loadEnabledModules() {
	const generation = load_generation;
	const enabled = readEnabled();
	for (const descriptor of registry.slice()) {
		if (!stillRunning(generation)) return;
		if (enabled.has(descriptor.id)) {
			await loadModule(descriptor);
		}
	}
	if (!stillRunning(generation)) return;
	const on = Array.from(live.values()).filter((entry) => entry.status === 'on');
	say('v' + PLUGIN_VERSION + ' ready: ' + (on.map((e) => e.descriptor.name || e.descriptor.id).join(', ') || 'no modules enabled'));
	redrawPluginPage();
}

function unloadAll() {
	for (const id of Array.from(live.keys())) unloadModule(id);
}

// ===========================================================================
// ===== TEAM TOOLS ==========================================================
// ===========================================================================
/*
 * The team's own tools come from the access service, only for a live Embody Google account
 * (plan Part 4, and service/README.md for what the service answers). Outside tools such as
 * Wynncraft load as before, from their links, with no sign-in.
 *
 *   Signing in   Google, in the browser, with PKCE and a listener on 127.0.0.1 at a random
 *                port, the way Kumonga signs in to Jira. The service swaps the code Google
 *                sends back (/v1/sign-in) and renews the sign-in (/v1/renew), because only
 *                it has the client secret. The refresh token and the key for the offline
 *                copies are kept in one file, encrypted with what the system offers (THE
 *                SAVED SIGN-IN below): Windows DPAPI, the macOS Keychain, or the Linux
 *                desktop's keyring. The ID token, which is what the service checks, stays in
 *                memory.
 *   Check-ins    /v1/me at start before any team tool loads, when the Tools tab opens, and
 *                every 15 minutes. A clear refusal from the service, a renewal Google turned
 *                down included, removes every team tool at once: switched off, copies
 *                deleted, sign-in forgotten, and remembered so no old copy runs later. A
 *                refusal is a 403 in the service's own words; any other answer, or none,
 *                counts as offline.
 *   Copies       Each team tool as last downloaded, encrypted with AES-GCM under the key from
 *                /v1/key, in IndexedDB. Never in the plugins folder. Used only when the
 *                service can't be reached, and only within a week of the last check-in, by
 *                a clock that hasn't been turned back.
 *   Branches     Each card can load its tool from another branch of its repo (/v1/branches,
 *                /v1/tools/<id>?branch=), picked per computer. A copy is of one branch.
 */
const SERVICE_URL = 'https://egt-tool-access.embodygamestools.workers.dev';
const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TEAM_DOMAIN = 'embodygames.com';
const CHECK_IN_EVERY_MS = 15 * 60 * 1000;
// Decision 3: how long a computer that can't reach the service keeps using its copies.
const GRACE_MS = 7 * 24 * 60 * 60 * 1000;
// How far a clock may go back, past the last check-in or the latest time seen here, before
// the copies count as expired. Enough for a clock that corrects itself by a few minutes.
const CLOCK_SLACK_MS = 10 * 60 * 1000;
// Get a new ID token when the one in memory has less than this left.
const TOKEN_MARGIN_MS = 5 * 60 * 1000;
const SIGN_IN_TIMEOUT_MS = 5 * 60 * 1000;
// Opening the Tools tab checks in, but not more often than this.
const TAB_CHECK_GAP_MS = 60 * 1000;

// Card details of the team tools as last listed, for showing their cards while signed out.
// No file access flags and no code: those only ever come from the service or a sealed copy.
const TEAM_LIST_KEY = 'embodytools.team_tools';
// Set when the service or Google refused this computer's sign-in. Cleared by a sign-in the
// service accepts.
const REFUSED_KEY = 'embodytools.team_refused';
// The email of the account signed in here, so a start knows a sign-in was saved. Not secret.
const SIGNED_IN_KEY = 'embodytools.signed_in_as';
// The branch picked for each team tool on this computer, when it isn't the tool's default:
// { "<id>": "<branch>" }. Not secret, and kept across sign-outs.
const BRANCHES_KEY = 'embodytools.branches';

/*
 * A link into the team's GitHub is never loaded directly: the team's tools only come through
 * the service, even while some of those repos are still public. Read as a URL rather than as
 * text, so another spelling of the same address (a port, a trailing dot, an escaped letter,
 * GitHub's other hostnames, the usual CDNs that serve GitHub files) is caught too. Copies
 * hosted anywhere else are caught by their id (teamToolIds) where it matters.
 */
const TEAM_OWNER = 'embody-games';
const GITHUB_HOSTS = ['github.com', 'www.github.com', 'raw.githubusercontent.com', 'raw.github.com',
	'objects.githubusercontent.com', 'media.githubusercontent.com', 'codeload.github.com'];
const GITHUB_MIRRORS = ['raw.githack.com', 'rawcdn.githack.com', 'gitcdn.link', 'rawgit.com', 'cdn.rawgit.com'];
const JSDELIVR = /^(?:cdn|fastly|gcore|testingcf|quantil|originfastly)\.jsdelivr\.net$/;

function isTeamLink(url) {
	let parsed;
	try {
		parsed = new URL(String(url || ''));
	} catch (error) {
		return false;
	}
	const host = parsed.hostname.toLowerCase().replace(/\.+$/, '');
	let path = parsed.pathname;
	try { path = decodeURIComponent(path); } catch (error) { /* keep it as it came */ }
	const parts = path.split(/[\\/]+/).filter(Boolean).map((part) => part.toLowerCase());
	if (GITHUB_HOSTS.includes(host) || GITHUB_MIRRORS.includes(host)) return parts[0] === TEAM_OWNER;
	if (JSDELIVR.test(host) || host === 'cdn.statically.io' || host === 'statically.io') {
		return parts[0] === 'gh' && parts[1] === TEAM_OWNER;
	}
	return false;
}

const TEAM_MESSAGES = {
	web: 'The team tools need the Blockbench desktop app.',
	no_vault: 'Signing in to the team tools doesn\'t work on this system yet.',
	vault_error: 'The saved sign-in could not be read. Try again, or restart Blockbench.',
	signed_out: 'Sign in with your Embody Google account to use the team tools.',
	signing_in: 'Finish signing in in your browser.',
	checking: 'Checking your sign-in...',
	refused: 'This Embody account no longer has access to the team tools.',
	expired: 'Your sign-in has expired. Sign in again.',
	offline_expired: 'Offline for more than a week. Connect to use the team tools.',
};

// What a team tool's card says while it can't be used.
const TEAM_LOCKS = {
	web: 'Desktop app only',
	no_vault: 'Not on this system yet',
	vault_error: 'Sign-in could not be read',
	signed_out: 'Sign in to use',
	signing_in: 'Sign in to use',
	checking: 'Checking your sign-in...',
	refused: 'No access with this account',
	expired: 'Sign in again to use',
	offline_expired: 'Connect to use',
};

const team = {
	state: 'signed_out',
	detail: '',
	email: '',
	name: '',
	idToken: null,
	idTokenExp: 0,
	key: null, // CryptoKey, AES-GCM, not extractable
	keyId: '',
	lastCheck: 0,
	seen: 0, // the latest time this computer's clock has shown, so turning it back is noticed
	list: [], // team descriptors: { id, name, author, description, tags, native, team: true }
	pendingUrl: null,
};

/*
 * Bumped by every sign-in, sign-out and refusal. A check-in that was already on its way when
 * one of those happened doesn't get to undo it by saying "online" afterwards.
 */
let account_epoch = 0;

// Every Tools tab and dialog currently showing cards, redrawn when anything here changes.
const panels = new Set();

function redrawPanels() {
	for (const panel of Array.from(panels)) {
		if (panel.element && panel.element.isConnected === false) { panels.delete(panel); continue; }
		try { panel.draw(); } catch (error) { /* a broken panel must not stop the others */ }
	}
}

function setTeamState(state, detail) {
	team.state = state;
	team.detail = detail || '';
	redrawPanels();
}

const teamMessage = () => team.detail || TEAM_MESSAGES[team.state] || '';

function teamError(kind, detail, extra) {
	return Object.assign(new Error(detail || kind), { kind: kind }, extra || {});
}

/*
 * The system Blockbench runs on: 'windows', 'macos', 'linux', or null for anything else.
 * Blockbench's own SystemInfo first, since it hides `process` from plugins, then the browser's
 * own description of the system.
 */
function systemName() {
	try {
		const platform = (typeof SystemInfo !== 'undefined' && SystemInfo && SystemInfo.platform) || '';
		if (platform === 'win32') return 'windows';
		if (platform === 'darwin') return 'macos';
		if (platform === 'linux') return 'linux';
		const agent = (typeof navigator !== 'undefined' && navigator && navigator.userAgent) || '';
		if (/Windows/i.test(agent)) return 'windows';
		if (/Macintosh|Mac OS X/i.test(agent)) return 'macos';
		if (/Linux|X11/i.test(agent) && !/Android/i.test(agent)) return 'linux';
	} catch (error) { /* nothing to go on */ }
	return null;
}

// ---- small byte helpers ----------------------------------------------------

const utf8 = (text) => new TextEncoder().encode(text);
const fromUtf8 = (bytes) => new TextDecoder().decode(bytes);

function bytesToBase64(bytes) {
	let binary = '';
	for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
	return btoa(binary);
}

function base64ToBytes(base64) {
	const binary = atob(base64);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
	return bytes;
}

const base64url = (bytes) => bytesToBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const randomToken = (size) => base64url(crypto.getRandomValues(new Uint8Array(size)));

// The claims of an ID token, without checking its signature. The service does that; this
// only needs the expiry and who it names.
function idTokenClaims(token) {
	try {
		const part = String(token).split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
		return JSON.parse(fromUtf8(base64ToBytes(part + '='.repeat((4 - part.length % 4) % 4))));
	} catch (error) {
		return {};
	}
}

function setIdToken(token) {
	const claims = idTokenClaims(token);
	team.idToken = token;
	team.idTokenExp = typeof claims.exp === 'number' ? claims.exp * 1000 : Date.now() + 55 * 60 * 1000;
	return claims;
}

/*
 * A 403 is only a refusal when the service says so in its own words: `offboarded`, or
 * `not_allowed` with a reason. Anything else that answers 403, such as a work network's block
 * page or a proxy, hasn't reached the service at all, so it's offline, not a reason to wipe
 * someone's tools and tell them they've lost access.
 */
function refusalIn(body) {
	return !!body && (body.status === 'offboarded' || body.status === 'not_allowed');
}

// ---- Node modules from Blockbench ------------------------------------------

const native_modules = {};

/*
 * What the saved sign-in is kept in, for the messages: the store each system offers for
 * exactly this (THE SAVED SIGN-IN below).
 */
const CREDENTIAL_STORES = {
	windows: 'Windows credential storage',
	macos: 'the macOS Keychain',
	linux: 'your desktop\'s keyring',
};
const storeName = () => CREDENTIAL_STORES[systemName()] || 'the credential storage';
const capital = (text) => text.charAt(0).toUpperCase() + text.slice(1);

/*
 * Asked for once and kept. Each one shows Blockbench's permission prompt the first time,
 * with the message saying what it's for. The sign-in asks for all of them before the
 * browser opens, so no prompt arrives halfway through (Kumonga learnt that the hard way).
 */
function nativeMessage(name) {
	switch (name) {
		case 'net': return 'EmbodyTools listens on this computer, at 127.0.0.1, for Google to hand back your sign-in.';
		case 'shell': return 'EmbodyTools opens your browser so you can sign in with your Embody Google account.';
		case 'child_process': {
			const system = systemName();
			if (system === 'macos') return 'EmbodyTools keeps your sign-in encrypted with a key in your Mac\'s Keychain, through Apple\'s security command.';
			if (system === 'linux') return 'EmbodyTools keeps your sign-in encrypted with a key in your desktop\'s keyring, through the secret-tool command.';
			return 'EmbodyTools keeps your sign-in encrypted with Windows\' own credential storage, which runs as a small PowerShell command.';
		}
		default: return undefined;
	}
}

function nativeModule(name, prompt) {
	if (native_modules[name]) return native_modules[name];
	if (!nativeRequire) return null;
	try {
		const granted = nativeRequire(name, {
			message: nativeMessage(name),
			show_permission_dialog: prompt ? undefined : false,
		});
		if (granted) native_modules[name] = granted;
		return granted || null;
	} catch (error) {
		grumble('Blockbench would not provide ' + name, error);
		return null;
	}
}

// ---- the saved sign-in ------------------------------------------------------------

/*
 * The refresh token and the key for the offline copies, kept in one file beside the plugins
 * folder and encrypted with what the system offers for exactly this, so that a copy of the
 * file is no use away from this account:
 *
 *   Windows  DPAPI, through the same two PowerShell lines Kumonga uses. ProtectedData with
 *            CurrentUser ties the file to this Windows account.
 *   macOS    a random key in the login Keychain, through Apple's own `security` command,
 *            and the file encrypted with that key (AES-GCM).
 *   Linux    the same, with the key in the desktop's keyring (GNOME Keyring, KWallet or
 *            anything else that speaks the Secret Service) through `secret-tool`. With no
 *            keyring, the key goes in a second file that only this user can read, which is
 *            what command-line tools do there, and the log says so.
 *
 * Whatever goes in or out travels on stdin and stdout, never on a command line, where any
 * process on the computer could read it. The key in the Keychain or keyring stays when the
 * sign-in is removed: without the file it decrypts nothing, and the next sign-in reuses it.
 */
const KEYRING_SERVICE = 'embodytools-sign-in';
const KEYRING_ACCOUNT = 'embodytools';
const TOOL_TIMEOUT_MS = 20000;
const SECURITY = '/usr/bin/security';
const POWERSHELL = 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe';

// The person's home folder, as the folder a tool runs in: never wherever Blockbench happened
// to be started from, where a planted program of the same name would be found first.
function toolFolder() {
	try {
		const home = typeof SystemInfo !== 'undefined' && SystemInfo && SystemInfo.home_directory;
		return typeof home === 'string' && home ? home : undefined;
	} catch (error) {
		return undefined;
	}
}

/*
 * One run of a system tool, resolving to how it ended and what it printed. It rejects, as
 * kind 'vault', only when the tool can't start or doesn't finish in time: each caller reads
 * a non-zero exit the way that tool means it.
 */
function runTool(command, args, input, prompt) {
	return new Promise((resolve, reject) => {
		const cp = nativeModule('child_process', prompt);
		if (!cp) {
			reject(teamError('vault', 'Blockbench did not let EmbodyTools use ' + storeName(), { declined: true }));
			return;
		}
		let child;
		try {
			child = cp.spawn(command, args, { windowsHide: true, cwd: toolFolder() });
		} catch (error) {
			reject(teamError('vault', 'could not start ' + command + ': ' + error.message, { missing: error.code === 'ENOENT' }));
			return;
		}
		let out = '';
		let err = '';
		let done = false;
		const finish = (fn) => { if (!done) { done = true; clearTimeout(timer); fn(); } };
		const timer = setTimeout(() => finish(() => {
			try { child.kill(); } catch (error) { /* gone already */ }
			reject(teamError('vault', capital(storeName()) + ' did not answer'));
		}), TOOL_TIMEOUT_MS);
		child.stdout.on('data', (chunk) => { out += String(chunk); });
		child.stderr.on('data', (chunk) => { err += String(chunk); });
		child.on('error', (error) => finish(() => reject(teamError('vault', error.message, { missing: error.code === 'ENOENT' }))));
		child.on('close', (code) => finish(() => resolve({ code: code, out: out, err: err })));
		if (typeof child.stdin.on === 'function') child.stdin.on('error', () => { /* it exited before reading */ });
		child.stdin.end(input || '');
	});
}

const toolTrouble = (run) => (run.err || run.out || '').trim().slice(0, 200);

// ---- Windows: DPAPI ----

/*
 * Exit 3 is Unprotect saying no, or a blob that isn't one: a file from another Windows
 * account, or a damaged one, which can't ever be read. Any other failure, such as antivirus
 * stopping PowerShell, may pass, so the file is kept.
 */
const PS_PROTECT = 'Add-Type -AssemblyName System.Security;'
	+ '$in=[Console]::In.ReadToEnd().Trim();'
	+ '$b=[Convert]::FromBase64String($in);'
	+ '$e=[Security.Cryptography.ProtectedData]::Protect($b,$null,"CurrentUser");'
	+ '[Convert]::ToBase64String($e)';
const PS_UNPROTECT = 'Add-Type -AssemblyName System.Security;'
	+ '$in=[Console]::In.ReadToEnd().Trim();'
	+ 'try{$e=[Convert]::FromBase64String($in);'
	+ '$b=[Security.Cryptography.ProtectedData]::Unprotect($e,$null,"CurrentUser")}'
	+ 'catch{[Console]::Error.Write($_.Exception.GetType().Name);exit 3};'
	+ '[Convert]::ToBase64String($b)';

// By its full path where Windows keeps it, so no other powershell.exe is ever picked up.
function powershellCommand() {
	try {
		const nodeFs = getFs(false);
		if (nodeFs && nodeFs.existsSync(POWERSHELL)) return POWERSHELL;
	} catch (error) { /* the plain name below */ }
	return 'powershell.exe';
}

// Asynchronous, unlike Kumonga's: a spawn takes most of a second, and a check-in every 15
// minutes must not freeze Blockbench for that long.
async function powershell(script, input, prompt) {
	const run = await runTool(powershellCommand(), ['-NoProfile', '-NonInteractive', '-Command', script], input, prompt);
	if (run.code === 0) return run.out.trim();
	if (run.code === 3) throw teamError('vault_refused', 'this sign-in was saved by another Windows account, or is damaged');
	throw teamError('vault', 'Windows credential storage failed (' + run.code + '): ' + toolTrouble(run));
}

// ---- macOS: a key in the Keychain ----

async function keychainRead(prompt) {
	const run = await runTool(SECURITY, ['find-generic-password', '-s', KEYRING_SERVICE, '-a', KEYRING_ACCOUNT, '-w'], '', prompt);
	if (run.code === 0) return run.out.trim() || null;
	if (run.code === 44) return null; // not in the Keychain
	throw teamError('vault', 'the macOS Keychain failed (' + run.code + '): ' + toolTrouble(run));
}

// `security -i` reads its commands from stdin, so the key never appears on a command line.
// It's base64, and the names have no spaces, so nothing in the line needs quoting.
async function keychainWrite(key, prompt) {
	const line = 'add-generic-password -U -s ' + KEYRING_SERVICE + ' -a ' + KEYRING_ACCOUNT + ' -l EmbodyTools -w ' + key + '\n';
	const run = await runTool(SECURITY, ['-i'], line, prompt);
	if (run.code !== 0 || await keychainRead(prompt) !== key) {
		throw teamError('vault', 'the macOS Keychain did not keep the key: ' + toolTrouble(run));
	}
}

// ---- Linux: a key in the desktop's keyring, or in a file only this user can read ----

// secret-tool says "not found" and "no keyring" with the same exit code, and only the second
// with a message.
async function keyringRead(prompt) {
	const run = await runTool('secret-tool', ['lookup', 'service', KEYRING_SERVICE, 'account', KEYRING_ACCOUNT], '', prompt);
	if (run.code === 0 && run.out.trim()) return run.out.trim();
	if ((run.code === 0 || run.code === 1) && !run.err.trim()) return null;
	throw teamError('vault', 'the keyring failed (' + run.code + '): ' + toolTrouble(run));
}

async function keyringWrite(key, prompt) {
	const run = await runTool('secret-tool', ['store', '--label=EmbodyTools sign-in', 'service', KEYRING_SERVICE, 'account', KEYRING_ACCOUNT], key, prompt);
	if (run.code !== 0 || await keyringRead(prompt) !== key) {
		throw teamError('vault', 'the keyring did not keep the key: ' + toolTrouble(run));
	}
}

function keyFile() {
	const file = vaultFile();
	return file ? file.replace(/\.json$/, '.key') : null;
}

function keyFileRead() {
	const nodeFs = getFs(false);
	const file = keyFile();
	try {
		if (!nodeFs || !file || !nodeFs.existsSync(file)) return null;
		return nodeFs.readFileSync(file, 'utf8').trim() || null;
	} catch (error) {
		return null;
	}
}

function keyFileWrite(key) {
	const nodeFs = getFs(true);
	const file = keyFile();
	if (!nodeFs || !file) throw teamError('vault', 'EmbodyTools has no file access to save the sign-in');
	const dir = nodePath.dirname(file);
	if (!nodeFs.existsSync(dir)) nodeFs.mkdirSync(dir, { recursive: true, mode: 0o700 });
	nodeFs.writeFileSync(file, key, { encoding: 'utf8', mode: 0o600 });
	try { nodeFs.chmodSync(file, 0o600); } catch (error) { /* the mode above already did it */ }
}

// ---- the file's encryption on macOS and Linux ----

/*
 * Each blob says where its key is, so a file is opened the way it was made: 'kc1' the
 * Keychain, 'kr1' the keyring, 'kf1' the key file. A blob with none of these is Windows'.
 */
const KEY_HOMES = { keychain: 'kc1', keyring: 'kr1', keyfile: 'kf1' };
let warned_keyfile = false;

async function wrappingKey(home, prompt, create) {
	const read = home === 'keychain' ? keychainRead : home === 'keyring' ? keyringRead : async () => keyFileRead();
	let key = await read(prompt);
	if (key || !create) return key;
	key = bytesToBase64(crypto.getRandomValues(new Uint8Array(32)));
	if (home === 'keychain') await keychainWrite(key, prompt);
	else if (home === 'keyring') await keyringWrite(key, prompt);
	else keyFileWrite(key);
	return key;
}

async function aesKey(base64) {
	return crypto.subtle.importKey('raw', base64ToBytes(base64), 'AES-GCM', false, ['encrypt', 'decrypt']);
}

async function wrapWith(home, key, plain) {
	const iv = crypto.getRandomValues(new Uint8Array(12));
	const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv, additionalData: utf8(KEY_HOMES[home]) },
		await aesKey(key), base64ToBytes(plain));
	return KEY_HOMES[home] + ':' + bytesToBase64(iv) + ':' + bytesToBase64(new Uint8Array(data));
}

async function unwrapWith(home, key, iv, data) {
	try {
		const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: base64ToBytes(iv), additionalData: utf8(KEY_HOMES[home]) },
			await aesKey(key), base64ToBytes(data));
		return bytesToBase64(new Uint8Array(plain));
	} catch (error) {
		throw teamError('vault_refused', 'the saved sign-in does not open with the key ' + storeName() + ' holds');
	}
}

// ---- protecting and opening, whatever the system ----

async function protect(plain, prompt) {
	const system = systemName();
	if (system === 'windows') return powershell(PS_PROTECT, plain, prompt);
	if (system === 'macos') return wrapWith('keychain', await wrappingKey('keychain', prompt, true), plain);
	if (system === 'linux') {
		let key;
		try {
			key = await wrappingKey('keyring', prompt, true);
		} catch (error) {
			if (error.declined) throw error;
			if (!warned_keyfile) {
				warned_keyfile = true;
				grumble('no desktop keyring answered (' + (error.message || error) + '), so the key for the saved sign-in '
					+ 'is kept in a file only this user can read. Installing secret-tool (libsecret) keeps it in the keyring instead.');
			}
			return wrapWith('keyfile', await wrappingKey('keyfile', prompt, true), plain);
		}
		return wrapWith('keyring', key, plain);
	}
	throw teamError('vault', 'there is no credential storage EmbodyTools can use on this system');
}

async function unprotect(blob, prompt) {
	const parts = String(blob).split(':');
	const home = Object.keys(KEY_HOMES).find((name) => KEY_HOMES[name] === parts[0]);
	if (home && parts.length === 3) {
		const key = await wrappingKey(home, prompt, false);
		if (!key) throw teamError('vault_refused', 'the key for the saved sign-in is gone from ' + storeName());
		return unwrapWith(home, key, parts[1], parts[2]);
	}
	if (systemName() === 'windows') return powershell(PS_UNPROTECT, blob, prompt);
	throw teamError('vault_refused', 'the saved sign-in was made on another system');
}

// Next to Kumonga's, in Blockbench's own folder beside plugins/, never inside it.
function vaultFile() {
	if (!nodePath || typeof Plugins === 'undefined' || !Plugins.path) return null;
	const userData = nodePath.dirname(String(Plugins.path).replace(/[\\/]+$/, ''));
	return nodePath.join(userData, 'embody', 'embodytools_signin.json');
}

let vault_bag; // undefined until read; null when there is no saved sign-in

function vaultExists() {
	const nodeFs = getFs(false);
	const file = vaultFile();
	return !!(nodeFs && file && nodeFs.existsSync(file));
}

async function readVault(prompt) {
	if (vault_bag !== undefined) return vault_bag;
	const nodeFs = getFs(prompt);
	const file = vaultFile();
	if (!nodeFs || !file || !nodeFs.existsSync(file)) return (vault_bag = null);
	let blob;
	try {
		blob = JSON.parse(nodeFs.readFileSync(file, 'utf8')).blob;
		if (typeof blob !== 'string') throw new Error('no blob');
	} catch (error) {
		return (vault_bag = null);
	}
	let plain;
	try {
		plain = await unprotect(blob, prompt);
	} catch (error) {
		// Refused means a file that can never be opened here: another account's, another
		// system's, or damaged. Not answering means it may be fine and couldn't be opened today.
		if (error.kind === 'vault_refused') return (vault_bag = null);
		throw error;
	}
	try {
		vault_bag = JSON.parse(fromUtf8(base64ToBytes(plain)));
	} catch (error) {
		vault_bag = null;
	}
	return vault_bag;
}

async function writeVault(bag) {
	const nodeFs = getFs(true);
	const file = vaultFile();
	if (!nodeFs || !file) throw teamError('vault', 'EmbodyTools has no file access to save the sign-in');
	const blob = await protect(bytesToBase64(utf8(JSON.stringify(bag))), true);
	const dir = nodePath.dirname(file);
	if (!nodeFs.existsSync(dir)) nodeFs.mkdirSync(dir, { recursive: true, mode: 0o700 });
	// Written beside and renamed, so a crash halfway leaves the old file rather than half a file.
	// Readable by this user only, where the system has such a thing.
	nodeFs.writeFileSync(file + '.tmp', JSON.stringify({ v: 1, blob: blob }), { encoding: 'utf8', mode: 0o600 });
	nodeFs.renameSync(file + '.tmp', file);
	vault_bag = bag;
}

async function updateVault(changes) {
	const bag = Object.assign({}, (await readVault(true)) || {});
	for (const key of Object.keys(changes)) {
		if (changes[key] === undefined) delete bag[key];
		else bag[key] = changes[key];
	}
	await writeVault(bag);
}

function removeVault() {
	vault_bag = null;
	const nodeFs = getFs(false) || native_fs;
	const file = vaultFile();
	if (!nodeFs || !file) return;
	for (const name of [file, file + '.tmp', keyFile()]) {
		try { if (name && nodeFs.existsSync(name)) nodeFs.unlinkSync(name); } catch (error) { complain('could not delete the saved sign-in', error); }
	}
}

// One encrypt and decrypt of a dummy value, before the browser opens: it raises the prompts
// for the credential store now and proves it works, before there's a sign-in worth losing.
async function vaultSelfTest() {
	const probe = bytesToBase64(utf8('embodytools ' + Date.now()));
	const back = await unprotect(await protect(probe, true), true);
	if (back !== probe) throw teamError('vault', capital(storeName()) + ' did not give back what it was given');
}

// What the account row says when the saved sign-in can't be read, by why.
function vaultTrouble(error) {
	if (error && error.declined) {
		return 'EmbodyTools wasn\'t allowed to use ' + storeName() + ', so the saved sign-in could not be read. '
			+ 'Click Try again and allow it.';
	}
	return capital(storeName()) + ' did not answer, so the saved sign-in could not be read. Try again, or restart Blockbench.';
}

// ---- the offline copies, encrypted, in IndexedDB --------------------------------

const DB_NAME = 'embodytools_team';

function openDb() {
	return new Promise((resolve, reject) => {
		if (typeof indexedDB === 'undefined') { reject(new Error('no IndexedDB here')); return; }
		const request = indexedDB.open(DB_NAME, 1);
		request.onupgradeneeded = () => {
			const db = request.result;
			if (!db.objectStoreNames.contains('copies')) db.createObjectStore('copies');
			if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta');
		};
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error);
	});
}

async function idb(store, mode, work) {
	const db = await openDb();
	try {
		return await new Promise((resolve, reject) => {
			const tx = db.transaction(store, mode);
			const request = work(tx.objectStore(store));
			let result;
			if (request) request.onsuccess = () => { result = request.result; };
			tx.oncomplete = () => resolve(result);
			tx.onerror = () => reject(tx.error);
			tx.onabort = () => reject(tx.error);
		});
	} finally {
		db.close();
	}
}

async function importOfflineKey(base64) {
	return crypto.subtle.importKey('raw', base64ToBytes(base64), 'AES-GCM', false, ['encrypt', 'decrypt']);
}

// Sealed to what it is ("copy:<id>", "last_check"), so a copy can't be passed off as another.
async function seal(value, label) {
	if (!team.key) throw new Error('no key for the offline copies');
	const iv = crypto.getRandomValues(new Uint8Array(12));
	const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv, additionalData: utf8(label) },
		team.key, utf8(JSON.stringify(value)));
	return { iv: iv, data: new Uint8Array(data), key_id: team.keyId };
}

async function unseal(record, label) {
	if (!team.key || !record || !record.iv || !record.data) return null;
	try {
		const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: record.iv, additionalData: utf8(label) },
			team.key, record.data);
		return JSON.parse(fromUtf8(new Uint8Array(plain)));
	} catch (error) {
		return null; // another key, or tampered with
	}
}

/*
 * Bumped by every wipe. A copy that was being saved while one ran, such as a download that
 * finished during a sign-out, is taken back out again rather than left behind.
 */
let copies_epoch = 0;

// `branch` is the branch it came from, null for the tool's default.
async function saveCopy(id, source, native, branch) {
	if (!team.key) return;
	const epoch = copies_epoch;
	try {
		const sealed = await seal({ source: source, native: native === true, branch: branch || null }, 'copy:' + id);
		if (epoch !== copies_epoch) return;
		await idb('copies', 'readwrite', (store) => store.put(sealed, id));
		if (epoch !== copies_epoch) await idb('copies', 'readwrite', (store) => store.delete(id));
	} catch (error) {
		grumble('could not keep an offline copy of ' + id, error);
	}
}

async function readCopy(id) {
	try {
		const opened = await unseal(await idb('copies', 'readonly', (store) => store.get(id)), 'copy:' + id);
		return opened && typeof opened.source === 'string' ? opened : null;
	} catch (error) {
		return null;
	}
}

async function deleteCopies() {
	copies_epoch++;
	try {
		await idb('copies', 'readwrite', (store) => store.clear());
		await idb('meta', 'readwrite', (store) => store.clear());
	} catch (error) {
		complain('could not delete the offline copies of the team tools', error);
	}
}

// The time of the last check-in the service answered, sealed, so it can't be moved forward.
async function saveLastCheck(time) {
	team.lastCheck = time;
	if (!team.key) return;
	const epoch = copies_epoch;
	try {
		const sealed = await seal({ t: time, email: team.email }, 'last_check');
		if (epoch !== copies_epoch) return;
		await idb('meta', 'readwrite', (store) => store.put(sealed, 'last_check'));
		if (epoch !== copies_epoch) await idb('meta', 'readwrite', (store) => store.delete('last_check'));
	} catch (error) {
		grumble('could not note the check-in', error);
	}
}

async function readLastCheck() {
	try {
		const opened = await unseal(await idb('meta', 'readonly', (store) => store.get('last_check')), 'last_check');
		return opened && opened.email === team.email && typeof opened.t === 'number' ? opened.t : 0;
	} catch (error) {
		return 0;
	}
}

/*
 * The latest time this computer's clock has shown, sealed like the last check-in. Without it,
 * someone offline could keep turning the clock back to just after the last check-in and use
 * the copies for ever. `fresh` is for a check-in the service just answered: the clock is
 * believed again from there, even if it went back, since the access was just confirmed.
 */
async function noteTime(fresh) {
	const now = Date.now();
	if (!fresh && now <= team.seen) return;
	team.seen = now;
	if (!team.key) return;
	const epoch = copies_epoch;
	try {
		const sealed = await seal({ t: now, email: team.email }, 'seen');
		if (epoch !== copies_epoch) return;
		await idb('meta', 'readwrite', (store) => store.put(sealed, 'seen'));
		if (epoch !== copies_epoch) await idb('meta', 'readwrite', (store) => store.delete('seen'));
	} catch (error) {
		grumble('could not note the time', error);
	}
}

async function readSeen() {
	try {
		const opened = await unseal(await idb('meta', 'readonly', (store) => store.get('seen')), 'seen');
		return opened && opened.email === team.email && typeof opened.t === 'number' ? opened.t : 0;
	} catch (error) {
		return 0;
	}
}

/*
 * Inside the grace period: the service answered less than a week ago, and the clock hasn't
 * been turned back past that answer or past the latest time seen here. A clock behind either
 * counts as expired, the same as a week gone by.
 */
function withinGrace(last) {
	const now = Date.now();
	if (!last || now - last >= GRACE_MS) return false;
	if (now < last - CLOCK_SLACK_MS) return false;
	if (team.seen && now < team.seen - CLOCK_SLACK_MS) return false;
	return true;
}

// ---- Google and the service ----------------------------------------------------

/*
 * The service's two sign-in routes, which swap a code or renew the sign-in with the client
 * secret only the service has. A 403 is a refusal, a renewal Google turned down included.
 * A 400 or 401 means this sign-in can't be used, so it has to be done again. Not reaching
 * the service, or any other answer, is offline.
 */
async function serviceToken(path, payload) {
	let response;
	let body;
	try {
		const answer = await fetchWithin(SERVICE_URL + path, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(payload),
		});
		response = answer.response;
		body = parseJson(answer.text);
	} catch (error) {
		throw teamError('offline', 'could not reach the access service: ' + error.message);
	}
	if (response.ok && body && typeof body.id_token === 'string') return body;
	if (response.status === 403 && refusalIn(body)) {
		const reason = body.reason || body.status;
		throw teamError('refused', 'the access service refused: ' + reason, { reason: reason });
	}
	if ((response.status === 400 || response.status === 401) && body && (body.error || body.status)) {
		throw teamError('expired', 'the access service could not use this sign-in: '
			+ ((body && (body.reason || body.error)) || response.status));
	}
	throw teamError('offline', 'the access service answered ' + response.status);
}

let refreshing = null;

// An ID token with at least five minutes left, from memory or renewed with the saved refresh
// token. Single-flight, so a burst of requests renews once.
function ensureIdToken(force) {
	if (!force && team.idToken && team.idTokenExp - Date.now() > TOKEN_MARGIN_MS) return Promise.resolve(team.idToken);
	if (!refreshing) {
		refreshing = (async () => {
			const bag = await readVault(true);
			if (!bag || !bag.refresh_token) throw teamError('signed_out', 'no saved sign-in');
			const body = await serviceToken('/v1/renew', { refresh_token: bag.refresh_token });
			setIdToken(body.id_token);
			return team.idToken;
		})().finally(() => { refreshing = null; });
	}
	return refreshing;
}

/*
 * A request to the service with the ID token. A 401 gets one fresh token and one more try.
 * A 403 in the service's words is a refusal, whose body says why. Not reaching it, a 5xx, or
 * an answer that isn't the service's, is offline.
 */
async function serviceRequest(path, as) {
	for (let attempt = 0; attempt < 2; attempt++) {
		const token = await ensureIdToken(attempt > 0);
		let response;
		let text;
		try {
			const answer = await fetchWithin(SERVICE_URL + path, { headers: { Authorization: 'Bearer ' + token } });
			response = answer.response;
			text = answer.text;
		} catch (error) {
			throw teamError('offline', 'could not reach the access service: ' + error.message);
		}
		const body = as === 'text' && response.ok ? null : parseJson(text);
		if (response.status === 401 && body && body.status) {
			if (attempt === 0) continue;
			throw teamError('expired', 'the access service did not accept a fresh sign-in');
		}
		if (response.status === 403 && refusalIn(body)) {
			throw teamError('refused', 'the access service refused: ' + body.status, { reason: body.status });
		}
		if (response.status === 404 && body && body.error) {
			throw teamError('missing', 'the access service does not know ' + path, { code: body.error });
		}
		if (!response.ok) throw teamError('offline', 'the access service answered ' + response.status);
		if (as === 'text') return text;
		if (body === null) throw teamError('offline', 'the access service sent something that isn\'t JSON');
		return body;
	}
	throw teamError('expired', 'the access service did not accept a fresh sign-in');
}

// The key for the offline copies. Copies under an earlier key are useless, so they go.
async function fetchOfflineKey() {
	const body = await serviceRequest('/v1/key');
	if (!body || typeof body.key !== 'string' || typeof body.key_id !== 'string') throw teamError('offline', 'no key in the answer');
	const key = await importOfflineKey(body.key);
	if (team.keyId !== body.key_id) await deleteCopies();
	team.key = key;
	team.keyId = body.key_id;
	// The new key works from memory whatever happens next. If it can't be saved, the next
	// start finds the old one, sees it's out of date and fetches this one again, so a
	// credential store that fails once must not stop the check-ins.
	try {
		await updateVault({ key: body.key, key_id: body.key_id });
	} catch (error) {
		grumble('could not save the new key for the offline copies; it is fetched again next time', error.message || error);
	}
}

// ---- the team list ---------------------------------------------------------------

function parseTeamList(body, keepNative) {
	const list = (body && Array.isArray(body.tools)) ? body.tools : (Array.isArray(body) ? body : []);
	const seen = new Set();
	const out = [];
	for (const entry of list) {
		if (!entry || typeof entry.id !== 'string' || !/^[a-z0-9_]+$/.test(entry.id) || seen.has(entry.id)) continue;
		seen.add(entry.id);
		out.push({
			id: entry.id,
			name: typeof entry.name === 'string' && entry.name ? entry.name : entry.id,
			author: typeof entry.author === 'string' ? entry.author : '',
			description: typeof entry.description === 'string' ? entry.description : '',
			tags: Array.isArray(entry.tags) ? entry.tags.filter((tag) => typeof tag === 'string') : [],
			native: keepNative ? entry.native === true : false,
			team: true,
		});
	}
	return out;
}

function readTeamListCache() {
	try {
		const raw = localStorage.getItem(TEAM_LIST_KEY);
		// Never listed on this computer yet: the team's tools as this build knows them, locked
		// until the first sign-in brings the real list, so a new contractor sees what signing
		// in is for.
		if (raw === null) return placeholderTeamList();
		return parseTeamList(JSON.parse(raw || '[]'), false);
	} catch (error) {
		return [];
	}
}

function placeholderTeamList() {
	return Object.keys(TEAM_TOOL_NAMES).map((id) => ({
		id: id, name: TEAM_TOOL_NAMES[id], author: 'Embody Games', description: '', tags: [], native: false, team: true,
	}));
}

function writeTeamListCache(list) {
	try {
		localStorage.setItem(TEAM_LIST_KEY, JSON.stringify(list.map((d) => ({
			id: d.id, name: d.name, author: d.author, description: d.description, tags: d.tags,
		}))));
	} catch (error) {
		grumble('could not remember the list of team tools', error);
	}
}

async function refreshTeamList() {
	try {
		const list = parseTeamList(await serviceRequest('/v1/registry'), true);
		team.list = list;
		writeTeamListCache(list);
		rebuildRegistry();
		registerModuleSettings();
	} catch (error) {
		if (error.kind === 'refused') await refuse(error.reason);
		else grumble('could not get the list of team tools', error.message);
	}
	redrawPanels();
}

// ---- branches ----------------------------------------------------------------------

/*
 * A team tool can load from another branch of its repo, picked on its card. The service
 * lists what each tool can be switched to (/v1/branches) and reads the tool from the picked
 * one (/v1/tools/<id>?branch=). A tool pinned to a tag in team-tools.json offers nothing to
 * pick. The pick is per computer (BRANCHES_KEY) and only kept while it isn't the default.
 *
 * The lists come in one request, the first time cards are drawn while online, and again on
 * Refresh. Without them, from an older service or with the service out of reach, every
 * picker shows the default and can't be changed.
 */
let branch_lists = null; // Map<id, { default, branches }>, empty when they couldn't be listed
let branches_loading = null;

const BRANCH_NAME = /^[A-Za-z0-9._\/-]{1,100}$/;
const goodBranch = (name) => typeof name === 'string' && BRANCH_NAME.test(name) && !name.includes('..');

function readBranchChoices() {
	const out = {};
	try {
		const saved = JSON.parse(localStorage.getItem(BRANCHES_KEY) || '{}');
		if (saved && typeof saved === 'object' && !Array.isArray(saved)) {
			for (const [id, name] of Object.entries(saved)) {
				if (/^[a-z0-9_]+$/.test(id) && goodBranch(name)) out[id] = name;
			}
		}
	} catch (error) { /* nothing picked */ }
	return out;
}

// The branch picked for a tool here, or null for its default.
function chosenBranch(id) {
	return readBranchChoices()[id] || null;
}

function writeBranchChoice(id, name) {
	const choices = readBranchChoices();
	if (name) choices[id] = name;
	else delete choices[id];
	try {
		localStorage.setItem(BRANCHES_KEY, JSON.stringify(choices));
	} catch (error) {
		grumble('could not remember the branch picked for ' + id, error);
	}
}

// Every tool's branches, in one request, one at a time.
function refreshBranches() {
	if (!branches_loading) branches_loading = loadBranches().finally(() => { branches_loading = null; });
	return branches_loading;
}

async function loadBranches() {
	if (team.state !== 'online') return;
	const epoch = account_epoch;
	try {
		const body = await serviceRequest('/v1/branches');
		if (epoch !== account_epoch) return;
		const lists = new Map();
		const tools = body && body.tools && typeof body.tools === 'object' && !Array.isArray(body.tools) ? body.tools : {};
		for (const [id, info] of Object.entries(tools)) {
			if (!/^[a-z0-9_]+$/.test(id) || !info || !goodBranch(info.default)) continue;
			const names = Array.isArray(info.branches) ? info.branches.filter(goodBranch) : [];
			lists.set(id, { default: info.default, branches: Array.from(new Set(names)) });
		}
		branch_lists = lists;
	} catch (error) {
		if (error.kind === 'refused') await refuse(error.reason);
		else grumble('could not list the branches of the team tools', error.message);
		// Not asked again until Refresh, so a redraw never turns into a stream of requests.
		if (!branch_lists) branch_lists = new Map();
	}
	redrawPanels();
}

/*
 * What a team tool's branch picker shows: the default first, then its other branches, and
 * the picked one even when the list doesn't have it. `value` '' is the default. None at all
 * while there's no list and nothing picked, as before the service has listed the branches.
 * Changing it only makes sense online, with a list to pick from, and while EmbodyTools runs
 * the tool.
 */
function branchPicker(descriptor) {
	if (!descriptor || !descriptor.team) return null;
	const info = branch_lists ? branch_lists.get(descriptor.id) : null;
	const picked = chosenBranch(descriptor.id);
	if (!info && !picked) return null;
	const options = [{ value: '', label: info ? info.default : 'default' }];
	if (info) {
		for (const name of info.branches) if (name !== info.default) options.push({ value: name, label: name });
	}
	if (picked && !options.some((option) => option.value === picked)) options.push({ value: picked, label: picked });
	let title = 'The branch this tool loads from';
	if (team.state !== 'online') title = 'Branches can be picked while signed in and online';
	else if (ownCopyLock(descriptor)) title = 'Installed on its own in Blockbench, so that copy runs';
	else if (!info) title = 'The branches could not be listed. Refresh to try again.';
	else if (options.length < 2) title = 'This tool has no other branch to pick';
	return {
		options,
		value: picked || '',
		enabled: team.state === 'online' && !!info && options.length > 1 && !ownCopyLock(descriptor),
		title,
	};
}

/*
 * Picks a branch for a tool, '' or its default's name for the default. A tool that is running,
 * or failed, loads again from the new branch. One that's off loads from it when switched on.
 */
async function setBranch(id, name) {
	const info = branch_lists ? branch_lists.get(id) : null;
	const pick = name && goodBranch(name) && !(info && name === info.default) ? name : null;
	if (chosenBranch(id) === pick) return;
	writeBranchChoice(id, pick);
	say(id + ' loads from ' + (pick ? 'the branch ' + pick : 'its default branch') + ' from now on');
	if (!live.has(id)) return;
	unloadModule(id);
	const descriptor = registry.find((d) => d.id === id);
	if (descriptor && readEnabled().has(id)) await loadModule(descriptor);
}

// ---- checking in -------------------------------------------------------------------

let checking = null;

function checkIn() {
	if (!checking) checking = runCheckIn().finally(() => { checking = null; });
	return checking;
}

async function runCheckIn() {
	const epoch = account_epoch;
	try {
		const me = await serviceRequest('/v1/me');
		// Signed out, refused or signed in again meanwhile: this answer is about the old one.
		if (epoch !== account_epoch) return team.state;
		team.email = (me && me.email) || team.email;
		team.name = (me && me.name) || team.email;
		rememberSignedIn(team.email);
		if (!team.key || (me && me.key_id !== team.keyId)) await fetchOfflineKey();
		if (epoch !== account_epoch) return team.state;
		const now = Date.now();
		await saveLastCheck(now);
		// The service answered just now, so from here this clock is believed again, even if
		// it was set back while online.
		await noteTime(true);
		setTeamState('online');
		return 'online';
	} catch (error) {
		if (epoch !== account_epoch) return team.state;
		return handleTeamError(error);
	}
}

async function handleTeamError(error) {
	switch (error.kind) {
		case 'refused':
			await refuse(error.reason);
			return 'refused';
		case 'signed_out':
			unloadTeamTools();
			forgetSignIn();
			await deleteCopies();
			setTeamState('signed_out');
			return 'signed_out';
		case 'expired':
			unloadTeamTools();
			setTeamState('expired');
			return 'expired';
		case 'vault':
			setTeamState('vault_error', vaultTrouble(error));
			return 'vault_error';
		default: {
			// Not reaching anyone: the grace period decides.
			grumble('offline for the team tools: ' + (error.message || error));
			const last = team.lastCheck || await readLastCheck();
			if (!team.key || !withinGrace(last)) {
				await endGracePeriod();
				return 'offline_expired';
			}
			team.lastCheck = last;
			await noteTime();
			setTeamState('offline');
			return 'offline';
		}
	}
}

/*
 * A check-in, then everything that was waiting for one: after reaching the service again,
 * the fresh list and the tools it allows, and at any check-in that reached it, the tools
 * whose download failed and the ones that were waiting on something, such as a copy
 * installed on its own that has since been removed or switched off in Blockbench.
 */
async function checkInAndCatchUp() {
	const before = team.state;
	const result = await checkIn();
	if (result === 'online') {
		if (before !== 'online') await refreshTeamList();
		if (team.state === 'online') {
			await retryFailedTeamTools();
			await loadEnabledTeamTools();
		}
	}
	redrawPanels();
	return result;
}

const CHECKS_IN = new Set(['online', 'offline', 'offline_expired', 'expired']);
let last_tab_check = 0;

function checkInFromTab() {
	if (!CHECKS_IN.has(team.state) || Date.now() - last_tab_check < TAB_CHECK_GAP_MS) return;
	last_tab_check = Date.now();
	checkInAndCatchUp().catch((error) => complain('check-in failed', error));
}

function periodicCheckIn() {
	if (!CHECKS_IN.has(team.state)) return;
	checkInAndCatchUp().catch((error) => complain('check-in failed', error));
}

// ---- refusals, signing out, the end of the grace period --------------------------------

function unloadTeamTools() {
	for (const [id, entry] of Array.from(live.entries())) {
		if (entry.descriptor && entry.descriptor.team) unloadModule(id);
	}
}

function rememberSignedIn(email) {
	try { localStorage.setItem(SIGNED_IN_KEY, email || ''); } catch (error) { /* only a hint */ }
}

function forgetSignIn() {
	account_epoch++;
	removeVault();
	team.idToken = null;
	team.idTokenExp = 0;
	team.key = null;
	team.keyId = '';
	team.email = '';
	team.name = '';
	team.lastCheck = 0;
	team.seen = 0;
	try { localStorage.removeItem(SIGNED_IN_KEY); } catch (error) { /* nothing to remove */ }
}

const isRefused = () => { try { return !!localStorage.getItem(REFUSED_KEY); } catch (error) { return false; } };

// Every team tool goes at once: switched off, copies deleted, sign-in forgotten.
async function refuse(reason) {
	// Several downloads can be refused at once; say it once.
	const already = team.state === 'refused';
	try { localStorage.setItem(REFUSED_KEY, String(reason || 'refused')); } catch (error) { /* still wiped below */ }
	unloadTeamTools();
	forgetSignIn();
	// The screen first: deleting the copies can take a moment, and the cards should not go
	// on saying the tools are there while it runs.
	setTeamState('refused');
	await deleteCopies();
	if (already) return;
	say('the team tools were removed: ' + (reason || 'refused'));
	if (typeof Blockbench !== 'undefined' && Blockbench.showQuickMessage) Blockbench.showQuickMessage(TEAM_MESSAGES.refused, 4000);
}

async function endGracePeriod() {
	unloadTeamTools();
	team.key = null;
	team.keyId = '';
	await deleteCopies();
	// The refresh token stays, so connecting again needs no new sign-in. Only written when
	// there is a key to drop: a computer that stays offline checks in every 15 minutes.
	try {
		const bag = await readVault(true);
		if (bag && (bag.key || bag.key_id)) await updateVault({ key: undefined, key_id: undefined });
	} catch (error) {
		grumble('could not drop the key', error);
	}
	setTeamState('offline_expired');
}

async function signOut() {
	if (cancel_sign_in) cancel_sign_in();
	unloadTeamTools();
	forgetSignIn();
	// The screen first, as in refuse().
	setTeamState('signed_out');
	await deleteCopies();
	say('signed out of the team tools');
}

// ---- signing in --------------------------------------------------------------------

let cancel_sign_in = null;

function httpPage(title, text, status) {
	const escape = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
	const html = '<!doctype html><meta charset="utf-8"><title>' + escape(title) + '</title>'
		+ '<body style="font:14px system-ui;padding:3rem;text-align:center"><h2>' + escape(title) + '</h2><p>'
		+ escape(text) + '</p></body>';
	return ['HTTP/1.1 ' + (status || '200 OK'), 'Content-Type: text/html; charset=utf-8',
		'Content-Length: ' + utf8(html).length, 'Connection: close', '', html].join('\r\n');
}

/*
 * Waits for Google to send the browser back with a code. Blockbench refuses `http` to plugins
 * but allows `net`, so this speaks just enough HTTP by hand, as Kumonga's listener does. The
 * port is whatever is free: Google accepts any port on 127.0.0.1 for a desktop client.
 */
function awaitGoogleCode(net, expectedState, makeUrl, openUrl) {
	return new Promise((resolve, reject) => {
		let settled = false;
		let server = null;
		let redirectUri = '';
		const finish = (fn) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			cancel_sign_in = null;
			try { server.close(); } catch (error) { /* already closed */ }
			fn();
		};
		cancel_sign_in = () => finish(() => reject(Object.assign(new Error('Sign-in cancelled.'), { cancelled: true })));
		const timer = setTimeout(() => finish(() => reject(new Error('No answer from the browser within 5 minutes, so the sign-in was not finished.'))),
			SIGN_IN_TIMEOUT_MS);

		server = net.createServer((socket) => {
			let buffer = '';
			let answered = false;
			// One answer per connection, and none stays open: a connection that never sends a
			// full request is dropped after a while, and one that keeps sending is cut off.
			if (typeof socket.setTimeout === 'function') {
				socket.setTimeout(15000, () => { try { socket.destroy(); } catch (error) { /* gone */ } });
			}
			socket.on('data', (chunk) => {
				if (answered) return;
				buffer += String(chunk);
				// The request line is all that's needed. The browser keeps the connection open,
				// so waiting for the end would wait forever.
				if (buffer.indexOf('\r\n\r\n') === -1 && buffer.length < 8192) return;
				answered = true;
				let query;
				try {
					const url = new URL((buffer.split('\r\n')[0] || '').split(' ')[1] || '/', 'http://127.0.0.1');
					if (url.pathname !== '/') {
						socket.end(httpPage('Not found', 'Nothing here.', '404 Not Found'));
						return;
					}
					query = url.searchParams;
				} catch (error) {
					socket.end(httpPage('Not found', 'Nothing here.', '400 Bad Request'));
					return;
				}
				// Anything not answering this sign-in, such as an old tab, is answered and ignored.
				if (query.get('state') !== expectedState) {
					socket.end(httpPage('Sign-in failed', 'This did not match the sign-in EmbodyTools started. Go back to Blockbench and try again.', '400 Bad Request'));
					return;
				}
				if (query.get('error')) {
					socket.end(httpPage('Sign-in failed', 'Google said: ' + query.get('error'), '400 Bad Request'));
					finish(() => reject(new Error('Google said: ' + query.get('error'))));
					return;
				}
				const code = query.get('code');
				if (!code) {
					socket.end(httpPage('Sign-in failed', 'Google sent no code back.', '400 Bad Request'));
					finish(() => reject(new Error('Google sent no code back.')));
					return;
				}
				socket.end(httpPage('Signed in', 'You can close this tab and go back to Blockbench.'));
				finish(() => resolve({ code: code, redirectUri: redirectUri }));
			});
			socket.on('error', () => { /* a browser hanging up is not a problem */ });
		});
		server.on('error', (error) => finish(() => reject(new Error('Could not listen for the sign-in: ' + error.message))));
		// Listening first, then the browser, or the answer could arrive before anyone listens.
		server.listen(0, '127.0.0.1', () => {
			redirectUri = 'http://127.0.0.1:' + server.address().port;
			try {
				openUrl(makeUrl(redirectUri));
			} catch (error) {
				finish(() => reject(new Error('Could not open the browser: ' + error.message)));
			}
		});
	});
}

async function signIn() {
	if (team.state === 'signing_in') return;
	if (!isDesktop) { setTeamState('web'); return; }
	if (!systemName()) { setTeamState('no_vault'); return; }
	const before = team.state;
	const generation = load_generation;
	// EmbodyTools switched off, uninstalled or reloaded while this waited on something.
	const gone = () => !stillRunning(generation);
	account_epoch++;
	try {
		// Every permission the sign-in needs, before the browser opens.
		const nodeFs = getFs(true);
		const net = nativeModule('net', true);
		const shell = nativeModule('shell', true);
		if (!nodeFs || !net || !shell || !nativeModule('child_process', true)) {
			throw new Error('Signing in needs Blockbench to allow file access, the local listener, opening the browser '
				+ 'and ' + storeName() + '. One of them was declined. Try again and allow them.');
		}
		await vaultSelfTest();
		if (gone()) return;

		setTeamState('signing_in');
		const verifier = randomToken(32);
		const challenge = base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', utf8(verifier))));
		const state = randomToken(16);
		const answer = await awaitGoogleCode(net, state, (redirectUri) => GOOGLE_AUTH_URL + '?' + new URLSearchParams({
			client_id: GOOGLE_CLIENT_ID,
			redirect_uri: redirectUri,
			response_type: 'code',
			scope: 'openid email profile',
			code_challenge: challenge,
			code_challenge_method: 'S256',
			state: state,
			hd: TEAM_DOMAIN,
			// A refresh token every time, so a second sign-in on the same computer also keeps.
			access_type: 'offline',
			prompt: 'consent select_account',
		}).toString(), (url) => {
			team.pendingUrl = url;
			redrawPanels();
			shell.openExternal(url);
		});
		team.pendingUrl = null;
		if (gone()) return;

		let tokens;
		try {
			tokens = await serviceToken('/v1/sign-in', {
				code: answer.code,
				code_verifier: verifier,
				redirect_uri: answer.redirectUri,
			});
		} catch (error) {
			// The service refusing the account is a refusal, the same as at /v1/me. Google
			// turning down this code, or the service out of reach, is a failed sign-in.
			if (error.kind === 'refused') throw error;
			throw new Error('Could not finish the sign-in: ' + error.message);
		}
		if (typeof tokens.refresh_token !== 'string') throw new Error('Google did not hand over a sign-in that can be kept. Try again.');
		setIdToken(tokens.id_token);

		// Nothing is kept until the service says yes.
		const me = await serviceRequest('/v1/me');
		const keyBody = await serviceRequest('/v1/key');
		const key = await importOfflineKey(keyBody.key);
		if (gone()) return;
		await deleteCopies();
		await writeVault({
			refresh_token: tokens.refresh_token,
			email: me.email,
			name: me.name || me.email,
			key: keyBody.key,
			key_id: keyBody.key_id,
		});
		team.email = me.email;
		team.name = me.name || me.email;
		team.key = key;
		team.keyId = keyBody.key_id;
		try { localStorage.removeItem(REFUSED_KEY); } catch (error) { /* nothing to clear */ }
		rememberSignedIn(team.email);
		await saveLastCheck(Date.now());
		await noteTime(true);
		setTeamState('online');
		say('signed in to the team tools as ' + team.email);
		await refreshTeamList();
		// File access was just given, so an old folder the start could not clear goes now.
		try {
			cleanUpOldFolder();
		} catch (error) {
			complain('could not clear the old EmbodyTools folder', error);
		}
		if (team.state === 'online') await loadEnabledTeamTools();
	} catch (error) {
		team.pendingUrl = null;
		// Nothing to tell anyone about a sign-in for an EmbodyTools that has gone.
		if (gone()) return;
		if (error.kind === 'refused') {
			await refuse(error.reason);
			Blockbench.showMessageBox({ title: 'No access to the team tools', message: TEAM_MESSAGES.refused, icon: 'lock' });
		} else if (error.cancelled) {
			setTeamState(before === 'signing_in' ? 'signed_out' : before);
		} else {
			team.idToken = null;
			setTeamState(before === 'signing_in' || before === 'checking' ? 'signed_out' : before);
			complain('sign-in failed', error);
			Blockbench.showMessageBox({ title: 'Could not sign in', message: error.message || String(error), icon: 'error' });
		}
	}
}

// ---- old copies of the team's tools ----------------------------------------------------

/*
 * Plugins installed in Blockbench are never touched, the team's tools included: nothing on
 * Blockbench's list is uninstalled, switched off or deleted, file included (decided
 * 2026-10-02; until 3.0.1 a team tool installed on its own was uninstalled, and its card here
 * switched on instead). One that is switched on in Blockbench runs as that copy, and
 * EmbodyTools doesn't load its own next to it, since the two must never run at once. Its card
 * says why (ownCopyLock). Once it's removed or switched off under File > Plugins, the card
 * loads at the next check-in or start.
 *
 * What does go is EmbodyTools' own old folder. Earlier versions kept a plain copy of each tool
 * in plugins/embodytools_modules, and it is cleared at every start, and again after a sign-in,
 * which is when file access is usually given (retireOldFolder): a team tool's copy there is
 * deleted, an outside tool's copy and the tool list move to cacheDir(), the old debug log goes,
 * and then the folder itself. Nothing else in the plugins folder is touched.
 */
const TEAM_TOOL_NAMES = {
	anchored_stretch: 'Anchored Stretch',
	delta_layers: 'Delta Layers',
	unleakylayers: 'UnLeaky Layers',
	gradient_map_layer: 'Gradient Map Layer',
	huepainting: 'Hue Painting',
	embody_jira: 'Kumonga',
	dodge_blend_modes: 'Dodge Blend Modes',
	easyboxuv: 'Easy Box UV',
	adrullanmodel: 'Adrullan Model',
};
const ON_ITS_OWN = 'Installed on its own in Blockbench';
// The tools already named in the log as installed on their own, once per start.
const told_on_its_own = new Set();

// The known team tools, and any the service has listed since. Never EmbodyTools itself:
// this build's id, and the release's, for a test build installed next to it.
function teamToolIds() {
	const ids = new Set(Object.keys(TEAM_TOOL_NAMES));
	for (const entry of team.list || []) {
		if (entry && typeof entry.id === 'string' && /^[a-z0-9_]+$/.test(entry.id)) ids.add(entry.id);
	}
	for (const own of [PLUGIN_ID, 'embodytools']) ids.delete(own);
	return ids;
}

function teamToolName(id) {
	const listed = (team.list || []).find((entry) => entry.id === id);
	return (listed && listed.name) || TEAM_TOOL_NAMES[id] || id;
}

/*
 * On Blockbench's list and switched on there, whether it has arrived yet or not. One switched
 * off there never runs: Blockbench still registers it, but skips its onload. A store plugin
 * with a team tool's id would be someone else's, and two plugins with one id can't both run
 * either, so it counts too.
 */
function installedOnItsOwn(id) {
	return typeof Plugins !== 'undefined' && !!Plugins && Array.isArray(Plugins.installed)
		&& Plugins.installed.some((record) => record && record.id === id && record.disabled !== true);
}

// Why a team tool's card can't load EmbodyTools' copy: one installed on its own runs instead.
function ownCopyLock(descriptor) {
	return descriptor && descriptor.team && installedOnItsOwn(descriptor.id) ? ON_ITS_OWN : null;
}

/*
 * plugins/embodytools_modules, where earlier versions kept their copies: the ids a team
 * tool's copy was deleted for. Blockbench never reads this folder, so nothing in it waits.
 * An outside tool's copy moves to cacheDir(), so an offline start right after still has it.
 * The tool list goes: it is always from an earlier version, which listed the team's tools
 * by their old links, and the built-in list does better until the next fetch. So do the old
 * debug logs. Then the folder goes too, unless something else is in it, which isn't
 * EmbodyTools' to delete. `ids` is every team tool, so none of their copies ever moves.
 */
function retireOldFolder(ids) {
	const deleted = new Set();
	const nodeFs = getFs(false);
	const base = (typeof Plugins !== 'undefined' && Plugins && Plugins.path) ? Plugins.path : null;
	if (!nodeFs || !nodePath || !base) return deleted;
	const old = nodePath.join(base, 'embodytools_modules');
	let names;
	try {
		if (!nodeFs.existsSync(old)) return deleted;
		// Only the real folder inside the plugins folder. A link or junction in its place leads
		// somewhere that isn't EmbodyTools', and nothing there is touched.
		if (!nodeFs.lstatSync(old).isDirectory()) return deleted;
		const real = nodeFs.realpathSync(old);
		const inside = nodeFs.realpathSync(base);
		if (real.toLowerCase() !== nodePath.join(inside, 'embodytools_modules').toLowerCase()) return deleted;
		names = nodeFs.readdirSync(old);
	} catch (error) {
		grumble('could not look in ' + old, (error && error.message) || error);
		return deleted;
	}
	const dir = cacheDir();
	for (const name of names) {
		const file = nodePath.join(old, name);
		try {
			// Plain files only, never what a link points at.
			if (!nodeFs.lstatSync(file).isFile()) continue;
			const id = /\.js$/i.test(name) ? name.slice(0, -3) : null;
			if (id && ids.has(id)) {
				deleted.add(id);
				say('deleted an old copy of ' + id + ': ' + file);
			} else if (id) {
				if (!dir) continue;
				const target = nodePath.join(dir, name);
				if (!nodeFs.existsSync(target)) nodeFs.copyFileSync(file, target);
			} else if (name !== 'registry.json' && !/\.log$/i.test(name)) {
				continue;
			}
			nodeFs.unlinkSync(file);
		} catch (error) {
			if (!error || error.code !== 'ENOENT') grumble('could not clear ' + file, (error && error.message) || error);
		}
	}
	try {
		if (nodeFs.readdirSync(old).length === 0) {
			nodeFs.rmdirSync(old);
			say('removed the old folder ' + old);
		}
	} catch (error) {
		grumble('could not remove ' + old, (error && error.message) || error);
	}
	return deleted;
}

// Desktop only: the web app keeps no plugin files. Returns the ids whose old copies were
// deleted, for the harness.
function cleanUpOldFolder() {
	if (!isDesktop) return [];
	return Array.from(retireOldFolder(teamToolIds()));
}

// ---- at start ------------------------------------------------------------------------

// Before any team tool loads: who is signed in, and whether the service still says yes.
async function teamStartup() {
	team.list = readTeamListCache();
	rebuildRegistry();
	if (!isDesktop) { setTeamState('web'); return; }
	if (!systemName()) { setTeamState('no_vault'); return; }
	if (isRefused()) {
		// Already wiped when it happened. Done again in case that was cut short.
		await deleteCopies();
		removeVault();
		setTeamState('refused');
		return;
	}
	let hinted = false;
	try { hinted = !!localStorage.getItem(SIGNED_IN_KEY); } catch (error) { /* no hint */ }
	if (!hinted && !vaultExists()) {
		// An offline copy left behind with no sign-in never runs.
		await deleteCopies();
		setTeamState('signed_out');
		return;
	}
	let bag;
	try {
		bag = await readVault(true);
	} catch (error) {
		complain('could not read the saved sign-in', error);
		setTeamState('vault_error', vaultTrouble(error));
		return;
	}
	if (!bag || !bag.refresh_token) {
		await deleteCopies();
		forgetSignIn();
		setTeamState('signed_out');
		return;
	}
	team.email = bag.email || '';
	team.name = bag.name || team.email;
	if (bag.key && bag.key_id) {
		try {
			team.key = await importOfflineKey(bag.key);
			team.keyId = bag.key_id;
		} catch (error) {
			team.key = null;
		}
	}
	if (team.key) team.seen = await readSeen();
	setTeamState('checking');
	const result = await checkIn();
	if (result === 'online') await refreshTeamList();
}

// The Try again on "the saved sign-in could not be read": the whole start over, file included.
async function retryTeamStartup() {
	vault_bag = undefined;
	await teamStartup();
	if (team.state === 'online' || team.state === 'offline') await loadEnabledTeamTools();
}

// The team tools that are switched on and not running yet, now that they can be. One
// installed on its own and switched on in Blockbench is left to that copy, so the two never
// run at once, and named in the log once per start.
async function loadEnabledTeamTools() {
	if (!loader) return;
	const generation = load_generation;
	const enabled = readEnabled();
	for (const descriptor of registry.slice()) {
		if (!stillRunning(generation)) return;
		if (!descriptor.team || !enabled.has(descriptor.id) || live.has(descriptor.id)) continue;
		if (installedOnItsOwn(descriptor.id)) {
			if (!told_on_its_own.has(descriptor.id)) {
				told_on_its_own.add(descriptor.id);
				say(teamToolName(descriptor.id) + ' is installed on its own in Blockbench, so that copy runs'
					+ ' and EmbodyTools leaves it alone');
			}
			continue;
		}
		await loadModule(descriptor);
	}
	redrawPanels();
}

/*
 * A team tool whose download failed, such as one the service answered 502 for, is tried
 * again after a check-in that reached the service, rather than staying broken until a restart.
 * One that downloaded and then broke stays as it is: trying it again would only break again.
 */
async function retryFailedTeamTools() {
	let tried = false;
	for (const [id, entry] of Array.from(live.entries())) {
		if (entry.descriptor && entry.descriptor.team && entry.status === 'error' && entry.fetchFailed) {
			live.delete(id);
			tried = true;
		}
	}
	if (tried) await loadEnabledTeamTools();
}

// What a team tool's card says when it can't be used right now, or null when it can.
function teamLock(descriptor) {
	if (!descriptor || !descriptor.team) return null;
	if (team.state === 'online') return null;
	if (team.state === 'offline' && team.key) return null;
	return TEAM_LOCKS[team.state] || 'Sign in to use';
}

// Where a team tool's code comes from: the service, or when it can't be reached, the copy.
// Either way from the branch picked on its card, or its default.
async function fetchTeamSource(descriptor) {
	let failed = null;
	const branch = chosenBranch(descriptor.id);
	if (team.state === 'online') {
		try {
			const source = await serviceRequest('/v1/tools/' + encodeURIComponent(descriptor.id)
				+ (branch ? '?branch=' + encodeURIComponent(branch) : ''), 'text');
			if (!source || !source.trim()) throw new Error('the access service sent an empty file');
			await saveCopy(descriptor.id, source, descriptor.native, branch);
			return { source: source, origin: 'service', native: descriptor.native === true };
		} catch (error) {
			if (error.kind === 'refused') {
				await refuse(error.reason);
				throw new Error(TEAM_LOCKS.refused);
			}
			if (error.kind === 'expired') {
				setTeamState('expired');
				throw new Error(TEAM_MESSAGES.expired);
			}
			// A picked branch that's gone, or was never one: back to the default.
			if (branch && error.kind === 'missing' && error.code === 'unknown_branch') {
				writeBranchChoice(descriptor.id, null);
				grumble('the branch ' + branch + ' of ' + descriptor.id + ' is gone, so it loads from its default branch again');
				return fetchTeamSource(descriptor);
			}
			if (branch && error.kind === 'missing' && error.code === 'not_on_branch') {
				throw new Error('The branch ' + branch + ' doesn\'t have this tool. Pick another branch.');
			}
			if (error.kind !== 'offline') throw error;
			failed = error;
			grumble('could not fetch ' + descriptor.id + ' from the access service, trying the offline copy', error.message);
		}
	}
	const last = team.lastCheck || await readLastCheck();
	if (team.key && withinGrace(last) && !isRefused()) {
		const copy = await readCopy(descriptor.id);
		// A copy is of one branch, and never passed off as another. Copies from before branches
		// are of the default.
		if (copy && (copy.branch || null) === branch) {
			return { source: copy.source, origin: 'offline copy', native: copy.native === true };
		}
		// Signed in and online, the service just couldn't send it: say that, not "offline".
		if (failed) throw new Error('The access service could not send it right now (' + failed.message + '). It tries again at the next check-in.');
		throw new Error(copy ? 'offline, and the copy on this computer is from another branch'
			: 'offline, and there is no copy of it on this computer yet');
	}
	if (failed) throw new Error('The access service could not send it right now (' + failed.message + '). It tries again at the next check-in.');
	throw new Error(TEAM_LOCKS[team.state] || 'Sign in to use');
}

// The outside list, then the team's, then what was added on this computer.
let outside_list = REGISTRY.slice();

function rebuildRegistry() {
	const overrides = new Map(outside_list
		.filter((d) => typeof d.url === 'string' && d.url.indexOf('file:') === 0)
		.map((d) => [d.id, d]));
	const team_ids = new Set(team.list.map((d) => d.id));
	const list = team.list.map((d) => overrides.get(d.id) || d);
	for (const descriptor of outside_list) {
		if (team_ids.has(descriptor.id)) continue;
		if (isTeamLink(descriptor.url)) continue;
		list.push(descriptor);
	}
	registry = withLocalTools(list);
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
.et-add { border-color: var(--color-accent); }
.et-local { border-style: dashed; }
.et-local-row { display: flex; align-items: center; gap: 6px; margin-top: 2px; }
.et-local-label { font-size: 11px; color: var(--color-subtle_text); flex: 1; min-width: 0;
	overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.et-mini {
	padding: 2px 8px; border-radius: 4px; cursor: pointer; font-size: 11px;
	background: var(--color-button); color: var(--color-text); border: 1px solid var(--color-border);
}
.et-mini:hover { background: var(--color-selected); }
.et-mini:disabled { opacity: 0.5; cursor: default; }
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
/*
 * The branch picker. Every dimension is pinned, like the switch's: Blockbench gives every
 * <select> a 30px height, its own padding, display: flex and no arrow.
 */
.et-branch-wrap { position: relative; display: inline-flex; flex: 0 1 auto; min-width: 0; max-width: 128px; }
.et-branch {
	display: block; flex: 1 1 auto; width: 100%; min-width: 48px; height: 22px; min-height: 22px;
	box-sizing: border-box; margin: 0; padding: 0 20px 0 7px; border-radius: 4px;
	font-size: 11px; line-height: 20px; cursor: pointer; appearance: none; -webkit-appearance: none;
	background: var(--color-back); color: var(--color-text); border: 1px solid var(--color-border);
	white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.et-branch:hover { border-color: var(--color-accent); color: var(--color-text); }
.et-branch:focus { outline: none; border-color: var(--color-accent); text-decoration: none; }
.et-branch:disabled { opacity: .55; cursor: default; border-color: var(--color-border); }
.et-branch-arrow {
	position: absolute; right: 3px; top: 50%; transform: translateY(-50%);
	font-size: 16px; line-height: 1; pointer-events: none; color: var(--color-subtle_text);
}
.et-branch:disabled + .et-branch-arrow { opacity: .55; }
.et-empty { padding: 34px; text-align: center; color: var(--color-subtle_text); font-size: 13px; }
.et-foot-note { font-size: 11px; color: var(--color-subtle_text); }

/* The sign-in row for the team tools, above the search bar. */
.et-account {
	display: flex; align-items: center; gap: 10px; padding: 9px 12px; border-radius: 8px;
	background: var(--color-ui); border: 1px solid var(--color-border);
}
.et-account-bad { border-color: #e5533d; }
.et-account-icon { font-size: 18px; color: var(--color-subtle_text); }
.et-account-text { flex: 1; min-width: 0; font-size: 12px; color: var(--color-text); }
.et-locked { opacity: .75; }
.et-locked:hover { transform: none; border-color: var(--color-border); }
.et-lock { flex: none; font-size: 16px; color: var(--color-subtle_text); }

/* The same cards, embedded in Blockbench's own plugin page rather than in a dialog. */
.et-page { padding: 14px 0 4px 0; }
.et-page .et-grid { max-height: none; }
#et_page_tab { cursor: pointer; }
`;

/*
 * The same panel as the plugin page's Tools tab, in a dialog, so the two never drift apart:
 * one place draws the cards, the sign-in row and the locks.
 */
function openBrowser() {
	const dialog = new Dialog({
		id: 'embodytools_browser',
		title: 'EmbodyTools ' + PLUGIN_VERSION,
		width: 940,
		buttons: ['Close'],
		component: {
			template: '<div class="et-dialog-host"></div>',
			mounted() {
				this.$el.appendChild(buildCardPanel({ inDialog: true }));
				checkInFromTab();
			},
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

function button(text, className, onClick) {
	const element = document.createElement('button');
	element.className = className;
	element.textContent = text;
	element.addEventListener('click', onClick);
	return element;
}

/*
 * The sign-in row above the cards: who is signed in, or what to do about it. Its buttons
 * redraw every panel through setTeamState, so nothing here needs to.
 */
function buildAccountRow() {
	const row = document.createElement('div');
	row.className = 'et-account' + (team.state === 'refused' || team.state === 'expired'
		|| team.state === 'offline_expired' || team.state === 'vault_error' ? ' et-account-bad' : '');
	const icon = document.createElement('i');
	icon.className = 'material-icons et-account-icon';
	icon.textContent = team.state === 'online' || team.state === 'offline' ? 'verified_user' : 'lock';
	const text = document.createElement('span');
	text.className = 'et-account-text';
	row.appendChild(icon);
	row.appendChild(text);

	const add = (label, onClick, primary) => {
		row.appendChild(button(label, 'et-refresh' + (primary ? ' et-add' : ''), (event) => {
			event.currentTarget.disabled = true;
			Promise.resolve(onClick()).catch((error) => complain(label + ' failed', error)).finally(redrawPanels);
		}));
	};

	switch (team.state) {
		case 'online':
			text.textContent = 'Signed in as ' + (team.name && team.name !== team.email ? team.name + ' (' + team.email + ')' : team.email);
			add('Sign out', signOut);
			break;
		case 'offline':
			text.textContent = 'Signed in as ' + team.email + '. Offline, so the team tools run from the copies saved on '
				+ new Date(team.lastCheck).toLocaleDateString() + '.';
			add('Sign out', signOut);
			break;
		case 'signing_in':
			text.textContent = teamMessage();
			if (team.pendingUrl) {
				add('Copy sign-in link', () => {
					const ok = copyText(team.pendingUrl);
					Blockbench.showQuickMessage(ok ? 'Copied. Open it in your browser.' : 'Could not reach the clipboard', 2500);
				});
			}
			add('Cancel', () => { if (cancel_sign_in) cancel_sign_in(); });
			break;
		case 'checking':
		case 'web':
		case 'no_vault':
			text.textContent = teamMessage();
			break;
		case 'vault_error':
			text.textContent = teamMessage();
			add('Try again', retryTeamStartup);
			break;
		case 'offline_expired':
			text.textContent = teamMessage();
			add('Try again', checkInAndCatchUp);
			break;
		case 'refused':
			text.textContent = teamMessage();
			add('Sign in with another account', signIn, true);
			break;
		default:
			text.textContent = teamMessage();
			add('Sign in with Google', signIn, true);
	}
	return row;
}

/*
 * The cards, with search, Add tool and Refresh above them. Used by the plugin page's Tools tab
 * and by the dialog. Every panel is kept in `panels` while it is on screen, so a sign-in, a
 * refusal or a check-in redraws all of them.
 */
function buildCardPanel(options) {
	const in_dialog = !!(options && options.inDialog);
	const panel = document.createElement('div');
	if (!in_dialog) panel.id = 'et_page_panel';
	panel.className = 'et-browser' + (in_dialog ? '' : ' et-page');

	const account = document.createElement('div');

	const bar = document.createElement('div');
	bar.className = 'et-bar';
	const search = document.createElement('input');
	search.className = 'et-search';
	search.placeholder = 'Search tools...';
	const refresh = document.createElement('button');
	refresh.className = 'et-refresh';
	refresh.textContent = 'Refresh';
	const add = document.createElement('button');
	add.className = 'et-refresh et-add';
	add.textContent = 'Add tool';
	add.title = 'Add a plugin by its link, on this computer';
	bar.appendChild(search);
	bar.appendChild(add);
	bar.appendChild(refresh);

	const grid = document.createElement('div');
	grid.className = 'et-grid';

	const draw = () => {
		// The branch lists, the first time cards are drawn while online.
		if (branch_lists === null && team.state === 'online') {
			refreshBranches().catch((error) => complain('could not list the branches', error));
		}
		account.replaceChildren(buildAccountRow());
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
			const locked = state.status === 'locked';

			const card = document.createElement('div');
			card.className = 'et-card' + (state.status === 'on' ? ' et-on' : '') + (locked ? ' et-locked' : '');

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
			const author = descriptor.author || (descriptor.local ? 'Unknown author' : 'Embody Games');
			meta.textContent = author + (version ? ' · v' + version : '');
			titles.appendChild(name);
			titles.appendChild(meta);
			head.appendChild(icon);
			head.appendChild(titles);
			if (locked) {
				const lock = document.createElement('i');
				lock.className = 'material-icons et-lock';
				lock.textContent = 'lock';
				lock.title = state.detail;
				head.appendChild(lock);
			}

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
				: state.status === 'blocked' || state.status === 'locked' ? state.detail
				: state.status === 'on' ? (state.origin === 'cache' ? 'on (cached copy)'
					: state.origin === 'offline copy' ? 'on (offline copy)' : 'on')
				: state.status === 'loading' ? 'loading...'
				: 'off';
			status.title = status.textContent;
			const toggle = document.createElement('button');
			toggle.className = 'et-switch' + (on ? ' et-switch-on' : '');
			toggle.disabled = locked;
			const knob = document.createElement('span');
			knob.className = 'et-knob';
			toggle.appendChild(knob);
			toggle.addEventListener('click', async () => {
				toggle.disabled = true;
				status.textContent = 'working...';
				try {
					await setEnabled(descriptor.id, !on);
				} finally {
					redrawPanels();
				}
			});
			foot.appendChild(status);

			// A team tool's branch, next to its switch. Blockbench strips every <select> of its
			// arrow, so it gets one of its own.
			const picker = branchPicker(descriptor);
			if (picker) {
				const wrap = document.createElement('span');
				wrap.className = 'et-branch-wrap';
				wrap.title = picker.title;
				const select = document.createElement('select');
				select.className = 'et-branch';
				select.title = picker.title;
				for (const option of picker.options) {
					const element = document.createElement('option');
					element.value = option.value;
					element.textContent = option.label;
					select.appendChild(element);
				}
				select.value = picker.value;
				select.disabled = !picker.enabled;
				select.addEventListener('change', async () => {
					select.disabled = true;
					toggle.disabled = true;
					status.textContent = 'switching...';
					try {
						await setBranch(descriptor.id, select.value);
					} finally {
						redrawPanels();
					}
				});
				const arrow = document.createElement('i');
				arrow.className = 'material-icons et-branch-arrow';
				arrow.textContent = 'expand_more';
				wrap.appendChild(select);
				wrap.appendChild(arrow);
				foot.appendChild(wrap);
			}
			foot.appendChild(toggle);

			card.appendChild(head);
			card.appendChild(desc);
			if (tags.childNodes.length) card.appendChild(tags);

			if (descriptor.local) {
				card.classList.add('et-local');
				const local = document.createElement('div');
				local.className = 'et-local-row';
				const label = document.createElement('span');
				label.className = 'et-local-label';
				label.textContent = 'Added on this computer';
				label.title = descriptor.url;
				const copy = document.createElement('button');
				copy.className = 'et-mini';
				copy.textContent = 'Copy entry';
				copy.title = 'Copy this as a registry.json entry, to give it to everyone';
				copy.addEventListener('click', () => {
					const ok = copyText(registryEntryText(descriptor));
					Blockbench.showQuickMessage(ok ? 'Copied. Paste it into registry.json to share it.' : 'Could not reach the clipboard', 2500);
				});
				const remove = document.createElement('button');
				remove.className = 'et-mini';
				remove.textContent = 'Remove';
				remove.addEventListener('click', async () => {
					remove.disabled = true;
					await removeLocalTool(descriptor.id);
					redrawPanels();
				});
				local.appendChild(label);
				local.appendChild(copy);
				local.appendChild(remove);
				card.appendChild(local);
			}

			card.appendChild(foot);
			grid.appendChild(card);
		}
	};

	search.addEventListener('input', draw);
	add.addEventListener('click', () => openAddToolDialog(() => redrawPanels()));
	refresh.addEventListener('click', async () => {
		refresh.disabled = true;
		refresh.textContent = 'Refreshing...';
		try {
			const on = Array.from(readEnabled());
			for (const id of on) unloadModule(id);
			await fetchRegistry();
			if (CHECKS_IN.has(team.state)) await checkIn();
			if (team.state === 'online') await refreshTeamList();
			if (team.state === 'online') {
				branch_lists = null;
				await refreshBranches();
			}
			registerModuleSettings();
			for (const id of on) {
				const descriptor = registry.find((e) => e.id === id);
				if (descriptor) await loadModule(descriptor);
			}
		} finally {
			refresh.disabled = false;
			refresh.textContent = 'Refresh';
			redrawPanels();
		}
	});

	panel.appendChild(account);
	panel.appendChild(bar);
	panel.appendChild(grid);
	panels.add({ element: panel, draw: draw });
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
		// Our tab's name left in page_tab hides every tab of the next plugin's page, and
		// Blockbench doesn't put it back itself, so its own About shows again.
		if (vm && vm.page_tab === PAGE_TAB) vm.page_tab = 'about';
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
	bar.parentNode.insertBefore(buildCardPanel(), bar.nextSibling);
	checkInFromTab();
}

/*
 * Rebuild the Tools tab from current state. syncPluginPage leaves the panel alone once it
 * is in place, so without this it keeps showing whatever was true when it was drawn. Open
 * the plugin page straight after a Reload and that is the middle of startup, with every
 * module still loading: every card said "off" and showed no version, while the modules
 * finished loading behind it a moment later.
 */
function redrawPluginPage() {
	if (typeof document === 'undefined') return;
	const stale = document.getElementById('et_page_panel');
	if (stale) stale.remove();
	queuePageSync();
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
	try {
		const vm = pluginPageVue();
		if (vm && vm.page_tab === PAGE_TAB) vm.page_tab = 'about';
	} catch (error) { /* the dialog isn't open */ }
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
// Counts loads, so an unfinished start from before a Disable and Enable stops where it is.
let load_generation = 0;

/*
 * Only one copy of EmbodyTools runs at a time. Two copies with different ids, such as a test
 * build next to the release, both loaded the team's tools, so every tool ran twice. On either
 * one's plugin page, each also took the other's Tools tab away, which set the other putting
 * it back, without end, and Blockbench froze (David, 2026-10-02). So the first copy to load
 * says so here, where every plugin can see it, and any other copy loads nothing and says
 * why. Each copy is its own object, so a copy evaluated again after a Reload Plugins never
 * mistakes the last one's mark for its own: onunload takes the mark away.
 */
const RUNNING = Symbol.for('embodytools.running');
const this_copy = { id: PLUGIN_ID, version: PLUGIN_VERSION };
let idle = false;

function otherCopyRunning() {
	const running = globalThis[RUNNING];
	return running && running !== this_copy ? running : null;
}

function stayIdle(other) {
	idle = true;
	const them = other.id + ' ' + other.version;
	const us = PLUGIN_ID + ' ' + PLUGIN_VERSION;
	grumble('another copy of EmbodyTools is already running (' + them + '), so this one (' + us + ') loads nothing');
	try {
		Blockbench.showMessageBox({
			title: 'EmbodyTools is installed twice',
			icon: 'warning',
			message: 'Two copies of EmbodyTools are installed. ' + them + ' is running, and ' + us
				+ ' does nothing, so the two don\'t get in each other\'s way. Remove one of them under '
				+ 'File > Plugins, then restart Blockbench.',
		});
	} catch (error) { /* the line in the log says it too */ }
}

const registrar = (typeof BBPlugin !== 'undefined') ? BBPlugin : Plugin;

registrar.register(PLUGIN_ID, {
	title: 'EmbodyTools',
	author: 'Embody Games',
	description: 'Embody Games internal toolset. Team tools load for a signed-in Embody account, '
		+ 'outside tools from their own links, and each is switched on and off from a list inside the plugin.',
	icon: ICON,
	version: PLUGIN_VERSION,
	tags: ['Texturing', 'Layers', 'Hytale'],
	variant: 'both',
	min_version: '5.0.5',

	onload() {
		const other = otherCopyRunning();
		if (other) {
			stayIdle(other);
			return;
		}
		idle = false;
		globalThis[RUNNING] = this_copy;
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

		// Start from the built-in list every time. Without this, a Disable and Enable in
		// place (which reuses this closure rather than re-reading the file) began from
		// whatever the last fetch left in `registry`, so the first load and every later
		// one registered different checkboxes. The team tools as last listed come with it,
		// locked until the check-in below, so their checkboxes are credited to us too.
		outside_list = REGISTRY.slice();
		team.list = readTeamListCache();
		team.state = isDesktop ? 'checking' : 'web';
		rebuildRegistry();

		try {
			registerModuleSettings();
		} catch (error) {
			complain('could not add the module checkboxes', error);
		}

		// Check-ins every 15 minutes while Blockbench is open (plan Part 4).
		if (isDesktop) {
			const timer = setInterval(periodicCheckIn, CHECK_IN_EVERY_MS);
			loader.ctx.cleanup('team check-ins', () => clearInterval(timer));
		}
		loader.ctx.cleanup('a sign-in in progress', () => { if (cancel_sign_in) cancel_sign_in(); });
		loader.ctx.cleanup('panels on screen', () => panels.clear());
		told_on_its_own.clear();

		// Outside tools first, so a slow check-in never holds them up. Then the check-in, and
		// only after it any team tool. A Disable before this finishes stops it where it is.
		const generation = ++load_generation;
		const current = () => generation === load_generation && !!loader;
		setTimeout(async () => {
			// EmbodyTools' own old folder, from earlier versions. Plugins installed in
			// Blockbench are never touched.
			try {
				cleanUpOldFolder();
			} catch (error) {
				complain('could not clear the old EmbodyTools folder', error);
			}
			await fetchRegistry();
			if (!current()) return;
			registerModuleSettings();
			await loadEnabledModules();
			if (!current()) return;
			try {
				await teamStartup();
			} catch (error) {
				complain('could not check the sign-in for the team tools', error);
			}
			if (!current()) return;
			registerModuleSettings();
			await loadEnabledTeamTools();
		}, 0);
	},

	onunload() {
		// An idle copy loaded nothing, and the running copy's things are not its to touch.
		if (idle) {
			idle = false;
			return;
		}
		try {
			unloadAll();
			made_setting_ids.clear();
			if (loader) {
				loader.teardown();
				loader = null;
			}
		} finally {
			if (globalThis[RUNNING] === this_copy) delete globalThis[RUNNING];
		}
		say('unloaded');
	},
});

})();
