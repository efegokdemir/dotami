"use client";

import { useCallback, useMemo, useRef, useState } from "react";

import { ArrowOverlay, futureEdges, futureSet } from "@/components/cockpit/map-arrows";
import { StatusChip, worstStatus } from "@/components/shared/citation-links";
import { itemsForNode } from "@/lib/brain/node-items";
import type { EvaluationResult, UnlockItem } from "@/lib/brain/types";
import type { CFENode, CFENodeId } from "@/lib/engines/cfe/v2026";
import { cfeTiersV2026, tierForStage, type CFETier } from "@/lib/engines/cfe/v2026/tiers";
import { branchDecisions, type BranchDecision } from "@/lib/scenarios/branches";
import { getScenarioNodeStatus } from "@/lib/scenarios/graph";
import type { Scenario, ScenarioNodeStatus } from "@/lib/scenarios/types";

/**
 * S2.5.4j — the map as tier columns (decided 2026-09-16: the free-form graph was hard to
 * follow visually; a column-per-tier layout replaced it). Deliberately NOT copied from the
 * reference layout: per-card dollar ranges — no engine computes them, so none are shown.
 *
 * Each column = one tier from `cfeTiersV2026`. Inside: a stage card per lifecycle node whose
 * `stage` the tier lists, and under each stage card a lever card per evaluator item relevant
 * to that stage (`itemsForNode`). Stage chips say where the node sits on THIS venture's path;
 * lever chips say what the answers given support. Nothing here ranks or recommends.
 *
 * Ruling 2 (same day): hover or select a stage card and arrows show where it leads — the
 * catalog's own `branches`, walked to the end (`map-arrows.tsx`); everything off that future dims.
 */

interface StrategyMapProps {
  nodes: readonly CFENode[];
  scenario: Scenario;
  evaluation: EvaluationResult;
  selectedNodeId: CFENodeId | null;
  onSelectNode: (nodeId: CFENodeId) => void;
  decidedBranchIds: ReadonlySet<string>;
  onBranchChange: (decision: BranchDecision, optionId: CFENodeId) => void;
}

const STAGE_CHIP: Record<ScenarioNodeStatus, { label: string; className: string }> = {
  active: { label: "now", className: "text-maple bg-maple/15" },
  decision: { label: "your pick", className: "text-amber bg-amber/15" },
  complete: { label: "done", className: "text-sage bg-sage/15" },
  upcoming: { label: "ahead", className: "text-stone bg-rule/30" },
  ghost: { label: "not on your path", className: "text-stone-dim border border-stone-dim" },
};

/** Left accent from the evaluator's read of the answers: met · plausible · not applicable. */
const ACCENT: Record<"green" | "yellow" | "gray", string> = {
  green: "border-l-sage",
  yellow: "border-l-amber",
  gray: "border-l-rule",
};

export function StrategyMap({
  nodes,
  scenario,
  evaluation,
  selectedNodeId,
  onSelectNode,
  decidedBranchIds,
  onBranchChange,
}: StrategyMapProps) {
  const [hoveredId, setHoveredId] = useState<CFENodeId | null>(null);
  const [wrap, setWrap] = useState<HTMLDivElement | null>(null);
  // Stage-card elements by node id, for the arrow overlay to measure. A ref (not state) so
  // registration during render never re-renders; the overlay re-measures on focus change.
  const cardsRef = useRef(new Map<string, HTMLElement>());
  const registerCard = useCallback((id: string, el: HTMLElement | null) => {
    if (el) cardsRef.current.set(id, el);
    else cardsRef.current.delete(id);
  }, []);

  const nodesById = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const columnOf = useCallback(
    (id: string) => {
      const node = nodesById.get(id);
      return node ? (tierForStage(node.stage)?.ordinal ?? 0) : 0;
    },
    [nodesById],
  );

  // Hover wins while the pointer is on a card; the selected card keeps its arrows otherwise.
  const focusId = hoveredId ?? selectedNodeId;
  const edges = useMemo(() => (focusId ? futureEdges(nodesById, focusId) : []), [nodesById, focusId]);
  const future = useMemo(() => futureSet(edges), [edges]);

  const focus: MapFocus = { focusId, future, hover: setHoveredId, registerCard };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 overflow-auto px-5 pt-5">
        <div ref={setWrap} className="relative">
          <div
            className="grid min-w-[820px] gap-3.5"
            style={{ gridTemplateColumns: `repeat(${cfeTiersV2026.length}, minmax(195px, 1fr))` }}
          >
            {cfeTiersV2026.map((tier) => (
              <TierColumn
                key={tier.id}
                tier={tier}
                nodes={nodes.filter((n) => tier.stages.includes(n.stage))}
                scenario={scenario}
                evaluation={evaluation}
                selectedNodeId={selectedNodeId}
                onSelectNode={onSelectNode}
                decidedBranchIds={decidedBranchIds}
                onBranchChange={onBranchChange}
                focus={focus}
              />
            ))}
          </div>
          <ArrowOverlay container={wrap} cards={cardsRef.current} columnOf={columnOf} edges={edges} />
        </div>
      </div>
      <Legend coverage={evaluation.provinceCoverage} />
    </div>
  );
}

