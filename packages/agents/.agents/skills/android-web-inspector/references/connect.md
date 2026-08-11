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

Useful when the cable keeps dropping, or the user wants the phone in hand. Two routes, and one question picks between them:

- **A cable can go in even once → `adb tcpip`.** Fixed port, no dialog, no expiring code. Default to this.
- **No cable at all → pairing code.** The only route Android 11+ offers without USB.

#### Fixed port — `adb tcpip`

Attach over USB once, flip adbd to TCP mode, then unplug:

```bash
adb -s <usb-serial> tcpip 5555
adb -s <usb-serial> shell ip route | awk '/wlan0.*src/ {print $9}'   # device IP — read it, don't ask
adb connect <device-ip>:5555
```

The port is yours, not the system's, so a Wi-Fi drop costs one `adb connect` and nothing else.

- **More than a reboot resets it.** Anything that restarts adbd — reboot, toggling USB debugging, toggling 무선 디버깅 — drops it back to USB-only. Re-run `adb tcpip 5555` with the cable in.
- **The IP can still move** on a DHCP lease renewal. Re-read it the same way when `adb connect` starts timing out; the port is the stable half, not the address.
- **5555 stays open to the LAN** until adbd restarts. adb's key authorization still gates it, so this is not an open shell — but on café or guest Wi-Fi it is a wider surface than the pairing flow's ephemeral port. `adb usb` closes it when you're done.
- If `adb connect` refuses after `adb tcpip` reported success, don't dig — fall back to the pairing code below.

Documented from the adb contract, not yet measured on a device here, unlike the pairing route below.

#### Pairing code — no cable available

Two ports are involved and **they are different**:

```bash
adb pair <device-ip>:37189 <6-digit-code>   # pairing port + code
adb connect <device-ip>:40987               # connect port — a DIFFERENT number
```

- The **pairing** port and code come from Developer options → 무선 디버깅 → **페어링 코드로 기기 페어링**. They are only alive while that dialog is open; closing it discards both. If `adb pair` says the port is unreachable, the dialog was closed — ask for a fresh code.
- The **connect** port is shown on the 무선 디버깅 screen itself, and it changes on reboot / toggle.
- `adb mdns services` is supposed to discover the connect port automatically. It has been observed returning nothing even with mDNS otherwise healthy — **don't burn time on it, just ask the user for the port.**

Pairing survives reconnects; only `adb connect` is needed after a drop.

#### Both routes

- The serial becomes `IP:PORT` (e.g. `<device-ip>:5555`). Every `-s` flag, and any note you hand to another agent, must use the new serial.
- `adb forward` and `adb reverse` mappings die with the old serial, so a reconnect loses both. Re-run them before assuming the CDP bridge or the dev server broke.

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
adb -s <serial> forward tcp:9333 localabstract:chrome_devtools_remote
curl -s http://127.0.0.1:9333/json/version    # sanity check
curl -s http://127.0.0.1:9333/json/list       # raw target list, if you want it without the CLI
adb -s <serial> forward --list                # what's currently mapped
adb -s <serial> forward --remove tcp:9333     # drop one mapping
adb -s <serial> forward --remove-all          # clean slate for this device
```

`/json/version` returning `{"Android-Package":"com.android.chrome", ...}` confirms both the link and the forward in one shot.

### Forwards are leaked state — sweep before you add

A forward belongs to the adb **server**, not to your shell or your session. It survives the command that made it, the agent that ran it, and the app being killed; only `adb kill-server`, a device disconnect, or an explicit `--remove` clears it. So `adb forward --list` at the start of a session routinely shows mappings nobody remembers making, still pointed at whatever socket they were given days ago.

```bash
adb forward --list                            # all devices; read it before adding anything
adb -s <serial> forward --remove tcp:<port>   # drop what you don't need
```

Sweep first, forward second. Otherwise the port you "chose" is one someone else's process already owns, and a stale `tcp:9222` in particular quietly breaks a tool that isn't yours — see below.

### Don't take 9222 — it's iwdp's, and adb wins the fight silently

`9222` is `ios-webkit-debug-proxy`'s default as well as the conventional adb forward port, and when both are up the failure is invisible from the Android side:

```
$ lsof -nP -iTCP:9222 -sTCP:LISTEN
adb       68657   ...   TCP 127.0.0.1:9222 (LISTEN)     ← adb forward
ios_webki 89772   ...   TCP *:9222 (LISTEN)             ← iwdp
```

iwdp binds the **wildcard** `*:9222`; `adb forward` binds the **specific** `127.0.0.1:9222`. BSD sockets deliver to the most specific bind, so every `localhost:9222` request reaches Android Chrome. Both bind successfully, neither logs anything, and both serve Chrome-shaped JSON — so the iOS side gets a page list that looks completely normal and is entirely Android tabs. It has cost hours: the wrong page list leads to a wrong diagnosis that stays self-consistent all the way down.

Android is unaffected either way, which is exactly why this is on you to avoid. **Default to 9333**, even when no iPhone is in the room — the leaked forward outlives the day you decided iOS wasn't involved.

### Multiple devices

One host port per device:

```bash
adb -s emulator-5554 forward tcp:9333 localabstract:chrome_devtools_remote
adb -s <serial>      forward tcp:9334 localabstract:chrome_devtools_remote
```

then one CLI daemon per device, each with its own `--sessionId` (`emulator`, `phone`, …).

Other debug bridges claim ports in this range too, so check the one you picked is genuinely free before forwarding — `adb forward` will happily leave you talking to the wrong listener:

```bash
lsof -nP -iTCP:9333 -sTCP:LISTEN     # expect nothing
```

If something holds it, move *yourself* rather than the occupant — the number only has to agree between `adb forward` and `--browserUrl`, and once a `chrome-devtools` daemon is started its endpoint is fixed, so picking a free port up front is cheaper than restarting things later.

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
adb -s <serial> forward tcp:9335 localabstract:webview_devtools_remote_12345
chrome-devtools start --sessionId appwv --browserUrl http://127.0.0.1:9335
```

From there it behaves like Chrome: `list_pages`, `evaluate_script`, `take_snapshot`. Two differences worth expecting:

- The pid in the socket name changes every time the app process restarts, so re-run the grep rather than reusing the old forward.
- One app can expose several WebViews at once. `list_pages` will show them all — read the URLs and pick deliberately; if it's ambiguous which one the user means, show the list and ask rather than guessing.

**Status:** the socket discovery and forward mechanics here are the same ones the Chrome path uses and are sound, but the WebView path has not been driven end to end yet. Treat the specifics above as informed rather than measured, and verify as you go.
