// Read DOM / computed style and run arbitrary JS in an iwdp-attached iOS Safari
// tab or inspectable WKWebView.
//
// Modern WebKit uses a multi-target protocol: the page's JS context lives inside
// a sub-target, so the top-level connection only exposes the `Target` domain.
// `Runtime.*` must be wrapped in `Target.sendMessageToTarget`, and replies arrive
// as `Target.dispatchMessageFromTarget` events. Sending `Runtime.evaluate` at the
// top level fails with `'Runtime' domain was not found`.
//
// Usage:
//   node eval.mjs --list                       List inspectable pages, then exit.
//   node eval.mjs '<js expression>' [selector] Evaluate the expression in one page.
//
// selector picks WHICH page to operate on:
//   - a substring matched against the page url OR title (e.g. ":4321", "myapp-webview")
//   - "#N" — the index shown by --list
// The script never guesses when the target is ambiguous: if a selector (or, with no
// selector, the set of content pages) resolves to more than one page, it prints the
// candidates and exits non-zero so the caller can disambiguate (ask the user which
// one) instead of silently evaluating in the wrong context.
//
// Env:
//   IWDP_PAGES_URL  page-list endpoint (default http://localhost:9222/json — the FIRST
//                   attached target, which is the simulator whenever iwdp was given -s)

const DEFAULT_PAGES_URL = "http://localhost:9222/json";
const PAGES_URL = process.env.IWDP_PAGES_URL ?? DEFAULT_PAGES_URL;
const PORT = new URL(PAGES_URL).port || "80";

const fail = (msg, code) => {
  console.error(msg);
  process.exit(code);
};

// `9222` is iwdp's default AND adb's conventional forward port. iwdp binds the
// wildcard `*:9222`; `adb forward` binds the specific `127.0.0.1:9222`, and BSD
// sockets deliver to the specific bind — so adb silently wins every localhost
// request and iwdp is never reached. Both serve Chrome-shaped JSON, so the page
// list alone cannot tell you which one answered. Only Chrome names itself at
// `/json/version` (iwdp has no such route and 404s), so ask before trusting
// anything below.
let version;
try {
  version = await fetch(new URL("/json/version", PAGES_URL)).then((r) =>
    r.json(),
  );
} catch {
  // Not JSON, or nothing there — iwdp's own 404. Expected; carry on.
}

if (
  version?.["Android-Package"] ||
  String(version?.Browser ?? "").startsWith("Chrome/")
)
  fail(
    `${PAGES_URL} is a Chrome DevTools Protocol endpoint, NOT ios-webkit-debug-proxy.\n` +
      `It identified itself as: ${version["Android-Package"] ?? version.Browser}\n` +
      `Refusing to continue — the page list here is Android Chrome's tabs (or desktop\n` +
      `Chrome's), and everything you read from them would be attributed to iOS.\n` +
      `\n` +
      `Almost always a leftover \`adb forward\`, which outlives the session that made it:\n` +
      `  lsof -nP -iTCP:${PORT} -sTCP:LISTEN   # two listeners = the collision; adb shadows iwdp\n` +
      `  adb forward --list                 # find it\n` +
      `  adb forward --remove tcp:${PORT}      # release it, then rerun\n` +
      `\n` +
      `Or leave adb alone and reach iwdp's wildcard bind by a non-loopback address:\n` +
      `  IWDP_PAGES_URL=http://<mac-lan-ip>:${PORT}/json node scripts/eval.mjs ...\n` +
      `See references/troubleshooting.md.`,
    8,
  );

// The default port is "the first attached target", and which target that is flips
// silently: iwdp hands a `-s` simulator the first port and pushes USB devices down one,
// so the same URL means a different screen depending on how iwdp was started. Only guard
// the default — an explicit IWDP_PAGES_URL is the caller having already chosen. The
// device-list port is only knowable by convention, so a miss here just skips the check.
if (!process.env.IWDP_PAGES_URL) {
  let targets;
  try {
    targets = await fetch("http://localhost:9221/json").then((r) => r.json());
  } catch {
    // iwdp on a non-default range, or not running. The page fetch below reports it.
  }

  if (Array.isArray(targets) && targets.length > 1)
    fail(
      `${targets.length} targets are attached, and this script defaults to ${DEFAULT_PAGES_URL},\n` +
        `the FIRST of them — which is not necessarily the one you mean:\n` +
        targets
          .map((t) => `  ${t.url}  ${t.deviceName} (iOS ${t.deviceOSVersion})`)
          .join("\n") +
        `\n\n` +
        `A "SIMULATOR" row is whichever socket iwdp was given via -s, and it always takes\n` +
        `the first port, pushing USB devices down one. Refusing to guess between them.\n` +
        `\n` +
        `  node scripts/targets.mjs   # which simulator that row is, by name and UDID\n` +
        `\n` +
        `Ask the user which target holds the page, then name its port explicitly:\n` +
        `  IWDP_PAGES_URL=http://localhost:<port>/json node scripts/eval.mjs ...`,
      10,
    );
}

