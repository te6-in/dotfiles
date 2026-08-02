#!/usr/bin/env bash
# SessionStart / CwdChanged hook: make direnv fire inside the Bash tool.
#
# The Bash tool runs a non-interactive shell, so direnv's shell hook never
# triggers and .envrc-exported vars stay unset — e.g. GH_CONFIG_DIR from
# ~/Projects/_emu/.envrc, which otherwise leaves `gh` on the personal account
# inside company repos.
#
# CC sets $CLAUDE_ENV_FILE for SessionStart/CwdChanged/FileChanged hooks and
# prepends that file's contents before every Bash command. Writing direnv's
# exports there replicates the interactive-shell behavior for any .envrc you've
# `direnv allow`ed — generically, not just for GH_CONFIG_DIR.
#
# `direnv export bash` emits the load/unload diff relative to the env CC was
# launched with: entering an allowed .envrc exports its vars; leaving one emits
# the matching `unset`. Outside any .envrc it prints nothing, so the file is
# truncated empty and no stale vars linger.
#
# No-op safety: exits cleanly if $CLAUDE_ENV_FILE is unset or direnv is missing,
# and swallows direnv errors (e.g. a not-yet-`allow`ed .envrc) so a hook failure
# never blocks a Bash command.

set -uo pipefail

[ -n "${CLAUDE_ENV_FILE:-}" ] || exit 0
command -v direnv >/dev/null 2>&1 || exit 0

direnv export bash >"$CLAUDE_ENV_FILE" 2>/dev/null || true
