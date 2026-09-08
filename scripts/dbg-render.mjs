// Bisect the ffmpeg filtergraph to find the parse error.
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import ffmpegStatic from "ffmpeg-static";

const W = 720, H = 1280, FPS = 30;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ffbisect-"));
const out = path.join(dir, "out.mp4");

const ffmpeg = ffmpegStatic;

const urls = {
  bg: "https://picsum.photos/seed/gym-calai/720/1280",
  gif: "https://media.giphy.com/media/3o7TKzJGbhAIjFsHVS/giphy.gif",
  audio: "https://cdn.pixabay.com/download/audio/2022/03/10/audio_c8c8a73467.mp3?filename=lofi-study-112191.mp3",
};

async function grab(url, file) {
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0", Referer: "https://pixabay.com/" } });
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(path.join(dir, file), buf);
  console.log(file, buf.length);
}

function run(tag, args) {
  return new Promise((resolve) => {
    const s = spawn(ffmpeg, args, { cwd: dir });
    let err = "";
    s.stderr.on("data", (d) => (err += d.toString()));
    s.on("close", (c) => {
      const last = err.split("\n").filter(Boolean).slice(-4).join(" | ");
      console.log(`[${tag}] exit=${c} :: ${last}`);
      resolve();
    });
  });
}

await grab(urls.bg, "bg.jpg");
await grab(urls.gif, "gif.gif");
await grab(urls.audio, "song.mp3");
fs.copyFileSync(path.join(process.cwd(), "public/fonts/BebasNeue-Regular.ttf"), path.join(dir, "font.ttf"));

const variants = {
  "base-noquotes": {
    args: [
      "-y", "-i", "bg.jpg",
      "-filter_complex",
      "scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280",
      "-frames:v", "1", out,
    ],
  },
  "zoompan-quoted": {
    args: [
      "-y", "-i", "bg.jpg",
      "-filter_complex",
      "zoompan=z='min(zoom+0.0012,1.18)':d=60:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=720x1280:fps=30[bg]",
      "-map", "[bg]", "-frames:v", "60", out,
    ],
  },
  "overlay": {
    args: [
      "-y", "-i", "bg.jpg", "-ignore_loop", "0", "-i", "gif.gif",
      "-filter_complex",
      "[0:v]scale=720:1280[bg];[1:v]scale=396:-2,setpts=PTS-STARTPTS[gif];[bg][gif]overlay=x='(main_w-overlay_w)/2':y='main_h-overlay_h-307':shortest=0[vr]",
      "-map", "[vr]", "-frames:v", "30", out,
    ],
  },
  "audio": {
    args: [
      "-y", "-i", "bg.jpg", "-i", "song.mp3",
      "-filter_complex",
      "[0:v]scale=720:1280[v];[1:a]aformat=channel_layouts=stereo:sample_rates=44100,atrim=0:8,asetpts=N/SR/TB,apad[aout]",
      "-map", "[v]", "-map", "[aout]", "-t", "8", "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p", "-c:a", "aac", out,
    ],
  },
  "drawtext": {
    args: [
      "-y", "-i", "bg.jpg",
      "-filter_complex",
      "[0:v]scale=720:1280[vr],drawtext=fontfile=font.ttf:text='YOUR DAILY WIN':fontsize=116:fontcolor=white:borderw=8:bordercolor=black@0.55:box=1:boxcolor=#4DFF8F@0.14:boxborderw=22:x=(w-text_w)/2:y=h*0.09:line_spacing=8[vout]",
      "-map", "[vout]", "-frames:v", "30", out,
    ],
  },
  "drawtext-nocolor": {
    args: [
      "-y", "-i", "bg.jpg",
      "-filter_complex",
      "[0:v]scale=720:1280[vr],drawtext=fontfile=font.ttf:text='YOUR DAILY WIN':fontsize=116:fontcolor=white:borderw=8:bordercolor=black@0.55:x=(w-text_w)/2:y=h*0.09[vout]",
      "-map", "[vout]", "-frames:v", "30", out,
    ],
  },
};

for (const [name, { args }] of Object.entries(variants)) {
  await run(name, args);
}
fs.rmSync(dir, { recursive: true, force: true });