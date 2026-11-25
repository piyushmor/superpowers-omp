import { existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { aggregate, experimentalPairs, safePath, thinkingLevels, type Mode, type PairRow, type SkillCase, type WorkCase } from "./core.ts";
import { runTrial, validateAgentDir, type TrialOptions, type TrialResult } from "./trial.ts";

const repo = resolve(import.meta.dir, "..");
const skills = JSON.parse(readFileSync(join(import.meta.dir, "skill-cases.json"), "utf8")) as SkillCase[];
const work = JSON.parse(readFileSync(join(import.meta.dir, "work-cases.json"), "utf8")) as WorkCase[];
const kinds = ["positive", "near-miss", "holdout"] as const;

function validate() {
  const shipped = readdirSync(join(repo, "skills")).filter(name => existsSync(join(repo, "skills", name, "SKILL.md"))).sort();
  const ids = new Set<string>();
  for (const fixture of [...skills, ...work]) {
    if (!/^[a-z][a-z0-9-]+$/.test(fixture.id) || ids.has(fixture.id) || !fixture.prompt?.trim()) throw new Error(`Invalid or duplicate fixture id: ${fixture.id}`);
    ids.add(fixture.id);
    for (const [path, contents] of Object.entries(fixture.files ?? {})) {
      if (!safePath(path) || typeof contents !== "string") throw new Error(`Invalid file in ${fixture.id}: ${path}`);
    }
  }
  for (const name of shipped) for (const kind of kinds) {
    if (skills.filter(fixture => fixture.skill === name && fixture.kind === kind).length !== 1) throw new Error(`${name} must have exactly one ${kind} case`);
  }
  for (const fixture of skills) {
    if (!shipped.includes(fixture.skill) || !kinds.includes(fixture.kind) || !fixture.checks.length || fixture.checks.some(rule => !["tool", "order", "answer", "file", "unchanged", "skill"].includes(rule.kind))) throw new Error(`Invalid skill fixture ${fixture.id}`);
    if (fixture.kind !== "near-miss" && !fixture.checks.some(rule => rule.kind !== "skill")) throw new Error(`Missing behavior check: ${fixture.id}`);
  }
  for (const fixture of work) {
    if (!fixture.source.url.startsWith("https://github.com/") || !/^[0-9a-f]{40}$/.test(fixture.source.commit) || !fixture.allowedChanges.every(safePath) || !fixture.grader.startsWith("evals/work-graders/") || !safePath(fixture.grader) || !existsSync(join(repo, fixture.grader))) throw new Error(`Invalid work fixture: ${fixture.id}`);
  }
  return shipped;
}

const command = Bun.argv[2] ?? "check";
if (command === "_trial") {
  const run = JSON.parse(Bun.argv[3]) as { id: string; options: TrialOptions };
  const fixture = [...skills, ...work].find(fixture => fixture.id === run.id);
  if (!fixture) throw new Error(`Unknown fixture: ${run.id}`);
  console.log(JSON.stringify(runTrial(fixture, run.options)));
  process.exit(0);
}

const { values } = parseArgs({ args: Bun.argv.slice(3), options: {
  run: { type: "boolean", default: false },
  models: { type: "string" },
  thinking: { type: "string", default: "low" },
  modes: { type: "string", default: "interactive,unattended" },
  case: { type: "string" },
  repeats: { type: "string", default: "3" },
  jobs: { type: "string", default: "2" },
  "agent-dir": { type: "string" },
  output: { type: "string" },
  seconds: { type: "string", default: "100" },
  dollars: { type: "string", default: "0.08" },
}, strict: true });

const shipped = validate();
if (command === "check") {
  console.log(JSON.stringify({ shippedSkills: shipped.length, skillCases: skills.length, workCases: work.length }, null, 2));
  process.exit(0);
}
if (command !== "skills" && command !== "work") throw new Error("Usage: bun evals/runner.ts check|skills|work [--thinking <level> --run --models <exact selectors> --agent-dir <dedicated profile> --output <fresh dir>]");
const repeats = Number(values.repeats);
const jobs = Number(values.jobs);
const seconds = Number(values.seconds);
const dollars = Number(values.dollars);
if (!Number.isInteger(repeats) || repeats < 1 || repeats > 20 || !Number.isInteger(jobs) || jobs < 1 || jobs > 8 || !Number.isFinite(seconds) || seconds < 5 || !Number.isFinite(dollars) || dollars <= 0) throw new Error("Invalid run limits");
const modes = [...new Set(values.modes.split(","))] as Mode[];
if (!modes.length || !modes.every(mode => mode === "interactive" || mode === "unattended")) throw new Error("Invalid work modes");
const models = [...new Set((values.models ?? "").split(",").filter(Boolean))];
if (models.some(model => !/^[a-z0-9-]+\/[a-z0-9_.:/-]+$/i.test(model))) throw new Error("Use exact provider/model selectors");
const thinking = thinkingLevels.find(level => level === values.thinking);
if (!thinking) throw new Error(`Unknown thinking level: ${values.thinking}. Use ${thinkingLevels.join(", ")}.`);
const selected = (command === "skills" ? shipped : work.map(fixture => fixture.id)).filter(id => !values.case || id === values.case);
if (!selected.length) throw new Error(`No cases matched: ${values.case}`);
const pairs = command === "work" ? experimentalPairs(selected, modes, repeats) : [];
const countCap = command === "work" ? pairs.length * 2 : selected.length * Math.max(1, models.length) * (2 + repeats);
const metadata = { command, cases: selected, modes, models, thinking, repeats, jobs, seconds, dollars, maxSessions: countCap, nominalCostCeiling: countCap * dollars };
console.log(JSON.stringify(metadata, null, 2));
if (!values.run) process.exit(0);
if (!models.length || !values["agent-dir"] || !values.output || (command === "work" && models.length !== 1)) throw new Error("Live runs require exact --models, --agent-dir, and fresh --output. Work pairs use one model per run.");
const agentDir = validateAgentDir(values["agent-dir"]);
const env = { ...process.env, PI_CODING_AGENT_DIR: agentDir };
const version = Bun.spawnSync(["omp", "--version"], { env }).stdout.toString().trim();
const commit = Bun.spawnSync(["git", "rev-parse", "HEAD"], { cwd: repo }).stdout.toString().trim();
for (const provider of new Set(models.map(model => model.split("/", 1)[0]))) {
  const result = Bun.spawnSync(["omp", "models", provider, "--kind", "all", "--json"], { env });
  const catalog = result.exitCode === 0 ? JSON.parse(result.stdout.toString()).models as Array<{ selector: string; thinking?: string[] }> : [];
  for (const model of models.filter(model => model.startsWith(`${provider}/`))) {
    const entry = catalog.find(entry => entry.selector === model);
    if (!entry) throw new Error(`The dedicated profile cannot resolve ${model}`);
    if (thinking !== "off" && !entry.thinking?.includes(thinking)) throw new Error(`${model} does not advertise ${thinking} thinking`);
  }
}
const output = resolve(values.output);
mkdirSync(output, { mode: 0o700 });
const actualOutput = realpathSync(output);
writeFileSync(join(actualOutput, "matrix.json"), JSON.stringify({ ...metadata, version, adapterCommit: commit, startedAt: new Date().toISOString() }, null, 2) + "\n");

let quotaStop = false;

async function trial(id: string, model: string, arm: "plain" | "superpowers", mode: Mode) {
  const job = Bun.spawn([process.execPath, import.meta.path, "_trial", JSON.stringify({ id, options: { model, thinking, arm, mode, output: actualOutput, agentDir, dollars, seconds } })], { stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, code] = await Promise.all([new Response(job.stdout).text(), new Response(job.stderr).text(), job.exited]);
  if (code !== 0) throw new Error(`Trial ${id} failed to start: ${stderr.split("\n").slice(0, 4).join("\n")}`);
  const result = JSON.parse(stdout) as TrialResult;
  if (result.hardQuota && !quotaStop) {
    quotaStop = true;
    console.error("Provider hard cap reached. Active trials can finish; pending trials will remain unstarted.");
  }
  return result;
}

async function parallelQueue<T>(items: T[], action: (item: T) => Promise<void>) {
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(items.length, jobs) }, async () => {
    while (!quotaStop && next < items.length) {
      const item = items[next++];
      try { await action(item); } catch (error) {
        console.error(String(error));
        process.exitCode = 1;
      }
    }
  }));
}

