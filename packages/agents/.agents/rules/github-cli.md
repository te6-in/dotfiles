---
description: Working with GitHub through the `gh` CLI — links, pull requests, and Actions runs.
trigger: always_on
glob:
---

# GitHub CLI

`gh` authenticates via its own native login (`gh auth login`), NOT `op plugin run --`.

## Reading github.com links

When given a `github.com` URL, read it with `gh` — never `WebFetch`. `gh` is authenticated, returns structured data, and works on private repos; `WebFetch` gets you a rendered HTML wrapper or a 404.

One gotcha worth calling out: PR inline review comments don't show up in `gh pr view --comments` (that's only the conversation tab). Use `gh api repos/OWNER/REPO/pulls/N/comments` instead.

## Pull Requests

When creating a PR, use the repository's **default branch** as the base branch. Always look it up — the `Main branch` line in the session's git status is a guess, not the answer. One exception: when this branch sits on another branch that has its own open PR, base it on that branch instead — that's a stacked PR, and targeting the default branch would put the parent's commits in this diff.

```sh
git symbolic-ref --short refs/remotes/origin/HEAD   # → origin/dev
```

Always leave the PR body empty (pass `--body ""`). Do not generate a summary or description.

After creating a PR, always report it to the user in this format:

```
[owner/repo#NUMBER](PR URL) (base-branch ← head-branch)
```

Example: `[owner/repo#1234](https://github.com/owner/repo/pull/1234) (main ← fix/some-bug)`

In a repo that tracks its work in Linear, name the related issue in that report too, as a markdown link. That's the report only — the PR itself carries no issue ID. Where Linear isn't in play, say nothing about it either way.

### Keeping the title current

A title is written once and then goes stale on its own — scope grows after review, a retarget moves part of the diff into the base. Nobody notices, because the title is the one part of a PR that never shows up in a diff. And it isn't only a label: the squash merge below takes it as the commit subject, so a stale one lands on the default branch for good.

So after pushing to a branch that already has an open PR, check the title against what the branch now does:

```sh
gh pr view --json number,title   # exits non-zero when the branch has no PR
git log --oneline origin/<base>..HEAD
```

That's one call either way, so the check costs the same whether a PR exists or not.

When the title no longer covers the work, don't retitle silently — it notifies everyone on the PR. Ask the user, putting the proposed title in the question, then apply it with `gh pr edit <number> --title "..."`. Title only; the body stays empty, as above.

## Merging Pull Requests

When merging via `gh pr merge`, do NOT pass `--subject`. Let GitHub use its default commit subject. Only override with `--subject` when the user explicitly asks for a custom commit subject.

```sh
# ✅ Default behavior — produces "PR title (#1234)" exactly like the web UI
gh pr merge 1234 --squash

# ❌ Don't restate the title — duplicates the default and risks divergence
gh pr merge 1234 --squash --subject "PR title (#1234)"
```

## Workflow runs

For waiting on or monitoring a GitHub Actions run, always use `gh run watch <run-id> --exit-status`. Don't poll: no `until gh run view ... done` loops, no watch-and-sleep loops, no `gh run view --json status` in a loop.

Why: `watch` streams step-by-step progress over GitHub's stream API and exits the moment the run completes, with a per-step ✓/✗ summary and annotations included. Polling has (1) shell variable footguns (zsh's `status` is read-only), (2) wasted API calls, and (3) no visibility into long-running steps.

How to apply: workflow_dispatch results, schedule run results, PR CI waits, any Actions debugging. Follow-up analysis with `gh run view --log` for a specific step's raw log only after `watch` finishes and you've seen which step broke. Background it if your shell tool can run a command detached.
