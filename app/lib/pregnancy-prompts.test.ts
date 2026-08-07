import { describe, it, expect } from "vitest";
import {
  buildPregnancySystemPrompt,
  buildPregnancyUserMessage,
  validatePregnancyWorkout,
  buildCannedSession,
  resolveStructure,
  isLoadedMovement,
  loadedFloorFor,
} from "./pregnancy-prompts";
import type { Movement } from "@/lib/movements/types";
import { getIntensityCap } from "@/lib/stages/pregnancyStages";

function mv(over: Partial<Movement> & Pick<Movement, "slug">): Movement {
  return {
    name: `Name of ${over.slug}`,
    category: "strength",
    min_stage: "t1_early",
    max_stage: "t3_late",
    focus_tags: [],
    equipment: [],
    exclusion_flags: [],
    cues: "a cue",
    modifications: null,
    benefit: null,
    ...over,
  };
}

const POOL: Movement[] = [
  mv({ slug: "diaphragmatic_breathing_360", category: "breathing" }),
  mv({ slug: "pelvic_floor_activation", category: "pelvic_floor" }),
  mv({ slug: "glute_bridge", category: "strength" }),
  mv({ slug: "brisk_walk_moderate", category: "walking" }),
  mv({ slug: "warmup_cooldown_general", category: "education" }),
];
const POOL_SLUGS = new Set(POOL.map((m) => m.slug));

describe("validatePregnancyWorkout", () => {
  it("accepts a response whose slugs are all in the pool", () => {
    const parsed = {
      structure: [
        { slug: "glute_bridge", prescription: "2x10", note: "x" },
        { slug: "pelvic_floor_activation", prescription: "3x5", note: "y" },
      ],
    };
    const r = validatePregnancyWorkout(parsed, POOL_SLUGS);
    expect(r.valid).toBe(true);
    expect(r.badSlugs).toEqual([]);
    expect(r.slugs).toEqual(["glute_bridge", "pelvic_floor_activation"]);
  });

  it("rejects a response containing a slug outside the pool", () => {
    const parsed = {
      structure: [
        { slug: "glute_bridge", prescription: "2x10", note: "x" },
        { slug: "barbell_back_squat", prescription: "5x5", note: "not vetted" },
      ],
    };
    const r = validatePregnancyWorkout(parsed, POOL_SLUGS);
    expect(r.valid).toBe(false);
    expect(r.badSlugs).toContain("barbell_back_squat");
  });

  it("rejects an empty or missing structure (fail closed)", () => {
    expect(validatePregnancyWorkout({ structure: [] }, POOL_SLUGS).valid).toBe(false);
    expect(validatePregnancyWorkout({}, POOL_SLUGS).valid).toBe(false);
    expect(validatePregnancyWorkout(null, POOL_SLUGS).valid).toBe(false);
  });

  it("rejects an item missing a slug", () => {
    const r = validatePregnancyWorkout(
      { structure: [{ prescription: "2x10" }] },
      POOL_SLUGS,
    );
    expect(r.valid).toBe(false);
  });
});

describe("buildCannedSession", () => {
  it("yields only pool slugs, ordered, sized to the session length", () => {
    const canned = buildCannedSession(POOL, { time: 20 });
    expect(canned.structure.length).toBe(4);
    canned.structure.forEach((s) => expect(POOL_SLUGS.has(s.slug)).toBe(true));
    // Education first, per the fixed category order.
    expect(canned.structure[0].slug).toBe("warmup_cooldown_general");
  });

  it("shapes each item (strength -> sets, breathing -> duration)", () => {
    const canned = buildCannedSession(POOL, { time: 60 });
    const strength = canned.structure.find((s) => s.slug === "glute_bridge");
    const breathing = canned.structure.find((s) => s.slug === "diaphragmatic_breathing_360");
    expect(strength?.sets).toBeGreaterThan(0);
    expect(breathing?.durationSeconds).toBeGreaterThan(0);
    expect(breathing?.sets).toBe(0);
  });

  it("is deterministic (same input -> same output)", () => {
    const a = buildCannedSession(POOL, { time: 40 });
    const b = buildCannedSession(POOL, { time: 40 });
    expect(a).toEqual(b);
  });

  it("never exceeds the pool size", () => {
    const canned = buildCannedSession(POOL.slice(0, 2), { time: 60 });
    expect(canned.structure.length).toBe(2);
  });
});

