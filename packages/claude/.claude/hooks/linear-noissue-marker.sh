#!/usr/bin/env bash
# UserPromptSubmit hook: record a session-wide `#noissue` opt-out for the Linear
# first-edit gate (require-linear-issue.sh).
#
# PreToolUse hooks receive no prompt text — `prompt` only exists on
# UserPromptSubmit — so the token has to be captured here and handed over
# through a session-keyed marker file.
#
# Emits nothing: stdout on this event would be injected into the conversation.

set -uo pipefail

INPUT=$(cat)

case "$(printf '%s' "$INPUT" | jq -r '.prompt // empty')" in
  *'#noissue'*) ;;
  *) exit 0 ;;
esac

SID=$(printf '%s' "$INPUT" | jq -r '.session_id // empty')
[ -n "$SID" ] || exit 0

DIR="${TMPDIR:-/tmp}/claude-linear-gate"
mkdir -p "$DIR" 2>/dev/null && : > "$DIR/$SID.skip"

exit 0
