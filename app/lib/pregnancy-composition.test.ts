import { describe, it, expect } from "vitest";
import {
  planPregnancySession,
  composePregnancySession,
  activityTier,
  durationBucket,
} from "./pregnancy-composition";
import type { Movement } from "@/lib/movements/types";
import { getIntensityCap } from "@/lib/stages/pregnancyStages";
import type { FocusKey } from "@/lib/movements/focusGroups";

function mv(over: Partial<Movement> & Pick<Movement, "slug">): Movement {
  return {
    name: `Name of ${over.slug}`,
    category: "strength",
    min_stage: "t1_early",
    max_stage: "t3_late",
    focus_tags: [],
    equipment: [],
    exclusion_flags: [],
    movement_pattern: "none",
    movement_tier: "none",
    cues: "a cue",
    modifications: null,
    benefit: null,
    ...over,
  };
}

/** Two strength movements are redundant when they share pattern AND equipment. */
function redundantPair(a: Movement, b: Movement): boolean {
  return (
    a.movement_pattern === b.movement_pattern &&
    a.movement_pattern !== "none" &&
    a.equipment.some((e) => b.equipment.includes(e))
  );
}

const SUPPORT: Movement[] = [
  mv({ slug: "breath", category: "breathing", movement_pattern: "none" }),
  mv({ slug: "pelvic", category: "pelvic_floor", movement_pattern: "none" }),
  mv({ slug: "mob", category: "mobility", movement_pattern: "none" }),
];

describe("activity + duration bucketing", () => {
  it("maps the four screening levels onto three slot tiers", () => {
    expect(activityTier("athlete")).toBe("high");
    expect(activityTier("active")).toBe("high");
    expect(activityTier("light")).toBe("mid");
    expect(activityTier("sedentary")).toBe("low");
    expect(activityTier(null)).toBe("low"); // unknown -> conservative
  });

  it("maps session length onto the three columns", () => {
    expect(durationBucket(15)).toBe(20);
    expect(durationBucket(20)).toBe(20);
    expect(durationBucket(40)).toBe(40);
    expect(durationBucket(60)).toBe(60);
    expect(durationBucket(90)).toBe(60);
  });
});

describe("planPregnancySession — Change B slot table", () => {
  // A deep upper pool so pool depth never binds the table.
  const deep: Movement[] = [
    mv({ slug: "c_push_1", movement_tier: "compound", movement_pattern: "push" }),
    mv({ slug: "c_push_2", movement_tier: "compound", movement_pattern: "push" }),
    mv({ slug: "c_pull_1", movement_tier: "compound", movement_pattern: "pull" }),
    mv({ slug: "c_pull_2", movement_tier: "compound", movement_pattern: "pull" }),
    mv({ slug: "a_1", movement_tier: "accessory", movement_pattern: "isolation" }),
    mv({ slug: "a_2", movement_tier: "accessory", movement_pattern: "isolation" }),
    mv({ slug: "a_3", movement_tier: "accessory", movement_pattern: "pull" }),
    mv({ slug: "a_4", movement_tier: "accessory", movement_pattern: "push" }),
    ...SUPPORT,
  ];

  it("active + 60 yields 3 compounds and 2 accessories", () => {
    const plan = planPregnancySession({
      cap: getIntensityCap("t2_golden"), // floor 4 — does not inflate 3+2=5
      minutes: 60,
      priorActivityLevel: "active",
      gestationalWeek: 16,
      focusKey: "upper_body",
      pool: deep,
    });
    expect(plan.compounds).toBe(3);
    expect(plan.accessories).toBe(2);
    expect(plan.totalStrength).toBe(5);
    expect(plan.floorApplied).toBe(false);
  });

  it("active + 20 yields 1 compound and 1 accessory (no floor inflation at t3_late)", () => {
    const plan = planPregnancySession({
      cap: getIntensityCap("t3_late"), // floor 2 — 1+1=2 meets it exactly
      minutes: 20,
      priorActivityLevel: "active",
      gestationalWeek: 36,
      focusKey: "upper_body",
      pool: deep,
    });
    expect(plan.compounds).toBe(1);
    expect(plan.accessories).toBe(1);
    expect(plan.floorApplied).toBe(false);
  });

  it("inactive + 40 yields 1 compound and 2 accessories", () => {
    const plan = planPregnancySession({
      cap: getIntensityCap("t3_late"), // floor 2 — 1+2=3 meets it
      minutes: 40,
      priorActivityLevel: "sedentary",
      gestationalWeek: 36,
      focusKey: "upper_body",
      pool: deep,
    });
    expect(plan.compounds).toBe(1);
    expect(plan.accessories).toBe(2);
  });

  it("raises the total to the band floor and surfaces a notice (floor rule)", () => {
    const plan = planPregnancySession({
      cap: getIntensityCap("t2_golden"), // floor 4
      minutes: 20, // table active = 1C + 1A = 2, below the floor
      priorActivityLevel: "active",
      gestationalWeek: 17,
      focusKey: "upper_body",
      pool: deep,
    });
    expect(plan.totalStrength).toBe(4); // raised from 2 to the floor
    expect(plan.compounds).toBe(1);
    expect(plan.accessories).toBe(3); // floor made up with accessories
    expect(plan.floorApplied).toBe(true);
    expect(plan.notice).toContain("minimum");
    expect(plan.notice).toContain("17");
  });
});

