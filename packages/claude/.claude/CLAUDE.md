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
@instructions/notion.md

## Linear

Work repos — those whose git remote sits under one of the GitHub orgs in `$WORK_GITHUB_ORGS` — track their work in Linear. Run `echo $WORK_GITHUB_ORGS` if you need the list; unset means no repo is a work repo. In one of those, load the `linear-workflow` skill before your first code edit and follow it; it carries the issue-identification flow, status transitions, and the writing conventions. Load it too whenever you create or update a Linear issue.

**To read an issue, use `linear-read-issue` instead** — it forks, reads the issue with its comments, relations, and linked Slack/Notion/PR content, and returns a brief, so none of that lands in this conversation. It stands alone: don't load `linear-workflow` first just to read something.

Anywhere else Linear is off: no issue search, no questions about issues, no remarks about its absence. Being off is silent — don't announce it, don't ask whether to make an exception.

That gate kills the automatic workflow, not the tool. If I name an issue ("ABC-1234 봐줘") or ask for something on Linear outright, do it from any repo — read it with `linear-read-issue`, and follow `linear-workflow`'s writing rules for anything you write back.

# Code

## Code style

Follow `~/.claude/rules/code-style.md` for every line of JS/TS/JSX you write. Read it before you start writing, unless its contents are already in context. The rule also loads on its own once you read a matching file, but writing a brand-new file triggers nothing — that is the case this line covers.
