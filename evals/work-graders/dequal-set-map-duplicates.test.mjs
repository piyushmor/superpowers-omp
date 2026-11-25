import {beforeAll, describe, expect, test} from 'bun:test';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';

const workspace = process.env.EVAL_WORKSPACE;
const suite = workspace ? describe : describe.skip;
const load = relativePath => import(pathToFileURL(join(workspace, relativePath)).href);

suite('dequal-set-map-duplicates', () => {
	let dequal;
	beforeAll(async () => {
		({dequal} = await load('src/index.js'));
	});

	test('Set with repeated equal objects is not equal to Set with distinct objects', () => {
		expect(dequal(new Set([{a: 1}, {a: 1}]), new Set([{a: 1}, {a: 2}]))).toBe(false);
		expect(dequal(new Set([{a: 1}, {a: 2}]), new Set([{a: 1}, {a: 1}]))).toBe(false);
		expect(dequal(new Set([[1], [1], [2]]), new Set([[1], [2], [2]]))).toBe(false);
	});

	test('Map with repeated equal object keys is not equal to Map with distinct keys', () => {
		const a = new Map([[{id: 1}, 'x'], [{id: 1}, 'x']]);
		const b = new Map([[{id: 1}, 'x'], [{id: 2}, 'x']]);
		expect(dequal(a, b)).toBe(false);
		expect(dequal(b, a)).toBe(false);
	});

	test('equal Sets stay equal regardless of order and duplicates', () => {
		expect(dequal(new Set([{a: 1}, {b: 2}]), new Set([{b: 2}, {a: 1}]))).toBe(true);
		expect(dequal(new Set([{a: 1}, {a: 1}]), new Set([{a: 1}, {a: 1}]))).toBe(true);
		expect(dequal(new Set([1, {a: 1}, 'x']), new Set(['x', {a: 1}, 1]))).toBe(true);
		expect(dequal(new Set([1, {a: 1}, 'x']), new Set([1, {a: 2}, 'x']))).toBe(false);
		expect(dequal(new Set([{a: 1}]), new Set([{a: 1}, {a: 1}]))).toBe(false);
		expect(dequal(new Set([new Set([{x: 1}]), new Set([{x: 2}])]), new Set([new Set([{x: 2}]), new Set([{x: 1}])]))).toBe(true);
	});

	test('equal Maps stay equal, values still compared', () => {
		const a = new Map([[{id: 1}, {v: [1]}], [{id: 2}, {v: [2]}]]);
		const b = new Map([[{id: 2}, {v: [2]}], [{id: 1}, {v: [1]}]]);
		const c = new Map([[{id: 2}, {v: [2]}], [{id: 1}, {v: [9]}]]);
		expect(dequal(a, b)).toBe(true);
		expect(dequal(a, c)).toBe(false);
		expect(dequal(new Map([['k', 1]]), new Map([['k', 1]]))).toBe(true);
		expect(dequal(new Map([['k', 1]]), new Map([['k', 2]]))).toBe(false);
		expect(dequal(new Map([[{id: 1}, 'x'], [{id: 1}, 'x']]), new Map([[{id: 1}, 'x'], [{id: 1}, 'x']]))).toBe(true);
	});

	test('other comparisons are unchanged', () => {
		expect(dequal({a: [1, {b: 2}]}, {a: [1, {b: 2}]})).toBe(true);
		expect(dequal({a: 1}, {a: 1, b: undefined})).toBe(false);
		expect(dequal(new Date(5), new Date(5))).toBe(true);
		expect(dequal(/x/g, /x/g)).toBe(true);
		expect(dequal(NaN, NaN)).toBe(true);
		expect(dequal([1, 2], [2, 1])).toBe(false);
		expect(dequal(new Uint8Array([1, 2]), new Uint8Array([1, 2]))).toBe(true);
	});
});
