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
const PLUGIN_VERSION = '3.3.1';
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

	// Blockbench asks the person in EmbodyTools' name, so each request says which tool it's for,
	// unless the tool says why itself.
	const tool_name = (descriptor && (descriptor.name || descriptor.id)) || 'a tool';
	const handed = (native && typeof requireNativeModule === 'function')
		? function (module_name, options) {
			return requireNativeModule(module_name, Object.assign({ message: 'For ' + tool_name + ', a tool EmbodyTools runs' }, options || {}));
		}
		: undefined;
	let result;
	try {
		const factory = new NativeFunction('ctx', 'requireNativeModule', 'require', source);
		result = factory(ctx, handed, (native && typeof require === 'function') ? handed : undefined);
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
		// Its own icon, for its row (ownIcon).
		icon: definition.icon,
		load: function (ctx) {
			// Recorded first, so it runs after the plugin's own onunload: the event listeners and
			// styles its onload added that its onunload left in place (onloadAdditions).
			let added = null;
			ctx.cleanup('what the onload of ' + registration.id + ' left', function () {
				const removed = added ? removeAdditions(added) : 0;
				if (removed) grumble(registration.id + ' left ' + removed + ' event listeners or styles behind; removed them');
			});
			// Recorded before onload runs, so one that throws halfway still gets its onunload
			// when the half-loaded tool is torn down, and leaves nothing behind.
			ctx.cleanup('onunload of ' + registration.id, function () {
				if (typeof definition.onunload === 'function') definition.onunload.call(definition);
			});
			const before = onloadBaseline();
			try {
				if (typeof definition.onload === 'function') definition.onload.call(definition);
			} finally {
				added = onloadAdditions(before);
			}
		},
	};
}

/*
 * What a plugin's onload adds to Blockbench's events and the page's styles, so whatever its
 * onunload leaves can be taken away when it's switched off. Only what was added while onload
 * itself ran, so nothing of anyone else's is touched. GeckoLib, for one, never removes its
 * listeners or its style (2026-10-04): every switch off and on again added another set, and
 * the old ones went on running while it was off.
 */
function onloadBaseline() {
	const events = (typeof Blockbench !== 'undefined' && Blockbench && Blockbench.events) || {};
	const listeners = new Map();
	for (const name of Object.keys(events)) {
		if (Array.isArray(events[name])) listeners.set(name, new Set(events[name]));
	}
	const styles = (typeof document !== 'undefined' && document.head) ? new Set(document.head.querySelectorAll('style')) : new Set();
	return { listeners, styles };
}

function onloadAdditions(before) {
	const added = { listeners: [], styles: [] };
	const events = (typeof Blockbench !== 'undefined' && Blockbench && Blockbench.events) || {};
	for (const name of Object.keys(events)) {
		if (!Array.isArray(events[name])) continue;
		const had = before.listeners.get(name);
		for (const listener of events[name]) if (!had || !had.has(listener)) added.listeners.push([name, listener]);
	}
	if (typeof document !== 'undefined' && document.head) {
		for (const node of document.head.querySelectorAll('style')) if (!before.styles.has(node)) added.styles.push(node);
	}
	return added;
}