describe("resolveStructure — canonical names + shaped prescriptions", () => {
  const poolBySlug = new Map(POOL.map((m) => [m.slug, m]));

  it("uses the pool's name (model cannot rename) and the model's numbers", () => {
    const parsed = {
      structure: [
        { slug: "glute_bridge", movement: "MODEL RENAMED THIS", sets: 3, reps: "10", intensity: "controlled", note: "n" },
      ],
    };
    const items = resolveStructure(parsed, poolBySlug);
    expect(items[0].movement).toBe("Name of glute_bridge");
    expect(items[0].sets).toBe(3);
    expect(items[0].reps).toBe("10");
    expect(items[0].durationSeconds).toBe(0);
    expect(items[0].intensity).toBe("controlled");
  });

  it("shapes a time-based (breathing) movement as duration, not sets", () => {
    const parsed = {
      structure: [{ slug: "diaphragmatic_breathing_360", duration_seconds: 240, intensity: "slow" }],
    };
    const items = resolveStructure(parsed, poolBySlug);
    expect(items[0].sets).toBe(0);
    expect(items[0].reps).toBe("");
    expect(items[0].durationSeconds).toBe(240);
  });

  it("falls back to category defaults when the model omits numbers", () => {
    const parsed = { structure: [{ slug: "glute_bridge" }] };
    const items = resolveStructure(parsed, poolBySlug);
    expect(items[0].sets).toBeGreaterThan(0); // strength -> set-based default
    expect(items[0].intensity).not.toBe("");
  });
});

describe("prompt content", () => {
  it("system prompt forbids inventing/renaming and requires slugs", () => {
    const p = buildPregnancySystemPrompt().toLowerCase();
    expect(p).toContain("slug");
    expect(p).toContain("only use movements from the candidate list");
  });

  it("system prompt demands a real session and forbids authoring rationale", () => {
    const p = buildPregnancySystemPrompt().toLowerCase();
    expect(p).toContain("not a mobility flow");
    expect(p).toContain("never exceed the");
    expect(p).toContain("never invent your own physiological");
  });

  it("user message lists every candidate slug", () => {
    const msg = buildPregnancyUserMessage(POOL, {
      stageKey: "t1_early",
      gestationalWeek: 8,
      time: 40,
    });
    POOL.forEach((m) => expect(msg).toContain(m.slug));
    expect(msg).toContain("40 minutes");
  });

  it("user message carries the band prescription and vetted rationale verbatim", () => {
    const cap = getIntensityCap("t2_golden");
    const msg = buildPregnancyUserMessage(POOL, {
      stageKey: "t2_golden",
      gestationalWeek: 16,
      time: 40,
    });
    expect(msg).toContain(`RPE ${cap.rpeCeiling}`);
    expect(msg).toContain("strength-category movements");
    expect(msg).toContain("reps in reserve");
    expect(msg).toContain("talk test");
    // coachingRationale is vetted text; the model reads it, so it must appear verbatim.
    expect(msg).toContain(cap.coachingRationale.slice(0, 50));
  });
});

describe("buildCannedSession — deterministic strength floor from the band cap", () => {
  const mixedPool: Movement[] = [
    ...Array.from({ length: 6 }, (_, i) => mv({ slug: `str_${i}`, category: "strength" })),
    ...Array.from({ length: 2 }, (_, i) => mv({ slug: `edu_${i}`, category: "education" })),
    ...Array.from({ length: 2 }, (_, i) => mv({ slug: `bre_${i}`, category: "breathing" })),
    ...Array.from({ length: 2 }, (_, i) => mv({ slug: `mob_${i}`, category: "mobility" })),
    ...Array.from({ length: 2 }, (_, i) => mv({ slug: `pf_${i}`, category: "pelvic_floor" })),
    ...Array.from({ length: 2 }, (_, i) => mv({ slug: `walk_${i}`, category: "walking" })),
  ];

  it("includes at least strengthMovementTarget[0] strength movements (and at most [1])", () => {
    const cap = getIntensityCap("t2_golden"); // strengthMovementTarget [4, 6]
    const canned = buildCannedSession(mixedPool, {
      time: 60,
      context: { stageKey: "t2_golden", gestationalWeek: 16, time: 60 },
    });
    const strengthCount = canned.structure.filter((s) => s.category === "strength").length;
    expect(strengthCount).toBeGreaterThanOrEqual(cap.strengthMovementTarget[0]);
    expect(strengthCount).toBeLessThanOrEqual(cap.strengthMovementTarget[1]);
  });

  it("expresses the band's sets/reps/effort on strength items", () => {
    const cap = getIntensityCap("t2_golden");
    const canned = buildCannedSession(mixedPool, {
      time: 60,
      context: { stageKey: "t2_golden", gestationalWeek: 16, time: 60 },
    });
    const s = canned.structure.find((x) => x.category === "strength");
    expect(s?.sets).toBe(cap.setsPerMovement[0]);
    expect(s?.reps).toBe(`${cap.repRange[0]}-${cap.repRange[1]}`);
    expect(s?.intensity).toContain(`RPE ${cap.rpeCeiling}`);
  });

  it("without a band context applies no floor (back-compat)", () => {
    // total = 4 (time 20); category order fills education+breathing first, so a
    // small no-context session need not contain any strength.
    const poolSlugs = new Set(mixedPool.map((m) => m.slug));
    const canned = buildCannedSession(mixedPool, { time: 20 });
    expect(canned.structure.length).toBe(4);
    canned.structure.forEach((s) => expect(poolSlugs.has(s.slug)).toBe(true));
  });
});

