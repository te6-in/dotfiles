# Troubleshooting

Symptoms you'll hit and how to clear them. Most failures are one of: the USB link dropped, the tab got suspended, or iwdp died.

## A target vanished from `:9221/json`

Two unrelated faults land here, so establish which target you were attached to before doing anything. If iwdp was started with `-s`, read the simulator section first — restarting for a phone that was never involved is the waste this ordering prevents.

### On a simulator: the socket rotated

`/private/tmp/com.apple.launchd.<random>/com.apple.webinspectord_sim.socket` gets a fresh `<random>` segment every time the simulator boots. Reboot it and the iwdp instance pinned to the old path **keeps running** — it doesn't exit and doesn't log. What it looks like depends on what else was attached:

- **Simulator only** → `:9221` returns `[]`, exactly like a phone that dropped.
- **A phone attached too** → the `SIMULATOR` row simply disappears and the phone **keeps the shifted port it was given at startup**. So `:9221` shows one device on `:9223`, `:9222` has no listener at all, and `curl :9222/json` fails with `ECONNREFUSED` — which reads like "iwdp died" even though it's up and serving the phone fine.

Neither shape says "simulator". Re-discover and restart:

```bash
node scripts/targets.mjs        # prints the current socket, and the command to use
pkill -f ios_webkit_debug_proxy
ios_webkit_debug_proxy -s unix:<new-socket> -c null:9221,:9222-9322 > /tmp/iwdp.log 2>&1 &
```

`targets.mjs` listing the simulator with a socket that differs from the one in `pgrep -fl ios_webkit_debug_proxy` confirms the diagnosis outright.

If a phone is still attached to the stale instance and working, don't `pkill` — that takes the phone down to fix the simulator. Start a second instance on a free range instead and leave the first alone:

```bash
ios_webkit_debug_proxy -s unix:<new-socket> -c null:9231,:9232-9332 > /tmp/iwdp-sim.log 2>&1 &
IWDP_PAGES_URL=http://localhost:9232/json node scripts/eval.mjs --list
```

A simulator missing from `targets.mjs` altogether is a different thing: it isn't booted, or nothing has started `webinspectord_sim` on it yet. Boot it and open Safari once.

### On a real device: usbmuxd lost it

usbmuxd lost the device — usually a locked screen (see "The screen keeps locking mid-session") or a dropped/asleep USB connection. iwdp frequently **can't re-detect a device that dropped while it was running**, so unlock + reconnect alone often isn't enough; restart iwdp:

```bash
pkill -f ios_webkit_debug_proxy
ios_webkit_debug_proxy -c null:9221,:9222-9322 > /tmp/iwdp.log 2>&1 &
```

Confirm the device is visible at the usbmux layer first — this separates "phone not really connected/trusted" from "iwdp problem":

```bash
idevice_id -l        # should print the device UDID; empty means USB/trust issue, not iwdp
```

If `idevice_id` is empty: replug the cable, unlock, and tap **Trust** on the device if prompted.

## Page list is empty (`curl :9222/json` → `[]`) but the target shows up

Web Inspector is off, or no inspectable page is open. Settings → Safari → Advanced → **Web Inspector = ON** — on the device, or in the simulator's own Settings app — then open a tab (or an inspectable WebView). For an app WebView, also confirm the build has `isInspectable = true` (debug/alpha) — production builds never appear.

Check you're reading the right port first, though: with a simulator attached, `:9222` is the simulator and the phone is on `:9223`. See "Multiple targets" below.

## Wrong endpoint — the page list is real, it's just someone else's browser

**Symptom.** Everything looks healthy: `--list` returns pages with plausible titles and urls, the WebSocket connects — and then every eval dies at `timeout waiting for inspector/target`. No error anywhere says you're in the wrong place. Extra tell: the pages are all `http(s)://…`, whereas a real iwdp list on a device with Safari extensions usually has a `safari-web-extension://…` background page mixed in. Android Chrome never shows one.

**Cause.** Two listeners on `9222`, and the loser is silent:

```
$ lsof -nP -iTCP:9222 -sTCP:LISTEN
adb       68657   ...   TCP 127.0.0.1:9222 (LISTEN)     ← adb forward (Android)
ios_webki 89772   ...   TCP *:9222 (LISTEN)             ← iwdp (iOS)
```

`ios_webkit_debug_proxy -c null:9221,:9222-9322` binds the **wildcard** `*:9222`; `adb forward tcp:9222 localabstract:chrome_devtools_remote` binds the **specific** `127.0.0.1:9222`. BSD sockets deliver to the most specific bind, so every `localhost:9222` request goes to Android Chrome and iwdp is never reached. Neither process errors — both bind successfully, and both serve Chrome-shaped JSON, so the two page lists are indistinguishable by shape. `adb forward` mappings **outlive the session that created them**, so the forward doing this may be days old. The `android-web-inspector` skill defaults to `9333` for exactly this reason — a forward on `9222` predates that rule, or came from somewhere else.

**Confirm.** iwdp has no `/json/version` route; Chrome does and names itself there:

```bash
curl -s http://localhost:9222/json/version
# {"Android-Package":"com.android.chrome","Browser":"Chrome/150.0.7871.186", ...}   ← Android Chrome
# <html><title>Error 404 (Not Found)</title> ...                                    ← iwdp, as expected
```

`eval.mjs` runs this check itself now and refuses to continue on a self-identified Chrome endpoint. It's a positive-evidence check, so it can only catch an endpoint that names itself — `lsof` remains the ground truth.

**Fix.** Remove the collision — the forward is usually the disposable half:

