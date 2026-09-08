import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import ffmpegStatic from "ffmpeg-static";
import type { AssetPack } from "./types";
import { AUDIO_FALLBACK, AUDIO_LOFI } from "./assets";

const SECONDS = 8;
const W = 720;
const H = 1280;
const FPS = 30;
const FONT = "font.ttf";

export const renderTimeoutMs = 120_000;

/** Locate an ffmpeg binary at runtime (bundlers can null ffmpeg-static's path). */
function resolveFfmpeg(): string {
  if (process.env.FFMPEG_PATH && fs.existsSync(process.env.FFMPEG_PATH)) return process.env.FFMPEG_PATH;
  const local = path.join(process.cwd(), "node_modules", "ffmpeg-static");
  try {
    if (fs.existsSync(local)) {
      for (const f of fs.readdirSync(local)) {
        if (/^ffmpeg(\.exe)?$/i.test(f)) return path.join(local, f);
      }
    }
  } catch {
    /* ignore */
  }
  if (typeof ffmpegStatic === "string" && fs.existsSync(ffmpegStatic)) return ffmpegStatic;
  return process.env.FFMPEG_PATH || "ffmpeg";
}

async function fetchBytes(url: string): Promise<Buffer | null> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 12_000);
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: "follow",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125 Safari/537.36",
        Referer: "https://pixabay.com/",
        Accept: "*/*",
      },
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return buf.length > 0 ? buf : null;
  } catch {
    return null;
  }
}

