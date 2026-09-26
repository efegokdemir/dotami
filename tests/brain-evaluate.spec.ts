import { describe, expect, it } from "vitest";

import { evaluateProfile, buildEvaluationProfile } from "@/lib/brain";
import type { EvaluationProfile } from "@/lib/brain";
import { defaultIntakeDraft } from "@/lib/journey/types";

const TODAY = "2026-07-02";

/**
 * Canonical golden scenario (docs/brain/README.md): the previously hardcoded
 * GPU/workstation wireframe example, now generated. AB sole prop, AI/R&D + software
 * activity, capital equipment purchase planned.
 */
const gpuWorkstationProfile: EvaluationProfile = {
  goals: ["write-offs", "discover-now"],
  ventureType: "service",
  activityTags: ["AI / ML / R&D", "Software / SaaS"],
  province: "AB",
  employmentStatus: "employee",
  structure: "sole-prop",
  targetRevenueY1: 30000,
  targetRevenueY3: 90000,
  hireFirst: false,
  capitalPurchasePlanned: true,
};

describe("strategy rules engine — GPU/workstation golden scenario", () => {
  const result = evaluateProfile(gpuWorkstationProfile, { today: TODAY });
  const byId = new Map(result.unlocks.map((u) => [u.id, u]));

  it("flags SR&ED as yellow with the sole-prop rate and a CCPC fork", () => {
    const sred = byId.get("grant-sred");
    expect(sred).toBeDefined();
    expect(sred!.state).toBe("yellow");
    expect(sred!.typeChip).toBe("Tax credit");
    expect(sred!.payoff).toContain("15%");
    expect(sred!.payoff).toContain("non-refundable");
    expect(sred!.fork).toBeDefined();
    expect(sred!.fork!.note).toContain("35%");
    expect(sred!.fork!.note).toContain("refundable");
  });

  it("activates Class 50 with the Immediate Expensing incentive as yellow with expiry", () => {
    const class50 = byId.get("writeoff-cca-class-50");
    expect(class50).toBeDefined();
    expect(class50!.state).toBe("yellow");
    expect(class50!.expires).toBe("2027-01-01");
    expect(class50!.payoff).toContain("accountant");
  });

  it("surfaces IRAP as a gray→yellow incorporation fork (near-miss rule)", () => {
    const irap = byId.get("grant-irap");
    expect(irap).toBeDefined();
    expect(irap!.state).toBe("yellow");
    expect(irap!.fork).toBeDefined();
    expect(irap!.fork!.label).toContain("Incorporating");
  });

  it("flags Alberta Innovates for an AB tech venture", () => {
    const abi = byId.get("grant-alberta-innovates");
    expect(abi).toBeDefined();
    expect(abi!.typeChip).toBe("Grant");
  });

  it("surfaces the GST fork on the threshold", () => {
    const gst = byId.get("compliance-gst-small-supplier");
    expect(gst).toBeDefined();
    expect(gst!.typeChip).toBe("Threshold");
    expect(gst!.why).toContain("This federal rule applies across Canada");
    // Y1 = $30K sits exactly on the threshold — watch state, not silence.
    expect(gst!.state).toBe("yellow");
  });

  it("surfaces CSBFP as financing (never labeled a grant)", () => {
    const csbfp = byId.get("grant-csbfp");
    expect(csbfp).toBeDefined();
    expect(csbfp!.typeChip).toBe("Financing");
  });

  it("attaches the honest risk read: Class 50 IEI and SR&ED are professional-required", () => {
    const class50 = byId.get("writeoff-cca-class-50");
    expect(class50!.risk).toBeDefined();
    expect(class50!.risk!.level).toBe("professional-required");
    const sred = byId.get("grant-sred");
    expect(sred!.risk).toBeDefined();
    expect(sred!.risk!.level).toBe("professional-required");
    expect(sred!.risk!.mitigation.length).toBeGreaterThan(0);
  });

  it("risk informs but never censors: risky levers still surface", () => {
    const homeOffice = byId.get("writeoff-home-office");
    expect(homeOffice).toBeDefined();
    expect(homeOffice!.risk!.level).toBe("caution");
    expect(homeOffice!.state).not.toBe("gray");
  });

  it("professional-required risk downgrades green to yellow (never green)", () => {
    for (const unlock of result.unlocks) {
      if (unlock.risk?.level === "professional-required") {
        expect(unlock.state).not.toBe("green");
      }
    }
  });

  it("never emits 'you qualify' language (compass, not GPS)", () => {
    for (const unlock of result.unlocks) {
      expect(unlock.payoff.toLowerCase()).not.toContain("you qualify");
      expect(unlock.why.toLowerCase()).not.toContain("you qualify");
    }
  });

  it("colors nodes: baseline green, GST fork visible, SR&ED incorporation path yellow", () => {
    expect(result.nodeStates["stage-0-employee-apprentice-baseline"]).toBe("green");
    expect(result.nodeStates["stage-1-sole-prop-activation"]).toBe("green");
    // $30K Y1 sits exactly ON the mandatory threshold — CRA's rule is exceed, not reach,
    // so this is a watch state, not a false-green "registered" claim (audit H3).
    expect(result.nodeStates["stage-2b-mandatory-gst-registration"]).toBe("yellow");
    expect(result.nodeStates["stage-2a-voluntary-gst-registration"]).toBe("yellow");
    // R&D tags make the liability/SR&ED incorporation branch worth modeling
    expect(result.nodeStates["stage-3b-incorporation-liability-sred"]).toBe("yellow");
    expect(result.nodeStates["branch-hire-first-employee"]).toBe("gray");
  });
});

