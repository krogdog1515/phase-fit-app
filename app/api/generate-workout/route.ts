/* eslint-disable @typescript-eslint/no-explicit-any */

import { NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";
import { normalizeDifficulty } from "../../lib/difficulty";
import {
  analyzeUserNotes,
  buildOutsideActivitySummary,
  buildReflectionSummary,
  buildSystemPrompt,
  buildUserMessage,
  extractMovementsList,
  getWorkoutModality,
  parseWorkoutJson,
} from "../../lib/workout-prompts";
import { buildGenerationParams } from "../../lib/generation-params";
import { resolvePregnancyStage } from "@/lib/stages/resolvePregnancyStage";
import { filterMovementsByStage, filterByEquipment } from "@/lib/movements/filterByStage";
import type { Movement } from "@/lib/movements/types";
import {
  buildPregnancySystemPrompt,
  buildPregnancyUserMessage,
  validatePregnancyWorkout,
  buildCannedSession,
  resolveStructure,
  loadedFloorFor,
  type PregnancyStructureItem,
} from "../../lib/pregnancy-prompts";
import { getIntensityCap } from "@/lib/stages/pregnancyStages";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/** Anon client used only to verify a bearer token and resolve its user. */
function authClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

function normalizeMovement(name: string) {
  const n = name.toLowerCase();

  if (n.includes("squat")) return "squat";
  if (n.includes("deadlift") || n.includes("rdl")) return "hinge";
  if (n.includes("bench") || n.includes("press")) return "press";
  if (n.includes("row")) return "row";
  if (n.includes("lunge")) return "lunge";

  return n;
}

function coalesceNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function isValidSetLog(log: Record<string, unknown>): boolean {
  const w = coalesceNumber(log.weight);
  const r = coalesceNumber(log.reps);
  return w !== null && r !== null && w >= 0 && r >= 0;
}

const PATTERN_ORDER = ["squat", "hinge", "press", "row", "lunge"];

function sortPatterns(patterns: Iterable<string>): string[] {
  return [...patterns].sort((a, b) => {
    const ia = PATTERN_ORDER.indexOf(a);
    const ib = PATTERN_ORDER.indexOf(b);
    const aKnown = ia !== -1;
    const bKnown = ib !== -1;
    if (aKnown && bKnown) return ia - ib;
    if (aKnown) return -1;
    if (bKnown) return 1;
    return a.localeCompare(b);
  });
}

function pickTopSet(rows: Record<string, any>[]): Record<string, any> | null {
  const valid = rows.filter((r) =>
    isValidSetLog(r as Record<string, unknown>)
  );
  if (!valid.length) return null;
  return valid.reduce((best, cur) => {
    const bw = coalesceNumber(best.weight) ?? 0;
    const cw = coalesceNumber(cur.weight) ?? 0;
    if (cw > bw) return cur;
    if (cw < bw) return best;
    const br = coalesceNumber(best.reps) ?? 0;
    const cr = coalesceNumber(cur.reps) ?? 0;
    return cr >= br ? cur : best;
  });
}

function buildPerformanceSummary(
  pastWorkouts: Record<string, any>[],
  logs: Record<string, any>[]
): string {
  if (!pastWorkouts?.length || !logs?.length) return "";

  const workoutIds = new Set(pastWorkouts.map((w) => w.id));
  const relevantLogs = logs.filter((l) => workoutIds.has(l.workout_id));

  const patterns = new Set<string>();
  for (const log of relevantLogs) {
    if (!isValidSetLog(log as Record<string, unknown>)) continue;
    patterns.add(normalizeMovement(String(log.movement)));
  }

  if (patterns.size === 0) return "";

  const oldestFirst = [...pastWorkouts].reverse();
  const blocks: string[] = [];

  for (const pattern of sortPatterns(patterns)) {
    const sessions: {
      workout: Record<string, any>;
      tw: number;
      tr: number;
    }[] = [];

    for (const w of oldestFirst) {
      const rows = relevantLogs.filter(
        (l) =>
          l.workout_id === w.id &&
          normalizeMovement(String(l.movement)) === pattern
      );
      const top = pickTopSet(rows);
      if (!top) continue;
      const tw = coalesceNumber(top.weight);
      const tr = coalesceNumber(top.reps);
      if (tw === null || tr === null) continue;
      sessions.push({ workout: w, tw, tr });
    }

    if (sessions.length === 0) continue;

    const lines = sessions.map((s, i) => {
      const isLast = i === sessions.length - 1;
      let line = `- ${s.tw} x ${s.tr}`;
      if (isLast) {
        const canon = normalizeDifficulty(s.workout.difficulty);
        if (canon) line += ` (${canon})`;
      }
      return line;
    });

    blocks.push(`${pattern}:\n${lines.join("\n")}`);
  }

  if (blocks.length === 0) return "";

  return (
    `Top-set trend (oldest→newest, up to 3 sessions):\n\n` +
    blocks.join("\n\n")
  );
}

export async function POST(req: Request) {
  try {
    // 0. Verify JWT. The user id comes from the verified token, NEVER the body.
    //    This route now reads pregnancy safety state (training_mode, screening
    //    verdict, stage anchor) keyed off the id, so a body-supplied id would
    //    let anyone generate against anyone's pregnancy state. Applies to both
    //    the cycle and pregnancy branches.
    const authHeader = req.headers.get("authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!token) {
      return NextResponse.json({ error: "Missing bearer token" }, { status: 401 });
    }
    const { data: userData, error: authError } = await authClient().auth.getUser(token);
    if (authError || !userData?.user) {
      return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 });
    }
    const user_id = userData.user.id;

    const body = await req.json();
    const { phase, energy, time, style, notes, equipment } = body;

    // Both branches need a session length.
    if (!time) {
      return NextResponse.json(
        { error: "Missing required field: time" },
        { status: 400 }
      );
    }

    // Read the gating mode + anchor for the VERIFIED user. Fail closed: a read
    // error, a missing row, or any training_mode other than cycle|pregnancy all
    // block. Absence of proof of safety is not proof of safety.
    const { data: modeProfile, error: modeError } = await supabase
      .from("user_profiles")
      .select("training_mode, stage_anchor_date")
      .eq("user_id", user_id)
      .maybeSingle();

    if (
      modeError ||
      !modeProfile ||
      (modeProfile.training_mode !== "cycle" &&
        modeProfile.training_mode !== "pregnancy")
    ) {
      if (modeError) {
        console.error("[generate-workout] profile read failed", modeError);
      }
      return NextResponse.json(
        { error: "Workout generation is unavailable for this account state." },
        { status: 409 }
      );
    }

    // Pregnancy: real gating + generation constrained to the vetted pool.
    if (modeProfile.training_mode === "pregnancy") {
      return await handlePregnancyGeneration({
        user_id,
        time,
        equipment,
        stageAnchorDate: modeProfile.stage_anchor_date,
      });
    }

    // ---- Cycle path (unchanged below) ----
    if (!phase || !energy || !style) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    const modality = getWorkoutModality(String(style));
    const notesAnalysis = analyzeUserNotes(notes ?? "");

    const [
      { data: recentForReflection },
      { data: recentOutside },
      { data: userProfileData },
    ] = await Promise.all([
      supabase
        .from("workouts")
        .select("workout, user_notes, created_at, difficulty")
        .eq("user_id", user_id)
        .order("created_at", { ascending: false })
        .limit(5),
      supabase
        .from("outside_workouts")
        .select("activity_type, duration_minutes, intensity, notes, created_at")
        .eq("user_id", user_id)
        .order("created_at", { ascending: false })
        .limit(5),
      supabase
        .from("user_profiles")
        .select(
          "goal, life_stage, training_experience, training_environment, training_frequency, biggest_challenge, preferred_training_style"
        )
        .eq("user_id", user_id)
        .maybeSingle(),
    ]);

    const reflectionSummary = buildReflectionSummary(
      recentForReflection ?? []
    );

    const outsideActivitySummary = buildOutsideActivitySummary(
      recentOutside ?? []
    );

    let performanceSummary = "";

    if (modality === "strength") {
      const { data: pastWorkouts } = await supabase
        .from("workouts")
        .select("*")
        .eq("user_id", user_id)
        .eq("phase", phase)
        .order("created_at", { ascending: false })
        .limit(3);

      if (pastWorkouts && pastWorkouts.length > 0) {
        const workoutIds = pastWorkouts.map((w) => w.id);

        const { data: logs } = await supabase
          .from("workout_logs")
          .select("*")
          .in("workout_id", workoutIds);

        if (logs && logs.length > 0) {
          performanceSummary = buildPerformanceSummary(pastWorkouts, logs);
        }
      }
    }

    const systemPrompt = buildSystemPrompt(modality, notesAnalysis);
    const userMessage = buildUserMessage({
      phase,
      energy,
      time,
      style,
      notes: notes ?? "",
      performanceSummary,
      reflectionSummary,
      outsideActivitySummary,
      modality,
      notesAnalysis,
      userProfile: userProfileData ?? null,
    });

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
    });

    const text = completion.choices[0].message.content || "";

    let parsed: Record<string, unknown>;
    try {
      parsed = parseWorkoutJson(text);
    } catch {
      return NextResponse.json(
        { error: "Invalid AI JSON" },
        { status: 500 }
      );
    }

    const structure = Array.isArray(parsed.structure) ? parsed.structure : [];
    const flow = Array.isArray(parsed.flow) ? parsed.flow : [];
    const movements = extractMovementsList(parsed);

    const insertPayload: Record<string, unknown> = {
      user_id,
      phase,
      workout: parsed.focus,
      intensity: parsed.intensity,
      movements,
      structure,
      flow,
      cycle_guidance: parsed.cycle_guidance,
      cardio: parsed.cardio,
      recovery: parsed.recovery,
      why: parsed.why,
      generation_params: buildGenerationParams({
        phase,
        energy,
        time,
        style,
        notes,
      }),
    };

    const { data, error } = await supabase
      .from("workouts")
      .insert([insertPayload])
      .select()
      .single();

    if (error) {
      console.error(error);
      return NextResponse.json(
        { error: "Database insert failed" },
        { status: 500 }
      );
    }

    const { error: eventError } = await supabase
      .from("events")
      .insert({
        user_id,
        event_name: "workout_generated",
        metadata: { phase, style, energy, time },
      });
    if (eventError) console.error("[logEvent] workout_generated", eventError);

    return NextResponse.json({ id: data.id });
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: "Server error" },
      { status: 500 }
    );
  }
}

