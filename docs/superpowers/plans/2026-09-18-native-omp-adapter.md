# Native OMP Superpowers Adapter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish a Git-installable OMP plugin that natively discovers Superpowers skills and injects the `using-superpowers` bootstrap for every active provider request.

**Architecture:** The package contains a pinned, unmodified snapshot of the upstream `skills/` directory, which OMP discovers conventionally from an enabled plugin root. `extension.ts` supplies the OMP-only bootstrap lifecycle: it injects one cached user message per unmarked outbound provider context while an agent run is active, preserves the state through scheduled continuations, and appends the OMP tool mapping. Tests run under Bun with a minimal fake `ExtensionAPI`; an isolated Git install proves OMP imports the manifest entry without modifying the normal plugin root.

**Tech Stack:** TypeScript ESM, Bun built-in test runner, OMP 18.2.0 plugin installer, GitHub git source installation.

**Spec:** `docs/superpowers/specs/2026-09-18-native-omp-adapter-design.md`

## Global Constraints

- The package name is `@piyushmor/superpowers-omp`, version `0.1.0`, and the manifest must contain `omp.extensions: ["./extension.ts"]`.
- Vendor `skills/` from `https://github.com/obra/superpowers.git` commit `b36e0829c6d0140e93cfef2ca599b1b07d4a7797`; do not modify any copied upstream file.
- Add only `skills/using-superpowers/references/omp-tools.md` to the snapshot and append it at bootstrap runtime; do not edit upstream `SKILL.md`.
- Carry the upstream MIT license text and record source URL, commit, and update procedure in `UPSTREAM.md`.
- Runtime has no dependencies and performs no network, filesystem writes, tool registration, or command registration.
- Use `session_start`, `before_agent_start`, `context`, `session_compact`, and `agent_end` only. Preserve bootstrap state when `agent_end.willContinue === true`.
- Test with Bun. Treat OMP `context` transformations as per-provider-request and non-persistent.
- Test the installer only with a new temporary `HOME` and empty XDG roots; never write to the normal OMP registry.
- Do not publish to npm or an OMP marketplace. The supported installation command is `omp plugin install github:piyushmor/superpowers-omp`.

---

### Task 1: Package the Canonical Skill Snapshot

**Files:**
- Create: `package.json`
- Create: `LICENSE`
- Create: `UPSTREAM.md`
- Create: `skills/**` from the pinned upstream revision
- Create: `skills/using-superpowers/references/omp-tools.md`

**Interfaces:**
- Consumes: `obra/superpowers` commit `b36e0829c6d0140e93cfef2ca599b1b07d4a7797`.
- Produces: the OMP plugin root; `extension.ts` consumes `skills/using-superpowers/SKILL.md` and `skills/using-superpowers/references/omp-tools.md` by paths relative to itself.

- [ ] **Step 1: Create and isolate the implementation branch**

```bash
git push --set-upstream origin master
git worktree add /tmp/superpowers-omp-native -b add-native-omp-adapter master
cd /tmp/superpowers-omp-native
```

Perform every remaining task from `/tmp/superpowers-omp-native`. The pushed `master` branch contains the reviewed spec and implementation plan; the pull request will contain only implementation work.

- [ ] **Step 2: Materialize only the upstream `skills/` tree at the pinned revision**

```bash
git clone --filter=blob:none --no-checkout https://github.com/obra/superpowers.git /tmp/superpowers-upstream
git -C /tmp/superpowers-upstream checkout b36e0829c6d0140e93cfef2ca599b1b07d4a7797
git -C /tmp/superpowers-upstream archive --format=tar HEAD skills LICENSE | tar -xf - -C .
```

Do not copy any upstream root files other than `LICENSE`; do not change a file beneath the extracted `skills/` directory.

- [ ] **Step 3: Create the package manifest and provenance files**

```json
{
  "name": "@piyushmor/superpowers-omp",
  "version": "0.1.0",
  "description": "Native OMP adapter for the Superpowers skill library",
  "type": "module",
  "license": "MIT",
  "keywords": ["omp", "oh-my-pi", "superpowers", "skills"],
  "omp": { "extensions": ["./extension.ts"] },
  "scripts": { "test": "bun test" }
}
```

`UPSTREAM.md` must name the upstream repository URL, the full revision above, explain that all copied files under `skills/` are unchanged, state that `omp-tools.md` is an additive adapter file, and give the exact three source-export commands from Step 1 as the manual update procedure. Copy upstream `LICENSE` verbatim.

- [ ] **Step 4: Add the OMP tool mapping**

