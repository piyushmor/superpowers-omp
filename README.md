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
