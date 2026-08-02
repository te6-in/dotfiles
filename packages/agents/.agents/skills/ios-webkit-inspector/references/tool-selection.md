# iwdp vs ios-simulator-mcp / idb — which to reach for

These two tracks target different things and surface different information. They're **complements, not competitors** — knowing which one a task needs (and being able to explain that to the user) is half the battle.

| Axis                               | A. `ios-simulator-mcp` (+ `simctl` / `idb`)      | B. iwdp (+ `eval.mjs`) — this skill             |
| ---------------------------------- | ------------------------------------------------ | ----------------------------------------------- |
| Target                             | iOS **Simulator**                                | **Real device** (sim unsupported here)          |
| DOM / computed style               | ❌ (accessibility tree only)                     | ✅ `getComputedStyle` / `getBoundingClientRect` |
| Arbitrary JS eval                  | ❌                                               | ✅                                              |
| In-page navigation                 | tap/swipe by coordinate or a11y                  | JS (`scrollTo` / `click` / set `value`)         |
| Native UI, app switch, permissions | ✅ `launch_app` / `ui_tap`                       | ❌ (web content only)                           |
| Visual / pixel check               | ✅ `screenshot` / `record_video`                 | ❌                                              |
| Setup friction                     | `ui_*` needs idb companion + a compatible Python | brew bottle, low friction                       |

## How to choose

- **Web / WebView content** — layout, CSS, computed styles, DOM state, JS behavior → **B (this skill).** Navigate within the page with JS too.
- **The native flow to _reach_ a WebView**, system permission dialogs, switching apps → **A** (`launch_app` / `ui_tap`).
- **Visual regression** — how it actually renders in pixels → **A** (`screenshot` / `record_video`). Layout _numbers_ come from B; _pixels_ come from A.
- **Stuck on a simulator with no real device** → iwdp can't attach to the sim, so B is out. Fall back to **A**'s `ui_describe_all` (a11y tree) as a rough inspection stand-in — you get labels and frames, but no computed style.
- **Native interaction + DOM inspection on one device simultaneously** → in theory attach raw `idb` to a real device alongside iwdp, but `idb`'s native instrumentation requires **iOS 16+ Developer Mode** (a friction the iwdp / Web Inspector path here does NOT have — it only needs USB pairing/Trust) and this combo is unverified. Doing it on a simulator would need iwdp to see the sim, which is the current blocker.

## Why this skill exists at all

Chrome and Firefox have a DevTools MCP that exposes `evaluate_script` and computed-style queries directly, so an agent just runs JS and reads styles. **Safari has no equivalent for iOS.** iwdp + `eval.mjs` is the closest substitute — it pokes the WebKit remote inspector protocol directly to get the same class of result (arbitrary JS eval, DOM, computed style) that the Chrome/FF DevTools MCP would give you. If you ever find yourself about to debug an iOS-Safari-only rendering issue by squinting at screenshots, that's the signal to reach for this instead.
