# OMP (Oh My Pi) Tool Mapping

Skills speak in actions ("dispatch a subagent", "create a todo", "read a file"). On OMP (Oh My Pi) these resolve to the tools below.

| Action skills request | OMP equivalent |
|---|---|
| Read a file | `read` |
| Create a new file | `write` |
| Edit a file (targeted patch) | `edit` |
| Run a shell command | `bash` |
| Search file contents | `grep` |
| Find files by name | `glob` |
| Fetch a URL / read a webpage | `read` with a URL path |
| Search the web | `web_search` |
| Dispatch a subagent (`Subagent (general-purpose):` template) | `task` |
| Multiple parallel dispatches | A single `task` call with multiple entries in its batch |
| Task tracking ("create a todo", "mark complete") | `todo` |
| Ask the user a question | `ask` |
| Invoke a skill | `skill://<name>` (read the resource) or the `/skill:<name>` command |

## Subagent dispatch

`task` does not take one prompt at a time: it receives a batch of disjoint tasks in a single call and
runs them concurrently. When a skill's template calls for dispatching several independent subagents
(e.g. parallel reviewers, parallel implementers), issue one `task` call whose batch contains every
independent unit of work rather than issuing `task` repeatedly in sequence. Reserve sequential `task`
calls for genuinely dependent work, where a later task needs the output of an earlier one.

## Coordination and waiting

OMP 19.x has no `hub` tool; coordination uses these primitives:

- A `task` result returns automatically when the dispatched subagent finishes — no result-sending
call is needed on either side.
- To message a live peer (main agent or another dispatched subagent), `write` to `agent://<id>`.
- To block until an outstanding job reports idle or finished, use the `wait` tool.
- To inspect a running or finished job's state, `read` `proc://<id>`.

Where a skill says to "wait for" a dispatched subagent or "check in" on its progress, that resolves
to `wait` and `read proc://<id>`; where it says a subagent should "report back" or "send a message",
that resolves to the automatic `task` result or `write agent://<id>`.

## Invoking a skill

Skills are read before acting on them, not merely referenced. To invoke a superpowers skill on OMP,
read `skill://<name>` (e.g. `skill://brainstorming`) or use the `/skill:<name>` slash command, and read
its full contents before starting the action it describes.

Files shipped inside a skill are read the same way, with the path relative to the skill's root:
`read skill://<skill-name>/<relative-path>` (e.g. `skill://subagent-driven-development/references/fix-loop.md`).
If a `skill://` read fails, the same file resolves on disk under the plugin install, e.g.
`~/.omp/plugins/node_modules/@piyushmor/superpowers-omp/skills/<name>/<relative-path>`.

## Skill and session locations

- Personal skills live at `~/.omp/agent/managed-skills/` and are managed with the `manage_skill` tool
(not `~/.claude/skills/`, which does not exist on OMP).
- Session transcripts live under `~/.omp/agent/sessions/<cwd-slug>/` as
`<ISO-timestamp>_<session-id>.jsonl` (one JSON event per line), with a per-session child directory
holding subagent transcripts. This is the root `diagnosing-superpowers` starts from when locating a
session.
- The brainstorming visual companion launches like the Claude Code default-mode recipe in
`visual-companion.md`: `bash scripts/start-server.sh --project-dir /path/to/project --open` — the
script backgrounds the server itself, so no extra flags are needed on OMP.
