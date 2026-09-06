# Changelog

Generated from `changelog.json` by `scripts/changelog.mjs`. Edit that file, not this one.

## v1.2.0 - Anchored Stretch 1.8.1

_2026-09-06_

### Added

- Anchored Stretch comes in at its 1.8.1 behaviour. The Vertex Snap tool gets a second mode next to Stretch: Resize + Stretch puts as much of the gap as it can into whole units of size and leaves only the remainder in stretch, so the cube reaches the target without landing on an odd stretch value.
- Anchored Stretch adds a Bake Stretch into Size button next to the stretch sliders. It rolls a cube's stretch into whole units of size without moving it on screen, leaving stretch holding only the fraction that will not fit in a whole unit.

### Fixed

- Stretch values from a vertex snap are rounded to six decimals, so a gap that should be a whole number stops reading as 0.999999999.

## v1.1.0 - Delta Layers and UnLeaky Layers

_2026-09-05_

### Changed

- The layer sidecar tool is now Delta Layers, at its 1.5.1 behaviour, and the paint tool is UnLeaky Layers, at its 1.2.1. Same tools, new names, and both keep their place in Settings.
- Delta Layers renamed its settings, so 'persist texture layers' and 'reload layer images' are now delta_layers_persist and delta_layers_watch. Those two default to on, so the only thing lost is a deliberate off. UnLeaky Layers and Anchored Stretch keep the setting ids they had.
- The texture right-click entries are now Save, Reload and Delete Delta Layers, under new ids, so a keybind set on the old ones needs setting again.

### Safeguards

- The warning about an older copy still being installed now knows all six names these tools have gone by, so it fires whichever one you have.
- Delta Layers renamed the marker that stops two copies wrapping the same codec twice, which would make every save write its sidecars twice. The bundle keeps the original name, so it still recognises an older layer plugin.

## v1.0.2 - New icon

_2026-09-05_

### Changed

- A new EmbodyTools icon in Blockbench's plugin list.

## v1.0.1 - EmbodyTools icon

_2026-09-05_

### Changed

- The plugin shows the EmbodyTools icon instead of the Anchored Stretch arrow it borrowed in 1.0.0.

## v1.0.0 - Three plugins, one plugin

_2026-09-04_

### Added

- Texture Layers, Anchored Stretch and Layered Lock Alpha now live in one plugin. One file to hand out and one version to talk about. Each tool keeps its settings where you already look for it: Export, Edit and Paint.
- Each tool starts and stops on its own. Texture Layers needs the desktop app for the sidecar files, so in the web app it sits out and the other two work as normal.
- Anchored Stretch comes in at its 1.7.2 behaviour, so the Vertex Snap tool has a Stretch mode: pick a corner, pick a target, and the cube stretches to reach it with the opposite corner anchored. Core's scale mode stays hidden in the Hytale formats because scaling breaks integer sizes, and stretching leaves size and UVs alone.
- The plugin shows the Anchored Stretch arrow in Blockbench's plugin list. The image is embedded in the file, so it travels with it wherever it is loaded from.

### Changed

- Texture Layers and Layered Lock Alpha keep their setting ids, so what you had set in those two is still set. Anchored Stretch keeps the ids it took when it was renamed from One-Sided Stretch, so its settings carry over from that rename, not from before it.
- Layer sidecars now name embodytools as what wrote them. The sidecar format is still version 3, so sidecars written by the old layer plugin load here, and sidecars written here still load in it.
- Blockbench 5.0.5 or newer, which is what Anchored Stretch already asked for. Layered Lock Alpha on its own used to run on 4.10.

### Fixed

- A tool that cannot hand a hook back when it unloads no longer leaves its settings behind.

### Removed

- The separate plugins. Once EmbodyTools is installed, remove embodygames_texture_layer_bridge.js, anchored_stretch.js, one_sided_stretch.js and layered_lock_alpha.js under Blockbench > Plugins.

### Safeguards

- If any of those are still installed, EmbodyTools says so on load, in the console and in a message box. Two copies of the same tool fight over the same settings, and the older One-Sided Stretch would patch the stretch tool a second time under different setting ids.
- A tool that fails while starting up is cleaned up and skipped, with a line in the console, and the other two carry on.
