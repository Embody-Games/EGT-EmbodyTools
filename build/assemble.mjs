#!/usr/bin/env node
/**
 * Builds embodytools.js from the three standalone plugins in build/src plus the
 * frame files in build/frame.
 *
 *   node build/assemble.mjs            write ../embodytools.js
 *   node build/assemble.mjs --check    build in memory and fail if it differs
 *
 * WHY THIS EXISTS
 * ---------------
 * The bundle is not a hand-written file. Every line of the three tools is spliced
 * in verbatim from the standalone plugin it comes from, so a diff between
 * build/src/<plugin>.js and the matching section of embodytools.js shows only the
 * console tag and the registration glue. That is the whole point: a fix released in
 * EGT-DeltaLayers arrives here by dropping the new file into build/src, not by
 * someone re-typing it, and `--check` in CI proves the shipped file is exactly what
 * the build produces.
 *
 * It replaces a hand-merge, which drifted: v1.3.0 shipped with a console line in the
 * stretch module reading `console.error(TAG, ...)`, where TAG resolved to the
 * registration block's `'[embodytools]'` two closures up rather than the module's own
 * tag. Nothing caught it, because nothing was comparing the bundle to its inputs.
 *
 * WHAT COMES FROM WHERE
 * ---------------------
 *   build/src/*.js      the three plugins, verbatim, at a tagged release each
 *   build/frame/*.js    everything that is bundle-only: the header, the module
 *                       banners, and each module's interface (id/settings/blocked/
 *                       load/unload) lifted from that plugin's Plugin.register
 *   package.json        the version
 *   embody_tools_icon.png  the icon, base64'd into the file
 *
 * ADDING OR UPDATING A MODULE
 * ---------------------------
 * Update: drop the new plugin file into build/src, fix the `Was: <plugin> <version>`
 * line in frame/00_head.js, run `npm run build`, read the diff. If the plugin's
 * onload/onunload changed, the module interface in its *_close.js frame file needs
 * the same change - that part is hand-written, and the one thing the build cannot
 * check for you.
 *
 * Add: a source, an entry in MODULES below, an open and a close frame file, and a
 * line in frame/90_register.js. Renumber the banners.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const build = dirname(fileURLToPath(import.meta.url));
const root = join(build, '..');
const OUT = join(root, 'embodytools.js');

const check_only = process.argv.includes('--check');

// Every failure in here is "somebody changed a source and this cannot splice it any
// more", and the message says which one and what to do about it. A stack trace on top
// of that is noise, so the message is all that gets printed.
process.on('uncaughtException', (error) => {
	console.error('build: ' + error.message);
	process.exit(1);
});

/*
 * One entry per tool, in the order they appear in the file.
 *
 * `tag` is the console prefix the standalone plugin logs under, retagged so a console
 * line says which part of the bundle it came from. `expect_tags` is how many times
 * that string occurs in the source: if a new release adds a console line, the count
 * moves and the build says so rather than quietly shipping a half-retagged file.
 *
 * `leading_comment` drops the plugin's own prose header where it sits inside the
 * IIFE rather than above it. The bundle's version of that prose is in the open frame
 * file, next to the banner.
 */
const MODULES = [
	{
		key: 'layers',
		src: 'delta_layers.js',
		plugin: 'delta_layers',
		open: '10_layers_open.js',
		close: '19_layers_close.js',
		tag: { decl: 'TAG', from: '[delta-layers]', to: '[embodytools/layers]', expect_tags: 1 },
		leading_comment: false,
	},
	{
		key: 'stretch',
		src: 'anchored_stretch.js',
		plugin: 'anchored_stretch',
		open: '20_stretch_open.js',
		close: '29_stretch_close.js',
		tag: { decl: null, from: '[Anchored Stretch]', to: '[embodytools/stretch]', expect_tags: 4 },
		leading_comment: true,
	},
	{
		key: 'unleaky',
		src: 'unleakylayers.js',
		plugin: 'unleakylayers',
		open: '30_lockalpha_open.js',
		close: '39_lockalpha_close.js',
		tag: { decl: 'LOG', from: '[UnLeaky Layers]', to: '[embodytools/unleaky]', expect_tags: 1 },
		leading_comment: false,
	},
];

/*
 * Things every standalone plugin has that the bundle provides once, up top, for all
 * of them: the id, the version, the icon, strict mode and the native-module guard.
 * Dropped by what they are rather than by line number, so a source file can grow or
 * be reordered without the build slicing the wrong lines out of it.
 *
 *   comments_above  also drop the contiguous // comment lines directly above
 *   to_semicolon    the declaration runs over several lines; drop to the one ending in ;
 *   optional        not every plugin has one (only Delta Layers needs a filesystem)
 */
