// Validates the LLM merge path WITHOUT a real API key: a local mock OpenRouter
// endpoint returns canned classifier JSON, and the real chat+rendering flow is
// exercised end-to-end. Run ONLY against a fresh build:
//   npm run build && node scripts/test-llm-merge.mjs
import { spawn } from "node:child_process";
import http from "node:http";

const PORT = 3101;
const MOCK_PORT = 3199;
const BASE = `http://localhost:${PORT}`;

const cannedVideo = JSON.stringify({
  kind: "video",
  reply: "Love it — here's a quick UGC video for Koala Notes!",
  product: {
    name: "Koala Notes",
    url: "",
    tagline: "transcribes and summarizes your meetings automatically",
    keywords: ["meetings", "notes", "ai", "work"],
    hook: "MEETINGS DONE FOR YOU",
    vibe: "productivity",
  },
});
const cannedChat = JSON.stringify({
  kind: "chat",
  reply: "I'm UGC Factory — send me a product or startup and I'll stitch you a ready-to-post marketing video.",
  product: null,
});

let hits = 0;
const mock = http.createServer((req, res) => {
  hits += 1;
  let body = "";
  req.on("data", (d) => (body += d));
  req.on("end", () => {
    const parsed = JSON.parse(body || "{}");
    const content = /koala/i.test(parsed.messages?.at(-1)?.content || "") ? cannedVideo : cannedChat;
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ choices: [{ message: { role: "assistant", content } }] }));
  });
});
await new Promise((r) => mock.listen(MOCK_PORT, r));

const env = {
  ...process.env,
  OPENROUTER_API_KEY: "sk-mock-test",
  OPENROUTER_BASE_URL: `http://localhost:${MOCK_PORT}`,
};
const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", String(PORT)], { env, stdio: ["ignore", "pipe", "pipe"] });
let errLog = "";
server.stderr.on("data", (d) => (errLog += d.toString()));
server.stdout.on("data", (d) => (errLog += d.toString()));

function assert(cond, msg) {
  console.log((cond ? "OK  : " : "FAIL: ") + msg);
  if (!cond) process.exitCode = 1;
}

try {
  const t0 = Date.now();
  let ready = false;
  while (Date.now() - t0 < 60_000) {
    try {
      const r = await fetch(`${BASE}/`);
      if (r.ok) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 800));
  }
  if (!ready) {
    console.error("server did not become ready; logs:\n" + errLog.slice(-4000));
    server.kill();
    mock.close();
    process.exit(1);
  }

  const chat = await fetch(`${BASE}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages: [{ role: "user", content: "how are you today?" }] }),
  }).then((r) => r.json());
  assert(chat.kind === "text" && /UGC Factory/i.test(chat.text), "LLM chat intent -> LLM reply text");
  assert(hits === 1, "mock LLM endpoint hit once");

  const video = await fetch(`${BASE}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages: [{ role: "user", content: "yo check out koala notes, it transcribes and summarizes your meetings automatically. you should make a video for it" }] }),
  }).then((r) => r.json());
  console.log("     video response:", JSON.stringify(video).slice(0, 300));
  console.log("     mock hits now:", hits);
  assert(video.kind === "video", "LLM free-form (no URL) product -> video reply");
  assert(video.product?.productName === "Koala Notes", "product name from LLM used");
  assert(video.assets?.vibe === "productivity", "LLM vibe label used");
  const vid = await fetch(`${BASE}${video.videoUrl}`);
  const buf = Buffer.from(await vid.arrayBuffer());
  assert(vid.status === 200 && (vid.headers.get("content-type") || "").includes("video/mp4"), "LLM video renders");
  assert(buf.length > 50_000, `video bytes (${buf.length})`);
  console.log("     mock LLM hits:", hits);
} finally {
  server.kill();
  mock.close();
}