export type Role = "user" | "assistant";

export interface ChatMessage {
  role: Role;
  content: string;
}

export interface AssetPack {
  /** Background URL (image). Falls back to a lavfi color source server-side. */
  background: string;
  backgroundIsImage: boolean;
  /** Giphy media URL, verified keyless. */
  gif: string;
  /** Audio URL (mp3). Null -> server-side synth/beep track. */
  audio: string | null;
  /** Overlay caption already sanitized (uppercase, [A-Z0-9 .!?&'-]) */
  caption: string;
  /** Caption font size in px for 720px width */
  fontSize: number;
  /** Accent color used for caption border, hex */
  color: string;
  /** Human readable vibe label */
  vibe: string;
}

export interface ProductInfo {
  /** Normalized product URL (https added) */
  url: string;
  productName: string;
  tagline: string;
  keywords: string[];
  /** Short overlay hook text */
  hook: string;
}

export type Reply =
  | { kind: "text"; text: string }
  | {
      kind: "video";
      text: string;
      product: ProductInfo;
      assets: AssetPack;
      videoUrl: string;
      seconds: number;
    };