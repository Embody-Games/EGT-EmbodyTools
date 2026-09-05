/*
 * EmbodyTools - Embody Games' Blockbench toolset
 * ==============================================
 *
 * Three tools that used to be three separate plugins, in one file so there is one
 * thing to hand out and one version to talk about.
 *
 *   1. DELTA LAYERS        Keeps a texture's layer stack alive across a save/reload
 *                          for formats that cannot store layers, by writing a sidecar
 *                          next to the texture PNG. Desktop only.
 *                          Settings > Export.   Was: delta_layers 1.5.1
 *
 *   2. ANCHORED STRETCH    Makes the Stretch tool move only the face you drag, stops
 *                          resizing a stretched cube from creeping outward on the
 *                          anchored side, and adds a Stretch mode to Vertex Snap.
 *                          Settings > Edit.     Was: anchored_stretch 1.7.2
 *
 *   3. UNLEAKY LAYERS      Makes Lock Alpha Channel look at every layer, so you can
 *                          paint on an empty layer above your artwork.
 *                          Settings > Paint.    Was: unleakylayers 1.2.1
 *                          Written by quinten.bench.
 *
 * HOW THE FILE IS LAID OUT
 * ------------------------
 * A short shared prelude, then one section per tool, each opened by a banner like
 *
 *     // ===== 1/3  DELTA LAYERS =====
 *
 * so they are easy to jump between and easy to tell apart. Every section is its own
 * closure and shares nothing with the others but the prelude, which is why all three
 * can keep the variable names they had as separate plugins. Registration is at the
 * bottom: one BBPlugin.register for the whole file, which walks the module list.
 *
 * Each module reports whether it can run here (`blocked()`) and sets itself up and
 * tears itself down (`load()` / `unload()`). A module that cannot run, or that throws
 * on the way up, is skipped with a line in the console and does not take the others
 * with it - so Texture Layers being desktop-only does not stop the other two from
 * working in the web app.
 *
 * To add a tool: add a section, return the same five fields, and put it in MODULES.
 *
 * Author: David - Embody Games
 * License: MIT, see LICENSE.
 *
 * NOTE ON THE FILENAME: Blockbench derives a file-loaded plugin's id from its filename
 * (pathToName in plugin_loader.ts) and matches it against the id passed to
 * BBPlugin.register below. Rename this file and it will refuse to load with
 * "could not load plugin". Keep the two in sync.
 */
