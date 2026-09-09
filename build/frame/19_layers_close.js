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

