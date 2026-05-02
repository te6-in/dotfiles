# 1Password CLI

Always wrap these CLIs with `op plugin run --` so that authentication is routed through 1Password instead of relying on shell env vars or local config files:

- `gh` → `op plugin run -- gh ...`
- `wrangler` → `op plugin run -- wrangler ...`

Applies to every invocation, including read-only commands (`gh repo view`, `wrangler whoami`, `wrangler tail`, etc.). If a new CLI gets a 1Password plugin in the future and the user starts using it, add it to this list.

See **Expensive commands** for how to handle long outputs from wrapped commands without re-triggering auth on every slice.
