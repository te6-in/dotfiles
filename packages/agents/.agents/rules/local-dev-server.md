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