const SHARED = [
	{ label: 'strict mode', re: /^'use strict';$/, optional: true },
	{ label: 'the plugin id', re: /^const PLUGIN_ID = /, comments_above: true },
	{ label: 'the plugin version', re: /^const PLUGIN_VERSION = /, comments_above: true },
	{ label: 'the icon', re: /^const (PLUGIN_)?ICON = /, comments_above: true, optional: true },
	{ label: 'the native module guard', re: /^const requireModule =$/, comments_above: true, to_semicolon: true, optional: true },
];

const fail = (message) => { throw new Error(message); };

/** Every index whose line matches; the callers all want exactly one. */
function findAll(lines, re) {
	const hits = [];
	for (let i = 0; i < lines.length; i++) if (re.test(lines[i])) hits.push(i);
	return hits;
}

function only(lines, re, { label, optional, where }) {
	const hits = findAll(lines, re);
	if (hits.length === 1) return hits[0];
	if (!hits.length) {
		if (optional) return -1;
		fail(`${where}: could not find ${label} (${re})`);
	}
	fail(`${where}: found ${hits.length} matches for ${label} (${re}), expected 1`);
}

/** Drop one run of lines, identified by what starts it rather than by line number. */
function dropRun(lines, rule, where) {
	const at = only(lines, rule.re, { ...rule, where });
	if (at < 0) return lines;

	let from = at;
	let to = at;
	if (rule.to_semicolon) {
		while (to < lines.length && !lines[to].trimEnd().endsWith(';')) to++;
		if (to >= lines.length) fail(`${where}: ${rule.label} never ends in a semicolon`);
	}
	if (rule.comments_above) {
		while (from > 0 && lines[from - 1].startsWith('//')) from--;
	}
	return lines.slice(0, from).concat(lines.slice(to + 1));
}

/** The plugin's own prose header, where it sits inside the IIFE. */
function dropLeadingComment(lines, where) {
	let i = 0;
	while (i < lines.length && !lines[i].trim()) i++;
	if (!lines[i] || !lines[i].startsWith('/*')) fail(`${where}: expected a block comment at the top of the module`);
	let end = i;
	while (end < lines.length && !lines[end].includes('*/')) end++;
	if (end >= lines.length) fail(`${where}: the module's opening comment is never closed`);
	return lines.slice(0, i).concat(lines.slice(end + 1));
}

const trimBlank = (lines) => {
	let from = 0;
	let to = lines.length;
	while (from < to && !lines[from].trim()) from++;
	while (to > from && !lines[to - 1].trim()) to--;
	return lines.slice(from, to);
};

/**
 * The plugin's body: everything between its IIFE opening and its registration call,
 * with the shared declarations taken out. The registration call itself becomes the
 * module interface in the close frame file, which is the one piece of this that is
 * written by hand.
 */
