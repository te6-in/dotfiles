---
name: rebase-onto-new-base
description: >-
  Move a branch onto a base it is not sitting on now, with `git rebase --onto` —
  retarget onto a sibling branch to stack a PR, switch to the base you should
  have branched from, recover after the base was force-pushed or squash-merged —
  then verify the replay with range-diff and report what the branch must adapt
  to in the new base. Use whenever a branch needs to end up on a base it never
  forked from, or its fork point no longer exists in the base it did fork from.
  Not for refreshing a branch against the base it already sits on. Works in any
  git repo.
argument-hint: "[new-base]   # the branch to move onto; detected only as a fallback"
---

The branch you're on (call it FEATURE) needs to sit on a base it isn't sitting on now. `git rebase --onto <newbase> <fork> <branch>` is the tool: it replays only FEATURE's own commits — the ones after `<fork>` — onto `<newbase>`, so nothing from the base FEATURE used to sit on comes along.

Reasons you end up here, all handled by the same procedure:

- **Retarget onto a sibling branch**, to stack a PR on work that hasn't merged yet.
- **The base was force-pushed** — its history was rewritten. A plain `git rebase origin/<base>` misfires here: git can't reliably find where FEATURE diverged, so it folds the rewritten base commits into the replay and drowns in conflicts.
- **The base was squash-merged**, so FEATURE's fork point no longer exists in it and a plain rebase replays commits the squash already landed.
- **You branched off the wrong base**, or the base was renamed or replaced.

Two questions run through the whole procedure, and they are **not the same question**:

- **`$BASE`** — where FEATURE should end up. You have often never been there, so ancestry cannot tell you this one.
- **`$FORK`** — where FEATURE's own commits begin, i.e. the tip of the base it currently sits on. This one *is* an ancestry question.

They collapse onto the same branch only in the force-push case. Step 1 settles `$BASE`, step 2 settles `$FORK`, and `--onto` takes them as separate arguments.

`$ARGUMENTS`, if given, is `$BASE` — the branch to move onto.

Run every step in order. Never push and never delete the backup automatically.

`$BASE`, `$FORK` and `$BACKUP` name values you carry between steps, **not shell variables** — every command runs in a fresh shell, so a `BACKUP=…` assigned in step 3 is gone by step 5. Record the resolved hash or branch name as you compute it and substitute the literal into later commands; re-deriving `$BACKUP` from a wildcard listing picks the wrong branch as soon as two backups exist.

**Always track this with a todo list.** Before step 0, create one todo item per numbered step below (0–7). Mark each item in-progress when you start it and completed when it's done — never batch them at the end. Keep all eight even for a one-commit retarget: the visible checklist is what stops a step being skipped, and step 6 is the one most worth not skipping. What should scale with the size of the job is the *reporting* — a single commit that replayed with no conflicts deserves one line for steps 4 and 5, not a walkthrough.

## 0. Preconditions

- `FEATURE=$(git rev-parse --abbrev-ref HEAD)` — the branch being moved.
- `REMOTE=$(git config "branch.$FEATURE.remote" || echo origin)` — the remote holding the base. If it isn't `origin` (a fork's `upstream`, say), read `$REMOTE/` wherever the steps below write `origin/`.
- Working tree MUST be clean: `git status --porcelain` returns nothing. If it's dirty, STOP and tell the user — do not stash silently.
- Refresh remotes so `origin/*` reflects the current state of every branch: `git fetch --all --prune`.

## 1. Determine the new base (`$BASE`)

`$BASE` is **where FEATURE should end up**, which is frequently somewhere it has never been. Do not derive it from ancestry — a branch FEATURE never forked from has no fork point, so any ancestry filter excludes exactly the answer a retarget is looking for.

Take the first of these that applies:

- **`$ARGUMENTS` names a branch.** That's `$BASE`. This is the common path — prefer being told over detecting.
- **The user named a target in conversation** — a branch, a PR number, or a description of one ("the SDK bump PR"). Resolve it to a branch and use it.
- **Neither.** Then this is most likely a force-push recovery or a base that moved under you, so propose the base FEATURE currently sits on (`$OLDBASE`, computed in step 2) — but ask, and put the retarget answers in the same question so they're reachable:

  ```sh
  gh pr list --state open --limit 20 --json number,title,headRefName \
    --jq '.[] | "\(.headRefName)  (#\(.number) \(.title))"'
  git for-each-ref --sort=-committerdate --count=15 \
    --format='%(refname:short)  %(committerdate:relative)' refs/remotes/origin/
  ```

  Offer `$OLDBASE` first, then open PR head branches and recently pushed remote branches. The user can name another via "Other".

Then check the choice — both of these are cheap and both catch a wrong answer before it costs anything:

- `git rev-parse --verify "origin/$BASE"` — the branch exists on the remote. Use `origin/$BASE`, never the local branch.
- `git merge-base --is-ancestor "origin/$BASE" "$FEATURE"` — **exit 0 means FEATURE already contains everything in `origin/$BASE`**, so the rebase would replay FEATURE's commits onto where they already sit and change nothing. That is almost never what was asked for. STOP and confirm the base before continuing. (The default branch is the usual way to land here: FEATURE forked from its tip and the tip hasn't moved.)

## 2. Determine the fork point (`$FORK`) and FEATURE's own commits

`$FORK` is **where FEATURE's own commits begin** — the tip of the base it currently sits on. This is the ancestry question, and it is answered against `$OLDBASE`, not `$BASE`. In a force-push recovery the two are the same branch and this step is just the fork-point computation.

Find `$OLDBASE` — the branch FEATURE actually forked from:

- Start from the remote's default branch: `git symbolic-ref --quiet --short refs/remotes/origin/HEAD | sed 's@^origin/@@'`. If that's empty, run `git remote set-head origin --auto` and retry (or read the `HEAD branch:` line from `git remote show origin`).
- Build a candidate list: the default branch, plus any other `origin/<b>` (b ≠ FEATURE) whose reflog-based fork point resolves. For each candidate gather (reference `FEATURE` explicitly so the reflog lookup is stable):
  - Fork point: `git merge-base --fork-point "origin/<b>" "$FEATURE"` (may print nothing).
  - Unique-commit count: `MB=$(git merge-base "origin/<b>" "$FEATURE"); git rev-list --count "$MB".."$FEATURE"`.
- `$OLDBASE` is the **closest ancestor**: the one whose fork point resolves and/or whose unique-commit count is smallest. If two or more are plausible, ask — list each with its fork-point short hash and unique-commit count (e.g. `main — fork a1b2c3d, 4 commits ahead`).

Then compute `$FORK`:

- `FORK=$(git merge-base --fork-point "origin/$OLDBASE" "$FEATURE")`.
- If it's empty (reflog pruned), fall back to `FORK=$(git merge-base "origin/$OLDBASE" "$FEATURE")` and note to the user that this is a fallback that may sit **further back** than the true fork point.
- If no `$OLDBASE` resolves at all, last resort: `FORK=$(git merge-base "origin/$BASE" "$FEATURE")`. Say so loudly — when `$BASE` isn't where FEATURE forked from, this can sit far back and drag base commits into the replay.

Then check the range before you touch anything:

- `git log --oneline --no-merges "$FORK".."$FEATURE"` — the commits that will be replayed. **Every one of them must be FEATURE's own work.** If the list contains commits belonging to the base FEATURE forked from, `$FORK` is too far back — STOP and ask rather than replaying someone else's history onto a new base.
- `git cherry -v "origin/$BASE" "$FEATURE"` — patch-equivalence cross-check. Lines marked `+` are genuinely new and will be replayed; lines marked `-` already exist in `$BASE` by patch-id, and the rebase drops them as they become empty. **A squash-merge is the trap here**: the combined commit's patch-id matches none of the originals, so every commit the squash already landed still shows `+` and the rebase will faithfully replay all of them. `git cherry` cannot save you there — a correct `$FORK` is the only thing that keeps them out.
- If the range contains merge commits, a plain `git rebase --onto` will flatten/drop them — STOP and ask the user how they want those handled (e.g. `--rebase-merges`) before continuing.

## 3. Back up FEATURE

