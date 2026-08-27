<!--
Only Claude Code-specific instructions live here. Everything that holds regardless of
which agent is running lives in packages/agents/.agents/rules/ and reaches this machine
as ~/.claude/rules/*.md, which Claude Code loads on its own — so those files must NOT be
imported here as well, or they land in context twice.

The files that stay in instructions/ are the ones that name a Claude Code tool or setting
outright: asking-the-user (AskUserQuestion), notifications (PushNotification),
local-references (permissions.additionalDirectories), notion (Notion MCP), model-name.
They are the adapter layer — the neutral rules say "ask the user", these say which tool
that means here.
-->

# Voice & communication

@instructions/model-name.md

# Asking & notifying

@instructions/asking-the-user.md
@instructions/notifications.md

# Shell & execution

The Bash tool runs zsh (login, non-interactive — `~/.zshrc` is not sourced), despite the tool's name saying bash and the `Shell: fish` environment-context line saying fish; ignore both. Never write fish-only syntax (`for … end`, etc.), and don't lean on bash-isms that zsh handles differently (unquoted word splitting, 0-indexed arrays, `read -a`) — stick to POSIX-compatible syntax.

# References & dependencies

@instructions/local-references.md

# Workflow integrations

@instructions/notion.md

## Linear

Work repos — those whose git remote sits under one of the GitHub orgs in `$WORK_GITHUB_ORGS` — track their work in Linear. Run `echo $WORK_GITHUB_ORGS` if you need the list; unset means no repo is a work repo. In one of those, load the `linear-workflow` skill before your first code edit and follow it; it carries the issue-identification flow, status transitions, and the writing conventions. Load it too whenever you create or update a Linear issue, and whenever a PR's status moves — created, marked ready for review, merged — because the issue may need identifying and transitioning even in a session that never edited code and so never learned which issue it belongs to.

**To read an issue, use `linear-read-issue` instead** — it forks, reads the issue with its comments, relations, and linked Slack/Notion/PR content, and returns a brief, so none of that lands in this conversation. It stands alone: don't load `linear-workflow` first just to read something.

Anywhere else Linear is off: no issue search, no questions about issues, no remarks about its absence. Being off is silent — don't announce it, don't ask whether to make an exception.

That gate kills the automatic workflow, not the tool. If I name an issue ("ABC-1234 봐줘") or ask for something on Linear outright, do it from any repo — read it with `linear-read-issue`, and follow `linear-workflow`'s writing rules for anything you write back.

# Code

## Code style

Follow `~/.claude/rules/code-style.md` for every line of JS/TS/JSX you write. Read it before you start writing, unless its contents are already in context. The rule also loads on its own once you read a matching file, but writing a brand-new file triggers nothing — that is the case this line covers.
