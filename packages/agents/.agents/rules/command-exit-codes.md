---
description: How to read a command's output and exit status, and when re-running it adds nothing.
trigger: always_on
glob:
---

# Command exit codes

Many CLIs follow the Unix convention: **silent on success, output on failure**. The one you'll hit most often is `tsc` (and `tsc --noEmit`).

When it succeeds, it exits 0 with no stdout/stderr. Your shell tool already surfaces non-zero exits to you, so:

- **Empty output + no "command failed" signal = success.** Trust it and move on.
- **Don't re-run the command with `; echo "exit: $?"` (or similar) just to "verify."** The first run already told you everything.
- **If you genuinely want an explicit success marker baked into the first run**, append it at invocation time: `tsc --noEmit && echo ok`.

Output on failure isn't always loud, either — `tsc` prints errors to stdout, not stderr, and a single type error can be a one-liner. Read the output you do get carefully before assuming "no error == success" — but again, do it from the original run, not a second one.
