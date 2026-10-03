# Changelog

Generated from `changelog.json` by `scripts/changelog.mjs`. Edit that file, not this one.

## v3.1.0 - What's new, after every update

_2026-10-03_

### How to use

- Open or make a model after an update to see what changed, or press What's new above the cards.

### Added

- A What's new window: the first model you open after an update shows what changed in EmbodyTools and in the team tools since you last looked, with how to use it.
- A What's new button above the cards, with the latest notes of every tool.

## v3.0.1 - A branch picker, and your plugins stay put

_2026-10-03_

### Added

- A branch picker next to each team tool's switch. It lists the branches of the tool's repo, default first, and loads the tool from the one you pick, on this computer only.

### Changed

- EmbodyTools never removes anything from your plugin list. A team tool you installed on its own keeps running as that copy, and its card says so. To use the card instead, which updates by itself, remove that copy or switch it off under File > Plugins.

### Fixed

- EmbodyTools has its own icon in the plugin list again, instead of the puzzle piece.

## v3.0.0 - Your Embody sign-in

_2026-10-02_

### Changed

- EmbodyTools is now one plugin that shows each tool as a card you switch on and off, under Tools > EmbodyTools or on its plugin page. Tools update by themselves at your next Blockbench start, with no new EmbodyTools release.
- The team's tools need your Embody Google account. Sign in once at the top of the Tools tab and they load from then on, and keep working offline for up to a week.
- Delta Layers, Anchored Stretch, UnLeaky Layers and Gradient Map Layer, which used to be built in, start switched on, so moving over is one sign-in.

### Added

- Hue Painting, Dodge Blend Modes, Easy Box UV, Adrullan Model and Kumonga, each with its own card.
- Wynncraft Content Tools, which needs no sign-in.
- Add tool, for a plugin you want on this computer only, from its link.

### Removed

- The tools are no longer inside embodytools.js.
- Old copies of the team's tools. Any you installed on their own are removed, along with the old embodytools_modules folder, and those tools are switched on as cards instead.

### Safeguards

- Your sign-in is kept encrypted with your computer's own credential storage: Windows' own, the Keychain on a Mac, or your desktop's keyring on Linux. The offline copies of the tools are encrypted too. Signing out removes both.
