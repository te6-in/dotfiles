---
description: How local dev servers are addressed and started on this machine.
trigger: always_on
glob:
---

# Local dev servers

Dev servers here run behind [portless](https://portless.sh): each app gets a stable hostname under `$PORTLESS_TLD`, and a port that changes on every run.

- **Never assume a port.** `portless list` prints the URL of every running app. Guessing `localhost:3000` doesn't fail loudly — it tests a different app and reports success.
- **Start servers with `portless run <cmd>`**, naming the real binary (`portless run vite`) rather than a package manager script. Only then does the app land on the port portless routed to.
- **One URL covers every target** — this machine, simulators, phones, teammates. Use it for browser automation, `curl`, QR codes, and app deep links alike.
- **`plurl` prints the route serving the current directory**, with no name to type; `plurl NAME` defers to `portless get`. It matches `$PWD` against the working directory of each live route's process, so a git worktree resolves to its own route rather than the parent package's. Use it inline where a command wants the URL: `--url "$(plurl)"`.
- **A listed route can have nothing behind it.** portless keeps serving the hostname after the dev server stops — 502 for an alias route, or its own "No app registered for …" page once the process is gone. Neither refuses the connection, so a tool downstream reports success and renders that page. `curl` the URL before trusting it, and read an unexpected page as a stopped server rather than a bad address.
- **A URL carrying a port number means the proxy daemon is down.** Healthy routes are plain `http://<app>.$PORTLESS_TLD`; a `:1355`-style port appears when `portless run` had to auto-start an unprivileged proxy, and that one binds loopback only, so it works here and nowhere else. `portless-proxy-service status` diagnoses it, `sudo portless-proxy-service install` fixes it.
