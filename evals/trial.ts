import { spawnSync } from "node:child_process";
import { chmodSync, cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, symlinkSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { check, parseEvents, safePath, type Arm, type Check, type Mode, type SkillCase, type Usage, type WorkCase } from "./core.ts";

const root = resolve(import.meta.dir, "..");
// Use native subagents in skill calibration. Work pairs use a single measured model.
const workTools = "read,glob,grep,write,edit,bash,todo";
const constraints = "Work only with the disposable evaluation workspace. Keep changes in it. Use local files and tools only. Do not publish or contact external services. If a human decision is required, end this turn with the exact question.";

export type TrialOptions = { model: string; arm: Arm; mode: Mode; output: string; agentDir: string; dollars: number; seconds: number };
export type TrialResult = {
  case: string; model: string; arm: Arm; mode: Mode; trial: string; ms: number; tokens: number; usage: Usage;
  valid: boolean; passed: boolean; errors: string[]; budgetStop: boolean; gate: 0 | 1 | 2 | null; approvalTurns: number;
  changed: string[]; outOfScope: string[]; checks: { rule: Check; passed: boolean }[]; graderExit: number | null;
};
type Snapshot = Record<string, string>;

function snapshot(path: string): Snapshot {
  const files: Snapshot = Object.create(null);
  function walk(prefix: string) {
    for (const entry of readdirSync(join(path, prefix), { withFileTypes: true })) {
      const relative = join(prefix, entry.name);
      if (relative === ".git" || relative === ".omp/skills") continue;
      if (entry.isDirectory()) walk(relative);
      else if (entry.isFile()) {
        const file = join(path, relative);
        if (lstatSync(file).size > 512 * 1024) files[relative] = "<file too large to inspect>";
        else files[relative] = readFileSync(file, "utf8");
      } else files[relative] = `<unexpected ${entry.isSymbolicLink() ? "symlink" : "file type"}>`;
    }
  }
  walk("");
  return files;
}

function seed(workspace: string, files: Record<string, string>, env: NodeJS.ProcessEnv) {
  for (const [path, text] of Object.entries(files)) {
    if (!safePath(path) || typeof text !== "string") throw new Error(`Unsafe fixture path: ${path}`);
    const file = join(workspace, path);
    mkdirSync(resolve(file, ".."), { recursive: true });
    writeFileSync(file, text);
  }
  const config = ["-c", "user.name=Evaluation", "-c", "user.email=eval@example.invalid", "-c", "core.hooksPath=/dev/null"];
  for (const args of [["init", "-qb", "main"], ["add", "-A"], ["commit", "-qm", "evaluation fixture", "--allow-empty"]]) {
    const result = spawnSync("git", [...config, ...args], { cwd: workspace, env, encoding: "utf8" });
    if (result.status !== 0) throw new Error(`Fixture ${args[0]} failed: ${result.stderr ?? "git unavailable"}`);
  }
}

function replaySlot(text: string): 0 | 1 | 2 | null {
  const normalized = text.slice(-2400).toLowerCase();
  if (!(normalized.includes("?") && /approv|confirm|prefer|should i|would you|spec|plan|proceed|which/.test(normalized))) return null;
  if (/plan.{0,80}(approv|proceed)|approv.{0,80}(implementation|plan)|execute (?:the|this) plan/.test(normalized)) return 2;
  if (/(design|spec).{0,80}(approv|proceed)|approv.{0,80}(design|spec)/.test(normalized)) return 1;
  return 0;
}

const defaultAnswers = [
  "Use the simplest option consistent with the stated requirements and preserve existing behavior outside scope.",
  "I approve the design within the requested scope. Keep the stated success criteria and continue.",
  "I approve implementing the plan within the requested scope. Verify the result locally.",
];

export function runTrial(fixture: SkillCase | WorkCase, options: TrialOptions): TrialResult {
  const trial = realpathSync(mkdtempSync(join(options.output, `${fixture.id}-${options.arm}-${options.mode}-`)));
  chmodSync(trial, 0o700);
  const workspace = join(trial, "workspace");
  const temporary = join(trial, "tmp");
  const sessions = join(trial, "sessions");
  const agentDir = join(trial, "agent");
  const runtime = join(trial, "runtime");
  for (const path of [workspace, temporary, sessions, agentDir, runtime]) mkdirSync(path, { mode: 0o700 });
  for (const name of ["models.yml", "models.json"]) {
    const source = join(options.agentDir, name);
    if (existsSync(source)) cpSync(source, join(agentDir, name), { dereference: true });
  }
  cpSync(join(root, "evals", "observe.ts"), join(runtime, "observe.ts"));
  const settings = { ...process.env, TMPDIR: temporary, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null", GIT_TERMINAL_PROMPT: "0", PI_CODING_AGENT_DIR: agentDir };
  seed(workspace, fixture.files ?? {}, settings);
  if (options.arm === "superpowers") {
    cpSync(join(root, "extension.ts"), join(runtime, "extension.ts"));
    cpSync(join(root, "skills"), join(runtime, "skills"), { recursive: true });
    mkdirSync(join(workspace, ".omp"));
    symlinkSync(join(runtime, "skills"), join(workspace, ".omp", "skills"), "dir");
  }
  const before = snapshot(workspace);
  const launchProfile = join(trial, "launch.sb");
  const gradeProfile = join(trial, "grade.sb");
  if (process.platform !== "darwin") throw new Error("Live runs require the macOS process sandbox.");
  const launchWrite = [workspace, temporary, sessions, agentDir].map(path => `(subpath ${JSON.stringify(path)})`).join(" ");
  const profileHeader = `(version 1)\n(allow default)\n(deny file-write*)\n`;
  const hideResults = `(deny file-read* (subpath ${JSON.stringify(options.output)}))\n(allow file-read* (subpath ${JSON.stringify(trial)}))\n`;
  writeFileSync(launchProfile, `${profileHeader}(allow file-write* ${launchWrite} (literal "/dev/null"))\n${hideResults}(deny file-read* (subpath ${JSON.stringify(root)}) (subpath ${JSON.stringify(options.agentDir)}))\n`);
  writeFileSync(gradeProfile, `${profileHeader}(allow file-write* (subpath ${JSON.stringify(trial)}) (literal "/dev/null"))\n${hideResults}(deny network*)\n(deny file-read* (subpath ${JSON.stringify(agentDir)}) (subpath ${JSON.stringify(options.agentDir)}))\n`);
  const launcher = "/usr/bin/sandbox-exec";
  const boundary = spawnSync(launcher, ["-f", launchProfile, "/bin/sh", "-c",
    'cat "$1" >/dev/null && ! cat "$2" 2>/dev/null && ! cat "$3" 2>/dev/null', "probe",
    join(runtime, "observe.ts"), join(root, "evals", "work-cases.json"), join(options.output, "matrix.json"),
  ], { cwd: workspace, env: settings, encoding: "utf8" });
  if (boundary.status !== 0) throw new Error("Isolation canary could read protected benchmark inputs or could not read the runtime");
  const tools = "grader" in fixture ? workTools : `${workTools},task`;
  const common = ["-p", "--mode=json", "--no-extensions", "--no-rules", "--no-context-files", "--no-lsp", "--no-pty", "--no-prewalk", "--no-title", "--offline", "--wait-async", "--thinking=low", `--tools=${tools}`, `--model=${options.model}`, `--session-dir=${sessions}`, `--append-system-prompt=${constraints}`];
  const observer = ["-e", join(runtime, "observe.ts")];
  const variant = options.arm === "superpowers" ? ["-e", join(runtime, "extension.ts"), ...observer] : ["--no-skills", ...observer];
  const started = Date.now();
  const transcript: string[] = [];
  const errors: string[] = [];
  const answers: string[] = [];
  let prompt = fixture.prompt;
  let gate: 0 | 1 | 2 | null = null;
  let budgetStop = false;
  let spent = 0;
  const work = "grader" in fixture ? fixture : undefined;
  for (let turn = 0; turn < 4; turn++) {
    const seconds = Math.floor(options.seconds - (Date.now() - started) / 1000);
    if (seconds < 1 || spent >= options.dollars) { budgetStop = true; break; }
    const args = [...common, ...variant, ...(turn ? ["--continue"] : []), `--max-time=${seconds}s`, `--max-cost=${options.dollars - spent}`, prompt];
    const proc = spawnSync(launcher, ["-f", launchProfile, "omp", ...args], {
      cwd: workspace, env: settings, encoding: "utf8", timeout: (seconds + 8) * 1000, maxBuffer: 10 * 1024 * 1024,
    });
    const log = proc.stdout ?? "";
    const tail = parseEvents(log);
    transcript.push(log);
    writeFileSync(join(trial, `turn-${turn}.stdout.jsonl`), log);
    writeFileSync(join(trial, `turn-${turn}.stderr`), proc.stderr ?? "");
    spent += tail.usage.cost;
    if (proc.status === 3 || proc.error?.code === "ETIMEDOUT") {
      budgetStop = true;
      if (turn === 0 && (!tail.routes.length || !(proc.stderr ?? "").includes(`SUPERPOWERS_EVAL_BOOTSTRAP_COUNT=${options.arm === "superpowers" ? 1 : 0}`))) errors.push("Budget stopped before treatment was verified");
      break;
    }
    if (proc.status !== 0 || !tail.complete || tail.errors.length) {
      errors.push(`Turn ${turn + 1} invalid (exit=${proc.status}, complete=${tail.complete}, providerErrors=${tail.errors.length})`);
      break;
    }
    const bootstrap = [...(proc.stderr ?? "").matchAll(/^SUPERPOWERS_EVAL_BOOTSTRAP_COUNT=(\d+)$/gm)].map(match => Number(match[1]));
    if (!bootstrap.length || bootstrap.some(count => count !== (options.arm === "superpowers" ? 1 : 0))) {
      errors.push(`Turn ${turn + 1} bootstrap telemetry mismatch (${bootstrap.join(",") || "missing"})`);
      break;
    }
    if (tail.routes.length !== 1 || tail.routes[0] !== options.model) {
      errors.push(`Turn ${turn + 1} used unexpected model routing: ${tail.routes.join(",") || "missing"}`);
      break;
    }
    gate = replaySlot(tail.answer);
    if (options.mode === "unattended" || gate === null || turn === 3) break;
    prompt = work?.answers?.[gate] || defaultAnswers[gate];
    answers.push(prompt);
  }
  const ms = Date.now() - started;
  const trace = parseEvents(transcript.join("\n"));
  if (work && trace.tools.some(call => call.name === "bash" && typeof call.args.command === "string" && /\b(curl|wget|gh)\s|\bgit\s+(clone|fetch|pull|push)\b|https?:\/\//i.test(call.args.command))) {
    errors.push("Work trace attempted a network-oriented shell command");
  }
  const after = snapshot(workspace);
  const changed = [...new Set([...Object.keys(before), ...Object.keys(after)])].filter(path => before[path] !== after[path]).sort();
  const outOfScope = work ? changed.filter(path => !work.allowedChanges.includes(path)) : [];
  const checks = "checks" in fixture ? fixture.checks.map(rule => ({ rule, passed: check(rule, trace, after, changed) })) : [];
  let graderExit: number | null = null;
  if (work && errors.length === 0 && !budgetStop) {
    const clean = join(trial, "grade-workspace");
    const gradeHome = join(trial, "grade-home");
    mkdirSync(clean, { mode: 0o700 });
    mkdirSync(gradeHome, { mode: 0o700 });
    for (const path of new Set([...Object.keys(work.files), ...work.allowedChanges])) {
      const source = join(workspace, path);
      if (!existsSync(source) || !lstatSync(source).isFile() || !realpathSync(source).startsWith(`${workspace}/`)) continue;
      const destination = join(clean, path);
      mkdirSync(resolve(destination, ".."), { recursive: true });
      cpSync(source, destination);
    }
    const grade = spawnSync(launcher, ["-f", gradeProfile, "bun", "test", join(root, work.grader)], {
      cwd: clean, env: { PATH: process.env.PATH, HOME: gradeHome, TMPDIR: gradeHome, EVAL_WORKSPACE: clean }, encoding: "utf8", timeout: 20_000,
    });
    writeFileSync(join(trial, "grader.log"), (grade.stdout ?? "") + (grade.stderr ?? ""));
    graderExit = grade.status;
    if (grade.error || graderExit === null) errors.push("Hidden grader did not produce an exit code");
  }
  const valid = errors.length === 0;
  const passed = valid && !budgetStop && (work ? graderExit === 0 : checks.every(result => result.passed));
  const result = { case: fixture.id, model: options.model, arm: options.arm, mode: options.mode, trial, ms, tokens: trace.usage.total, usage: trace.usage, valid, passed, errors, budgetStop, gate, approvalTurns: answers.length, changed, outOfScope, checks, graderExit };
  writeFileSync(join(trial, "result.json"), JSON.stringify(result, null, 2) + "\n");
  return result;
}

export function validateAgentDir(path: string) {
  const dir = realpathSync(path);
  if (!existsSync(join(dir, "models.yml")) && !existsSync(join(dir, "models.json"))) throw new Error("The dedicated OMP profile needs a model config with environment or token-helper access.");
  const defaultDir = resolve(process.env.HOME ?? "", ".omp/agent");
  if (dir === defaultDir || (existsSync(defaultDir) && dir === realpathSync(defaultDir))) throw new Error("Use a dedicated evaluation profile; the normal OMP agent directory is excluded.");
  return dir;
}
