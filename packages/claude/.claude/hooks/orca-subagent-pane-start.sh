#!/usr/bin/env bash
# SubagentStart: give each Claude Code subagent its own live Orca split pane.
#
# Claude runs Task subagents in-process with no PTY of their own, so nothing can
# demultiplex their output from the lead's terminal. What they DO get is a
# per-agent transcript on disk, appended in real time — this splits a pane that
# tails it. No-ops outside Orca.
#
#   ORCA_SUBAGENT_PANE=0     disable
#   ORCA_SUBAGENT_PANE_MAX   subagent panes on screen before new ones are skipped
#                            (default 0, meaning no limit)
#   ORCA_SUBAGENT_PANE_TYPES comma-separated agent_type allowlist (default: all)
#   ORCA_SUBAGENT_PANE_CLOSE_AFTER  seconds the finished pane counts down before
#                            closing itself (default 10; 0 waits for a keypress)
set -uo pipefail

# A hook that fails must never take the subagent down with it.
trap 'exit 0' ERR

[ "${ORCA_SUBAGENT_PANE:-1}" = "0" ] && exit 0
[ -n "${ORCA_PANE_KEY:-}" ] || exit 0
[ -n "${ORCA_TERMINAL_HANDLE:-}" ] || exit 0
command -v orca >/dev/null 2>&1 || exit 0
command -v jq >/dev/null 2>&1 || exit 0

TMP="${TMPDIR:-/tmp}"
TMP="${TMP%/}"

INPUT=$(cat)

[ -n "${ORCA_SUBAGENT_PANE_DEBUG:-}" ] &&
  printf '%s\n' "$INPUT" >> "$TMP/orca-subagent-hook-payloads.jsonl"

AGENT_ID=$(printf '%s' "$INPUT" | jq -r '.agent_id // empty')
AGENT_TYPE=$(printf '%s' "$INPUT" | jq -r '.agent_type // "agent"')
TRANSCRIPT=$(printf '%s' "$INPUT" | jq -r '.transcript_path // empty')
SESSION=$(printf '%s' "$INPUT" | jq -r '.session_id // "unknown"')

[ -n "$AGENT_ID" ] && [ -n "$TRANSCRIPT" ] || exit 0

if [ -n "${ORCA_SUBAGENT_PANE_TYPES:-}" ]; then
  case ",${ORCA_SUBAGENT_PANE_TYPES}," in
    *",${AGENT_TYPE},"*) ;;
    *) exit 0 ;;
  esac
fi

# Measured, including for a depth-2 spawn: `transcript_path` is always the lead
# session's transcript (<dir>/<sessionId>.jsonl), never the spawning subagent's,
# and every subagent lands flat in <sessionId>/subagents/ regardless of depth.
# So one derivation covers every nesting level.
LOG="${TRANSCRIPT%.jsonl}/subagents/agent-${AGENT_ID}.jsonl"

STATE="$TMP/orca-subagent-panes/${SESSION}"
mkdir -p "$STATE" || exit 0

LABEL=$(printf '%s' "$AGENT_TYPE" | tr -cd '[:alnum:]._-' | cut -c1-40)
DONE_FLAG="$STATE/done-${AGENT_ID}"
rm -f "$DONE_FLAG"

# The pane is spawned by Orca, not forked from here, so it inherits none of these
# settings — bake the behaviour into the command line instead.
ON_DONE=prompt
[ "${ORCA_SUBAGENT_PANE_CLOSE_ON_STOP:-0}" = "1" ] && ON_DONE=close

# Orca echoes the pane's launch command into the pane, so four absolute paths on
# the command line cost three wrapped lines of noise above the first real output.
# Hand over one path to a job file instead.
JOB="$STATE/job-${AGENT_ID}"
printf '%s\n%s\n%s\n%s\n%s\n' "$LOG" "$LABEL" "$DONE_FLAG" "$ON_DONE" \
  "${ORCA_SUBAGENT_PANE_CLOSE_AFTER:-10}" > "$JOB"

CMD="$HOME/.claude/hooks/orca-subagent-tail.sh '$JOB'"

