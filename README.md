# @piyushmor/superpowers-omp

[Oh My Pi (OMP)](https://github.com/can1357/oh-my-pi) is an AI assistant you
run in a terminal. This add-on brings [Superpowers](https://github.com/obra/superpowers)
to OMP. It gives the assistant steps to follow when you’re planning a change,
trying to find a bug, or checking its work.

## Install

If you’re new to OMP, [set it up first](https://github.com/can1357/oh-my-pi).
Then run this command in your terminal:

```bash
omp plugin install github:piyushmor/superpowers-omp
```

## Usage guide

Open a terminal in the folder you want help with and type `omp` to start a new
session. Describe what you want in your own words. For example:

**Get to know a project**

> I’m new to this project. Which files should I look at first? Explain what they
> do, and leave the files unchanged.

**Think through an idea**

> Use the brainstorming skill. I’m making a sign-up page for a club. Help me
> decide what it should ask for before we build anything.

**Look into a bug**

> Clicking Save once creates two copies. Help me figure out why. Show me what
> you’d change before editing any files.

A *skill* is a set of instructions the assistant can follow. You can ask for one
by name, like `brainstorming`. Start with the AI model you already use in OMP.
Asking for a skill leaves your model choice unchanged.

For a small job, a direct request is a good place to start. For a bigger change,
ask the assistant to explain its approach before it starts editing. When it
finishes, ask what it checked and review the result before sharing it.

In 49 comparisons on a small set of coding tasks, the full Superpowers workflow
never passed a task that OMP alone failed. We still need to test how individual
skills affect those results. See [the test results](#evals) for details.

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

<details>
<summary>See the test results and model settings</summary>

Each comparison had two runs: one with OMP alone and one with Superpowers. We
kept the model, provider, thinking setting, starting files, and limits the same
for both. In the runs with scripted replies, we supplied prepared answers to
approval questions in OMP’s print mode.

Each cell shows how many runs passed the automated checks, **OMP alone → with
Superpowers**.

| Model | Thinking | Scripted replies | No replies |
| --- | --- | --- | --- |
| GPT-6 Luna | `low` | 14/16 → 10/16 | 8/11 → 2/11 |
| GPT-6 Luna | `xhigh` | 2/3 → 0/3 | 5/9 → 0/9 |
| GPT-6.1 Terra | `xhigh` | 1/2 → 0/2 | 1/8 → 0/8 |

The [Luna `low` tests](https://github.com/piyushmor/superpowers-omp/issues/3)
covered six small tasks. With Superpowers, the median run took 11.2 seconds
longer with scripted replies and 5.3 seconds longer without them. Estimated
cost was about 1.9 times as high. In the scripted runs, both approaches passed
all three trials for comparing collections. On a task about matching literal
text, OMP alone passed all three trials and Superpowers passed none.

The [Luna and Terra `xhigh` tests](https://github.com/piyushmor/superpowers-omp/issues/4)
repeated some tasks and added a change across several files. Runs in both groups
hit time or cost limits. The samples are small and the tasks differ, which
limits comparisons across models and settings. There are no paired work results
for GPT-6.2 Sol. These tests cover the full workflow; a separate test would be
needed to measure what changes when you add just one skill.

We also checked how well models followed individual skills. Luna passed the
checks for `brainstorming` at `low` and `verification-before-completion` at
`xhigh`. Each result includes a positive case, a near miss, and three additional
trials. The lowest suitable model is still unverified for 14 skills at `xhigh`.
All 12 Terra trials in the last skill batch hit a time or cost limit.

To start OMP with a specific model and thinking setting, set `MODEL` to the
model’s exact name in your OMP setup, then run:

```bash
omp --model "$MODEL" --thinking xhigh
```

For your own comparison, keep the settings and budget the same for both runs.
Compare what worked, what needed fixing, how long it took, and what it cost.

</details>

See [What the tests cover](docs/test-tasks.md) for the coding tasks, skill
scenarios, and approval checks.

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
