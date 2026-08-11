# Which tool for which target

## The map

| Target | Reach for |
| --- | --- |
| Desktop Chrome | `chrome-devtools` **MCP** |
| Desktop Firefox | `firefox-devtools` MCP |
| **Android emulator / device — web content** | **this skill** |
| Android — native UI automation | out of scope (raw `adb`, uiautomator) |
| iOS Safari / WKWebView | iOS WebKit remote-inspection tooling (not this skill) |
| iOS Simulator — native UI, pixels | `ios-simulator` MCP |

## Why not just point the chrome-devtools MCP at the device?

The MCP is configured to launch **its own** browser:

```json
"chrome-devtools": { "command": "bunx", "args": ["-y", "chrome-devtools-mcp@latest", "--isolated", "--headless"] }
```

An MCP server's arguments are fixed at session start. Redirecting it at Android means editing the MCP server config and restarting — and then you've **lost desktop Chrome** for that session, because one server can only point at one browser.

Adding a *second* always-on entry for Android doesn't hold up either:

- **The port isn't stable.** `--browserUrl` would be hardcoded, but the forward port is per-device (9333, 9334, …) and has to dodge whatever else is listening — `9222` in particular is off-limits, since taking it silently hijacks `ios-webkit-debug-proxy` (SKILL.md gotcha 4).
- **The ordering is backwards.** MCP servers start with the session; `adb forward` happens later, when you decide to debug. The entry is always racing the plumbing.
- **The tool namespace doubles.** ~28 near-identical tools twice over, distinguished only by prefix. The failure mode is silent and bad: measuring in headless desktop Chrome and reporting it as Android. `dpr 2.625` looks plausible either way.
- **It runs everywhere.** Most sessions have no device attached.

The CLI avoids all of this because the endpoint is chosen **per invocation**, and `--sessionId` keeps an Android daemon and a desktop daemon alive side by side. That's the same benefit the second MCP entry was reaching for, without hardcoding anything.

## What this skill adds over the CLI alone

The CLI does the browser half well. This skill exists for the half it can't see:

| | CLI / CDP | this skill (adb) |
| --- | --- | --- |
| Eval, DOM, computed style | ✅ reliable | — defer |
| a11y snapshot, click, fill | ✅ (raises the real IME) | — defer |
| Console, network, performance | ✅ | — defer |
| Getting a port at all | ❌ | ✅ `adb forward` |
| Device reaching your dev server | ❌ | ✅ `adb reverse` / `10.0.2.2` |
| Showing the soft keyboard on an emulator | ❌ | ✅ `show_ime_with_hard_keyboard` |
| Dismissing the IME without touching the page | ❌ | ✅ `keyevent 4` |
| Screenshot including the IME and browser chrome | ❌ (and unreliable on Android) | ✅ `exec-out screencap` |
| Browser chrome, system dialogs, gestures | ❌ | ✅ `input tap` / `input swipe` |

## Why iOS is a separate track

None of the tooling here transfers. iOS Safari speaks the **WebKit remote inspector protocol**, not CDP, so there is no `adb`, no `chrome-devtools` CLI, and inspection needs a USB cable — Wi-Fi doesn't carry it. Use the iOS WebKit remote-inspection tooling for that platform.

The sharpest practical difference is input: **Android can drive real taps and the software keyboard**, so a keyboard bug is reproducible end to end without the user touching the device. On iOS you have to ask them to tap.

Debugging both platforms in one session is normal. If you do, watch the port — see the collision note in `connect.md`.
