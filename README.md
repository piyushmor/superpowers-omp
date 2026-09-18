# @piyushmor/superpowers-omp

Native OMP adapter for the [Superpowers](https://github.com/obra/superpowers) skill library.

## Install

```bash
omp plugin install github:piyushmor/superpowers-omp
```

## Verify

```bash
omp plugin list --json
```

Start a clean OMP session and send:

> Let's make a react todo list

`brainstorming` must be read before code or implementation actions.

## Remove

```bash
omp plugin uninstall @piyushmor/superpowers-omp
```

## Compatibility

This adapter was tested with OMP `18.2.0`.

## Trust boundary

`omp plugin install` executes this package's in-process extension code with the same
privileges as the OMP session that installs it. Only install this adapter from a source
you trust, the same way you would trust any other code you run inside your OMP session.

## Revision provenance

This package ships a pinned upstream snapshot of the Superpowers skill library. The exact
upstream revision vendored into this package is recorded in `UPSTREAM.md`.

## Updating

Because the skill snapshot is pinned, updates are explicit:

- Pin to a specific upstream-adapter commit:

  ```bash
  omp plugin install github:piyushmor/superpowers-omp#<commit>
  ```

- Or do a fresh install after a new release of this package is published, which will carry
  a newer pinned snapshot and an updated `UPSTREAM.md`.

There is no npm registry package and no marketplace listing for this adapter; install and
update only via the `github:` reference above.
