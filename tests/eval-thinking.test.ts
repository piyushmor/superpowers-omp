import { expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const repo = resolve(import.meta.dir, "..");
const command = [process.execPath, "evals/runner.ts", "work", "--case", "ms-format-rollover", "--modes", "unattended", "--models", "fixture/ambient-smoke", "--repeats", "1", "--jobs", "1"];

test("old preview commands still request low thinking", () => {
  const result = Bun.spawnSync(command, { cwd: repo });
  expect(result.exitCode).toBe(0);
  expect(JSON.parse(result.stdout.toString()).thinking).toBe("low");
});

function withFakeOmp(levels: string[], exercise: (run: { output: string; exitCode: number; stderr: string }) => void) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "omp-effort-test-")));
  try {
    const bin = join(dir, "bin"), home = join(dir, "home"), agent = join(dir, "agent");
    for (const path of [bin, home, agent]) mkdirSync(path);
    const catalog = JSON.stringify({ models: [{ selector: "fixture/ambient-smoke", thinking: levels }] });
    writeFileSync(join(agent, "models.yml"), "providers: {}\n");
    writeFileSync(join(bin, "omp"), `#!/bin/sh
case "$1" in
  --version) printf 'omp/effort-fixture\\n'; exit 0 ;;
  models) printf '%s\\n' '${catalog}'; exit 0 ;;
esac
bootstrap=0
for arg do
  case "$arg" in
    */extension.ts) bootstrap=1 ;;
    --thinking=*) printf 'FIXTURE_THINKING=%s\\n' "\${arg#*=}" >&2 ;;
  esac
done
printf 'SUPERPOWERS_EVAL_BOOTSTRAP_COUNT=%s\\n' "$bootstrap" >&2
printf '%s\\n' '{"type":"message_end","message":{"role":"assistant","provider":"fixture","model":"ambient-smoke","stopReason":"stop","content":[{"type":"text","text":"Fixture completed."}]}}' '{"type":"agent_end"}'
`, { mode: 0o755 });
    const output = join(dir, "output");
    const result = Bun.spawnSync([...command, "--thinking", "xhigh", "--run", "--agent-dir", agent, "--output", output], {
      cwd: repo, env: { PATH: `${bin}:${process.env.PATH}`, HOME: home, TMPDIR: dir },
    });
    exercise({ output, exitCode: result.exitCode, stderr: result.stderr.toString() });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test.skipIf(process.platform !== "darwin")("xhigh reaches both native launch commands and is recorded for the pair", () => {
  withFakeOmp(["low", "xhigh"], ({ exitCode, output }) => {
    expect(exitCode).toBe(0);
    expect(JSON.parse(readFileSync(join(output, "matrix.json"), "utf8")).thinking).toBe("xhigh");
    const { rows } = JSON.parse(readFileSync(join(output, "work-results.json"), "utf8"));
    expect(rows.map(row => row.arm)).toEqual(["plain", "superpowers"]);
    for (const row of rows) {
      expect(row.valid).toBe(true);
      expect(row.thinking).toBe("xhigh");
      expect(readFileSync(join(row.trial, "turn-0.stderr"), "utf8")).toContain("FIXTURE_THINKING=xhigh");
    }
  });
});

test("an unsupported requested effort is rejected before creating trial artifacts", () => {
  withFakeOmp(["low"], ({ exitCode, stderr, output }) => {
    expect(exitCode).not.toBe(0);
    expect(stderr).toContain("fixture/ambient-smoke does not advertise xhigh thinking");
    expect(existsSync(output)).toBe(false);
  });
});
