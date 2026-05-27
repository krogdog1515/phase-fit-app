/* eslint-disable @typescript-eslint/no-explicit-any */

import { NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";
import { normalizeDifficulty } from "../../lib/difficulty";
import {
  analyzeUserNotes,
  buildReflectionSummary,
  buildSystemPrompt,
  buildUserMessage,
  extractMovementsList,
  getWorkoutModality,
  parseWorkoutJson,
} from "../../lib/workout-prompts";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

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
    const body = await req.json();
    const { user_id, phase, energy, time, style, notes } = body;

    if (!user_id || !phase || !energy || !time || !style) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    const modality = getWorkoutModality(String(style));
    const notesAnalysis = analyzeUserNotes(notes ?? "");

    const { data: recentForReflection } = await supabase
      .from("workouts")
      .select("workout, user_notes, created_at, difficulty")
      .eq("user_id", user_id)
      .order("created_at", { ascending: false })
      .limit(5);

    const reflectionSummary = buildReflectionSummary(
      recentForReflection ?? []
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
      modality,
      notesAnalysis,
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

    return NextResponse.json({ id: data.id });
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: "Server error" },
      { status: 500 }
    );
  }
}
