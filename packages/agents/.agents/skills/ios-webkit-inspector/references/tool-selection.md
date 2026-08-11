# iwdp vs ios-simulator-mcp / idb — which to reach for

These two tracks surface different information about the same screen. They're **complements, not competitors** — knowing which one a task needs (and being able to explain that to the user) is half the battle. The split is web content vs native, not simulator vs device: both tracks reach a simulator.

| Axis                               | A. `ios-simulator-mcp` (+ `simctl` / `idb`)      | B. iwdp (+ `eval.mjs`) — this skill             |
| ---------------------------------- | ------------------------------------------------ | ----------------------------------------------- |
| Target                             | iOS **Simulator** only                           | **Simulator and real device**                   |
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
- **Only a simulator, no real device** → still **B**. Point iwdp at the simulator's `webinspectord_sim` socket with `-s` and everything above works — DOM, computed style, JS eval, app WKWebViews. `scripts/targets.mjs` finds the socket; SKILL.md steps 0–2 have the flow.
- **Native interaction + DOM inspection on one target simultaneously** → **A + B together.** On a simulator this needs nothing special from iwdp's side; the only friction is A's, since `ui_*` needs the idb companion installed (`spawn idb ENOENT` if it isn't — `simctl`-backed calls like `screenshot` and `launch_app` still work without it). On a real device, `idb`'s native instrumentation also requires **iOS 16+ Developer Mode**, a friction the iwdp / Web Inspector path does NOT have — it only needs USB pairing/Trust.

## Choosing between a simulator and a real device

B reaches both, so when both are available it's a real choice — and the wrong one is silent, since a simulator returns plausible layout numbers for a bug that only exists on hardware. **Ask the user which one the page is on rather than deciding for them** (SKILL.md step 0). Rules of thumb for advising them:

- **Simulator is fine** for layout/CSS, computed styles, DOM state, and most JS behavior — it runs the same WebKit.
- **Real device is required** for anything hardware- or shell-dependent: the actual Safari chrome and its collapsing address bar, `visualViewport` behavior under the software keyboard, safe-area insets on a specific model, touch/gesture handling, performance figures, and camera/sensor-backed APIs.

## Why this skill exists at all

Chrome and Firefox have a DevTools MCP that exposes `evaluate_script` and computed-style queries directly, so an agent just runs JS and reads styles. **Safari has no equivalent for iOS.** iwdp + `eval.mjs` is the closest substitute — it pokes the WebKit remote inspector protocol directly to get the same class of result (arbitrary JS eval, DOM, computed style) that the Chrome/FF DevTools MCP would give you. If you ever find yourself about to debug an iOS-Safari-only rendering issue by squinting at screenshots, that's the signal to reach for this instead.
