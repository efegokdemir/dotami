"use client";

import { useJourney } from "@/components/shared/journey-provider";
import { GhostLink, Pill, WordMark } from "@/components/ui";
import { applyIntentToDraft, type IntentParseResult } from "@/lib/journey/intent";
import { parseIntentFallback } from "@/lib/journey/intent-fallback";
import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * The landing page's one job (2026-07-02 workshop, W1/W4): capture the user's situation
 * in their own words in under 30 seconds. The free-text box IS the front door; the chips
 * below only fill it with example phrasings. No entry cards, no example grids.
 */
const EXAMPLE_PROMPTS = [
  "I want to monetize a hobby",
  "I'm already running a business — optimize my write-offs",
  "I don't know what to start yet — show me what's available",
] as const;

export function LandingPage() {
  const router = useRouter();
  const { setIntake, resetJourney } = useJourney();
  const [text, setText] = useState("");
  const [parsing, setParsing] = useState(false);

  async function handleMapIt() {
    const trimmed = text.trim();
    if (trimmed.length === 0 || parsing) return;
    setParsing(true);

    let result: IntentParseResult;
    try {
      const res = await fetch("/api/intent/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: trimmed }),
      });
      result = res.ok ? ((await res.json()) as IntentParseResult) : parseIntentFallback(trimmed);
    } catch {
      // Offline / network failure — the box never dead-ends.
      result = parseIntentFallback(trimmed);
    }

    // Landing is always the front door of a NEW journey — a returning visitor typing a
    // fresh description should never inherit the previous session's tags/goals/province/
    // scenario (audit-2026-07-04 H1). Reset first, then apply the parse onto a clean
    // draft; React batches these so `applyIntentToDraft` sees the fresh default, not the
    // stale one.
    resetJourney();
    setIntake((prev) => applyIntentToDraft(prev, result, trimmed));
    router.push("/intake");
  }

  return (
    <div className="flex min-h-[calc(100vh-2.5rem)] flex-col bg-ink">
      <header className="flex items-center justify-between border-b border-rule-soft px-8 py-7 md:px-14">
        <WordMark />
        <div className="flex items-center gap-5">
          <GhostLink href="/ventures" tone="stone">
            Your ideas →
          </GhostLink>
          <GhostLink href="/cockpit" tone="stone">
            Open cockpit →
          </GhostLink>
        </div>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center px-8 md:px-14">
        <section className="w-full max-w-[860px] text-center">
          <h1 className="font-serif text-5xl font-bold leading-[1.02] tracking-tight text-paper md:text-6xl lg:text-[68px]">
            Map any venture.
            <br />
            <span className="font-normal italic text-maple">Find your path.</span>
          </h1>
          <p className="mx-auto mt-5 max-w-[560px] text-[15px] leading-relaxed text-paper-dim">
            Every path to financial freedom — structures, write-offs, grants, thresholds —
            sourced, risk-rated, cited to the law. Canada is the first jurisdiction mapped.
          </p>

          <div className="mt-10 flex w-full overflow-hidden rounded-[10px] border border-rule bg-ink3 text-left focus-within:border-maple-soft">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleMapIt();
              }}
              placeholder="What are you building — or what do you want to write off? Any venture works: a video game studio, weekend woodworking, a plumbing company, “I bought a workstation”…"
              rows={3}
              className="min-h-[88px] flex-1 resize-none border-none bg-transparent px-6 py-5 text-[15px] leading-relaxed text-paper outline-none placeholder:text-stone-dim"
            />
            <div className="flex flex-col items-end justify-end self-stretch border-l border-rule-soft px-4 py-3">
              <Pill variant="maple" onClick={handleMapIt} disabled={parsing || text.trim().length === 0}>
                {parsing ? "Reading…" : "Map it →"}
              </Pill>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            {EXAMPLE_PROMPTS.map((prompt) => (
              <button
                key={prompt}
                type="button"
                onClick={() => setText(prompt)}
                className="rounded-full border border-rule px-3.5 py-1.5 text-[12px] text-stone transition hover:border-maple-soft hover:text-paper"
              >
                {prompt}
              </button>
            ))}
          </div>

        </section>
      </main>

    </div>
  );
}
