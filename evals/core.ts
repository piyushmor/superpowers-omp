export type Arm = "plain" | "superpowers";
export type Mode = "interactive" | "unattended";
export const thinkingLevels = ["off", "minimal", "low", "medium", "high", "xhigh", "max"] as const;
export type ThinkingLevel = (typeof thinkingLevels)[number];
export type ToolMatch = { tool: string; contains?: string };
export type Check =
  | ({ kind: "tool"; min?: number; max?: number } & ToolMatch)
  | { kind: "order"; first: ToolMatch; then: ToolMatch }
  | { kind: "answer"; includes: string[] }
  | { kind: "file"; path: string; exists?: boolean; contains?: string }
  | { kind: "unchanged" }
  | { kind: "skill"; name: string; invoked: boolean };
export type SkillCase = { id: string; skill: string; kind: "positive" | "near-miss" | "holdout"; prompt: string; files?: Record<string, string>; checks: Check[] };
export type WorkCase = { id: string; title: string; prompt: string; source: { url: string; commit: string }; files: Record<string, string>; allowedChanges: string[]; grader: string; answers?: string[] };
export type Tool = { name: string; args: Record<string, unknown>; error?: boolean };
export type Usage = { input: number; output: number; cacheRead: number; cacheWrite: number; cost: number; total: number };
export type Trace = { tools: Tool[]; answer: string; errors: string[]; usage: Usage; complete: boolean; routes: string[]; finalReason: string | null; protocolErrors: number; hardQuota: boolean; deadline: boolean };
export type PairRow = { pair: string; mode: Mode; arm: Arm; valid: boolean; passed: boolean; ms: number; tokens: number };

export function safePath(path: string): boolean {
  return !/[\\\x00-\x1f]/.test(path) && !/^[a-z]:/i.test(path) &&
    path.split("/").every(part => part.length > 0 && ![".", "..", ".git", ".omp"].includes(part.toLowerCase()));
}

export function parseEvents(jsonl: string): Trace {
  const tools: Tool[] = [];
  const pending = new Map<string, Tool>();
  const errors: string[] = [];
  const routes = new Set<string>();
  const usage: Usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, total: 0 };
  let answer = "";
  let complete = false;
  let finalReason: string | null = null;
  let protocolErrors = 0;
  let hardQuota = false;
  let deadline = false;
  for (const line of jsonl.split("\n")) {
    if (!line.trim()) continue;
    let event;
    try { event = JSON.parse(line); } catch { protocolErrors++; continue; }
    if (!event || typeof event.type !== "string") { protocolErrors++; continue; }
    if (event.type === "agent_end") complete = true;
    if (event.type === "tool_execution_start") {
      const entry: Tool = { name: event.toolName, args: event.args ?? {} };
      tools.push(entry);
      pending.set(event.toolCallId, entry);
    }
    if (event.type === "tool_execution_end") {
      const entry = pending.get(event.toolCallId);
      if (entry) entry.error = Boolean(event.isError);
    }
    const message = event.message;
    if (event.type !== "message_end" || message?.role !== "assistant") continue;
    if (message.provider && message.model) routes.add(`${message.provider}/${message.model}`);
    finalReason = message.stopReason ?? null;
    if (finalReason === "error" || finalReason === "aborted") {
      const reason = String(message.errorMessage ?? finalReason);
      errors.push(reason);
      if (/exceeded your monthly spend cap/i.test(reason)) hardQuota = true;
      if (finalReason === "aborted" && /^deadline exceeded$/i.test(reason)) deadline = true;
    }
    if (Array.isArray(message.content)) {
      const text = message.content.filter((block: { type?: string }) => block.type === "text").map((block: { text: string }) => block.text).join("\n");
      if (text.trim()) answer = text;
    }
    const bill = message.usage;
    if (bill) {
      for (const key of ["input", "output", "cacheRead", "cacheWrite"] as const) usage[key] += Number(bill[key] ?? 0);
      usage.cost += Number(bill.cost?.total ?? 0);
    }
  }
  usage.total = usage.input + usage.output + usage.cacheRead + usage.cacheWrite;
  return { tools, answer, errors, usage, complete, routes: [...routes], finalReason, protocolErrors, hardQuota, deadline };
}

