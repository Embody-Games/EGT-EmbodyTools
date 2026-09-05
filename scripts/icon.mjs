#!/usr/bin/env node
/**
 * Write embody_tools_icon.png into embodytools.js as the embedded ICON const.
 *
 *   node scripts/icon.mjs            update the plugin from the PNG
 *   node scripts/icon.mjs --check    exit 1 if they disagree, write nothing
 *
 * The plugin is one file with no build step, which is the whole point of it: what is
 * in the repo is what Blockbench loads. That leaves the icon as the one thing that has
 * to be copied by hand, so this does the copying and scripts/check.mjs makes sure it
 * was not forgotten.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const PLUGIN = join(root, 'embodytools.js');
const ART = join(root, 'embody_tools_icon.png');
const LINE = /^const ICON = 'data:image\/png;base64,[A-Za-z0-9+/=]*';$/m;

export function iconLine() {
	return `const ICON = 'data:image/png;base64,${readFileSync(ART).toString('base64')}';`;
}

const source = readFileSync(PLUGIN, 'utf8');
const found = source.match(LINE);
if (!found) {
	console.error('icon: could not find the ICON line in embodytools.js');
	process.exit(1);
}

const wanted = iconLine();
const same = found[0] === wanted;

if (process.argv.includes('--check')) {
	if (same) {
		console.log('icon: embodytools.js matches embody_tools_icon.png');
		process.exit(0);
	}
	console.error('icon: the embedded icon is not embody_tools_icon.png. Run: npm run icon');
	process.exit(1);
}

if (same) {
	console.log('icon: already up to date');
	process.exit(0);
}
writeFileSync(PLUGIN, source.replace(LINE, wanted));
console.log(`icon: embedded ${ART.split(/[\\/]/).pop()} (${wanted.length} chars)`);