if (command === "work") {
  const rows: Array<PairRow & TrialResult> = [];
  await parallelQueue(pairs, async pair => {
    for (const arm of pair.arms) {
      if (quotaStop) break;
      const result = await trial(pair.id, models[0], arm, pair.mode);
      rows.push({ ...result, pair: pair.pair });
    }
    console.error(`Pair finished: ${pair.pair}`);
    writeFileSync(join(actualOutput, "work-results.json"), JSON.stringify({ rows, summary: aggregate(rows) }, null, 2) + "\n");
  });
  console.log(JSON.stringify(aggregate(rows), null, 2));
} else {
  const floors: Record<string, { lowestValidated: string | null; attempts: Array<{ model: string; runs: TrialResult[] }> }> = {};
  await parallelQueue(selected, async name => {
    const cases = skills.filter(fixture => fixture.skill === name);
    const row: (typeof floors)[string] = { lowestValidated: null, attempts: [] };
    for (const [tier, model] of models.entries()) {
      if (quotaStop) break;
      const runs: TrialResult[] = [];
      row.attempts.push({ model, runs });
      for (const kind of ["positive", "near-miss"] as const) {
        if (quotaStop) break;
        const fixture = cases.find(candidate => candidate.kind === kind)!;
        const result = await trial(fixture.id, model, "superpowers", "unattended");
        runs.push(result);
        if (tier > 0 && (!result.valid || !result.passed)) break;
      }
      const calibrated = runs.length === 2 && runs.every(run => run.valid && run.passed);
      if (tier > 0 && !calibrated) continue;
      const holdout = cases.find(candidate => candidate.kind === "holdout")!;
      for (let repeat = 0; repeat < (calibrated ? repeats : 1); repeat++) {
        if (quotaStop) break;
        const result = await trial(holdout.id, model, "superpowers", "unattended");
        runs.push(result);
        if (!result.valid || !result.passed) break;
      }
      if (runs.length === 2 + repeats && runs.every(run => run.valid && run.passed)) { row.lowestValidated = model; break; }
    }
    floors[name] = row;
    console.error(`Skill finished: ${name} — ${row.lowestValidated ?? "unverified"}`);
    writeFileSync(join(actualOutput, "skill-results.json"), JSON.stringify(floors, null, 2) + "\n");
  });
  console.log(JSON.stringify(Object.fromEntries(Object.entries(floors).map(([name, row]) => [name, row.lowestValidated])), null, 2));
}