Write `skills/using-superpowers/references/omp-tools.md` as an action-to-tool mapping. It must name: `read`, `write`, `edit`, `bash`, `grep`, `glob`, `read` with a URL, `web_search`, `task`, `hub`, `todo`, `ask`, and `skill://<name>` / `/skill:<name>`. Explain that `task` receives a batch of disjoint tasks, that `hub` handles coordination and waits, and that skills are read before action.

- [ ] **Step 5: Verify the snapshot boundary and manifest**

Run:

```bash
test -f skills/using-superpowers/SKILL.md
test -f skills/using-superpowers/references/omp-tools.md
bun -e 'const p = await Bun.file("package.json").json(); if (JSON.stringify(p.omp?.extensions) !== JSON.stringify(["./extension.ts"])) process.exit(1)'
diff -ru --exclude=omp-tools.md /tmp/superpowers-upstream/skills skills
```

Expected: every command exits `0`; excluding the additive mapping leaves the vendored tree byte-for-byte identical to upstream.

- [ ] **Step 6: Remove the temporary upstream checkout**

```bash
rm -rf /tmp/superpowers-upstream
```

- [ ] **Step 7: Commit**

```bash
git add package.json LICENSE UPSTREAM.md skills
git commit -m "feat: package Superpowers skills for OMP"
```

### Task 2: Implement the Bootstrap Extension Test-First

**Files:**
- Create: `tests/extension.test.ts`
- Create: `extension.ts`

**Interfaces:**
- Consumes: `package.json#omp.extensions`, `skills/using-superpowers/SKILL.md`, and `skills/using-superpowers/references/omp-tools.md`.
- Produces: default export `superpowersOmpExtension(pi: ExtensionAPI): void`, which registers five OMP lifecycle handlers.

- [ ] **Step 1: Write failing lifecycle tests**

Implement a `FakeExtensionAPI` in `tests/extension.test.ts` that records calls to `on(event, handler)`. Import the default factory from `../extension.ts`, call it with the fake, then invoke recorded handlers directly. The complete critical test cases are:

```ts
test("injects exactly one bootstrap into each fresh provider context while active", async () => {
  const handlers = registerExtension();
  await handlers.session_start({});
  const first = await handlers.context({ messages: [{ role: "user", content: "first" }] });
  const second = await handlers.context({ messages: [{ role: "user", content: "second" }] });

  expect(first.messages).toHaveLength(2);
  expect(second.messages).toHaveLength(2);
  expect(text(first.messages[0])).toContain("superpowers:using-superpowers bootstrap for omp");
  expect(text(first.messages[0])).toContain("# OMP Tool Mapping");
});

test("retains bootstrap injection for an OMP scheduled continuation", async () => {
  const handlers = registerExtension();
  await handlers.session_start({});
  await handlers.agent_end({ willContinue: true });
  const result = await handlers.context({ messages: [{ role: "user", content: "continue" }] });
  expect(result.messages).toHaveLength(2);
});
```

Also test: registration contains exactly `session_start`, `before_agent_start`, `context`, `session_compact`, and `agent_end`; an existing marker prevents another insertion; leading `compactionSummary` remains first after reinjection; terminal `agent_end` disables injection; `before_agent_start` re-arms it.

- [ ] **Step 2: Run the test to verify it fails for the missing extension**

Run: `bun test tests/extension.test.ts`

Expected: FAIL because `../extension.ts` does not exist.

- [ ] **Step 3: Write the minimal extension implementation**

`extension.ts` must use only Node built-ins at runtime and erase the OMP type import:

```ts
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";

const BOOTSTRAP_MARKER = "superpowers:using-superpowers bootstrap for omp";
const root = dirname(fileURLToPath(import.meta.url));
const bootstrapSkillPath = resolve(root, "skills/using-superpowers/SKILL.md");
const mappingPath = resolve(root, "skills/using-superpowers/references/omp-tools.md");
let cachedBootstrap: string | null | undefined;

export default function superpowersOmpExtension(pi: ExtensionAPI): void {
  let injectBootstrap = true;
  pi.on("session_start", async () => { injectBootstrap = true; });
  pi.on("before_agent_start", async () => { injectBootstrap = true; });
  pi.on("session_compact", async () => { injectBootstrap = true; });
  pi.on("agent_end", async event => { injectBootstrap = event.willContinue === true; });
  pi.on("context", async event => {
    if (!injectBootstrap || event.messages.some(messageContainsBootstrap)) return;
    const bootstrap = getBootstrapContent();
    if (!bootstrap) return;
    const insertAt = firstNonCompactionSummaryIndex(event.messages);
    return { messages: [...event.messages.slice(0, insertAt), bootstrapMessage(bootstrap), ...event.messages.slice(insertAt)] };
  });
}
```

