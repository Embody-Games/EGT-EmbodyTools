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
				plugin: PLUGIN_ID,
				value: true,
				name: 'Layer-Aware Alpha Lock',
				description: 'Lock Alpha Channel locks a pixel only when it is fully transparent on every layer, instead of only on the layer being painted.'
			}));
			added_settings.push(new Setting('lla_clamp', {
				category: 'paint',
				plugin: PLUGIN_ID,
				value: true,
				name: 'Clip painting to combined opacity',
				description: 'Limit painted pixels to the combined opacity of all layers, so strokes fade out along semi-transparent edges instead of ending in a hard edge. Turn off to paint at full opacity anywhere the texture is not completely transparent.'
			}));
			added_settings.push(new Setting('lla_allow_erase', {
				category: 'paint',
				plugin: PLUGIN_ID,
				value: true,
				name: 'Allow erasing over other layers',
				description: 'With Lock Alpha on, let the eraser work wherever another layer still covers the pixel, so erasing reveals what is underneath instead of punching a hole in the combined silhouette. Turn off to freeze alpha completely, like vanilla Lock Alpha.'
			}));
			added_settings.push(new Setting('lla_include_hidden', {
				category: 'paint',
				plugin: PLUGIN_ID,
				value: false,
				name: 'Count hidden layers',
				description: 'Also treat hidden layers and layers at 0% opacity as paintable area when deciding what Lock Alpha locks.'
			}));

			// A button beside Lock Alpha, so the mode can be flipped while painting instead of
			// through the settings dialog. linked_setting keeps the two in step both ways: a click
			// writes lla_enabled and saves it, and Blockbench's settings dialog writes back to any
			// Toggle pointing at the setting it just changed. Name and description have to be given
			// explicitly - a linked Toggle otherwise looks them up as translation keys, which a
			// plugin's own setting does not have.
			try {
				let ToggleClass = typeof Toggle != 'undefined' ? Toggle : (typeof Blockbench != 'undefined' && Blockbench.Toggle);
				if (ToggleClass) {
					toolbar_toggle = new ToggleClass('lla_toggle', {
						name: 'Layer-Aware Alpha Lock',
						description: 'Lock Alpha Channel counts a pixel as paintable when any layer is visible there, not just the layer being painted on. Off leaves Lock Alpha behaving like vanilla Blockbench.',
						icon: 'layers',
						category: 'paint',
						condition: () => Modes.paint,
						linked_setting: 'lla_enabled'
					});
					placeToggleInToolbar(toolbar_toggle);
				}
			} catch (error) {
				console.error(LOG, 'could not add the toolbar button', error);
			}

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
				stroke_uses_clear = !!(typeof Toolbox !== 'undefined' && Toolbox.selected
					&& CLEAR_TOOLS.includes(Toolbox.selected.id));
				return originals.startPaintTool.apply(this, arguments);
			};

			originals.stopPaintTool = Painter.stopPaintTool;
			Painter.stopPaintTool = function () {
				try {
					return originals.stopPaintTool.apply(this, arguments);
				} finally {
					stroke_active = false;
					stroke_uses_clear = false;
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
			if (toolbar_toggle) {
				// Takes it out of the toolbar and the keybind list as well.
				try { toolbar_toggle.delete(); } catch (error) { console.error(LOG, error); }
				toolbar_toggle = null;
			}

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
			stroke_uses_clear = false;
		},
	};

})();
