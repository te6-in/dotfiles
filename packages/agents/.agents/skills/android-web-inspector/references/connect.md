# Connecting — adb link, CDP forward, app reach

The three connections from SKILL.md, in detail. Work top-down: a broken link makes everything below it look broken too.

## 1. adb link

### USB

Enable **Developer options → USB debugging** on the device, plug it in, and accept the on-device trust prompt.

```bash
adb devices -l
# <serial>   device      model:<model> ...   ← good
# <serial>   unauthorized                    ← prompt is waiting on the device
# (empty)                                    ← cable/driver/developer-options problem
```

`unauthorized` is the common one and it recurs after a replug or a screen lock. Only the user can clear it — ask them to tap 허용 on the device ("항상 허용" stops it recurring). Polling for the transition is fine:

```bash
for i in $(seq 1 20); do
  st=$(adb devices | awk '$1=="<serial>" {print $2}')
  [ "$st" = "device" ] && { echo "authorized"; break; }
  sleep 2
done
```

### Wireless

Useful when the cable keeps dropping, or the user wants the phone in hand. Two ports are involved and **they are different**:

```bash
adb pair <device-ip>:37189 <6-digit-code>   # pairing port + code
adb connect <device-ip>:40987               # connect port — a DIFFERENT number
```

- The **pairing** port and code come from Developer options → 무선 디버깅 → **페어링 코드로 기기 페어링**. They are only alive while that dialog is open; closing it discards both. If `adb pair` says the port is unreachable, the dialog was closed — ask for a fresh code.
- The **connect** port is shown on the 무선 디버깅 screen itself, and it changes on reboot / toggle.
- `adb mdns services` is supposed to discover the connect port automatically. It has been observed returning nothing even with mDNS otherwise healthy — **don't burn time on it, just ask the user for the port.**
- Once connected the serial becomes `IP:PORT` (e.g. `<device-ip>:40987`). Every `-s` flag, and any note you hand to another agent, must use the new serial.

Pairing survives reconnects; only `adb connect` is needed after a drop.

### Keeping the device usable

```bash
adb -s <serial> shell svc power stayon true             # stays awake while charging
adb -s <serial> shell settings get system screen_off_timeout   # raise this if not charging
```

Emulators are typically already stay-on with an effectively infinite timeout — check before changing anything, and only touch the physical device.

## 2. CDP forward

### Discovering what's debuggable

```bash
adb -s <serial> shell 'cat /proc/net/unix | grep -i devtools'
```

Typical output:

```
@chrome_devtools_remote                       ← Chrome
@webview_devtools_remote_12345                ← an app's inspectable WebView
@stetho_com.example.app_devtools_remote       ← Stetho (a different protocol — not CDP)
```

Nothing at all means the browser isn't running, or the app has no debuggable WebView. Note that Stetho sockets look similar but are **not** CDP endpoints; forwarding one and pointing the CLI at it will fail.

### Forwarding

```bash
adb -s <serial> forward tcp:9222 localabstract:chrome_devtools_remote
curl -s http://127.0.0.1:9222/json/version    # sanity check
curl -s http://127.0.0.1:9222/json/list       # raw target list, if you want it without the CLI
adb -s <serial> forward --list                # what's currently mapped
adb -s <serial> forward --remove-all          # clean slate for this device
```

`/json/version` returning `{"Android-Package":"com.android.chrome", ...}` confirms both the link and the forward in one shot.

### Multiple devices and port collisions

One host port per device:

```bash
adb -s emulator-5554 forward tcp:9222 localabstract:chrome_devtools_remote
adb -s <serial>      forward tcp:9223 localabstract:chrome_devtools_remote
```

then one CLI daemon per device, each with its own `--sessionId` (`emulator`, `phone`, …).

**`9222` is a popular default**, claimed by plenty of other debug bridges and inspection tools, so it may already be occupied — and `adb forward` will happily fail or leave you talking to the wrong listener. Check first:

```bash
lsof -nP -iTCP:9222 -sTCP:LISTEN
adb -s <serial> forward --list      # or a forward you left behind earlier
```

If something else holds it, forward to a free port and start the daemon against that one — the number only has to agree between `adb forward` and `--browserUrl`. Prefer moving *yourself* rather than the occupant: once a `chrome-devtools` daemon is started its endpoint is fixed, so choosing a free port up front is cheaper than restarting things later.

## 3. App reach

Inspection working says nothing about whether the page loaded. These are independent.

| From | Address for the host machine | Notes |
| --- | --- | --- |
| Emulator | `http://10.0.2.2:<port>/` | The emulator has its own network stack; `localhost` is the emulator itself. |
| Physical device | `adb -s <serial> reverse tcp:<port> tcp:<port>` → `http://localhost:<port>/` | Rides the adb link. Network-independent. |
| Physical device (alt) | `http://<LAN-IP>:<port>/` | Only if the phone is on the same network — verify, don't assume. |

`adb reverse` is the right default for a physical device. A LAN IP fails silently when the phone is on guest Wi-Fi or cellular, and the failure looks like a debugging problem rather than a routing one. A tailnet address is the fallback when reverse isn't available.

`adb reverse` survives the app being killed but not an adb server restart — re-run it after `adb kill-server`, after a wireless reconnect, and after a device replug.

Opening a URL:

```bash
adb -s <serial> shell am start -a android.intent.action.VIEW \
  -d "http://localhost:5174/some/path" -n com.android.chrome/com.google.android.apps.chrome.Main
```

Sanity-check the address from the host first (`curl -s -o /dev/null -w "%{http_code}\n" http://localhost:5174/`) before blaming the device — and remember the emulator can check for itself:

```bash
adb -s emulator-5554 shell 'curl -s -m 3 -o /dev/null -w "%{http_code}" http://10.0.2.2:5174'
```

## App WebViews

A WebView is inspectable only if the app called `WebView.setWebContentsDebuggingEnabled(true)` — conventionally debug/alpha builds only. Release builds publish no socket and cannot be attached to at any protocol level.

```bash
adb -s <serial> shell 'cat /proc/net/unix | grep webview_devtools'
adb -s <serial> forward tcp:9224 localabstract:webview_devtools_remote_12345
chrome-devtools start --sessionId appwv --browserUrl http://127.0.0.1:9224
```

From there it behaves like Chrome: `list_pages`, `evaluate_script`, `take_snapshot`. Two differences worth expecting:

- The pid in the socket name changes every time the app process restarts, so re-run the grep rather than reusing the old forward.
- One app can expose several WebViews at once. `list_pages` will show them all — read the URLs and pick deliberately; if it's ambiguous which one the user means, show the list and ask rather than guessing.

**Status:** the socket discovery and forward mechanics here are the same ones the Chrome path uses and are sound, but the WebView path has not been driven end to end yet. Treat the specifics above as informed rather than measured, and verify as you go.
