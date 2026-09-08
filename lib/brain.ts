import type { ProductInfo } from "./types";
import { fetchSiteMeta } from "./sitefetch";
import { detectVibe, VIBES, pickByHash, tokenize, type VibeDef } from "./vibe";
import { classifyWithLLM } from "./llm";

function dedupe<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}

function addScheme(u: string): string {
  const t = u.trim();
  return /^https?:\/\//i.test(t) ? t : `https://${t}`;
}

function extractDomain(text: string): string {
  let m: RegExpExecArray | null;
  URL_RE.lastIndex = 0;
  while ((m = URL_RE.exec(text)) !== null) {
    const d = m[1];
    if (!/^www\./i.test(d)) return d;
  }
  URL_RE.lastIndex = 0;
  return "";
}

type Intent = "greeting" | "help" | "thanks" | "bye" | "product" | "chat";

const URL_RE =
  /(?:https?:\/\/)?(?:www\.)?([a-z0-9][a-z0-9-]*\.(?:app|com|io|dev|ai|co|net|org|me|site|xyz|shop|store|tech|online|build|studio|design|social|space|cloud|link|services|today))(?:\/[^\s]*)?/gi;

const GREETING_RE = /^\s*(hey|hi|hello|yo|hiya|sup|howdy|hola|hej|good\s+(morning|afternoon|evening)|g\s?day)\b/i;
const HELP_RE = /\b(what can you do|what do you do|how (do|does) .*work|who are you|what are you|help|how can you help|tell me about yourself)\b/i;
const THANKS_RE = /\b(thanks|thank you|thx|ty|appreciate|legend|amazing|awesome|great|cool|nice one|perfect)\b/i;
const BYE_RE = /\b(bye|goodbye|see you|later|cya|gtg|got to go)\b/i;

function normalizeDomain(domain: string): string {
  let d = domain.toLowerCase().replace(/^www\./, "");
  const knownTlds = [
    "app","com","io","dev","ai","co","net","org","me","site","xyz","shop","store","tech","online","build","studio","design","social","space","cloud","link","services","today",
  ];
  for (const t of knownTlds) {
    if (d.endsWith("." + t)) {
      d = d.slice(0, -(t.length + 1));
      break;
    }
  }
  d = d.replace(/^((get|try|use|my|the|app|go|meet)\b[-.]?)/, "");
  return d || "product";
}

function titleCase(s: string): string {
  return s
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function sliceClean(s: string, n: number): string {
  const v = String(s || "").replace(/\s+/g, " ").trim();
  return v.length > n ? v.slice(0, n - 1).trimEnd() + "…" : v;
}

function hooksFor(vibe: VibeDef, name: string): string[] {
  const n = name.toUpperCase();
  switch (vibe.vibe) {
    case "fitness":
      return ["CALORIES HANDLED", "EAT SMART TODAY", "YOUR DAILY WIN", "NO MORE GUESSING"];
    case "food":
      return ["CRAVINGS SORTED", "PLATE THE MOMENT", "TASTE. LOG. REPEAT."];
    case "finance":
      return ["MONEY SIMPLIFIED", "PAY LESS. HOLD MORE.", "BUDGET THAT STICKS"];
    case "travel":
      return ["LESS PLANNING. MORE WANDER.", "FIND YOUR ESCAPE", "WHERE TO NEXT?"];
    case "fashion":
      return ["DRESS LIKE THE MOMENT", "STYLE ON REPEAT", "LOOK. LOCK. POST."];
    case "music":
      return ["TURN IT UP", "YOUR SOUND. LOUDER.", "HEAR THE VIBE"];
    case "productivity":
      return ["DONE IS BETTER THAN PERFECT", "FOCUS ON", "MAKE SPACE FOR DEEP WORK"];
    case "social":
      return ["YOUR PEOPLE. ONE PLACE.", "STAY IN THE LOOP", "TALK IN REAL TIME"];
    case "home":
      return ["A HOME THAT WORKS", "LIVE EASY. LIVE TIDY.", "FRESH SPACES"];
    default:
      return [
        `MEET ${n.slice(0, 12)}`,
        "BUILT DIFFERENT",
        "THE 2026 UPGRADE",
        "YOUR MOVE, QUALITY ITSELF",
      ];
  }
}

export interface ClassifyResult {
  intent: Intent;
  reply: string;
  product?: ProductInfo;
  vibe: VibeDef | null;
}

function humanize(t: string): string {
  return t
    .toLowerCase()
    .split(/[-_\s]+/)
    .filter((w) => w.length)
    .join(" ");
}

const cannedHelp = (): ClassifyResult => ({
  intent: "help",
  reply:
    "I can generate UGC videos for you. Just send me a product URL and I'll create a short marketing video — background, trending text, trending audio and a GIF on top. Nothing to install.",
  vibe: null,
});
const cannedGreeting = (): ClassifyResult => ({
  intent: "greeting",
  reply:
    "Hey! 👋 I make short UGC-style videos for products. Send me a product URL — like “I'm building CalAI, here's the site: calai.app” — and I'll drop a ready-to-post video right here.",
  vibe: null,
});
const cannedBye = (): ClassifyResult => ({ intent: "bye", reply: "Catch you later! Send a product URL any time and I'll fire up the video machine. 👋", vibe: null });
const cannedThanks = (): ClassifyResult => ({ intent: "thanks", reply: "Anytime! Send another product URL whenever you're ready and I'll make it next.", vibe: null });

const LOOKS_LIKE_PRODUCT_RE =
  /\b(i'm\s+building|i\s+am\s+building|we\s+(are|'re)\s+building|my\s+app|my\s+product|a\s+(new\s+)?(startup|app|product|tool|saas))\b/i;

