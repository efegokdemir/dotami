"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { StructureLadderRail } from "@/components/cockpit/structure-ladder-rail";
import { TemplatesRail } from "@/components/cockpit/templates-rail";
import { StrategyMap } from "@/components/cockpit/strategy-map";
import { useJourney } from "@/components/shared/journey-provider";
import { PersonStatements } from "@/components/shared/person-statements";
import { NodeDetailPanel } from "@/components/node-detail-panel";
import { PlaybookExportPanel } from "@/components/playbook-export-panel";
import { FieldRow, Pill, WordMark } from "@/components/ui";
import { evaluateProfile } from "@/lib/brain";
import { itemsForNode } from "@/lib/brain/node-items";
import type { CFENodeId } from "@/lib/engines/cfe/v2026";
import { cfeCatalogV2026 } from "@/lib/engines/cfe/v2026";
import { templatesCatalogV2026 } from "@/lib/engines/templates/v2026";
import { AUTOSAVE_DELAY_MS, formatSavedAt, saveScenario } from "@/lib/journey/save-scenario";
import {
  branchDecisions,
  updateScenarioBranch,
  type BranchDecision,
} from "@/lib/scenarios/branches";
import { buildEvaluationProfileFromScenario } from "@/lib/scenarios/evaluation-profile";
import type { Scenario, VentureStructure } from "@/lib/scenarios/types";
import Link from "next/link";

/**
 * The cockpit (S2.5.4h/j shape): one venture, its lifecycle map as tier columns, the rails that
 * explain it.
 * Removed 2026-09-14 (S2.5.4h): labeled-example archetypes, the Lens chat, the five-year
 * projection footer, Track/Compare tabs, header fork chips and the dead Focus / ? /
 * "Graph language" controls. What is left is the cockpit itself — the map and the rails
 * that explain it.
 */

type RightPanel = null | "node" | "playbook";

/** Every prep-tool reference, once the structure is set — there are four; no persona picks them. */
const ALL_TEMPLATE_IDS = templatesCatalogV2026.entries.map((entry) => entry.id);

interface CockpitPageProps {
  /** The most recently saved venture (or the one named by `?venture=`), or null when nothing is saved. */
  initialScenario: Scenario | null;
  /** S2.5.4i: `?venture=<id>` was explicit — it wins over the session and becomes the session. */
  pinned?: boolean;
}

