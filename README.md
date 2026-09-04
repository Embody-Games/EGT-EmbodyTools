# EmbodyTools

Embody Games' Blockbench toolset: three tools in one plugin.

| Tool | What it does | Where its settings live |
| --- | --- | --- |
| **Texture Layers** | Keeps a texture's layer stack alive across a save and reload for formats that cannot store layers, such as Hytale's `.blockymodel`. Desktop app only. | Settings > Export |
| **One-Sided Stretch** | Makes the Stretch tool move only the face you drag, and stops resizing a stretched cube from creeping outward on the anchored side. | Settings > Edit |
| **Layered Lock Alpha** | Makes Lock Alpha Channel look at every layer, so you can paint on an empty layer above your artwork. | Settings > Paint |

These were three separate plugins until v1.0.0. Same behaviour, same settings, one file to hand out.

## Install

1. Download `embodytools.js` and `changelog.json` from the [latest release](https://github.com/Embody-Games/EGT-EmbodyTools/releases/latest).
2. Put them **in the same folder**. Blockbench looks for `changelog.json` next to the plugin to fill in the Changelog tab.
3. In Blockbench: **File > Plugins > Load Plugin from File**, pick `embodytools.js`.
4. If you had any of the old plugins installed, remove them under **Blockbench > Plugins**. The plugin will tell you if it finds one. Two copies of the same tool share the same setting ids, and whichever one unloads first takes the other's settings with it.

Do not rename the file. Blockbench works out a file-loaded plugin's id from its filename and refuses to load it if that does not match the id in the code.

Needs Blockbench **5.0.5** or newer. In the web app the other two tools work and Texture Layers sits out, since it needs real filesystem access.

## Texture Layers

Blockbench keeps layers in `.bbmodel` files only. Save to anything else, Hytale's `.blockymodel` included, and you get a flat PNG: the stack is gone when the model is reopened. This keeps it, without touching the model file, by writing a sidecar next to the texture:

```
Texture.png                 the flat texture, unchanged, what the game reads
Texture.layers.json         the stack: order, blend modes, opacity, offsets, groups
Texture.layers/             one PNG per layer
  base-color_1a2b3c4d.png
  grime-overlay_9e8f7a6b.png
```

Anything that only cares about the model plus flat texture never sees it. For a hand-off, `Texture.png` is the deliverable and the two sidecar entries are the source: keep them in version control, and leave them out of the zip a client gets unless they use Blockbench too.

- Layer PNGs edited in another program are picked up while the project is open, the way Blockbench does it for unlayered textures. Those files are the ones to open in Photoshop or Aseprite.
- If the flat PNG changed on disk since the stack was saved, you get asked before anything is replaced, and can bring the outside edit back as an extra top layer.
- Save, reload and delete by hand from a texture's right-click menu.
- Layer groups from Blockbench 5.2 survive. Groups also survive a save from 5.1, which has no groups at all: anything that version cannot represent is carried through untouched rather than dropped.
- Sidecar format version 3. Sidecars from the older standalone plugin load here, and sidecars written here still load there.

## One-Sided Stretch

The Stretch tool scales a cube around its centre, so both faces on an axis move when you drag one handle. Here the dragged face moves and the opposite face stays put.

- **Stretch per Drag Step** replaces stock's snapped-distance maths with a fixed step, so the value lands on round numbers and the tool does not get coarser as you zoom out. `0` picks the format's base scale: `0.015625` for Hytale characters, `0.03125` for props. `0.125` is stock Blockbench.
- Hold **Shift** for half a step, **Ctrl** for a quarter, both for an eighth. Hold **Alt** while dragging to stretch from the centre.
- Single-axis handles only. The plane and uniform handles stay centred, same as with the Resize tool.
- It also puts the anchored face back when you **resize** a cube that already has stretch, which core moves because it applies the size change without accounting for the stretch multiplier. Covers the gizmo, the size sliders and keyboard nudges.
- Only active in formats that support cube stretching, such as the Hytale formats.

## Layered Lock Alpha

Written by quinten.bench.

Lock Alpha Channel only looks at the layer you are painting on, so on a fresh layer above your artwork everything is locked and the brush does nothing. Here a pixel is locked only when it is transparent on *every* layer, and strokes are clipped to the combined silhouette.

The eraser works on an upper layer again too. Lowering alpha is blocked only where that layer is the only thing holding the pixel up, so erasing above your artwork reveals what is underneath instead of punching a hole in the silhouette.

## Working on it

`embodytools.js` is one file with no build step: what is in the repo is what Blockbench loads. It is laid out as a short shared prelude, then one section per tool behind a banner like

```js
// ===== 2/3  ONE-SIDED STRETCH =====
```

Each section is its own closure and shares nothing with the others but the prelude, which is why all three can keep the variable names they had as separate plugins. Registration is at the bottom: one `BBPlugin.register` that walks a `MODULES` list, where every module reports whether it can run here (`blocked()`) and sets itself up and tears itself down (`load()` / `unload()`). A module that cannot run, or that fails on the way up, is skipped with a line in the console and does not take the others with it.

To add a tool: add a section, return the same fields, put it in `MODULES`.

```sh
npm install        # canvas, which the suites need for real PNG encode and decode
npm test           # static checks, then all three suites
npm run check      # static checks only, no suites
npm run writes     # how many files one Ctrl+S actually touches
```

The suites run against a mock Blockbench (`test/mock_blockbench.js`) with real files on disk, real PNG encode and decode, and real compositing. Every behaviour in the mock was copied from Blockbench's source rather than guessed.

- `test/run_tests.js` and `test/run_tests_52.js` cover Texture Layers, including the 5.2 layer group round-trip. Their mock has no paint or transform machinery on purpose, which also proves the other two modules sit out cleanly.
- `test/run_tests_modules.js` covers One-Sided Stretch and Layered Lock Alpha, and the bundle plumbing: unload restoring everything, one module sitting out without disturbing the others, and a module failing on the way up being cleaned up rather than left half-loaded.

Releases: see [RELEASING.md](RELEASING.md). Never edit the version by hand.

## License

MIT, see [LICENSE](LICENSE).
