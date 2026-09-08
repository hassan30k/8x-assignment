"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Reply, ProductInfo, AssetPack } from "@/lib/types";

type UiMsg = {
  id: string;
  role: "user" | "assistant";
  content: string;
  video?: { url: string; seconds: number; product?: ProductInfo; assets?: AssetPack };
  rendered?: boolean;
};

const uid = () => Math.random().toString(36).slice(2);

export default function Home() {
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState<UiMsg[]>([]);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const send = useCallback(
    async (raw?: string) => {
      const text = (raw ?? input).trim();
      if (!text || busy) return;
      setInput("");
      const userMsg: UiMsg = { id: uid(), role: "user", content: text };
      const thinking: UiMsg = { id: uid(), role: "assistant", content: "", rendered: true };
      setMessages((ms) => [...ms, userMsg, thinking]);
      setBusy(true);
      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: [
              { role: "user", content: text },
            ],
          }),
        });
        if (!res.ok) throw new Error("bad status");
        const reply: Reply = await res.json();
        if (reply.kind === "video") {
          setMessages((ms) =>
            ms.map((m) =>
              m.id === thinking.id
                ? {
                    ...m,
                    content: reply.text,
                    video: {
                      url: reply.videoUrl,
                      seconds: reply.seconds,
                      product: reply.product,
                      assets: reply.assets,
                    },
                  }
                : m,
            ),
          );
        } else {
          setMessages((ms) => ms.map((m) => (m.id === thinking.id ? { ...m, content: reply.text, rendered: true } : m)));
        }
      } catch {
        setMessages((ms) =>
          ms.map((m) => (m.id === thinking.id ? { ...m, content: "Something went wrong — try again?", rendered: true } : m)),
        );
      } finally {
        setBusy(false);
      }
    },
    [input, busy],
  );

  return (
    <main className="flex h-dvh flex-col bg-[#0b0b12] text-white">
      <header className="border-b border-white/10 px-4 py-3">
        <div className="mx-auto flex max-w-3xl items-center gap-2">
          <span className="text-lg">🎬</span>
          <div>
            <p className="text-sm font-semibold leading-tight">UGC Factory</p>
            <p className="text-[11px] text-zinc-400">AI-organized product videos · background + trend text + trending audio + GIF</p>
          </div>
        </div>
      </header>

      <div ref={scroller} className="flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-6">
          {messages.length === 0 && (
            <div className="mx-auto mt-6 max-w-md rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-center text-sm text-zinc-300">
              <p className="mb-2 text-base font-medium text-white">Send a product and get a UGC video back</p>
              <p className="text-zinc-400">
                Try: <span className="text-white">“I’m building CalAI, a calorie-tracking app. Here’s the site: calai.app”</span>
              </p>
              <p className="mt-3 text-xs text-zinc-500">
                Not AI-generated — AI-organized. It reads your site, then assembles the right background, trending text,
                trending audio and GIF.
              </p>
            </div>
          )}

          {messages.map((m) => (
            <Msg key={m.id} m={m} />
          ))}
        </div>
      </div>

      <footer className="border-t border-white/10 p-3">
        <form
          className="mx-auto flex max-w-3xl items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={busy ? "UGC Factory is working…" : "Say hi, or send a product URL…"}
            disabled={busy}
            autoFocus
            className="flex-1 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm outline-none placeholder:text-zinc-500 focus:border-white/25"
          />
          <button
            type="submit"
            disabled={busy || !input.trim()}
            className="rounded-full bg-white px-4 py-2.5 text-sm font-semibold text-black disabled:opacity-40"
          >
            Send
          </button>
        </form>
      </footer>
    </main>
  );
}

function Msg({ m }: { m: UiMsg }) {
  const shown = m.content || m.video;
  if (!shown) return <ThinkingBubble />;
  if (m.role === "user") {
    return (
      <div className="self-end max-w-[80%] rounded-2xl rounded-br-sm bg-white/10 px-4 py-2 text-sm whitespace-pre-wrap">
        {m.content}
      </div>
    );
  }
  return (
    <div className="self-start max-w-[85%]">
      <div className="rounded-2xl rounded-bl-sm border border-white/10 bg-[#14141f] px-4 py-3 text-sm">{m.content}</div>
      {m.video && (
        <div className="mt-2 space-y-2">
          <VideoCard m={m} />
          <AssetChips pack={m.video.assets} product={m.video.product} />
        </div>
      )}
    </div>
  );
}

function VideoCard({ m }: { m: UiMsg }) {
  const [ready, setReady] = useState(false);
  return (
    <div className="relative w-[290px]">
      {!ready && (
        <div className="flex aspect-[9/16] w-full flex-col items-center justify-center gap-2 rounded-2xl border border-white/10 bg-black">
          <Spinner />
          <p className="text-xs text-zinc-400">Rendering 9:16 video…</p>
        </div>
      )}
      <video
        src={m.video!.url}
        controls
        autoPlay
        muted
        loop
        playsInline
        onCanPlay={() => setReady(true)}
        className={`aspect-[9/16] w-full rounded-2xl border border-white/10 bg-black ${ready ? "" : "hidden"}`}
      />
      <p className="mt-1 text-[11px] text-zinc-500">▶ 8s · {m.video!.seconds}s UGC-style render</p>
    </div>
  );
}

function AssetChips({ pack, product }: { pack?: AssetPack; product?: ProductInfo }) {
  if (!pack) return null;
  const chips = [
    ["Vibe", pack.vibe],
    ["Caption", pack.caption],
    ["GIF layer", pack.gif.split("/").slice(-2, -1)[0]],
  ] as const;
  return (
    <div className="flex max-w-[420px] flex-wrap gap-1.5">
      {chips.map(([k, v]) => (
        <span key={k} className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] text-zinc-300">
          <span className="text-zinc-500">{k}:</span> <span className="text-zinc-200">{v}</span>
        </span>
      ))}
      {product && (
        <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] text-zinc-300">
          <span className="text-zinc-500">Read:</span> <span className="text-zinc-200">{product.productName}</span>
        </span>
      )}
    </div>
  );
}

function ThinkingBubble() {
  return (
    <div className="flex items-center gap-2 rounded-2xl rounded-bl-sm border border-white/10 bg-[#14141f] px-4 py-3 text-sm text-zinc-400">
      <span className="flex gap-1">
        <Dot delay={0} />
        <Dot delay={150} />
        <Dot delay={300} />
      </span>
      thinking…
    </div>
  );
}

function Dot({ delay }: { delay: number }) {
  return (
    <span
      className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-500"
      style={{ animationDelay: `${delay}ms` }}
    />
  );
}

function Spinner() {
  return (
    <span className="h-6 w-6 animate-spin rounded-full border-2 border-white/20 border-t-white" />
  );
}