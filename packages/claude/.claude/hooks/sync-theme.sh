#!/usr/bin/env bash
# UserPromptSubmit / Stop hook: keep the Material Stone theme on macOS's appearance.
#
# Claude Code's built-in "Auto (match terminal)" resolves to its own dark/light
# presets only — it never picks between two custom themes, and a custom theme is
# pinned to whatever `base` its file declares. But CC watches ~/.claude/themes/
# and reloads a changed file into every running session, and the `custom:` slug
# is the *filename*, not the `name` field inside. So settings.json can pin
# "custom:material-stone" once and this swaps that one file's contents between
# the dark and the light body. `base` rides along with the copy.
#
# Context hygiene, which is the whole reason this is shaped the way it is:
# UserPromptSubmit and SessionStart hooks inject stdout straight into Claude's
# context, and any non-zero exit puts stderr in the transcript — exit 2 on
# UserPromptSubmit even erases the prompt. So stdout is discarded, stderr goes to
# a log, and every path exits 0. `set -e` is deliberately absent: it would return
# non-zero from somewhere in the middle and defeat that.

set -uo pipefail

exec >/dev/null 2>>"$HOME/.claude/theme-sync.err"

# Both sources are already in the themes directory: material-stone's `bun run
# link` symlinks them there, which is the same way fish is pointed at its
# copy. Reading that checkout directly instead would make this the
# one thing in dotfiles that has to know where a project is cloned.
#
# Reading and writing the same directory is safe because the slugs differ: the
# two sources are suffixed, the file CC actually loads is not.
SRC_DIR="$HOME/.claude/themes"
DEST="$HOME/.claude/themes/material-stone.json"

# The key is absent entirely in light mode, not set to "Light".
if defaults read -g AppleInterfaceStyle 2>/dev/null | grep -q Dark; then
  SRC="$SRC_DIR/material-stone-dark.json"
else
  SRC="$SRC_DIR/material-stone-light.json"
fi

[ -f "$SRC" ] || exit 0

TMP="$DEST.tmp.$$"
trap 'rm -f "$TMP"' EXIT

# `name` labels the entry in /theme; left alone it would read "material-stone-dark"
# while the light body is loaded.
jq '.name = "material-stone"' "$SRC" >"$TMP" || exit 0

# Only write on an actual change — the watcher fires on every touch.
cmp -s "$TMP" "$DEST" || mv -f "$TMP" "$DEST"

exit 0
