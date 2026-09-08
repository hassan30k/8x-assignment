import { spawn } from "node:child_process";

const PORT = 3101;
const BASE = `http://localhost:${PORT}`;

const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", String(PORT)], {
  stdio: ["ignore", "pipe", "pipe"],
});
let logs = "";
server.stdout.on("data", (d) => (logs += d.toString()));
server.stderr.on("data", (d) => (logs += d.toString()));

async function waitForReady() {
  const t0 = Date.now();
  while (Date.now() - t0 < 60_000) {
    try {
      const r = await fetch(`${BASE}/`);
      if (r.ok) return true;
    } catch {}
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
}

try {
  await waitForReady();
  const res = await fetch(`${BASE}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: [{ role: "user", content: "I'm building CalAI, a calorie-tracking app. Here's the site: calai.app" }],
    }),
  });
  const reply = await res.json();
  console.log("chat kind:", reply.kind);
  if (reply.kind === "video") {
    console.log("fetching", reply.videoUrl);
    const vid = await fetch(`${BASE}${reply.videoUrl}`);
    const buf = Buffer.from(await vid.arrayBuffer());
    console.log("video status:", vid.status, "bytes:", buf.length);
  }
  await new Promise((r) => setTimeout(r, 1500));
  console.log("----- server logs (tail) -----");
  console.log(logs.slice(-3000));
} finally {
  server.kill();
}