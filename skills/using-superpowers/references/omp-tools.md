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

`hub` is the coordination primitive between the main agent and dispatched subagents (and between
subagents themselves): it is used to send status and results back, to wait on outstanding work, and to
synchronize before proceeding when a skill's workflow requires confirming a prior step finished. Where
a skill says to "wait for" a dispatched subagent or "check in" on its progress, that resolves to `hub`.

## Invoking a skill

Skills are read before acting on them, not merely referenced. To invoke a superpowers skill on OMP,
read `skill://<name>` (e.g. `skill://brainstorming`) or use the `/skill:<name>` slash command, and read
its full contents before starting the action it describes.
