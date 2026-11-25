import {beforeAll, describe, expect, test} from 'bun:test';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';

const workspace = process.env.EVAL_WORKSPACE;
const suite = workspace ? describe : describe.skip;
const load = relativePath => import(pathToFileURL(join(workspace, relativePath)).href);

const USAGE = 'Usage: ms [--long] <value>...\n';

suite('ms-cli-run-extraction', () => {
	let cli;
	beforeAll(async () => {
		cli = await load('src/cli.js');
	});

	test('run is exported and returns code/stdout/stderr without side effects', () => {
		expect(typeof cli.run).toBe('function');
		const {log, error} = console;
		const exit = process.exit;
		console.log = console.error = () => {
			throw new Error('run must not use console');
		};

		process.exit = () => {
			throw new Error('run must not call process.exit');
		};

		try {
			expect(cli.run(['1500', '--long'])).toEqual({code: 0, stdout: '2 seconds\n', stderr: ''});
		} finally {
			console.log = log;
			console.error = error;
			process.exit = exit;
		}
	});

	test('usage and help', () => {
		expect(cli.run([])).toEqual({code: 1, stdout: '', stderr: USAGE});
		expect(cli.run(['--help'])).toEqual({code: 0, stdout: USAGE, stderr: ''});
		expect(cli.run(['1000', '--help'])).toEqual({code: 0, stdout: USAGE, stderr: ''});
	});

	test('numbers format, strings parse, flags apply', () => {
		expect(cli.run(['1h'])).toEqual({code: 0, stdout: '3600000\n', stderr: ''});
		expect(cli.run(['120000', '2h'])).toEqual({code: 0, stdout: '2m\n7200000\n', stderr: ''});
		expect(cli.run(['-120000'])).toEqual({code: 0, stdout: '-2m\n', stderr: ''});
		expect(cli.run(['--long', '5400000'])).toEqual({code: 0, stdout: '2 hours\n', stderr: ''});
	});

	test('invalid values are reported and set a failing code but others still print', () => {
		expect(cli.run(['1h', 'x', '2s'])).toEqual({code: 1, stdout: '3600000\n2000\n', stderr: 'Invalid duration: x\n'});
		const result = cli.run(['']);
		expect(result.code).toBe(1);
		expect(result.stdout).toBe('');
		expect(result.stderr.endsWith('\n')).toBe(true);
	});

	test('running the file as a script behaves as before', () => {
		const file = join(workspace, 'src/cli.js');
		const ok = Bun.spawnSync([process.execPath, file, '90m', '5400000', '--long', 'abc']);
		expect(ok.stdout.toString()).toBe('5400000\n2 hours\n');
		expect(ok.stderr.toString()).toBe('Invalid duration: abc\n');
		expect(ok.exitCode).toBe(1);
		const none = Bun.spawnSync([process.execPath, file]);
		expect(none.stdout.toString()).toBe('');
		expect(none.stderr.toString()).toBe(USAGE);
		expect(none.exitCode).toBe(1);
		const help = Bun.spawnSync([process.execPath, file, '--help']);
		expect(help.stdout.toString()).toBe(USAGE);
		expect(help.exitCode).toBe(0);
		const good = Bun.spawnSync([process.execPath, file, '1000']);
		expect(good.stdout.toString()).toBe('1s\n');
		expect(good.exitCode).toBe(0);
	});
});
