import {beforeAll, describe, expect, test} from 'bun:test';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';

const workspace = process.env.EVAL_WORKSPACE;
const suite = workspace ? describe : describe.skip;
const load = relativePath => import(pathToFileURL(join(workspace, relativePath)).href);

suite('clsx-unique', () => {
	let mod;
	beforeAll(async () => {
		mod = await load('src/index.js');
	});

	test('dedupes tokens across strings in first-seen order', () => {
		expect(mod.clsxUnique('a b', 'b c')).toBe('a b c');
		expect(mod.clsxUnique('a', 'a', 'a')).toBe('a');
		expect(mod.clsxUnique('A a')).toBe('A a');
	});

	test('handles objects, nested arrays, and whitespace', () => {
		expect(mod.clsxUnique('a', {a: true, b: 1, c: 0}, ['b', ['d', null, false]], 'a  d\te')).toBe('a b d e');
		expect(mod.clsxUnique('  a  ')).toBe('a');
		expect(mod.clsxUnique('a', {'a b': true})).toBe('a b');
		expect(mod.clsxUnique(1, '1', 2)).toBe('1 2');
	});

	test('empty and falsy input give an empty string', () => {
		expect(mod.clsxUnique()).toBe('');
		expect(mod.clsxUnique(null, undefined, false, 0, '', '   ')).toBe('');
		expect(mod.clsxUnique({a: false}, [])).toBe('');
	});

	test('existing clsx behaviour is unchanged', () => {
		expect(mod.clsx('a', 'a')).toBe('a a');
		expect(mod.clsx('a', {b: true, c: false}, ['d'])).toBe('a b d');
		expect(mod.default).toBe(mod.clsx);
	});
});
