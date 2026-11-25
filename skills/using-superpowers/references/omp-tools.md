# OMP (Oh My Pi) Tool Mapping

Use OMP's native tools for the actions in Superpowers skills:

| Action | OMP tool |
|---|---|
| Load the full skill or a bundled reference | `read skill://<name>` or `read skill://<name>/<relative-path>` |
| Read a file or URL | `read` |
| Create or patch files; run commands | `write`, `edit`, `bash` |
| Find files, text, or web results | `glob`, `grep`, `web_search` |
| Ask the user to decide | `ask` |
| Track approved work | `todo` |
| Dispatch reviewers or workers | `task` |

Batch independent subagents in one `task` call. Their results arrive automatically. Inspect a job with `read proc://<id>`, message a live agent with `write agent://<id>`, and use `wait` for jobs you own when the tool is available.

Before requesting spec or plan approval, load `skill://using-superpowers/references/omp-workflows.md` and run its grilling step. The same guide covers OMP-specific execution, skill authoring, transcripts, worktrees, and the brainstorming companion.