describe("planPregnancySession — degrade, never fail (Change B pool limits)", () => {
  it("core focus at 60 minutes degrades rather than meeting 3C+2A", () => {
    // Core: only 2 compounds + 1 accessory exist (brief's verified depth).
    const corePool: Movement[] = [
      mv({ slug: "core_c1", movement_tier: "compound", movement_pattern: "core" }),
      mv({ slug: "core_c2", movement_tier: "compound", movement_pattern: "core" }),
      mv({ slug: "core_a1", movement_tier: "accessory", movement_pattern: "core" }),
      ...SUPPORT,
    ];
    const plan = planPregnancySession({
      cap: getIntensityCap("t2_golden"),
      minutes: 60,
      priorActivityLevel: "active",
      gestationalWeek: 16,
      focusKey: "core_pelvic_floor",
      pool: corePool,
    });
    expect(plan.tierDegraded).toBe(true);
    expect(plan.totalStrength).toBeLessThan(5); // can't reach 3C+2A
    expect(plan.degradeReason).toBeTruthy();
    expect(plan.notice).toBeTruthy();
  });
});

describe("composePregnancySession — structural rules (Changes C–E)", () => {
  const cap = getIntensityCap("t2_golden");

  function planFor(pool: Movement[], focusKey: FocusKey, minutes = 40) {
    return planPregnancySession({
      cap,
      minutes,
      priorActivityLevel: "active",
      gestationalWeek: 16,
      focusKey,
      pool,
    });
  }

  it("Change C: no two strength movements share both pattern and equipment", () => {
    const pool: Movement[] = [
      mv({ slug: "db_press_1", movement_tier: "compound", movement_pattern: "push", equipment: ["dumbbell"] }),
      mv({ slug: "db_press_2", movement_tier: "compound", movement_pattern: "push", equipment: ["dumbbell"] }),
      mv({ slug: "cable_pull", movement_tier: "compound", movement_pattern: "pull", equipment: ["cable"] }),
      mv({ slug: "db_pull_acc", movement_tier: "accessory", movement_pattern: "pull", equipment: ["dumbbell"] }),
      mv({ slug: "band_iso_acc", movement_tier: "accessory", movement_pattern: "isolation", equipment: ["band"] }),
      ...SUPPORT,
    ];
    const plan = planFor(pool, "upper_body");
    // Model tries to pick BOTH dumbbell pushes (the 166 defect).
    const composed = composePregnancySession(
      ["db_press_1", "db_press_2", "db_pull_acc", "band_iso_acc"],
      pool,
      plan,
      { focusKey: "upper_body", equipmentList: ["dumbbell", "band", "cable", "machine"] },
    );
    const strength = composed.movements.filter((m) => m.category === "strength");
    for (let i = 0; i < strength.length; i++) {
      for (let j = i + 1; j < strength.length; j++) {
        expect(redundantPair(strength[i], strength[j])).toBe(false);
      }
    }
  });

  it("Change E: upper_body yields at least one push and one pull", () => {
    const pool: Movement[] = [
      mv({ slug: "push_c", movement_tier: "compound", movement_pattern: "push", equipment: ["dumbbell"] }),
      mv({ slug: "pull_c", movement_tier: "compound", movement_pattern: "pull", equipment: ["cable"] }),
      mv({ slug: "push_a", movement_tier: "accessory", movement_pattern: "push", equipment: ["band"] }),
      mv({ slug: "pull_a", movement_tier: "accessory", movement_pattern: "pull", equipment: ["band"] }),
      ...SUPPORT,
    ];
    const plan = planFor(pool, "upper_body");
    // Model picks only pushes — composition must repair for balance.
    const composed = composePregnancySession(["push_c", "push_a"], pool, plan, {
      focusKey: "upper_body",
      equipmentList: ["dumbbell", "band"],
    });
    const patterns = composed.movements
      .filter((m) => m.category === "strength")
      .map((m) => m.movement_pattern);
    expect(patterns).toContain("push");
    expect(patterns).toContain("pull");
  });

  it("Change D: full gym yields >= ceil(slots/2) cable/machine movements", () => {
    const pool: Movement[] = [
      mv({ slug: "push_cable", movement_tier: "compound", movement_pattern: "push", equipment: ["cable"] }),
      mv({ slug: "pull_machine", movement_tier: "compound", movement_pattern: "pull", equipment: ["machine"] }),
      mv({ slug: "push_db", movement_tier: "compound", movement_pattern: "push", equipment: ["dumbbell"] }),
      mv({ slug: "pull_cable", movement_tier: "compound", movement_pattern: "pull", equipment: ["cable"] }),
      mv({ slug: "iso_cable", movement_tier: "accessory", movement_pattern: "isolation", equipment: ["cable"] }),
      mv({ slug: "iso_db", movement_tier: "accessory", movement_pattern: "isolation", equipment: ["dumbbell"] }),
      mv({ slug: "pull_band", movement_tier: "accessory", movement_pattern: "pull", equipment: ["band"] }),
      ...SUPPORT,
    ];
    const plan = planFor(pool, "upper_body"); // 2C + 2A at t2_golden active/40
    expect(plan.totalStrength).toBe(4);
    // Model picks all dumbbell/band — composition must swap toward cable/machine.
    const composed = composePregnancySession(["push_db", "iso_db", "pull_band"], pool, plan, {
      focusKey: "upper_body",
      equipmentList: ["chair", "wall", "band", "dumbbell", "bench", "cable", "machine", "bike"],
    });
    const util = composed.movements.filter(
      (m) => m.category === "strength" && (m.equipment.includes("cable") || m.equipment.includes("machine")),
    );
    expect(util.length).toBeGreaterThanOrEqual(2);
  });

  it("Change E degrades, never fails, when squat depth is missing (t3_late lower body)", () => {
    const pool: Movement[] = [
      mv({ slug: "hinge_c1", movement_tier: "compound", movement_pattern: "hinge" }),
      mv({ slug: "hinge_c2", movement_tier: "compound", movement_pattern: "hinge" }),
      mv({ slug: "hinge_a1", movement_tier: "accessory", movement_pattern: "hinge" }),
      ...SUPPORT,
    ];
    const plan = planPregnancySession({
      cap: getIntensityCap("t3_late"),
      minutes: 60,
      priorActivityLevel: "active",
      gestationalWeek: 36,
      focusKey: "lower_body",
      pool,
    });
    // No squat exists — must not throw, must still return a session.
    const composed = composePregnancySession(["hinge_c1", "hinge_c2", "hinge_a1"], pool, plan, {
      focusKey: "lower_body",
      equipmentList: [],
    });
    expect(composed.movements.length).toBeGreaterThan(0);
    const patterns = composed.movements
      .filter((m) => m.category === "strength")
      .map((m) => m.movement_pattern);
    expect(patterns).toContain("hinge");
    expect(patterns).not.toContain("squat"); // none in the pool — gracefully absent
    expect(plan.tierDegraded).toBe(true);
  });

  it("respects the pattern cap of 2 per movement pattern", () => {
    const pool: Movement[] = [
      mv({ slug: "push_a", movement_tier: "compound", movement_pattern: "push", equipment: ["dumbbell"] }),
      mv({ slug: "push_b", movement_tier: "compound", movement_pattern: "push", equipment: ["cable"] }),
      mv({ slug: "push_c", movement_tier: "compound", movement_pattern: "push", equipment: ["machine"] }),
      mv({ slug: "push_d", movement_tier: "accessory", movement_pattern: "push", equipment: ["band"] }),
      ...SUPPORT,
    ];
    const plan = planFor(pool, "full_body");
    const composed = composePregnancySession(
      ["push_a", "push_b", "push_c", "push_d"],
      pool,
      plan,
      { focusKey: "full_body", equipmentList: ["dumbbell", "cable", "machine", "band"] },
    );
    const pushes = composed.movements.filter((m) => m.movement_pattern === "push");
    expect(pushes.length).toBeLessThanOrEqual(2);
  });
});
