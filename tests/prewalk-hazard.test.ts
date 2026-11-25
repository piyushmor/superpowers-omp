import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Guard: the workflow guide must warn that an armed subagent prewalk never disarms for a
// text-returning delegate. Failure mode is silence — a reviewer/research slice answers, gets
// "Continue task now", invents tool work, and the controller's `wait` never resolves, while the
// pane still reports progress. Asserts the load-bearing guidance, not incidental prose.

const repoRoot = resolve(import.meta.dir, "..");
const guide = readFileSync(
  resolve(repoRoot, "skills/using-superpowers/references/omp-workflows.md"),
  "utf8",
);

describe("subagent prewalk hazard guidance", () => {
  test("names the disarm condition and that text deliverables never meet it", () => {
    expect(guide).toMatch(/only a workspace `edit`\/`write` disarms/i);
    expect(guide).toMatch(/`agent:\/\/`/);
    expect(guide).toMatch(/livelock|never finish|cannot finish/i);
  });

  test("gives the per-call model mitigation for review and research delegates", () => {
    expect(guide).toMatch(/per-call `model`/);
    expect(guide).toMatch(/skip prewalk/i);
  });

  test("states that session-level prewalk.enabled does not govern subagents", () => {
    expect(guide).toMatch(/`prewalk\.enabled: false` does not/);
  });

  test("points diagnosis at the child transcript, not the progress indicator", () => {
    expect(guide).toMatch(/`prewalk-continue`/);
    expect(guide).toMatch(/child transcript/);
  });
});