describe("strategy rules engine — determinism and time-boxing", () => {
  it("same input → same output", () => {
    const a = evaluateProfile(gpuWorkstationProfile, { today: TODAY });
    const b = evaluateProfile(gpuWorkstationProfile, { today: TODAY });
    expect(a).toEqual(b);
  });

  it("lapsed incentive stops surfacing as enhanced (post-2027 clock)", () => {
    const after = evaluateProfile(gpuWorkstationProfile, { today: "2027-06-01" });
    const class50 = after.unlocks.find((u) => u.id === "writeoff-cca-class-50");
    expect(class50).toBeDefined();
    expect(class50!.expires).toBeUndefined();
    expect(class50!.payoff).not.toContain("100%");
    // Still yellow: the professional-required CCA risk read survives the incentive lapse.
    expect(class50!.state).toBe("yellow");
    expect(class50!.risk?.level).toBe("professional-required");
  });
});

describe("strategy rules engine — gating correctness", () => {
  it("does not surface AB-only programs for Ontario profiles", () => {
    const onProfile: EvaluationProfile = { ...gpuWorkstationProfile, province: "ON" };
    const result = evaluateProfile(onProfile, { today: TODAY });
    const ids = result.unlocks.map((u) => u.id);
    expect(ids).not.toContain("grant-alberta-innovates");
    expect(ids).not.toContain("grant-cajg");
    expect(ids).toContain("grant-on-innovation");
  });

  it("drops the SR&ED fork once the profile is already a CCPC", () => {
    const ccpcProfile: EvaluationProfile = { ...gpuWorkstationProfile, structure: "ccpc" };
    const result = evaluateProfile(ccpcProfile, { today: TODAY });
    const sred = result.unlocks.find((u) => u.id === "grant-sred");
    expect(sred).toBeDefined();
    expect(sred!.payoff).toContain("35%");
    expect(sred!.fork).toBeUndefined();
  });

  it("below-threshold revenue keeps GST as a green checkpoint, not a warning", () => {
    const lowRevenue: EvaluationProfile = { ...gpuWorkstationProfile, targetRevenueY1: 10000 };
    const result = evaluateProfile(lowRevenue, { today: TODAY });
    const gst = result.unlocks.find((u) => u.id === "compliance-gst-small-supplier");
    expect(gst).toBeDefined();
    expect(gst!.state).toBe("green");
  });
});

