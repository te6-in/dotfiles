---
description: Git conventions on this machine — how commits are written and split, how repos are cloned, and where they live.
trigger: always_on
glob:
---

# Git

`git` is NOT wrapped with `op plugin run --` — it authenticates over SSH, so 1Password has nothing to route and the wrapper only adds a pointless auth prompt. Run `git push`, `git clone`, etc. plain.

## Committing

Match the repo, not your habits. Read what's already there — `git log --oneline -20` — and write in the same language and the same format those messages use. It's a per-repo convention, and the log is the only place it's written down. PR titles follow the same log, for the same reason.

Split the work into 2+ commits when it covers more than one thing — a message that needs an "and" is usually two commits.

## Clone over SSH

Clone with the SSH remote, never HTTPS. SSH is what's set up to authenticate; an HTTPS clone leaves behind a remote that can't push without a separate credential helper.

```sh
# ✅
git clone git@github.com:OWNER/REPO.git

# ❌ — HTTPS remote, fails to push later
git clone https://github.com/OWNER/REPO.git
```

`gh repo clone OWNER/REPO` works too — `gh` defaults to the SSH protocol.

## Where to clone

`cd` into the destination directory first, then clone — don't pass an explicit target path to `git clone`. Default home is `~/Projects`.

One exception, and only when the environment sets it: repos under the org in `$WORK_CLONE_ORG` go in `$WORK_CLONE_DIR` instead. Either one unset means everything lands in `~/Projects`.

```sh
# ✅ default
cd ~/Projects && git clone git@github.com:OWNER/REPO.git

# ✅ the org in $WORK_CLONE_ORG, when set
cd "$WORK_CLONE_DIR" && git clone git@github.com:"$WORK_CLONE_ORG"/REPO.git
```
