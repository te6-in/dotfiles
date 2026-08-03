---
name: review-comments
description: Review every comment on this branch's pull request and report them sorted by verdict
disable-model-invocation: true
---

Review the comments on this branch's pull request and hand back the whole set in one report.

## Steps

1. Find the pull request for the current branch and collect **both** the conversation comments and the inline review comments. They come from different places, so reading only one silently drops half the feedback.
2. Drop the comments that ask nothing of anyone: deploy and branch-preview URLs, CI status, coverage reports, changeset reminders, and a review bot's own summary or walkthrough of the diff. Judge by whether the comment raises a question or requests a change, not by who wrote it — review bots post real feedback alongside their summaries.
3. Keep the resolved ones. Resolution is a marker in the report, not a filter — a thread gets closed for plenty of reasons that have nothing to do with the point being answered.
4. Group what's left by what it's actually about — several comments on one function, one design decision, or one repeated pattern belong in a single group. Send each group to its own subagent, all in parallel, running on the same model as this session. Hand it the comment text and the code it points at, and ask which verdict below fits, with the evidence behind it. The subagents investigate only; they don't edit.
5. Report everything in a single message, under three headings:
   - **Real** — the problem is in the code as it stands.
   - **Already fixed** — it was real, and the current code no longer has it. Name the commit or the edit that closed it.
   - **Not a problem** — the comment is mistaken, or asks for something the code already does. Say what makes it wrong.
6. Mark every comment with ✅ when its thread is resolved on the PR and 💬 when it is still open. The marker tracks the thread's state, not the verdict; a resolved thread sitting under **Real** or an open one under **Already fixed** is worth calling out.
7. Per comment, keep it to a few lines: link it, then say in your own words what it asks for. Assume the user has not read the thread — a verbatim paste of a long comment doesn't stand in for that, and quoting is only worth it when the comment is a line or two. Then the verdict with its evidence, and what you would do about it.
8. Stop at the report. The user picks what to act on across the whole set — don't start editing off the back of it.