export function CockpitPage({ initialScenario, pinned = false }: CockpitPageProps) {
  const { scenario: journeyScenario, setScenario, hydrated } = useJourney();
  const [currentScenario, setCurrentScenario] = useState<Scenario | null>(
    pinned ? initialScenario : (journeyScenario ?? initialScenario),
  );

  // `JourneyProvider` reads sessionStorage in its own effect, so on first paint
  // `journeyScenario` is still null and the server-loaded scenario is used. Once hydration
  // settles, adopt the session's scenario if one exists and differs — the user's most recent
  // unsaved edits win over the server snapshot (audit-2026-07-04 C2).
  useEffect(() => {
    if (!hydrated) return;
    if (pinned) {
      // An explicit `?venture=` is a deliberate choice: make it the session's scenario.
      if (initialScenario && journeyScenario?.id !== initialScenario.id) setScenario(initialScenario);
      return;
    }
    if (journeyScenario && journeyScenario.id !== currentScenario?.id) {
      setCurrentScenario(journeyScenario);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated]);

  const [selectedNodeId, setSelectedNodeId] = useState<CFENodeId | null>(null);
  const [rightPanel, setRightPanel] = useState<RightPanel>(null);
  // Issue #1: every edit on this page is written to the database after a short pause; the
  // line under "Save now" always says where things stand. `dirty` = an edit is waiting.
  const [saveState, setSaveState] = useState<"idle" | "dirty" | "saving" | "saved" | "error">(
    "idle",
  );
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const autosaveTimer = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (autosaveTimer.current !== null) window.clearTimeout(autosaveTimer.current);
    },
    [],
  );

  const cfeNodes = cfeCatalogV2026.nodes;
  const cfeNodeById = useMemo(() => new Map(cfeNodes.map((node) => [node.id, node])), [cfeNodes]);
  const selectedNode = selectedNodeId ? cfeNodeById.get(selectedNodeId) : null;

  // S2.5.4e: the cockpit runs the same evaluator the intake preview runs — on this scenario.
  const today = useMemo(() => new Date().toLocaleDateString("en-CA"), []);
  const evaluation = useMemo(
    () =>
      currentScenario
        ? evaluateProfile(buildEvaluationProfileFromScenario(currentScenario), { today })
        : null,
    [currentScenario, today],
  );
  const nodeItems = useMemo(
    () =>
      selectedNodeId && evaluation
        ? itemsForNode(evaluation.unlocks, selectedNodeId)
        : { forThisStage: [], elsewhere: [] },
    [evaluation, selectedNodeId],
  );

  if (!currentScenario) {
    return <EmptyCockpit />;
  }

  const scenario = currentScenario;
  const structureAssumed = scenario.profile.structureSource !== "user";
  /** Ladder rung derived from the scenario's OWN structure (S2.5.4d). */
  const ladderStepId = structureAssumed
    ? null
    : scenario.profile.structure === "corporation"
      ? "structure-ccpc"
      : "structure-sole-prop";
  const decidedBranchIds = new Set(scenario.state.decidedBranchIds ?? []);

  /** Writes `target` to the database and reports the outcome on the save line. Never throws. */
  async function persist(target: Scenario) {
    setSaveState("saving");
    const result = await saveScenario(target);
    if (result.ok) {
      setSaveState("saved");
      setSavedAt(new Date());
    } else {
      setSaveState("error");
    }
  }

  /** Debounced autosave: the last edit wins; the line reads "Unsaved changes…" until it lands. */
  function scheduleSave(next: Scenario) {
    setSaveState("dirty");
    if (autosaveTimer.current !== null) window.clearTimeout(autosaveTimer.current);
    autosaveTimer.current = window.setTimeout(() => {
      autosaveTimer.current = null;
      void persist(next);
    }, AUTOSAVE_DELAY_MS);
  }

  function handleBranchChange(decision: BranchDecision, optionId: CFENodeId) {
    const next = updateScenarioBranch(scenario, decision.id, optionId);
    setCurrentScenario(next);
    setScenario(next);
    scheduleSave(next);
  }

  /** S2.5.4d: the one place the person sets their structure. "" = not set (map assumes sole-prop). */
  function handleStructureChange(value: "" | VentureStructure) {
    const next: Scenario = {
      ...scenario,
      profile: {
        ...scenario.profile,
        structure: value === "" ? "sole-prop" : value,
        structureSource: value === "" ? "assumed" : "user",
      },
    };
    setCurrentScenario(next);
    setScenario(next);
    scheduleSave(next);
  }

  /** "Save now": skips the pause. Also the retry when autosave reported the database away. */
  function handleSave() {
    if (autosaveTimer.current !== null) {
      window.clearTimeout(autosaveTimer.current);
      autosaveTimer.current = null;
    }
    void persist(scenario);
  }

  const showRightSlot = rightPanel === "playbook" || (rightPanel === "node" && selectedNode);

  return (
    <div className="grid h-[calc(100vh-2.5rem)] grid-rows-[52px_1fr] overflow-hidden bg-ink">
      {/* Header — S2.5.4c: minmax(0, …) columns so nothing overlaps when the window is narrow. */}
      <header className="grid grid-cols-[240px_minmax(0,1fr)_auto] border-b border-rule bg-[#0f0e12]">
        <div className="flex min-w-0 items-center gap-[18px] border-r border-rule px-[22px]">
          <Link href="/ventures" className="font-mono text-[11px] text-stone transition hover:text-paper">
            ← Ideas
          </Link>
          <WordMark size="sm" />
        </div>

        <div className="flex min-w-0 items-center px-5">
          <span
            className="min-w-0 truncate font-serif text-sm font-bold tracking-tight text-paper"
            title={scenario.profile.name}
          >
            {scenario.profile.name}
          </span>
        </div>

        <div className="flex shrink-0 items-center justify-end gap-2 border-l border-rule px-5">
          <Pill
            variant={rightPanel === "playbook" ? "maple" : "maple-out"}
            size="small"
            onClick={() => setRightPanel(rightPanel === "playbook" ? null : "playbook")}
          >
            Export
          </Pill>
        </div>
      </header>

      {/* Body */}
      <div
        className={`grid min-h-0 overflow-hidden ${
          showRightSlot
            ? "grid-cols-[minmax(200px,240px)_minmax(0,1fr)_minmax(280px,380px)]"
            : "grid-cols-[minmax(200px,240px)_minmax(0,1fr)]"
        }`}
      >
        {/* Left rail */}
        <aside className="flex min-w-0 flex-col gap-3.5 overflow-y-auto border-r border-rule bg-ink3 p-5">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-stone">Venture</p>
            <h3 className="mt-0.5 font-serif text-[22px] font-bold tracking-tight">
              {scenario.profile.name}
            </h3>
            <p className="text-[11px] text-stone capitalize">
              {scenario.profile.type} · {scenario.profile.province}
            </p>
          </div>

          <FieldRow label="Type" value={scenario.profile.type} />
          <FieldRow label="Province" value={scenario.profile.province} />
          <FieldRow label="Target Y1" value={formatCurrency(scenario.profile.targetRevenueY1)} />
          <FieldRow label="Target Y3" value={formatCurrency(scenario.profile.targetRevenueY3)} />
          <div className="border-t border-rule-soft py-2 text-xs">
            <div className="grid grid-cols-[1fr_auto] items-baseline gap-4">
              <span className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-stone">
                Structure
              </span>
              <select
                aria-label="Structure"
                value={structureAssumed ? "" : scenario.profile.structure}
                onChange={(e) => handleStructureChange(e.target.value as "" | VentureStructure)}
                className="rounded border border-rule bg-ink px-1.5 py-0.5 font-mono text-[11px] text-paper"
              >
                <option value="">Not set</option>
                <option value="sole-prop">Sole prop</option>
                <option value="corporation">Corporation</option>
              </select>
            </div>
            {structureAssumed ? (
              <p className="mt-1 text-[10px] leading-snug text-stone-dim">
                Map assumes sole prop until you set it.
              </p>
            ) : null}
          </div>
          <FieldRow label="Employed" value={scenario.profile.employmentStatus} />

          {/* S2.5.4a "In your words" — dated verbatim statements, shown back, never scored. */}
          <section className="border-t border-rule-soft pt-4">
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-stone">
              In your words
            </p>
            <div className="mt-2">
              <PersonStatements variant="rail" />
            </div>
          </section>

          <StructureLadderRail activeStepId={ladderStepId} />
          {structureAssumed ? (
            <section className="border-t border-rule-soft pt-4">
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-stone">
                Prep-tool references
              </p>
              <p className="mt-1 text-[10px] leading-snug text-stone-dim">
                Appear once your structure is set.
              </p>
            </section>
          ) : (
            <TemplatesRail templateIds={ALL_TEMPLATE_IDS} />
          )}

          <div className="mt-4 flex flex-col gap-2.5">
            <Pill variant="maple" className="w-full justify-center" onClick={() => handleSave()}>
              {saveState === "saving" ? "Saving…" : "Save now"}
            </Pill>
            {/* The save line — always truthful about where the person's edits are. */}
            {saveState === "dirty" ? (
              <p className="text-center font-mono text-[10px] text-stone">Unsaved changes…</p>
            ) : null}
            {saveState === "saved" && savedAt ? (
              <p className="text-center font-mono text-[10px] text-sage">Saved · {formatSavedAt(savedAt)}</p>
            ) : null}
            {saveState === "error" ? (
              <p className="text-center text-[10px] text-maple">
                Save unavailable — kept in this tab. Save now retries.
              </p>
            ) : null}
            {saveState === "idle" ? (
              <p className="text-center font-mono text-[10px] text-stone-dim">Edits save automatically.</p>
            ) : null}
            <Link href="/intake">
              <Pill variant="ghost" className="w-full justify-center">
                Edit venture profile
              </Pill>
            </Link>
            <Link href="/ventures">
              <Pill variant="ghost" className="w-full justify-center">
                All ideas
              </Pill>
            </Link>
          </div>

          <p className="mt-auto border-t border-rule-soft pt-4 text-[10.5px] leading-snug text-stone">
            <span className="font-serif italic text-paper">Compass, not GPS.</span> Profile drives
            which surfaces appear on the map. DotAmi never files, predicts, or replaces an
            accountant.
          </p>
        </aside>

        {/* Canvas — S2.5.4j: tier columns, not a graph */}
        <div className="relative flex min-h-0 flex-col bg-ink4">
          {evaluation ? (
            <StrategyMap
              nodes={cfeNodes}
              scenario={scenario}
              evaluation={evaluation}
              selectedNodeId={selectedNodeId}
              onSelectNode={(nodeId) => {
                setSelectedNodeId(nodeId);
                setRightPanel("node");
              }}
              decidedBranchIds={decidedBranchIds}
              onBranchChange={handleBranchChange}
            />
          ) : null}
        </div>

        {/* Right panel */}
        {showRightSlot && rightPanel === "node" && selectedNode ? (
          <div className="overflow-y-auto border-l border-rule bg-ink3">
            <NodeDetailPanel
              node={selectedNode}
              items={nodeItems}
              onClose={() => {
                setSelectedNodeId(null);
                setRightPanel(null);
              }}
            />
          </div>
        ) : null}

        {showRightSlot && rightPanel === "playbook" ? (
          <div className="overflow-y-auto border-l border-rule bg-ink3">
            <PlaybookExportPanel scenario={scenario} onClose={() => setRightPanel(null)} />
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** No venture saved and none in this session: say so, point at the intake. */
function EmptyCockpit() {
  return (
    <div className="flex h-[calc(100vh-2.5rem)] flex-col bg-ink">
      <header className="flex h-[52px] items-center gap-[18px] border-b border-rule bg-[#0f0e12] px-[22px]">
        <Link href="/" className="font-mono text-[11px] text-stone transition hover:text-paper">
          ← Back
        </Link>
        <WordMark size="sm" />
      </header>
      <div className="flex flex-1 items-center justify-center p-8">
        <div className="max-w-md text-center">
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-stone">Cockpit</p>
          <h1 className="mt-2 font-serif text-[26px] font-bold leading-[1.15] tracking-tight text-paper">
            No venture on the map <span className="font-normal italic text-maple">yet.</span>
          </h1>
          <p className="mt-3 text-sm text-paper-dim">
            The cockpit shows the venture you describe on the intake. Nothing here is a sample —
            it is empty until it is yours.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link href="/intake">
              <Pill variant="maple">Describe a venture →</Pill>
            </Link>
            <Link href="/ventures">
              <Pill variant="ghost">All ideas</Pill>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
    maximumFractionDigits: 0,
  }).format(value);
}
