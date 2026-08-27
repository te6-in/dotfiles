---
name: review-comments
description: >-
  Go through every comment on this branch's pull request — conversation
  comments, review summary bodies, and inline review threads alike, resolved
  ones included — and report them in one pass, each with a verdict (the problem is real / it was real and is
  already fixed / the comment is mistaken) and its resolved-or-not state on
  GitHub. Use whenever the state of PR feedback is the question: the user asks
  what the reviewers said, which comments still stand, whether a review bot's
  complaints are worth acting on, or is trying to merge and a branch protection
  rule blocks it until every conversation is resolved, so they need to know
  which threads are still open and whether any of them names a real problem.
  Also "리뷰 코멘트 봐줘", "PR에 뭐라고 달렸어", "머지하려는데 코멘트 남았어".
  Reports only — it never edits code and never resolves threads.
# No `agent:` pin: step 4 spawns subagents, which a read-only preset can't.
# `allowed-tools` is what keeps this read-only.
context: fork
allowed-tools:
  - "Bash(~/.agents/skills/review-comments/scripts/pr-comments.sh:*)"
  - "Bash(git fetch:*)"
  - "Bash(git log:*)"
  - "Bash(git show:*)"
  - "Bash(git diff:*)"
  - "Bash(git blame:*)"
  - "Read"
  - "Grep"
  - "Glob"
  - "Task"
  - "Agent"
---

Review the comments on this branch's pull request and hand back the whole set in one report.

This may run in a fork, where none of the raw material — the script's unfiltered dump, the code you read to adjudicate, the subagents' findings — crosses back. Only the report does, so read as much as the verdicts need and let the report carry all of it. It also means you can't ask anything; every judgement call below is yours, with the reasoning shown in the report.

## Steps

1. Collect the comments with the bundled script, in one call:

   ```sh
   ~/.agents/skills/review-comments/scripts/pr-comments.sh
   ```

   It resolves the current branch's pull request on its own; pass a number, a PR URL, or `owner/repo#number` to point it at a different one. Type that path literally — this file's `allowed-tools` pre-approves it exactly as written, so a rewritten path or an added pipe turns a silent call back into a permission prompt.

   Its output is the finished set, already formatted: **three** sources, not two — conversation comments, review summary bodies, and inline threads carrying their resolved state. The middle one is easy to miss and matters most here, because a review bot files its walkthrough as a review body, which neither the conversation nor the inline endpoint returns. Don't pipe the output anywhere, and don't re-fetch any of it with `gh`.
2. The script filters nothing, by design — that judgement is yours. Drop the comments that ask nothing of anyone: deploy and branch-preview URLs, CI status, coverage reports, changeset reminders, and a review bot's own summary or walkthrough of the diff. Judge by whether the comment raises a question or requests a change, not by who wrote it — review bots post real feedback alongside their summaries.
3. Keep the resolved ones. Resolution is a marker in the report, not a filter — a thread gets closed for plenty of reasons that have nothing to do with the point being answered.
4. Group what's left by what it's actually about — several comments on one function, one design decision, or one repeated pattern belong in a single group. Send each group to its own subagent, all in parallel, running on the same model as this session. Hand it the comment text and the code it points at, and ask which verdict below fits, with the evidence behind it. The subagents investigate only; they don't edit.
5. Report everything in a single message, under three headings:
   - **Real** — the problem is in the code as it stands.
   - **Already fixed** — it was real, and the current code no longer has it. Name the commit or the edit that closed it.
   - **Not a problem** — the comment is mistaken, or asks for something the code already does. Say what makes it wrong.

   Number every entry, in one sequence that runs across all three headings and never restarts. Per-heading numbering gives you three items called 2, and the user then has to name the heading as well to point at one.
6. Mark every comment with its thread state on the PR, straight from the script: `[marked as resolved]` for a thread it prints as `RESOLVED`, `[unresolved]` for `UNRESOLVED`. Only inline threads have one — conversation comments and review bodies print `thread state: n/a` because GitHub never threads them, so say that rather than inventing a state for them. Say "marked as", not "resolved" alone — the marker records a bookkeeping action someone took on GitHub, not a claim that the code was fixed, and those two come apart constantly. A thread marked resolved sitting under **Real**, or an unresolved one under **Already fixed**, is worth calling out.
7. Per comment, keep it to a few lines: link it, then say in your own words what it asks for. Assume the user has not read the thread — a verbatim paste of a long comment doesn't stand in for that, and quoting is only worth it when the comment is a line or two. Then the verdict with its evidence, and what you would do about it. Whoever acts on this has your report and nothing else, so the evidence names a commit or a `path/to/file.ts:12` and never "as seen above", and the fix is concrete enough to follow without re-deriving it.
8. Stop at the report. The user picks what to act on across the whole set, by number — don't start editing off the back of it.
