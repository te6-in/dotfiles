---
name: fix-unintended-lockfile-changes
description: >-
  Recover a branch whose lockfile (bun.lock, pnpm-lock.yaml, package-lock.json,
  yarn.lock) carries a huge unintended rewrite — hundreds of unrelated version
  bumps from an accidental `bun update`/`pnpm update`, a lockfile deleted and
  regenerated, or a package-manager version migration (e.g. bun's
  configVersion) — by replaying the branch's commits from the fork point and
  regenerating the lockfile incrementally with a plain install. Use whenever
  the user asks why a lockfile diff is thousands of lines, complains that a
  branch resolved dependencies to versions it never asked for, wants to
  shrink or clean up a lockfile diff before merging, or a build broke because
  a (transitive) dependency jumped to an incompatible version on the branch.
---

# Fix unintended lockfile changes

A feature branch sometimes ends up carrying a wholesale lockfile rewrite it never asked for: thousands of changed lines, hundreds of unrelated packages bumped. Typical causes: someone ran `update` instead of `install`, the lockfile was deleted and regenerated after a bad merge, or a newer package-manager version migrated the lockfile format and the operator re-resolved from scratch.

The fix rests on one property: a **plain install preserves existing in-range resolutions** — it only resolves what the lockfile doesn't already pin. So replaying the branch's commits from the fork point, regenerating the lockfile with a plain install at each commit that touched it, reproduces the honest incremental diff (new packages only) and drops the churn. Never run `update` during this workflow, and use one package-manager version throughout.

Pick the install command from the lockfile present (cross-check the `packageManager` field in package.json):

| Lockfile | Install command |
|---|---|
| `bun.lock` / `bun.lockb` | `bun install` |
| `pnpm-lock.yaml` | `pnpm install` |
| `package-lock.json` | `npm install` |
| `yarn.lock` | `yarn install` |

## 1. Diagnose — confirm the churn is unintended

Before rewriting anything, establish that the lockfile diff really is churn and not legitimate work:

```sh
FORK=$(git merge-base origin/<base> HEAD)
git diff --stat "$FORK"..HEAD -- <lockfile>              # total size
git log --format='%h %s' "$FORK"..HEAD -- <lockfile>     # which commits touched it
git show --numstat <commit> -- <lockfile>                # per-commit size
```

Signals of unintended churn: a single commit rewrites thousands of lockfile lines while its package.json changes are small; packages unrelated to the branch's work changed versions; format/metadata fields changed (bun's `configVersion`, pnpm's `lockfileVersion`). Compare a few resolution entries against the fork point to show the user concretely what jumped. If the diff is genuinely just the branch's own additions, stop — there is nothing to fix.

Report the diagnosis before proceeding. If the branch is pushed, note that the rewrite will require a force-push later.

## 2. Prepare

The replay rewrites history, so set up recovery points first:

1. Stash uncommitted work, **excluding the lockfile**, then restore the lockfile to HEAD (`git checkout -- <lockfile>`). The lockfile part of the WIP is derivable later by re-running install; stashing it would only cause a pop conflict after the replay.
2. Create a backup branch at the current tip: `git branch backup/<branch>-pre-lockfile-replay`.
3. The replay only supports linear history — the script refuses merge commits in the range. If there are merges, discuss with the user first (usually: rebase to linearize, then replay).

## 3. Replay

Run the bundled script from the repo root (it refuses to start on a dirty tree):

```sh
sh <skill-dir>/scripts/replay.sh <fork-commit> <backup-ref> <lockfile> <install-cmd...>
# e.g. sh .../replay.sh 9e42c2e11 backup/feat-x-pre-lockfile-replay bun.lock bun install
```

It resets the current branch to the fork point, cherry-picks every commit in order, and for each commit that touched the lockfile: resets the lockfile to the previous commit's version, runs the plain install, and amends the regenerated lockfile in. Lockfile-only cherry-pick conflicts are handled the same way automatically. Full command output goes to a log file (path printed at start) — read the log instead of re-running when something fails.

The first lockfile commit usually applies cleanly (its parent lockfile matches the chain); later ones conflict — both paths are expected and handled. Two failure modes need you:

- **Conflict outside the lockfile**: the script stops. This means the source changes themselves don't replay — investigate; if it's not quickly resolvable, restore with `git cherry-pick --abort && git reset --hard <backup-ref>` and report.
- **Empty commit after regen**: if a commit only touched the lockfile and the regenerated content equals the previous commit's, `cherry-pick --continue` refuses the empty commit. Ask the user whether to keep it (`git commit --allow-empty --no-edit -C <sha> && git cherry-pick --skip`) or drop it (`git cherry-pick --skip`).

## 4. Verify

All three checks, in this order — the first one decides whether to keep the result at all:

1. **The premise held**: `git show --numstat <regen-commit> -- <lockfile>` for each regenerated commit. If a regen is still a wholesale rewrite, the churn is inherent to the current package-manager version re-resolving from scratch — restore from the backup ref, report, and discuss alternatives (pin the offending ranges, or accept the rewrite as its own commit/PR).
2. **Source identity**: `git diff <backup-ref> HEAD -- . ':!<lockfile>'` must be empty. Only the lockfile may differ from the original branch.
3. **The original symptom**: if a build/test failure motivated this (a dependency jumped to an incompatible version), confirm the resolved version is back and re-run that build or test.

## 5. Wrap up

1. Pop the stash; if it contained package.json changes, run the plain install once so the lockfile reflects them.
2. Report: total lockfile diff vs base before → after, per-commit regen sizes, versions that were preserved, and the backup ref.
3. Ask before force-pushing (`git push --force-with-lease`). Suggest deleting the backup branch only after the user has confirmed everything looks right.
