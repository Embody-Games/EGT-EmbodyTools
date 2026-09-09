	// -----------------------------------------------------------------------
	// module interface
	// -----------------------------------------------------------------------

	return {
		id: 'gradient_map_layer',
		title: 'Gradient Map Layer',
		// The only one of the four with no Blockbench settings: everything it remembers
		// is in localStorage under gradient_map_layer.*, which the bundle does not touch
		// on unload. That is deliberate, so a standalone copy keeps your gradients.
		settings: [],

		blocked() {
			// Two menu Actions, a stylesheet and five Blockbench event hooks. The dialog
			// needs Vue, but it is only built on click, so a build without it is a broken
			// dialog rather than a module that cannot load - not something to sit out for.
			if (typeof Blockbench === 'undefined' || typeof Blockbench.addCSS !== 'function') {
				return 'no Blockbench.addCSS for the dialog styles';
			}
			if (typeof Blockbench.on !== 'function' || typeof Blockbench.removeListener !== 'function') {
				return 'no Blockbench event hooks to follow edits with';
			}
			if (typeof Action === 'undefined') return 'no Action class to hang the menu entries on';
			return null;
		},

		load() {
			css_style = Blockbench.addCSS(CSS);

			action_apply = new Action('gradient_map_layer', {
				name: 'Gradient Map Layer...',
				description: 'Apply a saved gradient map over a value map as a new layer',
				icon: 'gradient',
				category: 'textures',
				condition: () => allTextures().length > 0,
				click() { openDialogWindow(); }
			});

			action_repeat = new Action('gradient_map_layer_repeat', {
				name: 'Repeat Gradient Map',
				description: 'Apply the last used gradient map again with the same settings',
				icon: 'repeat',
				category: 'textures',
				condition: () => allTextures().length > 0 && !!last_run,
				click() { repeatLast(); }
			});

			// Keep generated layers following their source layer.
			try { Blockbench.on('finish_edit', onFinishEdit); } catch (err) { /* ignore */ }
			try { Blockbench.on('init_edit', onInitEdit); } catch (err) { /* ignore */ }
			try { Blockbench.on('edit_texture', onEditTexture); } catch (err) { /* ignore */ }
			try { Blockbench.on('undo', onUndo); } catch (err) { /* ignore */ }
			try { Blockbench.on('redo', onRedo); } catch (err) { /* ignore */ }

			try { MenuBar.addAction(action_apply, 'tools'); } catch (err) { /* ignore */ }
			try { MenuBar.addAction(action_repeat, 'tools'); } catch (err) { /* ignore */ }
			try {
				if (typeof MenuBar !== 'undefined' && MenuBar.menus && MenuBar.menus.filter) {
					MenuBar.addAction(action_apply, 'filter');
				}
			} catch (err) { /* ignore */ }
			try { Texture.prototype.menu.addAction(action_apply); } catch (err) { /* ignore */ }
			try {
				if (typeof TextureLayer !== 'undefined' && TextureLayer.prototype.menu) {
					TextureLayer.prototype.menu.addAction(action_apply);
				}
			} catch (err) { /* ignore */ }
		},

		unload() {
			// Wrapped, so a hook that will not come off does not stop the rest: the two
			// Actions, the stylesheet and the menu entries all have to go either way.
			try {
				dialog_active = false;
				endLivePreview();
				try { Blockbench.removeListener('finish_edit', onFinishEdit); } catch (err) { /* ignore */ }
				try { Blockbench.removeListener('init_edit', onInitEdit); } catch (err) { /* ignore */ }
				try { Blockbench.removeListener('edit_texture', onEditTexture); } catch (err) { /* ignore */ }
				try { Blockbench.removeListener('undo', onUndo); } catch (err) { /* ignore */ }
				try { Blockbench.removeListener('redo', onRedo); } catch (err) { /* ignore */ }
				clearTrailingSync();
				sync_cache.clear();
				if (paint_guard.dialog) { try { paint_guard.dialog.delete(); } catch (err) { /* ignore */ } paint_guard.dialog = null; }
				endPaintGuard();
				if (open_dialog) {
					try { open_dialog.delete(); } catch (err) { /* ignore */ }
					open_dialog = null;
				}
				removeFromMenus();
				if (action_apply) action_apply.delete();
				if (action_repeat) action_repeat.delete();
				if (css_style) css_style.delete();
				preview_cache.clear();
			} catch (error) {
				console.error('[embodytools/gradient]', 'could not unhook cleanly', error);
			}
		},
	};

})();
