// Headless Edge DOM smoke test: catches the "invariant expected layout router
// to be mounted" dev-overlay error and verifies the app actually hydrated.
// Usage: node scripts/browser-test.mjs [dev|start] [port]
import { spawn, execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const mode = process.argv[2] || "dev";
const port = Number(process.argv[3] || 3005);
const base = `http://localhost:${port}`;

function runEdge(args) {
  const out = execFileSync(EDGE, args, { encoding: "utf8" });
  return out;
}

const server = spawn(
  process.execPath,
  ["node_modules/next/dist/bin/next", mode, "-p", String(port)],
  { stdio: ["ignore", "pipe", "pipe"] }
);
let log = "";
server.stdout.on("data", (d) => (log += d));
server.stderr.on("data", (d) => (log += d));

try {
  const t0 = Date.now();
  let ready = false;
  while (Date.now() - t0 < 120_000) {
    try {
      const r = await fetch(base);
      if (r.ok) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 700));
  }
  if (!ready) {
    console.log("SERVER NOT READY\n" + log.slice(-3000));
    process.exit(1);
  }
  console.log(`server ready (mode=${mode} port=${port}) in ${Date.now() - t0}ms`);

  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "edge-prof-"));
  let dom = "";
  try {
    dom = runEdge([
      "--headless=new",
      "--disable-gpu",
      "--no-sandbox",
      "--virtual-time-budget=20000",
      `--user-data-dir=${profile}`,
      "--dump-dom",
      base,
    ]);
  } catch (e) {
    console.log("edge error: " + e.message.slice(0, 300));
  }
  const hasApp = /Say hi, or send a product URL/.test(dom);
  const hasOverlay = /invariant|Runtime Error/i.test(dom);
  console.log("DOM length:", dom.length);
  console.log("app UI hydrated in DOM:", hasApp);
  console.log("error overlay/invariant present:", hasOverlay);
  if (hasOverlay) {
    const m = dom.match(/invariant[^<"]{0,120}/i);
    console.log("  snippet:", m ? m[0] : "(none)");
  }
} finally {
  server.kill();
}