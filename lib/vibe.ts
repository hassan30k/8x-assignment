const STOPWORDS = new Set([
  "the","a","an","and","or","but","of","to","for","with","on","at","in","is","are","your","you","our","we","it",
  "this","that","your","best","app","apps","new","get","try","use","using","make","made","built","build","launch",
  "product","tool","platform","website","site","online","easy","simple","free","just","from","by","via","about",
  "was","will","can","all","one","two","any","how","what","when","where","who","why","out","up","down","be","been",
]);

export function tokenize(s: string): string[] {
  return String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .map((w) => w.trim().replace(/s$/, ""))
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
}

export interface VibeDef {
  vibe: string;
  label: string;
  seed: string;
  color: string;
  fontSize: number;
  emoji: string;
}

export const VIBES: VibeDef[] = [
  { vibe: "fitness",  label: "fitness & health", seed: "gym",    color: "#4DFF8F", fontSize: 116, emoji: "🔥" },
  { vibe: "food",     label: "food & drink",     seed: "coffee", color: "#FFD25E", fontSize: 116, emoji: "🍔" },
  { vibe: "finance",  label: "finance & money",  seed: "finance",color: "#7CFC00", fontSize: 108, emoji: "💰" },
  { vibe: "travel",   label: "travel",           seed: "travel", color: "#5BD6FF", fontSize: 120, emoji: "✈️" },
  { vibe: "fashion",  label: "fashion & beauty", seed: "style",  color: "#FF8FD8", fontSize: 112, emoji: "✨" },
  { vibe: "music",    label: "music & audio",    seed: "music",  color: "#C9A9FF", fontSize: 116, emoji: "🎧" },
  { vibe: "productivity", label: "productivity", seed: "desk",   color: "#7DE2FF", fontSize: 106, emoji: "⚡" },
  { vibe: "social",   label: "social & community", seed: "chat", color: "#FF9E7D", fontSize: 108, emoji: "💬" },
  { vibe: "home",     label: "home & living",    seed: "home",   color: "#FFF3B0", fontSize: 110, emoji: "🏠" },
  { vibe: "tech",     label: "tech & saas",      seed: "code",   color: "#A5B4FC", fontSize: 106, emoji: "🤖" },
];

export const VIBE_WORDS: Record<string, string[]> = {
  fitness: ["fitness","workout","gym","calorie","calories","food","meal","diet","nutrition","health","wellness","weight","running","protein","sleep","water","steps","muscle"],
  food: ["restaurant","delivery","cook","recipe","kitchen","food","foodie","beverage","coffee","snack","baker","pizza","wine"],
  finance: ["finance","fintech","money","save","saving","budget","bank","banking","invest","investing","wallet","payment","payments","spend","spending","debt","credit","crypto","stock"],
  travel: ["travel","trip","flight","flights","hotel","vacation","booking","adventure","itinerary","airbnb","tour"],
  fashion: ["fashion","style","outfit","clothes","clothing","shoes","beauty","skincare","skincare","makeup","cosmetic","cosmetics","hair","grooming","wardrobe"],
  music: ["music","song","playlist","beat","audio","podcast","sound","tracks","dj","artist"],
  productivity: ["focus","task","tasks","todo","notes","calendar","schedule","email","emails","doc","document","project","time","tracking","habit","habits","journal","pomodoro"],
  social: ["chat","friend","friends","dating","community","social","connected","inbox","message","messenger","follow"],
  home: ["home","interior","furniture","decor","garden","cleaning","laundry","smarthome","smart","appliance"],
  tech: ["ai","saas","software","code","developer","digital","analytics","data","automation","platform","cloud","crm","api","widgets","workflow","automation","intelligence"],
};

export interface VibeMatch {
  def: VibeDef;
  score: number;
}

export function detectVibe(keywords: string[]): VibeDef {
  let best = VIBES[VIBES.length - 1]; // tech fallback
  let bestScore = 0;
  for (const v of VIBES) {
    const words = VIBE_WORDS[v.vibe] || [];
    let score = 0;
    for (const kw of keywords) {
      if (words.includes(kw)) score += 1;
      else {
        for (const w of words) if (w.includes(kw) || kw.includes(w)) { score += 0.5; break; }
      }
    }
    if (score > bestScore) {
      bestScore = score;
      best = v;
    }
  }
  return best;
}

export function pickByHash<T>(items: T[], seed: string): T {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return items[h % items.length];
}