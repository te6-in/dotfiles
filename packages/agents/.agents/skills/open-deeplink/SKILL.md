---
name: open-deeplink
description: >-
  Open a locally served page inside the host app — on a booted iOS Simulator, on
  an adb-attached Android device or emulator, or as a QR code a real phone can
  scan — by wrapping the dev URL in the app's own deep-link scheme. Use whenever
  the page has to be seen or driven inside the app rather than in a desktop
  browser: confirming a fix in the app's web view, reproducing a bug that only
  shows up in the in-app renderer, opening a bundle the local dev server builds,
  or handing a phone something to scan. Also covers "시뮬레이터에서 열어줘", "에뮬레이터에
  띄워줘", "앱으로 열어봐", "QR로 보여줘", and any request to assemble such a link
  without opening it. Not for opening a URL in a desktop browser, and not for
  native UI automation once the app is up.
trigger: model_decision
---

# Opening a dev server inside the app

A locally served page reaches the host app wrapped in that app's deep-link scheme: the address becomes one percent-encoded query parameter, and the app's router unwraps it into a web view or a native renderer. `deeplink` assembles that link, prints it, and opens it on the targets you name.

```sh
deeplink --list                                            # views configured here
deeplink webview --url http://myapp.test --simulator       # a booted iOS Simulator
deeplink webview --url http://myapp.test/some/page --adb   # an adb target
deeplink lynx --url http://myapp.test --qr                 # QR code, for a phone's camera
deeplink webview --url http://myapp.test                   # assemble and print, open nothing
deeplink webview --url http://myapp.test --adb --adb-package com.example.app
deeplink --help                                            # every flag
```

Targets combine, so `--simulator --adb` opens both in one call, and `--simulator=UDID` / `--adb=SERIAL` name one directly.

**Always go through the script.** Composing `simctl openurl` or `adb shell am start` by hand fails quietly: an address encoded only in part still parses, so the app shows a blank screen rather than an error.

## Which view

A **view** is one way the app renders a URL — a web view, a native bundle renderer — each with its own scheme. `deeplink --list` describes the ones configured here.

Read the choice off the project you are working in: a Lynx project wants the Lynx view, a web project the web view. "open it in the app" names no view, but the codebase around you usually does. **Ask when that is genuinely ambiguous** — the wrong view renders the page a different way and still looks entirely plausible, so a wrong answer reads as a real result.

## Rules

**Pass the printed link on to the user.** Every run prints it, whatever else it does. A launcher takes over the screen without a word, and a link built wrong is indistinguishable from one built right until the app renders nothing — that printed line is the only place the difference shows.

**Several targets attached: ask, don't pick.** The script exits with the list rather than choosing. Put it in front of the user and let them name one — a device connected for an unrelated reason sits in that list too, and the wrong one produces a perfectly believable screen. This holds with no question tool to hand: report the list and stop, rather than opening on a guess.

## Gotchas

- **`Simulator device failed to open <scheme>` means the app isn't installed.** Nothing on that simulator claims the scheme, so the usual cause is the wrong simulator rather than a malformed link.
- **A hostname can outlive the server behind it.** A proxy fronting dev servers keeps answering after the server stops, with its own error page rather than a refused connection. The app opens, the web view loads, and that page is what you see. Read an unexpected screen as a stopped server before suspecting the link.
- **An app that opens to a connection error can't reach the address.** A simulator shares the host's network stack, so what loads here loads there; a physical device and an Android emulator do not, since `localhost` there means themselves. A raw port needs `adb reverse tcp:PORT tcp:PORT` for Android, or a LAN address for iOS.
- **An app already running still re-routes.** The new link reaches a live app and its web view loads it, so there is no need to close it between links. A run may report `Warning: Activity not started, its current task has been brought to the front` — the Android intent landed on a task already there. It settles nothing either way, so take a screenshot if unsure.
