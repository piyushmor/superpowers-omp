# Upstream Provenance

This package vendors the skill library from [obra/superpowers](https://github.com/obra/superpowers) at
revision [`b36e0829c6d0140e93cfef2ca599b1b07d4a7797`](https://github.com/obra/superpowers/commit/b36e0829c6d0140e93cfef2ca599b1b07d4a7797).

All files under `skills/` are copied verbatim from that revision and are unchanged; do not edit them
directly. The only addition beneath `skills/` is `skills/using-superpowers/references/omp-tools.md`,
which is an additive adapter file (not present upstream) that maps Superpowers actions onto OMP's
native tool surface for the OMP extension to consume.

## Manual update procedure

To refresh the vendored snapshot to a newer upstream revision, run the exact same three export
commands used to produce this snapshot, substituting the desired revision:

```bash
git clone --filter=blob:none --no-checkout https://github.com/obra/superpowers.git /tmp/superpowers-upstream
git -C /tmp/superpowers-upstream checkout <REVISION>
git -C /tmp/superpowers-upstream archive --format=tar HEAD skills LICENSE | tar -xf - -C .
```

Then update the revision recorded above, re-run the verification in Task 1 (excluding
`omp-tools.md` from the diff), and re-add `skills/using-superpowers/references/omp-tools.md` if it
was removed by the extraction.
