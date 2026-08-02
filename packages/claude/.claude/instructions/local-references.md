# References & dependencies

## Where to look first

The user's own projects and any reference material they've pulled down live locally under `~/Projects`. So when the user asks you to look at a reference, an example, or "how X does it", check there **first** — before reaching for the web or reasoning from memory. Grep and read across it to find the relevant code. If nothing local matches, then fall back to the web or other sources.

## Registered additional directories

A directory the project registers under `permissions.additionalDirectories` (in `.claude/settings.json` or `.claude/settings.local.json`) is deliberate reference material — grep and read across it, and prefer it over web search instead of defaulting to the web.

## Analyzing installed dependencies

When the question is about how a dependency actually behaves, you can read the copy installed in the working project rather than only reasoning from upstream source or docs — `node_modules/<pkg>` for Node.js, and the ecosystem equivalent elsewhere (`.venv`/site-packages for Python, vendored modules for Go, etc.). The installed copy is the exact version that's really running, so it settles version-drift questions the public source can't.

Whenever you do this, tell the user in one line — e.g. "analyzed the installed copy under `node_modules/...`, not the original source" — because installed code may be minified, compiled, or otherwise diverge from the readable upstream.
