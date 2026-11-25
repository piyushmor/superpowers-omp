import { expect, test } from "bun:test";
import { aggregate, check, experimentalPairs, parseEvents, safePath } from "../evals/core.ts";

const stream = (events: unknown[]) => events.map(event => JSON.stringify(event)).join("\n");

test("scores an actual skill read before an edit and deduplicates tool event ids", () => {
  const actual = parseEvents(stream([
    { type: "tool_execution_start", toolName: "read", toolCallId: "r", args: { path: "skill://brainstorming" } },
    { type: "tool_execution_end", toolName: "read", toolCallId: "r", isError: false },
    { type: "tool_execution_start", toolName: "edit", toolCallId: "e", args: { path: "src/index.ts" } },
    { type: "tool_execution_end", toolName: "edit", toolCallId: "e", isError: false },
  ]));
  expect(check({ kind: "tool", tool: "read", min: 1, max: 1 }, actual, {})).toBe(true);
  expect(check({ kind: "skill", name: "brainstorming", invoked: true }, actual, {})).toBe(true);
  expect(check({ kind: "order", first: { tool: "read", contains: "skill://brainstorming" }, then: { tool: "edit" } }, actual, {})).toBe(true);
  expect(check({ kind: "order", first: { tool: "edit" }, then: { tool: "read" } }, actual, {})).toBe(false);
});

test("counts only assistant message_end usage, including cache buckets", () => {
  const message = { role: "assistant", content: [{ type: "text", text: "Finished." }], usage: { input: 3, output: 5, cacheRead: 9, cacheWrite: 2, cost: { total: 0.01 } } };
  const actual = parseEvents(stream([{ type: "turn_end", message }, { type: "message_end", message }]));
  expect(actual.usage).toEqual({ input: 3, output: 5, cacheRead: 9, cacheWrite: 2, cost: 0.01, total: 19 });
  expect(actual.answer).toBe("Finished.");
});

test("failed skill reads cannot satisfy an invocation and a nested reference is distinct", () => {
  const actual = parseEvents(stream([
    { type: "tool_execution_start", toolName: "read", toolCallId: "bad", args: { path: "skill://using-superpowers" } },
    { type: "tool_execution_end", toolName: "read", toolCallId: "bad", isError: true },
    { type: "tool_execution_start", toolName: "read", toolCallId: "ref", args: { path: "skill://using-superpowers/references/omp-tools.md" } },
    { type: "tool_execution_end", toolName: "read", toolCallId: "ref", isError: false },
  ]));
  expect(check({ kind: "skill", name: "using-superpowers", invoked: true }, actual, {})).toBe(false);
});

test("alternates the order within paired runs and reports invalid pairs separately", () => {
  const pairs = experimentalPairs(["bug"], ["interactive", "unattended"], 2);
  expect(pairs).toHaveLength(4);
  expect(pairs[0].arms).toEqual(["plain", "superpowers"]);
  expect(pairs[1].arms).toEqual(["superpowers", "plain"]);
  const rows = [
    { pair: "p1", mode: "interactive" as const, arm: "plain" as const, valid: true, passed: false, ms: 100, tokens: 50 },
    { pair: "p1", mode: "interactive" as const, arm: "superpowers" as const, valid: true, passed: true, ms: 130, tokens: 70 },
    { pair: "p2", mode: "interactive" as const, arm: "plain" as const, valid: false, passed: false, ms: 10, tokens: 1 },
    { pair: "p2", mode: "interactive" as const, arm: "superpowers" as const, valid: true, passed: true, ms: 20, tokens: 9 },
  ];
  expect(aggregate(rows).interactive).toEqual({ attemptedPairs: 2, validPairs: 1, plainInvalid: 1, superpowersInvalid: 0, plainPass: 0, superpowersPass: 1, medianMsDelta: 30, medianTokenDelta: 20 });
});

test("fixture paths cannot target Git metadata or escape the workspace", () => {
  expect(safePath("src/cache.js")).toBe(true);
  for (const value of ["/tmp/file", "../file", "src/../file", ".git/config", "src\\file", ""]) {
    expect(safePath(value)).toBe(false);
  }
});
