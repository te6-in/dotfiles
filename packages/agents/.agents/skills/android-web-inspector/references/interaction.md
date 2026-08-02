# Driving the device — clicks, keyboard, taps, screenshots

Two input paths. Reach for the first; drop to the second only when it can't reach.

| | `chrome-devtools` CLI | `adb shell input` |
| --- | --- | --- |
| Addressing | a11y `uid` — no pixel math | device pixels — needs calibration |
| Reaches | page content only | anything on screen |
| Raises the soft keyboard | **yes** (foreground tab) | yes |
| Foreground tab required | yes | yes (it's a real tap) |

## Path 1 — a11y clicks (default)

```bash
chrome-devtools take_snapshot --sessionId android
# uid=3_0 textbox "Name"
# uid=3_1 button "제출"
chrome-devtools click 3_0 --sessionId android
chrome-devtools fill 3_0 "hello" --sessionId android
```

Measured: clicking a foreground-tab `<input>` focused it and took `visualViewport.height` 809 → 461. That is a real IME raise, so the whole keyboard-bug workflow works without touching pixel coordinates.

`uid`s are regenerated per snapshot — take a fresh snapshot after anything that re-renders, and don't cache them across steps.

**Only the foreground tab responds.** In a background tab `click` returns "Successfully clicked" while `document.activeElement` stays unchanged and the viewport never moves. See SKILL.md step 4 for identifying the foreground tab.

## Keyboard control

```bash
adb -s <serial> shell settings put secure show_ime_with_hard_keyboard 1  # emulator precondition
adb -s <serial> shell input keyevent 4        # back — dismisses the IME, leaves the page alone
adb -s <serial> shell input text "hello"      # types into the focused field
adb -s <serial> shell input keyevent 66       # Enter
```

- **`keyevent 4` (back) is the right dismissal.** It closes the IME and nothing else — the page, the route and any open overlay survive.
- **`keyevent 111` (ESC) is not.** It propagates into the page, so it will also close your dialog / sheet / modal and destroy the state you were measuring. This has burned a real debugging session.
- `show_ime_with_hard_keyboard` is a persistent secure setting. It stays on after you finish, so tell the user you changed it, and read the old value first if you intend to restore it.

Confirm the keyboard's actual state from the page rather than from a screenshot:

```bash
chrome-devtools evaluate_script --sessionId android \
  '() => ({innerH: innerHeight, vvH: Math.round(visualViewport.height), vvTop: Math.round(visualViewport.offsetTop)})'
```

A raised keyboard shows up as `innerH - vvH - vvTop` being large. Don't use `innerH - vvH > 60` alone as the up/down test: on a device where Chrome pans, `vvTop` absorbs the whole difference and that expression reads 0 with the keyboard fully up. Include `vvTop`.

## Path 2 — real taps

Needed for what the a11y tree can't address: browser chrome (address bar, tab switcher), keys on the IME itself, system permission dialogs, and gestures.

`adb shell input tap` takes **device pixels**, while everything you measure in the page is **CSS pixels**:

```
deviceX = cssX * dpr
deviceY = topOffset + (cssY - visualViewport.offsetTop) * dpr
```

`dpr` is exact from `devicePixelRatio`. `topOffset` — where the page's `y=0` lands in the screenshot — is **not** derivable: it depends on the status bar, and on whether Chrome's address bar is at the top or the bottom. Measured values have ranged from 63 (emulator, bottom address bar) to ~98–101 (a physical mid-range phone). Guessing it wastes taps on nothing.

### Calibrating

Paint bars at known CSS offsets, screenshot, read where they landed:

```bash
chrome-devtools evaluate_script --sessionId android '() => {
  document.querySelectorAll(".__cal").forEach(n => n.remove());
  const mk = (top, color) => { const d = document.createElement("div"); d.className = "__cal";
    Object.assign(d.style, {position:"fixed",left:"0",top:top+"px",width:"100%",height:"4px",
      background:color,zIndex:2147483647}); document.body.appendChild(d); };
  mk(0,"red"); mk(200,"lime"); mk(400,"blue");
  return {dpr: devicePixelRatio};
}'
adb -s <serial> exec-out screencap -p > /tmp/cal.png     # then Read the png
```

Read the three bars' rows off the image. Then:

- `dpr = (limeRow - redRow) / 200` — must match `devicePixelRatio`
- `topOffset = redRow`
- verify with blue: `redRow + 400 * dpr` must equal the blue row

A worked example from an Android 16 emulator: red at 63, lime at 588, blue at 1113 → `dpr = (588-63)/200 = 2.625` (matches `devicePixelRatio`), `topOffset = 63`, blue predicted `63 + 400×2.625 = 1113` — exact. A `cssY 288` element then taps at `63 + 288×2.625 = 819`.

Three bars, not one: the third is what catches a wrong reading, and the check is free.

**Remove the bars before measuring anything** — they're `position: fixed` at max z-index and will corrupt hit-testing and layout reads:

```bash
chrome-devtools evaluate_script --sessionId android \
  '() => { document.querySelectorAll(".__cal").forEach(n => n.remove()); return "cleaned"; }'
```

Recalibrate whenever the browser chrome changes height — Chrome collapses its toolbar when the keyboard comes up, which moves `topOffset`.

### Tapping and gesturing

```bash
adb -s <serial> shell input tap <deviceX> <deviceY>
adb -s <serial> shell input swipe <x1> <y1> <x2> <y2> <durationMs>   # 300ms reads as a real drag
```

Before trusting a tap, verify the target is actually on top — an error overlay or a modal backdrop will silently eat it:

```bash
chrome-devtools evaluate_script --sessionId android '() => {
  const el = document.querySelector("YOUR_SELECTOR"), r = el.getBoundingClientRect();
  const hit = document.elementFromPoint(r.left + r.width/2, r.top + r.height/2);
  return {onTop: hit === el, hit: hit?.tagName + (hit?.id ? "#" + hit.id : "")};
}'
```

Then confirm the tap landed by reading `document.activeElement` — not by assuming.

Emulator latency is real: `input keyevent`/`input tap` has been seen taking several seconds to reach the page. Sleep generously before measuring, and don't read a flaky result as a bug.

## Screenshots

```bash
adb -s <serial> exec-out screencap -p > /tmp/shot.png   # then Read the png
```

This is the screenshot path. It captures the **whole screen** — page, browser chrome, the IME, system bars — which is exactly what keyboard and viewport bugs need to show.

`chrome-devtools take_screenshot` is not a substitute: it timed out on 4 of 5 attempts against an Android target, and even when it succeeds it captures only the page, so the keyboard you're debugging is invisible in it.

## Things that quietly produce wrong numbers

- **Measuring a background tab.** Its viewport values are stale (one read `innerHeight 837` while the foreground tab read `809`). `document.visibilityState` reported `"visible"` for both, so it can't be used to tell them apart.
- **HMR ghosts.** After hot-reloading, a stale detached node can still answer `querySelector`, giving numbers that don't match what's on screen. Hard-reload before trusting a measurement that looks impossible.
- **Mid-animation reads.** Chrome pans the visual viewport over ~150ms and briefly reports absurd values (`innerHeight: 1145` on an 809px-tall viewport has been observed). Sample the settled state, and when you do want the transient, capture a series with timestamps rather than one point.
- **`navigate_page` CLI arg parsing.** `chrome-devtools navigate_page "<url>" --type url` binds the URL to the `type` positional and errors out. Navigate with `evaluate_script '() => { location.href = "..." }'` or `adb shell am start` instead.
