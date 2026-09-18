# Native OMP Superpowers Adapter Design

**Status:** Approved architecture; implementation pending

## Goal

Publish a standalone OMP plugin that makes the canonical Superpowers skills available in OMP and injects the `using-superpowers` bootstrap at session start and after context compaction.

## Problem

OMP discovers conventional `skills/<name>/SKILL.md` directories contained in enabled plugin packages. Its `resources_discover` extension event is currently not called by `AgentSession`, so an extension cannot dynamically expose the skills from a separately installed upstream checkout. A thin companion plugin would also load upstream's existing Pi bootstrap extension, causing competing bootstrap behavior and Pi-specific tool guidance.

## Decision

The repository is `piyushmor/superpowers-omp`. It ships a pinned, byte-for-byte snapshot of the upstream `obra/superpowers` `skills/` directory at commit `b36e0829c6d0140e93cfef2ca599b1b07d4a7797`, with one additive OMP-only mapping file:

```
skills/using-superpowers/references/omp-tools.md
```

All upstream files remain unmodified. The snapshot is redistributed under upstream's MIT license; this repository carries that license text and records the origin commit in `UPSTREAM.md`.

The OMP extension embeds the OMP tool mapping in the injected bootstrap. It does not alter `skills/using-superpowers/SKILL.md`; therefore the canonical skill stays upstream-compatible while the runtime always receives accurate OMP tool instructions.

## Package layout

```
package.json                         # package metadata and `omp.extensions`
extension.ts                          # native ExtensionAPI factory
skills/                               # upstream snapshot plus OMP mapping
LICENSE                               # upstream MIT license
UPSTREAM.md                           # upstream URL, revision, update procedure
README.md                             # install, verify, update, and remove guidance
tests/extension.test.ts               # Bun unit tests with a minimal fake ExtensionAPI
```

`package.json` uses an `omp.extensions` array containing `./extension.ts`. OMP's `omp-plugins` capability provider discovers the package-root `skills/` directory. The package declares no runtime dependencies. It is installed directly from GitHub:

```bash
omp plugin install github:piyushmor/superpowers-omp
```

The tested OMP release is `18.2.0`; the only documented extension runtime prerequisite is Bun `>=1.3.14`.

## Bootstrap lifecycle

The extension factory accepts OMP's `ExtensionAPI` and registers only four event handlers:

1. `session_start` sets a closure-local `injectBootstrap` flag.
2. `context` returns a replacement `messages` array only when the flag is set, the bootstrap marker is absent, and the bundled source files can be read. It inserts one `role: "user"` text message after all leading `compactionSummary` messages.
3. `session_compact` sets the flag again. On the next context build, this restores the bootstrap after the compaction summary.
4. `agent_end` clears the flag. The existing bootstrap remains in the session context until compaction; this handler prevents an unnecessary new injection on a later context build.

The bootstrap source is cached at module scope. It reads and removes YAML frontmatter from `skills/using-superpowers/SKILL.md`, appends the content of `omp-tools.md`, and wraps both in `<EXTREMELY_IMPORTANT>` tags. The marker is a package-specific literal searched in string and text-block message content. This makes injection idempotent across retrying `context` events.

The extension never performs runtime actions during factory loading, registers no tools or commands, makes no network calls, and writes no session state.

## OMP tool mapping

`omp-tools.md` maps action-level Superpowers language to OMP capabilities:

| Requested action | OMP mechanism |
| --- | --- |
| Invoke a skill | Read `skill://<name>` before acting; users may also run `/skill:<name>`. |
| Read / create / edit a file | `read`, `write`, `edit`. |
| Run a shell command | `bash`. |
| Search content / paths | `grep`, `glob`. |
| Fetch / search web content | `read` with a URL, `web_search`. |
| Dispatch subagents | `task` for batched independent slices; coordinate and wait through `hub`. |
| Track tasks | `todo`. |
| Ask a human partner | `ask`. |

The mapping is action-oriented, so future OMP tool changes have one isolated update site.

## Verification

Bun unit tests create a fake `ExtensionAPI`, register the factory, and execute its handlers. They must prove:

- `package.json` declares the actual extension entry and the plugin root includes the canonical skills directory.
- The factory registers exactly the intended event handlers.
- The first context injection contains the stripped bootstrap and OMP mapping as one user message.
- A second context pass does not inject a duplicate.
- After `session_compact`, injection follows leading `compactionSummary` messages and precedes the user's message.
- After `agent_end`, a context without an existing marker does not inject.

An isolated OMP plugin link operation using a temporary `PI_CODING_AGENT_DIR` validates that OMP accepts the package manifest and imports the extension. The package must not modify the caller's normal OMP plugin registry.

A live clean-session acceptance check is performed only if available credentials support a non-interactive OMP run: submit `Let's make a react todo list` and verify that `brainstorming` is invoked before any implementation action. If unavailable, the PR states that limitation rather than fabricating a transcript.

## Non-goals

- Do not modify `obra/superpowers`, PR #1996, or its existing Pi integration.
- Do not add an npm publication, OMP marketplace listing, custom tools, prompts, commands, rules, hooks, network updates, or automatic upstream synchronization.
- Do not claim compatibility beyond the tested OMP release.

## Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| Upstream skills drift from the snapshot. | `UPSTREAM.md` records the exact source revision and a deliberate manual update procedure. |
| OMP changes lifecycle message shapes. | Unit tests exercise the explicit context insertion contract; README names the tested OMP release. |
| Large bootstrap repeats during one session. | Module cache avoids disk rereads; marker detection guarantees one injected copy between compactions. |
| Plugin loading fails. | OMP validates manifest-declared extension entries at install/link time; the isolated link command exercises that path. |