```bash
adb forward --list                 # see every mapping, including stale ones
adb forward --remove tcp:9222      # release the port; iwdp's wildcard takes over immediately
```

If the Android session is live and you need both, move one: forward Android to `9333` instead, or start iwdp on another range (`-c null:9321,:9322-9422`). As a stopgap that needs no restart at all, address iwdp's wildcard bind by a non-loopback address — the specific bind only claims `127.0.0.1`:

```bash
IWDP_PAGES_URL=http://<mac-lan-ip>:9222/json node scripts/eval.mjs '<expr>' '<selector>'
```

## `eval.mjs` → `timeout waiting for inspector/target`

Three different faults land here, and the connection succeeding tells you nothing — a Chrome CDP endpoint accepts the WebSocket too, then never sends WebKit's `targetCreated`. Work them in this order:

1. **Wrong endpoint** (see the section above). One `lsof` settles it. Cheapest to check and the one that wastes hours when missed, because every other explanation stays plausible.
2. **Suspended page — real device only.** The target tab is backgrounded or the screen is locked, so WebKit suspended it. Wake the screen, bring **that specific tab** to the foreground, and rerun. If it's the screen and it happens twice, stop rerunning and deal with Auto-Lock — see below. On a simulator this cause doesn't exist: a backgrounded Safari there still reports `visibilityState: "visible"` and evaluates normally, so don't spend a turn asking the user to foreground a simulator window.
3. **Stale or unusable page.** The tab was closed or navigated since `--list`; rerun it. If the page had navigated to an error ("페이지를 열 수 없음" / "Cannot Open Page"), it can't be inspected meaningfully — reload it to the real URL first (it must be able to reach the dev server; see the network half of "Two connections" in SKILL.md).

Don't act on one of these as if it were established until you've ruled out the one above it. Repeatedly asking the user to unlock a phone that was never being talked to is the failure mode this ordering exists to prevent.

## The screen keeps locking mid-session

Real devices only — a simulator never locks or sleeps. Nothing on this side can prevent it — iOS has no remote wake-lock. It's Auto-Lock on the device; SKILL.md step 0 has the path. Raise it the first time a lock costs you a step, ask once, and tell the user to set it back when you're done — it's their phone.

## `eval.mjs` → `ECONNREFUSED` on `:9222`

iwdp isn't listening — it died, or there's no device on that port. Re-run the restart from "Device list is empty," then re-check `:9221/json` and `:9222/json`.

## `:9222` is already taken by something else

`9222` is a popular default and other debugging tools claim it too, so iwdp may fail to bind outright. (The nastier variant — iwdp binds fine and gets shadowed anyway — is "Wrong endpoint" above.) Check who owns it before assuming iwdp is at fault:

```bash
lsof -nP -iTCP:9222 -sTCP:LISTEN
```

If something else holds it, start iwdp on a free range and point the script at the new port:

```bash
ios_webkit_debug_proxy -c null:9321,:9322-9422 > /tmp/iwdp.log 2>&1 &
IWDP_PAGES_URL=http://localhost:9322/json node scripts/eval.mjs --list
```

Whether to move iwdp or the other listener depends on which is cheaper to restart — some tools bake the port into a long-lived process, and those are the ones to leave alone.

## `'Runtime' domain was not found`

You sent `Runtime.evaluate` at the top level instead of wrapping it in `Target.sendMessageToTarget`. `scripts/eval.mjs` handles this — use the script rather than hand-rolling protocol messages. If you're seeing this _from_ the script, you're likely on a very old WebKit that isn't multi-target; that's out of scope here.

## node errors about `WebSocket` being undefined

The script uses the global `WebSocket`, which exists only on **node v22+**. Check `node --version`. On older node you'd need the `ws` package instead — simplest is to upgrade node.

## Multiple targets — and what `:9222` actually points at

`:9221` lists every attached target, each with its own `url` (`localhost:9222`, `localhost:9223`, …). `eval.mjs` defaults to `:9222`. **That default is not a stable identity**, because attaching a simulator changes who holds it:

| iwdp started as               | `:9222`       | `:9223`     |
| ----------------------------- | ------------- | ----------- |
| `-c null:9221,:9222-9322`     | first device  | next device |
| `-s unix:<sock> -c …`         | **simulator** | first device |

The simulator wins `:9222` because iwdp fakes its attach synchronously at startup, before usbmuxd's device callbacks arrive; it's consistent across restarts, but it means the same command line points at a different phone the moment someone adds `-s`. Nothing errors and the page list looks normal either way.

So read `:9221/json` and carry the port explicitly:

```bash
curl -s http://localhost:9221/json
IWDP_PAGES_URL=http://localhost:9223/json node scripts/eval.mjs --list
```

A `SIMULATOR` row (`deviceName: "SIMULATOR"`, `deviceOSVersion: "0.0.0"`) never says *which* simulator — iwdp doesn't know. It's whichever socket `-s` named; `node scripts/targets.mjs` is what maps that socket back to a name and UDID.

Two simulators at once need two iwdp instances, since one instance carries only one simulator slot:

```bash
ios_webkit_debug_proxy -s unix:<sock-A> -c null:9221,:9222-9322 > /tmp/iwdp-a.log 2>&1 &
ios_webkit_debug_proxy -s unix:<sock-B> -c null:9231,:9232-9332 > /tmp/iwdp-b.log 2>&1 &
```

## Wrong page / wrong WebView got evaluated

You passed a selector that matched more than one page and something still ran, or you picked the wrong index. Re-run `--list`, read the url/title/PID carefully, and pass a precise `#N`. When the user's intent is genuinely ambiguous (e.g. an app with several WebViews), don't resolve it yourself — show the list and ask. See step 3 in SKILL.md.
