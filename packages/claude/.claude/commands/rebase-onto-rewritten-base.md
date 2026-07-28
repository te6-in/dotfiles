---
description: Recover a branch after its base was force-pushed (history rewritten) — back it up, rebase the branch's own commits onto the current remote base tip with git rebase --onto, then read what the base changed in between and report what the branch must adapt to. Works in any git repo.
argument-hint: "[base-branch]   # optional; auto-detected from origin/HEAD if omitted"
---

The branch you're currently on (call it FEATURE) was created off a base branch. That base has since been **force-pushed** — its history was rewritten — so a plain `git rebase origin/<base>` misfires: git can't reliably find where FEATURE diverged, so it folds the rewritten base commits into the replay and drowns in conflicts. The fix is to compute the fork point yourself, back FEATURE up, then replay only FEATURE's own commits onto the current remote base tip with `git rebase --onto`.

`$ARGUMENTS`, if given, is the base branch to use (skip auto-detection in step 1). Otherwise detect it.

Run every step in order. Never push and never delete the backup automatically.

**Always track this recovery with a todo list.** Before step 0, call `TaskCreate` with one item per numbered step below (0–7). Mark each item in-progress when you start it and completed when it's done — never batch them at the end. The multi-step recovery is conflict-prone and easy to lose your place in; the visible checklist is what keeps a step from being skipped.

## 0. Preconditions

- `FEATURE=$(git rev-parse --abbrev-ref HEAD)` — the branch being recovered.
- `REMOTE=$(git config "branch.$FEATURE.remote" || echo origin)` — the remote holding the base. If it isn't `origin` (a fork's `upstream`, say), read `$REMOTE/` wherever the steps below write `origin/`.
- Working tree MUST be clean: `git status --porcelain` returns nothing. If it's dirty, STOP and tell the user — do not stash silently.
- Refresh remotes so `origin/*` reflects the rewritten history: `git fetch --all --prune`.

## 1. Determine the base branch

- If `$ARGUMENTS` names a branch, set `BASE` to it after verifying `origin/$ARGUMENTS` exists, then skip to step 2.
- Otherwise find the remote's default branch:
  - `BASE=$(git symbolic-ref --quiet --short refs/remotes/origin/HEAD | sed 's@^origin/@@')`
  - If that's empty, run `git remote set-head origin --auto` and retry (or read the `HEAD branch:` line from `git remote show origin`).
- Build a candidate list: the default branch, plus any other `origin/<b>` (b ≠ FEATURE) whose reflog-based fork point resolves — those are branches FEATURE plausibly forked from. For each candidate gather (reference `FEATURE` explicitly so the reflog lookup is stable):
  - Fork point: `git merge-base --fork-point origin/<b> "$FEATURE"` (may print nothing).
  - Unique-commit count: `MB=$(git merge-base origin/<b> "$FEATURE"); git rev-list --count "$MB".."$FEATURE"`.
- The real base is the **closest ancestor**: the one whose fork point resolves and/or whose unique-commit count is smallest.
- **Decision rule: if two or more candidates are plausible — a fork point resolves for more than one, or the unique-commit counts are close enough that the winner isn't obvious — use AskUserQuestion to confirm.** List each candidate as an option showing its fork-point short hash and unique-commit count (e.g. `main — fork a1b2c3d, 4 commits ahead`). The user can pick another via "Other". Only proceed without asking when exactly one candidate is clearly closest.

## 2. Identify FEATURE's own commits

- `FORK=$(git merge-base --fork-point origin/$BASE "$FEATURE")`. If it's empty (reflog pruned), fall back to `FORK=$(git merge-base origin/$BASE "$FEATURE")` and note to the user that this is a fallback that may sit further back than the true fork point.
- Show the commits that will be replayed: `git log --oneline --no-merges "$FORK".."$FEATURE"`.
- Cross-check with patch equivalence: `git cherry -v origin/$BASE "$FEATURE"`. Lines marked `+` are genuinely new and will be replayed; lines marked `-` already exist in the rewritten base (by patch-id) — the rebase drops them as they become empty.
- If the range contains merge commits, a plain `git rebase --onto` will flatten/drop them — STOP and ask the user how they want those handled (e.g. `--rebase-merges`) before continuing.

## 3. Back up FEATURE