function extract(module) {
	const where = module.src;
	const text = readFileSync(join(build, 'src', module.src), 'utf8');
	let lines = text.split('\n');

	const version = (text.match(/^const PLUGIN_VERSION = '([^']+)'/m) || [])[1]
		|| fail(`${where}: no PLUGIN_VERSION to read`);
	const id = (text.match(/^const PLUGIN_ID = '([^']+)'/m) || [])[1];
	if (id !== module.plugin) fail(`${where}: declares the id ${id}, expected ${module.plugin}`);

	// Front: the IIFE opening, and everything above it (the prose header, if it lives there).
	const iife = only(lines, /^\(function \(\) \{$/, { label: 'the IIFE opening', where });
	lines = lines.slice(iife + 1);

	// Back: the registration call to the end of the file, plus the banner above it.
	const register = only(lines, /^(BB)?Plugin\.register\(/, { label: 'the registration call', where });
	let cut = register;
	while (cut > 0 && (!lines[cut - 1].trim() || lines[cut - 1].startsWith('//'))) cut--;
	lines = lines.slice(0, cut);

	if (module.leading_comment) lines = dropLeadingComment(lines, where);
	for (const rule of SHARED) lines = dropRun(lines, rule, where);

	// One console prefix per module, so a line in the console says which tool wrote it.
	const { decl, from, to, expect_tags } = module.tag;
	const occurrences = lines.filter((line) => line.includes(from)).length;
	if (occurrences !== expect_tags) {
		fail(`${where}: found ${occurrences} occurrences of ${from}, expected ${expect_tags}. `
			+ 'A release added or removed a console line: update expect_tags in build/assemble.mjs.');
	}
	// The declaration is replaced whole, so its trailing comment (which explains the
	// old tag) goes with it. Every other occurrence is a literal in a console call.
	const decl_re = decl ? new RegExp(`^const ${decl} = `) : null;
	lines = lines.map((line) => (decl_re && decl_re.test(line)
		? `const ${decl} = '${to}';`
		: line.split(from).join(to)));
	if (decl) {
		const declared = lines.filter((line) => line === `const ${decl} = '${to}';`);
		if (declared.length !== 1) fail(`${where}: the console tag declaration did not come out right`);
	}

	if (lines.some((line) => /^const (PLUGIN_ID|PLUGIN_VERSION|(PLUGIN_)?ICON) = /.test(line))) {
		fail(`${where}: a shared declaration survived extraction`);
	}
	if (lines.some((line) => line.includes(from))) fail(`${where}: an old console tag survived retagging`);

	return { version, body: trimBlank(lines) };
}

const frame = (name) => readFileSync(join(build, 'frame', name), 'utf8').replace(/\n+$/, '').split('\n');
const indent = (lines) => lines.map((line) => (line.trim() ? '\t' + line : line));

// The version lives in package.json, where scripts/release.mjs bumps it. It used to
// also live in the build, and the two went out of step: v1.0.2 shipped a plugin
// claiming 1.0.2 out of a repo that was already at 1.1.0.
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const icon = readFileSync(join(root, 'embody_tools_icon.png'));
const icon_line = "const ICON = 'data:image/png;base64," + icon.toString('base64') + "';";

const built = MODULES.map((module) => ({ module, ...extract(module) }));

const head = frame('00_head.js')
	.map((line) => line.replace('__ICON_LINE__', icon_line).replace('__PLUGIN_VERSION__', pkg.version));

// The header's table of contents says which release of each plugin the module is,
// and people read it to know what they have. Checked rather than generated, so
// updating a source is a deliberate two-line change and never a silent one.
for (const { module, version } of built) {
	const expected = `Was: ${module.plugin} ${version}`;
	if (!head.some((line) => line.includes(expected))) {
		const stale = head.find((line) => line.includes(`Was: ${module.plugin} `));
		fail(`frame/00_head.js says "${(stale || '').trim().replace(/^\* /, '')}" but build/src/${module.src} `
			+ `is ${version}. Update the "${expected}" line.`);
	}
}

const parts = [head];
for (const { module, body } of built) {
	parts.push(frame(module.open), indent(body), [''], frame(module.close));
}
parts.push(frame('90_register.js'));

let text = parts.flat().join('\n');
// Dropping a shared declaration leaves the blank lines that surrounded it back to
// back. No source file has two blank lines in a row, and neither should this one.
text = text.replace(/\n{3,}/g, '\n\n').replace(/\n+$/, '') + '\n';

const summary = built.map(({ module, version }) => `${module.plugin} ${version}`).join(', ');

if (check_only) {
	const on_disk = readFileSync(OUT, 'utf8');
	if (on_disk === text) {
		console.log(`embodytools.js is what the build produces (v${pkg.version}: ${summary})`);
		process.exit(0);
	}
	const a = on_disk.split('\n');
	const b = text.split('\n');
	console.error('embodytools.js is NOT what the build produces.\n');
	console.error(`  on disk: ${a.length} lines, ${on_disk.length} bytes`);
	console.error(`  built:   ${b.length} lines, ${text.length} bytes\n`);
	let shown = 0;
	for (let i = 0; i < Math.max(a.length, b.length) && shown < 10; i++) {
		if (a[i] === b[i]) continue;
		console.error(`  line ${i + 1}:`);
		console.error(`    on disk: ${JSON.stringify((a[i] ?? '').slice(0, 100))}`);
		console.error(`    built:   ${JSON.stringify((b[i] ?? '').slice(0, 100))}`);
		shown++;
	}
	console.error('\nSomebody edited embodytools.js by hand, or a source in build/src changed '
		+ 'without a rebuild. Run: npm run build');
	process.exit(1);
}

writeFileSync(OUT, text, 'utf8');
console.log(`wrote embodytools.js (${text.split('\n').length - 1} lines, ${text.length} bytes)`);
console.log(`  v${pkg.version} from ${summary}`);
