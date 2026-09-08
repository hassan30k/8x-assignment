import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";

const PORT = 3102;
const BASE = `http://localhost:${PORT}`;
const outFile = process.argv[2] || "video.mp4";

const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", String(PORT)], {
  stdio: ["ignore", "ignore", "pipe"],
});
server.stderr.on("data", () => {});
async function waitForReady() {
  const t0 = Date.now();
  while (Date.now() - t0 < 60_000) {
    try {
      const r = await fetch(`${BASE}/`);
      if (r.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 1000));
  }
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
  console.log("reply:", reply.kind, reply.kind === "video" ? JSON.stringify(reply.assets) : "");
  if (reply.kind === "video") {
    const vid = await fetch(`${BASE}${reply.videoUrl}`);
    const buf = Buffer.from(await vid.arrayBuffer());
    fs.writeFileSync(outFile, buf);
    console.log("saved", outFile, buf.length, "bytes");
  }
} finally {
  server.kill();
}