function sanitizeCaption(s: string): string {
  return String(s || "")
    .toUpperCase()
    .replace(/['"]/g, "")
    .replace(/[^A-Z0-9 .!?&-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 40);
}

interface RenderInputs {
  bg: Buffer | string; // buffer or lavfi spec string
  bgIsImage: boolean;
  gif: Buffer;
  audio: Buffer | null;
}

async function obtainAssets(p: AssetPack): Promise<RenderInputs> {
  let bg: Buffer | string | null = null;
  for (const cand of [p.background]) {
    bg = await fetchBytes(cand);
    if (bg && bg.length > 1024) break;
    bg = null;
  }
  if (!bg) bg = `color=c=0x${p.color.replace(/^#/, "")}:s=${W}x${H}`;
  const gif = await fetchBytes(p.gif);
  const audioCandidates = [p.audio, AUDIO_LOFI, AUDIO_FALLBACK].filter(
    (x): x is string => typeof x === "string",
  );
  let audio: Buffer | null = null;
  for (const a of audioCandidates) {
    audio = await fetchBytes(a);
    if (audio && audio.length > 2048) break;
    audio = null;
  }
  const bgBytes = typeof bg === "string" ? null : bg;
  return {
    bg: bgBytes ?? bg,
    bgIsImage: p.backgroundIsImage && !!bgBytes,
    gif: gif ?? Buffer.from([]),
    audio,
  };
}

export function packKey(p: AssetPack, seconds = SECONDS): string {
  return Buffer.from(JSON.stringify({ p, seconds })).toString("base64url");
}

export function packFromKey(key: string): { p: AssetPack; seconds: number } | null {
  try {
    const obj = JSON.parse(Buffer.from(key, "base64url").toString("utf8"));
    if (obj && obj.p && obj.p.caption !== undefined && obj.seconds) return obj;
    return null;
  } catch {
    return null;
  }
}

export async function renderVideo(p: AssetPack, seconds = SECONDS): Promise<Buffer> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ugc-"));
  const ffmpeg = resolveFfmpeg();
  const tmp = (name: string) => path.join(dir, name);

  try {
    const assets = await obtainAssets(p);
    const caption = sanitizeCaption(p.caption) || "BUILT DIFFERENT";

    if (assets.gif && assets.gif.length > 0) fs.writeFileSync(tmp("gif.gif"), assets.gif);
    if (assets.audio && assets.audio.length > 0) fs.writeFileSync(tmp("song.mp3"), assets.audio);
    if (assets.bgIsImage && typeof assets.bg !== "string") fs.writeFileSync(tmp("bg.jpg"), assets.bg as Buffer);

    // copy font next to inputs so filtergraph uses simple relative paths
    let fontOk = false;
    const fontSrc = path.join(process.cwd(), "public", "fonts", "BebasNeue-Regular.ttf");
    try {
      fs.copyFileSync(fontSrc, tmp(FONT));
      fontOk = true;
    } catch {
      fontOk = false;
    }

    const drawText =
      fontOk && caption.length > 0
        ? `drawtext=fontfile=${FONT}:text='${caption}':fontsize=${p.fontSize}:fontcolor=white:borderw=8:bordercolor=black@0.55:box=1:boxcolor=${p.color}@0.14:boxborderw=22:x=(w-text_w)/2:y=h*0.09:line_spacing=8`
        : "";

    const inputs: string[] = ["-y"];
    let bgChain = "";
    if (assets.bgIsImage && typeof assets.bg !== "string") {
      inputs.push("-i", "bg.jpg");
      bgChain =
        `[0:v]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},setsar=1,` +
        `zoompan=z='min(zoom+0.0012,1.18)':d=${seconds * FPS}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${W}x${H}:fps=${FPS}[bg];`;
    } else {
      const color = (typeof assets.bg === "string" ? assets.bg : `color=c=0x12121a:s=${W}x${H}`) as string;
      inputs.push("-f", "lavfi", "-i", color);
      bgChain = `[0:v]format=yuv420p,scale=${W}:${H},setsar=1[bg];`;
    }

    let gifChain = "";
    let overlay = "";
    let audioChain = "";
    const hasGif = assets.gif && assets.gif.length > 0;

    if (hasGif) {
      inputs.push("-ignore_loop", "0", "-i", "gif.gif");
      gifChain = `[1:v]scale=${Math.round(W * 0.55)}:-2,setpts=PTS-STARTPTS[gif];`;
      overlay = `[bg][gif]overlay=x='(main_w-overlay_w)/2':y='main_h-overlay_h-${Math.round(H * 0.24)}':shortest=0[vr];`;
    } else {
      overlay = `[bg]null[vr];`;
    }

    const audioIdx = inputs.filter((a) => a === "-i").length; // index the next input lands on
    if (assets.audio) {
      inputs.push("-i", "song.mp3");
    } else {
      inputs.push("-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo");
    }
    audioChain =
      `[${audioIdx}:a]aformat=channel_layouts=stereo:sample_rates=44100,` +
      `atrim=0:${seconds},asetpts=N/SR/TB,apad[aout];`;

    const post = drawText ? `[vr]${drawText}[vout]` : `[vr]null[vout]`;
    const filterComplex = bgChain + gifChain + overlay + audioChain + post;

    const args: string[] = [
      ...inputs,
      "-filter_complex", filterComplex,
      "-map", "[vout]",
      "-map", "[aout]",
      "-t", String(seconds),
      "-c:v", "libx264",
      "-preset", "veryfast",
      "-crf", "23",
      "-pix_fmt", "yuv420p",
      "-r", String(FPS),
      "-c:a", "aac",
      "-b:a", "128k",
      "-movflags", "+faststart",
      "out.mp4",
    ];

    const code = await new Promise<number>((resolve) => {
      const child = spawn(ffmpeg, args, { cwd: dir });
      let stderr = "";
      child.stderr.on("data", (d) => (stderr += d.toString()));
      const t = setTimeout(() => {
        child.kill();
      }, renderTimeoutMs);
      child.on("error", () => {
        clearTimeout(t);
        resolve(1);
      });
      child.on("close", (c) => {
        clearTimeout(t);
        if (c !== 0) {
          console.error("[render] ffmpeg exited", c, stderr.slice(-1200));
        }
        resolve(c ?? 1);
      });
    });

    if (code !== 0) throw new Error("ffmpeg failed");
    const out = fs.readFileSync(tmp("out.mp4"));
    if (out.length < 1024) throw new Error("ffmpeg produced empty output");
    return out;
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// ---- stateless, instance-local cache ----
const memCache = new Map<string, Promise<Buffer>>();
const diskCacheDir = path.join(os.tmpdir(), "ugc-cache");

export async function getVideo(p: AssetPack, seconds = SECONDS): Promise<Buffer> {
  const key = packKey(p, seconds);
  const existing = memCache.get(key);
  if (existing) return existing;
  try {
    const cached = fs.readFileSync(path.join(diskCacheDir, `${key}.mp4`));
    if (cached.length > 1024) return cached;
  } catch {
    /* miss */
  }
  const job = renderVideo(p, seconds)
    .then((buf) => {
      try {
        if (!fs.existsSync(diskCacheDir)) fs.mkdirSync(diskCacheDir, { recursive: true });
        fs.writeFileSync(path.join(diskCacheDir, `${key}.mp4`), buf);
      } catch {
        /* disk full/etc, ignore */
      }
      return buf;
    })
    .catch((err) => {
      memCache.delete(key);
      throw err;
    });
  memCache.set(key, job);
  return job;
}