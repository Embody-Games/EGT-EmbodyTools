# Releasing EmbodyTools

`embodytools.js` here is the release build. It's made from the working loader in Embody Games' private working folder (`EGT-EmbodyTools-work` on David's machine), and both of the loader's test harnesses run against it there before it's written here. So it's never edited here: a change made straight to this file is lost at the next release.

Nothing secret goes in this repo. The Google sign-in's client secret lives only in the access service, which does the two sign-in steps that need it. `npm test` reads every text file git has here, new ones too but not the ones it ignores, and fails if any of them has a Google client secret, a Discord webhook link, a private key, a path in a Windows user folder, a `file:` entry for a tool or an embodygames.com email address. It says which file, line and rule, never what it found.

## Before every push

Run `npm test`, every time, a change to `loader/registry.json` included. A push to `main` is already the release: Blockbench downloads `embodytools.js` and `loader/registry.json` from `main` at every start, so they reach everyone as soon as they're pushed. The checks workflow only runs after the push, when it's already out.

## A release

1. **In the working folder:** set `PLUGIN_VERSION` in `loader/embodytools_next.js` to the new version, then
   ```sh
   npm run build:release
   ```
   It builds the release build (plugin id `embodytools`, the real `REGISTRY_URL`, no `file:` entries, no `-debug`, and none of what `npm test` refuses here), runs both harnesses on it, and only if they pass writes `embodytools.js` into this repo. That's `../EGT-EmbodyTools` by default, this repo's clone next to the working folder, or `--out <folder>` for another clone. `npm run build:release -- --check` only says whether the file here is current.
2. **Here:**
   ```sh
   npm run release -- --title "Short name" --added "..." --fixed "..."
   ```
   or plain `npm run release` when `changelog.json` already has the version's entry. It runs `npm test`, writes the entry with today's date, sets `package.json`, regenerates `CHANGELOG.md`, commits `vX.Y.Z: <title>` and tags `vX.Y.Z`. It commits only `embodytools.js`, `changelog.json`, `package.json` and `CHANGELOG.md`, by name, and won't start while any other file is changed or new: commit that on its own first, or remove it. Files git ignores, such as `.env`, don't count. Run again after a commit that worked and a tag that didn't, it tags that commit. `--dry-run` shows what it would do. The categories are `--how` (How to use, listed first), `--added`, `--changed`, `--fixed`, `--removed` and `--safeguards`, each repeatable.
3. **Publish:**
   ```sh
   git push --follow-tags origin main
   ```
   or `--push` in step 2. Pushing `main` is what reaches people: Blockbench downloads `embodytools.js` at every start for everyone who installed it from its link. The tag runs `.github/workflows/release.yml`, which checks again, refuses a tag that disagrees with `PLUGIN_VERSION`, publishes a GitHub release with `embodytools.js` and `changelog.json`, and posts the entry to the EmbodyTools thread in `#addons`. Use the command for this push: GitHub Desktop's Push origin may leave the tag behind, and without the tag there's no GitHub release or Discord post.

Bump by what changed: `patch` for a fix, `minor` for something new, `major` for a change in how people use it. The version only ever moves forward, and the release script refuses one that isn't newer than the last tag.

## Writing the release notes

The `changelog.json` entry is everything people read about a release: EmbodyTools' What's new window, the Discord post, the GitHub release and `CHANGELOG.md` all show it. Write it for the people who use EmbodyTools, not for programmers: every line should make sense to a 12-year-old who uses Blockbench and has never seen the code.

- Say what changed for them, in everyday words. "What's new now shows all your tools" works, "the window builds its list with notesGroups" doesn't.
- Call things what Blockbench and EmbodyTools call them on screen: the Tools tab, the What's new button, File > Plugins. No names from the code.
- One change per line, in one or two short sentences. No em dashes, no hype.
- When a line is about one tool, name the tool.
- For a fix, say what went wrong, the way people noticed it, then that it's fixed. For something new, say what it does for them, and add a How to use line (`--how`) saying where to find it.
- Categories, in this order: How to use, Added, Changed, Fixed, Removed, Safeguards. Leave out the empty ones.

The team tools' plugin guide, `EMBODYTOOLS_PLUGIN_GUIDE.md`, has the full rules under "Writing release notes people understand". An entry can be reworded later without a new version: change its text in `changelog.json`, run `npm run changelog` and `npm test`, and push it as a plain commit. Never change a version number or a date.

## Changes that aren't a release

`loader/registry.json`, the README and the scripts take a plain commit and push, with no version or tag, and `npm test` before the push. A change to `loader/registry.json` reaches everyone at their next start.

## The first release, 3.0.0, at the switch-over

From Part 3 of the plan. The old repo is `Embody-Games/EGT-EmbodyTools-archive`, private, with the 1.x bundle, its sources and its history. This repo was created new under the old name, so the bundle's link now gives the new EmbodyTools.

Before that first push, because it reaches every contractor who installed the bundle from its link:

- The real `team-tools.json` is live in the access service, and the GitHub App is installed on every tool's repo, so the tools load once people sign in.
- The repo can read the `DISCORD_WEBHOOK_URL` secret. A public repo can read the organisation's secret if that secret's access includes public repositories. Otherwise add it as a repository secret (Settings > Secrets and variables > Actions).

Then, in this order:

1. **Push `main` with what's already committed.** `npm test`, then `git push origin main`, or **Push origin** in GitHub Desktop. This is the switch-over: everyone who installed the bundle from its link gets 3.0.0 at their next start.
2. **Check that both links answer.** Open each in a browser: it should show the file, not `404: Not Found`. A new push can take a few minutes to show up there.
   - the install link, https://raw.githubusercontent.com/Embody-Games/EGT-EmbodyTools/main/embodytools.js
   - the registry link, https://raw.githubusercontent.com/Embody-Games/EGT-EmbodyTools/main/loader/registry.json
3. **`npm run release`**, with no flags, since `changelog.json` already has the 3.0.0 entry. It sets the date to today, commits `v3.0.0: Your Embody sign-in` and tags `v3.0.0`.
4. **Push `main` and the tag:** `git push --follow-tags origin main`. The tag runs the release workflow, which makes the GitHub release and posts to Discord.

## Checking the Discord post

The post is its own job in the release workflow, `announce`, which can't write to the repo. Its Discord step is `continue-on-error`, so a failed post never fails the release, and GitHub still shows the step as passed. Look at the run's annotations instead: "Process completed with exit code 1" on an otherwise green run is the post failing. The last check is the thread itself. The webhook link is a password and lives only in that secret.
