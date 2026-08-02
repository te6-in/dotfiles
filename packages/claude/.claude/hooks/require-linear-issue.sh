#!/usr/bin/env bash
# PreToolUse hook (Edit|Write|NotebookEdit): in work repos, redirect the first
# code edit of a session into the Linear issue-identification flow.
#
# Why a hook: the trigger is the repo's GitHub org, matched against
# $WORK_GITHUB_ORGS, which no declarative
# mechanism can express — `paths:` globs match file paths, and an ancestor
# CLAUDE.md misses git worktrees, which live outside the repo directory.
# Reading `git remote` at tool time is the only condition that holds everywhere.
#
# Fires at most once per session. The marker is written BEFORE the deny is
# emitted, so the retry always goes through and the session can't deadlock —
# this is a reminder delivered at exactly the right moment, not a hard gate.
#
# Deliberately dumb: it answers state questions (work repo? first edit?) and
# nothing else. Whether the work needs an issue is a question about intent,
# which a PreToolUse hook cannot see — so that judgment lives in the deny
# message and in the linear-workflow skill, not in a growing list of shell
# conditions. Every intent rule pushed down here has to be re-expressed as a
# state proxy, and state proxies both over- and under-fire.
#
# `#noissue` is handled by linear-noissue-marker.sh: PreToolUse never sees the
# prompt text, so the token has to be captured on UserPromptSubmit instead.

set -uo pipefail

INPUT=$(cat)

# Hook cwd can drift (subagents, removed worktrees) — pin it to the reported cwd.
CWD=$(printf '%s' "$INPUT" | jq -r '.cwd // empty')
[ -n "$CWD" ] && cd "$CWD" 2>/dev/null

REMOTE=$(git remote get-url origin 2>/dev/null)
if [ -z "$REMOTE" ]; then
  FIRST=$(git remote 2>/dev/null | head -1)
  [ -n "$FIRST" ] && REMOTE=$(git remote get-url "$FIRST" 2>/dev/null)
fi
[ -n "$REMOTE" ] || exit 0

# The org list is per-machine and deliberately absent from this repo — it lives in
# $WORK_GITHUB_ORGS (see conf.d/work.fish.example). Unset means the gate is off
# everywhere, which is the right default for a clone with no employer attached.
[ -n "${WORK_GITHUB_ORGS:-}" ] || exit 0

MATCHED=
for ORG in $WORK_GITHUB_ORGS; do
  case "$REMOTE" in
    *github.com[:/]"$ORG"/*) MATCHED=1 ; break ;;
  esac
done
[ -n "$MATCHED" ] || exit 0

SID=$(printf '%s' "$INPUT" | jq -r '.session_id // empty')
[ -n "$SID" ] || exit 0

DIR="${TMPDIR:-/tmp}/claude-linear-gate"
mkdir -p "$DIR" 2>/dev/null || exit 0

[ -f "$DIR/$SID.skip" ] && exit 0
[ -f "$DIR/$SID.done" ] && exit 0
: > "$DIR/$SID.done"

jq -n '{hookSpecificOutput:{
  hookEventName:"PreToolUse",
  permissionDecision:"deny",
  permissionDecisionReason:"LINEAR-GATE: first code edit in a work repo. Default path: load the linear-workflow skill, run its issue-identification flow (find or create the issue, set it In Progress), then repeat this same edit — it will go through. Exception: if this edit carries no new work intent of its own — resolving rebase/merge conflicts, a revert, a mechanical decision-free change, applying review feedback on a branch that is already tracked — skip the flow and proceed, but state in one line why you skipped it. Judge by intent, not by that list. The user can also say #noissue to turn this off for the session."
}}'
