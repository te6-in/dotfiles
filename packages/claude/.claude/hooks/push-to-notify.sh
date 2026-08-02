#!/usr/bin/env bash
# PostToolUse hook (PushNotification): mirror every push to `notify` (terminal-notifier + ntfy.sh),
# so "fire both" is enforced by the harness instead of instructions. fires regardless of whether
# the harness actually delivered the push ("Not sent" while the terminal is active) — by design.

INPUT=$(cat)
message=$(jq -r '.tool_input.message // empty' <<<"$INPUT")
[[ -z "$message" ]] && exit 0

# the push's content rides in -t (the visible line); -m stays the literal "push-notification" per convention.
# --source passed explicitly since the hook env may not carry CLAUDECODE.
exec "$HOME/.local/bin/notify" --source "Claude Code" -m "push-notification" -t "$message"
