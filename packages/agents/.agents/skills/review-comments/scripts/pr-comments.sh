#!/usr/bin/env bash
# Collect every comment on a pull request — conversation comments, review
# summary bodies, and inline review threads with their resolved state — and
# print them as a finished report.
#
# READ-ONLY, and that is load-bearing. This script is on the agent permission
# allowlist by path, which means the `gh` calls inside it never reach
# gh-read-guard.sh — the hook only sees the command the agent typed. Every
# request here must therefore stay a GraphQL *query*. Never add a mutation,
# never add `-X POST`, never add a write of any kind: it would run unguarded and
# unprompted.
#
# Output is deliberately final-form text, not JSON. A caller that has to pipe
# this through `jq` rebuilds the multi-command pipeline the allowlist entry
# exists to collapse, and the permission prompts come straight back.
#
# Known cap: the comments *inside* one review thread are fetched unpaginated at
# 100. Every other connection paginates. A single thread past 100 replies would
# lose the tail, which has not happened yet and would be visible in the printed
# comment count if it did.
#
# Usage:
#   pr-comments.sh                                  # PR for the current branch
#   pr-comments.sh 1981                             # PR 1981 in the current repo
#   pr-comments.sh https://github.com/o/r/pull/1981
#   pr-comments.sh o/r#1981

set -euo pipefail

die() { printf 'pr-comments: %s\n' "$1" >&2; exit 1; }

command -v gh >/dev/null 2>&1 || die "gh not found on PATH"
command -v jq >/dev/null 2>&1 || die "jq not found on PATH"

# --- resolve owner / repo / number -------------------------------------------
arg=${1-}
case "$arg" in
  "")
    nwo=$(gh repo view --json nameWithOwner -q .nameWithOwner) \
      || die "could not resolve a GitHub repository from this directory's git remote"
    num=$(gh pr view --json number -q .number 2>/dev/null) \
      || die "no pull request found for the current branch"
    ;;
  https://*|http://*)
    nwo=$(printf '%s' "$arg" | sed -nE 's#^https?://[^/]+/([^/]+/[^/]+)/pull/[0-9]+.*$#\1#p')
    num=$(printf '%s' "$arg" | sed -nE 's#^https?://[^/]+/[^/]+/[^/]+/pull/([0-9]+).*$#\1#p')
    [ -n "$nwo" ] && [ -n "$num" ] || die "could not parse a PR URL out of: $arg"
    ;;
  */*\#*)
    nwo=${arg%%\#*}
    num=${arg##*\#}
    ;;
  *[!0-9]*)
    die "unrecognised target: $arg (want a number, a PR URL, or owner/repo#number)"
    ;;
  *)
    nwo=$(gh repo view --json nameWithOwner -q .nameWithOwner) \
      || die "could not resolve a GitHub repository from this directory's git remote"
    num=$arg
    ;;
esac

owner=${nwo%%/*}
name=${nwo##*/}

# --- fetch --------------------------------------------------------------------
# One connection per query, so `--paginate` has exactly one cursor to follow.
# `--slurp` wraps the pages into an array; the flattening below is what puts
# them back together.
gql() {
  gh api graphql --paginate --slurp \
    -F owner="$owner" -F name="$name" -F number="$num" \
    -f query="$1"
}

