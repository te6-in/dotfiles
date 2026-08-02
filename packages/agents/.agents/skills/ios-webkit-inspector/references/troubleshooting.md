# Troubleshooting

Symptoms you'll hit and how to clear them. Most failures are one of: the USB link dropped, the tab got suspended, or iwdp died.

## Device list is empty (`curl :9221/json` → `[]`)

usbmuxd lost the device — usually a locked screen or a dropped/asleep USB connection. iwdp frequently **can't re-detect a device that dropped while it was running**, so unlock + reconnect alone often isn't enough; restart iwdp:

```bash
pkill -f ios_webkit_debug_proxy
ios_webkit_debug_proxy -c null:9221,:9222-9322 > /tmp/iwdp.log 2>&1 &
```

Confirm the device is visible at the usbmux layer first — this separates "phone not really connected/trusted" from "iwdp problem":

```bash
idevice_id -l        # should print the device UDID; empty means USB/trust issue, not iwdp
```

If `idevice_id` is empty: replug the cable, unlock, and tap **Trust** on the device if prompted.

## Page list is empty (`curl :9222/json` → `[]`) but the device shows up

Web Inspector is off, or no inspectable page is open. On the device: Settings → Safari → Advanced → **Web Inspector = ON**, then open a tab (or an inspectable WebView). For an app WebView, also confirm the build has `isInspectable = true` (debug/alpha) — production builds never appear.

## `eval.mjs` → `timeout waiting for inspector/target`

The target tab is backgrounded or the screen is locked, so WebKit suspended the page and `Target.targetCreated` never arrives. Wake the screen, bring **that specific tab** to the foreground, and rerun. If the page had navigated to an error ("페이지를 열 수 없음" / "Cannot Open Page"), it can't be inspected meaningfully — reload it to the real URL first (it must be able to reach the dev server; see the network half of "Two connections" in SKILL.md).

## `eval.mjs` → `ECONNREFUSED` on `:9222`

iwdp isn't listening — it died, or there's no device on that port. Re-run the restart from "Device list is empty," then re-check `:9221/json` and `:9222/json`.

## `:9222` is already taken by something else

`9222` is a popular default and other debugging tools claim it too, so iwdp may fail to bind or you may end up talking to an unrelated listener. Check who owns it before assuming iwdp is at fault:

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

## Multiple devices

`:9221` lists every connected device, each with its own `url` (`localhost:9222`, `localhost:9223`, …). `eval.mjs` defaults to `:9222` (the first device). To target another, point it at that device's page list:

```bash
IWDP_PAGES_URL=http://localhost:9223/json node scripts/eval.mjs --list
```

## Wrong page / wrong WebView got evaluated

You passed a selector that matched more than one page and something still ran, or you picked the wrong index. Re-run `--list`, read the url/title/PID carefully, and pass a precise `#N`. When the user's intent is genuinely ambiguous (e.g. an app with several WebViews), don't resolve it yourself — show the list and ask. See step 3 in SKILL.md.
