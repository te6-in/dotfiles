#!/usr/bin/env bash
# PreToolUse hook (mcp__plugin_slack_slack__slack_send_message): auto-approve
# Slack messages whose target channel is the user's own DM channel — skips the
# permission prompt for "send-to-self" notes.
#
# Requires SLACK_SELF_USER_ID and SLACK_SELF_DM_CHANNEL_ID env vars (set in
# fish/.config/fish/conf.d/slack.fish — see slack.fish.example).

set -euo pipefail

INPUT=$(cat)
CHANNEL=$(echo "$INPUT" | jq -r '.tool_input.channel_id // ""')

# Bail if no channel — avoids degenerate empty=empty match against unset env vars.
if [ -z "$CHANNEL" ]; then
  exit 0
fi

if [ "$CHANNEL" != "${SLACK_SELF_USER_ID:-}" ] && [ "$CHANNEL" != "${SLACK_SELF_DM_CHANNEL_ID:-}" ]; then
  exit 0
fi

jq -n '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"allow",permissionDecisionReason:"Self DM — auto-approved"}}'
