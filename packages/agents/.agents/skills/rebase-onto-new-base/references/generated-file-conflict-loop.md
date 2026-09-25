# Generated-file conflict loop

Optional automation for step 4 of `rebase-onto-new-base`. Use it when conflicts keep landing in **regenerable files** (lockfiles, codegen output, build aggregates) and the repo has a regeneration command. The loop drives the rest of the rebase: regenerate → verify markers gone → stage → continue, bailing out to manual handling the moment anything falls outside the pattern.

The script is bundled at `scripts/regen-conflict-loop.sh` relative to the directory containing this skill's `SKILL.md`. Resolve that directory before running the command. The script takes its parameters as flags; no script editing or copying is needed.

## Warm up manually before automating

This skill can't know what counts as generated in the repo at hand — the first stops are where you find out. **Never start the rebase with the loop.**

1. Handle the first conflict stop (a couple, if the first isn't representative) fully by hand, per step 4's bullets:
   - Find the regeneration command, preferring sources in this order: a repo-specific conflict/regeneration skill (invoke it if one is listed), the project's instruction files and docs, then ask the user.
   - **Manifest before lockfile.** If a manifest the install step parses (`package.json`, `Cargo.toml`, …) is conflicted, resolve it by hand FIRST — conflict markers in it break the install step, and the lockfile only regenerates cleanly against a valid manifest. Lockfiles themselves count as generated when the regen chain includes the install.
   - Run the regen command, confirm it exits 0 and actually clears the markers in the conflicted files, stage, continue.
2. Switch to the loop only once at least one stop has been resolved end-to-end by regeneration and the next stop repeats the pattern. Derive the flags from what you observed, not from guesses:
   - `--regen-cmd` — the exact chain that worked in step 1, run from the repo root.
   - `--generated-re` — extended regex matching the conflicted paths regeneration actually rewrote (plus obvious siblings, e.g. the rest of the same output directory). Keep it tight: an unmatched path stops the loop for manual handling, which is the safe direction to err in.
   - `--log-dir` — a scratch directory for this task, where per-iteration regen logs land. Create one if the session does not provide one. It must sit outside the repo: the loop stages with `git add -A`, so logs written inside the working tree would be committed into the resolution.
3. Use the shell tool's background or ongoing-process support when available — regen chains are slow, and each replayed commit may trigger another run. Retain the process handle and read its final exit status before proceeding. If only synchronous execution is available, wait for the command to finish.

   ```sh
   <SKILL_DIR>/scripts/regen-conflict-loop.sh \
     --generated-re '^(package-lock\.json|src/generated/)' \
     --regen-cmd 'npm install && npm run codegen' \
     --log-dir /path/to/scratchpad
   ```

4. On any non-zero exit, handle that one stop manually per step 4's bullets, then re-run the loop — it picks up from the current rebase state.

## Exit codes

| Code | Meaning | What to do |
| :--- | :--- | :--- |
| 1 | Bad usage — a flag is missing or has no value, `--log-dir` isn't a directory or sits inside the repo, or no rebase is in progress | Fix the invocation, or start the rebase and hit a conflict first. |
| 2 | `git rebase --continue` failed with no unmerged files | Read the printed output; this is outside the loop's pattern. |
| 3 | A non-generated file conflicted | Resolve it by hand. Widen `--generated-re` **only** if regeneration provably rewrote the newly conflicted path. |
| 4 | The regen command failed | Read `<log-dir>/regen-N.log`. |
| 5 | Conflict markers survived regeneration | The path matched `--generated-re` but isn't actually regenerated from that command — narrow the regex or resolve by hand. |
