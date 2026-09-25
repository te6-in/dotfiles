#!/usr/bin/env bash
# PreToolUse hook (Bash): deny `rm`/`rmdir` and hand the rule back, so deletes
# go through `trash` and stay recoverable.
#
# Denies rather than rewriting. An earlier version substituted `trash` into the
# command with `updatedInput`; it deleted the right files, but left the agent
# acting on a command it had not written — rm's flags were stripped silently,
# so a `-f` that had been suppressing a missing-path error became a failure
# with no visible cause. Handing back the rule and letting the agent reissue
# the command puts the two tools' differences in front of whoever chose the
# flags, before anything runs.
#
# Denying also frees the match to be liberal: a false positive costs one retry
# rather than a wrong deletion, so command position is read broadly — chain
# operators, subshells, `sudo`/`xargs`, `find -exec` — where a rewrite could
# only safely touch what it was certain of.
#
# Known limit, safe by omission: `rm` reached through a variable or a shell
# alias is invisible here.

set -uo pipefail

for DEP in jq perl grep; do
  if ! command -v "$DEP" >/dev/null 2>&1; then
    printf 'TRASH-GATE: required command %s is unavailable; the command was not checked.\n' "$DEP" >&2
    exit 2
  fi
done

INPUT=$(cat)
if ! printf '%s' "$INPUT" | jq -se 'length == 1 and (.[0] | type == "object" and (.tool_name | type == "string") and (.tool_input | type == "object"))' >/dev/null 2>&1; then
  printf '%s\n' 'TRASH-GATE: invalid hook input; the command was not checked.' >&2
  exit 2
fi
[ "$(printf '%s' "$INPUT" | jq -r '.tool_name')" = 'Bash' ] || exit 0
if ! printf '%s' "$INPUT" | jq -e '.tool_input.command | type == "string"' >/dev/null 2>&1; then
  printf '%s\n' 'TRASH-GATE: missing command string; the command was not checked.' >&2
  exit 2
fi
CMD=$(printf '%s' "$INPUT" | jq -r '.tool_input.command // empty')
[ -n "$CMD" ] || exit 0

case "$CMD" in
  *rm*|*-delete*) : ;;
  *) exit 0 ;;
esac

# A heredoc body is a file being written, not a command being run — and a
# script being authored may legitimately call `rm`, since `trash` will not
# exist wherever that script ends up running.
SCAN=${CMD%%<<*}

# Quoted text is an argument, not a command. Without this, `grep -r 'xargs rm'`
# and any command merely naming the pattern get denied with no way through.
# Single quotes never execute anything, so they go entirely; double quotes go
# only when they carry no command substitution, which does execute.
SCAN=$(printf '%s' "$SCAN" | perl -0777 -pe '
  s/\x27[^\x27]*\x27//g;
  s/"([^"]*)"/ my $q = $1; $q =~ m{\$\(|`} ? "\"$q\"" : "" /ge;
')

# Command position only. A bare space prefix would swallow `git rm`, `docker
# rm`, `npm rm`, `brew rm` — different tools that share the name and never
# touch the working tree the way rm does.
printf '%s' "$SCAN" | grep -qE \
  -e '(^|[;&|(){`])[[:space:]]*(/bin/|/usr/bin/)?rm(dir)?([[:space:]]|$)' \
  -e '(^|[[:space:]])(sudo|xargs|command|exec|nohup|time|then|do|else)[[:space:]]+(/bin/|/usr/bin/)?rm(dir)?([[:space:]]|$)' \
  -e '-exec(dir)?[[:space:]]+(/bin/|/usr/bin/)?rm(dir)?([[:space:]]|$)' \
  -e '(^|[[:space:]])find([[:space:]]|$).*[[:space:]]-delete([[:space:]]|$)' \
  || exit 0

read -r -d '' REASON <<'MSG' || :
TRASH-GATE: from now on, delete with `trash` rather than `rm`, `rmdir`, or `find -delete`, so deletions stay recoverable. Reissue this command with `trash`.

`trash` is not `rm` under another name — read `man trash` before assuming a flag or behavior carries over.

This covers commands you run. `rm` inside a file you are writing, like a Dockerfile's `RUN rm -rf /var/lib/apt/lists/*`, stays as it is.
MSG

jq -n --arg r "$REASON" \
  '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"deny",permissionDecisionReason:$r}}'