/**
 * Pregnancy generation. Deterministic gating decides WHETHER to generate; the
 * model only selects/sequences from a stage- and equipment-filtered pool it
 * cannot add to, and every returned slug is validated against that pool. Any
 * gate that can't be positively confirmed fails closed (409). See the sprint
 * plan for the KNOWN GAP: no red-flag/daily-checkin gate yet.
 */
async function handlePregnancyGeneration(opts: {
  user_id: string;
  time: unknown;
  equipment: unknown;
  stageAnchorDate: string | null;
}): Promise<Response> {
  const { user_id, stageAnchorDate } = opts;

  const duration = Number(opts.time);
  if (!Number.isFinite(duration) || duration <= 0) {
    return NextResponse.json({ error: "Invalid session length" }, { status: 400 });
  }
  const equipmentList = Array.isArray(opts.equipment)
    ? opts.equipment.map((e) => String(e))
    : [];

  // 1. Most recent screening row. No row -> cannot proceed.
  const { data: screening } = await supabase
    .from("pregnancy_screening")
    .select("screening_result, prior_activity_level")
    .eq("user_id", user_id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!screening) {
    return NextResponse.json(
      { error: "Complete pregnancy screening before generating a workout." },
      { status: 409 }
    );
  }

  // 2. Gate on the verdict. provider_conversation blocks: allowedCategories is
  //    still [] / TODO(clinical), so blocking is the fail-closed choice until
  //    the conservative subset is vetted — do NOT invent one.
  const result = screening.screening_result;
  if (result === "hard_stop") {
    return NextResponse.json(
      {
        error:
          "Based on your screening, please work with your provider before training here.",
        screening_result: "hard_stop",
      },
      { status: 409 }
    );
  }
  if (result === "provider_conversation") {
    return NextResponse.json(
      {
        error:
          "We're waiting on your provider conversation before suggesting workouts.",
        screening_result: "provider_conversation",
      },
      { status: 409 }
    );
  }
  if (result !== "clear") {
    return NextResponse.json(
      { error: "Workout generation is unavailable." },
      { status: 409 }
    );
  }

  // 3. Resolve the current stage band from the anchor date.
  const stage = resolvePregnancyStage(stageAnchorDate, new Date());
  if (!stage.ok) {
    return NextResponse.json(
      { error: "Your due date could not be resolved to a valid stage.", reason: stage.reason },
      { status: 409 }
    );
  }

  // 4. Build the candidate pool: stage band, then equipment on hand.
  const { data: allMovements, error: movError } = await supabase
    .from("movements")
    .select("*");
  if (movError) {
    console.error("[generate-workout] movements read failed", movError);
    return NextResponse.json({ error: "Could not load movements" }, { status: 500 });
  }
  const byStage = filterMovementsByStage((allMovements ?? []) as Movement[], stage.stageKey);
  const pool = filterByEquipment(byStage, equipmentList);
  if (pool.length === 0) {
    return NextResponse.json(
      { error: "No stage-appropriate movements match the selected equipment." },
      { status: 409 }
    );
  }

  const poolSlugs = new Set(pool.map((m) => m.slug));
  const poolBySlug = new Map(pool.map((m) => [m.slug, m]));

  // Loaded-movement floor for this band + activity level, clamped to the pool.
  const cap = getIntensityCap(stage.stageKey);
  const priorActivity = (screening.prior_activity_level as string | null) ?? null;
  const loadedFloor = loadedFloorFor(pool, cap, priorActivity);

  // 5. Constrained generation with one retry, then a deterministic fallback.
  const systemPrompt = buildPregnancySystemPrompt();
  const userMessage = buildPregnancyUserMessage(pool, {
    stageKey: stage.stageKey,
    gestationalWeek: stage.gestationalWeek,
    time: duration,
    priorActivityLevel: priorActivity,
  });

  let structure: PregnancyStructureItem[] | null = null;
  let source: "model" | "fallback" = "model";
  let focus = "Gentle pregnancy session";
  let intensity = "Easy, breath-led";
  let why = "A safe, gentle session for your current stage.";

  for (let attempt = 0; attempt < 2; attempt++) {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
    });
    const text = completion.choices[0]?.message?.content || "";
    let parsed: Record<string, unknown>;
    try {
      parsed = parseWorkoutJson(text);
    } catch {
      continue;
    }
    // 6. Validate: every slug in the pool AND the loaded-movement floor met.
    //    Fail closed otherwise (retry once, then deterministic fallback).
    if (!validatePregnancyWorkout(parsed, poolSlugs, { poolBySlug, loadedFloor }).valid) {
      continue;
    }
    structure = resolveStructure(parsed, poolBySlug);
    if (structure.length === 0) {
      structure = null;
      continue;
    }
    if (typeof parsed.focus === "string") focus = parsed.focus;
    if (typeof parsed.intensity === "string") intensity = parsed.intensity;
    if (typeof parsed.why === "string") why = parsed.why;
    break;
  }

  // Second violation -> deterministic safe session from the pool. Log it.
  if (!structure || structure.length === 0) {
    const canned = buildCannedSession(pool, {
      time: duration,
      context: {
        stageKey: stage.stageKey,
        gestationalWeek: stage.gestationalWeek,
        time: duration,
        priorActivityLevel: priorActivity,
      },
    });
    structure = canned.structure;
    focus = canned.focus;
    intensity = canned.intensity;
    why = canned.why;
    source = "fallback";
    await supabase.from("events").insert({
      user_id,
      event_name: "pregnancy_workout_fallback",
      metadata: { stage_key: stage.stageKey, gestational_week: stage.gestationalWeek },
    });
  }

  // 7. Persist. Canonical names already come from the pool (model can't rename).
  const insertPayload = {
    user_id,
    phase: "pregnancy",
    workout: focus,
    intensity,
    movements: structure.map((s) => s.movement),
    structure,
    flow: [],
    why,
    generation_params: {
      mode: "pregnancy",
      duration,
      stage_key: stage.stageKey,
      gestational_week: stage.gestationalWeek,
      prior_activity_level: priorActivity,
      equipment: equipmentList,
      pool_slugs: [...poolSlugs],
      source,
    },
  };

  const { data, error } = await supabase
    .from("workouts")
    .insert([insertPayload])
    .select()
    .single();

  if (error) {
    console.error("[generate-workout] pregnancy insert failed", error);
    return NextResponse.json({ error: "Database insert failed" }, { status: 500 });
  }

  const { error: eventError } = await supabase.from("events").insert({
    user_id,
    event_name: "workout_generated",
    metadata: { mode: "pregnancy", stage_key: stage.stageKey, source },
  });
  if (eventError) console.error("[logEvent] workout_generated", eventError);

  return NextResponse.json({ id: data.id });
}
