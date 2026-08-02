<!--
Only Claude Code-specific instructions live here. Everything that holds regardless of
which agent is running lives in packages/agents/.agents/rules/ and reaches this machine
as ~/.claude/rules/*.md, which Claude Code loads on its own — so those files must NOT be
imported here as well, or they land in context twice.

The files that stay in instructions/ are the ones that name a Claude Code tool or setting
outright: asking-the-user (AskUserQuestion), notion (Notion MCP), model-name.
They are the adapter layer — the neutral rules say "ask the user", these say which tool
that means here.
-->

# Voice & communication

@instructions/model-name.md

# Asking & notifying

@instructions/asking-the-user.md

# Workflow integrations

@instructions/cmux.md
@instructions/linear.md
@instructions/notion.md

# Code

## Code style

Follow `~/.claude/rules/code-style.md` for every line of JS/TS/JSX you write. Read it before you start writing, unless its contents are already in context. The rule also loads on its own once you read a matching file, but writing a brand-new file triggers nothing — that is the case this line covers.
