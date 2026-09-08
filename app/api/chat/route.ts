import { NextResponse } from "next/server";
import type { ChatMessage, Reply } from "../../../lib/types";
import { classify } from "../../../lib/brain";
import { buildPack } from "../../../lib/assets";
import { packKey } from "../../../lib/render";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SECONDS = 8;

export async function POST(req: Request) {
  let body: { messages?: ChatMessage[] } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad body" }, { status: 400 });
  }
  const messages = Array.isArray(body.messages) ? body.messages : [];
  const last = [...messages].reverse().find((m) => m && m.role === "user");
  const text = (last?.content || "").trim();

  if (!text) {
    return NextResponse.json({ kind: "text", text: "Say hi, or send me a product URL and I'll make a video." } satisfies Reply);
  }

  const res = await classify(messages.slice(-16));

  if (res.intent !== "product" || !res.product) {
    return NextResponse.json({ kind: "text", text: res.reply } satisfies Reply);
  }

  const pack = buildPack(res.product, res.vibe);
  const key = packKey(pack, SECONDS);
  const videoUrl = `/api/video?k=${encodeURIComponent(key)}&v=${SECONDS}`;

  const reply: Reply = {
    kind: "video",
    text: res.reply.startsWith("Got it —")
      ? `${res.reply} Here's the UGC video for **${res.product.productName}** 👇`
      : res.reply,
    product: res.product,
    assets: pack,
    videoUrl,
    seconds: SECONDS,
  };
  return NextResponse.json(reply);
}