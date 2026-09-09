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

