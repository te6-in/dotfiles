---
name: linear-workflow
description: Linear workflow and writing conventions for work repos — identifying or creating the issue the session belongs to before coding starts, moving its status through the lifecycle, recording decisions back to it as comments, and how to write issues and comments in Korean. Load before the first code edit in a work repo, whenever creating or updating a Linear issue, and whenever a PR is created, marked ready for review, or merged — including when the session doesn't know which issue the PR belongs to and needs to identify it first. Covers writing to Linear only; does not cover fetching an existing issue's content to read.
---

# Linear

Applies in work repos only, as `CLAUDE.md` defines them. `git remote get-url origin` settles it when the repo isn't already obvious. No match, or `$WORK_GITHUB_ORGS` unset, means stop and ignore this skill.

One exception: the conventions for handling Linear content — 한국어, the attribution blockquote, the mention link format, resolving a bare 4-digit ID against `$LINEAR_DEFAULT_TEAM_KEY`, and the **Todo** / assign-to-me defaults for a new issue — apply from **any** repo, in chat as much as in what you post. The user can name an issue from anywhere, and it has to read the same wherever it was written from. Nothing else here survives outside a work repo, the issue-identification flow included.

## Identify the issue before coding starts

**When this fires.** Before the first code-modifying tool call (`Edit`, `Write`, `NotebookEdit`) or before entering Plan mode — whichever comes first. Not at PR creation, not "whenever it comes up." PR time is a backstop for work that got that far untracked, not somewhere to defer this checkpoint to.

**What counts.** The test is whether the request introduces **new work intent** — a decision or a change a teammate would want a tracked record of. Implementation, refactor, bug fix, and small edits like typo or import cleanup all count.

**What does not.** Requests that produce no code output at all — pure codebase questions ("how does X work?", "explain Y"), reads, research. And edits that carry no new intent of their own:

- resolving rebase / merge / cherry-pick conflicts — the edits come from replaying commits that already exist, not from a new decision
- reverting or rolling back
- mechanical, decision-free changes: a rename applied across the codebase, a formatter run, a generated file refreshed
- applying review feedback on a branch whose work is already tracked by an issue

Read that list as **examples of the criterion, not the criterion itself**. Something not on it can still be exempt; something on it still needs an issue if a real decision rides along with it.

**Say it out loud when you skip.** Exempting is allowed; exempting silently is not. When you skip the flow, state it in one line — "rebase 충돌 해결이라 이슈 플로우 건너뜀" — so the user can correct you on the spot instead of finding untracked work later. The visibility is what makes this judgment call safe to delegate to you.

**When unsure, ask.** Err on the side of running the flow.

**Skip token.** If any user message contains the literal string `#noissue`, skip this entire flow and proceed straight to the work — no Linear search, no AskUserQuestion. This is equivalent to the user having picked "이슈 없이 진행": it persists for the rest of the session, so don't re-ask at PR time. It applies whether the token shows up in the first message or mid-session (from that point on). Don't create, update, or transition any issue for work covered by the token.

**Start from the branch's PR.** Before searching on keywords, check whether the current branch already has a PR: `gh pr view --json url` prints it and exits non-zero when there is none, so it costs one call either way. If there is one, the issue may already be settled — this workflow attaches every PR URL to the issue its work belongs to, and Linear can resolve that attachment back to its issue. Three calls, deterministic:

1. `list_issues` with `query` set to the **whole** URL `gh` printed, `https://github.com/<owner>/<repo>/pull/<n>`. `query` is documented as title-and-description search, but a complete URL matches attachments exactly. Complete is the operative word — strip the scheme and host down to `<owner>/<repo>/pull/<n>` and the match is gone.
2. Read **the first result and nothing else.** Everything below it is fuzzy title/description matching against the URL's words, and a URL attached to no issue at all still comes back with a full page of that.
3. Confirm: `get_issue` on that first result returns `attachments` unasked, so require one whose `url` equals the PR URL. Skip this and you cannot tell a hit from the noise — the two are shaped identically.

A confirmed hit outranks anything the keyword search turns up, and goes first among the options below. A miss proves nothing — the attachment may never have been made, or the PR may predate this workflow — so fall through to the keyword search rather than calling the work untracked.

**Flow.**