/** What the columns need to know about the focused card and its future. */
interface MapFocus {
  focusId: CFENodeId | null;
  future: ReadonlySet<string>;
  hover: (id: CFENodeId | null) => void;
  registerCard: (id: string, el: HTMLElement | null) => void;
}

function TierColumn({
  tier,
  nodes,
  scenario,
  evaluation,
  selectedNodeId,
  onSelectNode,
  decidedBranchIds,
  onBranchChange,
  focus,
}: StrategyMapProps & { tier: CFETier; focus: MapFocus }) {
  const decision = tier.branchDecisionId
    ? branchDecisions.find((d) => d.id === tier.branchDecisionId)
    : undefined;

  return (
    <section className="flex min-w-0 flex-col gap-3 pb-6">
      <header className="border-b border-rule pb-2.5">
        <p className="font-mono text-[9.5px] uppercase tracking-[0.16em] text-maple">Tier {tier.ordinal}</p>
        <h3 className="mt-0.5 font-serif text-[15px] font-bold leading-tight tracking-tight text-paper">{tier.label}</h3>
        <p className="mt-0.5 text-[10.5px] leading-snug text-stone">{tier.subtitle}</p>
        {decision ? (
          <BranchToggle
            decision={decision}
            activeOptionId={scenario.state.activeBranches[decision.id]}
            isDefault={!decidedBranchIds.has(decision.id)}
            onChange={(optionId) => onBranchChange(decision, optionId)}
          />
        ) : null}
      </header>

      {nodes.map((node) => {
        const status = getScenarioNodeStatus(node.id as CFENodeId, scenario);
        const colour = evaluation.nodeStates[node.id as CFENodeId] ?? "gray";
        const levers = itemsForNode(evaluation.unlocks, node.id as CFENodeId).forThisStage;
        const selected = selectedNodeId === node.id;
        // While a card is focused, everything that is neither it nor on its future dims.
        const dimmed = focus.focusId !== null && focus.focusId !== node.id && !focus.future.has(node.id);
        return (
          <div key={node.id} className={`flex flex-col gap-1.5 transition-opacity ${dimmed ? "opacity-35" : ""}`}>
            <StageCard
              node={node}
              status={status}
              colour={colour}
              selected={selected}
              onClick={() => onSelectNode(node.id as CFENodeId)}
              onHover={(on) => focus.hover(on ? (node.id as CFENodeId) : null)}
              registerCard={(el) => focus.registerCard(node.id, el)}
            />
            {status !== "ghost" && levers.length > 0 ? (
              <ul className="ml-3 flex flex-col gap-1.5 border-l border-rule-soft pl-3">
                {levers.map((item) => (
                  <LeverCard key={item.id} item={item} onClick={() => onSelectNode(node.id as CFENodeId)} />
                ))}
              </ul>
            ) : null}
          </div>
        );
      })}
    </section>
  );
}

function StageCard({
  node,
  status,
  colour,
  selected,
  onClick,
  onHover,
  registerCard,
}: {
  node: CFENode;
  status: ScenarioNodeStatus;
  colour: "green" | "yellow" | "gray";
  selected: boolean;
  onClick: () => void;
  onHover: (on: boolean) => void;
  registerCard: (el: HTMLElement | null) => void;
}) {
  const chip = STAGE_CHIP[status];
  const ghost = status === "ghost";
  return (
    <button
      ref={registerCard}
      type="button"
      onClick={onClick}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      onFocus={() => onHover(true)}
      onBlur={() => onHover(false)}
      aria-pressed={selected}
      aria-label={`${node.label}, ${chip.label}, opens detail`}
      className={`w-full rounded-lg border border-l-[3px] bg-ink3 p-3 text-left transition hover:border-maple-soft ${
        ghost ? "border-dashed opacity-60" : "border-rule"
      } ${ACCENT[colour]} ${selected ? "ring-2 ring-maple/30" : ""}`}
    >
      <div className="flex items-start justify-between gap-2">
        <h4 className="font-serif text-[14px] font-bold leading-tight tracking-tight text-paper">{node.label}</h4>
        <span className={`shrink-0 rounded px-1.5 py-0.5 font-mono text-[8.5px] uppercase tracking-wider ${chip.className}`}>
          {chip.label}
        </span>
      </div>
      <p className="mt-1.5 line-clamp-2 text-[11px] leading-snug text-stone">{node.trigger}</p>
    </button>
  );
}

