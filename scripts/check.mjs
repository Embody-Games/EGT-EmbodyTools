#!/usr/bin/env node
/*
 * What `npm test` checks, on every push and before every release: no file here has a secret
 * in it, embodytools.js is a release build, loader/registry.json lists only outside tools,
 * and changelog.json is well formed. How the loader behaves is tested where the release
 * build is made, before it reaches this repo.
 *
 * Run it before every push, not after: a push to main is already live for everyone, and the
 * checks workflow only runs once it's out.
 */
import { readFileSync, readdirSync, lstatSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Script } from 'node:vm';

// Every path below is from the repo's root, wherever this is run from.
process.chdir(join(dirname(fileURLToPath(import.meta.url)), '..'));

const REGISTRY_URL = 'https://raw.githubusercontent.com/Embody-Games/EGT-EmbodyTools/main/loader/registry.json';
// The team's tools only ever come through the access service.
const TEAM_LINK = /^https:\/\/(?:raw\.githubusercontent\.com|github\.com)\/Embody-Games\//i;

/*
 * What no file here may have, since this repo is public. build-release.mjs in the working
 * folder refuses the same in the release build. This file is scanned too, so each pattern is
 * written not to match its own source.
 */
const SECRETS = [
	// The Google client secret lives only in the access service.
	['a Google client secret', /GOCSP[X]-|client[_]secret/i],
	['a Discord webhook link', /discord(?:app)?\.com\/api\/(?:v\d+\/)?webhooks/i],
	['a private key', /-{5}BEGIN/],
	// Anyone's own folder on Windows, written with either slash.
	['a path in a Windows user folder', /[A-Za-z]:[\\/]+Users[\\/]/i],
	// A tool read off one developer's disk, whichever quotes it's written with.
	['a file: entry for a tool', /\burl\s*['"`]?\s*:\s*['"`]file:/i],
	// Only the bare domain belongs here. A signed-in address comes from the sign-in itself.
	['an embodygames.com email address', /[A-Za-z0-9._%+-]+@(?:[A-Za-z0-9-]+\.)*embodygames\.com\b/i],
];

const problems = [];
const problem = (text) => problems.push(text);
const read = (file) => readFileSync(file, 'utf8').replace(/\r\n/g, '\n');

// ---- every file ----

// What git tracks, and any new file it would pick up, but nothing it ignores. Without git,
// every file but .git and node_modules.
function filesToScan() {
	try {
		const listed = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'],
			{ encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
		return { git: true, files: [...new Set(listed.split('\0').filter(Boolean))] };
	} catch (error) {
		const files = [];
		const walk = (dir) => {
			for (const entry of readdirSync(dir, { withFileTypes: true })) {
				if (entry.name === '.git' || entry.name === 'node_modules') continue;
				const path = dir === '.' ? entry.name : dir + '/' + entry.name;
				if (entry.isDirectory()) walk(path);
				else if (entry.isFile()) files.push(path);
			}
		};
		walk('.');
		return { git: false, files };
	}
}

// The lines a pattern matches on, never the match itself, which would print the secret.
function linesWith(text, pattern) {
	const every = new RegExp(pattern.source, pattern.flags.replace('g', '') + 'g');
	return [...new Set([...text.matchAll(every)].map((match) => text.slice(0, match.index).split('\n').length))];
}
const lineList = (lines) => (lines.length === 1 ? 'line ' : 'lines ') + lines.slice(0, 5).join(', ')
	+ (lines.length > 5 ? ' and ' + (lines.length - 5) + ' more' : '');

const scan = filesToScan();
let scanned = 0;
for (const file of scan.files) {
	let bytes;
	try {
		if (!lstatSync(file).isFile()) continue; // a link or a submodule
		bytes = readFileSync(file);
	} catch (error) {
		continue; // listed, but deleted and not committed yet
	}
	if (bytes.subarray(0, 8000).includes(0)) continue; // binary, by git's own test
	scanned++;
	const text = bytes.toString('utf8');
	for (const [label, pattern] of SECRETS) {
		const lines = linesWith(text, pattern);
		if (lines.length) problem(file + ' has ' + label + ' (' + lineList(lines) + ')');
	}
}

// ---- embodytools.js ----
const loader = read('embodytools.js');
try {
	new Script(loader, { filename: 'embodytools.js' });
} catch (error) {
	problem('embodytools.js does not parse: ' + error.message);
}
if (!/^const PLUGIN_ID = 'embodytools';$/m.test(loader)) {
	problem('embodytools.js must register as embodytools, the id its filename gives it');
}
if (!/^const PLUGIN_VERSION = '\d+\.\d+\.\d+';$/m.test(loader)) {
	problem('embodytools.js needs a plain x.y.z version: no -debug, and no comment on that line');
}
if (!loader.includes("const REGISTRY_URL = '" + REGISTRY_URL + "';")) {
	problem('embodytools.js must read the outside tools from ' + REGISTRY_URL);
}
// A file: entry in the built-in list, or anywhere else, is caught with the secrets above.
if (!/\nconst REGISTRY = \[\n([\s\S]*?)\n\];\n/.test(loader)) problem('embodytools.js has no built-in list');
if (/embodytools_next|-debug|TEMPORARY/.test(loader)) problem('embodytools.js still has something of a test build in it');

// ---- loader/registry.json ----
let registry = null;
try {
	registry = JSON.parse(read('loader/registry.json'));
} catch (error) {
	problem('loader/registry.json is not valid JSON: ' + error.message);
}
if (registry) {
	if (!Array.isArray(registry.tools) || !registry.tools.length) problem('loader/registry.json needs a non-empty "tools" list');
	const ids = new Set();
	(registry.tools || []).forEach((tool, index) => {
		const where = 'loader/registry.json, tool ' + (tool && tool.id ? '"' + tool.id + '"' : index + 1);
		if (!tool || typeof tool !== 'object') { problem(where + ' is not an object'); return; }
		if (typeof tool.id !== 'string' || !/^[a-z0-9_]+$/.test(tool.id)) problem(where + ': id must be lowercase letters, digits and underscores');
		else if (ids.has(tool.id)) problem(where + ': the id is used twice');
		ids.add(tool.id);
		if (typeof tool.name !== 'string' || !tool.name.trim()) problem(where + ': no name');
		if (typeof tool.url !== 'string' || !/^https:\/\/\S+$/.test(tool.url)) problem(where + ': url must be an https link');
		else if (TEAM_LINK.test(tool.url)) problem(where + ': a team tool, which only comes through the sign-in, never this list');
		if (tool.native !== undefined && tool.native !== false) problem(where + ': asks for file access, which no outside tool gets without Embody Games deciding');
		if (tool.tags !== undefined && !(Array.isArray(tool.tags) && tool.tags.every((t) => typeof t === 'string'))) problem(where + ': tags must be a list of text');
	});
}

// ---- changelog.json ----
try {
	const changelog = JSON.parse(read('changelog.json'));
	for (const [version, entry] of Object.entries(changelog)) {
		if (!/^\d+\.\d+\.\d+$/.test(version)) problem('changelog.json: "' + version + '" is not an x.y.z version');
		if (!entry || typeof entry.title !== 'string' || typeof entry.date !== 'string' || !Array.isArray(entry.categories)
			|| !entry.categories.every((c) => c && typeof c.title === 'string' && Array.isArray(c.list) && c.list.every((l) => typeof l === 'string'))) {
			problem('changelog.json: the ' + version + ' entry needs a title, a date and categories of { title, list }');
		}
	}
} catch (error) {
	problem('changelog.json is not valid JSON: ' + error.message);
}

if (problems.length) {
	for (const text of problems) console.error('FAIL  ' + text);
	if (!scan.git) console.error('      git could not list the files here, so every file in this folder was checked, even ones git would ignore');
	process.exit(1);
}
console.log('ok    no secrets in the ' + scanned + (scan.git ? ' files git has here' : ' files in this folder')
	+ ', embodytools.js is a release build, loader/registry.json lists only outside tools, changelog.json is well formed');
