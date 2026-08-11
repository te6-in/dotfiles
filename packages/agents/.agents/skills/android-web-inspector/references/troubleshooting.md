# Troubleshooting

Work the layers in order — adb link, then CDP forward, then the CLI daemon, then the page. A failure low down looks like a failure high up.

## `adb devices` shows `unauthorized`

The device is waiting on its own "USB 디버깅을 허용하시겠습니까?" prompt. Only the user can clear it — ask them to tap 허용 ("항상 허용" prevents a recurrence). Recurs after a replug, a reboot, or sometimes a screen lock.

## `adb devices` is empty

Cable, developer options, or the adb server. In order:

```bash
adb kill-server && adb start-server && adb devices -l
```

If still empty: confirm **Developer options → USB debugging** is on, try another cable/port, and for a wireless device re-run `adb connect <ip>:<port>` — the device-side state (a pairing, or adbd's TCP mode) survives; the host's connection doesn't.

## `/proc/net/unix | grep devtools` is empty

Nothing is publishing a debug socket. For Chrome, it isn't running — launch it (`am start`) and re-check. For an app WebView, the build likely doesn't call `setWebContentsDebuggingEnabled(true)`; release builds never appear.

Note `@stetho_*_devtools_remote` sockets are a different protocol and won't work as a CDP endpoint.

## `curl :9333/json/version` → connection refused

The forward isn't there, or it was wiped. Re-run:

```bash
adb -s <serial> forward --list
adb -s <serial> forward tcp:9333 localabstract:chrome_devtools_remote
```

Forwards are lost on `adb kill-server`, on a device replug, and on a wireless reconnect (the serial changes, so old `-s` mappings don't apply). Nothing else clears them — a mapping you don't recognize in `--list` is a leftover, not a sign of something running.

## `curl` works but the CLI can't attach

Something other than your forward is probably answering on that port — plenty of debug bridges claim ports in this range:

```bash
lsof -nP -iTCP:9333 -sTCP:LISTEN
```

If the listener isn't `adb`, forward to a free port instead and start the daemon against that one (`adb forward tcp:9336 ...` + `--browserUrl http://127.0.0.1:9336`). Moving yourself is usually cheaper than restarting the occupant.

## Android works, but a colleague's (or your own) iOS session sees Android tabs

You forwarded to `9222` and `ios-webkit-debug-proxy` was running. adb's `127.0.0.1:9222` bind shadows iwdp's `*:9222`, so iOS requests get answered by Android Chrome with no error on either side. Android never notices. Release it and move:

```bash
adb forward --remove tcp:9222
adb -s <serial> forward tcp:9333 localabstract:chrome_devtools_remote
```

Full mechanism in `references/connect.md`. The forward may not even be from this session — they persist.

## `Timeout waiting for daemon response`

Seen intermittently against Android targets. Distinguish two cases:

- **`take_screenshot`** — expected. It fails most of the time here. Use `adb exec-out screencap -p` instead; don't retry into it.
- **Anything else** — usually the page is mid-navigation or stuck behind a dev-server error overlay, and the daemon is waiting for stability. Retry once, then check what the page is actually showing with a device screenshot.

If the daemon itself is wedged:

```bash
chrome-devtools stop --sessionId android
chrome-devtools start --sessionId android --browserUrl http://127.0.0.1:9333
```

## The desktop chrome-devtools daemon disappeared

A bare `chrome-devtools start` stops any running daemon before starting its own. Scope every invocation with `--sessionId` — see SKILL.md step 3 — and restart the desktop one.

## `click` succeeds but nothing happens

Almost always the wrong tab: only the foreground tab responds. Identify it with the marker-bar trick (SKILL.md step 4) rather than trusting `list_pages`' `[selected]` or `document.visibilityState` — both have been observed pointing at the wrong page.

Second possibility: something is on top of the element. Hit-test with `document.elementFromPoint` before concluding the click path is broken (recipe in `references/interaction.md`).

## Focusing an input doesn't raise the keyboard

On an emulator, `show_ime_with_hard_keyboard` is off by default and the host's physical keyboard is used instead, so nothing appears:

```bash
adb -s <serial> shell settings put secure show_ime_with_hard_keyboard 1
```

On a physical device this is not needed. If the keyboard still doesn't appear, verify the element actually took focus (`document.activeElement`) — a click that landed on a wrapper focuses nothing.

## Numbers don't match what's on screen

In likelihood order: measuring a **background tab** (stale viewport values), an **HMR ghost** node answering `querySelector`, a **mid-animation** sample, or leftover **calibration bars** still in the DOM. All four, with symptoms, are in `references/interaction.md` under "Things that quietly produce wrong numbers".

## The device screen keeps sleeping

```bash
adb -s <serial> shell svc power stayon true                      # while charging
adb -s <serial> shell settings put system screen_off_timeout 1800000   # otherwise
```

Apply to the physical device only — emulators are already effectively stay-on.
