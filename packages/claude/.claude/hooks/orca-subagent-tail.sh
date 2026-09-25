#!/usr/bin/env bash
# Renders one Claude Code subagent's transcript live. Runs inside the Orca pane
# that orca-subagent-pane-start.sh splits off; not meant to be called directly.
#
# Behaviour comes in as arguments, not environment: Orca spawns this pane itself
# rather than forking from the agent, so none of the caller's ORCA_SUBAGENT_PANE_*
# settings reach it.
set -uo pipefail

JOB=${1:?usage: orca-subagent-tail.sh <job-file>}
[ -r "$JOB" ] || { printf '\033[31mjob file unreadable: %s\033[0m\n' "$JOB"; exec "${SHELL:-/bin/zsh}" -l; }

{ read -r LOG; read -r LABEL; read -r DONE_FLAG; read -r ON_DONE; read -r CLOSE_AFTER; } < "$JOB"
LABEL=${LABEL:-subagent}
ON_DONE=${ON_DONE:-prompt}
CLOSE_AFTER=${CLOSE_AFTER:-10}
FILTER="$(dirname "$0")/orca-subagent-format.jq"

# The spawn-time sidecar carries what the pane header actually wants: the task's
# own description, the model it got, and how deep it sits. `agent_type` alone
# cannot tell two parallel agents apart.
META="${LOG%.jsonl}.meta.json"
HEADER="$LABEL"
if [ -f "$META" ] && command -v jq >/dev/null 2>&1; then
  HEADER=$(jq -r '[(.description // empty), (.agentType // empty),
                   ((.model // empty) | sub("^claude-"; "") | sub("-[0-9]{8}$"; "")),
                   (if (.spawnDepth // 1) > 1 then "depth \(.spawnDepth)" else empty end)]
                  | map(select(. != "")) | join(" · ")' "$META" 2>/dev/null)
  [ -z "$HEADER" ] && HEADER="$LABEL"
fi

# Leading blank line: Orca echoes the launch command right above this, and the
# header reads as part of it otherwise.
printf '\n\033[1m%s\033[0m\n' "$HEADER"

# Seconds between the transcript's first and last entry, rendered as 1m 4s.
elapsed() {
  command -v jq >/dev/null 2>&1 || return 0
  local first last f l d
  first=$(head -n 1 "$LOG" 2>/dev/null | jq -r '.timestamp // empty' 2>/dev/null)
  last=$(tail -n 1 "$LOG" 2>/dev/null | jq -r '.timestamp // empty' 2>/dev/null)
  [ -n "$first" ] && [ -n "$last" ] || return 0
  f=$(date -u -j -f '%Y-%m-%dT%H:%M:%S' "${first%.*}" +%s 2>/dev/null) || return 0
  l=$(date -u -j -f '%Y-%m-%dT%H:%M:%S' "${last%.*}" +%s 2>/dev/null) || return 0
  d=$((l - f))
  [ "$d" -lt 0 ] && return 0
  if [ "$d" -ge 60 ]; then printf '%dm %ds' $((d / 60)) $((d % 60)); else printf '%ds' "$d"; fi
}

# The hook fires at spawn; the transcript may not exist for a beat.
for _ in $(seq 1 100); do
  [ -f "$LOG" ] && break
  sleep 0.1
done

if [ ! -f "$LOG" ]; then
  printf '\033[31mtranscript never appeared\033[0m\n'
  exec "${SHELL:-/bin/zsh}" -l
fi

# -F survives the rotation/replace that a rewritten transcript can look like.
# --unbuffered so lines land as they are appended, not per 4KB block.
# Wrapped in a subshell so both halves are children of one PID: backgrounding the
# bare pipeline would hand back jq's PID, leaving `tail -F` a sibling that
# survives the kill and holds the pane's stdout open forever.
( tail -n +1 -F "$LOG" 2>/dev/null \
    | jq --unbuffered -r --arg HOME "$HOME" -f "$FILTER" 2>/dev/null ) &
RENDER_PID=$!

close_self() {
  # Both files have served their purpose by now; nothing else reads them, and
  # they would otherwise pile up one pair per subagent until the OS clears TMPDIR.
  rm -f "$JOB" "$DONE_FLAG"
  if [ -n "${ORCA_TERMINAL_HANDLE:-}" ] && command -v orca >/dev/null 2>&1; then
    orca terminal close --terminal "$ORCA_TERMINAL_HANDLE" >/dev/null 2>&1
  fi
  exit 0
}

# A subagent the user stops never reaches SubagentStop, so the flag it would
# raise never arrives. Closing the pane does not end this process either — Orca
# parks a closed pane's PTY rather than killing it, so there is no SIGHUP. Left
# alone the loop below runs forever, and every stopped agent leaks a tail and a
# jq. Treat a transcript that has stopped growing for this long as gone.
STALE_AFTER=600
STOPPED=0

if [ -n "$DONE_FLAG" ]; then
  LAST_SIZE=$(wc -c < "$LOG" 2>/dev/null || echo 0)
  LAST_CHANGE=$(date +%s)

  while [ ! -f "$DONE_FLAG" ]; do
    # Nothing will ever set the flag if the render died; fall through to a shell.
    kill -0 "$RENDER_PID" 2>/dev/null || break
    sleep 0.4

    SIZE=$(wc -c < "$LOG" 2>/dev/null || echo 0)
    if [ "$SIZE" != "$LAST_SIZE" ]; then
      LAST_SIZE=$SIZE
      LAST_CHANGE=$(date +%s)
    elif [ $(($(date +%s) - LAST_CHANGE)) -ge "$STALE_AFTER" ]; then
      STOPPED=1
      break
    fi
  done

  if [ -f "$DONE_FLAG" ] || [ "$STOPPED" = 1 ]; then
    # SubagentStop fires before the last lines are flushed to the transcript.
    # The render is left running rather than killed: a finished agent appends
    # nothing more, so it just idles, and killing it would print bash's
    # "Terminated: 15 …" job notice into the pane. It dies with the pane.
    sleep 0.8

    [ "$ON_DONE" = "close" ] && close_self

    TOOK=$(elapsed)
    WORD=finished
    [ "$STOPPED" = 1 ] && WORD="stopped"
    HEAD=$(printf '\033[1m%s\033[0m%s' "$WORD" "$([ -n "$TOOK" ] && printf ' \033[2m· %s\033[0m' "$TOOK")")
    printf '\n\033[2m%s\033[0m\n' "──────────────────────────────────────────"

    # Measured: by the time the countdown starts, stdin already holds at least
    # one byte, so the first `read` returned immediately and the pane closed
    # after drawing a single frame. What writes it is unconfirmed — Orca leaves
    # focus reporting off by default and disables it after replay, so it is
    # probably not a focus report. Draining first is what fixes it; the escape
    # filter below is insurance against a terminal reply arriving mid-countdown.
    while read -r -s -n 256 -t 0.05 _ 2>/dev/null; do :; done

    ESC=$'\033'
    # Returns 0 only for a real keypress.
    wait_for_key() {
      local key
      read -r -s -n 1 -t "$1" key 2>/dev/null || return 1
      if [ "$key" = "$ESC" ]; then
        while read -r -s -n 1 -t 0.02 _ 2>/dev/null; do :; done
        return 1
      fi
      return 0
    }

    if [ "$CLOSE_AFTER" -gt 0 ] 2>/dev/null; then
      # One second per tick so a keypress lands immediately rather than after the
      # rest of the countdown; the carriage return redraws one line in place.
      i=$CLOSE_AFTER
      while [ "$i" -gt 0 ]; do
        printf '\r\033[2K%s \033[2m· press any key to close · closing in %ds\033[0m ' "$HEAD" "$i"
        wait_for_key 1 && break
        i=$((i - 1))
      done
    else
      printf '%s \033[2m· press any key to close this pane\033[0m ' "$HEAD"
      while ! wait_for_key 60; do :; done
    fi

    printf '\n'
    close_self
  fi
fi

# Only reached if the render stopped on its own; keep a shell so the pane
# survives instead of vanishing with whatever went wrong still on screen.
wait "$RENDER_PID" 2>/dev/null
exec "${SHELL:-/bin/zsh}" -l