// Extension background pages are inspectable but are almost never the debug target;
// keep them out of no-selector auto-selection while still showing them in --list.
const isExtensionPage = (p) =>
  (p.url || "").startsWith("safari-web-extension://");

function formatPages(pages, all) {
  return pages
    .map((p) => {
      const i = all.indexOf(p);
      const ext = isExtensionPage(p) ? "  [extension bg]" : "";
      return `  #${i}  pid:${p.appId ?? "?"}  ${p.title || "(no title)"}\n        ${p.url}${ext}`;
    })
    .join("\n");
}

let list;
try {
  list = await fetch(PAGES_URL).then((r) => r.json());
} catch (e) {
  fail(
    `cannot reach iwdp page list at ${PAGES_URL} (${e?.cause?.code ?? e?.message ?? e}).\n` +
      `Is ios_webkit_debug_proxy running, and is the target still attached?\n` +
      `\n` +
      `  curl -s http://localhost:9221/json   # [] means iwdp is up but holds no target\n` +
      `  node scripts/targets.mjs             # what is actually available right now\n` +
      `\n` +
      `If iwdp was attached to a simulator with -s and that simulator has rebooted since,\n` +
      `this is expected: the socket path carries a per-boot random segment, and iwdp stays\n` +
      `running against the dead path rather than exiting. Restart it on the new socket.\n` +
      `See references/troubleshooting.md.`,
    4,
  );
}

const inspectable = list.filter((p) => p.webSocketDebuggerUrl);
if (inspectable.length === 0)
  fail(
    `no inspectable pages at ${PAGES_URL}.\n` +
      `Enable Web Inspector (Settings → Safari → Advanced → Web Inspector — on the device,\n` +
      `or in the simulator's own Settings app) and open a tab / inspectable WebView.\n` +
      `If that is already true, check this port is the target you meant:\n` +
      `  curl -s http://localhost:9221/json`,
    3,
  );

const EXPR = process.argv[2];

// --list (or no expression): show the menu and stop. Let the caller pick.
if (!EXPR || EXPR === "--list") {
  console.error(`inspectable pages on ${PAGES_URL}:`);
  console.log(formatPages(inspectable, inspectable));
  process.exit(0);
}

// Resolve the target page from the selector, refusing to guess on ambiguity.
const SELECTOR = process.argv[3];
let candidates;
if (SELECTOR && /^#\d+$/.test(SELECTOR)) {
  const idx = Number(SELECTOR.slice(1));
  const picked = inspectable[idx];
  if (!picked) {
    console.error(`no page at index ${SELECTOR}. inspectable pages:`);
    console.error(formatPages(inspectable, inspectable));
    process.exit(3);
  }
  candidates = [picked];
} else if (SELECTOR) {
  candidates = inspectable.filter(
    (p) =>
      (p.url || "").includes(SELECTOR) || (p.title || "").includes(SELECTOR),
  );
} else {
  // No selector: only real content pages are auto-selectable (drop extension bg noise).
  candidates = inspectable.filter((p) => !isExtensionPage(p));
}

if (candidates.length === 0)
  fail(
    `no page matches ${SELECTOR ? `"${SELECTOR}"` : "(no selector)"}. inspectable pages:\n` +
      formatPages(inspectable, inspectable),
    3,
  );

if (candidates.length > 1)
  fail(
    `ambiguous: ${candidates.length} pages match ${SELECTOR ? `"${SELECTOR}"` : "(no selector)"}.\n` +
      `Pass a narrower selector or "#N" to choose exactly one — do NOT guess; if it is\n` +
      `unclear which page the user means, show this list and ask them:\n` +
      formatPages(candidates, inspectable),
    9,
  );