- If the user named the issue (e.g. "ABC-1234", "그 이슈"), confirm and apply **In Progress** before starting — an existing issue can have sub-issues, so run the sub-issue check below first. One case doesn't settle itself: the branch's PR is attached to a **different** issue. Don't pick a winner — put both to the user via **AskUserQuestion**, saying which is which, and let them choose.
- Otherwise, search Linear for similar/related issues based on the request (keywords from the task, affected component, etc.), then **AskUserQuestion** with:
  - **The issue the branch's PR is attached to**, when the check above found one — listed first, and labelled as the issue already carrying this branch's PR so the user can tell it from a keyword guess. Evidence, not a verdict: they still pick.
  - Each similar issue from the search, listed individually (e.g. "ABC-1234: <title>"). Omit the group entirely if nothing relevant — no empty placeholders.
  - **"새로 만들고 나에게 할당 (create new and assign to me)"** — create a fresh issue with the request as the basis and assign to the user.
  - **"새로 만들고 나에게 할당 + 찾은 이슈 relate (create new, assign to me, relate the found issue)"** — only offer this when the search surfaced relevant issues. Same as above, then mark the new issue **related** to the surfaced issue(s). Omit entirely when nothing relevant was found.
  - **"이슈 없이 진행 (proceed without issue)"** — skip Linear entirely.
  - The user can always type a different ID via **Other**.
- "이슈 없이 진행" persists for the rest of the work — don't re-ask at PR time.
- "새로 만들고 나에게 할당" → create, assign, apply **In Progress**.
- "새로 만들고 나에게 할당 + 찾은 이슈 relate" → create, assign, apply **In Progress**, then relate the new issue to the surfaced issue(s) via `save_issue` (`relatedTo`).

Every **In Progress** above assumes the work is starting. When it isn't, the lifecycle below sets which state to apply instead.

**Recovery.** If you realize the checkpoint already passed without running the flow — mid-edit, after finishing edits, or mid-plan — stop right where you are. Report what's been done, then run the flow. "Already started" or "already done" is not a reason to skip.

## General

- "issue" / "이슈" / "ticket" / "티켓" in conversation always refers to a **Linear issue** — never a GitHub issue or anything else. If the user means something else (e.g. a GitHub issue), they'll say so explicitly.
- When given an ambiguous 4 digits, treat it as an issue id under the team key in the `$LINEAR_DEFAULT_TEAM_KEY` environment variable (e.g., digits `1234` resolve to `ABC-1234` if the env var is `ABC`). If the env var is not set, ask the user (via AskUserQuestion) which team key to use.
- Do not set `priority` when creating or updating Linear tasks. One exception: if the user raises priority at all, set **Urgent** (1). That they brought it up is the whole signal — use Urgent even when they name a lower level.
- When creating new issues, always set `state` to **Todo** by default (not Triage), unless the user specifies a different status.
- When creating a new issue, set the `assignee` to me by default unless the request names a different assignee (or explicitly says to leave it unassigned). This covers direct "create an issue" requests; the issue-identification flow above already handles its own assignment.
- Do not include any Linear issue IDs (e.g., `feat/abc-1234`) or details in branch names or PR title/body. For the branch name, use a descriptive name that reflects the work being done. Example: `feat/layout-visual-snapshots`.
- Write Linear issues/comments in 한국어(Korean).
- When writing an issue **body** or a **comment** (NOT the title), prepend a blockquote with bold text that reads: `> **LLM 도구로 작성한 글 ({{the model (you)}})**`, followed by a blank line before the actual content.
- When mentioning a Linear issue in conversation, always include a markdown link: `[ABC-1234: Title](https://linear.app/teamid/issue/abc-1234/...)`.

## Reading an issue

Don't read it here. Load the **`linear-read-issue`** skill with the identifier —
including when a step in this skill needs to know what an issue says before it
can act.

## Issue Lifecycle

**Check the state, then apply it.** Before each transition below, read the issue's current state and move it yourself when it hasn't already moved. The PR link works the same way: look at the issue's attachments and add the URL when it isn't there. Nothing else is guaranteed to do either for you, and the failure is silent — an issue nobody moves sits in **In Review** forever, and a PR that was never attached leaves no trace on Linear at all, since `linear-read-issue` finds PRs only in the attachments of the issue it was pointed at.

Every transition and every link below lands on **the issue this session's work belongs to** — usually whatever the identification flow settled on, but just as well one you arrived at any other way, sub-issue or not. A PR here covers one sub-issue sometimes and a whole parent other times, so that single issue is the only target that holds in both cases. Nothing below moves an issue the work doesn't belong to; a parent is not swept along with its child.

