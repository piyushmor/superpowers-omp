import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { check, parseEvents, type SkillCase } from "../evals/core.ts";

const cases = await Bun.file(new URL("../evals/skill-cases.json", import.meta.url)).json() as SkillCase[];

function runFixture(id: string, sourceOverride?: [string, string]) {
  const fixture = cases.find(entry => entry.id === id);
  if (!fixture?.files) throw new Error(`Missing fixture: ${id}`);
  const root = mkdtempSync(join(tmpdir(), "omp-verify-fixture-"));
  try {
    for (const [path, original] of Object.entries(fixture.files)) {
      const file = join(root, path);
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, sourceOverride?.[0] === path ? sourceOverride[1] : original);
    }
    const result = Bun.spawnSync(["python3", "-S", "-m", "unittest", "discover", "-s", "tests"], { cwd: root, env: { PATH: process.env.PATH, HOME: root } });
    return { exit: result.exitCode, output: result.stdout.toString() + result.stderr.toString() };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("the verification fixture reports a real failing test using Python without site packages", () => {
  const result = runFixture("verification-before-completion-positive");
  expect(result.exit).toBe(1);
  expect(result.output).toContain("FAILED (failures=1)");
});

test("the verification holdout runs the intended test before and after a fix", () => {
  const baseline = runFixture("verification-before-completion-holdout");
  expect(baseline.exit).toBe(1);
  expect(baseline.output).toContain("FAILED (failures=1)");
  const fixed = runFixture("verification-before-completion-holdout", ["src/range.py", "def upto(n):\n    return list(range(n + 1))\n"]);
  expect(fixed.exit).toBe(0);
  expect(fixed.output).toMatch(/Ran 1 test[\s\S]*\bOK\b/);
});

test("successful verification cannot be satisfied by a failed attempt", () => {
  const trace = parseEvents([
    { type: "tool_execution_start", toolName: "bash", toolCallId: "test", args: { command: "python3 -m unittest discover -s tests" } },
    { type: "tool_execution_end", toolName: "bash", toolCallId: "test", isError: true },
  ].map(event => JSON.stringify(event)).join("\n"));
  expect(check({ kind: "tool", tool: "bash", contains: "unittest", error: true }, trace, {})).toBe(true);
  expect(check({ kind: "tool", tool: "bash", contains: "unittest", error: false }, trace, {})).toBe(false);
});
