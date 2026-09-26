"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { useJourney } from "@/components/shared/journey-provider";
import { GhostLink, Pill, WordMark } from "@/components/ui";
import type { VentureLinkKind, VentureSummary } from "@/lib/db/ventures";
import { VENTURE_LINK_KINDS, VENTURE_LINK_LABELS } from "@/lib/db/ventures";
import { VENTURE_STAGES, VENTURE_STAGE_LABELS, type VentureStage } from "@/lib/scenarios/types";

/**
 * S2.5.4i — the ideas DB (decided 2026-09-14): every business idea is labelled, saved and
 * stored, and ideas can cross-reference each other so a new project lands next to what is
 * already in progress. One card per idea in the order it was last touched — never in an
 * order the app chose by merit. Stage, notes and cross-references are edited here; everything
 * about the venture itself is edited on the intake and the map.
 */
export function VenturesPage() {
  const router = useRouter();
  const { resetJourney } = useJourney();
  const [ventures, setVentures] = useState<VentureSummary[] | null>(null);
  const [dbDown, setDbDown] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/ventures", { cache: "no-store" });
      const body = (await res.json()) as { ventures: VentureSummary[]; db: { available: boolean; reason?: string } };
      setVentures(body.ventures ?? []);
      setDbDown(body.db?.available === false ? (body.db.reason ?? "No database reachable.") : null);
    } catch {
      setVentures([]);
      setDbDown("Could not reach the app.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function newIdea() {
    resetJourney();
    router.push("/intake");
  }

  return (
    <div className="flex min-h-[calc(100vh-2.5rem)] flex-col bg-ink">
      <nav className="flex items-center gap-6 border-b border-rule-soft px-8 py-[18px]">
        <GhostLink href="/" tone="stone">
          ← Back
        </GhostLink>
        <WordMark />
        <p className="ml-auto font-mono text-[10px] uppercase tracking-[0.14em] text-stone">Your ideas</p>
      </nav>

      <main className="mx-auto w-full max-w-4xl flex-1 px-8 py-10">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-serif text-[26px] font-bold leading-[1.15] tracking-tight text-paper">
              Every idea, <span className="font-normal italic text-maple">saved and cross-referenced.</span>
            </h1>
            <p className="mt-2 max-w-xl text-sm text-paper-dim">
              Listed by when you last touched them — not ranked. Each opens in its own cockpit. Link
              the ones that overlap or could become sister companies; the map reads the links, it
              never scores them.
            </p>
          </div>
          <Pill variant="maple" onClick={newIdea}>
            New idea →
          </Pill>
        </header>

        {dbDown ? (
          <p className="mt-6 rounded-lg border border-amber/40 bg-amber/5 px-4 py-3 text-sm text-amber">{dbDown}</p>
        ) : null}

        {ventures === null ? (
          <p className="mt-10 text-sm text-stone">Loading…</p>
        ) : ventures.length === 0 ? (
          <div className="mt-10 rounded-lg border border-dashed border-rule p-8 text-center">
            <p className="text-sm text-stone">Nothing saved yet. Describe one on the intake and press Save on its map.</p>
            <div className="mt-4 flex justify-center">
              <Pill variant="maple" onClick={newIdea}>
                Describe an idea →
              </Pill>
            </div>
          </div>
        ) : (
          <ul className="mt-8 space-y-4">
            {ventures.map((v) => (
              <VentureCard key={v.id} venture={v} all={ventures} onChanged={load} />
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}

function VentureCard({
  venture,
  all,
  onChanged,
}: {
  venture: VentureSummary;
  all: VentureSummary[];
  onChanged: () => Promise<void>;
}) {
  const [notes, setNotes] = useState(venture.notes);
  const [saving, setSaving] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [linkTo, setLinkTo] = useState("");
  const [linkKind, setLinkKind] = useState<VentureLinkKind>("related");
  const [linkNote, setLinkNote] = useState("");

  async function patch(body: { stage?: VentureStage; notes?: string }) {
    setSaving("saving");
    try {
      const res = await fetch(`/api/ventures/${venture.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      setSaving(res.ok ? "saved" : "error");
      if (res.ok) await onChanged();
    } catch {
      setSaving("error");
    }
    window.setTimeout(() => setSaving("idle"), 1800);
  }

  async function addLink() {
    if (!linkTo) return;
    const res = await fetch(`/api/ventures/${venture.id}/links`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ toId: linkTo, kind: linkKind, note: linkNote }),
    });
    if (res.ok) {
      setLinkTo("");
      setLinkNote("");
      await onChanged();
    }
  }

  async function removeLink(linkId: string) {
    const res = await fetch(`/api/ventures/${venture.id}/links?linkId=${encodeURIComponent(linkId)}`, { method: "DELETE" });
    if (res.ok) await onChanged();
  }

  const others = all.filter((o) => o.id !== venture.id && !venture.links.some((l) => l.otherId === o.id));
  const cockpitHref = `/cockpit?venture=${encodeURIComponent(venture.id)}`;

  return (
    <li className="rounded-lg border border-rule bg-ink2 p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="truncate font-serif text-xl font-bold tracking-tight text-paper" title={venture.name}>
            {venture.name}
          </h2>
          <p className="mt-0.5 text-[11px] capitalize text-stone">
            {venture.type} · {venture.province} · structure{" "}
            {venture.structureSource === "assumed" ? "not set" : venture.structure}
            {venture.targetRevenueY1 > 0 ? ` · Y1 $${venture.targetRevenueY1.toLocaleString("en-CA")}` : ""}
          </p>
          {venture.activityTags.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {venture.activityTags.map((t) => (
                <span key={t} className="rounded border border-rule px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-stone">
                  {t}
                </span>
              ))}
            </div>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <label className="flex items-center gap-2 text-[11px] text-stone">
            <span className="font-mono text-[9.5px] uppercase tracking-[0.14em]">Stage</span>
            <select
              value={venture.stage}
              onChange={(e) => void patch({ stage: e.target.value as VentureStage })}
              className="rounded border border-rule bg-ink px-1.5 py-0.5 font-mono text-[11px] text-paper"
            >
              {VENTURE_STAGES.map((s) => (
                <option key={s} value={s}>
                  {VENTURE_STAGE_LABELS[s]}
                </option>
              ))}
            </select>
          </label>
          <Link href={cockpitHref}>
            <Pill variant="maple" size="small">
              Open in cockpit →
            </Pill>
          </Link>
        </div>
      </div>

      <div className="mt-4">
        <p className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-stone">Your notes</p>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={() => {
            if (notes !== venture.notes) void patch({ notes });
          }}
          rows={3}
          placeholder="Anything about this idea, in your words. Saved when you click away."
          className="mt-1.5 w-full resize-y rounded border border-rule bg-ink px-3 py-2 text-sm text-paper outline-none placeholder:text-stone-dim focus:border-maple-soft"
        />
        <p className="mt-1 text-right font-mono text-[9px] uppercase tracking-wider text-stone-dim">
          {saving === "saving" ? "Saving…" : saving === "saved" ? "Saved." : saving === "error" ? "Save failed." : `touched ${venture.updatedAt.slice(0, 10)}`}
        </p>
      </div>

      <div className="mt-3 border-t border-rule-soft pt-3">
        <p className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-stone">Cross-references</p>
        {venture.links.length === 0 ? (
          <p className="mt-1 text-[11px] text-stone-dim">None yet.</p>
        ) : (
          <ul className="mt-1.5 space-y-1">
            {venture.links.map((l) => (
              <li key={l.id} className="flex flex-wrap items-baseline gap-2 text-xs">
                <span className="font-mono text-[9px] uppercase tracking-wider text-maple">
                  {VENTURE_LINK_LABELS[l.kind]}
                </span>
                <Link href={`/cockpit?venture=${encodeURIComponent(l.otherId)}`} className="font-semibold text-paper hover:underline">
                  {l.otherName}
                </Link>
                {l.note ? <span className="text-stone">— {l.note}</span> : null}
                <button type="button" onClick={() => void removeLink(l.id)} className="ml-auto text-[10px] text-stone-dim hover:text-maple">
                  remove
                </button>
              </li>
            ))}
          </ul>
        )}
        {others.length > 0 ? (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <select
              value={linkKind}
              onChange={(e) => setLinkKind(e.target.value as VentureLinkKind)}
              className="rounded border border-rule bg-ink px-1.5 py-0.5 font-mono text-[10px] text-paper"
            >
              {VENTURE_LINK_KINDS.map((k) => (
                <option key={k} value={k}>
                  {VENTURE_LINK_LABELS[k]}
                </option>
              ))}
            </select>
            <select
              value={linkTo}
              onChange={(e) => setLinkTo(e.target.value)}
              className="rounded border border-rule bg-ink px-1.5 py-0.5 font-mono text-[10px] text-paper"
            >
              <option value="">Choose an idea…</option>
              {others.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
            <input
              value={linkNote}
              onChange={(e) => setLinkNote(e.target.value)}
              placeholder="why (optional)"
              className="min-w-[160px] flex-1 rounded border border-rule bg-ink px-2 py-0.5 text-xs text-paper outline-none placeholder:text-stone-dim focus:border-maple-soft"
            />
            <Pill variant="ghost" size="small" onClick={() => void addLink()} disabled={!linkTo}>
              + Link
            </Pill>
          </div>
        ) : null}
      </div>
    </li>
  );
}
