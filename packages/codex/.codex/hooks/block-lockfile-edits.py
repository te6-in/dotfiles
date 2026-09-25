#!/usr/bin/env python3
"""PreToolUse: block direct lockfile edits; allow package-manager generation.

Codex supplies apply_patch text in tool_input.command. Only patch operation
headers are paths; lockfile names in the changed file's contents are irrelevant.
The Bash check intentionally retains the original Claude hook's heuristic.
"""

import json
import posixpath
import re
import shlex
import sys


LOCKFILES = frozenset((
    "package-lock.json", "yarn.lock", "pnpm-lock.yaml", "bun.lockb", "bun.lock",
))
SHELL_WRITE_RE = re.compile(
    r"(>|>>|\btee\b|sed[^\S\n]+-i|awk[^\S\n]+-i|perl[^\S\n]+-i|cp[^\S\n]|mv[^\S\n])"
    r"[^;|&\n]*(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|bun\.lockb|bun\.lock)"
)
PATCH_HEADER_RE = re.compile(r"^\*\*\* (Add File|Update File|Delete File|Move to): (.*)$")


class InvalidInput(ValueError):
    pass


def required_text(data, field):
    value = data.get(field)
    if not isinstance(value, str) or not value.strip():
        raise InvalidInput("%s must be a nonempty string" % field)
    return value


def patch_path(raw):
    """Keep spaces in ordinary paths; accept one explicitly quoted path."""
    path = raw.strip()
    if not path:
        raise InvalidInput("patch operation has an empty path")
    if path[0] in ("'", '"'):
        try:
            parts = shlex.split(path)
        except ValueError as error:
            raise InvalidInput("patch path has invalid quoting") from error
        if len(parts) != 1 or not parts[0]:
            raise InvalidInput("patch operation must name one path")
        path = parts[0]
    if "\x00" in path:
        raise InvalidInput("patch path contains a NUL byte")
    return path


def patch_paths(command):
    lines = command.strip().replace("\r\n", "\n").split("\n")
    if not lines or lines[0] != "*** Begin Patch" or lines[-1] != "*** End Patch":
        raise InvalidInput("apply_patch command must contain a complete patch envelope")
    paths = []
    operation = None
    move_allowed = False
    for line in lines[1:-1]:
        header = PATCH_HEADER_RE.fullmatch(line)
        if header:
            kind, raw = header.groups()
            if kind == "Move to":
                if not move_allowed:
                    raise InvalidInput("Move to must immediately follow Update File")
                move_allowed = False
            else:
                operation = kind
                move_allowed = kind == "Update File"
            paths.append(patch_path(raw))
            continue
        move_allowed = False
        if line.startswith("*** ") and line != "*** End of File":
            raise InvalidInput("unrecognized apply_patch operation header")
        if operation is None:
            raise InvalidInput("patch content appears before a file operation")
        # Payload validation remains apply_patch's job. Its body lines are not
        # filenames, even when they contain lockfile names or quoted headers.
    return paths


def is_lockfile(path):
    return posixpath.basename(path.rstrip("/")) in LOCKFILES


def denial(reason):
    print(json.dumps({
        "hookSpecificOutput": {
            "hookEventName": "PreToolUse",
            "permissionDecision": "deny",
            "permissionDecisionReason": reason,
        },
    }))


def main():
    try:
        payload = json.load(sys.stdin)
        if not isinstance(payload, dict):
            raise InvalidInput("payload must be a JSON object")
        tool = required_text(payload, "tool_name")
        data = payload.get("tool_input")
        if not isinstance(data, dict):
            raise InvalidInput("tool_input must be a JSON object")

        if tool in ("Write", "Edit"):
            paths = [required_text(data, "file_path")]
        elif tool == "apply_patch":
            paths = patch_paths(required_text(data, "command"))
        elif tool == "Bash":
            command = required_text(data, "command")
            if SHELL_WRITE_RE.search(command):
                denial("This Bash command appears to modify a lockfile directly. "
                       "Use the package manager (npm/pnpm/yarn/bun add) instead "
                       "so the lockfile is regenerated atomically.")
            return 0
        else:
            return 0

        for path in paths:
            if is_lockfile(path):
                denial("Direct edit of lockfile %s is blocked. "
                       "Use the package manager (npm/pnpm/yarn/bun add) "
                       "so the lockfile is regenerated atomically." % path)
                break
        return 0
    except (InvalidInput, json.JSONDecodeError, UnicodeError, OSError, RecursionError) as error:
        # A malformed hook request must block the tool, not silently allow it.
        print("block-lockfile-edits: invalid input: %s" % error, file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
