#!/usr/bin/env bash
# PreToolUse hook (Bash): gate `gh` by read-vs-write.
#
# Motivation: read-like gh commands should be deterministically pre-approved —
# no prompt in default mode, no classifier round-trip in auto mode. Writes that
# speak to other people (comments, reviews) always ask. Everything else is left
# to the built-in permission flow, so auto mode's classifier can approve routine
# writes without interrupting:
#
#   - read-like gh (view/list/status/diff/checks/... and GET `gh api`) -> allow
#     (deterministic, skips both the prompt and the auto-mode classifier)
#   - comment/review writes (`gh issue comment`, `gh pr comment`, `gh pr review`,
#     and non-GET `gh api` on a */comments or */reviews endpoint) -> ask
#     (deterministic prompt; auto mode must not decide these on its own)
#   - `gh api graphql`, read or write -> ask. A mutation can post a comment and
#     there's no way to tell one from a query, so the whole endpoint is gated
#     rather than leaving a bypass around the rule above.
#   - any other gh (create/merge/edit/delete/POST api/unknown subcommand) ->
#     no decision (exit 0 = defer): auto mode routes it to the built-in
#     classifier, default mode prompts as usual
#   - non-gh commands -> no decision (exit 0), normal permission flow applies
#
# Safety bias: anything ambiguous is treated as NON-read, so the hook never
# auto-allows it — worst case the built-in flow classifies or prompts. Handles
# env-var prefixes (`GH_CONFIG_DIR=.. gh ..`), redirects (`> f`, `2>&1`),
# trailing background `&`, and compound commands (each segment classified
# independently).
#
# Known limits (documented, safe-by-omission): gh hidden inside `$(...)` or
# backticks isn't classified (falls through to the normal flow); rare aliases
# (`gh rs`, `gh cs`) aren't mapped and therefore defer.

set -uo pipefail

INPUT=$(cat)

TOOL=$(printf '%s' "$INPUT" | jq -r '.tool_name // empty')
[ "$TOOL" = "Bash" ] || exit 0

CMD=$(printf '%s' "$INPUT" | jq -r '.tool_input.command // empty')
[ -n "$CMD" ] || exit 0

# Fast path: if the command has no "gh" substring at all, nothing to do.
# (A `case` glob matches across newlines, unlike a line-oriented grep — so a
# multi-line command with `gh` at the start of a later line is still caught.)
case "$CMD" in
  *gh*) : ;;
  *) exit 0 ;;
esac

emit() { # $1 = permissionDecision, $2 = reason
  jq -n --arg d "$1" --arg r "$2" \
    '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:$d,permissionDecisionReason:$r}}'
}