describe("strategy rules engine — profile and intake coverage", () => {
  it("blank default draft yields an honestly empty preview (no fake fullness)", () => {
    const profile = buildEvaluationProfile(defaultIntakeDraft());
    const result = evaluateProfile(profile, { today: TODAY });
    // No goals picked, no tags, no province → no goal cards, no venture/location claims.
    expect(result.unlocks.filter((u) => u.step === "goals")).toHaveLength(0);
    expect(result.unlocks.filter((u) => u.step === "venture")).toHaveLength(0);
    expect(result.unlocks.filter((u) => u.step === "refine")).toHaveLength(0);
    expect(result.unlocks.some((u) => u.id === "refine-projection")).toBe(false);
    expect(result.provinceCoverage).toBe("unknown");
  });

  it("a filled draft produces unlocks in every step group", () => {
    const draft = {
      ...defaultIntakeDraft(),
      goals: ["write-offs" as const],
      activityTags: ["Software / SaaS"],
      province: "AB" as const,
      targetRevenueY1: 40000,
    };
    const result = evaluateProfile(buildEvaluationProfile(draft), { today: TODAY });
    const steps = new Set(result.unlocks.map((u) => u.step));
    expect(steps.has("goals")).toBe(true);
    expect(steps.has("venture")).toBe(true);
    expect(steps.has("location")).toBe(true);
    expect(result.provinceCoverage).toBe("full");
  });

  it("federal-only province surfaces CA-wide entries with honest coverage", () => {
    const mbProfile: EvaluationProfile = { ...gpuWorkstationProfile, province: "MB" };
    const result = evaluateProfile(mbProfile, { today: TODAY });
    expect(result.provinceCoverage).toBe("federal-only");
    const ids = result.unlocks.map((u) => u.id);
    // Federal programs still surface…
    expect(ids).toContain("grant-sred");
    expect(ids).toContain("writeoff-cca-class-50");
    // …provincial-only programs never leak in.
    expect(ids).not.toContain("grant-alberta-innovates");
    expect(ids).not.toContain("grant-on-innovation");
    expect(ids).not.toContain("compliance-bc-pst");
  });

  it("representative profiles evaluate without error and yield unlocks (S2.5.4h: no archetypes)", () => {
    const profiles: EvaluationProfile[] = [
      // A sole-prop apprentice profile with trades + software tags.
      {
        goals: ["discover-now"],
        ventureType: "service",
        activityTags: ["Trades", "Software / SaaS"],
        province: "AB",
        employmentStatus: "apprentice",
        structure: "sole-prop",
        targetRevenueY1: 40_000,
        targetRevenueY3: 120_000,
        hireFirst: false,
        capitalPurchasePlanned: true,
      },
      {
        goals: ["scale-ccpc"],
        ventureType: "product",
        activityTags: ["Software / SaaS", "AI / ML / R&D"],
        province: "BC",
        employmentStatus: "employee",
        structure: "ccpc",
        targetRevenueY1: 75_000,
        targetRevenueY3: 220_000,
        hireFirst: false,
        capitalPurchasePlanned: false,
      },
      {
        goals: ["replace-income"],
        ventureType: "service",
        activityTags: ["Consulting"],
        province: "ON",
        employmentStatus: "self-employed",
        structure: "sole-prop-gst",
        targetRevenueY1: 90_000,
        targetRevenueY3: 150_000,
        hireFirst: true,
        capitalPurchasePlanned: false,
      },
    ];
    for (const profile of profiles) {
      const result = evaluateProfile(profile, { today: TODAY });
      expect(result.unlocks.length).toBeGreaterThan(0);
    }
  });
});
