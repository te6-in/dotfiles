#!/usr/bin/env python3
import json
import hashlib
import os
from pathlib import Path
import sys
import tempfile
from datetime import datetime, timezone


TOOL_NAMES = frozenset((
    "mcp__codex_apps__slack_slack_send_message",
    "mcp__codex_apps__slack__slack_send_message",
))


def evaluate(payload, environ):
    if not isinstance(payload, dict) or payload.get("hook_event_name") != "PermissionRequest":
        return None
    if payload.get("tool_name") not in TOOL_NAMES:
        return None
    arguments = payload.get("tool_input")
    if not isinstance(arguments, dict):
        return None
    channel = arguments.get("channel_id")
    if not isinstance(channel, str) or not channel:
        return None
    targets = {environ.get(name) for name in ("SLACK_SELF_USER_ID", "SLACK_SELF_DM_CHANNEL_ID")}
    targets.discard(None)
    targets.discard("")
    if channel not in targets:
        return None
    return {"hookSpecificOutput": {
        "hookEventName": "PermissionRequest", "decision": {"behavior": "allow"},
    }}


def main():
    try:
        payload = json.load(sys.stdin)
        result = evaluate(payload, os.environ)
    except (ValueError, TypeError, RecursionError):
        result = None
    if result is not None:
        try:
            record_approval(payload)
        except OSError:
            pass
        print(json.dumps(result))


def record_approval(payload, directory=None):
    session = payload.get("session_id")
    if not isinstance(session, str) or not session:
        return
    directory = Path(directory) if directory is not None else Path(tempfile.gettempdir()) / (
        "codex-slack-self-dm-%s" % os.getuid())
    directory.mkdir(mode=0o700, parents=True, exist_ok=True)
    target = directory / (hashlib.sha256(session.encode()).hexdigest() + ".json")
    record = {key: payload.get(key) for key in ("session_id", "turn_id", "hook_event_name", "tool_name")}
    record.update(channel_id=payload["tool_input"]["channel_id"], approved_at=datetime.now(timezone.utc).isoformat())
    with tempfile.NamedTemporaryFile(mode="w", dir=str(directory), delete=False) as output:
        json.dump(record, output)
        output.write("\n")
        temporary = Path(output.name)
    os.replace(str(temporary), str(target))


if __name__ == "__main__":
    main()
