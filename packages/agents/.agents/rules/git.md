---
description: Git conventions on this machine — how commits are written and split, how repos are cloned, and where they live.
trigger: always_on
glob:
---

# Git

## Committing

Match the repo, not your habits. Read what's already there — `git log --oneline -20` — and write in the same language and the same format those messages use. PR titles follow the same log.

Split the work into 2+ commits when it covers more than one thing — a message that needs an "and" is usually two commits.

## Clone over SSH

Clone with the SSH remote, never HTTPS.

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
