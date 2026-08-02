---
name: linear-workflow
description: Linear workflow and writing conventions for work repos — identifying or creating the issue before coding starts, status transitions, decision-tracking comments, and how to write issues and comments in Korean. Load before the first code edit in a work repo, and whenever creating or updating a Linear issue. Reading an issue is a separate skill — use `linear-read-issue` for that.
---

# Linear

Applies in work repos only — those whose git remote sits under one of the GitHub orgs in `$WORK_GITHUB_ORGS`. Check with `echo $WORK_GITHUB_ORGS` and `git remote get-url origin` when it isn't already obvious. No match, or the variable unset, means stop and ignore this skill.

## Identify the issue before coding starts

**When this fires.** Before the first code-modifying tool call (`Edit`, `Write`) or before entering Plan mode — whichever comes first. Not at PR creation, not "whenever it comes up."

**What counts.** The test is whether the request introduces **new work intent** — a decision or a change a teammate would want a tracked record of. Implementation, refactor, bug fix, and small edits like typo or import cleanup all count.

**What does not.** Requests that produce no code output at all — pure codebase questions ("how does X work?", "explain Y"), reads, research. And edits that carry no new intent of their own:

- resolving rebase / merge / cherry-pick conflicts — the edits come from replaying commits that already exist, not from a new decision
- reverting or rolling back
- mechanical, decision-free changes: a rename applied across the codebase, a formatter run, a generated file refreshed
- applying review feedback on a branch whose work is already tracked by an issue

Read that list as **examples of the criterion, not the criterion itself**. Something not on it can still be exempt; something on it still needs an issue if a real decision rides along with it.

**Say it out loud when you skip.** Exempting is allowed; exempting silently is not. When you skip the flow, state it in one line — "rebase 충돌 해결이라 이슈 플로우 건너뜀" — so the user can correct you on the spot instead of finding untracked work later. The visibility is what makes this judgment call safe to delegate to you.

**When unsure, ask.** Cost of asking is low; cost of skipping and reworking is high. Err on the side of running the flow.

**Skip token.** If any user message contains the literal string `#noissue`, skip this entire flow and proceed straight to the work — no Linear search, no AskUserQuestion. This is equivalent to the user having picked "이슈 없이 진행": it persists for the rest of the session, so don't re-ask at PR time. It applies whether the token shows up in the first message or mid-session (from that point on). Don't create, update, or transition any issue for work covered by the token.

**Flow.**

- If the user named the issue (e.g. "ABC-1234", "그 이슈"), confirm and apply **In Progress** before starting.
- Otherwise, search Linear for similar/related issues based on the request (keywords from the task, affected component, etc.), then **AskUserQuestion** with:
  - Each similar issue from the search, listed individually (e.g. "ABC-1234: <title>"). Omit the group entirely if nothing relevant — no empty placeholders.
  - **"새로 만들고 나에게 할당 (create new and assign to me)"** — create a fresh issue with the request as the basis and assign to the user.
  - **"새로 만들고 나에게 할당 + 찾은 이슈 relate (create new, assign to me, relate the found issue)"** — only offer this when the search surfaced relevant issues. Same as above, then mark the new issue **related** to the surfaced issue(s). Omit entirely when nothing relevant was found.
  - **"이슈 없이 진행 (proceed without issue)"** — skip Linear entirely.
  - The user can always type a different ID via **Other**.
- "이슈 없이 진행" persists for the rest of the work — don't re-ask at PR time.
- "새로 만들고 나에게 할당" → create, assign, apply **In Progress**.
- "새로 만들고 나에게 할당 + 찾은 이슈 relate" → create, assign, apply **In Progress**, then relate the new issue to the surfaced issue(s) via `save_issue` (`relatedTo`).

**Recovery.** If you realize the checkpoint already passed without running the flow — mid-edit, after finishing edits, or mid-plan — stop right where you are. Report what's been done, then run the flow. "Already started" or "already done" is not a reason to skip.

## General

- "issue" / "이슈" / "ticket" / "티켓" in conversation always refers to a **Linear issue** — never a GitHub issue or anything else. If the user means something else (e.g. a GitHub issue), they'll say so explicitly.
- When given an ambiguous 4 digits, treat it as an issue id under the team key in the `$LINEAR_DEFAULT_TEAM_KEY` environment variable (e.g., digits `1234` resolve to `ABC-1234` if the env var is `ABC`). If the env var is not set, ask the user (via AskUserQuestion) which team key to use.
- Do not set `priority` when creating or updating Linear tasks. If the user explicitly requests it, set priority to **Urgent** (1).
- When creating new issues, always set `state` to **Todo** by default (not Triage), unless the user specifies a different status.
- When creating a new issue, set the `assignee` to me by default unless the request names a different assignee (or explicitly says to leave it unassigned). This covers direct "create an issue" requests; the issue-identification flow above already handles its own assignment.
- Do not include any Linear issue IDs (e.g., `feat/abc-1234`) or details in branch names or PR title/body. For the branch name, use a descriptive name that reflects the work being done. Example: `feat/layout-visual-snapshots`.
- Write Linear issues/comments in 한국어(Korean).
- When writing an issue **body** or a **comment** (NOT the title), prepend a blockquote with bold text that reads: `> **LLM 도구로 작성한 글 ({{the model (you)}})**`, followed by a blank line before the actual content.
- When mentioning a Linear issue in conversation, always include a markdown link: `[ABC-1234: Title](https://linear.app/teamid/issue/abc-1234/...)`.

## Reading an issue

Don't read it here. Load the **`linear-read-issue`** skill with the identifier.

It runs in a fork: it pulls the description, the full comment thread, one-hop
relations, and every linked Slack thread / Notion doc / GitHub PR, then returns a
short brief. The raw material — comment threads, PR review discussions, whole
Notion pages — never enters this conversation. That isolation is the reason it
can read everything without asking.

Reach for it whenever you need to know what an issue actually says: the user
named an issue, or a step here needs the issue's content before it can act.

## Issue Lifecycle

Status transitions:

- Starting work on an issue → **In Progress**
- PR created or work ready for review → **In Review**
- When a PR is created, attach the PR URL to the issue via `save_issue` with `links: [{ url, title }]`. Attachments show up in the issue sidebar and wire up the GitHub ↔ Linear integration.

## Decision Tracking

User likes to keep track of the decisions they and you make. When working based on a Linear (sub-)issue:

- When any design/architecture decisions are made during implementation, record them as comments on the issue. Include the reasoning (why), not just the conclusion (what). If multiple approaches were considered, briefly note why alternatives were rejected.
- When implementation deviates from the issue description, add a comment explaining what changed and why. If the deviation is significant (e.g., a planned feature was removed, the approach was fundamentally reworked), update the issue description itself to reflect the final state.
- When the issue description becomes outdated, don't modify the description; it serves as a historical record of the original design intent. Instead, add a comment noting what changed and why. This preserves the decision trail: original plan (description) → evolution (comments).
- When completing work, before updating the issue status, review the issue description and comments against actual commits. If outdated content isn't already covered by existing comments, add a comment documenting the delta. When done, update the status.
- Usually an issue is linked with a single PR and consists of multiple sub-issues. A sub-issue can be mark done when commit is made to the PR which is linked to the parent issue. When you're updating an issue (not sub-issue), don't mark it as done because it'll be marked as done when the PR gets merged.
