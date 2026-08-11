---
name: ios-webkit-inspector
description: >-
  Remote-inspect iOS Safari tabs and inspectable WKWebViews from this agent —
  read live DOM, getComputedStyle / getBoundingClientRect, and run arbitrary
  JavaScript on a USB-connected iPhone/iPad or a booted iOS Simulator via
  ios-webkit-debug-proxy. Use this whenever you need to see how a web page or
  in-app WebView actually renders or behaves on iOS Safari: a layout/CSS bug
  that only reproduces on iPhone, a WebKit-only quirk that Chrome/Firefox
  DevTools can't reproduce, reading exact box metrics or computed styles
  on-device, or verifying a CSS/JS fix live before committing — basically any
  "why does this look or act wrong on mobile Safari" or "inspect the iOS app's
  WebView" task where you'd otherwise be stuck eyeballing screenshots. NOT for
  iOS Simulator UI automation, native taps, launching apps, or pixel/visual
  screenshots — use the ios-simulator tooling for those (see
  references/tool-selection.md).
---

# iOS Safari / WKWebView remote inspection

Chrome and Firefox expose a DevTools MCP that runs JS and reads computed styles directly. **Safari has no equivalent for iOS.** This skill is the closest substitute: [`ios-webkit-debug-proxy`](https://github.com/google/ios-webkit-debug-proxy) (iwdp) bridges the target's WebKit remote inspector to a local HTTP/WebSocket port, and a bundled node client (`scripts/eval.mjs`) speaks the inspector protocol to evaluate arbitrary JS in a page and return the result. It reaches a USB-connected iPhone/iPad and a booted iOS Simulator alike — the two differ only in how iwdp is started (step 2).

The payoff: stop guessing from screenshots. Read `getComputedStyle` / `getBoundingClientRect` as numbers, pin down the real cause, and test a candidate fix live in the page before you touch any code.

## When to use this — and when not

**Use it** for the _web content_ itself: layout/CSS, computed styles, box metrics, DOM state, JS behavior — anything inside a Safari tab or an inspectable WKWebView, especially WebKit-only bugs that don't reproduce in Chrome/Firefox.

**Don't use it** for native concerns: launching apps, system permission dialogs, native taps/swipes to _reach_ a WebView, or pixel/visual verification. Those are the `ios-simulator` tooling's job. `references/tool-selection.md` has the full "iwdp vs ios-simulator-mcp/idb" decision map — read it if you're unsure which track a task needs.

## Two connections — don't conflate them

This trips people up, so hold both in your head:

1. **The inspector link (iwdp ↔ target).** For a **real device** this is usbmuxd over a **USB cable** — unplug it and the device vanishes from iwdp's list (`[]`); Wi-Fi does **not** carry the inspector. For a **simulator** it's a UNIX socket on this Mac instead, named by `-s` (see step 2).
2. **Network — the page load (Safari ↔ your dev server).** Separately, Safari has to actually _load_ the page you're debugging. A **real device cannot reach the Mac's `localhost`**, so the dev server has to be bound to a network interface and opened by an address the device itself can resolve — a LAN IP, or a hostname its DNS answers for. A **simulator shares the Mac's network stack**, so `localhost` works there unchanged.

So a normal real-device session has the phone **both** plugged in (USB, for inspection) **and** on the network (for loading the dev URL). A simulator session needs neither.

## Critical gotchas

These shape the whole approach — internalize them before starting:

1. **A simulator needs `-s`, and it silently steals `:9222`.** iwdp reaches simulators only through the socket named by `-s`; its default (`localhost:27753`) is a TCP port no current simulator opens, so the plain real-device command finds no simulator and says nothing about it. Worse, once `-s` does attach one, the simulator takes `:9222` and USB devices shift to `:9223`+ — so the *same* default port means a different target depending on whether `-s` was passed, with no error either way. **Never assume `:9222`; read `:9221/json` for the port map.**
2. **iwdp cannot tell you which simulator it attached to.** Every simulator appears as a pseudo-device literally named `SIMULATOR`, OS version `0.0.0`, no UDID — the source fakes one `on_attach(dl, "SIMULATOR", -1)` call. Two consequences: identity comes only from the socket *you* chose, and **one iwdp instance carries at most one simulator** (a second booted sim never appears; give it its own instance on another port range). Real devices are unaffected — usbmuxd enumerates them all, with real names and UDIDs.
3. **A simulator's socket path changes on every boot, and iwdp doesn't notice.** The path carries a per-boot random segment (`/private/tmp/com.apple.launchd.<random>/com.apple.webinspectord_sim.socket`). Reboot the simulator and the iwdp instance pinned to the old path keeps running and answers `[]` — identical to a real device that dropped, which sends you down the wrong branch of `troubleshooting.md`. Re-discover the socket and restart iwdp.
4. **A real device can't reach `localhost`** — bind the dev server to the network and open it by an address the device can resolve. A simulator can (see "Two connections").
5. **`Runtime.evaluate` must be wrapped.** Modern WebKit is multi-target: the page's JS context is a sub-target, so a top-level `Runtime.evaluate` fails with `'Runtime' domain was not found`. `scripts/eval.mjs` already wraps it in `Target.sendMessageToTarget` — just use the script.
6. **On a real device, a backgrounded or locked tab is suspended.** WebKit suspends the page, `targetCreated` never fires, and eval times out. Keep the target tab in the foreground with the screen awake — and since iOS has no remote wake-lock, that means getting Auto-Lock turned off up front (step 1). Simulators don't do this: a backgrounded Safari there still reports `visibilityState: "visible"` and evaluates fine, so never ask a user to foreground a simulator tab to fix a timeout. Gotcha 7 produces the **same** timeout, so don't take this as the diagnosis until you've ruled that out.
7. **`:9222` may not be iwdp at all.** iwdp binds the wildcard `*:9222`; `adb forward tcp:9222 …` binds the specific `127.0.0.1:9222`, and BSD sockets deliver to the specific bind — so every `localhost:9222` request reaches **Android Chrome** while iwdp sits there unreached. Nothing errors: both serve Chrome-shaped JSON, so `--list` shows Android tabs as if they were iOS pages, and the WebSocket connects before timing out. Two listeners in `lsof -nP -iTCP:9222 -sTCP:LISTEN` is the tell; `curl -s http://localhost:9222/json/version` naming a browser (`Android-Package`, `Browser: Chrome/…`) confirms it, since iwdp has no such route and 404s. `eval.mjs` now refuses to run on a self-identified Chrome endpoint — clear it with `adb forward --remove tcp:9222`, or reach iwdp's wildcard by LAN IP (`IWDP_PAGES_URL=http://<mac-lan-ip>:9222/json`).

## Workflow

Script paths below are relative to this skill's directory. node v22+ is required (the scripts use the global `WebSocket`).

### 0. Pick the target device — before anything else

```bash
brew install ios-webkit-debug-proxy   # bottle, no compile; pulls libimobiledevice etc.
node scripts/targets.mjs
```

This lists every USB-connected device and every booted simulator, resolves each simulator's anonymous socket back to a real name and UDID, and prints the exact iwdp command for each.

**More than one target? Stop and ask the user which device or simulator is showing — or is about to show — the page.** Put the list in front of them. Don't infer it from the task ("it's a mobile Safari bug, so probably the phone") and don't just take the first row: a phone plugged in for an unrelated reason sits in that list too, and by gotchas 1–2 the wrong pick yields perfectly plausible numbers off the wrong screen with nothing anywhere reading as an error. Exactly one target means there's nothing to ask — name it and move on.

Nothing listed? A device needs USB + unlock + **Trust** (연결 허용) — `idevice_id -l` isolates that pairing layer from iwdp. A simulator needs to be booted with Safari opened once.

### 1. Prepare the chosen target

Settings → Safari → Advanced → **Web Inspector = ON** — on the device itself, or in the simulator's own Settings app. If it's off the page list comes back empty. Simulator images normally ship with it on. Then open the tab — or inspectable WebView — you want to debug.

**iOS Developer Mode is NOT required** — that's for native/Xcode-level debugging; Web Inspector works without it, so don't tell the user to enable it.

**Real device only:** ask for Settings → Display & Brightness → **Auto-Lock → Never** (설정 → 디스플레이 및 밝기 → 자동 잠금 → 안 함) in the same breath — there is no iOS equivalent of `adb shell svc power stayon`, so only the user can do it, and a lock takes out both connections at once (usbmuxd drops the device, WebKit suspends the page). If **Never** is greyed out, Low Power Mode is on and pins Auto-Lock at 30 seconds. A simulator never locks, so skip this entirely.

### 2. Run iwdp against that target

Use the command `targets.mjs` printed for the row the user picked. The two shapes differ, and not symmetrically:

```bash
# device — pinned by UDID, which excludes the simulator and any other phone
ios_webkit_debug_proxy -c null:9221,<udid>:9222 > /tmp/iwdp.log 2>&1 &

# simulator — -s is what reaches it; a connected phone still comes along on :9223
ios_webkit_debug_proxy -s unix:<socket> -c null:9221,:9222-9322 > /tmp/iwdp.log 2>&1 &
```

A simulator **cannot** be attached on its own: iwdp's config parser accepts a device id only as a hex UDID, `*`, or `null`, so the literal `SIMULATOR` it names simulators by can't be written in `-c` (it gets read as a filename — `Unknown file`). Leaving a phone plugged in during a simulator session is therefore normal, and reading the port map is what keeps you off it.

Confirm iwdp is the **only** thing on the port — a second listener means you'd be inspecting someone else's browser (gotcha 7):

```bash
lsof -nP -iTCP:9222 -sTCP:LISTEN   # exactly one row, and it must be ios_webki
```

Then read the port map. **This is not optional and the answer is not always `:9222`** (gotcha 1):

```bash
curl -s http://localhost:9221/json
# device only → [{"deviceName":"Someone's iPhone","deviceOSVersion":"27.0.0","url":"localhost:9222"}]
# with -s     → [{"deviceName":"SIMULATOR","deviceOSVersion":"0.0.0","url":"localhost:9222"}, …]
```

Carry that port for the rest of the session: `IWDP_PAGES_URL=http://localhost:<port>/json`. A `SIMULATOR` row is always the socket you passed to `-s`, whatever the row itself claims.

Empty (`[]`)? A device dropped or locked, or a simulator rebooted and rotated its socket — see `references/troubleshooting.md`.

### 3. Make Safari reach your dev server

A simulator shares the Mac's network stack, so `localhost:<port>` works there as-is and this step is a no-op.

For a real device, bind the dev server to the network (most dev servers advertise a Network URL once bound) and open it by an address the device can resolve — a LAN IP, or a hostname its DNS answers for. Sanity-check the exact address from the Mac before blaming the inspector:

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://<host-or-ip>:<port>/   # → 200
```

A hostname only works if the device resolves it too; `/etc/hosts` entries on the Mac don't reach the phone. When in doubt, the LAN IP is the option with the fewest moving parts.

### 4. Pick the target page — never guess

```bash
node scripts/eval.mjs --list
```

This lists every inspectable page with an index, the app PID, title, and url. **One device often exposes several inspectable pages** — multiple Safari tabs, Safari Web Extension background pages, or (in an app) several WKWebViews at once.

- Exactly one real content page → `eval.mjs` auto-selects it (extension background pages are excluded from auto-selection).
- Otherwise, pass a `selector` (a substring of the url or title, or `#N` from the list) to choose exactly one.
- **If it's at all ambiguous which page the user means — e.g. an app showing several WebViews — STOP and ask them.** Show the `--list` output and ask the user to confirm the target. Evaluating JS (especially a live-fix mutation) in the wrong WebView is a real foot-gun. `eval.mjs` backs this up: given a selector that matches more than one page, it refuses to run and lists the candidates instead of picking one.
- A page whose title is "Cannot Open Page" (or whose url is `data:…` / `about:blank`) means Safari couldn't load it — almost always because it can't reach your dev server (step 3). `eval.mjs` warns when it selects such a page; reload the real URL on the device before trusting any result.

### 5. Read DOM / computed style

```bash
node scripts/eval.mjs '<js expression>' '<selector>'
```

`getComputedStyle` and `getBoundingClientRect` are accurate even when the element is offscreen, so **you don't need to scroll to it.** Measure several elements in one expression and return JSON — one round-trip beats many:

```bash
node scripts/eval.mjs '(() => {
  const el = document.querySelector("YOUR_SELECTOR");
  const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
  return JSON.stringify({ w: Math.round(r.width), h: Math.round(r.height), height: cs.height, position: cs.position });
})()' ':4321'
```

### 6. Live-fix experiment

You can confirm the cause _and_ validate the fix in the page before editing code. Mutate `el.style.*`, then re-read `getBoundingClientRect()` — the read forces a reflow, so the number reflects the change. Toggle several candidates and restore in one shot:

```bash
node scripts/eval.mjs '(() => {
  const el = document.querySelector("YOUR_SELECTOR");
  const m = () => Math.round(el.getBoundingClientRect().height);
  const out = { before: m() };
  el.style.padding = "0"; out.padding0 = m(); el.style.padding = "";
  el.style.height = "100%"; out.height100 = m(); el.style.height = "";
  return JSON.stringify(out);
})()' ':4321'
```

Whichever override makes the numbers right tells you what to change in the source.

## Inspecting an app's WKWebView

A WebView built with `isInspectable = true` (iOS 16.4+, typically debug/alpha builds) shows up in the page list exactly like a Safari tab, but under a **different app PID** (`appId`). Select it with `eval.mjs`'s selector — a url/title substring, or confirm via its user agent (e.g. `…SomeApp/26.29.0 (…; Dev; debug)`). This works the same on a simulator as on a device. Production builds ship `isInspectable = false` and never appear.

Don't use the OS version in the user agent to work out which target you're on — WebKit freezes it (a device on iOS 27.0 and a simulator on iOS 26.1 both report `OS 18_7`). The app/build suffix is real; the OS number isn't.

## Reference

- `references/troubleshooting.md` — device vanished (`[]`), stale simulator socket, wrong endpoint / port hijack, eval timeout, screen locking, `ECONNREFUSED`, node version, multi-target ports.
- `references/tool-selection.md` — iwdp vs `ios-simulator-mcp`/`idb`: which to reach for, and why they're complements not competitors.
