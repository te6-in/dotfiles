---
name: android-web-inspector
description: >-
  Remote-inspect and drive web pages running on an Android emulator or a
  USB/wireless-attached Android device — read live DOM, getComputedStyle /
  getBoundingClientRect, evaluate arbitrary JS, tap real elements, and raise or
  dismiss the software keyboard — by bridging the device's CDP endpoint with adb
  and driving it with the official `chrome-devtools` CLI. Use this whenever you
  need to see how a page actually renders or behaves on Android: a layout bug
  that only reproduces on a phone, anything involving the soft keyboard or
  `visualViewport` (Chrome panning, `offsetTop`, bottom address bar), reading
  exact box metrics on-device, or verifying a fix live on real hardware. Also
  covers inspectable Android WebViews in debug app builds. Not for desktop
  Chrome, native Android UI automation, or iOS — this skill only drives web
  content on an Android target over CDP.
---

# Android Chrome / WebView remote inspection

Android Chrome already speaks the Chrome DevTools Protocol; it just publishes it on a **unix domain socket inside the device**. `adb forward` exposes that socket as a local TCP port, and from there the official `chrome-devtools` CLI — the same engine behind the chrome-devtools MCP — attaches to it as if it were a local browser.

So this skill is thin on purpose. It owns the two layers CDP cannot reach: the **adb plumbing** that gets you a port, and the **input/IME layer** that makes keyboard bugs reproducible. Everything else (eval, DOM, computed style, a11y snapshot, clicks, console, network) is deferred to the CLI.

## When to use this — and when not

**Use it** for web content on Android: layout/CSS, computed styles, box metrics, DOM state, JS behavior, and — the case where nothing else works — anything involving the **software keyboard** or `visualViewport`. Android Chrome shrinks *and* pans the visual viewport, the address bar may sit at the bottom, and the two interact; none of that reproduces in desktop DevTools' device emulation.

**Don't use it** for desktop Chrome (the `chrome-devtools` MCP already covers that), for native Android UI automation, or for iOS. `references/tool-selection.md` has the full decision map, including why the MCP can't be pointed at the device.

## Three connections — don't conflate them

iOS has two; Android has three. Hold all three in your head, because each fails differently:

1. **adb link (control).** USB cable, or wireless via `adb tcpip` / a pairing code. Everything below rides on it. `adb devices -l` must show `device`, not `unauthorized` or nothing.
2. **CDP forward (inspection).** `adb forward tcp:9333 localabstract:chrome_devtools_remote` maps the in-device debug socket to a host port. Without it there is nothing to attach to.
3. **App reach (page load).** Separately, the device's browser must be able to **load** your dev server. The emulator reaches the host at `10.0.2.2`; a physical device needs `adb reverse` (or a LAN/tailnet address). This is orthogonal to 1 and 2 — inspection can be perfectly healthy while the page shows "이 사이트에 연결할 수 없음".

## Critical gotchas

Internalize these before starting — each one has produced a wrong conclusion in practice:

1. **Only the foreground tab is drivable.** In a background tab `click` reports success but focuses nothing, and its `visualViewport` numbers are **stale** (a background tab read `innerHeight 837` while the foreground one read `809`). `document.visibilityState` is *not* a reliable discriminator — both tabs reported `"visible"`. Confirm which page is foreground the way step 4 describes, and never measure from a background tab.
2. **`take_screenshot` is effectively broken here** — 1 success in 5 attempts, the rest timed out. Use `adb exec-out screencap -p`, which is also the **only** way to see the IME, the browser chrome, and system UI. CDP screenshots capture the page and nothing else, so they can't show you the keyboard you're debugging.
3. **An emulator shows no soft keyboard by default** — it maps your Mac's hardware keyboard instead, so focusing an input changes nothing. `adb shell settings put secure show_ime_with_hard_keyboard 1` is a precondition for any keyboard work, not a tweak.
4. **Don't forward to `9222` — you'd break iOS debugging silently.** The port number only has to agree between `adb forward` and `--browserUrl`, so it's free to move: default to **9333**, and give a second device 9334. `9222` is `ios-webkit-debug-proxy`'s default too, and the collision is one-directional and invisible. iwdp binds the wildcard `*:9222`; `adb forward` binds the specific `127.0.0.1:9222`; BSD sockets deliver to the specific bind. So **adb wins, Android keeps working perfectly, and every iOS request lands on your Android tabs** — both endpoints serve Chrome-shaped JSON, so nothing errors and the two page lists look alike. Avoid 9222 even on an iOS-free day: forwards **outlive the session that made them**, so a zombie `tcp:9222` from last week is enough to break someone's iPhone session today. Check what you're about to take with `lsof -nP -iTCP:<port> -sTCP:LISTEN`.
5. **The CLI daemon is a singleton per user** unless you scope it. Plain `chrome-devtools start` **kills** whatever daemon was running, including one you had pointed at desktop Chrome. Always pass `--sessionId` (see step 3).

## Workflow

### 0. Device and prerequisites

```bash
adb devices -l          # must print `device`, not `unauthorized`
brew install chrome-devtools-mcp   # provides the `chrome-devtools` binary
```

`unauthorized` means the on-device "USB 디버깅을 허용하시겠습니까?" prompt is waiting — ask the user to tap 허용. To go wireless — `adb tcpip` when a cable can go in once, a pairing code when it can't — and for developer-options prerequisites, see `references/connect.md`.

Doing keyboard work? Enable the soft keyboard now (gotcha 3), and keep the screen awake:

```bash
adb -s <serial> shell settings put secure show_ime_with_hard_keyboard 1
adb -s <serial> shell svc power stayon true
```

### 1. Bridge the CDP socket

