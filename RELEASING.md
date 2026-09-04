# Releasing EmbodyTools

There is no build step. Cutting a version means running one command, and the tag is what
publishes the release.

```sh
npm install                     # canvas is a devDependency and the suites need it
npm run release -- <major|minor|patch> --title "Short release name" \
  --added "..." --changed "..." --fixed "..."
```

`scripts/release.mjs` runs the checks and every test suite, bumps `const PLUGIN_VERSION` in
`embodytools.js` (the only place the version lives) and `package.json`, inserts the
`changelog.json` entry, regenerates `CHANGELOG.md`, commits `vX.Y.Z: <title>`, tags `vX.Y.Z`
and pushes. The gate runs before anything is written, so a failing suite leaves the tree
untouched, and again after, so a bad edit cannot be committed.

Useful flags: `--dry-run` to preview the commit and tag, `--no-push` when there is no
credential to push with, `--notes <file.json>` for long entries, `--date YYYY-MM-DD` to
override today. The category flags are repeatable.

Pick the bump by what changed: `patch` for a fix with no new behaviour, `minor` for new
behaviour or a new sidecar version, `major` only for a sidecar format that older plugins
cannot load, or for dropping a tool.

**Repo-only changes do not get a version.** README, CI, scripts, tests: plain commit, no
bump, no tag, no changelog entry. The version is the plugin's, not the repo's.

## Writing the changelog lines

They are the release description, and they are read by David and by anyone installing the
plugin. `changelog.json` is the single source: Blockbench's Changelog tab, `CHANGELOG.md` and
the GitHub release page all render from it, so it is never written twice.

- Say what the user sees, not what the code did. "A texture holding a layer group stopped
  saving its layers entirely" beats "fixed TypeError in writeSidecar".
- Name the tool when a line is about one of them, since a reader of this plugin has three.
- One sentence per line where it fits, plain words, no em-dashes. Match the voice of the
  existing entries, which explain consequences rather than internals.
- Categories, in this order: Added, Changed, Fixed, Removed, Safeguards.
- Mention a sidecar version change and whether old sidecars still load. Users care.

## Pushing

A fine-grained token scoped to this repository alone belongs at `.git/egt-push-token` in the
working copy, untracked, so it can never be committed or pushed.

```sh
TOKEN=$(tr -d '\r\n' < .git/egt-push-token)
REMOTE="https://x-access-token:$TOKEN@github.com/Embody-Games/EGT-EmbodyTools.git"
git push --follow-tags "$REMOTE" main
git fetch "$REMOTE" "+refs/heads/*:refs/remotes/origin/*"
```

Pushing to a URL does not move `refs/remotes/origin/main`, and without that fetch the clone
keeps looking "ahead" in GitHub Desktop. The fetch needs the token too: this repo is private
and the bridge shell has no credential helper, so a plain `git fetch origin` there fails with
`could not read Username for 'https://github.com'`. Never write the token
into `.git/config`, a tracked file, a project doc or memory. Tokens are per repository and
`.git` is per clone, so on any other computer the file will not be there: ask David for it or
leave the push to him with `--no-push`. Do not invent another credential path.

SSH and deploy keys do not work from the Claude device bridge shell: it has no DNS of its own,
so plain `ssh` cannot resolve github.com. HTTPS with the token is the route.

## Two traps specific to working through the bridge

1. **The mount denies unlink.** A commit made through the bridge leaves `.git/index.lock`,
   `.git/HEAD.lock` and `tmp_obj_*` files behind, and `index.lock` will block git on the
   Windows side. `scripts/release.mjs` sweeps them before and after committing. Doing it by
   hand: `find .git \( -name "*.lock" -o -name "tmp_obj_*" \) -delete` then `git fsck`.
2. **Git identity.** The Linux side does not see Windows' global git config. This repo's own
   config is set to `Filmjolk <filmjolk_1@hotmail.com>` to match the other EGT repos. Check it
   is still there before committing.

## Verifying

After the push, confirm the release actually published rather than assuming:

```sh
curl -sS -H "Authorization: Bearer $TOKEN" \
  https://api.github.com/repos/Embody-Games/EGT-EmbodyTools/releases/tags/vX.Y.Z
```

Check `draft: false`, both assets present, and that the body is the changelog entry. The same
API with `/actions/runs?per_page=5` shows whether the workflows went green. Without a token,
the public release page works:
`https://github.com/Embody-Games/EGT-EmbodyTools/releases/latest`. Note that `api.github.com`
is reachable from the device bridge shell but not from the Claude cloud container.
