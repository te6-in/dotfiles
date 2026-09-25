#!/usr/bin/env bash
# PreToolUse hook (Edit|Write|NotebookEdit): in work repos, point the session at
# the Linear issue-identification flow at its first code edit.
#
# Why a hook: the trigger is the repo's GitHub org, matched against
# $WORK_GITHUB_ORGS, which no declarative
# mechanism can express — `paths:` globs match file paths, and an ancestor
# CLAUDE.md misses git worktrees, which live outside the repo directory.
# Reading `git remote` at tool time is the only condition that holds everywhere.
#
# Fires at most once per session, and never denies: the edit runs, and the
# reminder rides along as `additionalContext`, which Claude Code delivers as a
# `hook_additional_context` attachment rather than as a tool error. A deny threw
# the tool call away and made the agent rebuild it from scratch, which it managed
# verbatim only 64% of the time — 13% once the input passed 10,000 characters.
# Emitting no `permissionDecision` at all also leaves the permission flow alone:
# granting a bypass is not this hook's business.
#
# Deliberately dumb: it answers state questions (work repo? first edit?) and
# nothing else. Whether the work needs an issue is a question about intent,
# which a PreToolUse hook cannot see — so that judgment lives in the
# linear-workflow skill, not in a growing list of shell conditions. Every intent
# rule pushed down here has to be re-expressed as a state proxy, and state
# proxies both over- and under-fire.
#
# `#noissue` is handled by linear-noissue-marker.sh: PreToolUse never sees the
# prompt text, so the token has to be captured on UserPromptSubmit instead.

set -uo pipefail

INPUT=$(cat)

# Subagents share the parent's session_id, so a subagent that writes a scratch
# file would burn the one marker and leave the main thread — the thread that
# actually needs the reminder — silently ungated. They also can't finish the
# flow, which turns on asking the user. `agent_id` is present only inside a
# subagent, and is the field documented for telling the two apart.
[ -n "$(printf '%s' "$INPUT" | jq -r '.agent_id // empty')" ] && exit 0

# Hook cwd can drift (removed worktrees) — pin it to the reported cwd.
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

# Both sides are lowercased: GitHub org names are case-insensitive, so a remote
# cloned as Acme-Corp must still match an $WORK_GITHUB_ORGS entry of acme-corp.
# A miss here exits 0 in silence, which would drop the gate without a trace.
REMOTE_LC=$(printf '%s' "$REMOTE" | tr '[:upper:]' '[:lower:]')

MATCHED=
for ORG in $WORK_GITHUB_ORGS; do
  ORG_LC=$(printf '%s' "$ORG" | tr '[:upper:]' '[:lower:]')
  case "$REMOTE_LC" in
    *github.com[:/]"$ORG_LC"/*) MATCHED=1 ; break ;;
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

# This message carries only what the hook can observe. Every procedure — the
# late-arrival recovery, the exemptions — lives in the skill and only there, since
# restating any of it here is how the two copies drift, and the skill loads seconds
# after this is read. `CHECKPOINT`, not `GATE`: nothing is denied here, and sharing
# the `TRASH-GATE:` prefix would read as a verdict on the tool call. For the same
# reason the message reports the edit without calling the flow late — the edit
# landing first is what not denying means, so there is no lapse to own up to.
MSG=$(cat <<'EOF'
LINEAR-CHECKPOINT: first code edit of this session in a work repo. The edit is applied.

Load the linear-workflow skill and follow its issue-identification flow — its recovery
path and its exemptions included.

#noissue in any user message turns this off for the rest of the session.
EOF
)

jq -n --arg msg "$MSG" '{hookSpecificOutput:{
  hookEventName:"PreToolUse",
  additionalContext:$msg
}}'
