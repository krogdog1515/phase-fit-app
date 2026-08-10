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
});
