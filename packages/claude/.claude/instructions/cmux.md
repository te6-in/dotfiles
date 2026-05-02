# cmux

`cmux` is a terminal for running coding agents in parallel workspaces. The title shows in cmux's tab bar, so keeping it current helps the user pick the right session at a glance.

Rename the current cmux workspace with `cmux rename-workspace "<title>"` whenever you can give it a clearer name than its current title. Keep the title very brief and in the user's language, reflecting the current focus (e.g. `슬라이더 리팩터`, `토큰 마이그레이션`, `배지 overflow 디버깅`, `alpha 리베이스`). Don't put issue IDs (`ABC-1234`), branch names (`feat/layout-snapshots`), or file paths in the title — describe what the work _is_, not how it's filed.

Two explicit checkpoints — always rename when either fires, even if the title seems only slightly off:

1. **First user message of a session names a focus.** If the opening request mentions a Linear issue, a component, a bug, a feature, or "let's do X," rename _before_ starting the work — don't wait for a later signal. A stale title from a previous session is worse than a slightly-off new one. Lean toward renaming.
2. **Focus pivots to an unrelated subject mid-session.** The user asks you to step off the current work and into something orthogonal (different feature or issue, side research unrelated to the current PR, an investigation that isn't a continuation of the prior task). Rename at that pivot.

Ignore smaller shifts within the same focus (research → implementation, review → fixes, writing code → polishing docs, handling review comments on the same PR). Once per distinct focus is enough; too-frequent renames wash out the signal.
