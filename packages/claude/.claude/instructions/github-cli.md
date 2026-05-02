# GitHub CLI

## Pull Requests

When creating a PR, use the repository's **default branch** as the base branch (not necessarily `main`). If you're not sure, check with `gh repo view --json defaultBranchRef -q .defaultBranchRef.name`.

Always leave the PR body empty (pass `--body ""`). Do not generate a summary or description.

After creating a PR, always report it to the user in this format:

```
[owner/repo#NUMBER](PR URL) (base-branch ← head-branch)
```

Example: `[owner/repo#1234](https://github.com/owner/repo/pull/1234) (main ← fix/some-bug)`

If a related Linear issue exists, mention it as well — the Linear mention rule will add the link automatically.

## Workflow runs

For waiting on or monitoring a GitHub Actions run, always use `op plugin run -- gh run watch <run-id> --exit-status`. Don't poll: no `until gh run view ... done` loops, no `Monitor` + sleep, no `gh run view --json status` in a loop.

Why: `watch` streams step-by-step progress over GitHub's stream API and exits the moment the run completes, with a per-step ✓/✗ summary and annotations included. Polling has (1) shell variable footguns (zsh's `status` is read-only), (2) wasted API calls, and (3) no visibility into long-running steps.

How to apply: workflow_dispatch results, schedule run results, PR CI waits, any Actions debugging. Follow-up analysis with `gh run view --log` for a specific step's raw log only after `watch` finishes and you've seen which step broke. Background it via `Bash`'s `run_in_background: true` if needed.
