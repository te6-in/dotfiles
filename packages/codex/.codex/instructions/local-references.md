# References & dependencies

## Where to look first

The user's own projects and any reference material they've pulled down live locally under `~/Projects`. So when the user asks you to look at a reference, an example, or "how X does it", check there **first** — before reaching for the web or reasoning from memory. Search and read across it to find the relevant code. If nothing local matches, then fall back to the web or other sources.

## Registered additional directories

Directories explicitly named as reference material in the current task or
project instructions are deliberate search targets. Read across them when
relevant, within the host's access permissions. Codex's writable roots or
additional write directories grant access; their presence alone does not prove
that a directory is relevant reference material.

## Analyzing installed dependencies

When the question is about how a dependency actually behaves, you can read the copy installed in the working project rather than only reasoning from upstream source or docs — `node_modules/<pkg>` for Node.js, and the ecosystem equivalent elsewhere (`.venv`/site-packages for Python, vendored modules for Go, etc.). The installed copy is the exact version that's really running, so it settles version-drift questions the public source can't.

Whenever you do this, tell the user in one line — e.g. "analyzed the installed copy under `node_modules/...`, not the original source" — because installed code may be minified, compiled, or otherwise diverge from the readable upstream.
