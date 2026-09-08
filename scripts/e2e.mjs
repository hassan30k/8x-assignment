// End-to-end smoke test: boots the production server, exercises chat intents,
// and renders a UGC video for a product message.
import { spawn } from "node:child_process";

const PORT = 3100;
const BASE = `http://localhost:${PORT}`;

function post(path, body) {
  return fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).then(async (r) => ({ status: r.status, json: await r.json() }));
}

function get(path) {
  return fetch(`${BASE}${path}`);
}

function assert(cond, msg) {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exitCode = 1;
  } else {
    console.log("OK  :", msg);
  }
}

const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", String(PORT)], {
  stdio: ["ignore", "pipe", "pipe"],
});
let errLog = "";
server.stderr.on("data", (d) => (errLog += d.toString()));
server.on("exit", (c) => {
  if (process.exitCode === undefined && c !== 0) process.exit(c);
});

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
  const ready = await waitForReady();
  assert(ready, `server boots on :${PORT}`);

  const greets = await post("/api/chat", { messages: [{ role: "user", content: "hi" }] });
  assert(greets.status === 200 && greets.json.kind === "text", "greeting -> text reply");
  assert(/video/i.test(greets.json.text || ""), "greeting mentions making videos");

  const help = await post("/api/chat", { messages: [{ role: "user", content: "what can you do?" }] });
  assert(help.json.kind === "text" && /UGC/i.test(help.json.text || ""), "help -> UGC reply");

  const junk = await post("/api/chat", { messages: [{ role: "user", content: "I like pizza on tuesdays" }] });
  assert(junk.json.kind === "text", "casual chat stays chat");

  const product = await post("/api/chat", {
    messages: [
      { role: "user", content: "I'm building CalAI, a calorie-tracking app. Here's the site: calai.app" },
    ],
  });
  assert(product.json.kind === "video", "product message -> video reply");
  const pj = product.json;
  if (pj.kind === "video") {
    console.log("     video reply:", JSON.stringify({ product: pj.product.productName, vibe: pj.assets.vibe, caption: pj.assets.caption }));
    const t0 = Date.now();
    const vid = await get(`${pj.videoUrl}`);
    const buf = Buffer.from(await vid.arrayBuffer());
    const ms = Date.now() - t0;
    assert(vid.status === 200, `video route 200`);
    assert((vid.headers.get("content-type") || "").includes("video/mp4"), "video content-type mp4");
    assert(buf.length > 50_000, `video bytes produced (${buf.length} in ${ms}ms)`);
  }

  if (process.env.OPENROUTER_API_KEY || process.env.GROQ_API_KEY || process.env.OPENAI_API_KEY) {
    const freeform = await post("/api/chat", {
      messages: [{ role: "user", content: "yo check out koala notes, it transcribes and summarizes your meetings automatically. you should make a video for it" }],
    });
    if (freeform.json.kind === "video") {
      assert(!!freeform.json.product.productName, "LLM: free-form product message -> video reply");
      const vid = await get(freeform.json.videoUrl);
      assert(vid.status === 200 && (vid.headers.get("content-type") || "").includes("video/mp4"), "LLM: video renders");
      console.log("     LLM video reply:", JSON.stringify({ product: freeform.json.product.productName, vibe: freeform.json.assets.vibe }));
    } else {
      console.log("SKIP: LLM responded chat for free-form product (non-critical)");
    }
  } else {
    console.log("SKIP: no LLM key configured — offline rule path asserted above");
  }
} finally {
  server.kill();
}