describe("loaded-movement floor (equipment: dumbbell | band)", () => {
  const loadedPool: Movement[] = [
    mv({ slug: "db_squat", category: "strength", equipment: ["dumbbell"] }),
    mv({ slug: "db_row", category: "strength", equipment: ["dumbbell"] }),
    mv({ slug: "band_press", category: "strength", equipment: ["band"] }),
    mv({ slug: "bird_dog", category: "strength", equipment: [] }),
    mv({ slug: "glute_bridge_bw", category: "strength", equipment: [] }),
    mv({ slug: "clamshell", category: "strength", equipment: [] }),
    mv({ slug: "breath1", category: "breathing" }),
    mv({ slug: "walk1", category: "walking" }),
    mv({ slug: "edu1", category: "education" }),
  ];

  it("isLoadedMovement detects dumbbell/band, ignores bodyweight", () => {
    expect(isLoadedMovement(mv({ slug: "a", equipment: ["dumbbell"] }))).toBe(true);
    expect(isLoadedMovement(mv({ slug: "b", equipment: ["band", "mat"] }))).toBe(true);
    expect(isLoadedMovement(mv({ slug: "c", equipment: [] }))).toBe(false);
    expect(isLoadedMovement(mv({ slug: "d", equipment: ["mat"] }))).toBe(false);
  });

  it("an 'active' user with dumbbells available gets >= 2 loaded movements", () => {
    const canned = buildCannedSession(loadedPool, {
      time: 60,
      context: {
        stageKey: "t2_golden",
        gestationalWeek: 16,
        time: 60,
        priorActivityLevel: "active",
      },
    });
    const loadedSlugs = new Set(loadedPool.filter(isLoadedMovement).map((m) => m.slug));
    const loadedInSession = canned.structure.filter((s) => loadedSlugs.has(s.slug)).length;
    expect(loadedInSession).toBeGreaterThanOrEqual(2); // t2_golden active floor
  });

  it("a 'sedentary' user is not forced into loaded work (floor 0)", () => {
    const cap = getIntensityCap("t2_golden");
    expect(loadedFloorFor(loadedPool, cap, "sedentary")).toBe(0);
  });

  it("a user with no loaded equipment still gets a valid session (floor clamps to available)", () => {
    const bodyweightPool = loadedPool.map((m) => ({ ...m, equipment: [] as string[] }));
    const cap = getIntensityCap("t2_golden");
    expect(loadedFloorFor(bodyweightPool, cap, "active")).toBe(0);
    const canned = buildCannedSession(bodyweightPool, {
      time: 60,
      context: {
        stageKey: "t2_golden",
        gestationalWeek: 16,
        time: 60,
        priorActivityLevel: "active",
      },
    });
    expect(canned.structure.length).toBeGreaterThan(0);
  });

  it("validatePregnancyWorkout fails a response below the loaded floor, passes at/above", () => {
    const poolSlugs = new Set(loadedPool.map((m) => m.slug));
    const poolBySlug = new Map(loadedPool.map((m) => [m.slug, m]));

    const below = { structure: [{ slug: "bird_dog" }, { slug: "glute_bridge_bw" }] };
    const rBelow = validatePregnancyWorkout(below, poolSlugs, { poolBySlug, loadedFloor: 2 });
    expect(rBelow.valid).toBe(false);
    expect(rBelow.belowLoadedFloor).toBe(true);
    expect(rBelow.loadedCount).toBe(0);

    const meets = { structure: [{ slug: "db_squat" }, { slug: "band_press" }, { slug: "bird_dog" }] };
    const rMeets = validatePregnancyWorkout(meets, poolSlugs, { poolBySlug, loadedFloor: 2 });
    expect(rMeets.valid).toBe(true);
    expect(rMeets.loadedCount).toBe(2);
  });

  it("no loadedFloor opt -> loaded count not enforced (back-compat)", () => {
    const poolSlugs = new Set(loadedPool.map((m) => m.slug));
    const bodyweightOnly = { structure: [{ slug: "bird_dog" }] };
    expect(validatePregnancyWorkout(bodyweightOnly, poolSlugs).valid).toBe(true);
  });
});
