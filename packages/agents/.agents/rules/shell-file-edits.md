---
description: When to edit a file with an in-place shell command instead of a structured edit, and the precautions that come with it.
trigger: always_on
glob:
---

# Shell file edits

Prefer structured file-editing tools for modifying files. Only when a task genuinely calls for an in-place shell command instead (`sed -i`, `awk -i`, `perl -i`, redirecting with `>`, bulk `rename`, etc.):

1. **Confirm the target is clean in git first.** A mistake is recoverable only if `git checkout -- <path>` can restore the pre-edit state. If the file has uncommitted changes you want to keep, commit or stash them before running the command.
2. **Dry-run before applying.** Run the command without the `-i` flag (or redirect to a scratch file, or pipe through `diff`) and inspect the output first. Don't apply until the preview matches intent.
3. **Verify after.** Re-read the file or use `wc -l` / `head` / `tail` to confirm line count and structure — especially around trailing newlines, empty lines, and escaping of special characters.
4. **Fall back to a structured read-then-edit if any step is uncertain.**
