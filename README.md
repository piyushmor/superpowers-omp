# @piyushmor/superpowers-omp

Native OMP adapter for the [Superpowers](https://github.com/obra/superpowers) skill library.

## Install

```bash
omp plugin install github:piyushmor/superpowers-omp
```

## Verify and troubleshoot

These checks need no model call:

```bash
omp plugin list --json
omp read skill://using-superpowers/references/omp-tools.md
```

The first command lists `@piyushmor/superpowers-omp` as enabled. The second
reports the file path OMP resolved. If it points to another Superpowers copy,
check your user and project skills and disable the duplicate you do not want.
Start a new OMP session after changing the installation.

From a source checkout, run `bun test` to verify bootstrap injection and packaging.

## Usage guide

Superpowers adds skill guidance and workflows to the model you select in OMP.
Loading a skill leaves the active model unchanged. To pin a model and effort,
set `MODEL` to an exact selector configured in OMP and choose a supported
thinking level:

```bash
omp --model "$MODEL" --thinking xhigh
```

For a routine, well-scoped change, start with plain OMP. Invoke a specific skill
when you want targeted guidance. Use a broader Superpowers workflow when a task
benefits from resolving requirements, planning several changes, or reviewing an
approval boundary. Try it on a representative task before making it your default.

### What we measured

Each cell shows hidden-test passes over comparable pairs, **plain OMP → with
Superpowers**. Both sessions in each pair used the same model, route, effort,
task snapshot, and limits. Approval replay used scripted answers in print mode.

| Model | Thinking | Approval replay | Unattended |
| --- | --- | --- | --- |
| GPT-6 Luna | `low` | 14/16 → 10/16 | 8/11 → 2/11 |
| GPT-6 Luna | `xhigh` | 2/3 → 0/3 | 5/9 → 0/9 |
| GPT-6.1 Terra | `xhigh` | 1/2 → 0/2 | 1/8 → 0/8 |

The [Luna `low` cohort](https://github.com/piyushmor/superpowers-omp/issues/3)
used six small tasks. With Superpowers, median elapsed time increased by 11.2 s
in replay and 5.3 s unattended. Across those comparable pairs, the estimated
cost with Superpowers was about 1.9 times the plain OMP cost. The separate
[Luna and Terra `xhigh` cohort](https://github.com/piyushmor/superpowers-omp/issues/4)
rechecked selected tasks and added a multi-file case. Time and spend limits
affected both arms. The small samples and different task mixes limit comparisons
across models and thinking levels. GPT-6.2 Sol has no paired work results here.

### What skill results tell you

A skill floor is the lowest tested model that passed a skill's checks at the
given effort.

Luna passed the calibration for `brainstorming` at `low` and for
`verification-before-completion` at `xhigh`. Each result covers one positive case,
one near miss, and three held-out repetitions. Fourteen `xhigh` skill floors
remain unverified. All 12 Terra trials in the final skill retry batch reached a
time or spend limit, so that batch has no completed Terra skill verdicts.

For your own comparison, start with the model you already use and follow
[Evals](#evals). Keep model, route, thinking level, and budget fixed within each
pair. Judge task outcomes and rework alongside elapsed time and estimated cost.

## Remove

```bash
omp plugin uninstall @piyushmor/superpowers-omp
```

## Compatibility

The current adapter targets OMP 19.x with Superpowers v7.0.2. Installation and
nested skill reads were verified on OMP 19.2.0. OMP's `prewalk` model switching
is optional; enable it only for execution sessions where you want a handoff.

## Trust boundary

`omp plugin install` executes this package's in-process extension code with the same
privileges as the OMP session that installs it. Only install this adapter from a source
you trust, the same way you would trust any other code you run inside your OMP session.

## Revision provenance

This package ships a pinned upstream snapshot of the Superpowers skill library. The exact
upstream revision vendored into this package is recorded in `UPSTREAM.md`.

## Updating

Install a reviewed adapter commit to get its pinned skill snapshot:

```bash
omp plugin install 'github:piyushmor/superpowers-omp#<adapter-commit>'
```

Replace `<adapter-commit>` with the Git commit SHA. Start a fresh OMP session
and run the verification commands above after updating. [UPSTREAM.md](UPSTREAM.md)
records the exact Superpowers revision shipped by the adapter.

## Evals

From a source checkout, validate coverage without a model call:

```bash
bun run eval:check
bun run eval work --models "$MODEL" --thinking xhigh --repeats 3
```

The second command previews the run matrix and per-session budget. Set `MODEL`
to an exact current OMP selector. A live run needs macOS and a dedicated OMP
model configuration using environment or token-helper access. Each trial gets a
fresh profile without saved auth or memory state. Use trusted public fixtures:
the agent needs provider access, and the hidden grader runs without networking.

Use `--thinking` to set and record the fixed effort for the run. The default is
`low` to reproduce earlier evals. A live run checks that every selected model
advertises the requested level; use `off` for a model without thinking support.

```bash
bun run eval skills --models "$CHEAP,$MID,$STRONG" --run --agent-dir "$PROFILE" --output /tmp/omp-skill-eval
bun run eval work --models "$MODEL" --thinking xhigh --run --agent-dir "$PROFILE" --output /tmp/omp-work-eval
```

Pass skill models in ascending cost order. A candidate must pass the positive
and near-miss cases and all held-out repetitions to earn a floor. Work runs
alternate with/without Superpowers using one measured model and report scripted
interactive replay and unattended stops separately. Replay uses OMP print mode
and native continuation. Terminal `ask` forms are outside this benchmark. Keep
per-run transcripts local.

Run `python3 evals/approval-smoke.py` for a provider-free check of OMP's native
RPC UI write-permission and Ask-form responses. The smoke uses a loopback model
and exercises approval, decline, and cancellation in isolated workspaces.
