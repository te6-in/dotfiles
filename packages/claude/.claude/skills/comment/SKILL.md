---
name: comment
description: Record this session's decisions and findings as a new Linear comment
disable-model-invocation: true
---

Post a new comment on the Linear issue this session has been working on, recording what has been settled since your last comment.

## Steps

1. Load `linear-workflow` unless it's already in context. A comment has to follow its writing conventions — 한국어, and the `> **LLM 도구로 작성한 글 (…)**` blockquote every comment opens with — which hold from any repo, work or not, and nothing else pulls them in when this skill is invoked on its own.
2. Identify the issue this session is anchored to. If it isn't anchored to one, don't guess. In a work repo, run `linear-workflow`'s identification flow — this is one of the moments you find out the session was never tracked — and since the work is already done by then, its *When the flow runs late* sets the state. Anywhere else just ask which issue to post to; no status moves outside a work repo.
3. Scope the content to what happened **after** your last comment in this session. Don't restate what an earlier comment already covers.
4. Keep it to decisions made and findings that matter later — not a play-by-play of the work.
5. Write it as a record for whoever picks the issue up later, not as a message addressed to a reader.
