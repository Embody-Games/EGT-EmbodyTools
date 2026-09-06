# EmbodyTools — notes for Claude

Blockbench plugin bundling three tools in one file: texture layer persistence,
Anchored Stretch, and layer-aware Lock Alpha. `README.md` explains what it does.
`RELEASING.md` is the authority on cutting a release, including how to push from a
Cowork session. Read that before releasing anything; this file is orientation.

**This bundle overlaps three standalone repos** — `EGT-DeltaLayers`,
`EGT-AnchorStretch`, `EGT-UnLeakyLayers` — which are all still live and released
separately. A fix to one tool usually belongs in both places. Check before assuming
this bundle is the only home for a change.

## Shape of the repo

There is **no build step**. The plugin is one hand-written file that ships as-is.

| Path | What it is |
|---|---|
| `embodytools.js` | The entire plugin. `const PLUGIN_VERSION` near the top is the only place the version lives. |
| `changelog.json` | Blockbench's changelog format. **The only place release notes are written.** |
| `CHANGELOG.md` | Generated. Never hand-edit it; run `npm run changelog`. |
| `embody_tools_icon.png` | Source for the inlined icon. Re-inline with `npm run icon`. |
| `test/` | CommonJS suites: `run_tests.js`, `run_tests_52.js`, `run_tests_modules.js`. |
| `scripts/` | `release.mjs`, `changelog.mjs`, `check.mjs`, `verify.mjs`, `icon.mjs`, `discord_notify.mjs`. |

`check.mjs` and `verify.mjs` are **not** duplicates. `check.mjs` is static checks
over the plugin file; `verify.mjs` runs those and then the three suites. `npm test`
runs `verify.mjs`; `npm run check` runs it with `--quick` for static checks only.
This split is the best checking setup of the four repos and the others should grow
toward it, not away from it.

## Releasing

```sh
npm run release -- patch --title "Short name" --fixed "What the user sees."
```

**Pushing the tag is the button.** That command verifies, bumps, writes the
changelog entry, commits, tags and pushes. Everything after that is automatic.

Repo-only changes — CI, README, scripts, this file — get a plain commit. No version
bump, no tag, no changelog entry. The version belongs to the plugin, not the repo.

## What happens once the tag lands

`.github/workflows/release.yml`, on a GitHub runner:

1. Reruns `npm test`, so static checks plus all three suites.
2. Refuses if the tag disagrees with `PLUGIN_VERSION`.
3. Publishes the GitHub release. Body is that version's `changelog.json` entry,
   with `embodytools.js` and `changelog.json` attached.
4. Posts that same entry to Discord.
5. Ends. Nothing stays running.

## The Discord post

There is **no bot**. No hosted process, nothing invited to the server, nothing
listening. Step 4 above is a single HTTP POST to a Discord webhook, and then the
workflow exits. Discord labels webhook messages **APP**, which is not a bot account.

`scripts/discord_notify.mjs` reads the version's `changelog.json` entry and posts it
as an embed. Configuration is the `env:` block at the top of `release.yml`:

| Variable | Why |
|---|---|
| `PLUGIN_FILE` | Reads the version out of it; also builds the install link. |
| `PLUGIN_NAME` | The name the message posts under. |
| `PLUGIN_ICON_URL` | The avatar the message posts under. |
| `PLUGIN_COLOR` | Embed stripe colour, hex without the `#`. |
| `DISCORD_THREAD_ID` | The forum post it goes into. **`1545788737068335145` for this plugin.** |

The webhook URL is the repo/org secret `DISCORD_WEBHOOK_URL`. It is never in the
repo. All four plugin repos can read it.

Every plugin posts through **one** webhook on the `#addons` forum channel and lands
in its own thread via `?thread_id=`. Each post overrides `username` and
`avatar_url`, so it arrives as the plugin rather than as one shared identity.

Preview a post without sending anything:

```sh
PLUGIN_NAME="EmbodyTools" PLUGIN_FILE=embodytools.js \
  GITHUB_REPOSITORY=Embody-Games/EGT-EmbodyTools \
  node scripts/discord_notify.mjs 1.1.0 --dry-run
```

The step is `continue-on-error`. A Discord outage must never fail a good release.

## Traps

- **The test suites are CommonJS.** Do not add `"type": "module"` to
  `package.json`; it breaks all of them. The `.mjs` extensions already make the
  scripts ESM, so it buys nothing.
- The suites need the `canvas` devDependency. `verify.mjs` checks for it and says
  so rather than failing obscurely.
- `release.mjs` keeps `package-lock.json`'s version in step with `package.json`.
  It used to not, and the lockfile silently sat at 1.0.0 across several releases.
- Users are given `https://raw.githubusercontent.com/Embody-Games/EGT-EmbodyTools/main/embodytools.js`.
  Anything that reaches `main` reaches them immediately. There is no staging step.

## Changelog voice

Say what the user sees, not what the code did. Categories, in order: Added, Changed,
Fixed, Removed, Safeguards. When a change comes from one of the standalone plugins,
say which behaviour version it comes in at, the way the 1.0.0 entry does.
