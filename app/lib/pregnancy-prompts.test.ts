import { describe, it, expect } from "vitest";
import {
  buildPregnancySystemPrompt,
  buildPregnancyUserMessage,
  validatePregnancyWorkout,
  buildCannedSession,
  resolveStructure,
} from "./pregnancy-prompts";
import type { Movement } from "@/lib/movements/types";

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

describe("resolveStructure — canonical names from the pool", () => {
  it("uses the pool's name/category, not the model's", () => {
    const poolBySlug = new Map(POOL.map((m) => [m.slug, m]));
    const parsed = {
      structure: [
        { slug: "glute_bridge", movement: "MODEL RENAMED THIS", prescription: "2x10", note: "n" },
      ],
    };
    const items = resolveStructure(parsed, poolBySlug);
    expect(items[0].movement).toBe("Name of glute_bridge");
    expect(items[0].prescription).toBe("2x10");
  });
});

describe("prompt content", () => {
  it("system prompt forbids inventing/renaming and requires slugs", () => {
    const p = buildPregnancySystemPrompt().toLowerCase();
    expect(p).toContain("slug");
    expect(p).toContain("only use movements from the candidate list");
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
});
