import {beforeAll, describe, expect, test} from 'bun:test';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';

const workspace = process.env.EVAL_WORKSPACE;
const suite = workspace ? describe : describe.skip;
const load = relativePath => import(pathToFileURL(join(workspace, relativePath)).href);

suite('ms-format-rollover', () => {
	let ms;
	beforeAll(async () => {
		ms = await load('src/ms.js');
	});

	test('values that round up to the next unit use that unit', () => {
		const {format} = ms;
		expect(format(59500)).toBe('1m');
		expect(format(3599999)).toBe('1h');
		expect(format(3570000)).toBe('1h');
		expect(format(84600000)).toBe('1d');
		expect(format(561600000)).toBe('1w');
	});

	test('long format rolls over and pluralises by the final unit', () => {
		const {format} = ms;
		expect(format(3599999, {long: true})).toBe('1 hour');
		expect(format(59500, {long: true})).toBe('1 minute');
		expect(format(84600000, {long: true})).toBe('1 day');
	});

	test('negative values roll over symmetrically', () => {
		const {format} = ms;
		expect(format(-3599999)).toBe('-1h');
		expect(format(-59600)).toBe('-1m');
		expect(format(-3599999, {long: true})).toBe('-1 hour');
	});

	test('values that do not round up are unchanged', () => {
		const {format} = ms;
		expect(format(59499)).toBe('59s');
		expect(format(3569999)).toBe('59m');
		expect(format(84599999)).toBe('23h');
		expect(format(561599999)).toBe('6d');
		expect(format(500)).toBe('500ms');
		expect(format(0)).toBe('0ms');
		expect(format(1000)).toBe('1s');
		expect(format(1500)).toBe('2s');
		expect(format(3600000)).toBe('1h');
		expect(format(90000000)).toBe('1d');
		expect(format(5400000, {long: true})).toBe('2 hours');
		expect(format(3000000, {long: true})).toBe('50 minutes');
		expect(format(500, {long: true})).toBe('500 ms');
	});

	test('parse and validation are unchanged', () => {
		expect(ms.parse('1h')).toBe(3600000);
		expect(ms.parse('1.5 hours')).toBe(5400000);
		expect(ms.parse('100')).toBe(100);
		expect(Number.isNaN(ms.parse('abc'))).toBe(true);
		expect(ms.default('2m')).toBe(120000);
		expect(ms.default(120000)).toBe('2m');
		expect(() => ms.format(Number.NaN)).toThrow();
	});
});