# Backgrounded: SubagentStart is synchronous, and the split is an IPC round-trip
# to the Orca app that the subagent should not wait on.
{
  split_into() {
    orca terminal split --terminal "$1" --direction "$2" --command "$CMD" --json 2>/dev/null \
      | jq -r '.result.split.handle // .result.handle // empty'
  }

  # The visual layout is the only thing that says a pane is on screen. A closed
  # pane keeps its `orca terminal list` record — same tabId, orphaned=false,
  # connected=true — so listing terminals counts ghosts. Worse, splitting off a
  # ghost still succeeds: its PTY is alive, so the runtime takes the pty-backed
  # path and produces another terminal that never enters the layout. One ghost in
  # `last-pane` is enough to make every later subagent invisible.
  LIVE_HANDLES=$(orca terminal list --include-visual-layouts --json 2>/dev/null \
    | jq -r '.result.visualLayouts | .. | objects | select(.type? == "terminal") | .handle' 2>/dev/null)
  alive() { printf '%s\n' "$LIVE_HANDLES" | grep -qx "$1"; }

  # The cap counts panes that are actually on screen, not leftover state files.
  # Closing a pane by hand never reaches SubagentStop, and a subagent the user
  # stops never fires it at all — counting files meant the budget only ever went
  # down, until every later subagent was skipped in silence.
  for f in "$STATE"/pane-*; do
    [ -f "$f" ] || continue
    alive "$(cat "$f")" || rm -f "$f"
  done

  MAX=${ORCA_SUBAGENT_PANE_MAX:-0}
  if [ "$MAX" -gt 0 ] 2>/dev/null; then
    OPEN=$(find "$STATE" -maxdepth 1 -name 'pane-*' 2>/dev/null | wc -l | tr -d ' ')
    [ "$OPEN" -ge "$MAX" ] && { rm -f "$JOB"; exit 0; }
  fi

  # First subagent splits the agent's own pane side-by-side; the rest stack inside
  # that column instead of shaving the agent pane down once per spawn.
  LAST=$(cat "$STATE/last-pane" 2>/dev/null)
  if [ -n "$LAST" ] && alive "$LAST"; then
    TARGET="$LAST"
    DIRECTION=horizontal
  else
    TARGET="$ORCA_TERMINAL_HANDLE"
    DIRECTION=vertical
  fi

  HANDLE=$(split_into "$TARGET" "$DIRECTION")

  # A pane that closed itself leaves a stale `last-pane`; fall back to the lead.
  if [ -z "$HANDLE" ] && [ "$TARGET" != "$ORCA_TERMINAL_HANDLE" ]; then
    rm -f "$STATE/last-pane"
    HANDLE=$(split_into "$ORCA_TERMINAL_HANDLE" vertical)
  fi

  if [ -n "$HANDLE" ]; then
    printf '%s' "$HANDLE" > "$STATE/pane-${AGENT_ID}"
    printf '%s' "$HANDLE" > "$STATE/last-pane"

    # Known issue, deliberately not worked around: the renderer focuses every
    # pane it creates, so a subagent spawning mid-sentence takes the cursor out
    # of the agent's prompt. There is no way to opt out — `splitTerminal` accepts
    # an `activate` option but forwards only direction/command/telemetrySource
    # to the renderer (orca-runtime.ts:23128).
    #
    # Do NOT reach for `orca terminal switch` to put focus back. It is not a
    # focus primitive: it hardcodes navigation: 'host', so it unconditionally
    # activates the worktree, view, tab group and tab and pushes onto the
    # back/forward stack via recordWorktreeVisit, dragging the user out of
    # wherever they had navigated. The pane focus it then attempts is itself
    # best-effort and gives up after two rAF ticks if the leaf's textarea has not
    # mounted — so you routinely pay the navigation and still do not get focus,
    # which is exactly what it did here.
    #
    # TODO: revisit if Orca forwards `activate` through to the renderer. Nothing
    # is filed for that; the nearest issues are the inverse (stablyai/orca#13813
    # wants a shortcut-created split to take focus, #12227 covers stale
    # active-pane state), so focus-on-split is per-creation-path today.
  fi
} >/dev/null 2>&1 &

exit 0
