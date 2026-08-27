---
name: recap
description: Resume a past Claude Code session by ID, automatically chaining backward through any ancestor sessions and reconstructing their verbatim conversation oldest-first. Invoke when the user gives a session UUID and asks to "이어서", "context로 불러와", "이 세션 이어가자", "resume", or otherwise wants to continue a prior conversation. Distinct from `recall` (which searches by topic/keyword) — `recap` takes a known session ID and walks its lineage.
disable-model-invocation: true
---

The session to recap is: **`$ARGUMENTS`**

A deterministic script does the heavy lifting — locating the JSONL, walking the
resume-chain backward, stripping tool noise, and reconstructing the verbatim
dialogue oldest-first. Your job is to **run it and read its output**, then hand
back to the user. You do not parse the JSONL yourself, and you do not retype the
conversation.

## Steps

1. Run the script:

   ```sh
   python3 ~/.claude/skills/recap/scripts/recap.py "$ARGUMENTS"
   ```

   It writes the reconstructed conversation to a temp file and prints a summary:
   the session chain (oldest → newest, each with its `cwd`), the output file
   path, and the transcript size.

   If it instead prints `이 ID는 디스크에 없어`, tell the user that session isn't
   on disk and stop.

2. **Read the transcript file** it reports (`/tmp/recap-<id>.txt`) into context.
   It's already clean — verbatim user/assistant turns, tool calls collapsed to
   one-line `· ToolName` markers, everything else stripped.

   The script prints the file's exact line count. A single `Read` can stop before
   the end — it caps how much it returns per call (on token volume, not line
   count, so even a few-hundred-line transcript can come back truncated). So
   **confirm you've actually read every line**: if your last `Read` ended before
   the reported total, `Read` again with `offset` at the next line and keep going
   until the whole file is covered. Stopping after the first page silently drops
   the tail of the conversation.

3. The past conversation is now in your context. Give the user a one-line handoff
   — how many sessions were loaded, and where to pick up — and continue from
   there. Don't re-summarize the transcript back at the user; they can read
   it, and the point was to load it into *your* context, not to produce a recap
   document.

## Why script-driven (don't "improve" this back into a subagent)

The conversation has to end up in **this** session's context so you can continue
it. A script that parses the JSONL to a file — which you then `Read` — puts it
there as plain input tokens, with zero model generation. An earlier version of
this skill reconstructed the dialogue inside a forked subagent and returned it as
the subagent's final message; that meant the model regenerated the entire
transcript token by token, which is the slowest and most expensive part of any
LLM turn, and it had no way to avoid it. Parsing is deterministic and belongs in
code. Only the final handoff line needs you.

## What the script handles (so you don't second-guess it)

- **Chain walking** — if the recapped session began by resuming an older one
  (`/recap <uuid>`, or a pasted UUID alongside "이어서 / context로 불러와 / 다시
  읽어줘" language), the script follows that link backward, up to 10 hops, and
  orders the sessions oldest-first. It deliberately ignores UUIDs that only
  appear inside echoed command output — a `recall`/`recap` result quoted into the
  next turn would otherwise be mistaken for a parent.
- **Noise stripping** — tool calls become a single `· ToolName <hint>` line; tool
  results, thinking blocks, `<system-reminder>` envelopes, subagent sidechains,
  injected meta turns, and API-error turns ("Prompt is too long") are dropped.
- **Edit/resend dedup** — when a prompt was edited, only the version the user
  kept survives; the abandoned branch and anything under it is removed. This uses
  the JSONL's `parentUuid` tree, not fragile text matching.

If the script's output ever looks wrong, fix `scripts/recap.py` — don't route
around it by hand-parsing in the skill.
