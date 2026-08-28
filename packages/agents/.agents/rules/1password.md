---
description: Which CLIs authenticate through 1Password, and which are deliberately left unwrapped.
trigger: always_on
glob:
---

# 1Password CLI

Always wrap `wrangler` with `op plugin run --`:

- `wrangler` → `op plugin run -- wrangler ...`

Applies to every invocation, including read-only commands (`wrangler whoami`, `wrangler tail`, etc.). If a new CLI gets a 1Password plugin in the future and the user starts using it, add it to this list.

Two CLIs are deliberately NOT wrapped:

- `git` — authenticates over SSH, so 1Password has nothing to route. Run it plain, never `op plugin run -- git ...`.
- `gh` — uses its own native login (`gh auth login`), one GitHub account per config dir. Run it plain, never `op plugin run -- gh ...`.
