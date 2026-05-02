# Linear

- "issue" / "이슈" / "ticket" / "티켓" in conversation always refers to a **Linear issue** — never a GitHub issue or anything else. If the user means something else (e.g. a GitHub issue), they'll say so explicitly.
- When given an ambiguous 4 digits, treat it as an issue id under the team key in the `$LINEAR_DEFAULT_TEAM_KEY` environment variable (e.g., digits `1234` resolve to `ABC-1234` if the env var is `ABC`). If the env var is not set, ask the user (via AskUserQuestion) which team key to use.
- Do not set `priority` when creating or updating Linear tasks. If the user explicitly requests it, set priority to **Urgent** (1).
- When creating new issues, always set `state` to **Todo** by default (not Triage), unless the user specifies a different status.
- Do not include any Linear issue IDs (e.g., `feat/abc-1234`) or details in branch names or PR title/body. For the branch name, use a descriptive name that reflects the work being done. Example: `feat/layout-visual-snapshots`.
- Write Linear issues/comments in 한국어(Korean).
- When writing an issue **body** or a **comment** (NOT the title), prepend a blockquote with bold text that reads: `> **LLM 도구가 작성한 글 ({{the model (you)}})**`, followed by a blank line before the actual content.
- When mentioning a Linear issue in conversation, always include a markdown link: `[ABC-1234: Title](https://linear.app/teamid/issue/abc-1234/...)`.

## Issue Lifecycle

Status transitions:

- Starting work on an issue → **In Progress**
- PR created or work ready for review → **In Review**
- When a PR is created, attach the PR URL to the issue via `save_issue` with `links: [{ url, title }]`. Attachments show up in the issue sidebar and wire up the GitHub ↔ Linear integration.

### Identify the issue before coding starts

**When this fires.** Before the first code-modifying tool call (`Edit`, `Write`) or before entering Plan mode — whichever comes first. Not at PR creation, not "whenever it comes up."

**What counts.** Any request that will result in code changes — implementation, refactor, bug fix, and small edits like typo or import cleanup. Exempt: pure codebase questions ("how does X work?", "explain Y"), reads, and research that produces no code output.

**When unsure, ask.** Cost of asking is low; cost of skipping and reworking is high. Err on the side of running the flow.

**Flow.**

- If the user named the issue (e.g. "ABC-1234", "그 이슈"), confirm and apply **In Progress** before starting.
- Otherwise, search Linear for similar/related issues based on the request (keywords from the task, affected component, etc.), then **AskUserQuestion** with:
  - Each similar issue from the search, listed individually (e.g. "ABC-1234: <title>"). Omit the group entirely if nothing relevant — no empty placeholders.
  - **"새로 만들고 나에게 할당 (create new and assign to me)"** — create a fresh issue with the request as the basis and assign to the user.
  - **"이슈 없이 진행 (proceed without issue)"** — skip Linear entirely.
  - The user can always type a different ID via **Other**.
- "이슈 없이 진행" persists for the rest of the work — don't re-ask at PR time.
- "새로 만들고 나에게 할당" → create, assign, apply **In Progress**.

**Recovery.** If you realize the checkpoint already passed without running the flow — mid-edit, after finishing edits, or mid-plan — stop right where you are. Report what's been done, then run the flow. "Already started" or "already done" is not a reason to skip.

## Decision Tracking

User likes to keep track of the decisions they and you make. When working based on a Linear (sub-)issue:

- When any design/architecture decisions are made during implementation, record them as comments on the issue. Include the reasoning (why), not just the conclusion (what). If multiple approaches were considered, briefly note why alternatives were rejected.
- When implementation deviates from the issue description, add a comment explaining what changed and why. If the deviation is significant (e.g., a planned feature was removed, the approach was fundamentally reworked), update the issue description itself to reflect the final state.
- When the issue description becomes outdated, don't modify the description; it serves as a historical record of the original design intent. Instead, add a comment noting what changed and why. This preserves the decision trail: original plan (description) → evolution (comments).
- When completing work, before updating the issue status, review the issue description and comments against actual commits. If outdated content isn't already covered by existing comments, add a comment documenting the delta. When done, update the status.
- Usually an issue is linked with a single PR and consists of multiple sub-issues. A sub-issue can be mark done when commit is made to the PR which is linked to the parent issue. When you're updating an issue (not sub-issue), don't mark it as done because it'll be marked as done when the PR gets merged.
