import { NextResponse } from "next/server";
import { packFromKey, getVideo } from "../../../lib/render";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const key = url.searchParams.get("k") || "";
  const seconds = Math.min(10, Math.max(5, Number(url.searchParams.get("v")) || 8));

  const parsed = packFromKey(key);
  if (!parsed) {
    return NextResponse.json({ error: "bad key" }, { status: 400 });
  }

  try {
    const mp4 = await getVideo(parsed.p, seconds);
    return new NextResponse(new Uint8Array(mp4), {
      status: 200,
      headers: {
        "Content-Type": "video/mp4",
        "Content-Length": String(mp4.length),
        "Cache-Control": "public, max-age=31536000, immutable",
        "Accept-Ranges": "bytes",
      },
    });
  } catch (e) {
    console.error("[video] render failed", e);
    return NextResponse.json({ error: "render failed" }, { status: 500 });
  }
}