# --- gh api: classify a request ----------------------------------------------
# echoes: read | comment | graphql | other
#   graphql iff endpoint == graphql (query-vs-mutation is undecidable here).
#   read    iff explicit method GET OR no method and no body fields.
#   comment iff non-read AND the endpoint targets a comment/review resource
#           (issue comments, PR inline comments, reviews — create/edit/delete).
gh_api_class() {
  local endpoint="" method="" has_field=0 seen_endpoint=0
  local -a toks=("$@")
  local i=0 t
  while [ $i -lt ${#toks[@]} ]; do
    t=${toks[$i]}
    case "$t" in
      -X|--method) i=$((i+1)); method=${toks[$i]:-} ;;
      --method=*)  method=${t#--method=} ;;
      -X*)         method=${t#-X} ;;
      -f|-F|--field|--raw-field|--input) has_field=1 ;;
      -f*|-F*|--field=*|--raw-field=*|--input=*) has_field=1 ;;
      -*) : ;;  # other flags (-H, -q, -i, --paginate, --cache, ...) don't write
      *)  [ $seen_endpoint -eq 0 ] && { endpoint=$t; seen_endpoint=1; } ;;
    esac
    i=$((i+1))
  done

  # graphql can't be read as query-vs-mutation, and a mutation is a fine way to
  # post a comment -> always confirm instead of letting auto mode guess
  [ "$endpoint" = "graphql" ] && { printf '%s' graphql; return; }

  local m
  m=$(printf '%s' "$method" | tr '[:lower:]' '[:upper:]')
  if [ -n "$m" ]; then
    [ "$m" = "GET" ] && { printf '%s' read; return; }   # explicit method wins
  elif [ $has_field -eq 0 ]; then
    printf '%s' read; return                            # default GET
  fi                                                    # fields, no method -> POST

  case "${endpoint%%\?*}" in                            # drop any query string
    */comments|*/comments/*|*/reviews|*/reviews/*) printf '%s' comment; return ;;
  esac
  printf '%s' other
}

# --- classify one gh segment (leading token is `gh`) --------------------------
# echoes: read | comment | graphql | other
gh_segment_class() {
  local seg=$1
  local rest=${seg#gh}          # strip leading "gh"
  rest=${rest# }                # and a following space if any

  # help / version anywhere -> harmless output
  case " $rest " in
    *" --help "*|*" -h "*|*" --version "*) printf '%s' read; return ;;
  esac

  local -a toks
  read -ra toks <<<"$rest"
  [ ${#toks[@]} -eq 0 ] && { printf '%s' read; return; }   # bare `gh` prints help

  # Skip leading global flags — cobra accepts them before the subcommand, so
  # `gh -R o/r pr comment 13 -b x` is real and must classify like `gh pr comment`.
  local base=0
  while [ $base -lt ${#toks[@]} ]; do
    case "${toks[$base]}" in
      -R|--repo) base=$((base+2)) ;;   # flag + its value (--repo=x hits the next arm)
      -*)        base=$((base+1)) ;;
      *)         break ;;
    esac
  done

  local cmd=${toks[$base]:-}
  [ -z "$cmd" ] && { printf '%s' other; return; }  # flags only, no subcommand

  case "$cmd" in
    status|search) printf '%s' read; return ;;
    api) gh_api_class "${toks[@]:$((base+1))}"; return ;;
  esac

  local subcmd=${toks[$((base+1))]:-}
  case "$subcmd" in -*) subcmd="" ;; esac

  case "$cmd $subcmd" in
    # writes aimed at a human reader -> always confirm, never auto-classify
    "issue comment"|"pr comment"|"pr review") printf '%s' comment; return ;;

    "pr view"|"pr list"|"pr status"|"pr checks"|"pr diff") printf '%s' read; return ;;
    "issue view"|"issue list"|"issue status") printf '%s' read; return ;;
    "repo view"|"repo list"|"repo read-file"|"repo read-dir"|"repo gitignore"|"repo license") printf '%s' read; return ;;
    "run view"|"run list"|"run watch") printf '%s' read; return ;;
    "workflow view"|"workflow list") printf '%s' read; return ;;
    "release view"|"release list") printf '%s' read; return ;;
    "gist view"|"gist list") printf '%s' read; return ;;
    "project view"|"project list"|"project field-list"|"project item-list") printf '%s' read; return ;;
    "discussion view"|"discussion list") printf '%s' read; return ;;
    "ruleset view"|"ruleset list"|"ruleset check") printf '%s' read; return ;;
    "cache list"|"org list"|"secret list"|"label list"|"gpg-key list"|"ssh-key list"|"alias list") printf '%s' read; return ;;
    "variable list"|"variable get") printf '%s' read; return ;;
    "config get"|"config list") printf '%s' read; return ;;
    "auth status") printf '%s' read; return ;;
    "extension list"|"extension search") printf '%s' read; return ;;
    "codespace list"|"codespace view"|"codespace ports"|"codespace logs") printf '%s' read; return ;;
    *) printf '%s' other; return ;;
  esac
}

# --- split into command segments (control operators only, not fd-dup `&`) -----
SEGMENTS=$(printf '%s' "$CMD" | perl -0777 -pe '
  s/\s*(?:&&|\|\||;|\|&|\|)\s*/\n/g;   # && || ; |& |
  s/\s+&(?=\s|$)/\n/g;                 # background & (not >& / 2>&1 / &>)
')

has_gh=0
only_gh_segments=1
any_gh_nonread=0
ask_reason=""

while IFS= read -r seg; do
  # trim
  seg=${seg#"${seg%%[![:space:]]*}"}
  seg=${seg%"${seg##*[![:space:]]}"}
  [ -n "$seg" ] || continue

  # strip leading env assignments (NAME=value ...), repeatedly
  while printf '%s' "$seg" | grep -qE '^[A-Za-z_][A-Za-z0-9_]*=[^[:space:]]*[[:space:]]+'; do
    seg=$(printf '%s' "$seg" | sed -E 's/^[A-Za-z_][A-Za-z0-9_]*=[^[:space:]]*[[:space:]]+//')
  done
  # strip a leading process wrapper
  seg=$(printf '%s' "$seg" | sed -E 's/^(command|nohup|nice|time|stdbuf)[[:space:]]+//; s/^timeout[[:space:]]+[^[:space:]]+[[:space:]]+//')

  case "$seg" in
    gh|"gh "*) : ;;
    *) only_gh_segments=0; continue ;;
  esac

  has_gh=1
  case "$(gh_segment_class "$seg")" in
    read) : ;;
    comment)
      any_gh_nonread=1
      ask_reason="GitHub 코멘트/리뷰 작성 → 명시적 확인 필요"   # most specific, always wins
      ;;
    graphql)
      any_gh_nonread=1
      [ -z "$ask_reason" ] && ask_reason="gh api graphql → 쿼리/뮤테이션 구분 불가, 명시적 확인 필요"
      ;;
    *) any_gh_nonread=1 ;;
  esac
done <<EOF
$SEGMENTS
EOF

[ $has_gh -eq 0 ] && exit 0

if [ -n "$ask_reason" ]; then
  emit ask "$ask_reason"
  exit 0
fi

if [ $any_gh_nonread -eq 0 ] && [ $only_gh_segments -eq 1 ]; then
  emit allow "gh 읽기 전용 명령 → 자동 허용"
fi
# else: non-read gh, or gh mixed with non-gh segments -> no decision (defer);
# auto mode's classifier or the normal permission flow decides
exit 0
