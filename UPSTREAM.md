# Upstream Provenance

This package vendors the skill library from [obra/superpowers](https://github.com/obra/superpowers) at
revision [`22f0b463e7a5e579904dd6211a520321035526f7`](https://github.com/obra/superpowers/commit/22f0b463e7a5e579904dd6211a520321035526f7) (v7.0.2).

All upstream files under `skills/` are copied verbatim. The adapter adds two
files under `skills/using-superpowers/references/`:

- `omp-tools.md` is the short tool map included in the bootstrap.
- `omp-workflows.md` is loaded when an OMP-specific workflow needs it.

## Manual update procedure

Run this from a clean adapter checkout in Bash. Set `upstream` to a local clone
of `obra/superpowers` and `revision` to the full Git SHA of the release.

```bash
set -euo pipefail
upstream=/path/to/superpowers
revision=REPLACE_WITH_RELEASE_COMMIT_SHA
test -z "$(git status --porcelain --untracked-files=all -- skills LICENSE)"

stage=$(mktemp -d .superpowers-vendor.XXXXXX)
git -C "$upstream" archive --format=tar "$revision" skills LICENSE | tar -xf - -C "$stage"
refs=skills/using-superpowers/references
mkdir -p "$stage/$refs"
cp "$refs/omp-tools.md" "$refs/omp-workflows.md" "$stage/$refs/"

mv skills "$stage/previous-skills"
if ! mv "$stage/skills" skills; then
  mv "$stage/previous-skills" skills
  exit 1
fi
cp "$stage/LICENSE" LICENSE
printf 'Previous skill tree is at %s/previous-skills\n' "$stage"
```

Update the release pin above. Compare vendored file contents and modes with
upstream, excluding the two adapter files, then run `bun test`. Remove the
temporary directory once the refresh is verified.