- `BACKUP="backup/$FEATURE-$(date +%Y%m%d-%H%M%S)"`
- `git branch "$BACKUP" "$FEATURE"` — this is the recovery point; do not delete it later.
- Confirm `git rev-parse "$BACKUP"` matches the current `FEATURE` tip before continuing.

## 4. Replay FEATURE's own commits onto the new base

- `git rebase --onto "origin/$BASE" "$FORK" "$FEATURE"` — replays only `$FORK..FEATURE` onto the freshly fetched remote tip. Use `origin/$BASE`, NOT the local `$BASE` branch, which may be stale and may be checked out in another worktree.
- Spell out `$FORK` even when it looks redundant. `git rebase origin/$BASE` replays from `merge-base(origin/$BASE, FEATURE)`, which coincides with `$FORK` only when FEATURE and `$BASE` forked from the same commit — the sibling-retarget case. It diverges exactly where the damage is worst: a squash-merged or force-pushed base puts the merge-base far behind the true fork point and folds history FEATURE doesn't own into the replay.
- On conflict:
  - Resolve the conflicted files, `git add` the resolved paths, then `git rebase --continue`.
  - If conflicts land in generated/derived files that the repo can regenerate, prefer regenerating them over choosing a side, then `git add`. (If a separate skill handles that regeneration, invoke it now.)
  - If rebase stops because a commit became empty / is already in the new base, run `git rebase --skip`.
  - If a conflict can't be resolved with confidence, STOP and report exactly which commit and file are stuck — don't guess. (`git rebase --abort` returns FEATURE to its pre-rebase tip; the backup branch also still holds it.)
- Repeat until the rebase completes.

### Generated-file conflict loop (optional automation)

When conflicts keep landing in **regenerable files** (lockfiles, codegen output, build aggregates) and the repo has a regeneration command, a bundled script can drive the rest of the rebase: regenerate → verify markers gone → stage → continue, bailing out to manual handling the moment anything falls outside the pattern.

Read [references/generated-file-conflict-loop.md](references/generated-file-conflict-loop.md) before reaching for it — it carries a mandatory warm-up (resolve at least one stop by hand first) plus the flag reference and exit codes. The script itself is at `${CLAUDE_SKILL_DIR}/scripts/regen-conflict-loop.sh`.

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

  Empty output proves every file that differs between the old and new tips also changed between the old and new base — i.e., all tip drift is explained by the change of base. Any path it prints changed for some other reason: explain it (e.g., an intended manual resolution) or STOP and investigate. This is necessary-not-sufficient — for source (non-generated) files the range-diff flagged, still confirm their final content matches between tips: `git diff "$BACKUP" "$FEATURE" -- <paths>` should be empty or show only the intended resolution.
- `git log --oneline --graph "origin/$BASE".."$FEATURE"` — confirm only FEATURE's own commits sit on top of the base, in the right order; cross-check against the step-2 list (account for any skipped/empty commits).
- Report to the user:
  - the base used, the fork point, and how many commits were replayed (and any skipped),
  - the range-diff result: either "all commits patch-equivalent" or a list of the commits it flagged as modified, each with a one-line note on why,
  - the backup branch name and the one-line recovery command: `git reset --hard "$BACKUP"`.

## 6. Read what the base changed, and report what FEATURE must adapt to

A clean rebase does not mean a correct branch. Conflicts fire only where the same lines were touched, but FEATURE forked at `$FORK` and has never seen **anything** in `$FORK..origin/$BASE`. Every base change FEATURE depends on without textually colliding with replays clean and leaves the branch quietly stale: a helper renamed and called from another file, a signature that grew an argument, wiring that became required, a base-wide refactor that FEATURE's newly added files skipped — those files never existed in the base, so they cannot conflict, ever.

This is the step the whole procedure exists for, and it is the least specific to *why* the base changed. A retarget onto a sibling branch is the case where it pays most: the base was picked precisely because FEATURE depends on what's in it, so the interesting question is never "did the replay lose a hunk" but "does the code still fit".

Step 5 does not cover this. It proves the rebase didn't lose your hunks; it says nothing about whether your code still fits the base it now sits on.

So read the base's work and judge it. Don't pattern-match for risky-looking names.

### 6a. Scope the base diff

