---
name: recap
description: Resume a past Claude Code session by ID, automatically chaining backward through any ancestor sessions and reconstructing their verbatim conversation oldest-first. Invoke when the user gives a session UUID and asks to "이어서", "context로 불러와", "이 세션 이어가자", "resume", or otherwise wants to continue a prior conversation. Distinct from `recall` (which searches by topic/keyword) — `recap` takes a known session ID and walks its lineage.
context: fork
agent: Explore
---

The session UUID to recap is: **`$ARGUMENTS`**

Your job: reconstruct the **verbatim** user↔assistant conversation of that session — plus any ancestor sessions it chains from — in **chronological order (oldest first)**, and return it as your final message.

This skill runs in a forked subagent (`context: fork`), so you have no access to the main conversation — everything you need is the UUID above plus the files on disk. Critically: everything you read here (`find` output, raw JSONL, parsing chatter) stays in **your** context, and **only your final message lands in the main session**. So your final message must BE the reconstructed conversation — nothing else, no preamble about what you did.

## Verbatim, not summary

Reproduce the actual user and assistant text **word-for-word**. Do not paraphrase, compress, or summarize the dialogue — the user wants the real turns to copy-paste. The one thing you strip is **tool noise**: tool-call inputs and tool results (file dumps, command output) that bloat the JSONL without being part of the conversation. Leave a single terse one-line marker where a tool ran so the narrative doesn't have holes, but drop the tool's actual I/O.

If a session's verbatim dialogue is long, your final message is long. That's expected and acceptable here — faithfulness beats brevity. There is no summarization layer between you and the main session; what you emit is what it gets, token for token.

## Why chronological order matters

Sessions chain when a session starts with the user pasting a previous session's UUID and asking to "이어서 / context로 불러와 / 이전 세션 다시 읽어줘". The newest session is the entry point, but the _context_ it depends on lives in the older one(s). Reading oldest → newest matches the actual narrative arc — original work first, each follow-up on top.

## Storage layout

- Sessions live at `~/.claude/projects/<encoded-path>/<session-id>.jsonl`.
- `<encoded-path>` is the directory the session was started in, with `/` replaced by `-`.
- JSONL: one message per line. Shape: `{ message: { role, content }, timestamp, cwd, ... }`.
- `content` is either a string, or an array of `[{ type: "text" | "tool_use" | "tool_result", text?, ... }]`.

## Algorithm

### Step 1 — Locate the session file

```sh
find ~/.claude/projects -name "$ARGUMENTS.jsonl" 2>/dev/null
```

If no match, your final message is just: the ID isn't on disk. Stop.

### Step 2 — Walk the chain backward

Starting from the given session, for each session:

1. Open the JSONL.
2. Scan the **first few user messages** (the entry-point prompts, before any tool flow gets going) for a UUID pattern: `[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}`.
3. If a UUID appears alongside "이어서 / context / 불러와 / 다시 읽어 / resume / 다 읽어 / 전부 읽어" type language, treat that UUID as the **parent session** and recurse.
4. If no parent reference exists, stop — this is the root.

Build a list `[root, ..., given_id]` (oldest → newest). The given session is the _last_ element, not the first.

Detection should be loose, not strict — match if a UUID is present AND any one of the trigger words is nearby. False positives are cheap (you read one extra session); false negatives drop context the user explicitly asked for.

```python
import json, re

UUID_RE = re.compile(r'\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b')
TRIGGER_RE = re.compile(r'(이어서|context|불러와|다시 읽|전부 읽|다 읽|resume)', re.IGNORECASE)

def find_parent(path, self_id):
    with open(path) as f:
        for i, line in enumerate(f):
            if i > 10: break  # only scan opening exchanges
            try:
                obj = json.loads(line)
            except: continue
            msg = obj.get('message', {})
            if msg.get('role') != 'user': continue
            content = msg.get('content', '')
            text = content if isinstance(content, str) else "".join(
                c.get('text', '') for c in content
                if isinstance(c, dict) and c.get('type') == 'text'
            )
            m = UUID_RE.search(text)
            if m and m.group(0) != self_id and TRIGGER_RE.search(text):
                return m.group(0)
    return None
```

### Step 3 — Reconstruct each session verbatim, oldest first

For each session in chain order, find its `cwd` (first JSONL line that has one), then walk every message and reproduce the dialogue:

- **User text** — verbatim. Strip `<system-reminder>…</system-reminder>` envelopes (injected context such as CLAUDE.md, not the user's words) and skip turns that are purely a `tool_result`. Keep whatever real prompt remains.
- **Assistant text** — verbatim.
- **Tool calls** — collapse to a single terse line: `· <ToolName> <short hint>` (file path / command / first ~80 chars of input). **Drop tool results entirely** unless a result line is itself something the user clearly said (rare).

Extraction sketch:

```python
SR_RE = re.compile(r'<system-reminder>.*?</system-reminder>', re.DOTALL)

def blocks(content):
    return [{'type': 'text', 'text': content}] if isinstance(content, str) else content

def render_session(path):
    cwd, turns = None, []
    with open(path) as f:
        for line in f:
            try:
                obj = json.loads(line)
            except: continue
            cwd = cwd or obj.get('cwd')
            msg = obj.get('message', {})
            role = msg.get('role')
            for b in blocks(msg.get('content', '')):
                if not isinstance(b, dict): continue
                t = b.get('type')
                if t == 'text':
                    text = SR_RE.sub('', b.get('text', '')).strip()
                    if text:
                        turns.append(('User' if role == 'user' else 'Assistant', text))
                elif t == 'tool_use':
                    hint = json.dumps(b.get('input', {}), ensure_ascii=False)[:80]
                    turns.append(('tool', f"· {b.get('name')} {hint}"))
                # tool_result: skip — this is the noise we strip
    return cwd, turns
```

### Step 4 — Return the reconstructed conversation

Your final message (this is exactly what the main session receives) in this shape:

```
세션 N개 체인. 오래된 것부터 원문 그대로 옮겼어. tool 노이즈는 뺐어.

═══ 세션 1/N — <session-id> · cwd: <cwd> ═══

[User]
<verbatim user text>

[Assistant]
<verbatim assistant text>
· <ToolName> <hint>

[User]
<verbatim user text>
...

═══ 세션 2/N — <session-id> · cwd: <cwd> ═══
...

어디서 이어갈까?
```

Reproduce the turns faithfully and in order. Don't editorialize between them, don't add per-session summaries — the dialogue speaks for itself. The closing "어디서 이어갈까?" is the only line you add at the end.

## Notes

- Never `cat` raw JSONL into your final message — parse it and emit only the dialogue, with tool I/O stripped.
- When scanning for parents, ignore any UUID match that equals the current session's own basename (rare self-echo) — the `self_id` guard in `find_parent` already does this.
- If the chain forks (a session references two different prior IDs in different user turns), follow the _first_ one that fires the parent pattern, and note the others as "also mentioned" at the very top — don't try to walk multiple branches.
- Cap the chain at 10 hops. If the recursion would exceed that, return what you reconstructed and say you stopped at 10.
- Framing lines (`세션 N개 체인…`, `어디서 이어갈까?`) in 한국어 반말. The dialogue itself stays verbatim in whatever language each turn was originally written.
