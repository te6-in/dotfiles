---
name: ios-webkit-inspector
description: >-
  Remote-inspect iOS Safari tabs and inspectable WKWebViews from this agent —
  read live DOM, getComputedStyle / getBoundingClientRect, and run arbitrary
  JavaScript on a real connected iPhone/iPad via ios-webkit-debug-proxy. Use
  this whenever you need to see how a web page or in-app WebView actually
  renders or behaves on iOS Safari: a layout/CSS bug that only reproduces on
  iPhone, a WebKit-only quirk that Chrome/Firefox DevTools can't reproduce,
  reading exact box metrics or computed styles on-device, or verifying a CSS/JS
  fix live before committing — basically any "why does this look or act wrong on
  mobile Safari" or "inspect the iOS app's WebView" task where you'd otherwise
  be stuck eyeballing screenshots. NOT for iOS Simulator UI automation, native
  taps, launching apps, or pixel/visual screenshots — use the ios-simulator
  tooling for those (see references/tool-selection.md).
---

# iOS Safari / WKWebView remote inspection

Chrome and Firefox expose a DevTools MCP that runs JS and reads computed styles directly. **Safari has no equivalent for iOS.** This skill is the closest substitute: [`ios-webkit-debug-proxy`](https://github.com/google/ios-webkit-debug-proxy) (iwdp) bridges the device's WebKit remote inspector to a local HTTP/WebSocket port, and a bundled node client (`scripts/eval.mjs`) speaks the inspector protocol to evaluate arbitrary JS in a page and return the result.

The payoff: stop guessing from screenshots. Read `getComputedStyle` / `getBoundingClientRect` as numbers, pin down the real cause, and test a candidate fix live in the page before you touch any code.

## When to use this — and when not

**Use it** for the _web content_ itself: layout/CSS, computed styles, box metrics, DOM state, JS behavior — anything inside a Safari tab or an inspectable WKWebView, especially WebKit-only bugs that don't reproduce in Chrome/Firefox.

**Don't use it** for native/simulator concerns: launching apps, system permission dialogs, native taps/swipes to _reach_ a WebView, or pixel/visual verification. Those are the `ios-simulator` tooling's job. `references/tool-selection.md` has the full "iwdp vs ios-simulator-mcp/idb" decision map — read it if you're unsure which track a task needs, or if the user is stuck on a simulator with no real device.

## Two connections — don't conflate them

This trips people up, so hold both in your head:

1. **USB — the inspector link (iwdp ↔ device).** iwdp talks to the device over usbmuxd, which needs a **USB cable**. Unplug it and the device vanishes from iwdp's list (`[]`). This is non-negotiable; Wi-Fi does **not** carry the inspector.
2. **Network — the page load (device Safari ↔ your dev server).** Separately, the device's Safari has to actually _load_ the page you're debugging. The device can't reach the Mac's `localhost`, so the dev server has to be bound to a network interface and opened by an address the device itself can resolve — a LAN IP, or a hostname its DNS answers for.

So a normal session has the phone **both** plugged in (USB, for inspection) **and** on the network (for loading the dev URL).

## Critical gotchas

These shape the whole approach — internalize them before starting:

1. **Simulators aren't supported here.** The current brew iwdp (1.9.2) can't enumerate iOS Simulators on this macOS (Sequoia) — verified failing on iOS 26.1 and 18.6, even with the sim's `webinspectord` running. Use a **real device**. (Simulator-only? You're on the wrong track — see `tool-selection.md`.)
2. **The device can't reach `localhost`** — bind the dev server to the network and open it by an address the device can resolve (see "Two connections").
3. **`Runtime.evaluate` must be wrapped.** Modern WebKit is multi-target: the page's JS context is a sub-target, so a top-level `Runtime.evaluate` fails with `'Runtime' domain was not found`. `scripts/eval.mjs` already wraps it in `Target.sendMessageToTarget` — just use the script.
4. **A backgrounded or locked tab is suspended.** WebKit suspends the page, `targetCreated` never fires, and eval times out. Keep the target tab in the foreground with the screen awake.

## Workflow

Script paths below are relative to this skill's directory. node v22+ is required (the script uses the global `WebSocket`).

### 0. Device + Web Inspector

Connect the device by **USB and unlock it**, and tap **Trust** if it prompts "Trust This Computer?" (연결 허용) — that pairing is what lets iwdp reach the device. **iOS Developer Mode is NOT required** — that's for native/Xcode-level debugging; Web Inspector over USB works without it, so don't tell the user to enable it. On the device: Settings → Safari → Advanced → **Web Inspector = ON** (if off, the page list at `:9222` is empty). Open the tab — or inspectable WebView — you want to debug.

### 1. Install and run iwdp

```bash
brew install ios-webkit-debug-proxy   # bottle, no compile; pulls libimobiledevice etc.
ios_webkit_debug_proxy -c null:9221,:9222-9322 > /tmp/iwdp.log 2>&1 &
```

`:9221` lists devices, `:9222`+ is per-device inspection. Confirm the device shows up:

```bash
curl -s http://localhost:9221/json   # → [{"deviceName":"...","deviceOSVersion":"18.7.3","url":"localhost:9222"}]
```

Empty (`[]`)? The device dropped or is locked — see `references/troubleshooting.md`.

### 2. Make the device reach your dev server

Bind the dev server to the network (most dev servers advertise a Network URL once bound) and open it on the device by an address the device can resolve — a LAN IP, or a hostname its DNS answers for. Sanity-check the exact address from the Mac before blaming the inspector:

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://<host-or-ip>:<port>/   # → 200
```

A hostname only works if the device resolves it too; `/etc/hosts` entries on the Mac don't reach the phone. When in doubt, the LAN IP is the option with the fewest moving parts.

### 3. Pick the target page — never guess

```bash
node scripts/eval.mjs --list
```

This lists every inspectable page with an index, the app PID, title, and url. **One device often exposes several inspectable pages** — multiple Safari tabs, Safari Web Extension background pages, or (in an app) several WKWebViews at once.

- Exactly one real content page → `eval.mjs` auto-selects it (extension background pages are excluded from auto-selection).
- Otherwise, pass a `selector` (a substring of the url or title, or `#N` from the list) to choose exactly one.
- **If it's at all ambiguous which page the user means — e.g. an app showing several WebViews — STOP and ask them.** Show the `--list` output and ask the user to confirm the target. Evaluating JS (especially a live-fix mutation) in the wrong WebView is a real foot-gun. `eval.mjs` backs this up: given a selector that matches more than one page, it refuses to run and lists the candidates instead of picking one.
- A page whose title is "Cannot Open Page" (or whose url is `data:…` / `about:blank`) means the device's Safari couldn't load it — almost always because it can't reach your dev server (step 2's network half). `eval.mjs` warns when it selects such a page; reload the real URL on the device before trusting any result.

### 4. Read DOM / computed style

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

### 5. Live-fix experiment

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

A WebView built with `isInspectable = true` (iOS 16.4+, typically debug/alpha builds) shows up in `:9222/json` exactly like a Safari tab, but under a **different app PID** (`appId`). Select it with `eval.mjs`'s selector — a url/title substring, or confirm via its user agent (e.g. `…SomeApp/26.20.0 (…; debug)`). Production builds ship `isInspectable = false` and never appear.

## Reference

- `references/troubleshooting.md` — device vanished (`[]`), eval timeout, `ECONNREFUSED`, node version, multi-device ports.
- `references/tool-selection.md` — iwdp vs `ios-simulator-mcp`/`idb`: which to reach for, and why they're complements not competitors.
