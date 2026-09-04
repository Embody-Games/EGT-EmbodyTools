#!/usr/bin/env node
/**
 * The gate: static checks, then every test suite. This is what `npm test` runs, what
 * CI runs, and what scripts/release.mjs runs before and after it writes anything.
 *
 *   node scripts/verify.mjs
 *   node scripts/verify.mjs --quick     static checks only, no suites
 */
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const quick = process.argv.includes('--quick');

// run_tests_modules.js needs the paint and transform stand-ins, the other two do not.
// Order is cheapest first, so a broken file fails in a second rather than a minute.
const SUITES = ['run_tests.js', 'run_tests_52.js', 'run_tests_modules.js'];

function run(label, file, args = []) {
	console.log(`\n--- ${label} ---`);
	try {
		execFileSync(process.execPath, [join(root, file), ...args], { cwd: root, stdio: 'inherit' });
	} catch {
		console.error(`\nverify: ${label} failed`);
		process.exit(1);
	}
}

run('static checks', 'scripts/check.mjs');

if (quick) {
	console.log('\n--quick, suites skipped');
	process.exit(0);
}

if (!existsSync(join(root, 'node_modules', 'canvas'))) {
	console.error('\nverify: the suites need the canvas package. Run: npm install');
	process.exit(1);
}

for (const suite of SUITES) {
	if (!existsSync(join(root, 'test', suite))) {
		console.error(`\nverify: test/${suite} is missing`);
		process.exit(1);
	}
	run(`test/${suite}`, `test/${suite}`);
}

console.log('\neverything green');