/** The one dated fact the evaluator carries for this item, or nothing — never an invented range.
 * (Figures like the $30K line stay in the catalog and reach the screen through `item.why`.) */
function leverFact(item: UnlockItem): string | null {
  return item.expires ? `in use before ${item.expires.slice(0, 4)}` : null;
}

function LeverCard({ item, onClick }: { item: UnlockItem; onClick: () => void }) {
  const dot = item.state === "green" ? "bg-sage" : "bg-amber";
  const label = item.state === "green" ? "applies" : "check first";
  const fact = leverFact(item);
  const partial = worstStatus(item.citations) === "partial";
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        aria-label={`${item.typeChip}: ${item.title}, ${label}${item.fork ? ", fork" : ""}${partial ? ", partial citation" : ""}${fact ? `, ${fact}` : ""}, opens detail`}
        className="w-full rounded-md border border-rule bg-ink2 px-2.5 py-2 text-left transition hover:border-maple-soft"
      >
        <div className="flex items-center gap-2">
          <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} aria-hidden />
          <span className="shrink-0 rounded border border-rule px-1 py-0.5 font-mono text-[8px] uppercase tracking-wider text-stone">
            {item.typeChip}
          </span>
          <span className="min-w-0 flex-1 truncate text-[12px] font-semibold text-paper" title={item.title}>
            {item.title}
          </span>
          {partial ? <StatusChip status="partial" className="shrink-0" /> : null}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 font-mono text-[8.5px] uppercase tracking-wider">
          <span className={item.state === "green" ? "text-sage" : "text-amber"}>{label}</span>
          {item.fork ? <span className="text-amber">· fork</span> : null}
          {fact ? <span className="text-stone-dim">· {fact}</span> : null}
        </div>
      </button>
    </li>
  );
}

function BranchToggle({
  decision,
  activeOptionId,
  isDefault,
  onChange,
}: {
  decision: BranchDecision;
  activeOptionId: CFENodeId;
  /** S2.5.4d: true until the person clicks — the active option is a default, and says so. */
  isDefault: boolean;
  onChange: (optionId: CFENodeId) => void;
}) {
  return (
    <fieldset className="mt-2.5 rounded-md border border-rule bg-ink3/90 p-2">
      <legend className="sr-only">{decision.label}</legend>
      <span className="mb-1 block font-mono text-[9px] uppercase tracking-wider text-stone">
        {decision.label}
        {isDefault ? <span className="ml-1.5 text-amber">· default, not your pick yet</span> : null}
      </span>
      <div className="flex gap-1">
        {decision.options.map((option) => {
          const isActive = option.id === activeOptionId;
          return (
            <button
              key={option.id}
              type="button"
              aria-pressed={isActive}
              onClick={() => onChange(option.id)}
              className={`rounded-full px-2 py-1 text-[10px] font-medium ${
                isActive ? "bg-maple text-[#fff8ee]" : "text-stone hover:bg-ink2"
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

function Legend({ coverage }: { coverage: EvaluationResult["provinceCoverage"] }) {
  return (
    <footer className="flex flex-wrap items-center gap-x-5 gap-y-1.5 border-t border-rule bg-ink3 px-5 py-2.5 font-mono text-[9px] uppercase tracking-wider text-stone">
      <span className="text-maple">Hover a card: arrows show where it leads — solid next, dashed further on</span>
      <span className="text-stone-dim">Stage chip = where it sits on your path</span>
      <span className="flex items-center gap-1.5"><i className="h-1.5 w-1.5 rounded-full bg-sage" /> applies as answered</span>
      <span className="flex items-center gap-1.5"><i className="h-1.5 w-1.5 rounded-full bg-amber" /> check first — confirm, time-boxed, or one fork away</span>
      <span className="flex items-center gap-1.5"><i className="h-2.5 w-[3px] rounded-sm bg-rule" /> left bar = what your answers support</span>
      {coverage === "federal-only" ? <span className="text-amber">federal rules only for this province</span> : null}
      <span className="ml-auto normal-case tracking-normal text-stone-dim">Compass, not GPS — nothing here is a recommendation.</span>
    </footer>
  );
}
