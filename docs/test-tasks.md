# What the tests cover

The tests answer three different questions: **Did the assistant finish the coding task? Did it follow the right workflow for the request? Did OMP handle the user's approval correctly?** A good result in one group answers only that group's question.

- [Coding tasks](#coding-tasks): seven small JavaScript projects or changes, graded on the finished work.
- [Skill scenarios](#skill-scenarios): 45 short requests across 15 skills, checked for specific actions and outcomes.
- [Approval tests](#approval-tests): six ways a write can be approved, declined, or cancelled.
- [Testing the test runner](#testing-the-test-runner): checks for the adapter and benchmark software itself.

## Coding tasks

Each comparison starts two fresh sessions with the same request, starting files, model, thinking setting, and budget. One uses plain OMP and the other uses the full Superpowers workflow. The assistant gets a small project copied or adapted from a pinned version of a public library. The [work fixtures](../evals/work-cases.json) contain the exact requests, source revisions, starting files, allowed edits, and prepared answers. The [graders](../evals/work-graders/) are kept out of the assistant's workspace during the run.

The original set had six tasks. The compound-duration task was added later to test a change that spans several files and depends on a review handoff.

### Fix equality for sets and maps

`dequal-set-map-duplicates` — The library sometimes treats two collections as equal after matching the same object more than once. Fix comparisons for sets of objects and maps with object keys in `src/index.js`. The grader checks that repeated equal-looking objects cannot match distinct ones, while genuinely equal collections still match regardless of order. Map values, other comparisons, and existing exports should keep working.

### Add a helper that removes duplicate class names

`clsx-unique` — Add `clsxUnique` in `src/index.js`. It takes the same inputs as `clsx`, such as strings, arrays, objects, and numbers. Keep each class name the first time it appears and retain the original order and case. The grader checks repeated names, nested inputs, whitespace within object keys, empty input, and compatibility with the original helper and default export.

### Add a helper that matches text literally

`escape-literal-regexp` — Add `literalRegExp` in `index.js` so text such as `c++` can be searched literally. It should accept regular expression flags and support a whole-word option. The grader checks punctuation at the edges of a match, word characters beside it, flags including Unicode mode, invalid input, and the existing default export.

### Fix a duration that displays as 60 minutes

`ms-format-rollover` — Fix cases in `src/ms.js` where a rounded duration shows `60m` instead of `1h` or `60s` instead of `1m`. The grader checks short and long output, singular and plural unit names, and negative durations. Values away from the boundary, sub-second formatting, and parsing should behave as before.

### Separate command-line logic from printing and exiting

`ms-cli-run-extraction` — Refactor `src/cli.js` so tests can call a new `run(argv)` function directly. It should return an exit code and exact output and error strings, including newlines, without printing or exiting. The grader checks help, inputs and flags, mixed valid and invalid values, and the behavior of the script when run from the command line.

### Write tests that catch real path-handling regressions

`slash-regression-tests` — Write `slash.test.js` for a helper that turns backslashes into forward slashes. Leave `index.js` unchanged. The submitted tests must pass against the original helper and catch four deliberately broken versions: replacing only the first backslash, changing Windows extended-length paths, applying the special-path rule in the wrong place, and collapsing repeated separators.

### Add compound durations across a library and its command line

`ms-compound-durations` — Support strings such as `1h 30m` across parsing, formatting, and the `--compound` command-line flag. The starter includes synthetic team review notes with disagreements and written fallback decisions for absent reviewers. The task is to use those decisions while updating `src/ms.js`, `src/cli.js`, `README.md`, and the tests together.

The grader checks two adjacent units, truncation, sub-second values, negative values and plural names, valid and malformed strings, and formatting followed by parsing. It also checks that the command-line flag works with long output, help and usage use the right output stream, documentation and tests cover the change, and the old behavior still works. The old `60m` output is explicitly out of scope in this fixture; fixing it is a separate task above.

### How coding work is scored

- **Scripted replies:** When the runner recognizes a supported approval or continuation prompt, it sends a prepared reply. OMP resumes in print mode. These runs do not exercise interactive terminal forms.
- **Unattended:** OMP gets the same task without follow-up replies.
- **Correctness:** A completed, valid run passes when its grader passes. The grader works on a clean copy of the relevant files with networking disabled. The runner records extra changed files separately from the grader result.
- **Limits:** The runner records elapsed time, model usage, budget stops, and invalid runs. A time or spend stop means the run did not reach a completed grade. A model or protocol error can invalidate a run.

The published [initial comparisons](https://github.com/piyushmor/superpowers-omp/issues/3) and [follow-up comparisons](https://github.com/piyushmor/superpowers-omp/issues/4) used different task selections and limits. Keep those groups separate when reading the results. The seven fixtures are the full inventory available in the runner. The work comparisons measure the full workflow; they leave the value of an individual skill open.

## Skill scenarios

Each skill has a **clear match**, a **near miss** where a different or simpler workflow fits, and a **fresh example** for checking whether the behavior transfers. The runner calls these `positive`, `near-miss`, and `holdout`. The [skill fixtures](../evals/skill-cases.json) contain the exact prompts and assertions. Checks can look at skills read, tool calls and their order, files written or left unchanged, and evidence in the final answer.

### Choosing a workflow and planning work

| Skill | Clear match | Near miss | Fresh example |
| --- | --- | --- | --- |
| `using-superpowers` | Choose a debugging workflow before acting on a failing test. | Answer a simple multiplication question without unnecessary tools. | Start on a dark-mode idea; use brainstorming and leave the UI alone while a design choice is open. |
| `brainstorming` | Consider CSV export for a very large report with ambiguous locale and memory requirements. Record the open design choice before implementation. | Correct a typo in a report footer. | Save an outline for a short talk and record the unresolved audience-depth choice. |
| `writing-plans` | Turn a spec into a plan, calling out an unresolved decision and leaving implementation untouched. | Make a simple one-line code change. | Write a small-step plan with exact file paths and test commands from an existing spec. |
| `executing-plans` | Follow an existing plan in order, updating code, tests, and documentation. | Write a plan for a health endpoint and leave the application untouched. | Stop at the blocked step in a plan and explain what is missing. |
| `using-git-worktrees` | Isolate a search-filter feature so the main checkout stays clean. | Make an edit in a worktree that already exists. | Set up isolation in a repository with no ignore rules, without starting the feature. |

### Debugging, testing, and checking claims

| Skill | Clear match | Near miss | Fresh example |
| --- | --- | --- | --- |
| `systematic-debugging` | Find the cause of a slug test failure before editing the code. | Add a trivial helper to code that has no reported bug. | Investigate a function that fails on its third call after an earlier attempted fix. |
| `test-driven-development` | Write and run a failing test before implementing an even-number helper. | Bump a version string in a config file. | Reproduce an upper-bound bug in a `clamp` function before fixing it. |
| `verification-before-completion` | Run a specified test command, quote the real summary, and leave files unchanged. | Explain a function without running anything. | Fix an off-by-one bug, keep the test assertion intact, and run the tests before reporting completion. |
| `diagnosing-superpowers` | Read a saved session log to explain a slow run and an ignored plan. | Fix an ordinary failing Python test. | Explain why brainstorming did not run, cite the saved log, and draft a bug report. |

### Working with other agents or reviewers

| Skill | Clear match | Near miss | Fresh example |
| --- | --- | --- | --- |
| `dispatching-parallel-agents` | Investigate three unrelated test failures in parallel. | Generate a database schema before applying it, since the second step needs the first step's output. | Fix three independent documentation typos. |
| `subagent-driven-development` | Use a fresh agent for each plan task and review each result. | Execute the plan inline when there is no subagent tool. | Check fresh agents' work against the plan and record the checks in a log. |
| `requesting-code-review` | Ask for review of discount logic before merging. | Rewrap text in a documentation file. | Get an independent check of cart totals against a spec and save the review result. |
| `receiving-code-review` | Check review suggestions against the code, apply valid ones, and explain any disagreement. | Review code and write findings when no feedback has been received yet. | Apply the clear parts of a review and flag a request that needs clarification. |
| `finishing-a-development-branch` | Present integration options for a tested branch and record a recommendation. | Fix failing tests before considering integration. | Explain how to finish a local branch with no remote and describe cleanup without doing it. |
| `writing-skills` | Create a log-triage skill with valid metadata and a description that says when to use it. | Add a regular Python function. | Rewrite a skill description that makes the assistant skip reading the skill. |

A model earns a validated result for a skill only when it passes the clear match, the near miss, and all configured repeats of the fresh example. These checks measure whether the assistant followed a skill and handled the request. They do not measure whether adding the skill improves the outcome on a real project.

## Approval tests

[`approval-smoke.py`](../evals/approval-smoke.py) starts real OMP in RPC UI mode with a local stand-in for a model. OMP gets a request to write a payload to a file. The test sends each reply below through OMP's UI protocol and checks what happened in the isolated workspace.

| Prompt | Approve | Decline | Cancel |
| --- | --- | --- | --- |
| OMP's permission prompt for the write tool | The tool writes the payload. | The tool is blocked and the original file stays intact. | The tool is blocked and the original file stays intact. |
| OMP's Ask form before a write | The approval reaches the model stand-in, which requests the write. | The decline reaches the model stand-in and the original file stays intact. | OMP ends the turn without another model request and the original file stays intact. |

This is a check of OMP's native UI protocol. It covers neither physical terminal key presses nor a live model's judgment about when to ask. It runs without a model provider or API bill.

## Testing the test runner

The repository also has ordinary automated tests for the equipment behind the benchmarks. They cover [when the adapter loads its instructions](../tests/extension.test.ts), [reading and scoring events, usage, and paired results](../tests/evals.test.ts), [passing through the requested thinking setting](../tests/eval-thinking.test.ts), and [checking that the verification fixtures run real tests](../tests/eval-verification-fixtures.test.ts). These checks can pass even when a model fails a benchmark task.

From a source checkout, `bun test` runs the repository suite, `bun run eval:check` validates the fixture inventory, and `python3 evals/approval-smoke.py` checks the six approval outcomes. See [Evals in the README](../README.md#evals) for how to preview or run model comparisons.