Q_HEAD='query($owner:String!,$name:String!,$number:Int!,$endCursor:String){
  repository(owner:$owner,name:$name){ pullRequest(number:$number){'
Q_TAIL='} } }'

conversation=$(gql "$Q_HEAD"'
    number title url baseRefName headRefName state isDraft
    author{login}
    comments(first:100,after:$endCursor){
      pageInfo{hasNextPage endCursor}
      nodes{ author{login} url createdAt body }
    }
'"$Q_TAIL") || die "failed to read conversation comments for $nwo#$num"

reviews=$(gql "$Q_HEAD"'
    reviews(first:100,after:$endCursor){
      pageInfo{hasNextPage endCursor}
      nodes{ author{login} url createdAt state body }
    }
'"$Q_TAIL") || die "failed to read review bodies for $nwo#$num"

threads=$(gql "$Q_HEAD"'
    reviewThreads(first:100,after:$endCursor){
      pageInfo{hasNextPage endCursor}
      nodes{
        isResolved isOutdated path line originalLine
        comments(first:100){ nodes{ author{login} url createdAt body } }
      }
    }
'"$Q_TAIL") || die "failed to read review threads for $nwo#$num"

# --- render -------------------------------------------------------------------
JQ_LIB='
  def clean: (. // "") | gsub("\r"; "");
  def indent($n): clean | split("\n") | map(($n * " ") + .) | join("\n");
  def who: (.author.login // "ghost");
  def pr: .[0].data.repository.pullRequest;
  def nodes(f): [ .[] | .data.repository.pullRequest | f | .nodes[] ];
'

meta=$(jq -r "$JQ_LIB"'
  pr as $p
  | "PR #\($p.number) · \($p.title)",
    $p.url,
    "\($p.baseRefName) ← \($p.headRefName) · \($p.state)\(if $p.isDraft then " · draft" else "" end) · opened by @\($p.author.login // "ghost")"
' <<<"$conversation")

conv_txt=$(jq -r "$JQ_LIB"'
  nodes(.comments)[]
  | "── conversation · @\(who) · \(.createdAt) · thread state: n/a",
    "   \(.url)",
    "",
    (.body | indent(3)),
    ""
' <<<"$conversation")

rev_txt=$(jq -r "$JQ_LIB"'
  nodes(.reviews)[]
  | select((.body // "") | gsub("\\s"; "") != "")
  | "── review body · @\(who) · \(.state) · \(.createdAt) · thread state: n/a",
    "   \(.url)",
    "",
    (.body | indent(3)),
    ""
' <<<"$reviews")

thr_txt=$(jq -r "$JQ_LIB"'
  nodes(.reviewThreads)[]
  | (if .isResolved then "RESOLVED" else "UNRESOLVED" end) as $state
  | (if .isOutdated then " · outdated" else "" end) as $stale
  | (.path // "(file unknown)") as $path
  | (.line // .originalLine) as $ln
  | (.comments.nodes | length) as $n
  | "── inline · \($path)\(if $ln then ":\($ln)" else "" end) · \($state)\($stale) · \($n) comment\(if $n == 1 then "" else "s" end)",
    (
      .comments.nodes[]
      | "   @\(who) · \(.createdAt)",
        "   \(.url)",
        "",
        (.body | indent(3)),
        ""
    )
' <<<"$threads")

n_conv=$(jq "$JQ_LIB"'nodes(.comments) | length' <<<"$conversation")
n_rev=$(jq "$JQ_LIB"'[ nodes(.reviews)[] | select((.body // "") | gsub("\\s"; "") != "") ] | length' <<<"$reviews")
n_thr=$(jq "$JQ_LIB"'nodes(.reviewThreads) | length' <<<"$threads")
n_thr_open=$(jq "$JQ_LIB"'[ nodes(.reviewThreads)[] | select(.isResolved | not) ] | length' <<<"$threads")
n_thr_c=$(jq "$JQ_LIB"'[ nodes(.reviewThreads)[] | .comments.nodes | length ] | add // 0' <<<"$threads")

printf '%s\n\n' "$meta"
printf '%s conversation · %s review body/bodies · %s inline thread(s), %s comment(s), %s unresolved\n' \
  "$n_conv" "$n_rev" "$n_thr" "$n_thr_c" "$n_thr_open"
printf 'Nothing here is filtered — CI chatter, preview links and bot walkthroughs are all still in.\n\n'

[ "$n_conv" -gt 0 ] && printf '%s\n' "$conv_txt"
[ "$n_rev"  -gt 0 ] && printf '%s\n' "$rev_txt"
[ "$n_thr"  -gt 0 ] && printf '%s\n' "$thr_txt"

if [ "$n_conv" -eq 0 ] && [ "$n_rev" -eq 0 ] && [ "$n_thr" -eq 0 ]; then
  printf 'No comments of any kind on this pull request.\n'
fi
exit 0
