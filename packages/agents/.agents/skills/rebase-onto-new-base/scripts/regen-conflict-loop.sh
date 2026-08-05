#!/bin/bash
# Auto-resolve rebase conflicts confined to regenerable files.
#
# Usage:
#   regen-conflict-loop.sh --generated-re <ERE> --regen-cmd <SHELL_CMD> --log-dir <DIR>
#
#   --generated-re  Extended regex matching the conflicted paths regeneration
#                   actually rewrites. Keep it tight: an unmatched path stops
#                   the loop for manual handling, which is the safe direction.
#                   e.g. '^(package-lock\.json|src/generated/)'
#   --regen-cmd     The repo's regeneration chain, run from the repo root.
#                   e.g. 'npm install && npm run codegen'
#   --log-dir       Where per-iteration regen logs are written. Use the session
#                   scratchpad, not /tmp. Must sit outside the repo — the loop
#                   stages with `git add -A` and would commit the logs.
#
# Exit codes: 1 bad usage or no rebase in progress / 2 continue failed with no
#             unmerged files / 3 non-generated conflict / 4 regen failed /
#             5 markers survived regen
set -u

GENERATED_RE=''
REGEN_CMD=''
LOGDIR=''

while [ $# -gt 0 ]; do
  case "$1" in
    --generated-re|--regen-cmd|--log-dir)
      [ $# -ge 2 ] || { echo "STOP: $1 needs a value" >&2; exit 1; }
      case "$1" in
        --generated-re) GENERATED_RE=$2 ;;
        --regen-cmd)    REGEN_CMD=$2 ;;
        --log-dir)      LOGDIR=$2 ;;
      esac
      shift 2
      ;;
    -h|--help) awk 'NR>1 && /^#/ {sub(/^# ?/, ""); print; next} NR>1 {exit}' "$0"; exit 0 ;;
    *) echo "STOP: unknown argument: $1" >&2; exit 1 ;;
  esac
done

[ -n "$GENERATED_RE" ] && [ -n "$REGEN_CMD" ] && [ -n "$LOGDIR" ] || {
  echo "STOP: --generated-re, --regen-cmd and --log-dir are all required" >&2; exit 1
}
[ -d "$LOGDIR" ] || { echo "STOP: --log-dir '$LOGDIR' is not a directory" >&2; exit 1; }

LOGDIR=$(cd "$LOGDIR" && pwd -P) || exit 1
cd "$(git rev-parse --show-toplevel)" || exit 1
GITDIR=$(git rev-parse --git-dir)

# The loop stages with `git add -A`, so a log dir inside the working tree would
# get committed into the very resolution it is logging.
case "$LOGDIR/" in
  "$(pwd -P)"/*) echo "STOP: --log-dir is inside the repo; git add -A would commit the logs" >&2; exit 1 ;;
esac

# The loop only makes sense mid-rebase. Without this guard an idle repo falls
# straight through to "rebase completed" and exit 0, which reads as success.
[ -d "$GITDIR/rebase-merge" ] || [ -d "$GITDIR/rebase-apply" ] || {
  echo "STOP: no rebase in progress — start it (step 4) and hit a conflict first" >&2; exit 1
}

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
  ( eval "$REGEN_CMD" ) > "$LOGDIR/regen-$i.log" 2>&1 || { echo "STOP: regen failed (see $LOGDIR/regen-$i.log)"; exit 4; }

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
