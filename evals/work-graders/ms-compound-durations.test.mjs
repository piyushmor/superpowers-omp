import {beforeAll, describe, expect, test} from 'bun:test';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';

const workspace = process.env.EVAL_WORKSPACE;
const suite = workspace ? describe : describe.skip;
const load = relativePath => import(pathToFileURL(join(workspace, relativePath)).href);

const USAGE = 'Usage: ms [--long] [--compound] <value>...\n';
const S = 1000;
const M = 60 * S;
const H = 60 * M;
const D = 24 * H;
const W = 7 * D;

suite('ms-compound-durations', () => {
	let lib;
	beforeAll(async () => {
		lib = await load('src/ms.js');
	});

	const compound = (value, long = false) => lib.format(value, {compound: true, long});
	const cli = (...args) => {
		const result = Bun.spawnSync([process.execPath, join(workspace, 'src/cli.js'), ...args]);
		return {code: result.exitCode, stdout: result.stdout.toString(), stderr: result.stderr.toString()};
	};

	test('compound format uses two adjacent units and truncates', () => {
		expect(compound(90 * M)).toBe('1h 30m');
		expect(compound(H)).toBe('1h');
		expect(compound(3599999)).toBe('59m 59s');
		expect(compound(119999)).toBe('1m 59s');
		expect(compound(59999)).toBe('59s');
		expect(compound(1999)).toBe('1s');
		expect(compound(D + H + M + S)).toBe('1d 1h');
		expect(compound(D + 5 * M)).toBe('1d');
		expect(compound(8 * D)).toBe('1w 1d');
		expect(compound(2 * W)).toBe('2w');
		expect(compound(90 * D)).toBe('12w 6d');
		expect(compound(400 * D)).toBe('57w 1d');
		expect(compound(61 * S + 900)).toBe('1m 1s');
	});

	test('compound format keeps sub-second values as ms', () => {
		expect(compound(0)).toBe('0ms');
		expect(compound(1)).toBe('1ms');
		expect(compound(999)).toBe('999ms');
		expect(compound(-999)).toBe('-999ms');
		expect(compound(999, true)).toBe('999 ms');
		expect(compound(-500, true)).toBe('-500 ms');
	});

	test('compound format handles long style, plurals and negatives', () => {
		expect(compound(90 * M, true)).toBe('1 hour 30 minutes');
		expect(compound(61 * S, true)).toBe('1 minute 1 second');
		expect(compound(2 * H, true)).toBe('2 hours');
		expect(compound(S, true)).toBe('1 second');
		expect(compound(8 * D, true)).toBe('1 week 1 day');
		expect(compound(-90 * M)).toBe('-1h 30m');
		expect(compound(-90 * M, true)).toBe('-1 hour 30 minutes');
		expect(compound(-S)).toBe('-1s');
		expect(compound(-59999)).toBe('-59s');
		expect(lib.format(90 * M, {compound: true})).toBe('1h 30m');
	});

	test('default format is unchanged, including the known rounding', () => {
		expect(lib.format(90 * M)).toBe('2h');
		expect(lib.format(90 * M, {long: true})).toBe('2 hours');
		expect(lib.format(1500, {long: true})).toBe('2 seconds');
		expect(lib.format(3599999)).toBe('60m');
		expect(lib.format(90 * M, {compound: false})).toBe('2h');
		expect(lib.format(999)).toBe('999ms');
		expect(lib.format(-120000)).toBe('-2m');
		expect(() => lib.format('1')).toThrow();
		expect(() => lib.format(Number.NaN, {compound: true})).toThrow();
		expect(() => lib.format(Infinity, {compound: true})).toThrow();
	});

	test('parse accepts compound strings', () => {
		expect(lib.parse('1h 30m')).toBe(90 * M);
		expect(lib.parse('30m 1h')).toBe(90 * M);
		expect(lib.parse('1h   30m')).toBe(90 * M);
		expect(lib.parse('1H 30M')).toBe(90 * M);
		expect(lib.parse('1.5h 30m')).toBe(2 * H);
		expect(lib.parse('1w 2d 3h 4m 5s 6ms')).toBe(W + 2 * D + 3 * H + 4 * M + 5 * S + 6);
		expect(lib.parse('2hours')).toBe(2 * H);
		expect(lib.parse('1hour 30mins')).toBe(90 * M);
		expect(lib.parse('500ms 1s')).toBe(1500);
		expect(lib.parse('-1h 30m')).toBe(-90 * M);
		expect(lib.parse('.5h 30m')).toBe(H);
		expect(lib.default('1h 30m')).toBe(90 * M);
	});

	test('parse rejects malformed compound strings as NaN', () => {
		for (const input of ['1h 30', '1h30m', '1h -30m', ' 1h 30m', '1h 30m ', '1h  m', '1h 30x', '1 h 30m', '- 1h 30m', '--1h 30m', '1h 1h x', 'h 30m']) {
			expect(Number.isNaN(lib.parse(input))).toBe(true);
		}
	});

	test('single-term parsing is unchanged', () => {
		expect(lib.parse('1h')).toBe(H);
		expect(lib.parse('1 h')).toBe(H);
		expect(lib.parse('100')).toBe(100);
		expect(lib.parse('-1.5 hours')).toBe(-90 * M);
		expect(lib.parse('1.5h')).toBe(90 * M);
		expect(lib.parse('2 days')).toBe(2 * D);
		expect(Number.isNaN(lib.parse('abc'))).toBe(true);
		expect(Number.isNaN(lib.parse('1h30'))).toBe(true);
		expect(() => lib.parse('')).toThrow();
		expect(() => lib.parse('1'.repeat(101))).toThrow();
		expect(() => lib.parse(5)).toThrow();
		expect(lib.default(5400000, {compound: true})).toBe('1h 30m');
		expect(lib.default('1s')).toBe(1000);
		expect(() => lib.default(null)).toThrow();
	});

	test('format then parse round-trips exact values', () => {
		for (const value of [90 * M, 61 * S, 15 * D, -90 * M, 2 * W, 999, 0]) {
			expect(lib.parse(compound(value))).toBe(value);
		}
	});

	test('CLI formats numbers in compound style', () => {
		expect(cli('5400000', '--compound')).toEqual({code: 0, stdout: '1h 30m\n', stderr: ''});
		expect(cli('--compound', '-5400000')).toEqual({code: 0, stdout: '-1h 30m\n', stderr: ''});
		expect(cli('--compound', '500')).toEqual({code: 0, stdout: '500ms\n', stderr: ''});
		expect(cli('--long', '--compound', '5400000', '61000')).toEqual({code: 0, stdout: '1 hour 30 minutes\n1 minute 1 second\n', stderr: ''});
		expect(cli('5400000', '--compound', '--long')).toEqual({code: 0, stdout: '1 hour 30 minutes\n', stderr: ''});
	});

	test('CLI default style, parsing and quirks are unchanged', () => {
		expect(cli('5400000')).toEqual({code: 0, stdout: '2h\n', stderr: ''});
		expect(cli('--long', '5400000')).toEqual({code: 0, stdout: '2 hours\n', stderr: ''});
		expect(cli('1h 30m')).toEqual({code: 0, stdout: '5400000\n', stderr: ''});
		expect(cli('--compound', '1h 30m', '2h')).toEqual({code: 0, stdout: '5400000\n7200000\n', stderr: ''});
		expect(cli('--compound')).toEqual({code: 0, stdout: '', stderr: ''});
		expect(cli('--compound', '5400000', 'abc', '1h 30', '61000')).toEqual({
			code: 1,
			stdout: '1h 30m\n1m 1s\n',
			stderr: 'Invalid duration: abc\nInvalid duration: 1h 30\n',
		});
	});

	test('CLI usage lists the new flag on the right stream', () => {
		expect(cli('--help')).toEqual({code: 0, stdout: USAGE, stderr: ''});
		expect(cli('5400000', '--compound', '--help')).toEqual({code: 0, stdout: USAGE, stderr: ''});
		expect(cli()).toEqual({code: 1, stdout: '', stderr: USAGE});
	});

	test('README documents the flag and tests cover it', () => {
		const readme = readFileSync(join(workspace, 'README.md'), 'utf8');
		expect(readme).toContain('--compound');
		expect(readme).toContain('1h 30m');
		const tests = readFileSync(join(workspace, 'test/ms.test.js'), 'utf8');
		expect(/compound/i.test(tests)).toBe(true);
	});
});
