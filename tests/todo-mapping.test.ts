import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Guard: the OMP mapping must carry the plan/TDD -> todo workflow guidance.
// Failure mode is silence: without these lines, executors keep plans only in
// markdown ledgers, OMP's todo-keyed workflows (prewalk) never arm, and the
// todo view drifts from the ledger after compaction. Asserts the load-bearing
// instruction lines, not incidental prose. Tamper-verified 2026-11-24.

const repoRoot = resolve(import.meta.dir, "..");
const mapping = readFileSync(
  resolve(repoRoot, "skills/using-superpowers/references/omp-tools.md"),
  "utf8",
);

describe("plan/TDD -> todo workflow mapping", () => {
  test("section exists", () => {
    expect(mapping).toMatch(/^## Plans & TDD → todo/m);
  });

  test("plan handoff mirrors tasks at task-level granularity", () => {
    expect(mapping).toMatch(/one item per `Task N:/);
    expect(mapping).toMatch(/never one item per TDD micro-step/);
  });

  test("task lifecycle maps task-start/task-done onto todo start/done", () => {
    expect(mapping).toMatch(/`task-start` → `todo` `start`/);
    expect(mapping).toMatch(/`task-done`[^\n]*→ `todo` `done`/);
  });

  test("ledger and plan remain the authority over the todo view", () => {
    expect(mapping).toMatch(/the plan file and the SDD ledger are the record/);
    expect(mapping).toMatch(/the ledger outranks the todo view/);
  });

  test("TDD RED/GREEN stays in the ledger, not todo sub-items", () => {
    expect(mapping).toMatch(/Do not encode RED\/GREEN as separate todo items/);
  });

  test("prewalk synergy keeps the final review on an explicit capable model", () => {
    expect(mapping).toMatch(/--prewalk/);
    expect(mapping).toMatch(/dispatch it with an explicit model/);
  });
});