(function () {
'use strict';

// Must match the filename: embodytools.js
const PLUGIN_ID = 'embodytools';
const PLUGIN_VERSION = '1.0.2';

// The plugin icon, embedded so this stays a single file wherever it is loaded from;
// Blockbench's getIconNode takes any data:image/ URL. The art is embody_tools_icon.png
// in the repo: edit that, then run `npm run icon` to write it back in here. The checks
// fail if the two ever disagree, so this line cannot quietly go stale.
const ICON = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADAAAAAwCAYAAABXAvmHAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsIAAA7CARUoSoAAAAAZdEVYdFNvZnR3YXJlAFBhaW50Lk5FVCA1LjEuMTGKCBbOAAAAuGVYSWZJSSoACAAAAAUAGgEFAAEAAABKAAAAGwEFAAEAAABSAAAAKAEDAAEAAAACAAAAMQECABEAAABaAAAAaYcEAAEAAABsAAAAAAAAAPJ2AQDoAwAA8nYBAOgDAABQYWludC5ORVQgNS4xLjExAAADAACQBwAEAAAAMDIzMAGgAwABAAAAAQAAAAWgBAABAAAAlgAAAAAAAAACAAEAAgAEAAAAUjk4AAIABwAEAAAAMDEwMAAAAABc7WH6CeiquwAACnhJREFUaEPVmGtsHFcZhp9vLnux1+usvbbjpHWSNonTljS9UVpKMaUNtCWUXum9palSoJRbflAQElSCH4AQKhIg8Q8BFRVqVUBQQblIFAqq1LRQUGoSOzff7Wy89nq9O3vmzOHHzNrrjZ3GjoPEK32yZ/acOe9zvu+cObvStanb8H8sq/7GqqrogTm783N2AERgeBp99w2YdVnwg/oWq6azA3CiSHDjZZTfexUydBycszMMZwVABMkPULr3FtAaOXogzMhZ0uoDFMrou25l+tJ34PYdwZA5q+tgdQFEkIkJig/cho65OG/2Qsea+larqtUFOHQc/4l7yF9yEYkTeazXe6EhVt9qVbV6AEEArkvh9pswiQTx4TGk763F618A5cPk7OKfL0OrAyCCHD2I+tJ9FDZvAt/HPTYUfrZY/R+bQn/kffi7dyGHes8IYnUAShXM5guYvvl6jG1j+T7OgUMY0vUtQ/kBVBS5h+9Cfe4TZwRx5gAiyMghvCfup3hOJwQBTnEWe38ftCyxgDtT2K/vxwQWY49+DPWpT64Y4swBPEVw7XuYuu7q8FqEeG4SeaUXGuP1rUPFHWTfv0kM5dCJNOMPPYx6bGUQZwYgggz1U959F+VsKxIEIEJsaBSZHV76DWxZQJnYsTHwwI+lGb9/N2rPZ5YNscQIp6lcEX3PHeSvvhxMdN4xAe7hgfD/pYwYA8Rw+49B2YBnQoi7HkE98tkQgiX61mnlAAIyNYD3gWtR6SYkqO42gnfRViARbq1LyGTbsA/0YRcqoGwoG3ynifHbHkU9uBc5fHqZWDlAJJ1pBua3SgkCprZvQ336IeTI4IK28xLk+BDqwksJiIMSUFaYCTvF+K7dqHv3IoNvn4mVA2iDoQ3Vmqn1jwkgsOIUdt2EiS+yjYogh3tRj36eifffgtEueAIVKwyPMBM37kHd+gVk+NQQKwcoK8zVm1Fr0qFrA0YDvkDZUDj3PCp7H4HDAzWlIDByFH3rA0zc8gCB1QAe4ewrmY+ywbebGLthD2rXF5GJpSFWDjBWINi+lUpTCnwwfs0sVgS0w/R7d8LFF4JSYR/lYa7oIXfP46hkJlzAypqPav+onLSVYqznMSrXfxmZWhxixQDCcfzzNxJILDRcHbgaZcNsyzrKd9yLDPSHWfAVQaYdL5mBcnXma8zXXkfP0JJi/N17UFd9GZk9GWLFAABqw0bw7ZONzM2kkL/sWoJrdkJxBhpSOL/9MemDB0E7YbnUznr9M1SUCWli7F2fQL3jSfAOLfCwMgBfY9Zvwst2hrOvZPEseFBpyFK6+T5kbBCMwSSFhr//AZn1w+2ztvaXyoRn0JJGpzcgfmWBlZUBzJYx2y/AS2XmdxAVzviCqISD57e8E73zHiiMQ+Z8nFeeITV4DLRbN+t1MLVAZY2dH8I4C62sCEByo/hbuvHtRqjU1fKcmQjIA99NU+y5G8lPguUgszlS/3g5XMSLlZCKYOaAbOyywpo6CnbrAi8rAgAff8NmCNyFgy9lpmzIn7sD/6YnYGYEkzkf99Wf0TA+Gq2Ft3uGYHwX3bgV0bkFC3n5AFbYxWvvCgG0A74T1XP9LM6XhjFJCu+8E9wmsGxk8i2aev8+b3ZR4/P9A51govtx1LlfRdT8bmQ3Z7JPzZmrghkDvoayB5NTyMQAks8h+RyUiojv46QzuMoQm57BKSlEgQlsjHYgcEK4wAlfbL6AAi+RpcEXnN7nMOlN2PkxvI3Xo60UqOgl6FthqOjvXAiBSVJqvoykl8DOPw92G9K1qdugNXJsCChFBAnMlvMw69cRrF1H0NaBzq5Fr2lDNbdijE1sdAx3cAArN4GVz4FXAjdOkGohaF6LTnegG7MUOrah4hlQBgKbhtwQ2WceAr+IlA5R3PksxzffDEqDljB8AW1FEYEFUYiNowq0H/wezth3ka6uLca0ZfCvuwa9bh1+JovfnEE1pPHjjWg3SSAuGDt6YHUAAR9QBquscIpl3MIM7lQeZ3ICJzeKPX4MnTmH41fcje82he0Dm459Pyfxx09iUhsIWq5k9Lqn8e00+GYeQlvYlTKaRgis+eM6gBUjWTxC2767kS7Sxv/8IwzveRSs2JypMKVR1Jquj+psBVHMQQIqwCl5mMBBW4kIwCFeyNH+648j068gukyh5yVOdF67MAvapqP/p6B9ptZ9iHKyPSxtsXEredoOPI0z8QPs5q6up6yxcZLFWdySQgIHTRxwQdtRPdbU5qI1Wq1zibZV5voEJo4xbs0zQFtN0HIJiaF9SGUIWzdTbOsJ148KJ0F8Q3rwFyQOPolrtzPTejWIg1uZpL33G7hj3wRnA3ZzS9tTzJZwfvMr4r98gYZ9b5AaGiQxXcRRoCVOYCXAuPNmT1pgVaAIpLoYF9yrbQtevBOTeReJ8X9jH38e03o7Xmx9WEbGwg480sPPI/4bmMQOCh034Ko87b3fwhn/NsbdBphoF7IsyGTDKJewXn+N2O9fIPniz0kNHqVxfJR4sYQQQ0sDhnh4BqrO+kkgVeOL3a+BiHUSNF9FYvzPOBWHmdZrQCwQC1fNkBr8Ceg+iF2MWnMp2QPfWWAeiHahpSSCjPaiPvhp1KZLcAcOQuDjt2/C6+im2LwhXJyBE60XM79m6mNuZ6m9FjAuTZP7yby5m8kdP6aQ3gpAQ3GA7Gs3gylh3A2Y+Aas6Z+CvXXhN8BTApgAVJETe59lprMbSh7x6WmS4yPEB/bjHvgz+tzL8Tq2U8qcRzmexZCMDBrQ5uTFXwsSRC8eyyU9+U+Sk28wtvEBEJumqf1k9m0HexsYBWYarNYF5nk7AJn8D5UPfJGRGx+v2WEskDiNI320/vAqxNMAmJbt6PU9VDqvxFvTTanhHJSVjrJjov08yk4gYOq+nIhFzMuh3GaMHScz/hfS/+xZUC6LaemjhAkwsSTFi3ZCEAuPCn54bJDCLOk3X0ICjcl0YzLbwFSwjzxHw8sPsebFHtb+8QnW/uOHtBz7K8mp0RBUx8I3dL35aLxKrAUjFiDYlRP1LRbV0hko9uNf8SmGP/wkGAd7dpbk5CjJkQPE+v+G3f8LcJvre82fR4Ii4g9AACa5A938flTmSsrNF1Fo2hIZXUTiEPMmaN//FFb+BbCW+Hky0tIA5Qn0hXdSvPwO4iN9uH2vYB39HVLMYRobIX5OfY8lJGA8CA4jFfA79zK8/esYcRYpDSFWOUHb/q/hnPg+xjl1+XBKACQ8r0wPhB4aW8HNgNj1DU9Tgqheihf8kuPrd4HxT/o8O/ISieHnsKd+dFrmOeUawIDTgGnZhsl0Qyx7BuYBozCxSyhmdpxsTCzEaOJjLy7LPKcGqOr0HvS20v342dsoJddGPyBFEgeMJpN7FbvwMsbZsqwxTwNgdSQGytkeEDe6Eb5xG2cOse6tb5H61/sgmF22peW1XqlMgaDxRmaaLwh/HxKbRHmc9iPP0vr6R3FGvxK+sKpwy9D/BiCYxCQ2ou04idII7Ueeof21O0n2PQjBdGh+GWVTq1PsQqspAzgETdcgpX6s0p8wThdIw4qNV/U/AiA0GgyBZEBSZ2y8qv8CgSg3IbtMe6EAAAAASUVORK5CYII=';

// Blockbench runs plugin code as new Function('requireNativeModule', 'require', code),
// so requireNativeModule is a parameter in our enclosing scope. Guard anyway so the
// file can also be evaluated outside that wrapper (dev tools, tests).
const requireModule =
	(typeof requireNativeModule === 'function') ? requireNativeModule :
	(typeof require === 'function') ? require : null;
// ===========================================================================
// ===== 1/3  DELTA LAYERS ===================================================
// ===========================================================================
/*
 * Keeps a texture's layer stack (per-layer image + blend mode + opacity + offset +
 * visibility + order) alive across a save/reload cycle for model formats whose file
 * has no concept of layers - Hytale's .blockymodel above all, but also Minecraft
 * Java/Bedrock and anything else that exports a flat texture.
 *
 * It does that without touching the model file at all: the layer stack is written to
 * a sidecar next to the texture PNG,
 *
 *     Texture.png                     <- the flat texture, unchanged, what the game reads
 *     Texture.layers.json             <- the stack: order, blend modes, opacity, offsets
 *     Texture.layers/                 <- one PNG per layer
 *       base-color_1a2b3c4d.png
 *       grime-overlay_9e8f7a6b.png
 *
 * and read back when the model (or just the texture) is opened again. Anything that
 * only cares about the clean model plus flat texture never sees it.
 *
 * Desktop app only - the whole approach needs real filesystem access.
 */
const DeltaLayersModule = (function () {
	const SIDECAR_VERSION = 3; // v3 adds layer groups (type/parent/folded); v1 and v2 still load
	const SETTING_ID = 'delta_layers_persist';
	const WATCH_SETTING_ID = 'delta_layers_watch';
	const TAG = '[embodytools/layers]';

	// ---------------------------------------------------------------------------
	// state / cleanup bookkeeping
	// ---------------------------------------------------------------------------

	let native_fs = null;          // scoped fs handed to us by Blockbench, once granted
	let fs_permission_refused = false;
	let deletables = [];           // event hooks, actions, settings - anything with .delete()
	let wrapped_codecs = [];       // codecs whose write/parse we patched
	let menu_entries = [];         // [menu, action] pairs we added
	let sync_timer = null;
	let layer_watchers = [];       // { texture, watcher, dir, timers }
	let suppress_watch_until = 0;  // set around our own writes, so we don't chase our own tail

	const log = (...args) => console.log(TAG, ...args);
	const warn = (...args) => console.warn(TAG, ...args);
	const fail = (...args) => console.error(TAG, ...args);

	// ---------------------------------------------------------------------------
	// native modules
	// ---------------------------------------------------------------------------

	/**
	 * Blockbench hands plugins a *scoped* fs and shows a permission dialog the first time.
	 * Pass prompt=false to ask "am I already allowed?" without putting a dialog in the
	 * user's face - we only ever prompt at a moment where the user is knowingly loading or
	 * saving a model of a format that needs the bridge.
	 */
	function getFS(prompt) {
		if (native_fs) return native_fs;
		if (!requireModule) return null;
		if (!prompt && fs_permission_refused) return null;
		try {
			const result = requireModule('fs', {
				message: 'Texture layer stacks are stored in a sidecar file next to each texture PNG. '
					+ 'File access is needed to read and write those.',
				show_permission_dialog: prompt ? undefined : false,
			});
			if (result) {
				native_fs = result;
				fs_permission_refused = false;
			} else if (prompt) {
				fs_permission_refused = true;
				warn('file access was not granted - texture layers will not be persisted');
			}
			return native_fs;
		} catch (error) {
			fail('could not get file access', error);
			return null;
		}
	}

	function getCrypto() {
		if (!requireModule) return null;
		try {
			return requireModule('crypto'); // a "safe" module in Blockbench - no dialog
		} catch (error) {
			return null;
		}
	}

	// ---------------------------------------------------------------------------
	// small helpers
	// ---------------------------------------------------------------------------

	function bridgeEnabled() {
		if (typeof isApp !== 'undefined' && !isApp) return false;
		const setting = (typeof settings !== 'undefined') && settings[SETTING_ID];
		return !setting || setting.value !== false;
	}

	function watchingEnabled() {
		if (!bridgeEnabled()) return false;
		const setting = (typeof settings !== 'undefined') && settings[WATCH_SETTING_ID];
		return !setting || setting.value !== false;
	}

	/** Is this texture still in an open project, and if so which one? */
	function projectHolding(texture) {
		if (typeof Texture !== 'undefined' && Texture.all.includes(texture)) {
			return (typeof Project !== 'undefined') ? Project : null;
		}
		if (typeof ModelProject !== 'undefined' && ModelProject.all) {
			return ModelProject.all.find((project) => project.textures && project.textures.includes(texture)) || null;
		}
		return null;
	}

	/**
	 * Blockbench's own .bbmodel codec (id 'project') already serializes texture.layers in
	 * full, so it needs no help. Every other codec - blockymodel, Minecraft Java/Bedrock,
	 * obj, ... - writes a flat texture at best. One rule, no format-specific checks.
	 */
	function codecNeedsLayerBridge(codec) {
		return !!codec && codec.id !== 'project';
	}

	/** Is this codec the one that actually stores the project's model? */
	function isModelSaveCodec(codec) {
		if (!codecNeedsLayerBridge(codec)) return false;
		if (typeof Format !== 'undefined' && Format && Format.codec === codec) return true;
		if (typeof Project !== 'undefined' && Project && Project.export_codec === codec.id) return true;
		return false;
	}

	/** Does the *current project* save through a codec that loses layers? */
	function projectUsesBridge() {
		if (typeof Project === 'undefined' || !Project) return false;
		if (typeof Format !== 'undefined' && codecNeedsLayerBridge(Format && Format.codec)) return true;
		if (typeof Codecs !== 'undefined' && codecNeedsLayerBridge(Codecs[Project.export_codec])) return true;
		return false;
	}

	/*
	 * Blockbench 5.2 turned texture.layers into a flat list of TextureLayerItem, which can be
	 * a TextureLayer (has a canvas) or a TextureLayerGroup (has none, just a name and a
	 * folded flag). Nesting is expressed with parent_uuid, not by nesting the array. The base
	 * class comment says text and fx layers may follow, so anything we do not recognise is
	 * carried through untouched rather than dropped.
	 */
	function groupsSupported() {
		return typeof TextureLayerGroup !== 'undefined' && typeof TextureLayerGroup === 'function';
	}

	function isLayerGroup(item) {
		if (!item) return false;
		if (groupsSupported() && item instanceof TextureLayerGroup) return true;
		return item.type === 'layer_group';
	}

	/** A real, paintable layer: something with pixels we can write to a PNG. */
	function isPaintableLayer(item) {
		return !!item && !isLayerGroup(item) && !!item.canvas && !!item.ctx;
	}

	function plural(count, noun) {
		return count + ' ' + noun + (count === 1 ? '' : 's');
	}

	function slugify(name) {
		const slug = String(name || '')
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-+|-+$/g, '')
			.slice(0, 40);
		return slug || 'layer';
	}

	function layerFileName(name, uuid) {
		return slugify(name) + '_' + String(uuid || '').replace(/[^a-z0-9]/gi, '').slice(0, 8) + '.png';
	}

	function sidecarPathsFor(texture) {
		const dir = PathModule.dirname(texture.path);
		const base = pathToName(texture.path, false);
		return {
			dir,
			base,
			json: PathModule.join(dir, base + '.layers.json'),
			layers_dir: PathModule.join(dir, base + '.layers'),
		};
	}

	/**
	 * Hash of the flat PNG as it sits on disk, used purely as a staleness guard: if the
	 * file changed since we wrote the sidecar, someone edited it outside Blockbench and we
	 * must not silently throw their work away.
	 *
	 * Format is "<algo>:<hex>" so a sidecar written by an older/newer version still
	 * compares correctly - we re-hash with whatever algorithm the file names.
	 */
	function hashFile(file_path, algo) {
		const fs = getFS();
		const crypto = getCrypto();
		if (!fs || !crypto) return null;
		const algorithm = algo || 'sha256';
		try {
			const hash = crypto.createHash(algorithm).update(fs.readFileSync(file_path)).digest('hex');
			return algorithm + ':' + hash;
		} catch (error) {
			warn('could not hash ' + file_path, error);
			return null;
		}
	}

	/** Same digest as hashFile, computed from base64 without decoding it ourselves. */
	function hashBase64(base64, algo) {
		const crypto = getCrypto();
		if (!crypto || typeof base64 !== 'string') return null;
		const algorithm = algo || 'sha256';
		try {
			return algorithm + ':' + crypto.createHash(algorithm).update(base64, 'base64').digest('hex');
		} catch (error) {
			return null;
		}
	}

	/**
	 * Digest of a layer's live pixels. Kept in memory only. Lets a save skip the PNG encode
	 * entirely for layers nobody touched, which is the expensive half of writing a sidecar.
	 */
	function hashLayerPixels(layer) {
		const crypto = getCrypto();
		if (!crypto || !layer.canvas || !layer.canvas.width || !layer.canvas.height) return null;
		try {
			const image_data = layer.ctx.getImageData(0, 0, layer.canvas.width, layer.canvas.height);
			// image_data.data is a Uint8ClampedArray, which createHash accepts directly - no
			// need to reach for Buffer.
			return crypto.createHash('sha256')
				.update(layer.canvas.width + 'x' + layer.canvas.height + ':')
				.update(image_data.data)
				.digest('hex');
		} catch (error) {
			return null; // no pixel hash just means we fall back to always encoding
		}
	}

	/**
	 * updateLayerChanges() refreshes the texture's own material, but a texture that is one
	 * channel of a PBR material group also needs the group's combined material rebuilt -
	 * Blockbench does this itself at the end of updateChangesAfterEdit(). We call
	 * updateLayerChanges() directly, so we have to do the same.
	 */
	function refreshMaterialGroup(texture) {
		try {
			if (!texture.group) return;
			if (texture.pbr_channel !== 'mer' && texture.pbr_channel !== 'height') return;
			if (typeof BarItems === 'undefined' || !BarItems.view_mode || BarItems.view_mode.value !== 'material') return;
			const group = texture.getGroup && texture.getGroup();
			if (group && group.is_material && typeof group.updateMaterial === 'function') group.updateMaterial();
		} catch (error) {
			warn('could not refresh the material group for "' + texture.name + '"', error);
		}
	}

	function copyCanvas(source) {
		const canvas = document.createElement('canvas');
		canvas.width = source.width;
		canvas.height = source.height;
		canvas.getContext('2d').drawImage(source, 0, 0);
		return canvas;
	}

	function validBlendMode(mode) {
		const values = (typeof TextureLayer !== 'undefined'
			&& TextureLayer.properties
			&& TextureLayer.properties.blend_mode
			&& TextureLayer.properties.blend_mode.enum_values) || [];
		return values.includes(mode) ? mode : 'default';
	}

	function validVector2(value, fallback) {
		if (value instanceof Array && value.length >= 2
			&& typeof value[0] === 'number' && typeof value[1] === 'number'
			&& isFinite(value[0]) && isFinite(value[1])) {
			return [value[0], value[1]];
		}
		return fallback;
	}

	// ---------------------------------------------------------------------------
	// SAVE: write the sidecar
	// ---------------------------------------------------------------------------

	/** Coalesce: one Ctrl+S can write the model file plus every collection file. */
	function scheduleSidecarSync() {
		if (sync_timer) return;
		sync_timer = setTimeout(() => {
			sync_timer = null;
			try {
				syncAllSidecars();
			} catch (error) {
				fail('sidecar sync failed', error);
			}
		}, 0);
	}

	function syncAllSidecars() {
		if (!bridgeEnabled() || typeof Project === 'undefined' || !Project) return;
		if (!getFS(true)) return;
		for (const texture of Texture.all.slice()) {
			try {
				syncSidecarForTexture(texture);
			} catch (error) {
				fail('could not sync layers for "' + (texture && texture.name) + '"', error);
			}
		}
	}

	function syncSidecarForTexture(texture) {
		const fs = getFS();
		if (!fs || !texture || !texture.path || !PathModule.isAbsolute(texture.path)) return;
		// No flat PNG on disk yet (texture never saved) - there is nothing to key the
		// staleness hash to, and no directory we can be confident about.
		if (!fs.existsSync(texture.path)) return;

		const paths = sidecarPathsFor(texture);
		const temporary = texture.flags && texture.flags.has && texture.flags.has('temporary_layers');
		const worth_saving = texture.layers_enabled && texture.layers.length > 0 && !temporary;

		if (worth_saving) {
			writeSidecar(texture, paths);
			return;
		}

		// The stack is gone (merged down, or layers switched off). The old sidecar would be
		// reapplied on a future load, so it has to go - but only if we are the ones who put
		// this texture in its current state. If our load pass never ran or bailed out (file
		// access denied, layer PNGs missing, user kept an external edit), the sidecar is not
		// ours to delete.
		if (!fs.existsSync(paths.json)) return;
		if (texture.__delta_layers_state === 'applied' || texture.__delta_layers_state === 'absent') {
			log('layers no longer present on "' + texture.name + '" - removing its sidecar');
			stopLayerWatcher(texture);
			removeSidecar(paths);
			texture.__delta_layers_state = 'absent';
		} else {
			warn('"' + texture.name + '" has a layer sidecar that was never applied this session - '
				+ 'leaving it alone rather than overwriting or deleting it');
		}
	}

	/**
	 * Anything the previous sidecar knew about that this Blockbench cannot represent gets
	 * re-emitted unchanged instead of being dropped. That is what lets you group layers in
	 * 5.2, work on the same model in 5.1 where groups do not exist, save there as often as
	 * you like, and still find your groups intact when you go back to 5.2.
	 *
	 * A missing plain layer is NOT carried: that one really was deleted by the user.
	 */
	function carryForwardMissingItems(entries, previous, live_ids, written_files) {
		if (!previous || !(previous.layers instanceof Array)) return;

		const missing = previous.layers.filter((entry) => {
			if (!entry || typeof entry.id !== 'string' || live_ids.has(entry.id)) return false;
			const type = entry.type || 'layer';
			if (type === 'layer_group') return !groupsSupported();
			return type !== 'layer'; // a kind we could not have created here either
		});
		if (!missing.length) return;

		function place(entry, index) {
			const copy = Object.assign({}, entry);
			if (index === -1) entries.push(copy);
			else entries.splice(index, 0, copy);
			// keep its image, if it has one, safe from the orphan sweep
			if (typeof copy.file === 'string') written_files.add(PathModule.basename(copy.file));
		}

		// Put each item back just above the last thing that still claims it as a parent, the
		// same way Blockbench itself inserts a new group. Repeat so nested groups settle once
		// their children have been placed. solveLayerOrder() normalises it all on load anyway.
		let remaining = missing.slice();
		while (remaining.length) {
			const deferred = [];
			let placed_any = false;
			for (const entry of remaining) {
				let last_child = -1;
				for (let i = 0; i < entries.length; i++) {
					if (entries[i].parent === entry.id) last_child = i;
				}
				if (last_child === -1) {
					deferred.push(entry);
					continue;
				}
				place(entry, last_child + 1);
				placed_any = true;
			}
			if (!placed_any) {
				// Nothing left has surviving children. Keep them anyway, at the top.
				for (const entry of deferred) place(entry, -1);
				break;
			}
			remaining = deferred;
		}
		log('carried ' + plural(missing.length, 'item')
			+ ' forward that this version of Blockbench cannot represent');
	}

	function writeSidecar(texture, paths) {
		const fs = getFS();
		if (!fs) return;

		// What is already on disk, so untouched layers can be left exactly as they are.
		const previous_by_id = {};
		const previous = readSidecarQuietly(paths);
		if (previous && previous.layers instanceof Array) {
			for (const entry of previous.layers) {
				if (entry && typeof entry.id === 'string') previous_by_id[entry.id] = entry;
			}
		}

		// A sidecar written by a newer version of this plugin may hold things this copy has no
		// idea about. Refuse rather than flatten it into something lossy.
		if (previous && typeof previous.version === 'number' && previous.version > SIDECAR_VERSION) {
			warn('"' + texture.name + '" has a sidecar from a newer version of this plugin (v'
				+ previous.version + ') - not overwriting it. Update the plugin.');
			return;
		}

		fs.mkdirSync(paths.layers_dir, { recursive: true });
		suppress_watch_until = Date.now() + 500; // our own writes must not look like outside edits

		const written_files = new Set();
		const layer_entries = [];
		const live_ids = new Set();
		let files_written = 0;

		texture.layers.forEach((layer, index) => {
			live_ids.add(layer.uuid);
			const previous_for_item = previous_by_id[layer.uuid];
			// Where a version understands nesting, its live state is the truth - including a
			// parent the user just cleared. Only fall back to the last save on a version that
			// has no parent_uuid at all, which is what keeps a group alive through an edit in
			// 5.1. Getting this wrong resurrects parents the user deliberately removed.
			const parent = groupsSupported()
				? (layer.parent_uuid || null)
				: (layer.parent_uuid || (previous_for_item && previous_for_item.parent) || null);

			if (isLayerGroup(layer)) {
				layer_entries.push({
					type: 'layer_group',
					id: layer.uuid,
					name: layer.name,
					parent,
					folded: layer.folded === true,
					visible: layer.visible !== false,
					order: index,
				});
				return;
			}

			if (!isPaintableLayer(layer)) {
				// Some future layer kind we cannot serialise. Keep whatever the last save knew
				// about it instead of quietly losing it.
				if (previous_for_item) {
					layer_entries.push(Object.assign({}, previous_for_item, { order: index, parent }));
					if (typeof previous_for_item.file === 'string') {
						written_files.add(PathModule.basename(previous_for_item.file));
					}
				} else {
					warn('skipping "' + layer.name + '": not a layer type this plugin understands');
				}
				return;
			}

			const file_name = layerFileName(layer.name, layer.uuid);
			const file_path = PathModule.join(paths.layers_dir, file_name);
			const relative_file = paths.base + '.layers/' + file_name;
			const previous_entry = previous_by_id[layer.uuid];
			const pixel_hash = hashLayerPixels(layer);

			// Nothing about this layer's image changed since we last wrote it, the file is
			// still where we put it, and it still has the bytes we wrote. Skip the PNG encode
			// and the write entirely.
			const untouched = !!(pixel_hash
				&& layer.__eg_pixel_hash === pixel_hash
				&& previous_entry
				&& previous_entry.file === relative_file
				&& previous_entry.hash
				&& previous_entry.hash === layer.__eg_file_hash
				&& fs.existsSync(file_path));

			let file_hash;
			if (untouched) {
				file_hash = previous_entry.hash;
			} else {
				// getSaveCopy() gives {name, offset, scale, opacity, visible, blend_mode,
				// width, height, data_url} - a ready-made snapshot of exactly what we need.
				const base64 = layer.getSaveCopy().data_url.split(',')[1];
				file_hash = hashBase64(base64);
				fs.writeFileSync(file_path, base64, { encoding: 'base64' });
				files_written++;
			}

			layer.__eg_pixel_hash = pixel_hash;
			layer.__eg_file_hash = file_hash;
			layer.__eg_file_name = file_name;
			written_files.add(file_name);

			layer_entries.push({
				type: 'layer',
				id: layer.uuid,
				name: layer.name,
				parent,
				file: relative_file, // always forward slashes, resolved on load
				// order 0 is the BOTTOM layer, ascending toward the top - the same direction as
				// texture.layers itself (mergeDown() treats the lower index as the layer
				// underneath). Do not reverse this on either side.
				order: index,
				offset: layer.offset.slice(),
				scale: layer.scale.slice(),
				opacity: layer.opacity, // 0-100, Blockbench's own range. Do not normalize to 0-1.
				visible: layer.visible,
				blend_mode: layer.blend_mode,
				width: layer.width,
				height: layer.height,
				hash: file_hash, // lets the next save skip this file, and spots outside edits
			});
		});

		carryForwardMissingItems(layer_entries, previous, live_ids, written_files);
		layer_entries.forEach((entry, index) => { entry.order = index; });

		pruneOrphanLayerFiles(paths.layers_dir, written_files);

		const sidecar = {
			version: SIDECAR_VERSION,
			texture_file: PathModule.basename(texture.path),
			generated_by: {
				plugin: PLUGIN_ID,
				plugin_version: PLUGIN_VERSION,
				blockbench_version: (typeof Blockbench !== 'undefined' && Blockbench.version) || null,
			},
			canvas: { width: texture.width, height: texture.height },
			source_hash: hashFile(texture.path),
			active_layer: (texture.selected_layer && texture.selected_layer.uuid) || null,
			layers: layer_entries,
		};

		// Don't rewrite an identical file - that only churns timestamps and version control.
		const json = JSON.stringify(sidecar, null, 2);
		let json_changed = true;
		try {
			json_changed = !fs.existsSync(paths.json) || fs.readFileSync(paths.json, 'utf-8') !== json;
		} catch (error) { /* unreadable: write it */ }
		if (json_changed) fs.writeFileSync(paths.json, json, 'utf-8');

		texture.__delta_layers_state = 'applied';
		startLayerWatcher(texture, paths);

		if (files_written || json_changed) {
			log('saved ' + plural(layer_entries.length, 'layer') + ' for "' + texture.name + '" ('
				+ files_written + ' image' + (files_written === 1 ? '' : 's') + ' rewritten'
				+ (json_changed ? '' : ', index unchanged') + ')');
		}
	}

	/** Layer files left over from a previous save (renamed or deleted layers). */
	function pruneOrphanLayerFiles(layers_dir, keep) {
		const fs = getFS();
		if (!fs) return;
		try {
			for (const file_name of fs.readdirSync(layers_dir)) {
				if (!/\.png$/i.test(file_name) || keep.has(file_name)) continue;
				fs.unlinkSync(PathModule.join(layers_dir, file_name));
			}
		} catch (error) {
			warn('could not clean up old layer files in ' + layers_dir, error);
		}
	}

	function removeSidecar(paths) {
		const fs = getFS();
		if (!fs) return;
		try {
			if (fs.existsSync(paths.json)) fs.unlinkSync(paths.json);
		} catch (error) {
			warn('could not remove ' + paths.json, error);
		}
		try {
			if (!fs.existsSync(paths.layers_dir)) return;
			for (const file_name of fs.readdirSync(paths.layers_dir)) {
				if (/\.png$/i.test(file_name)) {
					fs.unlinkSync(PathModule.join(paths.layers_dir, file_name));
				}
			}
			// Only remove the folder if nothing unexpected is left in it.
			if (fs.readdirSync(paths.layers_dir).length === 0) fs.rmdirSync(paths.layers_dir);
		} catch (error) {
			warn('could not remove ' + paths.layers_dir, error);
		}
	}

	// ---------------------------------------------------------------------------
	// LOAD: rebuild the stack
	// ---------------------------------------------------------------------------

	/**
	 * A texture created from a path populates its canvas asynchronously (img.onload sets
	 * width/height and draws). Compositing or hashing before that is meaningless, so wait.
	 */
	function whenTextureReady(texture, callback, timeout_ms) {
		const deadline = Date.now() + (timeout_ms || 10000);
		(function check() {
			if (!texture.path) return;
			if (texture.width > 0 && texture.height > 0 && texture.img && texture.img.complete) {
				callback();
				return;
			}
			if (Date.now() > deadline) {
				warn('gave up waiting for "' + texture.name + '" to load; layers not restored');
				return;
			}
			setTimeout(check, 30);
		})();
	}

	function considerTexture(texture) {
		if (!bridgeEnabled() || !texture || texture.__delta_layers_state) return;
		if (!texture.path || !PathModule.isAbsolute(texture.path)) return;
		// Somebody else already owns this stack - a .bbmodel carries its layers itself.
		if (texture.layers_enabled && texture.layers.length) {
			texture.__delta_layers_state = 'external';
			return;
		}
		if (!projectUsesBridge()) return;

		texture.__delta_layers_state = 'checking';
		// Deferred on purpose: 'add_texture' fires in the middle of the codec's own parse()
		// run, and we would rather not ask for file access - or touch the texture - while
		// that is still going.
		setTimeout(() => {
			try {
				checkTextureForSidecar(texture);
			} catch (error) {
				fail('could not check layers for "' + texture.name + '"', error);
				texture.__delta_layers_state = 'skipped';
			}
		}, 0);
	}

	function checkTextureForSidecar(texture) {
		const fs = getFS(true);
		if (!fs) {
			texture.__delta_layers_state = 'skipped';
			return;
		}
		const paths = sidecarPathsFor(texture);
		if (!fs.existsSync(paths.json)) {
			texture.__delta_layers_state = 'absent';
			return;
		}
		texture.__delta_layers_state = 'pending';
		whenTextureReady(texture, () => restoreFromSidecar(texture, paths));
	}

	function considerAllTextures() {
		if (typeof Project === 'undefined' || !Project) return;
		for (const texture of Texture.all.slice()) {
			try {
				considerTexture(texture);
			} catch (error) {
				fail('could not check layers for "' + (texture && texture.name) + '"', error);
			}
		}
	}

	/** Plain read, no warnings and no version gate - used by the save path. */
	function readSidecarQuietly(paths) {
		const fs = getFS();
		if (!fs) return null;
		try {
			if (!fs.existsSync(paths.json)) return null;
			return JSON.parse(fs.readFileSync(paths.json, 'utf-8'));
		} catch (error) {
			return null;
		}
	}

	function readSidecar(paths) {
		const fs = getFS();
		if (!fs) return null;
		let sidecar;
		try {
			sidecar = JSON.parse(fs.readFileSync(paths.json, 'utf-8'));
		} catch (error) {
			warn('could not read ' + paths.json, error);
			return null;
		}
		if (!sidecar || !(sidecar.layers instanceof Array) || !sidecar.layers.length) {
			warn(paths.json + ' has no layers in it');
			return null;
		}
		if (typeof sidecar.version === 'number' && sidecar.version > SIDECAR_VERSION) {
			warn(paths.json + ' was written by a newer version of this plugin (v'
				+ sidecar.version + ') - not touching it');
			return null;
		}
		return sidecar;
	}

	function restoreFromSidecar(texture, paths, force) {
		const sidecar = readSidecar(paths);
		if (!sidecar) {
			texture.__delta_layers_state = 'skipped';
			return;
		}

		const stored_hash = sidecar.source_hash;
		let current_hash = null;
		if (stored_hash && !force) {
			const algo = String(stored_hash).includes(':') ? String(stored_hash).split(':')[0] : 'sha1';
			current_hash = hashFile(texture.path, algo);
		}

		// Only treat it as stale if we actually managed to compute a comparable hash.
		if (stored_hash && !force && current_hash && current_hash !== stored_hash) {
			promptStaleSidecar(texture, sidecar, paths);
			return;
		}

		applyLayers(texture, sidecar, paths, false);
	}

	/**
	 * The flat PNG changed on disk since the sidecar was written - someone painted on it in
	 * another program. Reapplying the old stack would silently discard that, so ask.
	 */
	function promptStaleSidecar(texture, sidecar, paths) {
		texture.__delta_layers_state = 'skipped';
		Blockbench.showMessageBox({
			title: 'Texture changed outside Blockbench',
			icon: 'layers',
			message: '**' + PathModule.basename(texture.path) + '** has been edited since its layer stack '
				+ 'was saved (' + sidecar.layers.length + ' layers). Restoring the stack would replace '
				+ 'what is currently in the file.',
			commands: {
				keep_flat: {
					text: 'Keep the file as it is',
					icon: 'image',
					description: 'Work on the flat texture. The saved layers stay on disk, untouched.',
				},
				restore_and_keep: {
					text: 'Restore layers, keep the edited image on top',
					icon: 'layers',
					description: 'Nothing is lost: the outside edit comes back as an extra top layer you can merge or delete.',
				},
				restore: {
					text: 'Restore layers, discard the outside edit',
					icon: 'restore_page',
					description: 'Rebuild the stack exactly as it was saved.',
				},
			},
			buttons: ['Cancel'],
			cancel: 0,
		}, (command) => {
			if (command === 'restore') {
				applyLayers(texture, sidecar, paths, false);
			} else if (command === 'restore_and_keep') {
				applyLayers(texture, sidecar, paths, true);
			} else {
				log('kept the flat texture for "' + texture.name + '"; its sidecar was left untouched');
			}
		});
	}

	/** A sidecar entry becomes either a layer (async, needs its PNG) or a group (instant). */
	function buildItem(texture, entry, dir) {
		if (entry && entry.type === 'layer_group') {
			// On 5.1 there is no such class. Skipping the group leaves its children at the top
			// level, which is the best that version can do, and the group survives on disk.
			if (!groupsSupported()) return null;
			try {
				return new TextureLayerGroup({
					name: typeof entry.name === 'string' ? entry.name : 'Layer Group',
					folded: entry.folded === true,
					visible: entry.visible !== false,
				}, texture, typeof entry.id === 'string' ? entry.id : undefined);
			} catch (error) {
				fail('could not rebuild layer group "' + (entry.name || entry.id) + '"', error);
				return null;
			}
		}
		return buildLayer(texture, entry, dir);
	}

	function buildLayer(texture, entry, dir) {
		return new Promise((resolve) => {
			const fs = getFS();
			if (!fs || !entry || typeof entry.file !== 'string') return resolve(null);

			const file_path = PathModule.resolve(dir, entry.file);
			// A hand-edited sidecar must not be able to point us outside the texture's folder.
			if (!PathModule.resolve(file_path).startsWith(PathModule.resolve(dir))) {
				warn('layer path escapes the texture folder, skipping: ' + entry.file);
				return resolve(null);
			}

			let data_url;
			let base64;
			try {
				if (!fs.existsSync(file_path)) throw new Error('file does not exist');
				base64 = fs.readFileSync(file_path, { encoding: 'base64' });
				data_url = 'data:image/png;base64,' + base64;
			} catch (error) {
				warn('layer image missing, skipping layer "' + (entry.name || entry.id) + '": ' + entry.file);
				return resolve(null);
			}

			const image = new Image();
			image.onload = () => {
				try {
					const layer = new TextureLayer({
						name: typeof entry.name === 'string' ? entry.name : 'layer',
						offset: validVector2(entry.offset, [0, 0]),
						scale: validVector2(entry.scale, [1, 1]),
						opacity: typeof entry.opacity === 'number'
							? Math.clamp(entry.opacity, 0, 100)
							: 100,
						visible: entry.visible !== false,
						blend_mode: validBlendMode(entry.blend_mode),
					}, texture, typeof entry.id === 'string' ? entry.id : undefined);

					layer.setSize(image.naturalWidth, image.naturalHeight);
					layer.ctx.drawImage(image, 0, 0);

					// Remember which file this layer came from and what was in it, so the watcher
					// can tell an outside edit from our own write, and so the next save can skip
					// re-encoding a layer nobody touched.
					layer.__eg_file_name = PathModule.basename(file_path);
					layer.__eg_file_hash = hashBase64(base64);
					layer.__eg_pixel_hash = hashLayerPixels(layer);
					// Did someone edit this file since the sidecar recorded it?
					layer.__eg_file_changed = !!(entry.hash && layer.__eg_file_hash && entry.hash !== layer.__eg_file_hash);

					resolve(layer);
				} catch (error) {
					fail('could not rebuild layer "' + (entry.name || entry.id) + '"', error);
					resolve(null);
				}
			};
			image.onerror = () => {
				warn('layer image could not be decoded, skipping: ' + entry.file);
				resolve(null);
			};
			image.src = data_url;
		});
	}

	function applyLayers(texture, sidecar, paths, keep_current_as_top_layer) {
		// Snapshot the flat image first if we are going to preserve it - installing the
		// stack overwrites texture.canvas.
		const flat_copy = keep_current_as_top_layer ? copyCanvas(texture.canvas) : null;

		// order 0 = bottom. Sort defensively in case the file was hand-edited or written
		// by something that emitted them out of order.
		const entries = sidecar.layers.slice().sort((a, b) => (a.order || 0) - (b.order || 0));

		Promise.all(entries.map((entry) => buildItem(texture, entry, paths.dir)))
			.then((built) => {
				const layers = built.filter(Boolean);
				if (!layers.length) {
					warn('none of the layers for "' + texture.name + '" could be restored');
					texture.__delta_layers_state = 'skipped';
					return;
				}

				// Only count a genuinely missing image as missing. A group we deliberately
				// skipped because this Blockbench has no groups is not a failure.
				const dropped = built.reduce((count, item, index) => {
					if (item) return count;
					return entries[index].type === 'layer_group' ? count : count + 1;
				}, 0);
				if (dropped) {
					Blockbench.showQuickMessage(
						plural(dropped, 'layer file') + ' missing for ' + texture.name, 2500);
				}

				// Everything exists now, so nesting can be hooked up. Parents pointing at a group
				// we skipped are left unset, which puts those layers at the top level.
				const by_id = {};
				built.forEach((item, index) => { if (item) by_id[entries[index].id] = item; });
				built.forEach((item, index) => {
					if (!item) return;
					const parent_id = entries[index].parent;
					if (parent_id && by_id[parent_id]) item.parent_uuid = parent_id;
				});

				if (flat_copy) {
					const top = new TextureLayer({ name: 'Edited outside Blockbench' }, texture);
					top.setSize(flat_copy.width, flat_copy.height);
					top.ctx.drawImage(flat_copy, 0, 0);
					layers.push(top);
				}

				// Layer images edited outside Blockbench while the project was closed. The stack
				// is correct, but the flat PNG next to it is not - it still shows the old
				// composite, so the texture has to count as dirty and be re-exported on save.
				const changed = layers.filter((layer) => layer.__eg_file_changed);
				installLayers(texture, layers, sidecar, changed.length > 0);
				if (changed.length) {
					log('layer images changed on disk since the last save: '
						+ changed.map((layer) => layer.name).join(', '));
					Blockbench.showQuickMessage(
						plural(changed.length, 'layer') + ' changed on disk - save to update ' + texture.name, 3000);
				}
			})
			.catch((error) => {
				fail('could not restore layers for "' + texture.name + '"', error);
				texture.__delta_layers_state = 'skipped';
			});
	}

	function installLayers(texture, layers, sidecar, force_dirty) {
		// Restoring a saved state is not an edit: don't let it mark the texture or the
		// project as having unsaved changes.
		const texture_was_saved = texture.saved;
		const project_was_saved = (typeof Project !== 'undefined' && Project) ? Project.saved : undefined;

		texture.layers_enabled = true;
		// Mutate the existing array rather than replacing it - the Layers panel is bound to
		// this exact array instance.
		texture.layers.splice(0, texture.layers.length, ...layers);

		// 5.2 keeps the hierarchy in a flat array and derives render order from parent_uuid.
		// Let Blockbench canonicalise it rather than trusting our insertion positions.
		if (typeof TextureLayerItem !== 'undefined' && typeof TextureLayerItem.solveLayerOrder === 'function') {
			try {
				const solved = TextureLayerItem.solveLayerOrder(texture.layers);
				if (solved && solved.length === texture.layers.length) {
					texture.layers.splice(0, texture.layers.length, ...solved);
				}
			} catch (error) {
				warn('could not normalise layer order, keeping the saved order', error);
			}
		}

		let active = sidecar.active_layer && texture.layers.find((layer) => layer.uuid === sidecar.active_layer);
		if (!active) active = texture.layers[texture.layers.length - 1];
		texture.selected_layer = active || null;

		// Composites bottom-to-top with the right blend modes and refreshes the material -
		// Blockbench does all of that, we just ask for it.
		texture.updateLayerChanges(true);
		refreshMaterialGroup(texture);

		if (typeof Texture !== 'undefined' && Texture.selected === texture) {
			if (active && typeof active.select === 'function') {
				try { active.select(); } catch (error) { /* UI not ready yet, harmless */ }
			}
			if (typeof Panels !== 'undefined' && Panels.layers && Panels.layers.inside_vue) {
				Panels.layers.inside_vue.layers = texture.layers;
			}
		}

		texture.saved = force_dirty ? false : texture_was_saved;
		if (project_was_saved !== undefined) Project.saved = project_was_saved;
		texture.__delta_layers_state = 'applied';
		startLayerWatcher(texture, sidecarPathsFor(texture));

		if (typeof updateInterfacePanels === 'function') updateInterfacePanels();
		if (typeof BARS !== 'undefined' && BARS.updateConditions) BARS.updateConditions();

		log('restored ' + plural(layers.length, 'layer') + ' on "' + texture.name + '"');
		Blockbench.showQuickMessage('Restored ' + plural(layers.length, 'layer') + ' on ' + texture.name, 1600);
	}

	// ---------------------------------------------------------------------------
	// WATCH: pick up layer PNGs edited outside Blockbench
	// ---------------------------------------------------------------------------

	/*
	 * Blockbench watches a normal texture's file and reloads it when an external editor
	 * saves over it - but it gives up the moment layers are enabled (textures.js:
	 * "if (scope.layers_enabled || scope.internal) return"). Since the layer images are the
	 * files you would actually open in Photoshop or Aseprite, this does the same job for
	 * them: one watcher per <texture>.layers/ folder, reloading just the layer whose file
	 * changed.
	 */
	function startLayerWatcher(texture, paths) {
		stopLayerWatcher(texture);
		if (!watchingEnabled()) return;
		const fs = getFS();
		if (!fs || !fs.existsSync(paths.layers_dir)) return;

		const timers = {};
		let watcher;
		try {
			// Blockbench's scoped fs declares watch(path, options, listener) with fixed arity,
			// so unlike plain Node the options argument is NOT optional here.
			watcher = fs.watch(paths.layers_dir, {}, (event_type, file_name) => {
				if (!file_name || !/\.png$/i.test(file_name)) return;
				if (Date.now() < suppress_watch_until) return; // our own save, still in flight
				if (timers[file_name]) clearTimeout(timers[file_name]);
				// Editors often write in bursts, or to a temp file and rename. Settle first.
				timers[file_name] = setTimeout(() => {
					delete timers[file_name];
					try {
						onLayerFileChanged(texture, paths, file_name);
					} catch (error) {
						fail('could not reload layer file "' + file_name + '"', error);
					}
				}, 120);
			});
		} catch (error) {
			warn('could not watch ' + paths.layers_dir, error);
			return;
		}

		const record = { texture, watcher, dir: paths.layers_dir, timers };
		texture.__eg_layer_watcher = record;
		layer_watchers.push(record);
	}

	function stopLayerWatcher(texture) {
		const record = texture && texture.__eg_layer_watcher;
		if (!record) return;
		closeWatcherRecord(record);
		const index = layer_watchers.indexOf(record);
		if (index !== -1) layer_watchers.splice(index, 1);
		delete texture.__eg_layer_watcher;
	}

	function closeWatcherRecord(record) {
		try {
			for (const key in record.timers) clearTimeout(record.timers[key]);
			if (record.watcher && typeof record.watcher.close === 'function') record.watcher.close();
		} catch (error) {
			warn('could not close a layer watcher', error);
		}
	}

	function stopAllLayerWatchers() {
		for (const record of layer_watchers.slice()) {
			closeWatcherRecord(record);
			if (record.texture) delete record.texture.__eg_layer_watcher;
		}
		layer_watchers = [];
	}

	function onLayerFileChanged(texture, paths, file_name) {
		const project = projectHolding(texture);
		if (!project) {
			// The texture is gone - project closed, or the texture was deleted.
			stopLayerWatcher(texture);
			return;
		}

		const layer = texture.layers.find((candidate) => candidate.__eg_file_name === file_name);
		if (!layer) return; // a temp file, or a layer that no longer exists - not ours to touch

		const fs = getFS();
		const file_path = PathModule.join(paths.layers_dir, file_name);
		if (!fs || !fs.existsSync(file_path)) {
			warn('layer file "' + file_name + '" disappeared - keeping the layer as it is in Blockbench');
			return;
		}

		const hash = hashFile(file_path);
		if (hash && hash === layer.__eg_file_hash) return; // same bytes we wrote: nothing to do

		// Applying to a background project would composite against the wrong Format/UVEditor,
		// which is why Blockbench defers its own reloads the same way.
		if (typeof Project !== 'undefined' && project !== Project) {
			if (typeof project.whenNextOpen === 'function') {
				project.whenNextOpen(() => reloadLayerFromFile(texture, layer, file_path, hash));
			}
			return;
		}
		reloadLayerFromFile(texture, layer, file_path, hash);
	}

	function reloadLayerFromFile(texture, layer, file_path, hash) {
		const fs = getFS();
		if (!fs) return;
		let data_url;
		try {
			data_url = 'data:image/png;base64,' + fs.readFileSync(file_path, { encoding: 'base64' });
		} catch (error) {
			warn('could not read ' + file_path, error);
			return;
		}

		const image = new Image();
		image.onload = () => {
			try {
				// setSize clears the canvas on its own, so no leftovers from the old image.
				layer.setSize(image.naturalWidth, image.naturalHeight);
				layer.ctx.drawImage(image, 0, 0);
				layer.__eg_file_hash = hash || null;
				layer.__eg_pixel_hash = hashLayerPixels(layer);

				texture.updateLayerChanges(true);
				refreshMaterialGroup(texture);
				// The flat PNG on disk no longer matches the stack, so it has to be re-exported.
				texture.saved = false;

				if (typeof updateInterfacePanels === 'function') updateInterfacePanels();
				if (typeof UVEditor !== 'undefined' && UVEditor.vue && UVEditor.vue.$forceUpdate) {
					UVEditor.vue.$forceUpdate();
				}
				log('reloaded layer "' + layer.name + '" from disk');
				Blockbench.showQuickMessage('Reloaded layer "' + layer.name + '"', 1600);
			} catch (error) {
				fail('could not apply the reloaded image to layer "' + layer.name + '"', error);
			}
		};
		image.onerror = () => warn('layer file could not be decoded: ' + file_path);
		image.src = data_url;
	}

	// ---------------------------------------------------------------------------
	// codec hooks
	// ---------------------------------------------------------------------------

	/**
	 * Wrap write() and parse() on every codec that needs the bridge.
	 *
	 * write() is the one place every save path funnels through - Ctrl+S, "Export", and
	 * per-collection/attachment writes all call it. parse() runs right after a model file
	 * is read, which for the Hytale codec is also where textures get discovered, so it is
	 * the moment to look for sidecars. (Note the base Codec dispatches a 'compile' event
	 * but the blockymodel codec overrides compile() without dispatching, so that event is
	 * not usable here.)
	 *
	 * Both wrappers are idempotent, so plugin load order does not matter: we re-run this
	 * whenever there is a cheap excuse to.
	 */
	function wrapCodec(codec) {
		// The marker deliberately does NOT include the plugin id: if an older copy of this
		// plugin is still loaded under its previous name, we want it to stop us wrapping the
		// same codec twice rather than both of us writing the same sidecars on every save.
		if (!codec || codec.__layer_bridge_wrapped || !codecNeedsLayerBridge(codec)) return;
		if (typeof codec.write !== 'function' || typeof codec.parse !== 'function') return;

		codec.__layer_bridge_wrapped = true;
		codec.__delta_layers_write = codec.write;
		codec.__delta_layers_parse = codec.parse;
		wrapped_codecs.push(codec);

		const original_write = codec.write;
		codec.write = function (content, path) {
			const result = original_write.apply(this, arguments);
			try {
				// Textures are written by saveTextures() before the model file, synchronously,
				// so by now the flat PNG on disk is current and safe to hash.
				if (bridgeEnabled() && isModelSaveCodec(this)) scheduleSidecarSync();
			} catch (error) {
				fail('save hook failed', error);
			}
			return result;
		};

		const original_parse = codec.parse;
		codec.parse = function (model, path, args) {
			const result = original_parse.apply(this, arguments);
			try {
				if (bridgeEnabled()) {
					// The Hytale codec reuses an existing Texture object when one already has the
					// same path, in which case no 'add_texture' event fires - so sweep here too.
					considerAllTextures();
				}
			} catch (error) {
				fail('load hook failed', error);
			}
			return result;
		};
	}

	function wrapAllKnownCodecs() {
		if (typeof Codecs === 'undefined') return;
		for (const id in Codecs) {
			try {
				wrapCodec(Codecs[id]);
			} catch (error) {
				fail('could not hook codec "' + id + '"', error);
			}
		}
	}

	function unwrapAllCodecs() {
		for (const codec of wrapped_codecs) {
			try {
				if (codec.__delta_layers_write) codec.write = codec.__delta_layers_write;
				if (codec.__delta_layers_parse) codec.parse = codec.__delta_layers_parse;
				delete codec.__delta_layers_write;
				delete codec.__delta_layers_parse;
				delete codec.__layer_bridge_wrapped;
			} catch (error) {
				fail('could not unhook a codec', error);
			}
		}
		wrapped_codecs = [];
	}

	// ---------------------------------------------------------------------------
	// manual actions (escape hatches)
	// ---------------------------------------------------------------------------

	function contextTexture(context) {
		return (context instanceof Texture) ? context : Texture.selected;
	}

	function setupActions() {
		const save_action = new Action('delta_layers_save', {
			name: 'Save Delta Layers Now',
			description: 'Write this texture\'s layer stack to its sidecar file straight away',
			icon: 'save',
			category: 'textures',
			condition: () => {
				if (typeof isApp !== 'undefined' && !isApp) return false;
				const texture = Texture.selected;
				return !!(texture && texture.path && texture.layers_enabled && texture.layers.length);
			},
			click(event, context) {
				const texture = contextTexture(context);
				if (!texture || !texture.path) return;
				if (!getFS(true)) return;
				try {
					writeSidecar(texture, sidecarPathsFor(texture));
					Blockbench.showQuickMessage('Saved ' + plural(texture.layers.length, 'layer'), 1600);
				} catch (error) {
					fail('could not write the sidecar', error);
					Blockbench.showQuickMessage('Could not save layers - see the console', 2500);
				}
			},
		});

		const reload_action = new Action('delta_layers_reload', {
			name: 'Reload Delta Layers From Disk',
			description: 'Rebuild this texture\'s layer stack from its sidecar file, ignoring the staleness check',
			icon: 'layers',
			category: 'textures',
			condition: () => {
				if (typeof isApp !== 'undefined' && !isApp) return false;
				const texture = Texture.selected;
				const fs = getFS(false);
				if (!texture || !texture.path || !fs) return false;
				try {
					return fs.existsSync(sidecarPathsFor(texture).json);
				} catch (error) {
					return false;
				}
			},
			click(event, context) {
				const texture = contextTexture(context);
				if (!texture || !texture.path || !getFS(true)) return;
				restoreFromSidecar(texture, sidecarPathsFor(texture), true);
			},
		});

		const forget_action = new Action('delta_layers_delete', {
			name: 'Delete Saved Delta Layers',
			description: 'Remove this texture\'s sidecar file and its per-layer images',
			icon: 'delete',
			category: 'textures',
			condition: () => {
				if (typeof isApp !== 'undefined' && !isApp) return false;
				const texture = Texture.selected;
				const fs = getFS(false);
				if (!texture || !texture.path || !fs) return false;
				try {
					return fs.existsSync(sidecarPathsFor(texture).json);
				} catch (error) {
					return false;
				}
			},
			click(event, context) {
				const texture = contextTexture(context);
				if (!texture || !texture.path || !getFS(true)) return;
				Blockbench.showMessageBox({
					title: 'Delete saved texture layers',
					message: 'Delete the layer sidecar and per-layer images for **' + texture.name + '**? '
						+ 'The texture itself and the layers currently open in Blockbench are not touched.',
					buttons: ['Delete', 'Cancel'],
					confirm: 0,
					cancel: 1,
				}, (button) => {
					if (button !== 0) return;
					removeSidecar(sidecarPathsFor(texture));
					texture.__delta_layers_state = 'absent';
					Blockbench.showQuickMessage('Deleted saved layers for ' + texture.name, 1600);
				});
			},
		});

		deletables.push(save_action, reload_action, forget_action);

		if (typeof Texture !== 'undefined' && Texture.prototype.menu && Texture.prototype.menu.addAction) {
			for (const action of [save_action, reload_action, forget_action]) {
				Texture.prototype.menu.addAction(action);
				menu_entries.push([Texture.prototype.menu, action]);
			}
		}
	}

	function removeMenuEntries() {
		for (const [menu, action] of menu_entries) {
			try {
				if (menu.structure instanceof Array) {
					const index = menu.structure.indexOf(action);
					if (index !== -1) menu.structure.splice(index, 1);
				}
			} catch (error) {
				fail('could not remove a menu entry', error);
			}
		}
		menu_entries = [];
	}

	// -----------------------------------------------------------------------
	// module interface
	// -----------------------------------------------------------------------

	return {
		id: 'delta_layers',
		title: 'Delta Layers',
		settings: [SETTING_ID, WATCH_SETTING_ID],

		blocked() {
			// The whole approach is sidecar files next to the texture, so there is
			// nothing this module can do in the web app.
			if (typeof isApp !== 'undefined' && !isApp) return 'the web app has no filesystem access';
			if (!requireModule) return 'this build gives plugins no native module access';
			return null;
		},

		load() {
			new Setting(SETTING_ID, {
				name: 'Delta Layers: persist texture layers',
				description: 'Save each texture\'s layer stack to a sidecar file on export, and restore it on load, '
					+ 'for formats that cannot store layers themselves.',
				category: 'export',
				value: true,
				plugin: PLUGIN_ID,
			});
			deletables.push(settings[SETTING_ID]);

			new Setting(WATCH_SETTING_ID, {
				name: 'Delta Layers: reload layer images edited outside Blockbench',
				description: 'Watch each texture\'s .layers folder and reload a layer as soon as another '
					+ 'program saves over its PNG, the way Blockbench does for unlayered textures.',
				category: 'export',
				value: true,
				plugin: PLUGIN_ID,
				onChange(value) {
					if (value) {
						considerAllTextures();
					} else {
						stopAllLayerWatchers();
					}
				},
			});
			deletables.push(settings[WATCH_SETTING_ID]);

			wrapAllKnownCodecs();
			setupActions();

			// Cheap, idempotent re-wraps so plugin load order is a non-issue.
			deletables.push(Blockbench.on('quick_save_model', () => {
				wrapAllKnownCodecs();
				if (bridgeEnabled() && projectUsesBridge()) scheduleSidecarSync();
			}));
			deletables.push(Blockbench.on('select_project', () => {
				wrapAllKnownCodecs();
			}));

			// Catches textures added outside a model load too - dropped in by hand, or via the
			// Hytale plugin's "load textures from folder".
			deletables.push(Blockbench.on('add_texture', (data) => {
				if (!bridgeEnabled()) return;
				try {
					considerTexture(data && data.texture);
				} catch (error) {
					fail('could not check layers for a new texture', error);
				}
			}));
		},

		unload() {
			if (sync_timer) {
				clearTimeout(sync_timer);
				sync_timer = null;
			}
			// Unhooking first, but never at the cost of the settings and event hooks
			// below: a half-unloaded module is worse than one that never loaded.
			try {
				stopAllLayerWatchers();
				unwrapAllCodecs();
				removeMenuEntries();
			} catch (error) {
				fail('could not unhook cleanly', error);
			}
			for (const deletable of deletables) {
				try {
					if (deletable && typeof deletable.delete === 'function') deletable.delete();
				} catch (error) {
					fail('cleanup problem', error);
				}
			}
			deletables = [];
			native_fs = null;
		},
	};

})();
// ===========================================================================
// ===== 2/3  ANCHORED STRETCH ===============================================
// ===========================================================================
/*
 * Blockbench's Stretch tool (enabled by formats with `stretch_cubes`, e.g. the
 * Hytale formats) scales a cube around its own centre, so both faces on the
 * dragged axis move outwards. This makes the Stretch tool behave like the
 * Resize tool instead: the face you pull moves, the opposite face stays where it
 * was.
 *
 * How it works
 * ------------
 * Blockbench renders a cube as
 *
 *     rendered_low  = centre - (half_size + inflate) * stretch
 *     rendered_high = centre + (half_size + inflate) * stretch
 *
 * (see adjustFromAndToForInflateAndStretch in js/outliner/types/cube.js), where
 * centre is derived from from/to. Stretch never touches from/to, which is why
 * the cube grows in both directions.
 *
 * To pin one face we shift from/to (i.e. the centre) by exactly the amount the
 * dragged half grew:
 *
 *     delta = direction * (half_size + inflate) * growth
 *
 * direction is +1 when the positive-axis handle is being dragged and -1 for the
 * negative-axis handle. from/to are in the cube's own local space and so is the
 * drag axis, so no space conversion is needed, and the cube's origin/pivot is
 * left alone.
 *
 * Drag rate
 * ---------
 * All of the growth now lands on one face instead of being split between two,
 * so the same drag would move the dragged face twice as far as it used to. To
 * keep the tool feeling like it always did, the applied stretch is halved:
 *
 *     growth = (stretch_core_applied - stretch_at_drag_start) / 2
 *
 * The result is that the face you drag ends up exactly where the stock centred
 * stretch would have put it, and the opposite face simply doesn't move.
 *
 * Step size
 * ---------
 * Stock Blockbench derives the stretch value from the snapped drag distance:
 * round(point[axis] / grid) * grid * 1/8. With a fine snapping setting (a large
 * ctrl_shift_size, say) that grid is tiny, so stretch becomes effectively
 * continuous: nothing lands on a round value and the only thing controlling how
 * fine it feels is how much model space a mouse pixel covers, i.e. the zoom.
 *
 * So the drag value is replaced outright with a fixed step:
 *
 *     steps = round(drag_distance / UNITS_PER_STEP)   // one unit of drag, one step
 *     value = steps * step_size * direction
 *
 * step_size is the growth per step measured the centred way - the total change
 * in stretch. One-sided mode then applies half of it (the halving above), so a
 * step moves the cube by the same amount whether it is one-sided or centred.
 * That is the factor of two to keep in mind: a step_size of 1/64 shows up as
 * 1/128 in the stretch field, and grows the cube exactly as a 1/64 centred step
 * would have.
 *
 * Defaults follow the format's base scale: 1/64 for hytale_character, 1/32 for
 * hytale_prop. 0.125 reproduces stock Blockbench exactly.
 *
 * Snapping settings deliberately no longer affect the stretch tool, since that
 * coupling is what made it unpredictable. Shift, Ctrl and Ctrl+Shift take the
 * place of that: they cut the step to a half, a quarter and an eighth for fine
 * tuning. There is no precision floor worth worrying about - the Hytale codec
 * writes stretch as a raw float (only rotations get rounded, to 3 places).
 *
 * Everything is recomputed from a snapshot taken at the start of the drag rather
 * than accumulated per mouse move, so the anchored face cannot drift.
 *
 * Scope: single-axis handles only. The two-axis (plane) handles and the uniform
 * handle stay centred, matching how the Resize tool treats those same handles -
 * they have no single side to anchor to.
 *
 *
 * Part two: resizing a cube that already has stretch
 * --------------------------------------------------
 * Resize changes from/to, which changes half_size, which changes the centre -
 * and the rendered faces are measured from that centre with stretch applied. So
 * on a stretched cube, growing the size by d moves the face you are NOT dragging
 * by
 *
 *     (d / 2) * (1 - stretch)
 *
 * i.e. the anchored side creeps outward whenever stretch is above 1, and inward
 * below it. Blockbench applies the resize to from/to without accounting for the
 * stretch multiplier at all.
 *
 * The fix wraps Cube.prototype.resize: measure where the anchored rendered face
 * is, let core do the resize, then shift from/to to put that face back. This
 * covers every path into resize - the gizmo, the size sliders in the element
 * panel, and keyboard nudges. Bidirectional resizes are skipped, because they
 * are centred by definition and have no anchored face.
 *
 * One consequence, unavoidable: size is in unstretched units, so one grid step
 * of resize moves the dragged face by (step * stretch) on screen. Blockbench's
 * integer_size rounding (on for the Hytale formats) would round away any attempt
 * to compensate for that, and stretch values in practice sit near 1, so the
 * difference is small.
 *
 *
 * Part three: vertex snap, stretch mode
 * -------------------------------------
 * The Vertex Snap tool gets a Stretch mode alongside Move and Resize: pick a
 * corner, pick a target, and the cube stretches to reach it with the opposite
 * corner anchored. Core has a scale mode that would do something similar, but it
 * is hidden in the Hytale formats because scaling breaks integer sizes.
 * Stretching leaves size and UVs alone, so it is safe there.
 *
 * It works by wrapping Vertexsnap.snap and taking over only while the Stretch
 * mode is picked and the format allows stretching, and by adding the mode to
 * BarItems.vertex_snap_mode. A stretch that would put the dragged corner behind
 * the anchored one is clamped to MIN_STRETCH rather than going negative and
 * turning the cube inside out.
 */
const AnchoredStretchModule = (function () {
	const SETTING_ID = 'anchored_stretch_tool';
	const RESIZE_SETTING_ID = 'anchored_stretch_resize';
	const STEP_SETTING_ID = 'anchored_stretch_step';

	// Growth per step, measured the centred way, per format. One-sided mode applies
	// half of this so the cube grows by the same amount either way.
	const AUTO_STEPS = {
		hytale_character: 0.015625, // 1/64
		hytale_prop: 0.03125        // 1/32, double, matching the 32x base scale
	};
	const FALLBACK_STEP = 0.015625;
	const STOCK_STEP = 0.125;

	// Model units of drag per step, matching the resize tool's one unit per step.
	const UNITS_PER_STEP = 1;

	// Vertex snap: the mode key added to BarItems.vertex_snap_mode, and the floor a
	// stretch is clamped to when the target sits behind the anchored face.
	const VERTEX_SNAP_MODE = 'stretch';
	const MIN_STRETCH = 0.0001;

	// Held modifiers cut the step down for fine tuning. Alt is not among them; it
	// switches back to centred stretch.
	const SHIFT_FACTOR = 1 / 2;
	const CTRL_FACTOR = 1 / 4;
	const CTRL_SHIFT_FACTOR = 1 / 8;

	let stretch_setting;
	let resize_setting;
	let step_setting;
	let edit_module;
	let originals = {};
	let wrappers = {};
	let original_resize;
	let resize_wrapper;
	let original_snap;
	let snap_wrapper;
	let mode_option_added = false;

	// uuid -> { from, to, stretch } captured when a stretch drag starts
	let snapshots = new Map();

	function enabled() {
		return !settings[SETTING_ID] || settings[SETTING_ID].value !== false;
	}

	function resizeAnchorEnabled() {
		return !settings[RESIZE_SETTING_ID] || settings[RESIZE_SETTING_ID].value !== false;
	}

	/**
	 * Growth per drag step, measured the centred way. The setting overrides; 0 (or
	 * anything unusable) falls back to the current format's base scale.
	 */
	function stretchStep() {
		let setting = settings[STEP_SETTING_ID];
		let value = setting ? parseFloat(setting.value) : 0;
		if (isFinite(value) && value > 0) return value;
		let format_id = Format && Format.id;
		return AUTO_STEPS[format_id] || FALLBACK_STEP;
	}

	/** Shift halves the step, Ctrl quarters it, both together take an eighth. */
	function stretchModifierFactor(event) {
		let overrides = (typeof Pressing !== 'undefined' && Pressing.overrides) || {};
		let shift = !!((event && event.shiftKey) || overrides.shift);
		let ctrl = !!((event && (event.ctrlOrCmd || event.ctrlKey || event.metaKey)) || overrides.ctrl);

		if (shift && ctrl) return CTRL_SHIFT_FACTOR;
		if (ctrl) return CTRL_FACTOR;
		if (shift) return SHIFT_FACTOR;
		return 1;
	}

	/**
	 * Replaces core's snapped-distance-times-an-eighth with a fixed step per unit of
	 * drag. The axis remap for the two-axis handles is core's, kept so those handles
	 * keep reading the same axis they always did.
	 */
	function stretchOffset(context) {
		let {point, axis, second_axis} = context;
		if (second_axis) {
			if (axis == 'y') { axis = 'z'; }
			else if (second_axis == 'y') { axis = 'y'; }
			else if (second_axis == 'z') { axis = 'x'; }
		}

		let distance;
		if (axis == 'e') {
			let length = typeof point.length === 'function'
				? point.length()
				: Math.sqrt(point.x * point.x + point.y * point.y + point.z * point.z);
			distance = length * Math.sign(point.y || point.x);
		} else {
			distance = point[axis];
		}
		if (!isFinite(distance)) return 0;

		let steps = Math.round(distance / UNITS_PER_STEP);
		let step = stretchStep() * stretchModifierFactor(context.event);
		return steps * step * (context.direction === -1 ? -1 : 1);
	}

	/** Where a rendered face of `element` sits on `axis`. Mirrors adjustFromAndToForInflateAndStretch. */
	function renderedFace(element, axis, high) {
		let half_size = element.size(axis) / 2;
		let centre = element.from[axis] + half_size;
		let reach = (half_size + (element.inflate || 0)) * element.stretch[axis];
		return high ? centre + reach : centre - reach;
	}

	function stretchDrag() {
		return Format && Format.stretch_cubes && Toolbox.selected && Toolbox.selected.id === 'stretch_tool';
	}

	function canStretch(element) {
		return element
			&& element.stretch instanceof Array
			&& element.from instanceof Array
			&& element.to instanceof Array;
	}

	/**
	 * Alt temporarily restores the original centred stretch, mirroring how Alt flips
	 * the Resize tool between one-sided and bidirectional. Skipped when Alt is bound
	 * to the "swap tools" shortcut, same check the Resize tool makes.
	 */
	function altOverride(event) {
		let alt = (event && event.altKey) || (typeof Pressing !== 'undefined' && Pressing.overrides && Pressing.overrides.alt);
		if (!alt) return false;
		if (BarItems.swap_tools && BarItems.swap_tools.keybind && BarItems.swap_tools.keybind.key == 18) return false;
		return true;
	}

	function takeSnapshots() {
		snapshots.clear();
		for (let element of Outliner.selected) {
			if (!canStretch(element)) continue;
			snapshots.set(element.uuid, {
				from: element.from.slice(),
				to: element.to.slice(),
				stretch: element.stretch.slice()
			});
		}
	}

	function anchorOppositeSide(context) {
		// Two-axis and uniform handles have no single side to pull, so leave them
		// centred, exactly like the Resize tool does.
		if (context.second_axis || context.axis === 'e') return;

		let axis = context.axis_number;
		if (typeof axis !== 'number' || axis < 0 || axis > 2) return;

		let direction = context.direction === -1 ? -1 : 1;
		// Alt falls back to core's centred stretch: the full growth, and from/to put
		// back where the drag started.
		let centred = altOverride(context.event);
		let affected = [];
		let applied_growth = 0;

		for (let element of Outliner.selected) {
			let snapshot = snapshots.get(element.uuid);
			if (!snapshot || !canStretch(element)) continue;

			// Half the growth, because all of it lands on one face now instead of
			// being split between two. This puts the dragged face exactly where the
			// stock centred stretch would have put it.
			let raw_growth = element.stretch[axis] - snapshot.stretch[axis];
			let growth = centred ? raw_growth : raw_growth / 2;
			let stretch = snapshot.stretch[axis] + growth;
			applied_growth = growth;

			// Half size is taken from the snapshot, so our own repositioning can
			// never feed back into it.
			let half_size = (snapshot.to[axis] - snapshot.from[axis]) / 2;
			let reach = half_size + (element.inflate || 0);
			let delta = centred ? 0 : direction * reach * growth;

			let from = snapshot.from[axis] + delta;
			let to = snapshot.to[axis] + delta;

			if (element.from[axis] !== from || element.to[axis] !== to || element.stretch[axis] !== stretch) {
				element.from[axis] = from;
				element.to[axis] = to;
				element.stretch[axis] = stretch;
				affected.push(element);
			}
		}

		if (!affected.length) return;

		// Core's cursor tooltip shows the un-halved value
		if (!centred && typeof Blockbench !== 'undefined' && Blockbench.setCursorTooltip && typeof trimFloatNumber === 'function') {
			Blockbench.setCursorTooltip(trimFloatNumber(applied_growth));
		}

		for (let element of affected) {
			if (element.visibility !== false && element.preview_controller && element.preview_controller.updateGeometry) {
				element.preview_controller.updateGeometry(element);
			}
		}
		if (typeof updateNslideValues === 'function') updateNslideValues();
	}

	/**
	 * Vertex snap, stretch mode.
	 *
	 * Core's vertex snap has a scale mode, but it is gated behind
	 * `condition: () => !Format.integer_size`, so it is hidden and inert in the
	 * Hytale formats. Scaling would also change the cube's size, which is what the
	 * integer size rule exists to prevent. Stretching reaches the same place while
	 * leaving size — and therefore the UV map — alone.
	 *
	 * Per axis, to move the picked corner by d while the opposite face stays put:
	 *
	 *     stretch += sign * d / (2 * reach)      // reach = half_size + inflate
	 *     from/to += sign * reach * change_in_stretch     // = d/2 when unclamped
	 *
	 * sign is +1 when the picked corner is on the axis's high side. The from/to
	 * shift is written in terms of the stretch actually applied rather than d/2
	 * directly, so the anchor still holds when the stretch is clamped.
	 */
	function applyVertexStretch(element, offset, mesh_space_vertex, ignore) {
		let changed = false;
		let clamped = false;

		for (let axis = 0; axis < 3; axis++) {
			if (ignore && ignore[axis]) continue;
			let d = offset[axis];
			if (!d || !isFinite(d)) continue;

			let half_size = element.size(axis) / 2;
			let reach = half_size + (element.inflate || 0);
			if (Math.abs(reach) < 1e-9) continue; // flat on this axis, nothing to scale

			let centre = element.from[axis] + half_size;
			// mesh space is model space minus the origin, so put the vertex back into
			// model space before deciding which side of the cube it sits on
			let high = (mesh_space_vertex[axis] + element.origin[axis]) >= centre;
			let sign = high ? 1 : -1;

			let before = element.stretch[axis];
			let after = before + sign * d / (2 * reach);
			if (after < MIN_STRETCH) {
				after = MIN_STRETCH;
				clamped = true;
			}
			if (after === before) continue;

			let shift = sign * reach * (after - before);
			element.from[axis] += shift;
			element.to[axis] += shift;
			element.stretch[axis] = after;
			changed = true;
		}

		return {changed, clamped};
	}

	/** Stands in for Vertexsnap.snap while the stretch mode is picked. */
	function vertexStretchSnap(data, options, amended) {
		let elements = Vertexsnap.elements.slice();
		if (Vertexsnap.groups && Vertexsnap.groups.length) {
			for (let group of Vertexsnap.groups) {
				group.forEachChild(child => elements.safePush(child), OutlinerElement);
			}
		}
		Undo.initEdit({elements, groups: Vertexsnap.groups}, amended);

		let ignore_axis = options && options.ignore_axis;
		let ignore = [!!(ignore_axis && ignore_axis.x), !!(ignore_axis && ignore_axis.y), !!(ignore_axis && ignore_axis.z)];

		let target = Vertexsnap.getGlobalVertexPos(data.element, data.vertex);
		let global_delta = new THREE.Vector3().copy(target).sub(Vertexsnap.vertex_pos);
		let clamped = false;

		for (let element of elements) {
			if (!canStretch(element) || typeof element.size !== 'function' || !element.mesh) continue;

			let rotation = element.mesh.getWorldQuaternion(new THREE.Quaternion()).invert();
			let offset = new THREE.Vector3().copy(global_delta).applyQuaternion(rotation).toArray();
			let vertex = element.mesh.worldToLocal(new THREE.Vector3().copy(Vertexsnap.vertex_pos)).toArray();

			let result = applyVertexStretch(element, offset, vertex, ignore);
			clamped = clamped || result.clamped;
		}

		Vertexsnap.clearVertexGizmos();
		let update_options = {
			elements,
			element_aspects: {transform: true, geometry: true},
			selection: true
		};
		if (Vertexsnap.groups && Vertexsnap.groups.length) {
			update_options.groups = Vertexsnap.groups;
			update_options.group_aspects = {transform: true};
		}
		Canvas.updateView(update_options);
		Undo.finishEdit('Vertex snap stretch');
		Vertexsnap.step1 = true;

		if (clamped && typeof Blockbench !== 'undefined' && Blockbench.showQuickMessage) {
			Blockbench.showQuickMessage('Target sits behind the anchored side', 2500);
		}

		if (!amended) {
			Undo.amendEdit({
				ignore_axis: {
					type: 'inline_multi_select',
					label: tl('edit.vertex_snap.ignore_axis', ''),
					options: {x: 'X', y: 'Y', z: 'Z'},
					value: {x: false, y: false, z: false}
				}
			}, form => {
				Vertexsnap.snap(data, form, true);
			});
		}
	}

	function patchVertexSnap() {
		if (typeof Vertexsnap === 'undefined' || typeof Vertexsnap.snap !== 'function') {
			console.error('[embodytools/stretch] Could not find Vertexsnap.snap; the vertex snap stretch mode is inactive.');
			return;
		}

		original_snap = Vertexsnap.snap;
		snap_wrapper = function (data, options = 0, amended) {
			let mode = BarItems.vertex_snap_mode && BarItems.vertex_snap_mode.get();
			let mine = mode === VERTEX_SNAP_MODE
				&& Format && Format.stretch_cubes
				&& !Vertexsnap.move_origin;

			if (!mine) return original_snap.call(this, data, options, amended);
			return vertexStretchSnap(data, options, amended);
		};
		Vertexsnap.snap = snap_wrapper;

		// Add the mode to the existing dropdown. `open()` reads `options` live and
		// `trigger()` (wheel / keybind cycling) reads `values`, so both need the key.
		let select = BarItems.vertex_snap_mode;
		if (select && select.options && !select.options[VERTEX_SNAP_MODE]) {
			select.options[VERTEX_SNAP_MODE] = {
				name: 'Stretch',
				condition: () => Format && Format.stretch_cubes
			};
			if (select.values && !select.values.includes(VERTEX_SNAP_MODE)) {
				select.values.push(VERTEX_SNAP_MODE);
			}
			mode_option_added = true;
		}
	}

	function unpatchVertexSnap() {
		if (original_snap && typeof Vertexsnap !== 'undefined' && Vertexsnap.snap === snap_wrapper) {
			Vertexsnap.snap = original_snap;
		}
		original_snap = null;
		snap_wrapper = null;

		let select = typeof BarItems !== 'undefined' && BarItems.vertex_snap_mode;
		if (mode_option_added && select) {
			if (select.value === VERTEX_SNAP_MODE && select.set) select.set('move');
			if (select.options) delete select.options[VERTEX_SNAP_MODE];
			if (select.values) select.values.remove(VERTEX_SNAP_MODE);
		}
		mode_option_added = false;
	}

	function patchResize() {
		if (typeof Cube === 'undefined' || typeof Cube.prototype.resize !== 'function') {
			console.error('[embodytools/stretch] Could not find Cube.prototype.resize; the resize anchor fix is inactive.');
			return;
		}
		original_resize = Cube.prototype.resize;

		resize_wrapper = function (val, axis, negative, allow_negative, bidirectional) {
			let skip = bidirectional
				|| !resizeAnchorEnabled()
				|| !Format || !Format.stretch_cubes
				|| !this.stretch
				|| typeof this.stretch[axis] !== 'number'
				|| this.stretch[axis] === 1;

			if (skip) {
				return original_resize.call(this, val, axis, negative, allow_negative, bidirectional);
			}

			// Work out which face core is going to hold still, including the flip it
			// applies to cubes with a negative size.
			let before = (this.temp_data && this.temp_data.old_size != undefined) ? this.temp_data.old_size : this.size(axis);
			if (before instanceof Array) before = before[axis];
			let keep_high = !!negative;
			if (before < 0 && allow_negative == null) keep_high = !keep_high;

			let anchored = renderedFace(this, axis, keep_high);

			let result = original_resize.call(this, val, axis, negative, allow_negative, bidirectional);

			let drift = anchored - renderedFace(this, axis, keep_high);
			if (drift) {
				this.from[axis] += drift;
				this.to[axis] += drift;
				if (this.visibility !== false && this.preview_controller && this.preview_controller.updateGeometry) {
					this.preview_controller.updateGeometry(this);
				}
			}
			return result;
		};

		Cube.prototype.resize = resize_wrapper;
	}

	function patch() {
		patchResize();
		patchVertexSnap();
		edit_module = typeof TransformerModule !== 'undefined' && TransformerModule.modules && TransformerModule.modules.edit;
		if (!edit_module) {
			console.error('[embodytools/stretch] Could not find the edit transform module. This plugin needs Blockbench 5.0.5 or newer.');
			return;
		}

		originals.calculateOffset = edit_module.calculateOffset;
		originals.onStart = edit_module.onStart;
		originals.onMove = edit_module.onMove;
		originals.onEnd = edit_module.onEnd;
		originals.onCancel = edit_module.onCancel;

		wrappers.calculateOffset = function (context) {
			if (enabled() && stretchDrag() && context && context.point) {
				return stretchOffset(context);
			}
			return originals.calculateOffset.call(this, context);
		};

		wrappers.onStart = function (context) {
			let result = originals.onStart.call(this, context);
			if (enabled() && stretchDrag()) takeSnapshots();
			return result;
		};

		wrappers.onMove = function (context) {
			let result = originals.onMove.call(this, context);
			if (enabled() && stretchDrag() && snapshots.size) anchorOppositeSide(context);
			return result;
		};

		wrappers.onEnd = function (context) {
			snapshots.clear();
			return originals.onEnd.call(this, context);
		};

		wrappers.onCancel = function (context) {
			snapshots.clear();
			return originals.onCancel.call(this, context);
		};

		for (let key in wrappers) {
			edit_module[key] = wrappers[key];
		}
	}

	function unpatch() {
		snapshots.clear();
		unpatchVertexSnap();

		// Only restore if nothing else has wrapped us in the meantime.
		if (original_resize && typeof Cube !== 'undefined' && Cube.prototype.resize === resize_wrapper) {
			Cube.prototype.resize = original_resize;
		}
		original_resize = null;
		resize_wrapper = null;

		if (!edit_module) return;
		for (let key in wrappers) {
			if (edit_module[key] === wrappers[key]) {
				edit_module[key] = originals[key];
			}
		}
		edit_module = null;
		originals = {};
		wrappers = {};
	}

	// -----------------------------------------------------------------------
	// module interface
	// -----------------------------------------------------------------------

	return {
		id: 'anchored_stretch',
		title: 'Anchored Stretch',
		settings: [SETTING_ID, STEP_SETTING_ID, RESIZE_SETTING_ID],

		blocked() {
			// Three separate hooks, and patch() already gives up on each one on its own
			// with a line in the console. So this only stands in the way when there is
			// nothing at all to hook, which on 5.0.5 and up should never happen.
			const has_edit = !!(typeof TransformerModule !== 'undefined'
				&& TransformerModule.modules
				&& TransformerModule.modules.edit);
			const has_resize = typeof Cube !== 'undefined' && typeof Cube.prototype.resize === 'function';
			const has_snap = typeof Vertexsnap !== 'undefined' && typeof Vertexsnap.snap === 'function';
			if (!has_edit && !has_resize && !has_snap) {
				return 'nothing to hook here: no transform edit module, no Cube.resize, no Vertexsnap';
			}
			return null;
		},

		load() {
			stretch_setting = new Setting(SETTING_ID, {
				name: 'Anchored Stretch Tool',
				description: 'Stretch cubes only on the side you drag, keeping the opposite face in place. Hold Alt while dragging to stretch from the centre instead.',
				category: 'edit',
				value: true,
				plugin: PLUGIN_ID
			});
			step_setting = new Setting(STEP_SETTING_ID, {
				name: 'Stretch per Drag Step',
				description: 'Stretch added per unit of dragging, as total growth. One-sided stretch applies half of this, so a step grows the cube by the same amount either way. 0 picks the format\'s base scale: 0.015625 for Hytale characters, 0.03125 for props. 0.125 is stock Blockbench. Hold Shift, Ctrl or both while dragging for a half, a quarter or an eighth of the step; the snapping settings are not used.',
				category: 'edit',
				type: 'number',
				value: 0,
				min: 0,
				max: 1,
				step: 0.0078125,
				plugin: PLUGIN_ID
			});
			resize_setting = new Setting(RESIZE_SETTING_ID, {
				name: 'Keep Stretched Cubes Anchored When Resizing',
				description: 'When resizing a cube that has stretch applied, keep the face you are not dragging at the same coordinates instead of letting it creep outward.',
				category: 'edit',
				value: true,
				plugin: PLUGIN_ID
			});
			patch();
		},

		unload() {
			// Unhooking first, but never at the cost of the settings cleanup below.
			try {
				unpatch();
			} catch (error) {
				console.error('[embodytools/stretch] could not unhook cleanly', error);
			}
			for (let setting of [stretch_setting, resize_setting, step_setting]) {
				if (setting) setting.delete();
			}
			stretch_setting = resize_setting = step_setting = null;
		},
	};

})();
// ===========================================================================
// ===== 3/3  UNLEAKY LAYERS =================================================
// ===========================================================================
/*
 * Written by quinten.bench.
 *
 * Blockbench's built-in "Lock Alpha Channel" only looks at the alpha of the layer
 * you are currently painting on. On a fresh (empty) layer above your artwork that
 * means everything is locked and the brush does nothing.
 *
 * This makes Lock Alpha consider the *combined* alpha of every layer in the
 * texture: a pixel is only locked when it is fully transparent on all of them.
 * Anywhere the texture is visible you can paint, even on an empty layer, and the
 * result is clipped to the combined silhouette.
 *
 * Implementation notes
 * --------------------
 * Every paint tool ends up in Painter.edit(texture, callback, options), which resolves
 * the active layer canvas and hands its context to the tool. We wrap that function:
 *
 *   1. Build a "combined alpha" mask for the texture once per stroke, by compositing
 *      all layers the same way Texture#updateLayerChanges does.
 *   2. Turn Painter.lock_alpha off for the duration of the callback, so every tool
 *      paints unrestricted (this covers the per-pixel JS paths *and* the paths that
 *      rely on the 'source-atop' composite operation).
 *   3. Reconcile the result against the mask before it is committed: locked pixels are
 *      restored, and unlocked pixels keep their new colour with the alpha clamped to the
 *      combined alpha.
 *
 * Erasing follows from the same idea. Vanilla freezes alpha outright, which makes the
 * eraser useless on an upper layer even though the artwork underneath still holds the
 * silhouette. Here a second mask tracks the alpha of every layer *except* the active one,
 * and lowering alpha is blocked only where that backdrop is empty - i.e. only where this
 * layer is the sole thing holding the pixel up, which is the case vanilla actually cares
 * about. Erasing on a layer above your artwork just reveals what is beneath it.
 *
 * Step 3 runs on the small region passed to putImageData for brush-like tools, and on
 * the whole layer for the tools that redraw wholesale (fill / shape / gradient).
 */
const UnLeakyLayersModule = (function () {
	const LOG = '[embodytools/unleaky]';

	const MUTATORS = ['fill', 'fillRect', 'stroke', 'strokeRect', 'clearRect', 'drawImage'];

	let originals = {};
	let added_settings = [];
	let original_lock_alpha_description = null;

	// Per-stroke caches
	let stroke_active = false;
	let stroke_masks = new Map();   // texture uuid -> {width, height, alpha: Uint8Array}
	let baseline_cache = null;      // {canvas, data: ImageData} for shape / gradient tools
	let intercepting = new Set();   // re-entrancy guard, keyed by canvas context

	// ---------------------------------------------------------------- settings

	function pref(id, fallback) {
		let setting = typeof settings != 'undefined' && settings[id];
		return setting ? setting.value : fallback;
	}

	// ---------------------------------------------------------------- mask

	/**
	 * Alpha union of the given layers, in texture pixel space.
	 * Mirrors Texture#updateLayerChanges, except that colour blend modes are ignored -
	 * for a silhouette only the alpha union matters.
	 */
	function renderLayerAlpha(texture, skip_layer) {
		let width = texture.width;
		let height = texture.height;

		let canvas = document.createElement('canvas');
		canvas.width = width;
		canvas.height = height;
		let ctx = canvas.getContext('2d', {willReadFrequently: true});
		ctx.imageSmoothingEnabled = false;

		let include_hidden = pref('lla_include_hidden', false);

		for (let layer of texture.layers) {
			if (layer === skip_layer) continue;
			if (!include_hidden && (layer.visible === false || layer.opacity === 0)) continue;
			// Alpha masks subtract coverage rather than adding it, so they never widen
			// the paintable area. Leaving them out keeps the mask conservative.
			if (layer.blend_mode === 'alpha_mask') continue;

			let opacity = include_hidden ? 100 : layer.opacity;
			if (typeof opacity != 'number') opacity = 100;
			opacity = Math.min(100, Math.max(0, opacity));

			ctx.filter = opacity === 100 ? 'none' : `opacity(${opacity / 100})`;
			ctx.drawImage(layer.canvas, layer.offset[0], layer.offset[1], layer.scaled_width, layer.scaled_height);
		}
		ctx.filter = 'none';

		let data = ctx.getImageData(0, 0, width, height).data;
		let alpha = new Uint8Array(width * height);
		for (let p = 0, i = 3; p < alpha.length; p++, i += 4) {
			alpha[p] = data[i];
		}
		return alpha;
	}

	/**
	 * `alpha`    - combined alpha of every layer. Decides where painting is allowed.
	 * `backdrop` - combined alpha of every layer *except* the one being painted on.
	 *              Where this is above zero the silhouette survives without the active
	 *              layer, so erasing there cannot open a hole in it.
	 */
	function buildMask(texture, active_layer) {
		let width = texture.width;
		let height = texture.height;
		if (!width || !height) return null;
		return {
			width,
			height,
			alpha: renderLayerAlpha(texture, null),
			backdrop: renderLayerAlpha(texture, active_layer)
		};
	}

	function getMask(texture, active_layer) {
		if (!stroke_active) return buildMask(texture, active_layer);
		let key = texture.uuid + '/' + active_layer.uuid;
		let mask = stroke_masks.get(key);
		if (!mask) {
			mask = buildMask(texture, active_layer);
			if (mask) stroke_masks.set(key, mask);
		}
		return mask;
	}

	/**
	 * The shape and gradient tools rebuild the layer from Painter.current.clear on every
	 * pointer move, so the correct "before" state for them is the start of the stroke -
	 * not whatever the previous frame left behind.
	 */
	function getStrokeBaseline(layer) {
		let clear = Painter.current && Painter.current.clear;
		if (!clear || !clear.width) return null;
		if (clear.width !== layer.canvas.width || clear.height !== layer.canvas.height) return null;
		if (baseline_cache && baseline_cache.canvas === clear) return baseline_cache.data;

		let ctx = clear.getContext('2d');
		if (!ctx) return null;
		let data = ctx.getImageData(0, 0, clear.width, clear.height);
		baseline_cache = {canvas: clear, data};
		return data;
	}

	// ---------------------------------------------------------------- reconcile

	/**
	 * Vanilla Lock Alpha freezes alpha completely, which makes the eraser a no-op even when
	 * the pixel is held up by a layer underneath. "Set Opacity" is the one blend mode vanilla
	 * lets lower alpha regardless, so it keeps a blanket exemption here.
	 *
	 * Everything else is decided per pixel against the backdrop mask - see reconcile().
	 */
	function alphaDecreaseAlwaysAllowed() {
		if (Painter.erase_mode) return false;
		if (Toolbox.selected && Toolbox.selected.id === 'eraser') return false;
		return !!(BarItems.blend_mode && BarItems.blend_mode.value === 'set_opacity');
	}

	/**
	 * @param after  Uint8ClampedArray the tool just produced (modified in place)
	 * @param before Uint8ClampedArray the same region before the tool ran
	 * @param dx,dy  top-left of the region in layer canvas pixels
	 */
	function reconcile(after, before, dx, dy, width, height, layer, mask, always_allow_decrease) {
		let clamp_to_composite = pref('lla_clamp', true);
		let erase_over_backdrop = pref('lla_allow_erase', true);
		let off_x = layer.offset[0];
		let off_y = layer.offset[1];
		let scale_x = (layer.scale && layer.scale[0]) || 1;
		let scale_y = (layer.scale && layer.scale[1]) || 1;
		let mask_width = mask.width;
		let mask_height = mask.height;
		let mask_alpha = mask.alpha;
		let mask_backdrop = mask.backdrop;

		for (let row = 0; row < height; row++) {
			let ty = Math.floor(off_y + (dy + row) * scale_y);
			let row_inside = ty >= 0 && ty < mask_height;
			let mask_row = ty * mask_width;

			for (let col = 0; col < width; col++) {
				let i = (row * width + col) * 4;
				let before_alpha = before[i + 3];

				let combined = 0;
				let backdrop = 0;
				if (row_inside) {
					let tx = Math.floor(off_x + (dx + col) * scale_x);
					if (tx >= 0 && tx < mask_width) {
						combined = mask_alpha[mask_row + tx];
						backdrop = mask_backdrop[mask_row + tx];
					}
				}

				// Locked: transparent on this layer and on every other one.
				if (combined === 0 && before_alpha === 0) {
					after[i]     = before[i];
					after[i + 1] = before[i + 1];
					after[i + 2] = before[i + 2];
					after[i + 3] = before_alpha;
					continue;
				}

				let alpha = after[i + 3];

				if (alpha < before_alpha) {
					// Lowering alpha only threatens the silhouette where this layer is the
					// only thing holding the pixel up. Anywhere another layer still covers
					// it, erasing just reveals what is underneath.
					let allowed = always_allow_decrease || (erase_over_backdrop && backdrop > 0);
					if (!allowed) {
						// Restore the colour too, or the tool's zeroed RGB would show
						// through once the alpha is put back.
						after[i]     = before[i];
						after[i + 1] = before[i + 1];
						after[i + 2] = before[i + 2];
						after[i + 3] = before_alpha;
					}
					continue;
				}

				if (clamp_to_composite) {
					let limit = before_alpha > combined ? before_alpha : combined;
					if (alpha > limit) after[i + 3] = limit;
				}
			}
		}
	}

	// ---------------------------------------------------------------- interception

	function runIntercepted(layer, mask, run) {
		let ctx = layer.ctx;
		if (intercepting.has(ctx)) return run();
		intercepting.add(ctx);

		let proto = CanvasRenderingContext2D.prototype;
		let native_get = proto.getImageData;
		let native_put = proto.putImageData;

		let baseline = getStrokeBaseline(layer);
		let allow_decrease = alphaDecreaseAlwaysAllowed();
		let full_before = baseline || null;
		let needs_full = !!baseline;
		let hooked = [];

		function snapshotFull() {
			needs_full = true;
			if (full_before) return;
			try {
				full_before = native_get.call(ctx, 0, 0, layer.canvas.width, layer.canvas.height);
			} catch (error) {
				console.error(LOG, 'could not snapshot layer', error);
			}
		}

		// Brush-like tools mutate through putImageData on a small region - reconcile there
		// instead of scanning the whole layer on every dab. Tools that redraw from a
		// stroke baseline are handled by the single full pass below.
		if (!baseline) {
			ctx.putImageData = function (imagedata, dx, dy) {
				try {
					let region_before = native_get.call(ctx, dx, dy, imagedata.width, imagedata.height).data;
					reconcile(imagedata.data, region_before, dx, dy, imagedata.width, imagedata.height, layer, mask, allow_decrease);
				} catch (error) {
					console.error(LOG, 'region reconcile failed', error);
				}
				return native_put.apply(this, arguments);
			};
			hooked.push('putImageData');
		}

		for (let name of MUTATORS) {
			let native = proto[name];
			ctx[name] = function () {
				snapshotFull();
				return native.apply(this, arguments);
			};
			hooked.push(name);
		}

		try {
			run();
		} finally {
			for (let name of hooked) delete ctx[name];
			intercepting.delete(ctx);
		}

		if (needs_full && full_before) {
			try {
				let width = layer.canvas.width;
				let height = layer.canvas.height;
				if (full_before.width === width && full_before.height === height) {
					let after = native_get.call(ctx, 0, 0, width, height);
					reconcile(after.data, full_before.data, 0, 0, width, height, layer, mask, allow_decrease);
					native_put.call(ctx, after, 0, 0);
				}
			} catch (error) {
				console.error(LOG, 'full reconcile failed', error);
			}
		}
	}

	function shouldHandle(texture) {
		if (!Painter.lock_alpha) return false;
		if (!pref('lla_enabled', true)) return false;
		if (!texture || !texture.layers_enabled) return false;
		if (!texture.layers || texture.layers.length < 2) return false;
		return true;
	}

	// -----------------------------------------------------------------------
	// module interface
	// -----------------------------------------------------------------------

	return {
		id: 'unleakylayers',
		title: 'UnLeaky Layers',
		settings: ['lla_enabled', 'lla_clamp', 'lla_allow_erase', 'lla_include_hidden'],

		blocked() {
			// Everything hangs off Painter.edit and the canvas 2d prototype.
			if (typeof Painter === 'undefined' || typeof Painter.edit !== 'function') {
				return 'no Painter.edit to hook';
			}
			if (typeof Painter.startPaintTool !== 'function' || typeof Painter.stopPaintTool !== 'function') {
				return 'Painter has no paint tool start/stop hooks';
			}
			if (typeof CanvasRenderingContext2D === 'undefined') return 'no canvas 2d context here';
			return null;
		},

		load() {
			added_settings.push(new Setting('lla_enabled', {
				category: 'paint',
				value: true,
				plugin: PLUGIN_ID,
				name: 'UnLeaky Layers',
				description: 'Lock Alpha Channel locks a pixel only when it is fully transparent on every layer, instead of only on the layer being painted.'
			}));
			added_settings.push(new Setting('lla_clamp', {
				category: 'paint',
				value: true,
				plugin: PLUGIN_ID,
				name: 'Clip painting to combined opacity',
				description: 'Limit painted pixels to the combined opacity of all layers, so strokes fade out along semi-transparent edges instead of ending in a hard edge. Turn off to paint at full opacity anywhere the texture is not completely transparent.'
			}));
			added_settings.push(new Setting('lla_allow_erase', {
				category: 'paint',
				value: true,
				plugin: PLUGIN_ID,
				name: 'Allow erasing over other layers',
				description: 'With Lock Alpha on, let the eraser work wherever another layer still covers the pixel, so erasing reveals what is underneath instead of punching a hole in the combined silhouette. Turn off to freeze alpha completely, like vanilla Lock Alpha.'
			}));
			added_settings.push(new Setting('lla_include_hidden', {
				category: 'paint',
				value: false,
				plugin: PLUGIN_ID,
				name: 'Count hidden layers',
				description: 'Also treat hidden layers and layers at 0% opacity as paintable area when deciding what Lock Alpha locks.'
			}));

			originals.edit = Painter.edit;
			Painter.edit = function (texture, callback, options) {
				if (!shouldHandle(texture)) {
					return originals.edit.call(this, texture, callback, options);
				}
				let layer = texture.getActiveLayer && texture.getActiveLayer();
				if (!layer || !layer.ctx) {
					return originals.edit.call(this, texture, callback, options);
				}
				let mask = getMask(texture, layer);
				if (!mask) {
					return originals.edit.call(this, texture, callback, options);
				}
				let wrapped = function (canvas, current) {
					let previous_lock = Painter.lock_alpha;
					Painter.lock_alpha = false;
					try {
						runIntercepted(layer, mask, () => callback(canvas, current));
					} finally {
						Painter.lock_alpha = previous_lock;
					}
				};
				return originals.edit.call(this, texture, wrapped, options);
			};

			originals.startPaintTool = Painter.startPaintTool;
			Painter.startPaintTool = function () {
				stroke_masks.clear();
				baseline_cache = null;
				stroke_active = true;
				return originals.startPaintTool.apply(this, arguments);
			};

			originals.stopPaintTool = Painter.stopPaintTool;
			Painter.stopPaintTool = function () {
				try {
					return originals.stopPaintTool.apply(this, arguments);
				} finally {
					stroke_active = false;
					stroke_masks.clear();
					baseline_cache = null;
				}
			};

			try {
				let toggle = BarItems.lock_alpha;
				if (toggle) {
					original_lock_alpha_description = toggle.description;
					toggle.description = 'Only paint on pixels that are not transparent. Layer-aware: a pixel counts as paintable when any layer is visible there.';
				}
			} catch (error) {
				console.error(LOG, 'could not update the Lock Alpha tooltip', error);
			}
		},

		unload() {
			// One hook at a time, each in its own try: a hook that refuses to be given
			// back must not stop the other hooks or the settings from being cleaned up.
			// A half-unloaded module is worse than one that never loaded.
			for (const name of ['edit', 'startPaintTool', 'stopPaintTool']) {
				if (!originals[name]) continue;
				try {
					Painter[name] = originals[name];
				} catch (error) {
					console.error(LOG, 'could not put Painter.' + name + ' back', error);
				}
			}
			originals = {};

			added_settings.forEach(setting => {
				try { setting.delete(); } catch (error) { console.error(LOG, error); }
			});
			added_settings = [];

			try {
				if (BarItems.lock_alpha && original_lock_alpha_description !== null) {
					BarItems.lock_alpha.description = original_lock_alpha_description;
				}
			} catch (error) { /* nothing to restore */ }
			original_lock_alpha_description = null;

			stroke_masks.clear();
			baseline_cache = null;
			intercepting.clear();
			stroke_active = false;
		},
	};

})();
// ===========================================================================
// ===== REGISTRATION ========================================================
// ===========================================================================
/*
 * One register call for the whole file. Everything below is about getting the three
 * modules up and down independently: a module that cannot run here, or that throws on
 * the way up, is skipped with a line in the console and does not take the others with
 * it.
 */

const MODULES = [DeltaLayersModule, AnchoredStretchModule, UnLeakyLayersModule];

// The plugins each module used to be, for the "you still have the old one installed"
// warning below. Anchored Stretch has two: it was called One-Sided Stretch before, and
// that older one patches the same stretch tool under different setting ids.
const REPLACES = {
	delta_layers: [
		{ id: 'delta_layers', name: 'Delta Layers' },
		{ id: 'embodygames_texture_layer_bridge', name: 'Embody Games Texture Layers' },
	],
	anchored_stretch: [
		{ id: 'anchored_stretch', name: 'Anchored Stretch' },
		{ id: 'one_sided_stretch', name: 'One-Sided Stretch' },
	],
	unleakylayers: [
		{ id: 'unleakylayers', name: 'UnLeaky Layers' },
		{ id: 'layered_lock_alpha', name: 'Layered Lock Alpha' },
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
		// can only be the plugin those ids came from.
		if (!found.length && typeof settings !== 'undefined'
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
		'Three tools that used to be three plugins. Each one can be turned off on its own, and each keeps its settings where you would look for it.',
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