const page = candidates[0];
console.error(`page: ${page.title || "(no title)"} — ${page.url}`);

// A Safari "Cannot Open Page" error renders as a data: URL (and about:blank is an
// empty tab). Either means the device's Safari never loaded the real page — almost
// always because it can't reach your dev server. The inspector link (USB) is fine,
// so this won't hard-fail, but evaluating here returns meaningless values, so warn.
if (!page.url || page.url.startsWith("data:") || page.url === "about:blank")
  console.error(
    `warning: this page hasn't loaded a real URL — the device's Safari likely can't reach\n` +
      `your dev server. The inspector reaches the device over USB, but the device loads the\n` +
      `page over the network and CANNOT use the Mac's localhost: serve on an address the device\n` +
      `itself resolves (a LAN IP, or a hostname its DNS answers for) and\n` +
      `open that on the device, then reload. Any result below is from the error/blank page, not\n` +
      `your app. See references/troubleshooting.md.`,
  );

const ws = new WebSocket(page.webSocketDebuggerUrl);

let targetId = null;
let outerId = 1;
let innerId = 1;
let evalInnerId = null;

const timeout = setTimeout(
  () =>
    fail(
      "timeout waiting for inspector/target — no `Target.targetCreated` in 15s.\n" +
        "The WebSocket connected, but that proves only that SOMETHING accepted it. A Chrome\n" +
        "CDP endpoint accepts the connection too and then never sends WebKit's targetCreated,\n" +
        "so a successful connect is NOT evidence you reached iwdp. Candidate causes, and how\n" +
        "to tell them apart — most-missed first:\n" +
        "\n" +
        `  1. Not iwdp on the other end. The startup check only rejects an endpoint that names\n` +
        `     itself as Chrome, so an unlabelled one gets this far. More than one listener on\n` +
        `     the port means a collision, and adb's 127.0.0.1 bind shadows iwdp's wildcard:\n` +
        `       lsof -nP -iTCP:${PORT} -sTCP:LISTEN\n` +
        "  2. Tab backgrounded or screen locked — WebKit suspends the page. Wake the screen,\n" +
        "     bring THAT tab to the foreground, rerun.\n" +
        "  3. Stale page entry — the tab was closed or navigated since --list was taken.\n" +
        "     Rerun --list and re-pick.\n" +
        "\n" +
        "See references/troubleshooting.md.",
      5,
    ),
  15000,
);

function sendToTarget(method, params = {}) {
  const id = innerId++;
  ws.send(
    JSON.stringify({
      id: outerId++,
      method: "Target.sendMessageToTarget",
      params: { targetId, message: JSON.stringify({ id, method, params }) },
    }),
  );
  return id;
}

ws.addEventListener("message", (ev) => {
  let msg;
  try {
    msg = JSON.parse(ev.data);
  } catch {
    return;
  }

  if (msg.method === "Target.targetCreated") {
    targetId = msg.params?.targetInfo?.targetId;
    if (targetId) {
      sendToTarget("Runtime.enable");
      evalInnerId = sendToTarget("Runtime.evaluate", {
        expression: EXPR,
        returnByValue: true,
        includeCommandLineAPI: true,
      });
    }
    return;
  }

  if (msg.method === "Target.dispatchMessageFromTarget") {
    let inner;
    try {
      inner = JSON.parse(msg.params.message);
    } catch {
      return;
    }
    if (inner.id === evalInnerId) {
      clearTimeout(timeout);
      if (inner.error)
        fail("eval protocol error: " + JSON.stringify(inner.error), 7);
      const r = inner.result?.result ?? inner.result;
      if (r && r.value !== undefined)
        console.log(
          typeof r.value === "string"
            ? r.value
            : JSON.stringify(r.value, null, 2),
        );
      else console.log(JSON.stringify(r, null, 2));
      ws.close();
      process.exit(0);
    }
  }
});

ws.addEventListener("error", (e) => fail("ws error: " + (e.message ?? e), 6));

// Nudge target discovery if targetCreated doesn't arrive on its own.
ws.addEventListener("open", () => {
  setTimeout(() => {
    if (!targetId) {
      try {
        ws.send(JSON.stringify({ id: outerId++, method: "Inspector.enable" }));
      } catch {}
    }
  }, 1500);
});