Start by clearing what a previous session left behind. Forwards survive the shell, the agent, and the reboot of everything except the adb server, so `--list` is rarely empty and rarely all yours:

```bash
adb forward --list                        # every mapping, all devices
adb -s <serial> forward --remove tcp:<port>   # drop each one you don't need — especially tcp:9222
```

Then find what's actually debuggable, and forward it to **9333** (not 9222 — gotcha 4):

```bash
adb -s <serial> shell 'cat /proc/net/unix | grep -i devtools'
# @chrome_devtools_remote                  → Chrome
# @webview_devtools_remote_<pid>           → an app's inspectable WebView
adb -s <serial> forward tcp:9333 localabstract:chrome_devtools_remote
curl -s http://127.0.0.1:9333/json/version   # → {"Android-Package":"com.android.chrome", ...}
```

Empty grep = the browser isn't running, or USB debugging for it is off. One port per device — `references/connect.md` covers multi-device and WebView sockets. Tear your forward down when you're done (`adb -s <serial> forward --remove tcp:9333`); leaving it is how the next person inherits a port they can't explain.

### 2. Make the device reach your dev server

| From | Host address |
| --- | --- |
| Emulator | `http://10.0.2.2:<port>/` |
| Physical device | `adb -s <serial> reverse tcp:<port> tcp:<port>`, then `http://localhost:<port>/` |

`adb reverse` rides the adb link, so it works over USB **and** wireless regardless of what network the phone is on — prefer it over a LAN IP, which silently fails when the phone is on a different network. Open the URL:

```bash
adb -s <serial> shell am start -a android.intent.action.VIEW \
  -d "http://localhost:5174/" -n com.android.chrome/com.google.android.apps.chrome.Main
```

### 3. Attach the CLI — always scoped

```bash
chrome-devtools start --sessionId android --browserUrl http://127.0.0.1:9333
```

`--sessionId` is undocumented (`hidden: true` in the CLI, found by reading the source) but load-bearing: it gives this daemon its own socket (`/tmp/chrome-devtools-mcp-android-<uid>.sock`), so an Android daemon and a desktop one coexist instead of evicting each other. Use a distinct id per device (`--sessionId phone --browserUrl http://127.0.0.1:9334`). **Pass the same `--sessionId` to every subsequent command.**

Stop it when you're done: `chrome-devtools stop --sessionId android`.

### 4. Select the page — it must be the foreground tab

```bash
chrome-devtools list_pages --sessionId android
chrome-devtools select_page 2 --sessionId android
```

The CLI's `[selected]` marker is **its own** notion and has nothing to do with which tab the device is showing. To find the real one, paint a marker from JS and look at a device screenshot — the tab whose marker appears is the foreground tab:

```bash
chrome-devtools evaluate_script --sessionId android '() => {
  const d = document.createElement("div"); d.className = "__cal";
  Object.assign(d.style, {position:"fixed",inset:"0 0 auto 0",height:"4px",background:"red",zIndex:2147483647});
  document.body.appendChild(d); return "marked";
}'
adb -s <serial> exec-out screencap -p > /tmp/shot.png   # then Read the png
```

That same marker gives you tap calibration for free — see step 6. Remove it (`document.querySelectorAll(".__cal").forEach(n => n.remove())`) before measuring anything.

### 5. Measure

`evaluate_script` is the reliable workhorse (5/5 in testing). Measure several things per round-trip and return JSON:

```bash
chrome-devtools evaluate_script --sessionId android '() => {
  const el = document.querySelector("YOUR_SELECTOR");
  const r = el.getBoundingClientRect(), vv = visualViewport;
  return {
    innerH: innerHeight, vvH: Math.round(vv.height), vvTop: Math.round(vv.offsetTop), scale: vv.scale,
    top: Math.round(r.top), bottom: Math.round(r.bottom), height: Math.round(r.height),
    inlineBottom: el.style.bottom || null, inlineHeight: el.style.height || null,
  };
}'
```

For keyboard work always report `innerHeight`, `visualViewport.height` **and** `visualViewport.offsetTop` together — Chrome shrinks on some devices and pans on others, sometimes both on the same device across runs, and a number that looks wrong under one strategy is correct under the other.

### 6. Drive input

Prefer the a11y tree — no pixel math, and it raises the real IME:

```bash
chrome-devtools take_snapshot --sessionId android      # → uid=3_0 textbox "Name"
chrome-devtools click 3_0 --sessionId android          # focuses AND raises the soft keyboard
adb -s <serial> shell input keyevent 4                 # back: dismisses the IME only
```

Verified: `click` on a foreground-tab input took `visualViewport.height` from 809 to 461 — a genuine keyboard raise, not a synthetic focus.

Fall back to real taps (`adb shell input tap`) only for what the a11y tree can't reach: browser chrome, the IME's own keys, system dialogs, and gestures. That path needs CSS→device-pixel calibration — `references/interaction.md` has the recipe and the rest of the input toolkit.

## Inspecting an app's WebView

An app built with `WebView.setWebContentsDebuggingEnabled(true)` (debug/alpha builds) publishes `@webview_devtools_remote_<pid>`, which you forward and attach to exactly like Chrome. Release builds publish nothing. Details and caveats in `references/connect.md` — that path is documented from the socket layer up but has not been exercised end to end here, unlike the Chrome path.

## Reference

- `references/connect.md` — going wireless (`adb tcpip` vs pairing code), multi-device ports, `adb reverse` vs LAN, WebView sockets, stale forwards and the iwdp port collision.
- `references/interaction.md` — a11y clicks, IME control, tap calibration, screenshots, gestures, typing.
- `references/troubleshooting.md` — `unauthorized`, empty socket list, daemon timeouts, stale measurements.
- `references/tool-selection.md` — why not the chrome-devtools MCP, and where the boundary with other platforms' tooling falls.
