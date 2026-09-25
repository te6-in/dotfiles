#!/usr/bin/env python3
import json
import shlex
import sys


READ_COMMANDS = frozenset((
    ("alias", "list"), ("auth", "status"), ("cache", "list"),
    ("codespace", "list"), ("codespace", "logs"), ("codespace", "ports"), ("codespace", "view"),
    ("config", "get"), ("config", "list"), ("discussion", "list"), ("discussion", "view"),
    ("extension", "list"), ("extension", "search"), ("gist", "list"), ("gist", "view"),
    ("gpg-key", "list"), ("issue", "list"), ("issue", "status"), ("issue", "view"),
    ("label", "list"), ("org", "list"), ("pr", "checks"), ("pr", "diff"),
    ("pr", "list"), ("pr", "status"), ("pr", "view"),
    ("project", "field-list"), ("project", "item-list"), ("project", "list"), ("project", "view"),
    ("release", "list"), ("release", "view"), ("repo", "gitignore"), ("repo", "license"),
    ("repo", "list"), ("repo", "read-dir"), ("repo", "read-file"), ("repo", "view"),
    ("ruleset", "check"), ("ruleset", "list"), ("ruleset", "view"),
    ("run", "list"), ("run", "view"), ("run", "watch"), ("secret", "list"), ("ssh-key", "list"),
    ("variable", "get"), ("variable", "list"), ("workflow", "list"), ("workflow", "view"),
))
CONFIRM_COMMANDS = frozenset((("issue", "comment"), ("pr", "comment"), ("pr", "review")))
GH_EXECUTABLES = frozenset(("gh", "/opt/homebrew/bin/gh", "/usr/local/bin/gh"))


def api_is_read(arguments):
    endpoint, method = None, None
    index = 0
    while index < len(arguments):
        token = arguments[index]
        if token in ("-X", "--method", "--cache", "-q", "--jq", "-t", "--template", "--hostname"):
            if index + 1 == len(arguments):
                return False
            if token in ("-X", "--method"):
                if method is not None:
                    return False
                method = arguments[index + 1]
            index += 2
            continue
        if token.startswith("--method=") or token.startswith("-X"):
            if method is not None:
                return False
            method = token.split("=", 1)[1] if token.startswith("--") else token[2:]
        elif token in ("--paginate", "--slurp", "--include", "-i", "--silent", "--verbose"):
            pass
        elif any(token.startswith(prefix) for prefix in ("--cache=", "--jq=", "--template=", "--hostname=")):
            pass
        elif token.startswith("-") or endpoint is not None:
            return False
        else:
            endpoint = token
        index += 1
    return (endpoint is not None and endpoint.strip("/").split("?", 1)[0] != "graphql"
            and ":" not in endpoint and method in (None, "GET"))


def segment_is_read(tokens):
    if tokens[:1] == ["command"]:
        tokens = tokens[1:]
        if tokens[:1] == ["--"]:
            tokens = tokens[1:]
    if not tokens or tokens[0] not in GH_EXECUTABLES:
        return False
    tokens = tokens[1:]
    if not tokens or tokens in (["--help"], ["-h"], ["--version"]):
        return True
    while tokens:
        if tokens[0] in ("-R", "--repo") and len(tokens) >= 2:
            tokens = tokens[2:]
        elif tokens[0].startswith("--repo=") or (tokens[0].startswith("-R") and len(tokens[0]) > 2):
            tokens = tokens[1:]
        else:
            break
    if not tokens or any(token in ("--web", "-w") for token in tokens):
        return False
    if tuple(tokens[:2]) in CONFIRM_COMMANDS:
        return False
    if tokens[0] == "api":
        return api_is_read(tokens[1:])
    return tokens[0] in ("status", "search") or tuple(tokens[:2]) in READ_COMMANDS


def is_read_command(command):
    if not isinstance(command, str) or not command.strip():
        return False
    if any(character in command for character in ("$", "`", "\n", "\r", "\\", "(", ")", "{", "}", "<", ">")):
        return False
    try:
        lexer = shlex.shlex(command, posix=True, punctuation_chars=";&|")
        lexer.whitespace_split = True
        lexer.commenters = ""
        tokens = list(lexer)
    except ValueError:
        return False
    segment = []
    for token in tokens:
        if token in ("&&", "||", ";", "|"):
            if not segment_is_read(segment):
                return False
            segment = []
        elif token and all(character in ";&|" for character in token):
            return False
        else:
            segment.append(token)
    return segment_is_read(segment)


def evaluate(payload):
    if not isinstance(payload, dict) or payload.get("hook_event_name") != "PermissionRequest":
        return None
    arguments = payload.get("tool_input")
    if payload.get("tool_name") != "Bash" or not isinstance(arguments, dict):
        return None
    if not is_read_command(arguments.get("command")):
        return None
    return {"hookSpecificOutput": {"hookEventName": "PermissionRequest", "decision": {"behavior": "allow"}}}


def main():
    try:
        result = evaluate(json.load(sys.stdin))
    except (ValueError, TypeError, RecursionError):
        result = None
    if result is not None:
        print(json.dumps(result))


if __name__ == "__main__":
    main()
