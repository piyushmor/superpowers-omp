# OMP workflow guide

## Grill specs and plans before approval

Run this once per artifact after drafting and upstream self-review, before asking the user to approve it.

- **Spec:** Challenge the assumption most likely to make the work useless or unsafe. Check the target user, success measure, scope boundaries, and failure or recovery behavior.
- **Plan:** Challenge the step most likely to fail in execution. Check dependency order, whether the proposed verification proves the behavior, and how the riskiest change can be reversed.
- Check the repo and tool contracts first. State the strongest challenge, the evidence behind it, and a recommendation. Use OMP `ask` for one consequential decision at a time, with viable alternatives and their consequences. When the evidence resolves the challenge, record it and present the existing approval gate directly.
- Update the artifact with the resolution before requesting approval. Reopen the grill for a material change that alters the recommendation. In a headless run, surface unresolved decisions and stop at the approval gate.

## Plans and subagents

- Once a plan is approved, mirror its tasks into OMP's `todo` with `init`: one item per plan task, with its verification command when useful. Keep RED/GREEN steps in the tests and ledger. Checkpoint completion in the ledger, then update `todo`. Restore the view from verified ledger entries and Git history after compaction.
- Inline execution uses `task-start` and `task-done` from `executing-plans`. A subagent-driven controller starts the item at dispatch and completes it after verification and review are recorded. A blocked task stays active. Child agents use their brief and only use `todo` if the tool is available to them.
- Honor prewalk when the user has enabled it for the execution session. `--prewalk` can switch models at the first edit/write after a successful todo setup. The execution model also handles later rulings and fixes, so choose one capable of doing that work. Before relying on a reviewer model, account for separate `task.prewalk` and per-agent settings, which can switch it during writes.
- Subagent prewalk can livelock a text deliverable. `task.prewalk` and `task.agentPrewalk` arm every child unconditionally, and `prewalk.enabled: false` does not govern them. While armed, any tool-using turn re-arms a continue latch and the next text-only turn is told "Continue task now; do not end turn here." Only a workspace `edit`/`write` disarms; `agent://` writes, reads and `todo` do not. A reviewer or researcher whose deliverable is text therefore cannot finish: it answers, is nudged, invents tool work, and the controller's `wait` never resolves. Give such delegates an explicit per-call `model` — those spawns skip prewalk — or gate arming with `task.prewalk: false`, `task.agentPrewalk: {task: "off"}` and `task.agentPrewalkAuto: {task: "on"}`, which still hands off implementation slices at their first edit. Diagnose by counting `prewalk-continue` entries in the child transcript, not by the progress indicator.
- If the task needs an isolated workspace, prefer OMP's native worktree interface (`omp worktree add` from a shell). Verify the base and preserve user changes before setup.

## Skills and sessions

- Put user-authored skills in `~/.omp/agent/skills/<name>/SKILL.md` by default, or `.omp/skills/<name>/SKILL.md` for a project. The managed-skills store belongs to Auto-Learn; use its tools only for managed skills where enabled.
- `read skill://<name>/<relative-path>` resolves a bundled reference. If resolution fails, check which copy OMP loaded, then read the file from that skill's installed directory.
- For transcript investigation, use the active profile's session directory. The default is `~/.omp/agent/sessions/`; verify the exact JSONL path and any child transcripts before analyzing them.

## Brainstorming companion

After the user opts in, resolve `scripts/start-server.sh` inside the installed brainstorming skill. Run `bash <absolute-script-path> --project-dir <project> --open` when launching the browser is authorized. Let the script choose its normal background mode.
