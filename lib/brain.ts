import type { ProductInfo } from "./types";
import { fetchSiteMeta } from "./sitefetch";
import { detectVibe, pickByHash, tokenize, type VibeDef } from "./vibe";

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

export async function classify(input: string): Promise<ClassifyResult> {
  const text = input.trim();
  const lowered = text.toLowerCase();

  const help = lowered.match(HELP_RE);
  if (help) {
    return {
      intent: "help",
      reply:
        "I can generate UGC videos for you. Just send me a product URL and I'll create a short marketing video — background, trending text, trending audio and a GIF on top. Nothing to install.",
      vibe: null,
    };
  }

  const greeting = text.match(GREETING_RE);
  if (greeting) {
    return {
      intent: "greeting",
      reply:
        "Hey! 👋 I make short UGC-style videos for products. Send me a product URL — like “I'm building CalAI, here's the site: calai.app” — and I'll drop a ready-to-post video right here.",
      vibe: null,
    };
  }

  if (BYE_RE.test(lowered)) {
    return { intent: "bye", reply: "Catch you later! Send a product URL any time and I'll fire up the video machine. 👋", vibe: null };
  }

  if (THANKS_RE.test(lowered)) {
    return { intent: "thanks", reply: "Anytime! Send another product URL whenever you're ready and I'll make it next.", vibe: null };
  }

  // Product messages carry a domain (calai.app, coolthing.io, ...).
  let m: RegExpExecArray | null;
  let matched: string[] = [];
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
    const keywords = tokenize(`${humanize(domain)} ${title} ${tagline}`);
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

  const looksLikeProductQuery = /\b(i'm\s+building|i\s+am\s+building|we\s+(are|'re)\s+building|my\s+app|my\s+product|a\s+(new\s+)?(startup|app|product|tool|saas))\b/i.test(lowered);

  return {
    intent: "chat",
    reply: looksLikeProductQuery
      ? "Sounds fun! Drop the URL for it (something like “here's the site: myapp.app”) and I'll turn it into a UGC-style video for you."
      : "I'm best at turning a product into a short UGC video. Send me a product URL — a name plus its site, e.g. “I'm building CalAI, calorie tracking app, here's the site: calai.app”.",
    vibe: null,
  };
}

export function makeGreeting(): string {
  return "Hey! 👋 I make short UGC-style videos for products. Send me a product URL and I'll put a ready-to-post video right here.";
}