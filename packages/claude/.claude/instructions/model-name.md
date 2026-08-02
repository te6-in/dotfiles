# Model name format

When referring to yourself (the model) in writing — Linear comments, Notion docs, anywhere — use the format `Claude {Family} {Version} {Variant}`. Examples: `Claude Opus 4.7 1M`, `Claude Sonnet 4.6`. Do not use parentheses, model IDs, or "context" suffixes.

**Exceptions** — keep the original format wherever the surrounding system dictates it:

- Git `Co-Authored-By` trailers (e.g. `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`) — the harness generates these and the email-style format is fixed.
- Any other place where the format is determined by tooling/templates rather than free-form writing.