`getBootstrapContent()` must synchronously read both source files once; strip only leading YAML frontmatter from `SKILL.md`; wrap the result in `<EXTREMELY_IMPORTANT>` and `</EXTREMELY_IMPORTANT>`; include the marker and an explicit sentence saying the bootstrap is already loaded for the OMP session; return `null` on read failure. `messageContainsBootstrap()` must inspect string content and text blocks. `bootstrapMessage()` returns `{ role: "user", content: [{ type: "text", text }], timestamp: Date.now() }`. `firstNonCompactionSummaryIndex()` advances only across leading messages whose role is exactly `compactionSummary`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun test tests/extension.test.ts`

Expected: PASS with all lifecycle behaviors described in Step 1.

- [ ] **Step 5: Commit**

```bash
git add extension.ts tests/extension.test.ts
git commit -m "feat: bootstrap Superpowers in OMP sessions"
```

### Task 3: Document Installation and Maintenance

**Files:**
- Create: `README.md`

**Interfaces:**
- Consumes: the package name, installer behavior, OMP version, and upstream revision defined by Tasks 1–2.
- Produces: exact safe installation, verification, update, and removal commands for maintainers and users.

- [ ] **Step 1: Write README usage documentation**

Include these exact sections and commands:

```markdown
## Install

```bash
omp plugin install github:piyushmor/superpowers-omp
```

## Verify

```bash
omp plugin list --json
```

Start a clean OMP session and send:

> Let's make a react todo list

`brainstorming` must be read before code or implementation actions.

## Remove

```bash
omp plugin uninstall @piyushmor/superpowers-omp
```
```

State that the adapter was tested with OMP `18.2.0`, that `omp plugin install` executes trusted in-process extension code, that it ships a pinned upstream snapshot whose revision is in `UPSTREAM.md`, and that users update via a pinned `github:piyushmor/superpowers-omp#<commit>` or a fresh install after a new release. Do not promise npm or marketplace support.

- [ ] **Step 2: Validate documentation commands against the package contract**

Run:

```bash
bun -e 'const p = await Bun.file("package.json").json(); if (p.name !== "@piyushmor/superpowers-omp") process.exit(1)'
test -f README.md && test -f UPSTREAM.md && test -f LICENSE
```

Expected: exit `0`.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: document OMP Superpowers adapter"
```

### Task 4: Perform Isolated Installer and Session Verification

**Files:**
- Test: `package.json`, `extension.ts`, `skills/`, `README.md`

**Interfaces:**
- Consumes: the pushed branch named `add-native-omp-adapter` in `piyushmor/superpowers-omp`.
- Produces: evidence that OMP can Git-install and import the extension from an isolated registry, plus a truthful record of whether an LLM-backed acceptance session ran.

- [ ] **Step 1: Push the implementation branch**

```bash
git push --set-upstream origin add-native-omp-adapter
```

- [ ] **Step 2: Run the unit tests**

Run: `bun test`

Expected: PASS.

- [ ] **Step 3: Validate OMP installer import in a disposable home**

```bash
TEMP_HOME="$(mktemp -d)"
env -i HOME="$TEMP_HOME" PATH="$PATH" LANG="${LANG:-C}" omp plugin install github:piyushmor/superpowers-omp#add-native-omp-adapter
test -f "$TEMP_HOME/.omp/plugins/omp-plugins.lock.json"
test -f "$TEMP_HOME/.omp/plugins/node_modules/@piyushmor/superpowers-omp/package.json"
```

Expected: installation succeeds; OMP imports the extension during installer validation; manifest and lock state exist under `$TEMP_HOME/.omp/plugins`; no normal `~/.omp` registry file changes.

- [ ] **Step 4: Attempt the clean-session acceptance scenario only with reachable credentials**

Run a fresh OMP session from the temporary home with the exact prompt `Let's make a react todo list`. Inspect the transcript for the `brainstorming` skill read before an implementation tool call. If the temporary home cannot authenticate a model without copying credentials, do not copy credentials and do not claim this acceptance check ran; record the exact unavailable prerequisite in the PR description.

- [ ] **Step 5: Remove the temporary home**

```bash
rm -rf "$TEMP_HOME"
```

- [ ] **Step 6: Commit any verification-only documentation correction, then open the pull request**

Use `gh pr create --base master --head add-native-omp-adapter` with a body that includes: the issue #1941 / PR #1996 non-duplication rationale, upstream revision, unit test output, isolated installer output, clean-session acceptance result or the exact credential limitation, and authoring environment (`zllm/gpt-5.6-terra`, OMP `18.2.0`, loaded Superpowers skills). Do not leave any PR-template field blank.

- [ ] **Step 7: Remove the implementation worktree after the pull request opens**

```bash
cd /tmp/superpowers-omp
git worktree remove /tmp/superpowers-omp-native
```
