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

The extension factory accepts OMP's `ExtensionAPI` and registers five event handlers:

1. `session_start` sets a closure-local `injectBootstrap` flag.
2. `before_agent_start` sets the flag for every new agent run, including a later user prompt in the same session.
3. `context` returns a replacement `messages` array only when the flag is set, the bootstrap marker is absent, and the bundled source files can be read. It inserts one `role: "user"` text message after all leading `compactionSummary` messages. OMP applies this result only to the outbound provider request, not to session history, so the handler leaves the flag set and injects the bootstrap into every otherwise-unmarked provider context during an active run.
4. `session_compact` sets the flag again, ensuring an in-progress run remains armed after its context is summarized.
5. `agent_end` clears the flag only when `event.willContinue !== true`. A scheduled retry, compaction continuation, or queued follow-up leaves it armed because those paths proceed directly to provider context without another `before_agent_start` event.

The bootstrap source is cached at module scope. It reads and removes YAML frontmatter from `skills/using-superpowers/SKILL.md`, appends the content of `omp-tools.md`, and wraps both in `<EXTREMELY_IMPORTANT>` tags. The marker prevents a second copy from being inserted into one outbound context when a prior handler has already supplied it.

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
- The factory registers exactly the intended five event handlers.
- The first outbound context contains the stripped bootstrap and OMP mapping as one user message.
- A fresh, otherwise-unmarked outbound context in the same active run contains exactly one bootstrap; a context already containing the marker receives no second copy.
- After `session_compact`, injection follows leading `compactionSummary` messages and precedes the user's message.
- A terminal `agent_end` prevents injection until `before_agent_start` re-arms it for the next agent run; an `agent_end` with `willContinue: true` leaves the next continuation context armed.

An isolated OMP package-install operation runs with a newly created temporary `HOME` and no inherited XDG roots. It installs the pushed GitHub branch, so OMP imports and validates the manifest-declared extension while writing any plugin registry files only beneath that temporary home. `omp plugin link` is not used for this check because it validates only the link metadata, not extension importability.

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
| Large bootstrap repeats during an agent run. | Module cache avoids disk rereads; each otherwise-unmarked outbound provider context receives exactly one bootstrap, as required by OMP's transient context-transform contract. |
| Plugin loading fails. | OMP's package installer validates manifest-declared extension imports; the isolated Git install exercises that path without touching the normal registry. |