export function classifyTurn(trace: Trace, exit: number | null, timedOut: boolean): "scorable" | "budget" | "quota" | "invalid" {
  if (trace.hardQuota) return "quota";
  if (timedOut || exit === 3 || (trace.deadline && trace.finalReason === "aborted")) return "budget";
  return exit === 0 && trace.complete && trace.finalReason === "stop" && trace.protocolErrors === 0 ? "scorable" : "invalid";
}

export function check(rule: Check, trace: Trace, files: Record<string, string>, changed: string[] = []): boolean {
  const matches = (call: Tool, expect: ToolMatch) => call.name === expect.tool && (expect.contains === undefined || JSON.stringify(call.args).includes(expect.contains));
  switch (rule.kind) {
    case "tool": {
      const count = trace.tools.filter(tool => matches(tool, rule)).length;
      return count >= (rule.min ?? (rule.max === 0 ? 0 : 1)) && count <= (rule.max ?? Infinity);
    }
    case "order": {
      const first = trace.tools.findIndex(tool => matches(tool, rule.first));
      return first >= 0 && trace.tools.slice(first + 1).some(tool => matches(tool, rule.then));
    }
    case "answer": return rule.includes.every(term => trace.answer.toLowerCase().includes(term.toLowerCase()));
    case "file": return Object.hasOwn(files, rule.path) === (rule.exists ?? true) &&
      (rule.contains === undefined || files[rule.path]?.includes(rule.contains) === true);
    case "unchanged": return changed.length === 0;
    case "skill": {
      const read = trace.tools.some(tool => tool.name === "read" && tool.error === false && typeof tool.args.path === "string" && (
        tool.args.path.split(":", 2)[0] !== "skill"
          ? tool.args.path.split(":")[0].endsWith(`/skills/${rule.name}/SKILL.md`)
          : /^skill:\/\/([^/:]+)(?:$|:)/.exec(tool.args.path)?.[1] === rule.name
      ));
      return read === rule.invoked;
    }
  }
}

export function experimentalPairs(ids: string[], modes: Mode[], repeats: number) {
  return modes.flatMap((mode, m) => ids.flatMap((id, c) => Array.from({ length: repeats }, (_, r) => ({
    id, mode, repeat: r + 1, pair: `${mode}/${id}/${r + 1}`,
    arms: ((m + c + r) % 2 === 0 ? ["plain", "superpowers"] : ["superpowers", "plain"]) as Arm[],
  }))));
}

function median(numbers: number[]): number | null {
  const sorted = numbers.toSorted((a, b) => a - b);
  if (!sorted.length) return null;
  return (sorted[Math.floor((sorted.length - 1) / 2)] + sorted[Math.floor(sorted.length / 2)]) / 2;
}

export function aggregate(rows: PairRow[]) {
  const results = {} as Record<Mode, { attemptedPairs: number; validPairs: number; plainInvalid: number; superpowersInvalid: number; plainPass: number; superpowersPass: number; medianMsDelta: number | null; medianTokenDelta: number | null }>;
  for (const mode of ["interactive", "unattended"] as const) {
    const grouped = new Map<string, Partial<Record<Arm, PairRow>>>();
    for (const row of rows.filter(row => row.mode === mode)) {
      const pair = grouped.get(row.pair) ?? {};
      if (pair[row.arm]) throw new Error(`Duplicate result for ${row.pair} ${row.arm}`);
      pair[row.arm] = row;
      grouped.set(row.pair, pair);
    }
    const valid = [...grouped.values()].flatMap(pair => pair.plain?.valid && pair.superpowers?.valid ? [[pair.plain, pair.superpowers] as const] : []);
    results[mode] = {
      attemptedPairs: grouped.size,
      validPairs: valid.length,
      plainInvalid: [...grouped.values()].filter(pair => !pair.plain?.valid).length,
      superpowersInvalid: [...grouped.values()].filter(pair => !pair.superpowers?.valid).length,
      plainPass: valid.filter(([plain]) => plain.passed).length,
      superpowersPass: valid.filter(([, plus]) => plus.passed).length,
      medianMsDelta: median(valid.map(([plain, plus]) => plus.ms - plain.ms)),
      medianTokenDelta: median(valid.map(([plain, plus]) => plus.tokens - plain.tokens)),
    };
  }
  return results;
}
