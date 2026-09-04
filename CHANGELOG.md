# Changelog

Generated from `changelog.json` by `scripts/changelog.mjs`. Edit that file, not this one.

## v1.0.0 - Three plugins, one plugin

_2026-09-04_

### Added

- Texture Layers, One-Sided Stretch and Layered Lock Alpha now live in one plugin. One file to hand out and one version to talk about. Each tool keeps its settings where you already look for it: Export, Edit and Paint.
- Each tool starts and stops on its own. Texture Layers needs the desktop app for the sidecar files, so in the web app it sits out and the other two work as normal.

### Changed

- Your settings carry over. The setting ids are the same as in the three older plugins, so nothing needs setting up again.
- Layer sidecars now name embodytools as what wrote them. The sidecar format is still version 3, so sidecars written by the old layer plugin load here, and sidecars written here still load in it.
- Blockbench 5.0.5 or newer, which is what One-Sided Stretch already asked for. Layered Lock Alpha on its own used to run on 4.10.

### Fixed

- A tool that cannot hand a hook back when it unloads no longer leaves its settings behind.

### Removed

- The three separate plugins. Once EmbodyTools is installed, remove embodygames_texture_layer_bridge.js, one_sided_stretch.js and layered_lock_alpha.js under Blockbench > Plugins.

### Safeguards

- If one of those three is still installed, EmbodyTools says so on load, in the console and in a message box. Two copies of the same tool share the same setting ids, and whichever one unloads first takes the other's settings with it.
- A tool that fails while starting up is cleaned up and skipped, with a line in the console, and the other two carry on.
