import { describe, it, expect } from "vitest";
import { filterByFocus, isFocusKey, FOCUS_OPTIONS } from "./focusGroups";
import type { Movement } from "./types";

function mv(over: Partial<Movement> & Pick<Movement, "slug">): Movement {
  return {
    name: over.slug,
    category: "strength",
    min_stage: "t1_early",
    max_stage: "t3_late",
    focus_tags: [],
    equipment: [],
    exclusion_flags: [],
    cues: null,
    modifications: null,
    benefit: null,
    ...over,
  };
}

const POOL: Movement[] = [
  mv({ slug: "wall_pushup", category: "strength", focus_tags: ["chest", "shoulders"] }),
  mv({ slug: "goblet_squat", category: "strength", focus_tags: ["legs", "glutes"] }),
  mv({ slug: "brisk_walk", category: "walking", focus_tags: ["aerobic"] }),
  mv({ slug: "pelvic_floor_activation", category: "pelvic_floor", focus_tags: ["pelvic_floor"] }),
  mv({ slug: "warmup_cooldown_general", category: "education", focus_tags: ["education"] }),
  mv({ slug: "side_lying_breathing", category: "breathing", focus_tags: ["recovery"] }),
];

describe("filterByFocus", () => {
  it("full_body returns the pool unchanged", () => {
    expect(filterByFocus(POOL, "full_body").map((m) => m.slug)).toEqual(
      POOL.map((m) => m.slug),
    );
  });

  it("upper_body matches upper tags and retains pelvic_floor + education", () => {
    const slugs = filterByFocus(POOL, "upper_body").map((m) => m.slug).sort();
    expect(slugs).toEqual(
      ["wall_pushup", "pelvic_floor_activation", "warmup_cooldown_general"].sort(),
    );
    // Not the squat, walk, or breathing.
    expect(slugs).not.toContain("goblet_squat");
    expect(slugs).not.toContain("brisk_walk");
    expect(slugs).not.toContain("side_lying_breathing");
  });

  it("cardio matches aerobic and still retains pelvic_floor + education (never breathing/walking beyond the tag match)", () => {
    const slugs = filterByFocus(POOL, "cardio").map((m) => m.slug).sort();
    expect(slugs).toEqual(
      ["brisk_walk", "pelvic_floor_activation", "warmup_cooldown_general"].sort(),
    );
  });

  it("always retains pelvic_floor and education even when no tag matches", () => {
    const onlyPfEd = filterByFocus(
      [
        mv({ slug: "pf", category: "pelvic_floor", focus_tags: ["pelvic_floor"] }),
        mv({ slug: "ed", category: "education", focus_tags: ["education"] }),
        mv({ slug: "lonely_walk", category: "walking", focus_tags: ["aerobic"] }),
      ],
      "upper_body",
    ).map((m) => m.slug);
    expect(onlyPfEd.sort()).toEqual(["ed", "pf"].sort());
  });
});

describe("isFocusKey", () => {
  it("accepts the known keys, rejects others", () => {
    FOCUS_OPTIONS.forEach((k) => expect(isFocusKey(k)).toBe(true));
    expect(isFocusKey("hiit")).toBe(false);
    expect(isFocusKey("")).toBe(false);
    expect(isFocusKey(undefined)).toBe(false);
  });
});
