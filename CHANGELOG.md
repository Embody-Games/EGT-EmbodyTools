# Changelog

Generated from `changelog.json` by `scripts/changelog.mjs`. Edit that file, not this one.

## v3.0.0 - Your Embody sign-in

_2026-10-01_

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