export async function classify(messages: { role: string; content: string }[]): Promise<ClassifyResult> {
  const last = [...messages].reverse().find((m) => m && m.role === "user");
  const text = (last?.content || "").trim();
  const lowered = text.toLowerCase();

  // Free-form LLM path (OpenRouter/Groq/OpenAI) — ChatGPT-style, whole thread.
  // Canned intents are NOT used here: the LLM can decide greetings/help/etc. itself.
  const llm = await classifyWithLLM(messages);
  if (llm) {
    if (llm.kind === "chat") {
      return { intent: "chat", reply: llm.reply, vibe: null };
    }

    if (llm.kind === "video" && llm.product) {
      const p = llm.product;
      const domain = extractDomain(p.url);
      const urlInText = extractDomain(text);
      const rawUrl = (domain || urlInText || "").replace(/^www\./i, "");
      const siteUrl = rawUrl ? addScheme(rawUrl) : "";

      let title = "";
      let desc = "";
      if (siteUrl) {
        const meta = await fetchSiteMeta(siteUrl);
        if (meta) {
          title = meta.title;
          desc = meta.description;
        }
      }

      const nameFromDomain = rawUrl ? titleCase(normalizeDomain(rawUrl)) : "A new product";
      const productName =
        p.name && p.name.length >= 2 && p.name.length < 40
          ? titleCase(p.name)
          : title && title.length < 40
            ? titleCase(title.replace(/^(the|a)\s+/i, ""))
            : nameFromDomain;

      let vibe = detectVibe(p.keywords.length ? p.keywords : tokenize(`${text} ${title} ${desc}`));
      const labelVibe = VIBES.find((v) => v.vibe === p.vibe);
      const keywords = dedupe([...p.keywords, ...tokenize(`${text} ${humanize(rawUrl)} ${title} ${desc}`)]);
      if (labelVibe) vibe = labelVibe;
      const tagline = sliceClean(desc || p.tagline || `A freshly built product — ${productName}.`, 160);
      let hook = p.hook.trim();
      if (!hook || hook.length < 3 || /^[a-z]/.test(hook)) hook = pickByHash(hooksFor(vibe, productName), productName.toLowerCase());

      const product: ProductInfo = {
        url: siteUrl,
        productName,
        tagline,
        keywords: keywords.slice(0, 12),
        hook: hook.slice(0, 26),
      };
      return {
        intent: "product",
        reply: llm.reply || `Got it — ${productName}. Reading what I can, picking the assets, and putting the video together…`,
        product,
        vibe,
      };
    }
    // LLM returned video without a usable product — fall through to the offline rule path.
  }

  // Offline rule engine (no LLM key): canned intents first, then domain-based products.
  if (HELP_RE.test(lowered)) return cannedHelp();
  if (GREETING_RE.test(lowered)) return cannedGreeting();
  if (BYE_RE.test(lowered)) return cannedBye();
  if (THANKS_RE.test(lowered)) return cannedThanks();

  let m: RegExpExecArray | null;
  let matched: string[] = [];
  URL_RE.lastIndex = 0;
  while ((m = URL_RE.exec(text)) !== null) matched.push(m[1]);

  if (matched.length > 0) {
    const domain = matched[0];
    const rawUrl = /^https?:\/\//i.test(domain) ? domain : `https://${domain}`;
    const nameFromDomain = titleCase(normalizeDomain(domain));
    let tagline = "";
    let title = "";

    const meta = await fetchSiteMeta(rawUrl);
    if (meta) {
      title = meta.title;
      tagline = meta.description;
    }
    const productName = title && title.length < 40 ? titleCase(title.replace(/^(the|a)\s+/i, "")) : nameFromDomain;
    const keywords = tokenize(`${text} ${humanize(domain)} ${title} ${tagline}`);
    const vibe = detectVibe(keywords);
    const hook = pickByHash(hooksFor(vibe, productName), productName.toLowerCase());

    const product: ProductInfo = {
      url: rawUrl,
      productName,
      tagline: sliceClean(tagline || `A freshly built product — ${nameFromDomain}.`, 160),
      keywords: keywords.slice(0, 12),
      hook: hook.slice(0, 26),
    };
    return {
      intent: "product",
      reply: `Got it — ${productName}. Reading the site, picking the assets, and putting the video together…`,
      product,
      vibe,
    };
  }

  return {
    intent: "chat",
    reply: LOOKS_LIKE_PRODUCT_RE.test(lowered)
      ? "Sounds fun! Drop the URL for it (something like “here's the site: myapp.app”) and I'll turn it into a UGC-style video for you."
      : "I'm best at turning a product into a short UGC video. Send me a product URL — a name plus its site, e.g. “I'm building CalAI, calorie tracking app, here's the site: calai.app”.",
    vibe: null,
  };
}

export function makeGreeting(): string {
  return "Hey! 👋 I make short UGC-style videos for products. Send me a product URL and I'll put a ready-to-post video right here.";
}