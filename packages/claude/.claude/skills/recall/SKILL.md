---
name: recall
description: Find past Claude Code sessions that discussed a given topic. Returns a summary of the matched conversation plus commands to jump back into that session. Invoke when the user asks you to "find", "recall", or "search" something from previous sessions, or says they vaguely remember talking about X and want to get back to it.
context: fork
agent: Explore
---

`$ARGUMENTS` is the topic, question, or context the user wants to recall from a past conversation. Examples: "Reshaped margin implementation research", "ABC-1234" (a Linear issue), "discussion about Figma integration".

Your job: find the related past session(s) in local Claude Code session storage and report back **a summary + the session file path + a CLI command to resume** for every matching session.

This skill runs in a forked subagent (`context: fork`): you have no access to the main conversation, and only your final message returns to it. Everything you need is `$ARGUMENTS` plus the session files on disk. Do the noisy `grep`/parse work here and return only the ranked digest — that isolation is exactly what keeps the main session's context clean. Note your Bash tool calls start in the user's current working directory (the fork inherits it), but `cd` doesn't persist between calls, so keep each search command self-contained.

## Storage layout

- Sessions live at `~/.claude/projects/<encoded-path>/<session-id>.jsonl`.
- `<encoded-path>` is the directory the session was started in, with `/` replaced by `-`. E.g. cwd `/Users/me/Projects/some-project` → `-Users-me-Projects-some-project`.
- `<session-id>` is a UUID. Use it verbatim to resume the session.
- Files are JSONL — one message per line. Each line is shaped like `{ message: { role, content }, timestamp, ... }`.
- `content` is either a string, or an array of `[{ type: "text" | "tool_use" | ..., text?: string, ... }]`.

## Where to search

1. **Start from the current working directory's encoded path**:
   ```sh
   pwd=$(pwd); dir="$HOME/.claude/projects/$(echo "$pwd" | sed 's|/|-|g')"
   ```
2. **Also include the parent project's encoded path** — to catch worktrees and subdirectories. E.g. if cwd is `~/Projects/some-project-worktrees/feat-x`, also search `~/.claude/projects/-Users-me-Projects-some-project/`.
3. **Fall back to all projects** only if the above turns up nothing. Broad search is noisy — use last.

## Keyword extraction + filtering

1. Pull likely keywords from `${args}`: proper nouns, code identifiers, domain terms. Mix the user's language and English freely.
2. Use `grep -l -iE '<alternation>' <files>` to narrow down candidate files first (JSONL files can be large).
3. If multiple keywords, start with an OR (union) alternation; keep any file where at least one keyword hits. Rank by how many distinct keywords match.

Example:

```sh
grep -l -iE 'keyword1|keyword2.*<localized term>' ~/.claude/projects/-Users-me-Projects-some-project/*.jsonl
```

## Extracting the interesting content

For each candidate file:

1. **Sort by mtime descending** (recent first). Look at up to 5 closely; more than that, summarize briefly.
2. **Parse the JSONL** with Python or `jq`. Find messages whose `content` (whether string or array) contains the keyword, then grab the surrounding user message + the assistant's answer/summary.

Python sketch:

```python
import json
with open(path) as f:
    for line in f:
        obj = json.loads(line)
        msg = obj.get('message', {})
        content = msg.get('content', [])
        # content may be str or list — handle both
        text = content if isinstance(content, str) else "".join(
            c.get('text', '') for c in content if isinstance(c, dict) and c.get('type') == 'text'
        )
        if keyword.lower() in text.lower():
            ...
```

3. **Write a real summary**, not a dump: 2–5 sentences covering what the user asked and the key finding or conclusion.

## Extracting the original cwd (required for resume)

`claude --resume <id>` only finds the session when you run it **from the directory the session was originally started in** — the `~/.claude/projects/<encoded-path>/` bucket is keyed by cwd. Running it from anywhere else returns `No conversation found with session ID: ...`.

Don't try to reverse-engineer cwd by replacing `-` with `/` in the encoded path — directory names with literal `-` make that ambiguous. Read it straight from the JSONL:

```python
import json
cwd = None
with open(path) as f:
    for line in f:
        try:
            obj = json.loads(line)
        except:
            continue
        if obj.get('cwd'):
            cwd = obj['cwd']
            break
```

The first record is often a snapshot without `cwd` — keep scanning until you find one. If no line has `cwd` (very old sessions), fall back to the encoded-path reversal and flag the ambiguity to the user.

## Output format — ALWAYS report every match

If more than one session matches, **list all of them**. Don't silently pick one.

Rank by relevance (keyword density + recency) and, for each, output:

```
### <Short title / date> — <project name if useful>

**Summary**: <2–5 sentences: what was asked, what the outcome was>

- **Session file**: `<absolute path>`
- **Resume**: `cd <original-cwd> && claude -r <session-id>`
```

Rules for the resume command:

- Always include the `cd <original-cwd> &&` prefix when the session's `cwd` differs from the shell's current `pwd`. This is the common case — omitting the `cd` is what causes `No conversation found`.
- If the session's `cwd` matches the current `pwd`, you may drop the `cd` and show just `claude -r <session-id>`.
- If the original `cwd` no longer exists on disk (e.g. a deleted worktree), still print it but add a one-line note that the directory is gone — the user will need to recreate it or pick another approach.

Ordering:

- Put the most relevant one at the top, with the richest summary.
- Secondary matches can have a shorter summary (1–2 sentences), but **still include the path and resume command for each**.
- If a match is clearly unrelated even though a keyword hit, mention it briefly as a near-miss instead of dropping it silently — the user can decide.

If no matches:

- Say so directly.
- Suggest keyword variations or a broader search scope.

## Notes

- Don't `cat` whole JSONL files — filter with `grep -l` first, then parse only candidates.
- When walking `content` arrays, only `type === "text"` items carry user-visible prose; skip `tool_use` / `tool_result`.
- The session ID is the basename of the JSONL file with `.jsonl` stripped. Paste it verbatim into the resume command — but remember resume is cwd-scoped, so the `cd <original-cwd> &&` prefix is what actually makes it work.
- Users want a digest, not a transcript. Quote the original only when a specific sentence matters.
