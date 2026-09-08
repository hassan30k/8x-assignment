import type { AssetPack, ProductInfo } from "./types";
import { pickByHash, type VibeDef } from "./vibe";

/** Verified reachable keyless on 2026-09-08 (Giphy media CDN, no API key). */
const GIFS = [
  "https://media.giphy.com/media/3o7aCSPqXE5C6T8tBC/giphy.gif",
  "https://media.giphy.com/media/l0MYt5jPR6QX5pnqM/giphy.gif",
  "https://media.giphy.com/media/xUA7bdpLxQhsSQdyog/giphy.gif",
  "https://media.giphy.com/media/l46CpLuj0DJkRLNWo/giphy.gif",
  "https://media.giphy.com/media/3o7TKzJGbhAIjFsHVS/giphy.gif",
  "https://media.giphy.com/media/12n0UvXcprwrl6/giphy.gif",
];

/** Lofi loop, CC0 from Pixabay CDN (GET with UA + referer works; tested). */
export const AUDIO_LOFI =
  "https://cdn.pixabay.com/download/audio/2022/03/10/audio_c8c8a73467.mp3?filename=lofi-study-112191.mp3";
/** Backup track, Samplelib sample (GET works). */
export const AUDIO_FALLBACK = "https://download.samplelib.com/mp3/sample-9s.mp3";

export function buildPack(product: ProductInfo, vibe: VibeDef | null): AssetPack {
  const seedKey = `${(vibe?.seed || "tech")}-${product.productName.toLowerCase().replace(/[^a-z0-9]+/g, "")}`;
  const gif = pickByHash(GIFS, product.productName.toLowerCase());
  const audio = AUDIO_LOFI;
  return {
    background: `https://picsum.photos/seed/${encodeURIComponent(seedKey)}/720/1280`,
    backgroundIsImage: true,
    gif,
    audio,
    caption: product.hook,
    fontSize: vibe?.fontSize || 108,
    color: vibe?.color || "#A5B4FC",
    vibe: vibe?.label || "tech & saas",
  };
}