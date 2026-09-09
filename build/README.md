# build/

`embodytools.js` at the repo root is **generated**. This folder is what generates it.

```sh
npm run build          # write embodytools.js
npm run build:check    # fail if embodytools.js is not what the build produces
```

`build:check` runs as part of `npm run check`, `npm test`, CI and every release, so a
hand edit to `embodytools.js` cannot reach `main`.

## What is here

| Path | What it is |
|---|---|
| `assemble.mjs` | The build. Reads the comments at the top of it before changing anything. |
| `src/*.js` | The three standalone plugins, verbatim, each at a tagged release. |
| `frame/*.js` | The bundle-only parts: the header, the module banners, each module's interface, and the single registration call. |

## The idea

Each tool is also its own plugin in its own repo, released on its own. The bundle
splices those files in **verbatim** — one tab of extra indentation, the console tag
retagged, and nothing else. So:

- A fix released in `EGT-DeltaLayers` reaches the bundle by dropping the new file into
  `src/`, not by anyone re-typing it into a 3000-line file.
- `diff src/delta_layers.js` against the matching section of `embodytools.js` should
  show only the console tag.
- The build refuses to run if a source still carries its own id, version or icon, if a
  console tag came out half-replaced, or if the header's `Was: <plugin> <version>` line
  disagrees with the source it describes.

The one part written by hand is each module's **interface** — the `id`, `settings`,
`blocked()`, `load()` and `unload()` in `frame/*_close.js`. That is the standalone
plugin's `Plugin.register` block turned into something the bundle can start and stop
on its own, and it is the one thing the build cannot check for you.

## Updating a tool

1. Copy the released file into `src/`, e.g.
   `git -C ../EGT-DeltaLayers show v1.6.0:delta_layers.js > src/delta_layers.js`
2. Fix that tool's `Was: <plugin> <version>` line in `frame/00_head.js`. The build
   fails and tells you if you forget.
3. `npm run build`, then **read the diff**. It should be only the change you expected.
4. If the plugin's `onload`/`onunload` changed, make the same change in its
   `frame/*_close.js`. Nothing checks this, so it is the step to be careful about.
5. `npm test`, then release as usual.

## Adding a tool

A file in `src/`, an entry in `MODULES` in `assemble.mjs`, an open and a close frame
file, a line in `frame/90_register.js`, and renumbered banners (`1/4`, `2/4`, ...).
Also: a `REPLACES` entry so people are told to remove the standalone copy, the
module's settings added to `scripts/check.mjs`, and a suite that runs it alongside
the others.

## Why it is not a bundler

There is nothing to resolve: no imports, no dependencies, no minification. Blockbench
evaluates the file as `new Function('requireNativeModule', 'require', code)`, so the
shipped file has to be readable JavaScript with no module system at all. Splicing
whole files with an assert around every seam is the smallest thing that does that, and
it keeps the shipped file diffable against its own inputs.
