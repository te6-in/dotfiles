"""Shared state for the two Codex Linear reminder hooks (Python 3.9+)."""

import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile
from urllib.parse import urlsplit


EDIT_TOOLS = frozenset(("apply_patch", "Edit", "Write"))
REMINDER = """LINEAR-CHECKPOINT: first code edit attempt of this task in a work repo.
This reminder does not block the edit or establish whether it succeeded.

Load the linear-workflow skill and follow its issue-identification flow, including
its recovery path and exemptions.

#noissue in any user message turns this reminder off for the rest of this task."""


def state_directory():
    # Separate from Claude's markers. Never use a session ID as a path.
    return Path(tempfile.gettempdir()) / ("codex-linear-checkpoint-%s" % os.getuid())


def marker_paths(payload, directory):
    sid = payload.get("session_id")
    if payload.get("agent_id") or not isinstance(sid, str) or not sid:
        return None
    key = hashlib.sha256(sid.encode("utf-8")).hexdigest()
    return directory / (key + ".skip"), directory / (key + ".done")


def create_marker(path):
    path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    try:
        fd = os.open(str(path), os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    except FileExistsError:
        return False
    os.close(fd)
    return True


def github_org(remote):
    if "://" in remote:
        try:
            url = urlsplit(remote)
            if url.hostname is None or url.hostname.lower() != "github.com":
                return None
            path = url.path.lstrip("/")
        except ValueError:
            return None
    else:
        match = re.fullmatch(r"(?:[^/@:]+@)?github\.com:(.+)", remote, re.IGNORECASE)
        if not match:
            return None
        path = match.group(1)
    parts = path.split("/")
    return parts[0].lower() if len(parts) >= 2 and all(parts[:2]) else None


def git_output(cwd, *args):
    result = subprocess.run(["git", "-C", str(cwd)] + list(args),
                            capture_output=True, text=True, timeout=2, check=False)
    return result.stdout.strip() if result.returncode == 0 else ""


def in_work_repo(payload):
    orgs = {org.lower() for org in os.environ.get("WORK_GITHUB_ORGS", "").split()}
    cwd = payload.get("cwd")
    if not orgs or not isinstance(cwd, str) or not Path(cwd).is_absolute() or not Path(cwd).is_dir():
        return False
    remote = git_output(cwd, "remote", "get-url", "origin")
    if not remote:
        remotes = git_output(cwd, "remote").splitlines()
        if remotes:
            remote = git_output(cwd, "remote", "get-url", remotes[0])
    return github_org(remote) in orgs


def handle(payload, event, directory=None):
    if not isinstance(payload, dict):
        return None
    directory = Path(directory) if directory is not None else state_directory()
    markers = marker_paths(payload, directory)
    if markers is None:
        return None
    skip, done = markers
    if event == "UserPromptSubmit":
        prompt = payload.get("prompt")
        if isinstance(prompt, str) and "#noissue" in prompt:
            create_marker(skip)
        return None
    if event != "PreToolUse" or payload.get("tool_name") not in EDIT_TOOLS:
        return None
    if skip.exists() or done.exists() or not in_work_repo(payload):
        return None
    # Parallel calls must not emit duplicate reminders. This marks an attempt,
    # since another hook or the tool itself can still reject this edit.
    if not create_marker(done):
        return None
    return {"hookSpecificOutput": {
        "hookEventName": "PreToolUse", "additionalContext": REMINDER,
    }}


def main(event):
    try:
        output = handle(json.load(sys.stdin), event)
        if output is not None:
            print(json.dumps(output))
    except (ValueError, TypeError, OSError, RecursionError, subprocess.SubprocessError) as error:
        # A reminder failure must never turn into a tool block or permission grant.
        print("LINEAR-CHECKPOINT: reminder unavailable (%s)." % type(error).__name__, file=sys.stderr)
    return 0
