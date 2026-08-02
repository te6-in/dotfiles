---
name: linear-read-issue
description: Read a Linear issue and everything hanging off it — description, the full comment thread, one-hop relations, and every linked Slack thread, Notion document, Linear document, and GitHub PR — then hand back a short brief. Invoke whenever an issue's content is needed, whether the user named an issue ("ABC-1234 봐줘"), asked what an issue says, or a step in `linear-workflow` needs to know the issue before acting on it. Reads only; never writes to Linear.
context: fork
agent: Explore
---

The issue to read is: **`$ARGUMENTS`**

Pull in the issue and everything hanging off it, then return a brief.

This runs in a fork with a read-only tool set. Nothing you fetch reaches the main
conversation — only your final message does. That is the whole point: **be greedy
about fetching, strict about what you return.** The caller wants to understand
the issue without paying for the raw material.

Two consequences of being a fork, both load-bearing:

- **You cannot ask the user anything.** No AskUserQuestion, no clarifying round
  trip. Every "should I read this?" is already answered below: yes. If something
  is genuinely unresolvable, say so in the brief and return — don't guess.
- **`$ARGUMENTS` is your only input.** Don't assume you can see what the main
  conversation was doing, or why it wants this issue.

## Load the tools first

Tool search is on, so these arrive deferred. Pull them in **one** call — the
names are exact, and a keyword search for "linear" wastes a round trip:

```
ToolSearch  select:mcp__plugin_linear_linear__get_issue,mcp__plugin_linear_linear__list_comments,mcp__plugin_linear_linear__get_document,mcp__plugin_linear_linear__get_attachment,mcp__plugin_linear_linear__list_teams,mcp__plugin_slack_slack__slack_read_thread,mcp__plugin_Notion_notion__notion-fetch
```

Below they're referred to by their short names (`get_issue`, `notion-fetch`, …).

## Resolve the identifier

`$ARGUMENTS` is normally an identifier (`ABC-1234`) or a Linear URL. Bare digits
resolve against `$LINEAR_DEFAULT_TEAM_KEY` — `1234` with the key `ABC` means
`ABC-1234`. If it's bare digits and the env var is unset, stop and return one
line saying the team key is missing; the caller will ask the user.

An identifier that already carries a team key is taken as given — never swap in
the default key because the lookup failed. When `get_issue` comes back not-found,
`list_teams` separates the two causes worth distinguishing: a team key that
doesn't exist in the workspace, versus a valid key with a bad issue number. Say
which one it was.

## Fetch

In this order. Steps 3 and 4 are independent — batch those calls.

**1. The issue.** `get_issue` with `includeRelations: true` (it defaults to
false). Leave `includeCustomerNeeds` and `includeReleases` off.

**2. The comment thread.** `list_comments` with `issueId`. Always — `get_issue`
returns the description but not the comments, and the discussion is where intent,
corrections, and reversals live. Read every one. Inline comments carry
`quotedText`, the description snippet they're anchored to; a comment that
contradicts the line it quotes is exactly the kind of thing the brief must catch.

**3. Everything linked.** Read all of it, without asking:

| Link type | How |
|---|---|
| Slack thread | `slack_read_thread` |
| Notion page | `notion-fetch` |
| Linear document | `get_document` |
| GitHub PR | `gh` — see below |
| Anything else in `attachments` | `get_attachment` |

**4. Relations, one hop.** For each related / blocking / blocked-by / duplicate
issue, `get_issue` for title, state, and description. Do **not** fetch their
comments, and do **not** recurse into their relations. One hop, then stop.

### Reading a linked PR

Always read it — no asking. Read-only `gh` is pre-approved by the
`gh-read-guard.sh` hook, so these run without a permission prompt:

```sh
gh pr view <n> --repo <owner/repo> --comments   # conversation tab
gh api repos/<owner>/<repo>/pulls/<n>/comments  # inline review comments
```

Both are needed: `--comments` does not include inline review comments. What
matters is the review discussion — what got pushed back on, what got conceded.

Stay out of the diff by default. Pull `gh pr diff` only when the discussion turns
on a specific change and you can't tell what happened without it, and then only
for the files in question.

## Return a brief

Not a transcript. Someone who reads your output should be able to act on the
issue without opening it.

Write it in the issue's own language — these are usually Korean; don't translate.
In Korean use 반말: this is a handoff to the calling agent, not a message to a
person, so the 높임말 rule for outbound messages doesn't apply. Keep the
model-name format `Claude {Family} {Version} {Variant}` if you refer to yourself.
No emoji.

````markdown
## ABC-1234: <title>

<linear url> · <state> · <assignee> · <project/cycle, if set>

### 무엇을 하려는 일인가

2-4문장. 배경과 목표. description 요약이 아니라, 코멘트까지 읽은 뒤의 현재 이해.

### 결정된 것

- 결정과 그 이유. 뒤집힌 결정은 뒤집혔다고 명시.

### 열려 있는 것

- 아직 안 정해진 것, 이견이 남은 것. 없으면 "없음".

### 그대로 살려야 하는 것

- 요약하면 죽는 것만: 정확한 API/필드명, 문안 원문, 수치 조건, 기한.
- 인용은 짧게. 없으면 이 섹션 통째로 생략.

### 연결된 자료

- [owner/repo#123](url) — Open, 리뷰에서 X 지적됨 → Y로 합의
- Slack #channel (7/20) — 한 줄
- Notion <제목> — 한 줄

### 관련 이슈

- ABC-1200: <title> — blocks, In Progress — 한 줄
````

Rules for the brief:

- **Say what wasn't there.** "코멘트 없음", "연결된 자료 없음". Silence reads as
  "I didn't check"; the caller can't tell the difference from here.
- **Attribute contested points.** When people disagreed, name who wanted what.
  A flattened "논의 끝에 A로 결정" hides that it's still live.
- **Separate the issue from your read of it.** If you're inferring, mark it —
  `추정:`. The caller will act on this and can't see your sources.
- **Don't pad.** Drop any section with nothing in it (except 열려 있는 것, where
  "없음" is real information). A six-line brief for a thin issue is correct.
- **Don't propose an implementation.** Report what the issue and its discussion
  say. Deciding what to do next is the caller's job.
