import {beforeAll, describe, expect, test} from 'bun:test';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';

const workspace = process.env.EVAL_WORKSPACE;
const suite = workspace ? describe : describe.skip;
const load = relativePath => import(pathToFileURL(join(workspace, relativePath)).href);

import {mkdirSync, mkdtempSync, readFileSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';

const ORIGINAL = String.raw`export default function slash(path) {
	const isExtendedLengthPath = path.startsWith('\\\\?\\');

	if (isExtendedLengthPath) {
		return path;
	}

	return path.replace(/\\/g, '/');
}
`;

const mutants = {
	noGlobalFlag: ORIGINAL.replace('/\\\\/g', '/\\\\/'),
	noExtendedPathGuard: ORIGINAL.replace("path.startsWith('\\\\\\\\?\\\\')", 'false'),
	guardMatchesAnywhere: ORIGINAL.replace('path.startsWith(', 'path.includes('),
	collapsesSeparators: ORIGINAL.replace("path.replace(/\\\\/g, '/')", "path.replace(/\\\\/g, '/').replace(/\\/+/g, '/')"),
};

const runTests = (testSource, implementation) => {
	const dir = mkdtempSync(join(tmpdir(), 'slash-grade-'));
	mkdirSync(dir, {recursive: true});
	writeFileSync(join(dir, 'index.js'), implementation);
	writeFileSync(join(dir, 'slash.test.js'), testSource);
	writeFileSync(join(dir, 'package.json'), '{"type":"module"}');
	const env = {...process.env};
	delete env.EVAL_WORKSPACE;
	const result = Bun.spawnSync([process.execPath, 'test', 'slash.test.js'], {cwd: dir, env});
	return {code: result.exitCode, output: result.stdout.toString() + result.stderr.toString()};
};

suite('slash-regression-tests', () => {
	test('implementation was not modified', () => {
		expect(readFileSync(join(workspace, 'index.js'), 'utf8')).toBe(ORIGINAL);
	});

	test('mutant sources differ from the original', () => {
		for (const source of Object.values(mutants)) {
			expect(source).not.toBe(ORIGINAL);
		}
	});

	test('submitted tests pass against the real implementation', () => {
		const testSource = readFileSync(join(workspace, 'slash.test.js'), 'utf8');
		const result = runTests(testSource, ORIGINAL);
		expect(result.output).toMatch(/\b[1-9]\d* pass/);
		expect(result.code).toBe(0);
	});

	for (const [name, source] of Object.entries(mutants)) {
		test(`submitted tests catch mutant ${name}`, () => {
			const testSource = readFileSync(join(workspace, 'slash.test.js'), 'utf8');
			expect(runTests(testSource, source).code).not.toBe(0);
		});
	}
});
