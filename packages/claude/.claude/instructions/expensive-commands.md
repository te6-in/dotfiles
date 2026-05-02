# Expensive commands

Some commands are expensive enough that you should pay attention to *how many times you run them*, not just *what flags you pass*. Two main flavors:

- **Auth-gated**: every invocation prompts the user for 1Password / SSO / passkey approval. `op plugin run -- gh ...`, `op plugin run -- wrangler ...`, anything else behind interactive auth. Repeated prompts are draining in a way that doesn't show up in machine measurements.
- **Slow**: the command itself takes meaningful wall-clock time. Monorepo builds (`bun packages:build`, `next build`), docs builds, full E2E suites, anything that downloads or compiles a lot. Re-running because your `head`/`tail` sliced too narrowly to see the actual error is exactly the kind of waste this rule exists to prevent.

The pattern is the same for both: **run it once, capture everything to a file, then analyze the file with local tools as many times as you need**. The tidy-looking `| head -40` or `| grep -m 1` re-runs the entire expensive command — and if the slice missed the part that mattered, you'll do it again.

```sh
# ✅ One run, full output on disk, slice locally however many times you want
op plugin run -- gh run view <id> --log > /tmp/run.log 2>&1
bun docs:test 2>&1 | tee /tmp/docs-test.log

grep -E "error|fail" /tmp/run.log | head -40
sed -n '/Building/,/Build completed/p' /tmp/docs-test.log
awk '/FAIL/,/^$/' /tmp/docs-test.log
```

```sh
# ❌ Each pipe re-runs the expensive thing
op plugin run -- gh run view <id> --log | head -40   # re-auth prompt
bun docs:test | grep "error"                         # full rebuild
```

`head` / `tail` / `grep` themselves are fine — the rule is **"don't put an expensive command on the upstream side of a pipe you might want to run more than once for the same data."**

If you anticipate needing several expensive runs anyway (multiple CI jobs, multiple builds), **batch them into one shell block** — parallel with `&` + `wait`, or sequential — so the cost is paid once for everything:

```sh
mkdir -p /tmp/logs
op plugin run -- gh run view 111 --log > /tmp/logs/a.log 2>&1 &
op plugin run -- gh run view 222 --log > /tmp/logs/b.log 2>&1 &
op plugin run -- gh run view 333 --log > /tmp/logs/c.log 2>&1 &
wait
```

For builds and tests specifically: capture both stdout and stderr (`2>&1 | tee /tmp/file.log` or `> file 2>&1`). A "the real error was on stderr and my filter only watched stdout" situation that forces a rebuild is the canonical case this rule prevents.
