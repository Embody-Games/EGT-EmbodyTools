#!/usr/bin/env node
/*
 * Releases EmbodyTools from this repo. RELEASING.md has the whole path.
 *
 * The version is the one in embodytools.js, which comes with the release build: it is
 * never bumped here. This adds that version's changelog entry, runs the checks, sets
 * package.json, regenerates CHANGELOG.md, commits "vX.Y.Z: <title>" and tags vX.Y.Z.
 *
 * It commits only the four files a release changes, by name, and won't start while anything
 * else here is changed or new. So nothing that turned up in the folder by accident, such as
 * a file with the webhook link in it, rides along into a public push.
 *
 *   npm run release -- --title "Short name" --added "..." --fixed "..."   with a new entry
 *   npm run release                                    with the entry already in changelog.json
 *
 *   --changed, --removed, --safeguards   the other categories; every category flag repeats
 *   --how "..."                          a "How to use" line, listed first
 *   --dry-run                            say what would happen, change nothing
 *   --push                               push main and the tag too; otherwise it prints how
 *
 * Run again after a commit that worked and a tag that didn't, it tags that commit.
 *
 * Pushing is what publishes. Blockbench downloads embodytools.js from main at every start
 * for everyone who installed it from its link, and the tag runs the release workflow.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { semverDesc } from './changelog.mjs';

// Every path below is from the repo's root, wherever this is run from.
process.chdir(join(dirname(fileURLToPath(import.meta.url)), '..'));

// What a release changes, and so the only files it ever commits.
const RELEASE_FILES = ['embodytools.js', 'changelog.json', 'package.json', 'CHANGELOG.md'];
const CATEGORIES = [['--how', 'How to use'], ['--added', 'Added'], ['--changed', 'Changed'], ['--fixed', 'Fixed'], ['--removed', 'Removed'], ['--safeguards', 'Safeguards']];

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const push = args.includes('--push');
const values = (name) => args.flatMap((a, i) => (a === name && i + 1 < args.length ? [args[i + 1]] : []));
const titleFlag = values('--title')[0] || '';

const die = (message) => { console.error('release: ' + message); process.exit(1); };
const git = (...a) => execFileSync('git', a, { encoding: 'utf8' }).trim();
// For git's -z output: a NUL after each path, and no quoting.
const gitPaths = (...a) => execFileSync('git', a, { encoding: 'utf8' }).split('\0').filter(Boolean);

const loader = readFileSync('embodytools.js', 'utf8');
const match = /^const PLUGIN_VERSION = '(\d+\.\d+\.\d+)';\r?$/m.exec(loader);
if (!match) die('embodytools.js has no release version (x.y.z, no -debug). Make it with npm run build:release in the working folder.');
const version = match[1];
const tag = 'v' + version;

if (git('branch', '--show-current') !== 'main') die('releases are made from main');
if (git('tag', '--list', tag)) {
	const onHead = git('rev-parse', tag + '^{commit}') === git('rev-parse', 'HEAD');
	die(tag + ' already exists' + (onHead ? ', on the last commit. If it never reached GitHub, push it: git push --follow-tags origin main. ' : '. ')
		+ 'For a new release, bump PLUGIN_VERSION in the working folder and build again.');
}
const earlier = git('tag', '--list', 'v*').split('\n').map((t) => t.trim().slice(1)).filter((v) => /^\d+\.\d+\.\d+$/.test(v)).sort(semverDesc);
if (earlier.length && semverDesc(version, earlier[0]) >= 0) die(version + ' is not newer than the last release, ' + earlier[0]);

// Anything else changed, staged or new would go out with the release, so it stops here,
// before anything is written. Files git ignores, such as .env, don't count.
const status = gitPaths('status', '--porcelain', '-z', '--untracked-files=all');
const stray = new Set();
for (let i = 0; i < status.length; i++) {
	const paths = [status[i].slice(3)];
	// A rename or a copy is followed by the path it came from.
	if (/[RC]/.test(status[i].slice(0, 2))) paths.push(status[++i]);
	for (const path of paths) if (!RELEASE_FILES.includes(path)) stray.add(path);
}
if (stray.size) {
	const list = [...stray];
	die('these are changed or new, and a release commits only ' + RELEASE_FILES.join(', ') + ':\n'
		+ list.slice(0, 10).map((path) => '  ' + path + '\n').join('')
		+ (list.length > 10 ? '  and ' + (list.length - 10) + ' more\n' : '')
		+ 'Commit them on their own first, or remove them. Nothing was changed.');
}

const changelog = JSON.parse(readFileSync('changelog.json', 'utf8'));
const categories = CATEGORIES.map(([flag, title]) => ({ title, list: values(flag) })).filter((c) => c.list.length);
let entry = changelog[version];
if (categories.length) {
	if (entry) die('changelog.json already has ' + version + '. Edit it there and leave the flags off, or remove it.');
	if (!titleFlag) die('a new entry needs --title');
	entry = { title: titleFlag, author: 'Embody Games', date: new Date().toLocaleDateString('sv-SE'), categories };
} else if (!entry) {
	die('changelog.json has no entry for ' + version + '. Pass --title with --added, --changed or --fixed, or write it there.');
} else {
	// An entry written ahead of time gets the day it actually goes out.
	entry = { ...entry, date: new Date().toLocaleDateString('sv-SE') };
}

// The checks run before anything is written, so a failure leaves the tree as it was.
const checks = spawnSync(process.execPath, ['scripts/check.mjs'], { stdio: 'inherit' });
if (checks.status !== 0) die('the checks failed, so nothing was changed');

const message = tag + ': ' + entry.title;
if (dryRun) {
	console.log('\nwould commit ' + RELEASE_FILES.join(', ') + ' and tag "' + message + '" with this entry:\n' + JSON.stringify(entry, null, 2));
	console.log(push ? 'and push main and ' + tag : 'and not push');
	process.exit(0);
}

// A new entry goes first; a drafted one keeps its place.
const updated = changelog[version] ? { ...changelog, [version]: entry } : { [version]: entry, ...changelog };
writeFileSync('changelog.json', JSON.stringify(updated, null, '\t') + '\n');
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
pkg.version = version;
writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
execFileSync(process.execPath, ['scripts/changelog.mjs'], { stdio: 'inherit' });

// By name, never git add -A or git add .: these four files and nothing else.
git('add', '--', ...RELEASE_FILES);
const staged = gitPaths('diff', '--cached', '--name-only', '-z');
const extra = staged.filter((path) => !RELEASE_FILES.includes(path));
if (extra.length) die('something besides the release files is staged, so nothing was committed: ' + extra.join(', '));
if (staged.length) {
	git('commit', '-m', message);
} else if (git('log', '-1', '--format=%s') === message) {
	// A run whose commit worked and whose tag didn't: the last commit is that one.
	console.log('nothing new to commit: the last commit is already ' + message);
} else {
	die('nothing to commit, and the last commit, ' + git('log', '-1', '--format=%h "%s"') + ', is not "' + message + '", so nothing was tagged.\n'
		+ 'The release files already match it. If that commit is the release, tag it: git tag -a ' + tag + ' -m "' + message + '"');
}
git('tag', '-a', tag, '-m', message);
console.log((staged.length ? 'committed and tagged ' : 'tagged ') + message);

if (push) {
	execFileSync('git', ['push', '--follow-tags', 'origin', 'main'], { stdio: 'inherit' });
	console.log('pushed. Everyone who installed EmbodyTools from its link gets ' + tag + ' at their next Blockbench start.');
} else {
	console.log('not pushed. To publish: git push --follow-tags origin main');
}
