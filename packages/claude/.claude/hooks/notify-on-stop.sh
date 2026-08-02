#!/bin/bash
INPUT=$(cat)

if [ "$(echo "$INPUT" | jq -r '.stop_hook_active')" = "true" ]; then
  exit 0
fi

# Orca has its own agent-status surface; a second notification is just noise.
if [ "$TERM_PROGRAM" = "Orca" ] || [ -n "$ORCA_TERMINAL_HANDLE" ]; then
  exit 0
fi

CWD=$(echo "$INPUT" | jq -r '.cwd')
MSG=$(echo "$INPUT" | jq -r '.last_assistant_message // "Done"' | tr '"\\' "  " | tr '\n' ' ')
PROJ=$(basename "$CWD")
BRANCH=$(git -C "$CWD" branch --show-current 2>/dev/null)
TITLE="🤖 $PROJ"
[ -n "$BRANCH" ] && TITLE="🤖 $PROJ | $BRANCH"

if ! command -v terminal-notifier &>/dev/null; then
  osascript -e 'display notification "terminal-notifier not found. Run: brew install terminal-notifier" with title "Claude Code Hook Error"'
  exit 0
fi

EXEC_ARGS=()
if [ "$TERM_PROGRAM" = "vscode" ]; then
  EXEC_ARGS=(-execute "/opt/homebrew/bin/code '$CWD'")
fi

terminal-notifier -title "$TITLE" -message "$MSG" -sound Hero "${EXEC_ARGS[@]}" >/dev/null 2>&1 &
