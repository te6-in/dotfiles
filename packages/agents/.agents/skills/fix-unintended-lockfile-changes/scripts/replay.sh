#!/bin/sh
# Replay commits from a fork point, regenerating the lockfile incrementally
# with a plain install at every commit that touched it.
#
# Usage: replay.sh <fork-commit> <source-ref> <lockfile> <install-cmd> [args...]
#   e.g. replay.sh 9e42c2e11 backup/feat-x-pre-lockfile-replay bun.lock bun install
#
# Run from the repo root, on the branch to rewrite, with a clean working tree.
# Full command output goes to $REPLAY_LOG (default: /tmp/lockfile-replay-<pid>.log).
set -u

FORK=$1; SRC=$2; LOCKFILE=$3; shift 3
LOG=${REPLAY_LOG:-/tmp/lockfile-replay-$$.log}

fail() { echo "$1"; echo "log: $LOG"; exit 1; }

[ -z "$(git status --porcelain)" ] || fail "ABORT: working tree not clean"
[ -z "$(git rev-list --merges "$FORK".."$SRC")" ] || fail "ABORT: merge commits in $FORK..$SRC; replay only supports linear history"
git show --format= --name-only "$SRC" >/dev/null 2>&1 || fail "ABORT: cannot resolve $SRC"

echo "log: $LOG"
: > "$LOG"

git reset --hard "$FORK" >>"$LOG" 2>&1 || fail "RESET FAIL"

for c in $(git log --reverse --format=%H "$FORK".."$SRC"); do
  short=$(git log -1 --format='%h %s' "$c")
  if git cherry-pick "$c" >>"$LOG" 2>&1; then
    if git show --format= --name-only "$c" | grep -qx "$LOCKFILE"; then
      git checkout HEAD~1 -- "$LOCKFILE" || fail "LOCKFILE RESET FAIL at $short"
      "$@" >>"$LOG" 2>&1 || fail "INSTALL FAIL at $short"
      git add "$LOCKFILE"
      git commit --amend --no-edit >>"$LOG" 2>&1 || fail "AMEND FAIL at $short"
      echo "REGEN $short"
    else
      echo "PICK  $short"
    fi
  else
    unmerged=$(git diff --name-only --diff-filter=U)
    if [ "$unmerged" = "$LOCKFILE" ]; then
      git checkout HEAD -- "$LOCKFILE" || fail "LOCKFILE RESET FAIL at $short"
      "$@" >>"$LOG" 2>&1 || fail "INSTALL FAIL at $short"
      git add "$LOCKFILE"
      GIT_EDITOR=true git cherry-pick --continue >>"$LOG" 2>&1 || fail "CONTINUE FAIL at $short (empty commit? see SKILL.md)"
      echo "REGEN $short (conflict)"
    else
      echo "UNEXPECTED CONFLICT at $short — unmerged files:"
      echo "$unmerged"
      echo "cherry-pick left in progress; resolve manually or abort and restore from $SRC"
      exit 1
    fi
  fi
done

echo "DONE: $(git log --oneline -1)"
