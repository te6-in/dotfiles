# Codex adapter

## Shell

Use the actual execution shell when choosing syntax. `$SHELL` describes the user's configured shell and may differ from the process running a command; a tool named Bash is not proof of bash either. Prefer the execution environment's shell information, and when shell-specific behavior matters, confirm the running shell and its login/interactive options or explicitly select a supported shell.

Do not assume interactive startup files or shell functions are available, or that requesting a login shell guarantees login semantics on every host. Prefer standalone CLIs and portable shell syntax. Keep machine-specific observations out of permanent shell assumptions.

Run commands directly by default. Use `direnv exec . <command>` only when the command requires project-specific environment variables, tools, or account configuration supplied by direnv and the current environment does not already provide them. Being inside a repository is not sufficient reason to wrap a command. Ordinary file operations and local Git commands such as `status`, `diff`, `log`, `add`, and `commit` do not need it unless a specific dependency is established. When direnv is required, use the target directory’s already allowed configuration; do not silently fall back if loading fails.

## Linear

Work repos are those whose GitHub remote belongs to an organization in `$WORK_GITHUB_ORGS`. If the variable is unset, no repository automatically opts into the work workflow.

In a work repo, load `linear-workflow` before the first code edit. Load it when creating or updating a Linear issue and when a PR is created, marked ready for review, or merged, since the issue may need identifying and transitioning even if this task has not edited code.

Use `linear-read-issue` to read an issue and its linked material. It stands alone; do not load the writing workflow just to read an issue.

Outside work repos, the automatic Linear workflow is off silently. An explicit request to read or write Linear still applies from any repository: use the reading skill for reads and the writing conventions for writes.
