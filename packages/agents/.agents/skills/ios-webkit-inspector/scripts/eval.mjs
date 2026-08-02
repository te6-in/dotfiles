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
//   IWDP_PAGES_URL  page-list endpoint (default http://localhost:9222/json — first device)

const PAGES_URL = process.env.IWDP_PAGES_URL ?? "http://localhost:9222/json";

const fail = (msg, code) => {
  console.error(msg);
  process.exit(code);
};

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
      `Is ios_webkit_debug_proxy running and the device connected? See references/troubleshooting.md.`,
    4,
  );
}

const inspectable = list.filter((p) => p.webSocketDebuggerUrl);
if (inspectable.length === 0)
  fail(
    `no inspectable pages.\n` +
      `Enable Web Inspector on the device (Settings → Safari → Advanced → Web Inspector)\n` +
      `and open a tab / inspectable WebView, then retry.`,
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
      "timeout waiting for inspector/target.\n" +
        "The tab is probably backgrounded or the screen is locked (WebKit suspends the\n" +
        "page, so targetCreated never arrives). Wake the screen, bring that tab to the\n" +
        "foreground, and retry. See references/troubleshooting.md.",
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
