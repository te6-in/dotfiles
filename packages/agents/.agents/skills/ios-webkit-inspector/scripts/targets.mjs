// Enumerate every target iwdp could attach to — USB-connected devices and booted
// simulators — and print the exact command that attaches each one.
//
// iwdp itself cannot tell you which simulator you are looking at: it fakes a single
// pseudo-device literally named "SIMULATOR" with OS version 0.0.0, and connects it to
// whichever socket `-s` names. So the device-to-socket mapping has to be established
// out here, before iwdp starts, and it is the only place the user can be asked which
// target they mean.
//
// Usage:
//   node targets.mjs

import { execFileSync } from "node:child_process";

function sh(cmd, args) {
  try {
    return execFileSync(cmd, args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    return "";
  }
}

const lines = (out) => out.split("\n").filter((l) => l.trim());

function usbDevices() {
  return lines(sh("idevice_id", ["-l"])).map((udid) => ({
    kind: "device",
    udid: udid.trim(),
    // Empty (not just missing) is what a failed lookup returns, so `||` is deliberate.
    name: sh("ideviceinfo", ["-u", udid.trim(), "-k", "DeviceName"]).trim() || "(unknown)",
    os: `iOS ${sh("ideviceinfo", ["-u", udid.trim(), "-k", "ProductVersion"]).trim() || "?"}`,
  }));
}

// Each booted simulator's webinspectord socket is held by that simulator's own
// `launchd_sim`, whose environment carries SIMULATOR_UDID — that pairing is what turns
// an anonymous socket path into a named device.
function simulatorSockets() {
  const holders = new Set(
    lines(sh("lsof", ["-U"]))
      .filter((l) => l.startsWith("launchd_s") && l.includes("webinspectord_sim"))
      .map((l) => l.split(/\s+/)[1]),
  );

  const byUdid = new Map();
  for (const pid of holders) {
    // lsof ORs its selection flags unless `-a` is given, so without it `-p` is ignored
    // and every process's sockets come back — silently mapping one socket to every sim.
    const sock = lines(sh("lsof", ["-a", "-U", "-p", pid]))
      .find((l) => l.includes("webinspectord_sim"))
      ?.split(/\s+/)
      .pop();

    const udid = sh("ps", ["eww", pid])
      .split(/\s+/)
      .find((tok) => tok.startsWith("SIMULATOR_UDID="))
      ?.slice("SIMULATOR_UDID=".length);

    if (sock && udid) byUdid.set(udid, sock);
  }

  return byUdid;
}

function bootedSimulators() {
  const out = sh("xcrun", ["simctl", "list", "devices", "booted", "-j"]);
  if (!out) return [];

  const sockets = simulatorSockets();

  return Object.entries(JSON.parse(out).devices).flatMap(([runtime, devices]) =>
    devices.map((d) => ({
      kind: "sim",
      udid: d.udid,
      name: d.name,
      os: runtime
        .replace(/^com\.apple\.CoreSimulator\.SimRuntime\./, "")
        .replace(/^([A-Za-z]+)-/, "$1 ")
        .replaceAll("-", "."),
      sock: sockets.get(d.udid),
    })),
  );
}

const targets = [...usbDevices(), ...bootedSimulators()];

if (targets.length === 0) {
  console.log(
    "no targets.\n" +
      "  device — plug it in over USB, unlock, and tap Trust; verify with `idevice_id -l`\n" +
      "  sim    — boot one (`xcrun simctl boot <udid>`) and open Safari once",
  );
  process.exit(0);
}

console.log("targets:");
for (const [i, t] of targets.entries()) {
  const n = i + 1;
  console.log(`  [${n}] ${t.kind.padEnd(6)}  ${t.name} (${t.os})`);
  console.log(`${" ".repeat(16)}udid: ${t.udid}`);
  if (t.kind === "sim")
    console.log(
      `${" ".repeat(16)}sock: ${t.sock ?? "(none — open Safari on this simulator once, then rerun)"}`,
    );
}

console.log("");
console.log(
  targets.length > 1
    ? `${targets.length} targets — ASK THE USER which one holds (or will hold) the page, then attach only that one:`
    : "1 target — no ambiguity; attach it:",
);
console.log("");

// A device can be pinned by UDID, which also excludes every other target. A simulator
// cannot: iwdp's config parser only accepts a hex UDID, `*` or `null` as a device id, so
// the literal "SIMULATOR" it names simulators by is unusable there (it falls through to
// being read as a filename — "Unknown file"). A simulator run therefore still picks up
// any connected phone, one port further along.
for (const [i, t] of targets.entries()) {
  console.log(
    t.kind === "sim"
      ? `  [${i + 1}] ios_webkit_debug_proxy -s unix:${t.sock} -c null:9221,:9222-9322`
      : `  [${i + 1}] ios_webkit_debug_proxy -c null:9221,${t.udid}:9222`,
  );
}

console.log("");
console.log(
  "Then read `curl -s http://localhost:9221/json` for the port map, and carry that port as\n" +
    "IWDP_PAGES_URL for the rest of the session. Do NOT assume :9222 — a simulator claims it\n" +
    "and pushes USB devices to :9223+, and a simulator cannot be attached on its own, so a\n" +
    "phone left plugged in is still listed alongside it.",
);
