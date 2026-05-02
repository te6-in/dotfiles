#!/usr/bin/env bash
# PreToolUse hook (Bash): rewrite `rm` calls to `trash` so deletes go to the
# macOS Trash instead of being unrecoverable. Strips rm's flags (-r, -f, -rf,
# etc.) since trash doesn't accept them.
#
# Only fires when `rm` appears at the start of the command or right after a
# chain operator (&&, ||, ;) — avoids matching inside quoted strings or other
# tools whose name happens to contain "rm".

set -euo pipefail

INPUT=$(cat)
CMD=$(echo "$INPUT" | jq -r '.tool_input.command')

if ! echo "$CMD" | grep -qE '^rm\s|&&\s*rm\s|\|\|\s*rm\s|;\s*rm\s'; then
  exit 0
fi

NEW_CMD=$(echo "$CMD" | sed -E 's/(^|&&[[:space:]]*|\|\|[[:space:]]*|;[[:space:]]*)rm[[:space:]]+(-[a-zA-Z]+[[:space:]]+)*/\1trash /g')

jq -n \
  --arg cmd "$NEW_CMD" \
  --arg ctx "Files were deleted via trash (instead of rm): $NEW_CMD" \
  '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"allow",updatedInput:{command:$cmd},additionalContext:$ctx}}'