- Starting work → **In Progress**
- PR opened, draft or not → **In Review**. A draft counts; don't wait for it to be marked ready.
- PR merged → **Done**

No kind of issue is exempt from these three states. A sub-issue runs them like anything else — it does not go **Done** early just because the commit implementing it has landed.

**Arriving with the work already done.** The three states assume work is starting. Every other entry point — a PR event, `/comment`, recovery after the identification checkpoint slipped — reaches this list with some or all of the work already finished. Set the state the work is actually in, and don't walk the issue through the ones it skipped: a merged PR's issue goes straight to **Done**, not In Progress and then twice more.

Attach the PR URL to the anchored issue via `save_issue` with `links: [{ url, title }]`, the first moment you know both — usually at PR creation, later if the issue only got identified afterwards. It surfaces in that issue's sidebar, and it is the only record tying the two together.

Get the target right the first time: `links` is append-only and `delete_attachment` is denied, so a URL attached to the wrong issue is one you cannot take back.

### Whose issue is it

Before transitioning an issue, check whether anything hangs off it: `list_issues` with `parentId` set to that issue and `includeArchived: false`. That flag defaults to **true**, and an issue whose sub-issues were all archived or cancelled would otherwise read as shared forever.

**No sub-issues** — effectively solo work. Own the full lifecycle, **Done** included, and move it without asking.

**Has sub-issues** — other people's work sits underneath, and the status is a signal they read. Ask via **AskUserQuestion** before every transition on that issue, **In Progress** and **In Review** included, not just **Done**.

Run this on whatever issue you are about to move, a sub-issue included — a sub-issue can have children of its own. And it is that issue's own children that decide, never its parent's: being someone's sub-issue doesn't make an issue shared.

### When you don't know which issue

Every transition above assumes the session is anchored to an issue. Often it isn't — the branch was picked up mid-way, or the session opened with "push하고 PR 올려줘" and never passed the edit-time checkpoint.

Three PR events are the backstop. On each, when no issue is in hand, run the identification flow from the top of this skill before touching Linear:

- PR opened, draft or not
- draft PR marked ready for review — no new state, but the **In Review** the draft already owed may never have been applied, and the issue may still be unidentified
- PR merged

The attachment lookup that flow opens with runs here with the URL already in hand, so skip the `gh` call. It is worth running on the ready-for-review and merged events, and on any branch picked up mid-way; on a PR you opened moments ago it can only miss, since nothing has been attached to it yet.

The flow searches on "the request", and at PR time there may not be one — the session never edited code. Take the keywords off the branch name and the PR title instead, and the diff if those are too thin to search on.

Then set the state the PR is actually in. Everything else holds — the URL still gets attached, and the sub-issue check still runs before anything moves.

**What skips it.** `#noissue`, and a "이슈 없이 진행" already chosen this session — both persist through PR time, as stated above. Work exempted at the edit-time checkpoint stays exempt when the PR adds no new intent of its own; that call is yours, and the one-line "say it out loud when you skip" rule applies here too.

That last one — the intent exemption, **not** `#noissue` and not "이슈 없이 진행" — means no new issue gets created, not that an existing one goes unmoved. Review feedback is the case: it was exempt precisely because an issue already tracks that branch. Identify that issue at the PR event and transition it to the state the work is actually in. Skipping here is how a tracked branch merges with its issue still sitting in **In Review**. The two opt-out tokens are absolute by contrast: under either one, nothing on Linear is created, updated, or transitioned at all.

## Decision Tracking

User likes to keep track of the decisions they and you make. When working based on a Linear issue:

- When any design/architecture decisions are made during implementation, record them as comments on the issue. Include the reasoning (why), not just the conclusion (what). If multiple approaches were considered, briefly note why alternatives were rejected.
- When implementation deviates from the issue description, add a comment explaining what changed and why. Don't edit the description to match — it is the record of the original design intent, and the trail is meant to read original plan (description) → evolution (comments). When a deviation is big enough that leaving the description standing feels wrong — a planned feature dropped, the approach reworked from the ground up — **AskUserQuestion** before touching it. Don't decide that one either way on your own.
- When completing work, before updating the issue status, review the issue description and comments against actual commits. If outdated content isn't already covered by existing comments, add a comment documenting the delta. Then transition it.
