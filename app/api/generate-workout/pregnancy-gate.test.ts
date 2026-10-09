import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * Gate + auth tests for the pregnancy branch of POST /api/generate-workout.
 *
 * Table-aware Supabase mock + OpenAI mock. For the 409 gate cases we also assert
 * OpenAI is never called (we block before spending a completion). The pure
 * validation/canned logic is covered in pregnancy-prompts.test.ts.
 */

const { state, create } = vi.hoisted(() => ({
  state: { cfg: {} as Record<string, unknown>, inserts: [] as Array<{ table: string; payload: unknown }> },
  create: vi.fn(),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    auth: { getUser: async () => state.cfg.getUser },
    from: (table: string) => {
      const result = state.cfg[table];
      const obj: Record<string, unknown> = {
        select: () => obj,
        eq: () => obj,
        order: () => obj,
        limit: () => obj,
        insert: (payload: unknown) => {
          state.inserts.push({ table, payload });
          return obj;
        },
        maybeSingle: async () => result,
        single: async () => result,
        then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
          Promise.resolve(result).then(res, rej),
      };
      return obj;
    },
  }),
}));

vi.mock("openai", () => ({
  default: class {
    chat = { completions: { create } };
  },
}));

import { POST } from "./route";

/** A valid future due date (~gestational week 20 -> t2_golden). */
function futureDate(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
const DUE = futureDate(140);
/** UTC today — accepted by the check-in gate's date validation. */
const TODAY = new Date().toISOString().slice(0, 10);

const ALL_NO = {
  bleeding: "no",
  fluidLeak: "no",
  contractions: "no",
  chestPain: "no",
  dizziness: "no",
  breathlessness: "no",
};

const POOL_ROWS = [
  { slug: "glute_bridge", name: "Glute bridge", category: "strength", min_stage: "t1_early", max_stage: "t3_late", focus_tags: [], equipment: [], exclusion_flags: [], cues: "c", modifications: null, benefit: null },
  { slug: "diaphragmatic_breathing_360", name: "Breathing", category: "breathing", min_stage: "t1_early", max_stage: "t3_late", focus_tags: [], equipment: [], exclusion_flags: [], cues: "c", modifications: null, benefit: null },
  { slug: "warmup_cooldown_general", name: "Warm-up", category: "education", min_stage: "t1_early", max_stage: "t3_late", focus_tags: [], equipment: [], exclusion_flags: [], cues: "c", modifications: null, benefit: null },
];
const POOL_SLUGS = new Set(POOL_ROWS.map((m) => m.slug));

const HAPPY_CONTENT = JSON.stringify({
  focus: "F",
  intensity: "easy",
  structure: [{ slug: "glute_bridge", prescription: "2x10", note: "x" }],
  why: "w",
});
const OUT_OF_POOL_CONTENT = JSON.stringify({
  focus: "F",
  intensity: "easy",
  structure: [{ slug: "barbell_back_squat", prescription: "5x5", note: "nope" }],
  why: "w",
});

/** Richer, focus-tagged pool for the focus tests (DUE ~ t2_golden). */
function m(over: Record<string, unknown>) {
  return {
    name: over.slug,
    min_stage: "t1_early",
    max_stage: "t3_late",
    equipment: [],
    exclusion_flags: [],
    movement_pattern: "none",
    movement_tier: "none",
    cues: "c",
    modifications: null,
    benefit: null,
    ...over,
  };
}
const FOCUS_POOL = [
  m({ slug: "wall_pushup", category: "strength", focus_tags: ["chest", "shoulders"] }),
  m({ slug: "incline_pushup", category: "strength", focus_tags: ["chest", "shoulders"] }),
  m({ slug: "band_row", category: "strength", focus_tags: ["back"], equipment: ["band"] }),
  m({ slug: "glute_bridge", category: "strength", focus_tags: ["glutes"] }),
  m({ slug: "brisk_walk", category: "walking", focus_tags: ["aerobic"] }),
  m({ slug: "pelvic_floor_activation", category: "pelvic_floor", focus_tags: ["pelvic_floor"] }),
  m({ slug: "warmup_cooldown_general", category: "education", focus_tags: ["education"] }),
];
const contentFor = (slug: string) =>
  JSON.stringify({ focus: "F", intensity: "easy", structure: [{ slug, sets: 2, reps: "10", note: "x" }], why: "w" });

function req(body: Record<string, unknown>, opts: { auth?: string | null } = {}) {
  const auth = opts.auth === undefined ? "Bearer good" : opts.auth;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (auth) headers["Authorization"] = auth;
  return new Request("http://localhost/api/generate-workout", {
    method: "POST",
    headers,
    body: JSON.stringify({ date: TODAY, ...body }),
  });
}

function workoutInsert() {
  const rec = state.inserts.find((i) => i.table === "workouts");
  return rec ? (rec.payload as unknown[])[0] as Record<string, unknown> : null;
}

beforeEach(() => {
  state.inserts = [];
  create.mockReset();
  create.mockImplementation(async () => ({
    choices: [{ message: { content: state.cfg.openaiContent } }],
  }));
  state.cfg = {
    getUser: { data: { user: { id: "u1" } }, error: null },
    user_profiles: { data: { training_mode: "pregnancy", stage_anchor_date: DUE }, error: null },
    pregnancy_screening: { data: { screening_result: "clear" }, error: null },
    daily_checkins: { data: { red_flags: { answers: ALL_NO } }, error: null },
    movements: { data: POOL_ROWS, error: null },
    workouts: { data: { id: "w1" }, error: null },
    events: { data: null, error: null },
    openaiContent: HAPPY_CONTENT,
  };
});

describe("auth (both branches)", () => {
  it("401 with no Authorization header", async () => {
    const res = await POST(req({ time: 40, equipment: [] }, { auth: null }));
    expect(res.status).toBe(401);
    expect(create).not.toHaveBeenCalled();
  });

  it("401 with an invalid token", async () => {
    state.cfg.getUser = { data: { user: null }, error: { message: "bad" } };
    const res = await POST(req({ time: 40, equipment: [] }));
    expect(res.status).toBe(401);
  });

  it("a body user_id differing from the token is ignored (token wins)", async () => {
    const res = await POST(req({ user_id: "attacker", time: 40, equipment: [] }));
    expect(res.status).toBe(200);
    expect(workoutInsert()?.user_id).toBe("u1");
  });
});

describe("pregnancy gate — 409, OpenAI never called", () => {
  const expect409 = async (res: Response) => {
    expect(res.status).toBe(409);
    expect(create).not.toHaveBeenCalled();
  };

  it("no screening row", async () => {
    state.cfg.pregnancy_screening = { data: null, error: null };
    await expect409(await POST(req({ time: 40, equipment: [] })));
  });

  it("hard_stop", async () => {
    state.cfg.pregnancy_screening = { data: { screening_result: "hard_stop" }, error: null };
    await expect409(await POST(req({ time: 40, equipment: [] })));
  });

  it("provider_conversation", async () => {
    state.cfg.pregnancy_screening = { data: { screening_result: "provider_conversation" }, error: null };
    await expect409(await POST(req({ time: 40, equipment: [] })));
  });

  it("bad anchor (null stage_anchor_date)", async () => {
    state.cfg.user_profiles = { data: { training_mode: "pregnancy", stage_anchor_date: null }, error: null };
    await expect409(await POST(req({ time: 40, equipment: [] })));
  });

  it("empty pool (no movements)", async () => {
    state.cfg.movements = { data: [], error: null };
    await expect409(await POST(req({ time: 40, equipment: [] })));
  });

  it("no daily check-in row for today", async () => {
    state.cfg.daily_checkins = { data: null, error: null };
    await expect409(await POST(req({ time: 40, equipment: [] })));
  });

  it("daily check-in read error (fail closed)", async () => {
    state.cfg.daily_checkins = { data: null, error: { message: "boom" } };
    await expect409(await POST(req({ time: 40, equipment: [] })));
  });

  it("today's check-in has a red flag", async () => {
    state.cfg.daily_checkins = {
      data: { red_flags: { answers: { ...ALL_NO, bleeding: "yes" } } },
      error: null,
    };
    await expect409(await POST(req({ time: 40, equipment: [] })));
  });

  it("missing/invalid date on the request", async () => {
    await expect409(await POST(req({ time: 40, equipment: [], date: "nope" })));
  });
});

describe("pregnancy generation — clear", () => {
  it("clear + in-pool model response -> 200, persisted slugs all in pool", async () => {
    const res = await POST(req({ time: 40, equipment: [] }));
    expect(res.status).toBe(200);
    expect((await res.json()).id).toBe("w1");

    const payload = workoutInsert()!;
    const structure = payload.structure as Array<{ slug: string }>;
    expect(structure.length).toBeGreaterThan(0);
    structure.forEach((s) => expect(POOL_SLUGS.has(s.slug)).toBe(true));
    expect((payload.generation_params as Record<string, unknown>).source).toBe("model");
    expect((payload.generation_params as Record<string, unknown>).mode).toBe("pregnancy");
  });

  it("out-of-pool response twice -> deterministic fallback, still in-pool, logged", async () => {
    state.cfg.openaiContent = OUT_OF_POOL_CONTENT;
    const res = await POST(req({ time: 40, equipment: [] }));
    expect(res.status).toBe(200);
    expect(create).toHaveBeenCalledTimes(2); // one retry

    const payload = workoutInsert()!;
    const structure = payload.structure as Array<{ slug: string }>;
    structure.forEach((s) => expect(POOL_SLUGS.has(s.slug)).toBe(true));
    expect((payload.generation_params as Record<string, unknown>).source).toBe("fallback");
    expect(state.inserts.some(
      (i) => i.table === "events" && (i.payload as Record<string, unknown>).event_name === "pregnancy_workout_fallback",
    )).toBe(true);
  });

  it("default focus is full_body, persisted", async () => {
    await POST(req({ time: 40, equipment: [] }));
    const gp = workoutInsert()!.generation_params as Record<string, unknown>;
    expect(gp.focus).toBe("full_body");
    expect(gp.focus_fallback).toBe(false);
  });
});

describe("pregnancy focus — preference, never a gate", () => {
  const gp = () => workoutInsert()!.generation_params as Record<string, unknown>;

  it("cardio relaxes the strength floor and runs as a filter (no glute_bridge in pool)", async () => {
    state.cfg.movements = { data: FOCUS_POOL, error: null };
    state.cfg.openaiContent = contentFor("brisk_walk");
    const res = await POST(req({ time: 40, equipment: ["band"], focus: "cardio" }));
    expect(res.status).toBe(200);
    const params = gp();
    expect(params.focus).toBe("cardio");
    expect(params.focus_fallback).toBe(false);
    expect(params.focus_floor_relaxed).toBe(true);
    // Filtered to cardio + retained pelvic_floor/education; strength squat dropped.
    const poolSlugs = params.pool_slugs as string[];
    expect(poolSlugs).toContain("brisk_walk");
    expect(poolSlugs).toContain("pelvic_floor_activation");
    expect(poolSlugs).toContain("warmup_cooldown_general");
    expect(poolSlugs).not.toContain("glute_bridge");
  });

  it("upper_body that can't meet the strength floor falls back to the full pool (never 409)", async () => {
    state.cfg.movements = { data: FOCUS_POOL, error: null };
    state.cfg.openaiContent = contentFor("glute_bridge"); // in the full pool
    const res = await POST(req({ time: 40, equipment: ["band"], focus: "upper_body" }));
    expect(res.status).toBe(200); // NOT 409
    const params = gp();
    expect(params.focus).toBe("upper_body");
    expect(params.focus_fallback).toBe(true);
    // Fell back to the full pool — the squat (not upper) is present.
    expect(params.pool_slugs as string[]).toContain("glute_bridge");
  });

  it("an unknown focus is coerced to full_body (never 409)", async () => {
    state.cfg.movements = { data: FOCUS_POOL, error: null };
    state.cfg.openaiContent = contentFor("glute_bridge");
    const res = await POST(req({ time: 40, equipment: ["band"], focus: "hiit" }));
    expect(res.status).toBe(200);
    expect(gp().focus).toBe("full_body");
  });
});

describe("pregnancy notes + equipment preset", () => {
  const gp = () => workoutInsert()!.generation_params as Record<string, unknown>;

  it("notes do NOT change which movements are eligible (same pool_slugs)", async () => {
    const withNotes = await POST(req({ time: 40, equipment: [], notes: "prefer upper body, skip squats" }));
    expect(withNotes.status).toBe(200);
    const poolWith = gp().pool_slugs as string[];

    state.inserts = [];
    const without = await POST(req({ time: 40, equipment: [] }));
    expect(without.status).toBe(200);
    const poolWithout = gp().pool_slugs as string[];

    expect([...poolWith].sort()).toEqual([...poolWithout].sort());
    expect(gp().notes).toBeDefined();
  });

  it("resolves + persists the equipment preset (server-side), ignoring the sent array", async () => {
    // Client sends a stale/empty array; the preset key wins server-side.
    const res = await POST(req({ time: 40, equipment: [], equipmentPreset: "dumbbells_only" }));
    expect(res.status).toBe(200);
    expect(gp().equipment_preset).toBe("dumbbells_only");
    expect(gp().equipment).toEqual(["chair", "wall", "dumbbell"]);
  });

  it("notes are capped at 500 chars in generation_params", async () => {
    const long = "x".repeat(900);
    await POST(req({ time: 40, equipment: [], notes: long }));
    expect((gp().notes as string).length).toBe(500);
  });
});

/**
 * Session composition (Changes A–E). A full-gym upper-body pool with split
 * warm-up/cool-down rows, tiered + patterned strength, and the model behaving
 * like the real workout-166 response (two dumbbell pushes, no cable/machine).
 */
const COMPOSE_POOL = [
  m({ slug: "warmup_general", category: "education", focus_tags: ["education"] }),
  m({ slug: "cooldown_general", category: "education", focus_tags: ["education"] }),
  m({ slug: "pelvic_floor_activation", category: "pelvic_floor", focus_tags: ["pelvic_floor"] }),
  m({ slug: "seated_db_shoulder_press", category: "strength", focus_tags: ["shoulders"], equipment: ["dumbbell"], movement_tier: "compound", movement_pattern: "push" }),
  m({ slug: "incline_db_press", category: "strength", focus_tags: ["chest"], equipment: ["dumbbell"], movement_tier: "compound", movement_pattern: "push" }),
  m({ slug: "cable_chest_press", category: "strength", focus_tags: ["chest"], equipment: ["cable"], movement_tier: "compound", movement_pattern: "push" }),
  m({ slug: "lat_pulldown", category: "strength", focus_tags: ["back"], equipment: ["cable"], movement_tier: "compound", movement_pattern: "pull" }),
  m({ slug: "seated_row_machine", category: "strength", focus_tags: ["back"], equipment: ["machine"], movement_tier: "compound", movement_pattern: "pull" }),
  m({ slug: "db_biceps_curl", category: "strength", focus_tags: ["upper_body"], equipment: ["dumbbell"], movement_tier: "accessory", movement_pattern: "isolation" }),
  m({ slug: "cable_curl", category: "strength", focus_tags: ["upper_body"], equipment: ["cable"], movement_tier: "accessory", movement_pattern: "isolation" }),
  m({ slug: "band_row", category: "strength", focus_tags: ["back"], equipment: ["band"], movement_tier: "accessory", movement_pattern: "pull" }),
];

/** The workout-166 model response: two dumbbell pushes, no cable/machine. */
const WORKOUT_166_CONTENT = JSON.stringify({
  focus: "Upper body",
  intensity: "RPE 7",
  structure: [
    { slug: "seated_db_shoulder_press", sets: 3, reps: "10" },
    { slug: "incline_db_press", sets: 3, reps: "10" },
    { slug: "db_biceps_curl", sets: 2, reps: "12" },
    { slug: "band_row", sets: 2, reps: "12" },
    { slug: "pelvic_floor_activation" },
  ],
  why: "w",
});

describe("pregnancy composition — warm-up/cool-down slots + repairs", () => {
  const gp = () => workoutInsert()!.generation_params as Record<string, unknown>;
  const structureOf = () => workoutInsert()!.structure as Array<Record<string, unknown>>;

  beforeEach(() => {
    state.cfg.movements = { data: COMPOSE_POOL, error: null };
    state.cfg.pregnancy_screening = {
      data: { screening_result: "clear", prior_activity_level: "active" },
      error: null,
    };
    state.cfg.openaiContent = WORKOUT_166_CONTENT;
  });

  it("warm-up and cool-down appear exactly once, first and last", async () => {
    const res = await POST(req({ time: 40, equipmentPreset: "full_gym", focus: "upper_body" }));
    expect(res.status).toBe(200);
    const structure = structureOf();
    expect(structure[0].slug).toBe("warmup_general");
    expect(structure[structure.length - 1].slug).toBe("cooldown_general");
    const warmups = structure.filter((s) => s.slug === "warmup_general");
    const cooldowns = structure.filter((s) => s.slug === "cooldown_general");
    expect(warmups.length).toBe(1);
    expect(cooldowns.length).toBe(1);
    // No OTHER education movement slipped into the body.
    const edu = structure.filter((s) => s.category === "education");
    expect(edu.length).toBe(2);
  });

  it("regression (workout 166): the three defects are now fixed", async () => {
    const res = await POST(req({ time: 40, equipmentPreset: "full_gym", focus: "upper_body" }));
    expect(res.status).toBe(200);
    const structure = structureOf();
    const strength = structure.filter((s) => s.category === "strength");

    // Defect 1 — warm-up/cool-down bookend once each (not the same row twice).
    expect(structure[0].slug).toBe("warmup_general");
    expect(structure[structure.length - 1].slug).toBe("cooldown_general");

    // Defect 2 — equipment preset now influences selection: at least half the
    // strength slots use cable/machine at a full gym.
    const util = strength.filter((s) => {
      const slug = s.slug as string;
      return ["cable_chest_press", "lat_pulldown", "seated_row_machine", "cable_curl"].includes(slug);
    });
    expect(util.length).toBeGreaterThanOrEqual(2);

    // Defect 3 — the 40-minute session scales past the five-item 166 output.
    expect(structure.length).toBeGreaterThanOrEqual(7);

    // Secondary (Change C) — the two dumbbell pushes are no longer both present.
    const dbPushes = strength.filter((s) =>
      ["seated_db_shoulder_press", "incline_db_press"].includes(s.slug as string),
    );
    expect(dbPushes.length).toBeLessThanOrEqual(1);

    // The repair was recorded, and the typed-slot plan was logged.
    const params = gp();
    expect(Array.isArray(params.repairs)).toBe(true);
    expect((params.repairs as string[]).length).toBeGreaterThan(0);
    expect((params.strength_slots as Record<string, unknown>).total).toBe(4);
    expect(params.tier_degraded).toBe(false);
    expect(params.source).toBe("model");
  });

  it("core focus at 60 min degrades (tier_degraded) with a notice, never fails", async () => {
    // A pool with only two core compounds + one accessory (brief's depth limit).
    state.cfg.movements = {
      data: [
        m({ slug: "warmup_general", category: "education", focus_tags: ["education"] }),
        m({ slug: "cooldown_general", category: "education", focus_tags: ["education"] }),
        m({ slug: "pelvic_floor_activation", category: "pelvic_floor", focus_tags: ["pelvic_floor"] }),
        m({ slug: "bird_dog", category: "strength", focus_tags: ["core"], movement_tier: "compound", movement_pattern: "core" }),
        m({ slug: "pallof_press", category: "strength", focus_tags: ["core"], equipment: ["band"], movement_tier: "compound", movement_pattern: "core" }),
        m({ slug: "dead_bug", category: "strength", focus_tags: ["core"], movement_tier: "accessory", movement_pattern: "core" }),
      ],
      error: null,
    };
    state.cfg.openaiContent = JSON.stringify({
      focus: "Core",
      intensity: "easy",
      structure: [{ slug: "bird_dog", sets: 2, reps: "8" }, { slug: "pallof_press", sets: 2, reps: "10" }, { slug: "dead_bug", sets: 2, reps: "8" }],
      why: "w",
    });
    const res = await POST(req({ time: 60, equipmentPreset: "home_weights", focus: "core_pelvic_floor" }));
    expect(res.status).toBe(200); // never fails
    const params = gp();
    expect(params.tier_degraded).toBe(true);
    expect(params.notice).toBeTruthy();
  });
});