```sh
git log  --oneline --no-merges "$FORK"..origin/$BASE
git diff --stat        "$FORK"  origin/$BASE
```

**Trust the diff, discount the log.** You're reading someone else's commit messages, which describe intent; the diff is what FEATURE will actually be compiling and running against. Rewritten or squashed history makes the gap widest — messages there are squashed, reworded, split, dropped — but the rule holds regardless. And don't try to sort the range into "real new work" versus "history churn": FEATURE has seen none of it, so the whole range counts the same.

If step 2 fell back to plain `git merge-base`, `$FORK` may sit further back than the true fork point and inflate this range — say so, and expect some of what you read to be work FEATURE already has.

Exclude generated files before reading: `git diff --name-only -z "$FORK" origin/$BASE | git check-attr --stdin -z linguist-generated diff`, then path heuristics (lockfiles, `dist/` `build/` `.next/`, `__generated__/`, `*.min.js`, `*.gen.*`, snapshots). Ambiguous path → read it rather than drop it.

### 6b. Read it — in priority order when it's big

A handful of files: read the whole diff. Large: take `--stat` first, never dump it, and read in this order.

1. **Manifests and shared config** — `package.json`, dependency *version* changes (not lockfile churn), `tsconfig`, lint/formatter config, CI, env samples, codegen schemas. These change the ground rules for every file, FEATURE's included. A base picked for a dependency migration puts the whole payoff here.
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

If the repo has a cheap whole-project check (typecheck, lint, build), run it now — it turns half the "worth checking" pile into evidence, and on a retarget it is the fastest way to see whether the new base actually delivered what FEATURE was waiting for.

If nothing needs adapting, say so outright — "read N base commits, nothing FEATURE depends on changed" is a real result, not an empty one.

### 6d. Ask before changing anything

Ask the user, with the findings in hand:

- "Apply the adaptations" → make them as **a separate commit on top of FEATURE**. Never amend them into a replayed commit: the rebase's provenance stays auditable and step 5's range-diff stays valid.
- "Report only" → leave the branch as verified; the user handles it.

Skip this question entirely when 6c found nothing.

## 7. Ask what to do next

Once the rebase is verified and any adaptations from step 6 are committed, ask **exactly two questions, together in one go**:

1. **Publish FEATURE?** Work out which push it needs *before* asking, and say which one in the option text — don't make the user approve a force-push for a branch that has never been pushed. The rebase rewrote FEATURE's **own** commits, so what decides this is whether those commits are already published under FEATURE's own name:
   - `git rev-parse --verify --quiet "refs/remotes/$REMOTE/$FEATURE"` resolves → "Push now" runs `git push --force-with-lease "$REMOTE" "$FEATURE"`.
   - It doesn't resolve → "Push now" runs `git push -u "$REMOTE" "$FEATURE"`. Plain push, no force involved.
   - "Don't push" → leave it; the user will push themselves.

   **Do not decide this from the upstream, and always name the remote and branch explicitly.** A branch made with `git checkout -b "$FEATURE" origin/<base>` carries `origin/<base>` as its upstream while `$REMOTE/$FEATURE` does not exist yet — so an upstream-based check reads "already published", and a bare `git push --force-with-lease` would force FEATURE's commits over **the base branch**. If `git rev-parse --abbrev-ref "$FEATURE@{upstream}"` points anywhere other than `$REMOTE/$FEATURE`, tell the user; the explicit refspec is what keeps it harmless either way.
2. **Delete the backup branch?**
   - "Keep it (recommended)" → leave `$BACKUP` in place.
   - "Delete it" → run `git branch -D "$BACKUP"`.

Then act on the answers, in this order: push first and confirm it succeeded; only then delete the backup if that was chosen. Never push or delete the backup without an explicit answer — and if the user picks "delete" but "don't push", flag that the backup is then the only off-remote copy of the work before removing it.

**A push isn't always the end of it.** When `$BASE` is a branch with its own open PR, FEATURE's PR has to target `$BASE` rather than the default branch — that's a stacked PR, and `gh pr create --base "$BASE"` is the floor of it. If the user has a stacking tool (`gh stack`, Graphite, `git town`), let them drive it; this skill doesn't manage stacks. Just don't assume the job ends at `git push`.