- `BACKUP="backup/$FEATURE-$(date +%Y%m%d-%H%M%S)"`
- `git branch "$BACKUP" "$FEATURE"` — this is the recovery point; do not delete it later.
- Confirm `git rev-parse "$BACKUP"` matches the current `FEATURE` tip before continuing.

## 4. Rebase FEATURE's own commits onto the new base

- `git rebase --onto origin/$BASE "$FORK" "$FEATURE"` — replays only `$FORK..FEATURE` onto the freshly fetched remote tip. Use `origin/$BASE`, NOT the local `$BASE` branch, which may be stale and may be checked out in another worktree.
- On conflict:
  - Resolve the conflicted files, `git add` the resolved paths, then `git rebase --continue`.
  - If conflicts land in generated/derived files that the repo can regenerate, prefer regenerating them over choosing a side, then `git add`. (If a separate command handles that regeneration, run it now.)
  - If rebase stops because a commit became empty / is already in the new base, run `git rebase --skip`.
  - If a conflict can't be resolved with confidence, STOP and report exactly which commit and file are stuck — don't guess. (`git rebase --abort` returns FEATURE to its pre-rebase tip; the backup branch also still holds it.)
- Repeat until the rebase completes.

### Generated-file conflict loop (optional automation)

When conflicts keep landing in **regenerable files** (lockfiles, codegen output, build aggregates) and the repo has a regeneration command, the loop script below can drive the rest of the rebase: regenerate → verify markers gone → stage → continue, bailing out to manual handling the moment anything falls outside the pattern.

**Warm up manually before automating.** This skill can't know what counts as generated in the repo at hand — the first stops are where you find out. Never start the rebase with the loop:

1. Handle the first conflict stop (a couple, if the first isn't representative) fully by hand, per the bullets above:
   - Find the regeneration command, preferring sources in this order: a repo-specific conflict/regeneration skill (invoke it if one is listed), CLAUDE.md / project docs, then AskUserQuestion.
   - **Manifest before lockfile.** If a manifest the install step parses (`package.json`, `Cargo.toml`, …) is conflicted, resolve it by hand FIRST — conflict markers in it break the install step, and the lockfile only regenerates cleanly against a valid manifest. Lockfiles themselves count as generated when the regen chain includes the install.
   - Run the regen command, confirm it exits 0 and actually clears the markers in the conflicted files, stage, continue.
2. Switch to the loop only once at least one stop has been resolved end-to-end by regeneration and the next stop repeats the pattern. Fill in the parameters from what you observed, not from guesses:
   - `REGEN_CMD` — the exact chain that worked in step 1, run from the repo root.
   - `GENERATED_RE` — extended regex matching the conflicted paths regeneration actually rewrote (plus obvious siblings, e.g. the rest of the same output directory). Keep it tight: an unmatched path stops the loop for manual handling, which is the safe direction to err in.
3. Write the script to the scratchpad with the parameters filled in and run it via Bash with `run_in_background: true` — regen chains are slow, and each replayed commit may trigger another run.
4. The loop exits non-zero when: a non-generated file conflicts (exit 3), the regen command fails (exit 4), or conflict markers survive regeneration (exit 5). On any stop, handle that one stop manually per the bullets above — widening `GENERATED_RE` only if regeneration provably rewrote the newly conflicted path — then re-run the loop; it picks up from the current rebase state.

```sh
#!/bin/bash
# Auto-resolve rebase conflicts confined to regenerable files.
set -u
GENERATED_RE=''   # FILL IN: paths safe to regen-resolve, e.g. '^(package-lock\.json|src/generated/)'
REGEN_CMD=''      # FILL IN: repo's regeneration chain, e.g. 'npm install && npm run codegen'
LOGDIR=/tmp       # FILL IN: session scratchpad dir

[ -n "$GENERATED_RE" ] && [ -n "$REGEN_CMD" ] || { echo "STOP: fill in GENERATED_RE and REGEN_CMD first"; exit 1; }
cd "$(git rev-parse --show-toplevel)" || exit 1
GITDIR=$(git rev-parse --git-dir)
i=0
while [ -d "$GITDIR/rebase-merge" ] || [ -d "$GITDIR/rebase-apply" ]; do
  i=$((i+1))
  unmerged=$(git diff --name-only --diff-filter=U)

  if [ -z "$unmerged" ]; then
    # No conflicts recorded — a continue is pending, or the commit became empty.
    out=$(GIT_EDITOR=true git rebase --continue 2>&1) && { echo "$out" | tail -3; continue; }
    if echo "$out" | grep -qi "no changes\|nothing to commit"; then
      git rebase --skip 2>&1 | tail -3
      continue
    fi
    echo "STOP: rebase --continue failed without unmerged files"; echo "$out" | tail -10; exit 2
  fi

  bad=$(echo "$unmerged" | grep -vE "$GENERATED_RE" || true)
  if [ -n "$bad" ]; then
    echo "STOP: non-generated conflicts need manual resolution:"; echo "$bad"; exit 3
  fi

  echo "=== iteration $i: regenerating for ==="; echo "$unmerged"
  ( eval "$REGEN_CMD" ) > "$LOGDIR/regen-$i.log" 2>&1 || { echo "STOP: regen failed (see regen-$i.log)"; exit 4; }

  markers=$(printf '%s' "$unmerged" | tr '\n' '\0' | xargs -0 grep -l '^<<<<<<<' 2>/dev/null || true)
  if [ -n "$markers" ]; then
    echo "STOP: conflict markers remain after regen:"; echo "$markers"; exit 5
  fi

  git add -A   # regen output may add/delete files; all of it belongs to this commit's resolution
  if git diff --cached --quiet; then
    git rebase --skip 2>&1 | tail -3   # resolution made the commit empty
  else
    GIT_EDITOR=true git rebase --continue 2>&1 | tail -4
  fi
done
echo "=== rebase completed ==="
git log --oneline -3
```

## 5. Verify and report

- **Patch-equivalence check** (`git range-diff`): `git range-diff "$FORK".."$BACKUP" "origin/$BASE".."$FEATURE"` — pairs each original commit (from the backup, on the old base) against its rebased counterpart (on the new base). This is what catches a hunk silently dropped during conflict resolution, which the graph check below cannot. Reading it:
  - `1: … = 2: …` — the commit is patch-equivalent; nothing to check.
  - a pair shown with an interdiff — the commit's content changed during the rebase. Inspect each: confirm the change was the intended conflict resolution and no hunk was lost. An unexplained change here is the failure mode this whole step exists to catch.
  - an unpaired commit (only on one side) — expected for any commit you `--skip`ped in step 4 (became empty / already in the new base, matching the `-` lines from step 2's `git cherry`); unexpected otherwise — STOP and investigate. With regen-based resolution, a commit whose entire content is regenerated output can legitimately become empty even though `git cherry` marked it `+` — its content was tied to the old base.
- **If the interdiffs are unreadable** (regen-based resolution floods them with generated/minified hunks), fall back to a whole-tree cross-check between the tips:

  ```sh
  comm -23 <(git diff --name-only "$BACKUP" "$FEATURE" | sort) \
           <(git diff --name-only "$FORK" "origin/$BASE" | sort)
  ```

  Empty output proves every file that differs between the old and new tips also changed between the old and new base — i.e., all tip drift is explained by the base rewrite. Any path it prints changed for some other reason: explain it (e.g., an intended manual resolution) or STOP and investigate. This is necessary-not-sufficient — for source (non-generated) files the range-diff flagged, still confirm their final content matches between tips: `git diff "$BACKUP" "$FEATURE" -- <paths>` should be empty or show only the intended resolution.
- `git log --oneline --graph origin/$BASE.."$FEATURE"` — confirm only FEATURE's own commits sit on top of the base, in the right order; cross-check against the step-2 list (account for any skipped/empty commits).
- Report to the user:
  - the base used, the fork point, and how many commits were replayed (and any skipped),
  - the range-diff result: either "all commits patch-equivalent" or a list of the commits it flagged as modified, each with a one-line note on why,
  - the backup branch name and the one-line recovery command: `git reset --hard "$BACKUP"`.

## 6. Read what the base changed, and report what FEATURE must adapt to

A clean rebase does not mean a correct branch. Conflicts fire only where the same lines were touched, but FEATURE forked at `$FORK` and has never seen **anything** in `$FORK..origin/$BASE`. Every base change FEATURE depends on without textually colliding with replays clean and leaves the branch quietly stale: a helper renamed and called from another file, a signature that grew an argument, wiring that became required, a base-wide refactor that FEATURE's newly added files skipped — those files never existed in the base, so they cannot conflict, ever.

Step 5 does not cover this. It proves the rebase didn't lose your hunks; it says nothing about whether your code still fits the base it now sits on.

So read the base's work and judge it. Don't pattern-match for risky-looking names.

### 6a. Scope the base diff

```sh
git log  --oneline --no-merges "$FORK"..origin/$BASE
git diff --stat        "$FORK"  origin/$BASE
```

**Trust the diff, discount the log.** A rewritten history is precisely where commit messages lie — squashed, reworded, split, dropped. Messages are hints about intent; the diff is the evidence. Don't try to separate "the force-push rewrite" from "genuine new base work" either: FEATURE had neither, so the whole range counts the same.

If step 2 fell back to plain `git merge-base`, `$FORK` may sit further back than the true fork point and inflate this range — say so, and expect some of what you read to be work FEATURE already has.

Exclude generated files before reading: `git diff --name-only -z "$FORK" origin/$BASE | git check-attr --stdin -z linguist-generated diff`, then path heuristics (lockfiles, `dist/` `build/` `.next/`, `__generated__/`, `*.min.js`, `*.gen.*`, snapshots). Ambiguous path → read it rather than drop it.

### 6b. Read it — in priority order when it's big

A handful of files: read the whole diff. Large: take `--stat` first, never dump it, and read in this order.

1. **Manifests and shared config** — `package.json`, dependency *version* changes (not lockfile churn), `tsconfig`, lint/formatter config, CI, env samples, codegen schemas. These change the ground rules for every file, FEATURE's included.
2. **Files FEATURE also touches** — direct overlap the rebase happened to replay without conflict:
   ```sh
   comm -12 <(git diff --name-only "$FORK" origin/$BASE | sort) \
            <(git diff --name-only origin/$BASE.."$FEATURE" | sort)
   ```
3. **Modules FEATURE imports from** — resolve them out of FEATURE's own diff, then read what the base did to them.
4. **The rest** — skim for architectural moves: renames, relocations, newly required wiring, changed conventions.

This ordering is a reading order, **not a filter**. A base change in a file FEATURE never touched is exactly how the silent breakages arrive; running out of budget is the only reason to stop short, and if you do, say where you stopped.

### 6c. Judge and report

For each base change ask what it means for FEATURE's code, not whether the text overlaps. Sort into:

- **Must adapt** — FEATURE is provably stale: calls a removed or renamed symbol, passes an old signature, misses now-required wiring, carries new files that skipped a base-wide convention change.
- **Worth checking** — plausible impact you can't confirm by reading alone: a behavior change inside a dependency FEATURE leans on, a config whose effect only shows at build or run time.
- **No impact** — don't enumerate; just say the area was reviewed.

Report each item as: what the base did → where FEATURE is affected (`path/to/file.ts:12`) → what the fix would be. Breakage before staleness.

If nothing needs adapting, say so outright — "read N base commits, nothing FEATURE depends on changed" is a real result, not an empty one.

### 6d. Ask before changing anything

Use AskUserQuestion with the findings in hand:

- "Apply the adaptations" → make them as **a separate commit on top of FEATURE**. Never amend them into a replayed commit: the rebase's provenance stays auditable and step 5's range-diff stays valid.
- "Report only" → leave the branch as verified; the user handles it.

Skip this question entirely when 6c found nothing.

## 7. Ask what to do next

Once the rebase is verified and any adaptations from step 6 are committed, use a **single AskUserQuestion call with exactly two questions**:

1. **Force-push FEATURE?** History was rewritten, so publishing it needs a force push.
   - "Force-push now" → run `git push --force-with-lease` (if FEATURE has no upstream yet, `git push -u origin "$FEATURE"` is enough).
   - "Don't push" → leave it; the user will push themselves.
2. **Delete the backup branch?**
   - "Keep it (recommended)" → leave `$BACKUP` in place.
   - "Delete it" → run `git branch -D "$BACKUP"`.

Then act on the answers, in this order: if force-pushing, do it first and confirm it succeeded; only then delete the backup if that was chosen. Never force-push or delete the backup without an explicit answer — and if the user picks "delete" but "don't push", flag that the backup is then the only off-remote copy of the work before removing it.
