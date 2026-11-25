import {beforeAll, describe, expect, test} from 'bun:test';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';

const workspace = process.env.EVAL_WORKSPACE;
const suite = workspace ? describe : describe.skip;
const load = relativePath => import(pathToFileURL(join(workspace, relativePath)).href);

suite('escape-literal-regexp', () => {
	let mod;
	beforeAll(async () => {
		mod = await load('index.js');
	});

	test('matches the literal text only', () => {
		const {literalRegExp} = mod;
		expect(literalRegExp('a.b').test('a.b')).toBe(true);
		expect(literalRegExp('a.b').test('axb')).toBe(false);
		expect(literalRegExp('x|y').test('x')).toBe(false);
		expect(literalRegExp('x|y').test('..x|y..')).toBe(true);
		expect(literalRegExp('a-b(c)[d]').test('a-b(c)[d]')).toBe(true);
	});

	test('flags default to none and are applied', () => {
		const {literalRegExp} = mod;
		expect(literalRegExp('a').flags).toBe('');
		expect(literalRegExp('A-b', {flags: 'gi'}).flags).toBe('gi');
		expect(literalRegExp('A-b', {flags: 'i'}).test('a-B')).toBe(true);
		expect(literalRegExp('a-b(c)', {flags: 'u'}).test('xa-b(c)')).toBe(true);
		expect(() => literalRegExp('a', {flags: 'zz'})).toThrow();
	});

	test('wholeWord rejects word characters directly before or after', () => {
		const {literalRegExp} = mod;
		const plus = literalRegExp('c++', {wholeWord: true});
		expect(plus.test('learn c++ now')).toBe(true);
		expect(plus.test('c++x')).toBe(false);
		expect(plus.test('xc++')).toBe(false);
		const dot = literalRegExp('a.b', {wholeWord: true});
		expect(dot.test('a.b')).toBe(true);
		expect(dot.test('a.b!')).toBe(true);
		expect(dot.test('ba.b')).toBe(false);
		expect(dot.test('_a.b')).toBe(false);
		expect(dot.test('a.b1')).toBe(false);
		expect(dot.test('axb')).toBe(false);
		expect(literalRegExp('.x', {wholeWord: true}).test('a.x')).toBe(false);
		expect(literalRegExp('.x', {wholeWord: true}).test('a .x')).toBe(true);
		expect(literalRegExp('a', {wholeWord: true, flags: 'g'})[Symbol.replace]('a ba a', '-')).toBe('- ba -');
		expect(literalRegExp('a-b', {wholeWord: true, flags: 'u'}).test('a-b')).toBe(true);
	});

	test('non-string input throws TypeError', () => {
		expect(() => mod.literalRegExp(123)).toThrow(TypeError);
		expect(() => mod.literalRegExp(undefined)).toThrow(TypeError);
	});

	test('default export is unchanged', () => {
		expect(mod.default('a.b')).toBe('a\\.b');
		expect(mod.default('a-b')).toBe('a\\x2db');
		expect(() => mod.default(1)).toThrow(TypeError);
	});
});
