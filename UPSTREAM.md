# Upstream Provenance

This package vendors the skill library from [obra/superpowers](https://github.com/obra/superpowers) at
revision [`22f0b463e7a5e579904dd6211a520321035526f7`](https://github.com/obra/superpowers/commit/22f0b463e7a5e579904dd6211a520321035526f7) (v7.0.2).

All files under `skills/` are copied verbatim from that revision and are unchanged; do not edit them
directly. The only addition beneath `skills/` is `skills/using-superpowers/references/omp-tools.md`,
which is an additive adapter file (not present upstream) that maps Superpowers actions onto OMP's
native tool surface for the OMP extension to consume.

## Manual update procedure

To refresh the vendored snapshot to a newer upstream revision, run the export sequence below,
substituting the desired revision:

```bash
git clone --filter=blob:none --no-checkout https://github.com/obra/superpowers.git /tmp/superpowers-upstream
git -C /tmp/superpowers-upstream checkout <REVISION>
# git archive extraction overwrites but does NOT delete files removed upstream:
# wipe the old snapshot first, preserving the additive adapter file.
cp skills/using-superpowers/references/omp-tools.md /tmp/omp-tools-backup.md
rm -rf skills
git -C /tmp/superpowers-upstream archive --format=tar HEAD skills LICENSE | tar -xf - -C .
mkdir -p skills/using-superpowers/references
cp /tmp/omp-tools-backup.md skills/using-superpowers/references/omp-tools.md
```

Then update the revision recorded above and re-run the verification in Task 1 (excluding
`omp-tools.md` from the diff).
