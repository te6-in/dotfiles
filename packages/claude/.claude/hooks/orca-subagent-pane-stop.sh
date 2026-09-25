#!/usr/bin/env bash
# SubagentStop: tell the subagent's pane its agent is done.
#
# The pane, not this hook, decides what that means — it was launched with either
# "prompt" (draw a press-any-key footer) or "close", baked in at spawn because a
# pane Orca spawns inherits none of this process's environment. All this does is
# raise the flag the pane is polling for.
set -uo pipefail

trap 'exit 0' ERR

[ -n "${ORCA_PANE_KEY:-}" ] || exit 0
command -v jq >/dev/null 2>&1 || exit 0

INPUT=$(cat)
AGENT_ID=$(printf '%s' "$INPUT" | jq -r '.agent_id // empty')
SESSION=$(printf '%s' "$INPUT" | jq -r '.session_id // "unknown"')
[ -n "$AGENT_ID" ] || exit 0

TMP="${TMPDIR:-/tmp}"
STATE="${TMP%/}/orca-subagent-panes/${SESSION}"
[ -f "$STATE/pane-${AGENT_ID}" ] || exit 0

: > "$STATE/done-${AGENT_ID}"

# Stop counting this pane against ORCA_SUBAGENT_PANE_MAX. Its handle stays in
# `last-pane` so later subagents keep stacking in the same column; the start
# hook falls back to the lead pane if that one turns out to be gone.
rm -f "$STATE/pane-${AGENT_ID}"

exit 0