function removeAdditions(added) {
	let removed = 0;
	for (const [name, listener] of added.listeners) {
		const list = Blockbench.events && Blockbench.events[name];
		if (Array.isArray(list) && list.includes(listener)) {
			Blockbench.removeListener(name, listener);
			removed++;
		}
	}
	for (const node of added.styles) {
		if (node.isConnected) {
			node.remove();
			removed++;
		}
	}
	return removed;
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
		// Kept for its row while it's off, from now on (ownIcon).
		rememberIcon(descriptor.id, module.icon);

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

// The branch list open under a team tool's picker, if one is (openBranchList).
let branch_list = null;

// The tools whose rows are opened to show more (buildCardPanel), kept through every redraw.
const expanded_tools = new Set();

function redrawPanels() {
	for (const panel of Array.from(panels)) {
		if (panel.element && panel.element.isConnected === false) { panels.delete(panel); continue; }
		try { panel.draw(); } catch (error) { /* a broken panel must not stop the others */ }
	}
	// A panel that went took its pickers with it, so a list open under one goes too.
	if (branch_list && !branch_list.anchor.isConnected) closeBranchList(false);
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
 * the picked one even when the list doesn't have it (`missing`, when there is a list). `value`
 * '' is the default. Each has the `kind` its icon is picked by (branchKind), and so does the
 * picker, for the one in use. None at all while there's no list and nothing picked, as before
 * the service has listed the branches. Changing it only makes sense online, with a list to
 * pick from, and while EmbodyTools runs the tool.
 */
function branchPicker(descriptor) {
	if (!descriptor || !descriptor.team) return null;
	const info = branch_lists ? branch_lists.get(descriptor.id) : null;
	const picked = chosenBranch(descriptor.id);
	if (!info && !picked) return null;
	const options = [{ value: '', label: info ? info.default : 'default', kind: branchKind(info, '') }];
	if (info) {
		for (const name of info.branches) if (name !== info.default) options.push({ value: name, label: name, kind: 'branch' });
	}
	if (picked && !options.some((option) => option.value === picked)) {
		options.push({ value: picked, label: picked, kind: 'branch', missing: !!info });
	}
	let title = 'The branch this tool loads from';
	if (team.state !== 'online') title = 'Branches can be picked while signed in and online';
	else if (ownCopyLock(descriptor)) title = 'Installed on its own in Blockbench, so that copy runs';
	else if (!info) title = 'The branches could not be listed. Refresh to try again.';
	else if (options.length < 2) {
		title = options[0].kind === 'pinned' ? 'Pinned, so everyone stays on ' + options[0].label : 'This tool has no other branch to pick';
	}
	return {
		options,
		value: picked || '',
		kind: branchKind(info, picked || ''),
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

/*
 * Why a tool's row can't load EmbodyTools' copy: one installed on its own runs instead, and
 * two copies of one plugin can't both run. Outside tools too since 2026-10-04: the ones from
 * Blockbench's own store (GeckoLib, Preview Scene Customiser, Shape Generator) are often
 * installed from there already.
 */
function ownCopyLock(descriptor) {
	return descriptor && installedOnItsOwn(descriptor.id) ? ON_ITS_OWN : null;
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
// ===== WHAT'S NEW ==========================================================
// ===========================================================================

/*
 * Quinten's idea (2026-10-03): when EmbodyTools or any team tool has a new version, the
 * first model opened or made after that says what changed and how to use it, once.
 *
 * The notes are each release's entry in its changelog.json, Blockbench's own changelog
 * format, which every Embody Games tool's release writes and its Discord post is made from:
 * EmbodyTools' own from its public repo, next to the registry, and every team tool's from
 * the service (/v1/changelogs), switched on here or not. A "How to use" category, which a
 * release can have, comes first.
 *
 * NOTES_SEEN_KEY keeps the newest version shown: EmbodyTools' own (`own`) and each team
 * tool's (`team`). Without `own` yet, only EmbodyTools' current notes show. Without `team`
 * yet, the first time the team's notes are read, every team tool counts as seen at its
 * current version, so nobody gets every tool's history at once. A tool that turns up in
 * the list after that shows its latest notes as new. Only a newer version counts, so a
 * branch picked on a card or a version taken back never shows anything.
 *
 * At most once a Blockbench session: on the first project selected after start (a model
 * opened or made, Blockbench's select_project), once the notes say there's something new,
 * and only while no other dialog is open. Closing it, any way, marks what it showed as seen.
 * The What's new button above the cards shows the latest notes of everything at any time.
 */
const NOTES_SEEN_KEY = 'embodytools.notes_seen';
const OWN_NOTES_ID = 'embodytools'; // EmbodyTools' own group in the window
const HOW_TO_USE = 'How to use';
const NOTES_SHOWN_PER_TOOL = 3;
const NOTES_DELAY_MS = 800; // after the project is selected, so it loads, and its own dialogs open, first
const NOTES_WAIT_MS = 60 * 1000; // for another dialog to close, before trying again at the next project
// EmbodyTools' own changelog.json is at the top of its public repo, next to loader/.
const OWN_NOTES_URL = typeof REGISTRY_URL === 'string' && /\/loader\/registry\.json$/.test(REGISTRY_URL)
	? REGISTRY_URL.replace(/\/loader\/registry\.json$/, '/changelog.json') : null;

let notes_done = false; // shown, or nothing new, this session
let notes_busy = false; // a look is under way, or one is waiting to start

const NOTE_VERSION = /^\d{1,6}\.\d{1,6}\.\d{1,6}$/;
// The x.y.z at the start, so a test build's version with a suffix counts as its x.y.z.
const LEADING_VERSION = /^(\d{1,6})\.(\d{1,6})\.(\d{1,6})/;

// Negative when a is older than b, positive when newer, 0 when the same.
function compareVersions(a, b) {
	const x = LEADING_VERSION.exec(String(a)) || [0, 0, 0, 0];
	const y = LEADING_VERSION.exec(String(b)) || [0, 0, 0, 0];
	for (let i = 1; i <= 3; i++) {
		const d = Number(x[i]) - Number(y[i]);
		if (d) return d;
	}
	return 0;
}

// The record of what was shown: { own: version or null, team: { id: version } or null }.
function readNotesSeen() {
	const out = { own: null, team: null };
	try {
		const saved = JSON.parse(localStorage.getItem(NOTES_SEEN_KEY) || 'null');
		if (saved && typeof saved === 'object' && !Array.isArray(saved)) {
			if (typeof saved.own === 'string' && NOTE_VERSION.test(saved.own)) out.own = saved.own;
			if (saved.team && typeof saved.team === 'object' && !Array.isArray(saved.team)) {
				out.team = {};
				for (const [id, version] of Object.entries(saved.team)) {
					if (/^[a-z0-9_]+$/.test(id) && typeof version === 'string' && NOTE_VERSION.test(version)) out.team[id] = version;
				}
			}
		}
	} catch (error) { /* nothing shown yet */ }
	return out;
}

function writeNotesSeen(seen) {
	try {
		localStorage.setItem(NOTES_SEEN_KEY, JSON.stringify({ own: seen.own || undefined, team: seen.team || undefined }));
	} catch (error) {
		grumble('could not remember which release notes were shown', error);
	}
}

/*
 * Release notes as the window shows them, whatever came in: [{ version, title, date,
 * categories: [{ title, list }] }], newest first, plain text only, cut to size.
 */
function tidyEntries(list) {
	const out = [];
	for (const entry of Array.isArray(list) ? list : []) {
		if (!entry || typeof entry !== 'object' || typeof entry.version !== 'string' || !NOTE_VERSION.test(entry.version)) continue;
		const categories = [];
		for (const category of Array.isArray(entry.categories) ? entry.categories : []) {
			if (!category || typeof category.title !== 'string' || !category.title.trim() || !Array.isArray(category.list)) continue;
			const lines = category.list.filter((line) => typeof line === 'string' && line.trim()).slice(0, 40)
				.map((line) => line.trim().slice(0, 1000));
			if (lines.length && categories.length < 10) categories.push({ title: category.title.trim().slice(0, 60), list: lines });
		}
		const title = typeof entry.title === 'string' ? entry.title.trim().slice(0, 200) : '';
		const date = typeof entry.date === 'string' ? entry.date.trim().slice(0, 40) : '';
		if (title || categories.length) out.push({ version: entry.version, title, date, categories });
	}
	return out.sort((a, b) => compareVersions(b.version, a.version));
}

// A changelog.json as Blockbench keeps it: { "1.2.0": { title, date, categories } }.
function changelogEntries(data) {
	if (!data || typeof data !== 'object' || Array.isArray(data)) return [];
	return tidyEntries(Object.entries(data).map(([version, entry]) =>
		(entry && typeof entry === 'object' && !Array.isArray(entry) ? Object.assign({}, entry, { version }) : null)));
}

// EmbodyTools' own notes, from its public repo. None when they can't be read.
async function fetchOwnNotes() {
	if (!OWN_NOTES_URL) return [];
	try {
		const { response, text } = await fetchWithin(OWN_NOTES_URL + '?v=' + Date.now());
		if (!response.ok) throw new Error('HTTP ' + response.status);
		return changelogEntries(parseJson(text));
	} catch (error) {
		grumble('could not read EmbodyTools\' release notes', error.message);
		return [];
	}
}

/*
 * Every team tool's notes, from the service: Map<id, entries>. Empty from a service older
 * than /v1/changelogs, and null when they couldn't be read this time.
 */
async function fetchTeamNotes() {
	if (team.state !== 'online') return null;
	const epoch = account_epoch;
	try {
		const body = await serviceRequest('/v1/changelogs');
		if (epoch !== account_epoch) return null;
		const tools = body && body.tools && typeof body.tools === 'object' && !Array.isArray(body.tools) ? body.tools : {};
		const out = new Map();
		for (const [id, info] of Object.entries(tools)) {
			if (!/^[a-z0-9_]+$/.test(id) || !info || typeof info !== 'object') continue;
			const entries = tidyEntries(info.entries);
			if (entries.length) out.set(id, entries);
		}
		return out;
	} catch (error) {
		if (error.kind === 'refused') {
			await refuse(error.reason);
			return null;
		}
		if (error.kind === 'missing') return new Map();
		grumble('could not read the team tools\' release notes', error.message);
		return null;
	}
}

/*
 * What the window would show: [{ id, name, entries, more, isNew, description, off }],
 * EmbodyTools first, then the team tools in the list's order. `team_notes` null is notes
 * that couldn't be read this time.
 */
function newNotes(seen, own, team_notes) {
	const groups = [];
	const own_entries = own.filter((entry) => compareVersions(entry.version, PLUGIN_VERSION) <= 0
		&& (seen.own ? compareVersions(entry.version, seen.own) > 0 : compareVersions(entry.version, PLUGIN_VERSION) === 0));
	if (own_entries.length) groups.push({ id: OWN_NOTES_ID, name: 'EmbodyTools', entries: own_entries });
	if (seen.team && team_notes) {
		const enabled = readEnabled();
		for (const descriptor of team.list) {
			const entries = team_notes.get(descriptor.id);
			if (!entries || !entries.length) continue;
			const last = seen.team[descriptor.id];
			const group = { id: descriptor.id, name: descriptor.name || descriptor.id, off: !enabled.has(descriptor.id) };
			if (!last) {
				Object.assign(group, { entries: entries.slice(0, 1), isNew: true, description: descriptor.description || '' });
			} else {
				group.entries = entries.filter((entry) => compareVersions(entry.version, last) > 0);
			}
			if (group.entries.length) groups.push(group);
		}
	}
	for (const group of groups) {
		group.more = Math.max(0, group.entries.length - NOTES_SHOWN_PER_TOOL);
		group.entries = group.entries.slice(0, NOTES_SHOWN_PER_TOOL);
	}
	return groups;
}

// What the window showed counts as seen: each tool's newest version in it.
function markNotesSeen(groups) {
	const seen = readNotesSeen();
	const newer = (version, than) => !than || compareVersions(version, than) > 0;
	for (const group of groups) {
		const newest = group.entries[0] && group.entries[0].version;
		if (!newest) continue;
		if (group.id === OWN_NOTES_ID) {
			if (newer(newest, seen.own)) seen.own = newest;
		} else {
			seen.team = seen.team || {};
			if (newer(newest, seen.team[group.id])) seen.team[group.id] = newest;
		}
	}
	writeNotesSeen(seen);
	// The Tools tab's Updated and New tool marks, and its What's new count, go with it.
	redrawPanels();
}

const escapeHtml = (text) => String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' })[c]);

// One line of notes, with the bit of Markdown they use (**bold**, `code`, links), through
// Blockbench's own pureMarked, which cleans what it makes. Without it, plain text.
function noteLine(text) {
	if (typeof pureMarked === 'function') {
		try {
			return String(pureMarked(text)).trim().replace(/^<p>([\s\S]*)<\/p>$/, '$1');
		} catch (error) { /* plain text below */ }
	}
	return escapeHtml(text);
}

// The window's contents. Every piece of text from the notes is escaped or cleaned.
function notesHtml(groups) {
	let html = '';
	for (const group of groups) {
		html += '<section class="et-notes-tool"><h2>' + escapeHtml(group.name)
			+ (group.isNew ? ' <span class="et-notes-badge">New</span>' : '') + '</h2>';
		if (group.isNew && group.description) html += '<p class="et-notes-note">' + escapeHtml(group.description) + '</p>';
		if (group.off) html += '<p class="et-notes-note">Switched off on this computer. Switch it on in Tools &gt; EmbodyTools.</p>';
		for (const entry of group.entries) {
			html += '<h3>' + escapeHtml(entry.version + (entry.title ? ': ' + entry.title : '')) + '</h3>';
			const how = entry.categories.filter((category) => category.title === HOW_TO_USE);
			for (const category of how.concat(entry.categories.filter((category) => category.title !== HOW_TO_USE))) {
				html += '<h4' + (category.title === HOW_TO_USE ? ' class="et-notes-how"' : '') + '>' + escapeHtml(category.title) + '</h4><ul>'
					+ category.list.map((line) => '<li>' + noteLine(line) + '</li>').join('') + '</ul>';
			}
		}
		if (group.more) html += '<p class="et-notes-note">And ' + group.more + ' older version' + (group.more === 1 ? '' : 's') + '.</p>';
		html += '</section>';
	}
	return html;
}

// The window itself. `on_close` runs once, however it's closed.
function showNotesDialog(groups, on_close) {
	const html = notesHtml(groups);
	let closed = false;
	const dialog = new Dialog({
		id: 'embodytools_whats_new',
		title: 'What\'s new in EmbodyTools',
		width: 680,
		buttons: ['Got it'],
		notes: groups,
		component: {
			template: '<div class="et-notes"></div>',
			mounted() { this.$el.innerHTML = html; },
		},
		// One button is both confirm and cancel, and onButton follows either.
		onButton() {
			if (closed) return;
			closed = true;
			if (on_close) on_close();
		},
	});
	dialog.show();
	return dialog;
}

const otherDialogOpen = () => typeof Dialog !== 'undefined' && !!Dialog.open;

/*
 * What's new now, from notes already read: the record read fresh, and the team's baseline
 * taken the first time their notes are in.
 */
function currentNews(own, team_notes) {
	const seen = readNotesSeen();
	// Not from an answer with no notes at all, such as an older service's: that would take
	// nothing as seen, and every tool would show as new once the notes come.
	if (!seen.team && team_notes && team_notes.size) {
		seen.team = {};
		for (const [id, entries] of team_notes) seen.team[id] = entries[0].version;
		writeNotesSeen(seen);
	}
	return newNotes(seen, own, team_notes);
}

/*
 * The look at the first project: the notes read, and the window shown if there's anything
 * new. A look that couldn't read the team's notes while online tries again at the next one.
 */
async function lookForNews(generation) {
	if (notes_done || !stillRunning(generation)) return;
	// Whether the team's notes can be read at all depends on the check-in at start.
	for (let waited = 0; team.state === 'checking' && waited < 15000; waited += 300) await new Promise((r) => setTimeout(r, 300));
	const [own, team_notes] = await Promise.all([fetchOwnNotes(), fetchTeamNotes()]);
	if (notes_done || !stillRunning(generation)) return;
	const retry = !team_notes && team.state === 'online';
	if (!currentNews(own, team_notes).length) {
		if (!retry) notes_done = true;
		return;
	}
	for (let waited = 0; otherDialogOpen(); waited += 500) {
		if (waited >= NOTES_WAIT_MS || !stillRunning(generation)) return;
		await new Promise((r) => setTimeout(r, 500));
	}
	if (notes_done || !stillRunning(generation)) return;
	// Again, in case the record changed while another dialog was open.
	const groups = currentNews(own, team_notes);
	if (!groups.length) return;
	notes_done = !retry;
	showNotesDialog(groups, () => markNotesSeen(groups));
}

// Blockbench's select_project: a model opened, made, or its tab picked.
function onProjectSelected() {
	if (notes_done || notes_busy) return;
	notes_busy = true;
	const generation = load_generation;
	setTimeout(() => {
		lookForNews(generation)
			.catch((error) => complain('could not show what\'s new', error))
			.finally(() => { notes_busy = false; });
	}, NOTES_DELAY_MS);
}

// The What's new button: the latest notes of EmbodyTools and every team tool, any time.
async function showLatestNotes() {
	const [own, team_notes] = await Promise.all([fetchOwnNotes(), fetchTeamNotes()]);
	const groups = [];
	const current = own.filter((entry) => compareVersions(entry.version, PLUGIN_VERSION) <= 0);
	if (current.length) groups.push({ id: OWN_NOTES_ID, name: 'EmbodyTools', entries: current.slice(0, 1), more: 0 });
	if (team_notes) {
		const enabled = readEnabled();
		for (const descriptor of team.list) {
			const entries = team_notes.get(descriptor.id);
			if (entries && entries.length) {
				groups.push({ id: descriptor.id, name: descriptor.name || descriptor.id, entries: entries.slice(0, 1), more: 0, off: !enabled.has(descriptor.id) });
			}
		}
	}
	if (!groups.length) {
		Blockbench.showQuickMessage(team.state === 'online' ? 'No release notes to show yet' : 'Sign in to see the team tools\' release notes');
		return null;
	}
	return showNotesDialog(groups, () => markNotesSeen(groups));
}

// ===========================================================================
// ===== THE CARD BROWSER ====================================================
// ===========================================================================

/*
 * Line icons, drawn in the text colour: one for each team tool, one per branch type, and the
 * page's own. They live here, so every tool shows the same set. Fixed strings, never built
 * from anything a tool, a list or the service sends.
 */
const ICON_PATHS = {
	// The tools.
	stretch: '<path d="M5 4.5v15"/><path d="M9 12h11"/><path d="M16.5 8.5L20 12l-3.5 3.5"/>',
	layers: '<path d="M12 4l8 4.2-8 4.2-8-4.2z"/><path d="M4 12.2l8 4.2 8-4.2"/><path d="M4 16l8 4.2 8-4.2"/>',
	lock: '<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8.5 10.5V7.5a3.5 3.5 0 0 1 7 0v3"/>',
	gradient: '<rect x="3.5" y="6.5" width="17" height="11" rx="2"/><path d="M8 6.5v11"/><path d="M12 6.5v11"/><path d="M16 6.5v11"/>',
	drop: '<path d="M12 4c3 3.6 6 7 6 10.2a6 6 0 0 1-12 0C6 11 9 7.6 12 4z"/>',
	board: '<rect x="4" y="4" width="16" height="16" rx="2.5"/><path d="M9.5 4v16"/><path d="M15 4v9"/>',
	sun: '<circle cx="12" cy="12" r="3.5"/><path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8"/>',
	uv: '<path d="M9 3.5h6v5.5h5.5v6H15v5.5H9V15H3.5V9H9z"/>',
	cube: '<path d="M12 3.5l7.5 4.2v8.6L12 20.5l-7.5-4.2V7.7z"/><path d="M4.5 7.7L12 12l7.5-4.3"/><path d="M12 12v8.5"/>',
	globe: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17"/><path d="M12 3.5c2.5 2.6 2.5 14.4 0 17"/><path d="M12 3.5c-2.5 2.6-2.5 14.4 0 17"/>',
	brush: '<path d="M16.5 3.5l4 4L9 19H5v-4z"/><path d="M14 6l4 4"/>',
	scene: '<rect x="3.5" y="5" width="17" height="14" rx="2"/><path d="M3.5 16l4.5-4.5 4 4 2.5-2.5 6 6"/><circle cx="15.5" cy="9.5" r="1.5"/>',
	keyframes: '<path d="M7 8.5l3.5 3.5L7 15.5 3.5 12z"/><path d="M17 8.5l3.5 3.5-3.5 3.5-3.5-3.5z"/><path d="M10.5 12h3"/>',
	octagon: '<path d="M8.6 3.5h6.8l5.1 5.1v6.8l-5.1 5.1H8.6l-5.1-5.1V8.6z"/>',
	figure: '<rect x="9.5" y="3" width="5" height="5" rx="1"/><rect x="8.5" y="9.5" width="7" height="6.5" rx="1"/><path d="M8.5 11H6v4.5"/><path d="M15.5 11H18v4.5"/><path d="M10.5 16v4.5"/><path d="M13.5 16v4.5"/>',
	// The branch types: a tool's default branch, any other branch, and a pinned tag or commit.
	// An outside tool, which loads from its author's link, has no branches and shows `link`.
	main: '<path d="M12 3v5.5"/><circle cx="12" cy="12" r="3.5"/><path d="M12 15.5V21"/>',
	branch: '<path d="M6 3v12"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/>',
	pinned: '<path d="M3.5 12.3V4.5a1 1 0 0 1 1-1h7.8l8.2 8.2-8.8 8.8z"/><circle cx="8.2" cy="8.2" r="1.4"/>',
	link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1.2 1.2"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1.2-1.2"/>',
	// The page.
	search: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>',
	plus: '<path d="M12 5v14M5 12h14"/>',
	refresh: '<path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3"/><path d="M19.5 4.5v4.5H15"/>',
	sparkle: '<path d="M12 3.5l1.9 5.1 5.1 1.9-5.1 1.9-1.9 5.1-1.9-5.1-5.1-1.9 5.1-1.9z"/>',
	shield: '<path d="M12 3.5l7 2.8v5c0 4.4-2.9 7.6-7 9.2-4.1-1.6-7-4.8-7-9.2v-5z"/><path d="M9 12l2.2 2.2L15.5 10"/>',
	folder: '<path d="M3.5 7.5a2 2 0 0 1 2-2h4l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/>',
	chevron: '<path d="M6 9l6 6 6-6"/>',
	cloud: '<path d="M7.5 18.5h9.6a4 4 0 0 0 .3-8 5.5 5.5 0 0 0-10.6-.9A4.5 4.5 0 0 0 7.5 18.5z"/>',
	saved: '<path d="M12 4.5v9"/><path d="M8 10l4 4 4-4"/><path d="M5 15.5V18a1.5 1.5 0 0 0 1.5 1.5h11A1.5 1.5 0 0 0 19 18v-2.5"/>',
	copy: '<rect x="8.5" y="8.5" width="11" height="11" rx="2"/><path d="M15.5 8.5V6A1.5 1.5 0 0 0 14 4.5H6A1.5 1.5 0 0 0 4.5 6v8A1.5 1.5 0 0 0 6 15.5h2.5"/>',
	check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
};

// Each team tool's icon, and the outside tools'. A tool not listed here gets one from its tags.
const TOOL_ICONS = {
	anchored_stretch: 'stretch',
	delta_layers: 'layers',
	unleakylayers: 'lock',
	gradient_map_layer: 'gradient',
	huepainting: 'drop',
	embody_jira: 'board',
	dodge_blend_modes: 'sun',
	easyboxuv: 'uv',
	adrullanmodel: 'cube',
	wynncraft_content_tools: 'globe',
	preview_scene_customiser: 'scene',
	geckolib: 'keyframes',
	shape_generator: 'octagon',
	hytale_plugin: 'figure',
};
const TAG_ICONS = [['format', 'cube'], ['uv', 'uv'], ['transform', 'stretch'], ['jira', 'board'], ['workflow', 'board'],
	['layers', 'layers'], ['color', 'drop'], ['colour', 'drop'], ['paint', 'brush'], ['texturing', 'brush'], ['texture', 'brush']];
const TOOL_ICON_NAMES = new Set(['stretch', 'layers', 'lock', 'gradient', 'drop', 'board', 'sun', 'uv', 'cube', 'globe', 'brush',
	'scene', 'keyframes', 'octagon', 'figure']);

function svgIcon(name, className, tag) {
	const node = document.createElement(tag || 'span');
	node.className = 'et-svg' + (className ? ' ' + className : '');
	node.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"'
		+ ' stroke-linejoin="round" aria-hidden="true" focusable="false">' + (ICON_PATHS[name] || '') + '</svg>';
	return node;
}

// A tool's icon: its own, the one an outside list names, or one from its tags. Null for its letter.
function toolIcon(descriptor) {
	if (Object.prototype.hasOwnProperty.call(TOOL_ICONS, descriptor.id)) return TOOL_ICONS[descriptor.id];
	if (TOOL_ICON_NAMES.has(descriptor.icon)) return descriptor.icon;
	const tags = (descriptor.tags || []).map((tag) => String(tag).toLowerCase());
	const match = TAG_ICONS.find(([tag]) => tags.includes(tag));
	return match ? match[1] : null;
}

/*
 * Each tool's own icon, the one it gives Blockbench, shown in its row in place of the line
 * icon (David, 2026-10-04): a picture, as a data: URL or a .png or .svg file next to an outside
 * tool's own file, or the name of an icon Blockbench draws itself (Material, Font Awesome or
 * Blockbench's own), drawn by Blockbench.getIconNode as Blockbench draws a plugin's. It comes
 * from the first of these that knows it:
 *  - the tool running here: what it registered (adaptPlugin);
 *  - the last time it ran on this computer (ICONS_KEY), so a tool that's off keeps it;
 *  - for an outside tool from Blockbench's own plugin repo, that store's entry for it, which
 *    Blockbench reads at start before it loads any plugin (storeIcon).
 * A team tool that hasn't run on this computer yet, and any tool that gives none, keeps its line
 * icon. Nothing a tool gives is ever HTML here: a picture goes in an img's src and a name through
 * getIconNode, and only once cleanIcon has taken it.
 */
const ICONS_KEY = 'embodytools.tool_icons';
const ICON_PICTURE = /^data:image\/(?:png|jpeg|gif|webp|svg\+xml)[;,]/;
const ICON_PICTURE_MAX = 200000;
const ICON_FILE = /^[A-Za-z0-9_-][A-Za-z0-9_.-]{0,79}\.(?:png|svg)$/;
const ICON_NAME = /^(?:[a-z0-9_]{1,64}|(?:fa[rsb]\.)?fa-[a-z0-9-]{1,64}|icon-[a-z0-9_-]{1,64})$/;
// Blockbench's plain plugin piece says nothing about a tool, so the line icon stays for it.
const NO_OWN_ICON = new Set(['', 'extension']);
// Where Blockbench's own plugin store keeps its plugins' files, directly or through its CDN.
const STORE_FILES = /^https:\/\/(?:raw\.githubusercontent\.com\/JannisX11\/blockbench-plugins\/|cdn\.jsdelivr\.net\/gh\/JannisX11\/blockbench-plugins[@/])/;
// Pictures that didn't load this session, offline or gone, so a redraw doesn't ask again.
const broken_icons = new Set();
let saved_icons = null;

function cleanIcon(icon) {
	if (typeof icon !== 'string' || NO_OWN_ICON.has(icon)) return null;
	if (ICON_PICTURE.test(icon)) return icon.length <= ICON_PICTURE_MAX ? icon : null;
	return ICON_FILE.test(icon) || ICON_NAME.test(icon) ? icon : null;
}

function savedIcons() {
	if (!saved_icons) {
		try {
			const saved = JSON.parse(localStorage.getItem(ICONS_KEY) || '{}');
			saved_icons = saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : {};
		} catch (error) {
			saved_icons = {};
		}
	}
	return saved_icons;
}

const savedIcon = (id) => (Object.prototype.hasOwnProperty.call(savedIcons(), id) ? cleanIcon(savedIcons()[id]) : null);

// What a tool registered, kept for when it's off. One that registers none forgets the old one.
function rememberIcon(id, icon) {
	if (typeof id !== 'string' || id === '__proto__') return;
	const clean = cleanIcon(icon);
	if (savedIcon(id) === clean) return;
	const saved = savedIcons();
	if (clean) saved[id] = clean;
	else delete saved[id];
	try {
		localStorage.setItem(ICONS_KEY, JSON.stringify(saved));
	} catch (error) {
		grumble('could not remember the icon of ' + id, error);
	}
}

// An icon file sits next to the tool's own file: only for a tool from an https link, and only on
// that host. A team tool's repo is private, so a team tool's picture has to be a data: URL.
function iconFileUrl(file, descriptor) {
	if (descriptor.team || typeof descriptor.url !== 'string' || !/^https:\/\//i.test(descriptor.url)) return null;
	try {
		const base = new URL(descriptor.url);
		const url = new URL(file, base);
		return url.protocol === 'https:' && url.host === base.host ? url.href : null;
	} catch (error) {
		return null;
	}
}

// An outside tool from Blockbench's own plugin repo, before it has run here: the icon in
// Blockbench's store list (Plugins.json), which Blockbench reads before it loads any plugin.
function storeIcon(descriptor) {
	if (descriptor.team || typeof descriptor.url !== 'string' || !STORE_FILES.test(descriptor.url)) return null;
	const list = typeof Plugins !== 'undefined' && Plugins ? Plugins.json : null;
	if (!list || typeof list !== 'object' || !Object.prototype.hasOwnProperty.call(list, descriptor.id)) return null;
	const listed = list[descriptor.id];
	return listed && typeof listed === 'object' ? cleanIcon(listed.icon) : null;
}

// A tool's own icon as { picture } (an img's src) or { name } (for getIconNode), or null for its
// line icon.
function ownIcon(descriptor) {
	const entry = live.get(descriptor.id);
	const icon = (entry && entry.module ? cleanIcon(entry.module.icon) : null) || savedIcon(descriptor.id) || storeIcon(descriptor);
	if (!icon) return null;
	const picture = ICON_FILE.test(icon) ? iconFileUrl(icon, descriptor) : ICON_PICTURE.test(icon) ? icon : null;
	if (picture) return broken_icons.has(picture) ? null : { picture: picture };
	return ICON_NAME.test(icon) ? { name: icon } : null;
}

// The tool's own icon for its tile, or null. A picture that won't load puts back what `fallback`
// draws there, and isn't asked for again this session.
function ownIconNode(descriptor, fallback) {
	const icon = ownIcon(descriptor);
	if (!icon) return null;
	if (icon.picture) {
		const img = document.createElement('img');
		img.className = 'et-own-icon';
		img.alt = '';
		img.draggable = false;
		img.decoding = 'async';
		img.referrerPolicy = 'no-referrer';
		img.addEventListener('load', () => {
			// Pixel art smaller than the tile stays sharp when it's drawn larger.
			if (img.naturalWidth && img.naturalWidth < 32) img.classList.add('et-pixelated');
		});
		img.addEventListener('error', () => {
			broken_icons.add(icon.picture);
			if (img.parentNode) fallback(img.parentNode);
		});
		img.src = icon.picture;
		return img;
	}
	if (typeof Blockbench === 'undefined' || !Blockbench || typeof Blockbench.getIconNode !== 'function') return null;
	try {
		const node = Blockbench.getIconNode(icon.name);
		node.classList.add('et-own-icon');
		return node;
	} catch (error) {
		return null;
	}
}

/*
 * What a branch is, for its icon: the tool's default branch ('main'), any other branch or build
 * ('branch'), or the tag or commit its entry in team-tools.json is pinned to ('pinned'). The
 * service lists no branches for a pinned tool and gives the pin as its default. A list it
 * couldn't read is empty too, so then the default's name decides: a version or a commit.
 */
const PINNED_REF = /^(?:v?\d+(?:\.\d+)+(?:[-+][0-9A-Za-z.-]+)?|[0-9a-f]{7,40})$/;
function branchKind(info, value) {
	if (value) return 'branch';
	if (info && !info.branches.includes(info.default) && PINNED_REF.test(info.default)) return 'pinned';
	return 'main';
}

// The line under a branch in the open picker, what it is, and its tooltip, which says more.
function branchNote(option) {
	if (option.kind === 'pinned') return 'Pinned, everyone stays on this version';
	if (option.kind === 'main') return 'Default, everyone gets this';
	if (option.missing) return 'Not listed any more';
	return 'Try changes before they ship';
}

function branchHint(option) {
	if (option.kind === 'pinned') return 'The team list holds everyone on ' + option.label;
	if (option.kind === 'main') return 'Load it from ' + option.label + ', the branch everyone gets';
	if (option.missing) return 'Picked on this computer before, but the tool\'s repo doesn\'t list it any more';
	return 'Load it from ' + option.label + ', on this computer only';
}

// The branch in use, as an opened row says it.
function branchWhere(option) {
	if (option.kind === 'pinned') return 'pinned, everyone stays on this version';
	if (option.kind === 'main') return 'the default, everyone gets this';
	if (option.missing) return 'picked here, not listed any more';
	return 'picked on this computer only';
}

/*
 * The release notes behind the Tools tab's badges: which tools have something new since What's
 * new last showed, and each team tool's latest version, shown while it's off. Read the first
 * time the tab is drawn, again once signed in if it was drawn before that, and on Refresh.
 * { own, team, state }: own and team as fetchOwnNotes and fetchTeamNotes give them, and the
 * sign-in state they were read in.
 */
let panel_notes = null;
let panel_notes_loading = null;

function refreshPanelNotes() {
	if (!panel_notes_loading) {
		const state = team.state;
		panel_notes_loading = Promise.all([fetchOwnNotes(), fetchTeamNotes()])
			.then(([own, team_notes]) => { panel_notes = { own: own, team: team_notes, state: state }; })
			.catch((error) => {
				grumble('could not read the release notes for the Tools tab', error && error.message);
				panel_notes = { own: [], team: null, state: state };
			})
			.finally(() => {
				panel_notes_loading = null;
				redrawPanels();
			});
	}
	return panel_notes_loading;
}

// A team tool's latest release notes, for its row: { version, title, date, categories } or null.
function latestNotes(id) {
	const entries = panel_notes && panel_notes.team ? panel_notes.team.get(id) : null;
	return entries && entries.length ? entries[0] : null;
}

// Its latest version from them, for its row while it isn't running.
function latestNotedVersion(id) {
	const latest = latestNotes(id);
	return latest ? latest.version : '';
}

/*
 * What a tool's row shows when it's opened, sorted (David, 2026-10-04: "less a wall of
 * information"). `chips`, at a glance: whether it runs and which version, a newer release
 * when there is one, its branch, and where it loads from. `about`, the rest: who made it, its
 * tags, what it needs, file access said in full, its link (outside tools only; the team's
 * repos are private) and its id, for saying which tool a problem is with. buildCardPanel draws the
 * chips on top and the latest release notes beside `about`. Apart from the drawing, so the
 * harness checks it.
 */
const SOURCE_CHIPS = {
	service: { icon: 'cloud', text: 'Embody service', title: 'Loads from the Embody access service' },
	'offline copy': { icon: 'saved', text: 'Offline copy', title: 'Runs from the copy saved on this computer, while offline' },
	network: { icon: 'link', text: 'Author\'s link', title: 'Loads from its author\'s own link' },
	cache: { icon: 'saved', text: 'Copy from last time', title: 'Its link didn\'t answer, so the copy from last time runs' },
	'local file': { icon: 'folder', text: 'File on this computer', title: 'Read from a file on this computer' },
	local: { icon: 'link', text: 'Added on this computer', title: 'Loads from a link added on this computer' },
};
const BRANCH_SHORT = { main: 'default', branch: 'this computer only', pinned: 'pinned' };
const VARIANT_TEXT = { desktop: 'the desktop app', web: 'the web app' };
const MORE_NOTE_LINES = 4; // of each part of the latest notes, in an opened row

function toolSummary(descriptor) {
	const entry = live.get(descriptor.id);
	const module = entry && entry.module;
	const state = stateOf(descriptor.id);
	const version = module && module.version ? String(module.version) : '';
	const chips = [];

	const status = {
		on: { tone: 'good', text: version ? 'Running ' + version : 'Running' },
		loading: { tone: '', text: 'Loading' },
		error: { tone: 'bad', text: 'Failed' },
		blocked: { tone: 'warn', text: 'Blocked' },
		locked: { tone: '', icon: 'lock', text: 'Locked' },
	}[state.status] || { tone: 'off', text: 'Off' };
	chips.push(Object.assign({ key: 'status', title: state.detail || '' }, status));

	const picker = branchPicker(descriptor);
	const current = picker ? (picker.options.find((option) => option.value === picker.value) || picker.options[0]) : null;
	// A newer release than the one running, on the default branch: Refresh loads it.
	const latest = descriptor.team ? latestNotes(descriptor.id) : null;
	if (state.status === 'on' && latest && version && (!current || current.kind === 'main')
		&& compareVersions(latest.version, version) > 0) {
		chips.push({ key: 'update', icon: 'sparkle', tone: 'new', text: latest.version + ' is out', title: 'Refresh loads it' });
	}
	if (current) {
		chips.push({ key: 'branch', icon: current.kind, tone: current.kind === 'branch' ? 'blue' : '',
			text: current.label + ' \u00b7 ' + (current.missing ? 'not listed any more' : BRANCH_SHORT[current.kind]),
			title: branchHint(current) });
	}
	let source = SOURCE_CHIPS[state.origin];
	if (descriptor.local && (!source || state.origin === 'network')) source = SOURCE_CHIPS.local;
	if (!source) source = descriptor.team ? SOURCE_CHIPS.service : SOURCE_CHIPS.network;
	chips.push(Object.assign({ key: 'source', tone: '' }, source));

	const about = [];
	const add = (label, value, kind) => { if (value && value.length) about.push({ label, value, kind: kind || 'text' }); };
	add('Made by', descriptor.author || (module && module.author) || '');
	add('Tags', (descriptor.tags || []).map(String), 'tags');
	add('Needs', [module && module.min_version ? 'Blockbench ' + module.min_version + ' or newer' : '',
		module && VARIANT_TEXT[module.variant] ? VARIANT_TEXT[module.variant] + ' only' : ''].filter(Boolean).join(', '));
	// The row's own File access mark, said in full.
	if (descriptor.native === true) add('File access', 'Can read and write files on this computer');
	if (!descriptor.team && descriptor.url) add('Link', descriptor.url, 'link');
	add('Tool id', descriptor.id, 'code');
	return { chips, about };
}

const BROWSER_CSS = `
/*
 * The Tools tab and the EmbodyTools dialog. The account and the toolbar sit on top, and under
 * them every tool is a row, in three groups. Colours come from the Blockbench theme in use.
 * Blockbench styles bare buttons, inputs and headings in its base layer, and this sheet is in
 * the plugin layer above it, so anything set here wins, but anything not set here is still
 * Blockbench's: every button below sets each thing Blockbench's sets.
 */
.et-browser, .et-branch-list {
	--et-muted: color-mix(in srgb, var(--color-subtle_text) 65%, var(--color-text));
	--et-blue: color-mix(in srgb, var(--color-accent) 40%, var(--color-light));
	--et-new: #e5c07b;
	--et-bad: #ff8f7a;
	--et-good: #7ccf8b;
}
.et-browser {
	display: flex; flex-direction: column; min-height: 0;
	font-size: 13px; line-height: 1.4; color: var(--color-text);
}
.et-top { flex: none; display: flex; flex-direction: column; gap: 12px; }
.et-scroll { display: flex; flex-direction: column; gap: 18px; min-height: 0; overflow-y: auto; }
/*
 * On the plugin page the panel takes what's left under Blockbench's header and tabs, and only
 * the list scrolls, so the sign-in and the search stay in view however many tools there are.
 */
.et-page { flex: 1 1 auto; min-height: 0; overflow: hidden; }
.et-page .et-top { padding: 14px 24px 12px; border-bottom: 1px solid var(--color-border); }
.et-page .et-scroll { flex: 1 1 auto; padding: 14px 24px 24px; }
/* In the dialog, which has its own margins. */
.et-browser:not(.et-page) { gap: 12px; }
.et-browser:not(.et-page) .et-scroll { max-height: 62vh; padding: 2px 4px 4px 2px; }

/* Line icons, in the text colour. */
.et-svg { display: inline-flex; flex: none; width: 16px; height: 16px; }
.et-svg svg { display: block; width: 100%; height: 100%; }

/* The account. */
.et-account {
	display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; padding: 9px 12px;
	border-radius: 10px; background: var(--color-back); border: 1px solid var(--color-border);
}
.et-account-bad { border-color: var(--et-bad); }
.et-avatar {
	flex: none; display: grid; place-items: center; width: 34px; height: 34px; border-radius: 50%;
	background: var(--color-button); color: var(--color-light); font-size: 12.5px; font-weight: 600;
}
.et-avatar .et-svg { width: 17px; height: 17px; color: var(--et-muted); }
.et-account-text { flex: 1 1 240px; min-width: 0; }
.et-account-title { font-size: 13px; color: var(--color-light); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.et-account-title b { font-weight: 600; }
.et-account-email { margin-left: 6px; color: var(--et-muted); }
.et-account-sub { display: flex; align-items: center; gap: 5px; margin-top: 1px; font-size: 12px; color: var(--et-muted); }
.et-account-sub .et-svg { width: 13px; height: 13px; color: var(--color-accent); }

/* Buttons. */
.et-btn {
	display: inline-flex; align-items: center; justify-content: center; gap: 7px; flex: none;
	height: 32px; min-height: 32px; width: auto; min-width: 0; margin: 0; padding: 0 12px; box-sizing: border-box;
	border-radius: 8px; border: 1px solid var(--color-button); box-shadow: none;
	background: color-mix(in srgb, var(--color-button) 60%, var(--color-ui)); color: var(--color-text);
	font-size: 13px; font-weight: normal; line-height: 1; white-space: nowrap; text-decoration: none; cursor: pointer;
}
.et-btn:hover { background: var(--color-button); color: var(--color-light); }
.et-btn:focus { text-decoration: none; }
.et-btn:focus-visible { outline: 1px solid var(--color-accent); outline-offset: 1px; }
.et-btn:disabled { opacity: .5; cursor: default; }
.et-btn .et-svg { width: 15px; height: 15px; }
.et-btn-primary, .et-btn-primary:hover { background: var(--color-accent); border-color: var(--color-accent); color: var(--color-accent_text); }
.et-btn-primary:hover { filter: brightness(1.08); }
.et-btn-quiet { background: transparent; }
.et-btn-small { height: 28px; min-height: 28px; padding: 0 10px; border-radius: 6px; font-size: 12px; }
.et-btn-icon { width: 32px; padding: 0; }
.et-news .et-svg { color: var(--et-new); }
.et-count {
	display: inline-grid; place-items: center; min-width: 18px; height: 18px; padding: 0 5px; box-sizing: border-box;
	border-radius: 9px; background: var(--et-new); color: #1a1a1a; font-size: 11px; font-weight: 700;
}
.et-spin .et-svg { animation: et-spin 0.9s linear infinite; }
@keyframes et-spin { to { transform: rotate(360deg); } }

/* The toolbar. */
.et-bar { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.et-search {
	flex: 1 1 200px; min-width: 0; display: flex; align-items: center; gap: 8px; height: 32px; padding: 0 11px;
	box-sizing: border-box; border-radius: 8px; background: var(--color-back); border: 1px solid var(--color-border);
	color: var(--et-muted);
}
.et-search:focus-within { border-color: var(--color-accent); }
.et-search .et-svg { width: 15px; height: 15px; }
.et-search input {
	flex: 1; min-width: 0; height: 100%; margin: 0; padding: 0; border: none; background: transparent;
	color: var(--color-text); font-size: 13px; outline: none;
}
.et-search input::placeholder { color: var(--et-muted); opacity: 1; }
.et-seg {
	display: inline-flex; flex: none; gap: 2px; padding: 2px; box-sizing: border-box; border-radius: 8px;
	background: var(--color-back); border: 1px solid var(--color-border);
}
.et-seg button {
	height: 26px; min-height: 26px; width: auto; min-width: 0; margin: 0; padding: 0 10px; box-sizing: border-box;
	border: none; border-radius: 6px; box-shadow: none; background: transparent; color: var(--et-muted);
	font-size: 12.5px; font-weight: normal; line-height: 1; text-decoration: none; cursor: pointer;
}
.et-seg button:hover { background: transparent; color: var(--color-light); }
.et-seg button.et-on, .et-seg button.et-on:hover { background: var(--color-button); color: var(--color-light); }
.et-seg button:focus { text-decoration: none; }

/* The groups and their rows. */
.et-section { display: flex; flex-direction: column; gap: 8px; }
.et-section-head { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; padding: 0 4px; }
.et-section-title { font-size: 11.5px; font-weight: 600; letter-spacing: .06em; text-transform: uppercase; color: var(--color-text); }
.et-section-count { margin-left: 6px; font-weight: normal; letter-spacing: 0; color: var(--et-muted); }
.et-section-note { font-size: 12px; color: var(--et-muted); }
.et-list { border-radius: 10px; background: var(--color-back); border: 1px solid var(--color-border); overflow: hidden; }
.et-row {
	display: grid; grid-template-columns: 32px minmax(0, 1fr) auto 40px 20px; align-items: center; gap: 10px 12px;
	min-height: 58px; padding: 9px 10px 9px 12px; box-sizing: border-box; cursor: pointer;
}
.et-row + .et-row { border-top: 1px solid var(--color-ui); }
.et-row:hover { background: color-mix(in srgb, var(--color-button) 22%, transparent); }
/* Opened: the description or what's wrong in full, then more about the tool (.et-more). */
.et-row.et-expanded, .et-row.et-expanded:hover { background: color-mix(in srgb, var(--color-button) 16%, transparent); }
.et-row.et-expanded .et-line2 { white-space: normal; overflow: visible; }
.et-row.et-busy { opacity: .6; }
.et-tile {
	display: grid; place-items: center; width: 32px; height: 32px; border-radius: 8px; overflow: hidden;
	background: var(--color-ui); color: var(--et-muted); font-size: 14px; font-weight: 700; text-transform: uppercase;
}
.et-row.et-is-on .et-tile { background: var(--color-button); color: var(--color-light); }
.et-row.et-locked .et-tile, .et-row.et-locked .et-name { opacity: .7; }
.et-tile .et-svg { width: 18px; height: 18px; }
/*
 * A tool's own icon (ownIconNode): a picture takes the whole tile with no box behind it, as
 * Blockbench shows a plugin's picture; one Blockbench draws sits in the box like a line icon.
 */
.et-row .et-tile.et-has-picture, .et-row.et-is-on .et-tile.et-has-picture { background: none; }
.et-tile img.et-own-icon { display: block; width: 100%; height: 100%; object-fit: contain; }
.et-tile img.et-own-icon.et-pixelated { image-rendering: pixelated; }
.et-tile .et-own-icon:not(img) {
	width: auto; max-width: none; height: auto; margin: 0; padding: 0;
	font-size: 20px; line-height: 1; text-transform: none; color: inherit;
}
.et-tile .fa_big.et-own-icon { font-size: 17px; }
.et-main { min-width: 0; }
.et-line1 { display: flex; flex-wrap: wrap; align-items: center; gap: 3px 8px; }
.et-name { font-size: 13.5px; font-weight: 600; color: var(--color-text); }
.et-row.et-is-on .et-name { color: var(--color-light); }
.et-meta { font-size: 12px; color: var(--et-muted); }
.et-line2 { margin-top: 2px; font-size: 12px; color: var(--et-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.et-line2 .et-svg { display: inline-block; width: 12px; height: 12px; margin-right: 5px; vertical-align: -2px; }
.et-line2.et-bad { color: var(--et-bad); }
.et-line2.et-warn { color: var(--et-new); }
.et-chip {
	display: inline-flex; align-items: center; gap: 4px; height: 20px; padding: 0 7px; box-sizing: border-box;
	border-radius: 10px; border: 1px solid var(--color-button); background: var(--color-ui); color: var(--et-muted);
	font-size: 11px; line-height: 1; white-space: nowrap;
}
.et-chip .et-svg { width: 12px; height: 12px; }
.et-chip-new {
	border-color: color-mix(in srgb, var(--et-new) 40%, transparent);
	background: color-mix(in srgb, var(--et-new) 14%, transparent); color: var(--et-new);
}

/*
 * The branch picker: the branch's icon by type, its name, and a list of the others. Blue when
 * this computer isn't on the tool's default, and edged in blue while its list is open.
 */
.et-branch {
	justify-self: end; display: inline-flex; align-items: center; gap: 6px;
	height: 28px; min-height: 28px; width: auto; min-width: 0; max-width: 190px; margin: 0; padding: 0 7px 0 8px;
	box-sizing: border-box; border-radius: 6px; border: 1px solid var(--color-button); box-shadow: none;
	background: var(--color-ui); color: var(--et-muted); font-size: 12px; font-weight: normal; line-height: 1;
	text-decoration: none; cursor: pointer;
}
.et-branch:hover { background: var(--color-ui); color: var(--color-light); border-color: var(--color-accent); }
.et-branch:focus { text-decoration: none; }
.et-branch:focus-visible { outline: 1px solid var(--color-accent); outline-offset: 1px; }
.et-branch .et-svg { width: 14px; height: 14px; }
.et-branch .et-chev { width: 13px; height: 13px; opacity: .8; transition: transform .12s ease; }
.et-branch-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.et-branch.et-open { border-color: var(--color-accent); color: var(--color-light); }
.et-branch.et-open .et-chev { transform: rotate(180deg); }
.et-branch.et-off-default, .et-branch.et-off-default:hover {
	border-color: var(--color-accent); background: color-mix(in srgb, var(--color-accent) 16%, transparent);
	color: var(--et-blue);
}
.et-branch:disabled { opacity: .55; cursor: default; }
.et-branch:disabled:hover { color: var(--et-muted); border-color: var(--color-button); }
.et-branch.et-off-default:disabled:hover { color: var(--et-blue); border-color: var(--color-accent); }

/*
 * The picker, open: every branch with its type's icon and a line on what it is, the one in use
 * ticked. It hangs from document.body, above the dialogs as Blockbench's own menus are (those
 * at z-index 30, dialogs from 21 to 29), so neither the list's scrolling nor a dialog's edge
 * cuts it off. Its items are buttons, so each sets what Blockbench's bare buttons set.
 */
.et-branch-list {
	position: fixed; z-index: 30; top: 0; left: 0; box-sizing: border-box;
	display: flex; flex-direction: column; gap: 2px;
	width: max-content; min-width: 264px; max-width: min(340px, calc(100vw - 16px));
	max-height: calc(100vh - 16px); overflow-y: auto;
	margin: 0; padding: 4px; border-radius: 8px;
	border: 1px solid var(--color-selected);
	background: color-mix(in srgb, var(--color-button) 55%, var(--color-ui));
	box-shadow: 0 10px 28px rgba(0, 0, 0, .45);
	font-size: 13px; line-height: 1.35; color: var(--color-text);
}
.et-branch-item {
	display: flex; align-items: center; gap: 10px; flex: none;
	width: 100%; min-width: 0; height: auto; min-height: 44px; margin: 0; padding: 6px 10px; box-sizing: border-box;
	border: none; border-radius: 6px; box-shadow: none; outline: none;
	background: transparent; color: var(--color-light); text-align: left;
	font-size: 13px; font-weight: normal; line-height: 1.35; text-decoration: none; cursor: pointer;
}
.et-branch-item:hover, .et-branch-item:focus-visible { background: color-mix(in srgb, var(--color-selected) 70%, transparent); color: var(--color-light); }
.et-branch-item:focus { text-decoration: none; }
.et-branch-item:focus-visible { box-shadow: inset 0 0 0 1px var(--color-accent); }
.et-branch-item.et-current, .et-branch-item.et-current:hover { background: var(--color-selected); }
.et-branch-item > .et-svg { width: 16px; height: 16px; color: var(--color-text); }
.et-branch-item.et-kind-branch > .et-svg { color: var(--et-blue); }
.et-branch-item > .et-check { width: 15px; height: 15px; color: var(--et-blue); }
.et-branch-item-text { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
.et-branch-item-name, .et-branch-item-note { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.et-branch-item-name { font-size: 13px; color: var(--color-light); }
.et-branch-item-note { font-size: 11.5px; color: var(--et-muted); }
.et-branch-item:hover .et-branch-item-note, .et-branch-item:focus-visible .et-branch-item-note,
.et-branch-item.et-current .et-branch-item-note { color: color-mix(in srgb, var(--color-subtle_text) 40%, var(--color-text)); }
/*
 * The arrow at a row's end that opens it, as a click anywhere else on the row does: pointing
 * right while closed and down while open.
 */
.et-expand {
	justify-self: center; display: grid; place-items: center;
	width: 20px; min-width: 20px; height: 28px; min-height: 28px; margin: 0; padding: 0; box-sizing: border-box;
	border: none; border-radius: 6px; box-shadow: none; background: transparent; color: var(--et-muted);
	font-size: 12px; font-weight: normal; line-height: 1; text-decoration: none; cursor: pointer;
}
.et-expand:hover, .et-row:hover .et-expand { background: transparent; color: var(--color-light); }
.et-expand:focus { text-decoration: none; }
.et-expand:focus-visible { outline: 1px solid var(--color-accent); outline-offset: 1px; }
.et-expand .et-svg { width: 16px; height: 16px; transform: rotate(-90deg); transition: transform .15s ease; }
.et-row.et-expanded .et-expand .et-svg { transform: none; }

/*
 * More about a tool, under its name, in an opened row, sorted: chips at a glance, then the
 * latest release notes beside an About part, side by side when there's room. Its text can be
 * selected and copied.
 */
.et-more {
	grid-column: 2 / -1; display: flex; flex-direction: column; gap: 14px;
	margin: 0 0 3px; padding: 14px 16px 16px; box-sizing: border-box; border-radius: 10px;
	background: var(--color-ui); border: 1px solid var(--color-border);
	cursor: auto; user-select: text; -webkit-user-select: text; container-type: inline-size;
	font-size: 12.5px; line-height: 1.45; color: var(--color-text);
}
.et-more.et-reveal { animation: et-reveal .16s ease-out; }
@keyframes et-reveal { from { opacity: 0; transform: translateY(-4px); } }
.et-more-text { margin: 0; }

/* At a glance. A dot for the state, or the icon of what the chip is about. */
.et-more-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.et-pill {
	display: inline-flex; align-items: center; gap: 6px; height: 24px; padding: 0 10px 0 8px; box-sizing: border-box;
	border-radius: 12px; border: 1px solid var(--color-button); background: var(--color-back);
	color: var(--color-text); font-size: 12px; line-height: 1; white-space: nowrap;
}
.et-pill .et-svg { width: 13px; height: 13px; color: var(--et-muted); }
.et-pill-dot { flex: none; width: 7px; height: 7px; border-radius: 50%; background: var(--et-muted); }
.et-pill.et-good .et-pill-dot { background: var(--et-good); box-shadow: 0 0 0 3px color-mix(in srgb, var(--et-good) 18%, transparent); }
.et-pill.et-bad { border-color: color-mix(in srgb, var(--et-bad) 55%, transparent); color: var(--et-bad); }
.et-pill.et-bad .et-pill-dot { background: var(--et-bad); }
.et-pill.et-warn, .et-pill.et-new { border-color: color-mix(in srgb, var(--et-new) 45%, transparent); color: var(--et-new); }
.et-pill.et-warn .et-pill-dot { background: var(--et-new); }
.et-pill.et-new .et-svg { color: var(--et-new); }
.et-pill.et-blue { border-color: var(--color-accent); background: color-mix(in srgb, var(--color-accent) 14%, transparent); color: var(--et-blue); }
.et-pill.et-blue .et-svg { color: var(--et-blue); }

/* The notes beside the About part, or the About part alone. One above the other when narrow. */
.et-more-body { display: grid; grid-template-columns: minmax(0, 1.6fr) minmax(220px, 1fr); gap: 14px 24px; }
.et-more-body.et-single { grid-template-columns: minmax(0, 1fr); }
.et-more-body:not(.et-single) .et-more-about { padding-left: 22px; border-left: 1px solid var(--color-back); }
@container (max-width: 520px) {
	.et-more-body { grid-template-columns: minmax(0, 1fr); }
	.et-more-body:not(.et-single) .et-more-about { padding: 12px 0 0; border-left: none; border-top: 1px solid var(--color-back); }
}
.et-more-heading {
	display: flex; align-items: baseline; gap: 8px; margin-bottom: 7px;
	font-size: 11px; font-weight: 600; letter-spacing: .06em; text-transform: uppercase; color: var(--et-muted);
}
.et-more-heading-note { font-weight: normal; letter-spacing: 0; text-transform: none; }
.et-more-notes { min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.et-more-notes-title { margin-bottom: 2px; font-size: 13px; font-weight: 600; color: var(--color-light); }
.et-more-notes-cat {
	margin-top: 6px; font-size: 11px; font-weight: 600; letter-spacing: .05em; text-transform: uppercase; color: var(--et-muted);
}
.et-more-notes-cat.et-how { color: var(--et-blue); }
/* Blockbench's reset layer takes every li's bullet away, so each list here puts it back. */
.et-more-notes ul { margin: 0 0 0 18px; padding: 0; }
.et-more-notes li { margin: 1px 0; list-style: disc; }
.et-more-notes-more { font-size: 12px; color: var(--et-muted); }
.et-more-about { min-width: 0; }
.et-about { display: grid; grid-template-columns: max-content minmax(0, 1fr); align-items: baseline; gap: 6px 14px; }
/* The thin line between two rows: a grid row of its own across both columns, so the baselines stay put. */
.et-about-line { grid-column: 1 / -1; height: 1px; background: var(--color-back); }
.et-about-label { color: var(--et-muted); }
.et-about-value { min-width: 0; display: flex; flex-wrap: wrap; align-items: center; gap: 4px 6px; overflow-wrap: anywhere; }
.et-about-link { min-width: 0; color: var(--color-text); }
.et-about-code {
	padding: 1px 6px; border-radius: 4px; background: var(--color-back); border: 1px solid var(--color-border);
	font-family: var(--font-code, monospace); font-size: 11.5px; color: var(--color-light);
}
.et-tag {
	display: inline-flex; align-items: center; height: 20px; padding: 0 8px; box-sizing: border-box; border-radius: 10px;
	background: var(--color-back); border: 1px solid var(--color-button); font-size: 11.5px; line-height: 1; color: var(--color-text);
}
.et-copy {
	display: inline-grid; place-items: center; flex: none;
	width: 22px; min-width: 22px; height: 22px; min-height: 22px; margin: 0; padding: 0; box-sizing: border-box;
	border: none; border-radius: 5px; box-shadow: none; background: transparent; color: var(--et-muted);
	font-size: 12px; font-weight: normal; line-height: 1; text-decoration: none; cursor: pointer;
}
.et-copy:hover { background: var(--color-button); color: var(--color-light); }
.et-copy:focus { text-decoration: none; }
.et-copy:focus-visible { outline: 1px solid var(--color-accent); outline-offset: 1px; }
.et-copy .et-svg { width: 13px; height: 13px; }
.et-own-link { justify-self: end; display: inline-flex; align-items: center; gap: 6px; padding: 0 8px; font-size: 12px; color: var(--et-muted); }
.et-own-link .et-svg { width: 14px; height: 14px; }
.et-row-actions { justify-self: end; display: inline-flex; gap: 6px; }

/*
 * The switch. Every dimension is pinned and the native appearance stripped, because Blockbench
 * styles bare <button> elements inside its own pages (min-width among them). Left to itself
 * this stretched into a long pill while the knob still travelled only 18px.
 */
.et-switch {
	justify-self: center; flex: 0 0 40px; width: 40px; min-width: 40px; max-width: 40px;
	height: 22px; min-height: 22px; box-sizing: border-box;
	border: none; padding: 0; margin: 0; border-radius: 22px; box-shadow: none;
	cursor: pointer; position: relative; background: var(--color-selected);
	appearance: none; -webkit-appearance: none;
	transition: background .18s ease;
}
.et-switch:hover { background: var(--color-selected); }
.et-switch[disabled] { opacity: .45; cursor: default; }
.et-switch.et-switch-on, .et-switch.et-switch-on:hover { background: var(--color-accent); }
.et-knob {
	position: absolute; top: 3px; left: 3px; width: 16px; height: 16px;
	box-sizing: border-box; border-radius: 50%; background: var(--color-text);
	transition: left .18s ease;
}
/* 40 width - 16 knob - 3 inset = 21, so the gap matches the 3px on the other end. */
.et-switch-on .et-knob { left: 21px; background: #fff; }

/* Nothing to show. */
.et-empty { padding: 28px; text-align: center; color: var(--et-muted); font-size: 13px; }
.et-add-here {
	display: flex; flex-wrap: wrap; align-items: center; gap: 12px; padding: 12px 14px 12px 16px;
	border-radius: 10px; border: 1px dashed var(--color-selected); color: var(--et-muted);
}
.et-add-here > .et-svg { width: 18px; height: 18px; }
.et-add-here-text { flex: 1 1 240px; min-width: 0; }
.et-add-here-title { font-size: 13px; color: var(--color-text); }
.et-add-here-sub { font-size: 12px; color: var(--et-muted); }

#et_page_tab { cursor: pointer; }

/* What's new, after an update. */
.et-notes { max-height: 62vh; overflow-y: auto; padding: 4px 4px 12px 4px; }
.et-notes-tool { margin-bottom: 18px; }
.et-notes-tool h2 { font-size: 17px; margin: 0 0 6px 0; display: flex; align-items: center; gap: 8px; }
.et-notes-tool h3 { font-size: 14px; margin: 12px 0 4px 0; color: var(--color-text); }
.et-notes-tool h4 { font-size: 12px; margin: 8px 0 2px 0; color: var(--color-subtle_text); text-transform: uppercase; letter-spacing: .04em; }
.et-notes-tool h4.et-notes-how { color: var(--color-accent); }
.et-notes-tool ul { margin: 0 0 0 18px; padding: 0; }
.et-notes-tool li { margin: 2px 0; line-height: 1.45; list-style: disc; }
.et-notes-note { margin: 2px 0 6px 0; font-size: 12px; color: var(--color-subtle_text); }
.et-notes-badge {
	font-size: 11px; padding: 1px 7px; border-radius: 9px;
	background: var(--color-accent); color: var(--color-accent_text);
}
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
// Whether EmbodyTools' page was the one showing at the last sync. Arriving on it, from another
// plugin's page or with the Plugins window opening, it shows the Tools tab first (David,
// 2026-10-04); another tab picked while on the page stays picked.
let page_was_ours = false;

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

function element(tag, className, text) {
	const node = document.createElement(tag);
	if (className) node.className = className;
	if (text !== undefined) node.textContent = text;
	return node;
}

// Two letters for the avatar: the first and last name's, or the email's first.
function initials(name, email) {
	const words = String(name || '').trim().split(/\s+/).filter(Boolean);
	const letters = words.length > 1 ? words[0][0] + words[words.length - 1][0] : (words[0] || email || '?')[0];
	return String(letters).toUpperCase();
}

/*
 * The account, at the very top: who is signed in, or what to do about it. Its buttons redraw
 * every panel through setTeamState, so nothing here needs to.
 */
function buildAccountRow() {
	const row = element('div', 'et-account' + (team.state === 'refused' || team.state === 'expired'
		|| team.state === 'offline_expired' || team.state === 'vault_error' ? ' et-account-bad' : ''));
	const signed_in = team.state === 'online' || team.state === 'offline';
	const avatar = element('div', 'et-avatar');
	avatar.setAttribute('aria-hidden', 'true');
	if (signed_in) avatar.textContent = initials(team.name, team.email);
	else avatar.appendChild(svgIcon('lock'));
	const text = element('div', 'et-account-text');
	const title = element('div', 'et-account-title');
	const sub = element('div', 'et-account-sub');
	text.appendChild(title);
	row.appendChild(avatar);
	row.appendChild(text);

	const add = (label, onClick, primary) => {
		row.appendChild(button(label, 'et-btn et-btn-small' + (primary ? ' et-btn-primary' : ' et-btn-quiet'), (event) => {
			event.currentTarget.disabled = true;
			Promise.resolve(onClick()).catch((error) => complain(label + ' failed', error)).finally(redrawPanels);
		}));
	};
	const say_sub = (message, icon) => {
		if (icon) sub.appendChild(svgIcon(icon));
		sub.appendChild(document.createTextNode(message));
		text.appendChild(sub);
	};

	if (signed_in) {
		const who = element('b', '', team.name && team.name !== team.email ? team.name : team.email);
		title.appendChild(who);
		if (team.name && team.name !== team.email) title.appendChild(element('span', 'et-account-email', team.email));
		title.title = team.email;
	}
	switch (team.state) {
		case 'online':
			say_sub('Signed in with Google, so the team tools load', 'shield');
			add('Sign out', signOut);
			break;
		case 'offline':
			say_sub('Offline, so the team tools run from the copies saved on '
				+ new Date(team.lastCheck).toLocaleDateString() + '.');
			add('Sign out', signOut);
			break;
		case 'signing_in':
			title.textContent = teamMessage();
			if (team.pendingUrl) {
				say_sub('Nothing opened? Copy the sign-in link into your browser.');
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
			title.textContent = teamMessage();
			break;
		case 'vault_error':
			title.textContent = teamMessage();
			add('Try again', retryTeamStartup);
			break;
		case 'offline_expired':
			title.textContent = teamMessage();
			add('Try again', checkInAndCatchUp);
			break;
		case 'refused':
			title.textContent = teamMessage();
			add('Sign in with another account', signIn, true);
			break;
		default:
			if (team.state === 'signed_out' && !team.detail) {
				title.textContent = 'Sign in to use the team tools';
				say_sub('With your @' + TEAM_DOMAIN + ' Google account.');
			} else {
				title.textContent = teamMessage();
			}
			add('Sign in with Google', signIn, true);
	}
	title.title = title.title || title.textContent;
	return row;
}

/*
 * A team tool's branch picker, opened: the list from the design David picked on 2026-10-03, each
 * branch with its type's icon and a line on what it is (branchNote), the one in use ticked.
 * Drawn here rather than as Blockbench's own menu, which has no room for the line and is light
 * in the dark theme. One at a time, kept in `branch_list`.
 *
 * Arrow keys, Home and End move through it, Enter or a click picks, and Escape or Tab closes it,
 * as does a press anywhere else, the window changing size, or the tools under it scrolling its
 * picker out of sight (until then it follows the picker). No key pressed in it reaches
 * Blockbench, where Enter would confirm the dialog under it and Escape close that.
 * `onPick` gets the value picked, '' for the default, and only when it's another branch.
 * Opened again with `reopen` on the same tool's new picker after a redraw (buildCardPanel), the
 * branch that had the focus keeps it.
 */
const branch_openers = new WeakMap();

function branchButton(root, id) {
	return Array.from(root.querySelectorAll('.et-branch')).find((node) => node.dataset.etBranch === id) || null;
}

function openBranchList(options) {
	const { picker, anchor, onPick } = options;
	let focus_value = picker.value;
	if (options.reopen && branch_list && branch_list.id === options.id) {
		const focused = branch_list.items.find((item) => item === document.activeElement);
		focus_value = focused ? focused.dataset.etValue : null;
	}
	closeBranchList(false);

	const node = element('div', 'et-branch-list');
	node.id = 'et_branch_list';
	node.setAttribute('role', 'menu');
	node.setAttribute('aria-label', 'Branches of ' + options.name);
	const items = picker.options.map((option) => {
		const current = option.value === picker.value;
		const item = element('button', 'et-branch-item et-kind-' + option.kind + (current ? ' et-current' : ''));
		item.type = 'button';
		item.setAttribute('role', 'menuitemradio');
		item.setAttribute('aria-checked', current ? 'true' : 'false');
		item.dataset.etValue = option.value;
		item.title = branchHint(option);
		item.appendChild(svgIcon(option.kind));
		const words = element('span', 'et-branch-item-text');
		words.appendChild(element('span', 'et-branch-item-name', option.label));
		words.appendChild(element('span', 'et-branch-item-note', branchNote(option)));
		item.appendChild(words);
		if (current) item.appendChild(svgIcon('check', 'et-check'));
		item.addEventListener('click', () => {
			closeBranchList(true);
			if (!current) onPick(option.value);
		});
		node.appendChild(item);
		return item;
	});

	// Focus an item, scrolling only the list itself when it's too long for the window.
	const show = (item) => {
		item.focus({ preventScroll: true });
		if (item.offsetTop < node.scrollTop) node.scrollTop = item.offsetTop - 4;
		else if (item.offsetTop + item.offsetHeight > node.scrollTop + node.clientHeight) {
			node.scrollTop = item.offsetTop + item.offsetHeight - node.clientHeight + 4;
		}
	};
	node.addEventListener('keydown', (event) => {
		event.stopPropagation();
		const at = items.indexOf(document.activeElement);
		const go = (index) => {
			event.preventDefault();
			show(items[(index + items.length) % items.length]);
		};
		switch (event.key) {
			case 'ArrowDown': go(at + 1); break;
			case 'ArrowUp': go(at < 0 ? items.length - 1 : at - 1); break;
			case 'Home': case 'PageUp': go(0); break;
			case 'End': case 'PageDown': go(items.length - 1); break;
			case 'Escape': event.preventDefault(); closeBranchList(true); break;
			// Back on the picker, so Tab goes on from there.
			case 'Tab': closeBranchList(true); break;
			default: break;
		}
	});

	const listeners = [];
	const listen = (target, type, listener, capture) => {
		target.addEventListener(type, listener, capture);
		listeners.push([target, type, listener, capture]);
	};
	// The picker's own click opens and closes it, so a press on the picker is left to that.
	listen(document, 'pointerdown', (event) => {
		if (!node.contains(event.target) && !anchor.contains(event.target)) closeBranchList(false);
	}, true);
	// The tools under it scrolling: it follows its picker, and closes once the picker is out of
	// sight. Closing at any scroll closed it at once when a click came in the middle of one,
	// as with a trackpad's glide.
	listen(document, 'scroll', (event) => {
		if (event.target === node) return;
		const holder = anchor.closest('.et-scroll');
		const view = holder ? holder.getBoundingClientRect() : { top: 0, bottom: window.innerHeight };
		const box = anchor.getBoundingClientRect();
		if (!anchor.isConnected || box.bottom <= view.top || box.top >= view.bottom) closeBranchList(false);
		else placeBranchList(node, anchor);
	}, true);
	listen(window, 'resize', () => closeBranchList(false), false);

	document.body.appendChild(node);
	placeBranchList(node, anchor);
	anchor.classList.add('et-open');
	anchor.setAttribute('aria-expanded', 'true');
	anchor.setAttribute('aria-controls', node.id);
	branch_list = { id: options.id, panel: options.panel, anchor, node, items, listeners };

	if (focus_value !== null) {
		const target = items.find((item) => item.dataset.etValue === focus_value)
			|| items.find((item) => item.classList.contains('et-current')) || items[0];
		if (target) show(target);
	}
}

// Under the picker with their right edges lined up, or above it when there's more room there.
function placeBranchList(node, anchor) {
	const box = anchor.getBoundingClientRect();
	const gap = 4;
	const edge = 8;
	node.style.maxHeight = '';
	const width = node.offsetWidth;
	let height = node.offsetHeight;
	const below = window.innerHeight - box.bottom - gap - edge;
	const above = box.top - gap - edge;
	const down = height <= below || below >= above;
	const room = down ? below : above;
	if (height > room) {
		height = Math.max(room, 88);
		node.style.maxHeight = height + 'px';
	}
	const top = down ? box.bottom + gap : box.top - gap - height;
	const left = Math.min(box.right - width, window.innerWidth - width - edge);
	node.style.top = Math.round(Math.max(edge, top)) + 'px';
	node.style.left = Math.round(Math.max(edge, left)) + 'px';
}

// Closes the open branch list, if there is one, and puts the focus back on its picker if asked.
function closeBranchList(refocus) {
	const open = branch_list;
	if (!open) return;
	branch_list = null;
	for (const [target, type, listener, capture] of open.listeners) target.removeEventListener(type, listener, capture);
	open.node.remove();
	open.anchor.classList.remove('et-open');
	open.anchor.setAttribute('aria-expanded', 'false');
	if (refocus && open.anchor.isConnected && !open.anchor.disabled) open.anchor.focus({ preventScroll: true });
}

/*
 * The Tools tab and the dialog. On top, the account, then search, a filter by on and off, What's
 * new, Add tool and Refresh. Under them every tool is a row, grouped as the team's, outside
 * tools, and those added on this computer, and on the plugin page only that list scrolls. A
 * click on a row opens it to show more, and another closes it (`expanded_tools`, David,
 * 2026-10-04). Every panel is kept in `panels` while it is on screen, so a sign-in, a refusal
 * or a check-in redraws all of them, opened rows staying open.
 */
function buildCardPanel(options) {
	const in_dialog = !!(options && options.inDialog);
	const panel = element('div', 'et-browser' + (in_dialog ? '' : ' et-page'));
	if (!in_dialog) panel.id = 'et_page_panel';
	// Enter on one of the panel's buttons, or in its search, is for that alone. Blockbench's own
	// key handler on document would also take it as confirming the dialog the panel is in.
	panel.addEventListener('keydown', (event) => {
		if (event.key === 'Enter' && event.target.closest('button, input')) event.stopPropagation();
	});

	const top = element('div', 'et-top');
	const account = element('div');
	const bar = element('div', 'et-bar');

	const search_box = element('div', 'et-search');
	const search = element('input');
	search.type = 'search';
	search.placeholder = 'Search tools';
	search.setAttribute('aria-label', 'Search tools');
	search_box.appendChild(svgIcon('search'));
	search_box.appendChild(search);

	let filter = 'all';
	const seg = element('div', 'et-seg');
	seg.setAttribute('role', 'group');
	seg.setAttribute('aria-label', 'Show');
	const seg_buttons = {};
	for (const key of ['all', 'on', 'off']) {
		const choice = element('button');
		choice.type = 'button';
		choice.addEventListener('click', () => {
			filter = key;
			draw();
		});
		seg_buttons[key] = choice;
		seg.appendChild(choice);
	}

	const news = element('button', 'et-btn et-news');
	news.type = 'button';
	news.title = 'The latest release notes of EmbodyTools and every team tool';
	const news_count = element('span', 'et-count');
	news.appendChild(svgIcon('sparkle'));
	news.appendChild(document.createTextNode('What\'s new'));
	news.appendChild(news_count);
	news.addEventListener('click', () => {
		showLatestNotes().catch((error) => complain('could not show the release notes', error));
	});

	const add = element('button', 'et-btn');
	add.type = 'button';
	add.title = 'Add a plugin by its link, on this computer';
	add.appendChild(svgIcon('plus'));
	add.appendChild(document.createTextNode('Add tool'));
	add.addEventListener('click', () => openAddToolDialog(() => redrawPanels()));

	const refresh = element('button', 'et-btn et-btn-icon');
	refresh.type = 'button';
	refresh.title = 'Refresh: read the tool lists again, and reload the tools that are on';
	refresh.setAttribute('aria-label', 'Refresh');
	refresh.appendChild(svgIcon('refresh'));

	bar.appendChild(search_box);
	bar.appendChild(seg);
	bar.appendChild(news);
	bar.appendChild(add);
	bar.appendChild(refresh);
	top.appendChild(account);
	top.appendChild(bar);

	const scroll = element('div', 'et-scroll');

	// One tool's row: its icon, name and what's known about it, its branch, its switch, and the
	// arrow that opens it to show more.
	const buildRow = (descriptor, enabled, fresh) => {
		const entry = live.get(descriptor.id);
		const module = entry && entry.module;
		const state = stateOf(descriptor.id);
		const on = enabled.has(descriptor.id);
		const locked = state.status === 'locked';
		const name = (module && module.title) || descriptor.name || descriptor.id;

		const row = element('div', 'et-row' + (state.status === 'on' ? ' et-is-on' : '') + (locked ? ' et-locked' : ''));

		const tile = element('div', 'et-tile');
		tile.setAttribute('aria-hidden', 'true');
		// Its own icon (ownIcon), or else the line icon, or else its first letter.
		const lineIcon = (into) => {
			into.textContent = '';
			into.classList.remove('et-has-picture');
			const icon = toolIcon(descriptor);
			if (icon) into.appendChild(svgIcon(icon));
			else into.textContent = String(name)[0] || '?';
		};
		const own = ownIconNode(descriptor, lineIcon);
		if (own) {
			if (own.tagName === 'IMG') tile.classList.add('et-has-picture');
			tile.appendChild(own);
		} else {
			lineIcon(tile);
		}

		const main = element('div', 'et-main');
		const line1 = element('div', 'et-line1');
		line1.appendChild(element('span', 'et-name', name));
		const version = (module && module.version) || descriptor.version || (descriptor.team ? latestNotedVersion(descriptor.id) : '');
		const author = descriptor.author || (descriptor.local ? 'Unknown author' : '');
		const meta = [version, author && author !== 'Embody Games' ? 'by ' + author : ''].filter(Boolean).join(' · ');
		if (meta) line1.appendChild(element('span', 'et-meta', meta));
		const chip = (text, extra, iconName, title) => {
			const node = element('span', 'et-chip' + (extra ? ' ' + extra : ''));
			if (iconName) node.appendChild(svgIcon(iconName));
			node.appendChild(document.createTextNode(text));
			if (title) node.title = title;
			line1.appendChild(node);
		};
		const group = fresh.get(descriptor.id);
		if (group) chip(group.isNew ? 'New tool' : 'Updated', 'et-chip-new', null, 'What\'s new has its release notes');
		if (descriptor.native === true) chip('File access', '', 'folder', 'It can read and write files on this computer');
		if (state.status === 'on' && state.origin === 'offline copy') chip('Offline copy', '', null, 'Running from the copy saved on this computer');
		if (state.status === 'on' && state.origin === 'cache') chip('Cached copy', '', null, 'Its link could not be reached, so the copy from last time runs');

		const line2 = element('div', 'et-line2');
		const description = (module && module.description) || descriptor.description || '';
		const problem = state.status === 'error' ? { text: 'Failed: ' + state.detail, className: 'et-bad' }
			: state.status === 'blocked' ? { text: state.detail, className: 'et-warn' }
			: locked ? { text: state.detail, icon: 'lock' }
			: state.status === 'loading' ? { text: 'Loading...' }
			: null;
		if (problem) {
			if (problem.className) line2.classList.add(problem.className);
			if (problem.icon) line2.appendChild(svgIcon(problem.icon));
			line2.appendChild(document.createTextNode(problem.text));
		} else {
			line2.textContent = description;
		}
		line2.title = problem ? problem.text : description;
		main.appendChild(line1);
		if (line2.textContent) main.appendChild(line2);

		const toggle = element('button', 'et-switch' + (on ? ' et-switch-on' : ''));
		toggle.type = 'button';
		toggle.disabled = locked;
		toggle.setAttribute('aria-pressed', on ? 'true' : 'false');
		toggle.setAttribute('aria-label', name);
		toggle.title = locked ? state.detail : (on ? 'On. Click to switch it off.' : 'Off. Click to switch it on.');
		toggle.appendChild(element('span', 'et-knob'));
		toggle.addEventListener('click', async () => {
			toggle.disabled = true;
			row.classList.add('et-busy');
			try {
				await setEnabled(descriptor.id, !on);
			} finally {
				redrawPanels();
			}
		});

		// The middle: a team tool's branch, an outside tool's link, or what to do with one
		// added on this computer.
		let side = element('span');
		if (descriptor.team) {
			const picker = branchPicker(descriptor);
			if (picker) {
				const current = picker.options.find((option) => option.value === picker.value) || picker.options[0];
				const pickerButton = element('button', 'et-branch' + (picker.value ? ' et-off-default' : ''));
				pickerButton.type = 'button';
				pickerButton.title = picker.title;
				pickerButton.disabled = !picker.enabled;
				pickerButton.dataset.etBranch = descriptor.id;
				pickerButton.setAttribute('aria-haspopup', 'menu');
				pickerButton.setAttribute('aria-expanded', 'false');
				pickerButton.setAttribute('aria-label', 'Branch for ' + name + ': ' + current.label);
				pickerButton.appendChild(svgIcon(current.kind));
				pickerButton.appendChild(element('span', 'et-branch-name', current.label));
				pickerButton.appendChild(svgIcon('chevron', 'et-chev'));
				const open = (reopen) => openBranchList({
					picker, anchor: pickerButton, panel, id: descriptor.id, name, reopen,
					onPick: async (value) => {
						pickerButton.disabled = true;
						toggle.disabled = true;
						row.classList.add('et-busy');
						try {
							await setBranch(descriptor.id, value);
						} finally {
							redrawPanels();
							// The focus went with the old picker, so it goes to the new one.
							const again = branchButton(panel, descriptor.id);
							if (again && (!document.activeElement || document.activeElement === document.body)) {
								again.focus({ preventScroll: true });
							}
						}
					},
				});
				branch_openers.set(pickerButton, open);
				pickerButton.addEventListener('click', () => {
					if (branch_list && branch_list.anchor === pickerButton) closeBranchList(true);
					else open(false);
				});
				side = pickerButton;
			}
		} else if (descriptor.local) {
			side = element('span', 'et-row-actions');
			side.appendChild(button('Copy entry', 'et-btn et-btn-small et-btn-quiet', () => {
				const ok = copyText(registryEntryText(descriptor));
				Blockbench.showQuickMessage(ok ? 'Copied. Paste it into registry.json to share it.' : 'Could not reach the clipboard', 2500);
			}));
			side.lastChild.title = 'Copy this as a registry.json entry, to give it to everyone';
			side.appendChild(button('Remove', 'et-btn et-btn-small et-btn-quiet', async (event) => {
				event.currentTarget.disabled = true;
				await removeLocalTool(descriptor.id);
				redrawPanels();
			}));
		} else {
			side = element('span', 'et-own-link');
			side.title = 'Loads from its author\'s own link, so it has no branches to pick';
			side.appendChild(svgIcon('link'));
			side.appendChild(document.createTextNode('Own link'));
		}

		// Opened, a row shows more about the tool under its name, sorted (toolSummary): the
		// description when the line above says what's wrong instead, the chips at a glance, then
		// a team tool's latest notes beside the rest of what's known about it.
		const more_id = 'et_more_' + (in_dialog ? 'dialog_' : 'page_') + descriptor.id;
		const buildMore = () => {
			const summary = toolSummary(descriptor);
			const more = element('div', 'et-more');
			more.id = more_id;
			if (problem && description) more.appendChild(element('p', 'et-more-text', description));

			const chips = element('div', 'et-more-chips');
			for (const chip of summary.chips) {
				const pill = element('span', 'et-pill' + (chip.tone ? ' et-' + chip.tone : ''));
				if (chip.icon) pill.appendChild(svgIcon(chip.icon));
				else pill.appendChild(element('span', 'et-pill-dot'));
				pill.appendChild(document.createTextNode(chip.text));
				if (chip.title) pill.title = chip.title;
				chips.appendChild(pill);
			}
			more.appendChild(chips);

			const latest = descriptor.team ? latestNotes(descriptor.id) : null;
			const body = element('div', 'et-more-body' + (latest ? '' : ' et-single'));
			if (latest) {
				const notes = element('section', 'et-more-notes');
				const heading = element('div', 'et-more-heading', 'What\'s new');
				if (latest.date) heading.appendChild(element('span', 'et-more-heading-note', latest.date));
				notes.appendChild(heading);
				notes.appendChild(element('div', 'et-more-notes-title', latest.version + (latest.title ? ': ' + latest.title : '')));
				const how = latest.categories.filter((category) => category.title === HOW_TO_USE);
				for (const category of how.concat(latest.categories.filter((category) => category.title !== HOW_TO_USE))) {
					notes.appendChild(element('div', 'et-more-notes-cat' + (category.title === HOW_TO_USE ? ' et-how' : ''), category.title));
					const list = element('ul');
					for (const line of category.list.slice(0, MORE_NOTE_LINES)) {
						// Escaped, or made by Blockbench's own pureMarked, as in the What's new window.
						const item = element('li');
						item.innerHTML = noteLine(line);
						list.appendChild(item);
					}
					notes.appendChild(list);
					const rest = category.list.length - MORE_NOTE_LINES;
					if (rest > 0) notes.appendChild(element('div', 'et-more-notes-more', 'And ' + rest + ' more, in What\'s new'));
				}
				body.appendChild(notes);
			}

			const about = element('section', 'et-more-about');
			about.appendChild(element('div', 'et-more-heading', 'About'));
			const rows = element('div', 'et-about');
			for (const [index, fact] of summary.about.entries()) {
				if (index) rows.appendChild(element('div', 'et-about-line'));
				rows.appendChild(element('span', 'et-about-label', fact.label));
				const cell = element('span', 'et-about-value');
				if (fact.kind === 'tags') {
					for (const tag of fact.value) cell.appendChild(element('span', 'et-tag', tag));
				} else {
					cell.appendChild(element(fact.kind === 'code' ? 'code' : 'span', fact.kind === 'text' ? '' : 'et-about-' + fact.kind, fact.value));
					if (fact.kind === 'link' || fact.kind === 'code') {
						const copy = element('button', 'et-copy');
						copy.type = 'button';
						copy.title = 'Copy';
						copy.setAttribute('aria-label', 'Copy ' + fact.label.toLowerCase());
						copy.appendChild(svgIcon('copy'));
						copy.addEventListener('click', () => {
							const ok = copyText(fact.value);
							Blockbench.showQuickMessage(ok ? 'Copied' : 'Could not reach the clipboard', 1500);
						});
						cell.appendChild(copy);
					}
				}
				rows.appendChild(cell);
			}
			about.appendChild(rows);
			body.appendChild(about);
			more.appendChild(body);
			return more;
		};

		const expand = element('button', 'et-expand');
		expand.type = 'button';
		expand.setAttribute('aria-controls', more_id);
		expand.appendChild(svgIcon('chevron'));
		const showOpen = (open) => {
			row.classList.toggle('et-expanded', open);
			expand.setAttribute('aria-expanded', open ? 'true' : 'false');
			expand.setAttribute('aria-label', (open ? 'Less about ' : 'More about ') + name);
			expand.title = open ? 'Show less' : 'Show more';
		};
		const toggleMore = () => {
			const open = !expanded_tools.has(descriptor.id);
			if (open) expanded_tools.add(descriptor.id);
			else expanded_tools.delete(descriptor.id);
			showOpen(open);
			const shown = row.querySelector(':scope > .et-more');
			if (shown) shown.remove();
			if (open) {
				const more = buildMore();
				more.classList.add('et-reveal');
				row.appendChild(more);
				// Opened near the bottom, the list scrolls to show it, as far as the row's top allows.
				const holder = row.closest('.et-scroll');
				if (holder) {
					const box = row.getBoundingClientRect();
					const view = holder.getBoundingClientRect();
					const by = Math.min(box.bottom - view.bottom + 8, box.top - view.top - 8);
					if (by > 0) holder.scrollTo({ top: holder.scrollTop + by, behavior: 'smooth' });
				}
			}
		};
		expand.addEventListener('click', toggleMore);
		// A click anywhere on the row opens or closes it, but not one on its switch, its picker
		// or another control, nor in what it shows when opened, where text can be selected.
		row.addEventListener('click', (event) => {
			if (event.target.closest('button, a, input, select, textarea, label, .et-more')) return;
			toggleMore();
		});

		row.appendChild(tile);
		row.appendChild(main);
		row.appendChild(side);
		row.appendChild(toggle);
		row.appendChild(expand);
		const opened = expanded_tools.has(descriptor.id);
		showOpen(opened);
		if (opened) row.appendChild(buildMore());
		return row;
	};

	const draw = () => {
		// The branch lists and the release notes, the first time this is drawn while online.
		if (branch_lists === null && team.state === 'online') {
			refreshBranches().catch((error) => complain('could not list the branches', error));
		}
		if (!panel_notes_loading && (panel_notes === null
			|| (panel_notes.team === null && team.state === 'online' && panel_notes.state !== 'online'))) {
			refreshPanelNotes();
		}
		account.replaceChildren(buildAccountRow());

		const enabled = readEnabled();
		const fresh = new Map();
		if (panel_notes) {
			for (const group of newNotes(readNotesSeen(), panel_notes.own, panel_notes.team)) fresh.set(group.id, group);
		}
		news_count.textContent = String(fresh.size);
		news_count.style.display = fresh.size ? '' : 'none';

		const on_count = registry.filter((d) => enabled.has(d.id)).length;
		const counts = { all: registry.length, on: on_count, off: registry.length - on_count };
		const labels = { all: 'All', on: 'On', off: 'Off' };
		for (const key of Object.keys(seg_buttons)) {
			seg_buttons[key].textContent = labels[key] + ' ' + counts[key];
			seg_buttons[key].classList.toggle('et-on', filter === key);
			seg_buttons[key].setAttribute('aria-pressed', filter === key ? 'true' : 'false');
		}

		const query = search.value.trim().toLowerCase();
		const matches = (d) => (!query
			|| ((d.name || '') + ' ' + (d.description || '') + ' ' + (d.tags || []).join(' ')).toLowerCase().includes(query))
			&& (filter === 'all' || (filter === 'on') === enabled.has(d.id));
		const groups = [
			{ key: 'team', title: 'Team tools', tools: registry.filter((d) => d.team) },
			{ key: 'outside', title: 'Outside tools', tools: registry.filter((d) => !d.team && !d.local) },
			{ key: 'local', title: 'Added on this computer', tools: registry.filter((d) => d.local) },
		];
		const sections = [];
		for (const group of groups) {
			const shown = group.tools.filter(matches);
			const invite = group.key === 'local' && !group.tools.length && !query && filter === 'all';
			if (!shown.length && !invite) continue;
			const section = element('section', 'et-section');
			const head = element('div', 'et-section-head');
			const heading = element('div', 'et-section-title', group.title);
			heading.setAttribute('role', 'heading');
			heading.setAttribute('aria-level', '3');
			heading.appendChild(element('span', 'et-section-count', String(shown.length)));
			head.appendChild(heading);
			if (group.tools.length) {
				head.appendChild(element('span', 'et-section-note', group.tools.filter((d) => enabled.has(d.id)).length + ' on'));
			}
			section.appendChild(head);
			if (shown.length) {
				const list = element('div', 'et-list');
				for (const descriptor of shown) list.appendChild(buildRow(descriptor, enabled, fresh));
				section.appendChild(list);
			} else {
				const empty = element('div', 'et-add-here');
				empty.appendChild(svgIcon('link'));
				const words = element('div', 'et-add-here-text');
				words.appendChild(element('div', 'et-add-here-title', 'Nothing added on this computer'));
				words.appendChild(element('div', 'et-add-here-sub', 'Add tool loads a plugin from its link, on this computer only.'));
				empty.appendChild(words);
				const add_here = button('', 'et-btn et-btn-small', () => openAddToolDialog(() => redrawPanels()));
				add_here.appendChild(svgIcon('plus'));
				add_here.appendChild(document.createTextNode('Add tool'));
				empty.appendChild(add_here);
				section.appendChild(empty);
			}
			sections.push(section);
		}
		if (!sections.length) sections.push(element('div', 'et-empty', 'Nothing matches that.'));
		scroll.replaceChildren(...sections);

		// A branch list open over this panel stays open on its tool's new picker, if it has one.
		if (branch_list && branch_list.panel === panel) {
			const again = branchButton(scroll, branch_list.id);
			const reopen = again && !again.disabled ? branch_openers.get(again) : null;
			if (reopen) reopen(true);
			else closeBranchList(false);
		}
	};

	search.addEventListener('input', draw);
	refresh.addEventListener('click', async () => {
		refresh.disabled = true;
		refresh.classList.add('et-spin');
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
			panel_notes = null;
		} finally {
			refresh.disabled = false;
			refresh.classList.remove('et-spin');
			redrawPanels();
		}
	});

	panel.appendChild(top);
	panel.appendChild(scroll);
	panels.add({ element: panel, draw: draw });
	draw();
	return panel;
}

function syncPluginPage() {
	// A branch list whose picker left the page, with the panel or the dialog, goes too.
	if (branch_list && !branch_list.anchor.isConnected) closeBranchList(false);
	const bar = document.getElementById('plugin_browser_page_tab_bar');
	const stale = document.getElementById('et_page_panel');
	if (!bar) {
		if (stale) stale.remove();
		page_was_ours = false;
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
		page_was_ours = false;
		return;
	}
	// Just arrived on EmbodyTools' page: the Tools tab first.
	if (!page_was_ours) {
		page_was_ours = true;
		vm.page_tab = PAGE_TAB;
	}

	// Our tab in Blockbench's own tab bar, first in it.
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
	}
	if (bar.firstElementChild !== tab) bar.insertBefore(tab, bar.firstElementChild);
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

		// What's new, at the first model opened or made after an update.
		loader.ctx.on('select_project', onProjectSelected);

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
		loader.ctx.cleanup('an open branch list', () => closeBranchList(false));
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
			// A model already open, as when EmbodyTools is switched on mid-session, counts as
			// opened now.
			if (current() && typeof Project !== 'undefined' && Project) onProjectSelected();
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
