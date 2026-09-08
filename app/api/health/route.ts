import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  const provider = process.env.GROQ_API_KEY
    ? "groq"
    : process.env.OPENAI_API_KEY
      ? "openai"
      : process.env.OPENROUTER_API_KEY
        ? "openrouter"
        : null;
  return NextResponse.json({
    ok: true,
    llmConfigured: !!provider,
    provider,
    model: process.env.LLM_MODEL || undefined,
    envKeysPresent: {
      OPENROUTER_API_KEY: !!(process.env.OPENROUTER_API_KEY || "").length,
      OPENROUTER_API_KEY_LEN: (process.env.OPENROUTER_API_KEY || "").length,
      GROQ_API_KEY: !!(process.env.GROQ_API_KEY || "").length,
      OPENAI_API_KEY: !!(process.env.OPENAI_API_KEY || "").length,
      LLM_MODEL: !!(process.env.LLM_MODEL || "").length,
    },
    note: "configured flags only; the key value itself is never exposed",
  });
}