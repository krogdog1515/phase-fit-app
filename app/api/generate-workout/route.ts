/* eslint-disable @typescript-eslint/no-explicit-any */

import { NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";
import { normalizeDifficulty } from "../../lib/difficulty";

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

/** Highest weight wins; tie-break higher reps. */
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

/**
 * Up to 3 phase-matched workouts (caller orders newest-first).
 * Per movement pattern: top set each session (oldest→newest). Difficulty from
 * the workout row is appended only on the last line for that pattern.
 */
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

    // 🔥 GET RECENT WORKOUTS
    const { data: pastWorkouts } = await supabase
      .from("workouts")
      .select("*")
      .eq("user_id", user_id)
      .eq("phase", phase)
      .order("created_at", { ascending: false })
      .limit(3);

    let performanceSummary = "";

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

    // 🔥 OPENAI
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `
You are an elite women's fitness coach specializing in menstrual cycle-based training.

You are responsible for intelligent PROGRESSIVE OVERLOAD.

Use past performance data to adjust the workout.

Each movement may list up to 3 top sets (oldest session first). The last line may end with difficulty in parentheses using ONLY these exact tokens: too_easy | just_right | too_hard. Match token to that session's perceived effort—use it together with load/reps. Read the full trend (stalling, progressing, back‑off); do not ignore earlier sessions.

Difficulty tokens (last line of each movement trend):
- too_easy → increase load (add weight and/or reps, or progress variation) unless contraindicated by trend or notes.
- too_hard → reduce intensity (lighter loads, fewer grinding sets, higher RIR, shorter hard work).
- just_right → maintain structure or small progression (e.g. +2.5–5 lb or +1 rep on a working set).

Also factor energy and cycle phase. If difficulty is missing from a line, infer only from load/reps trend.

When referencing past performance:
- ALWAYS include previous weight and reps if available
- ALWAYS convert that into a specific recommendation
- DO NOT give vague suggestions

Examples:
- "Increase from 135 lbs to 145 lbs"
- "Stay at 185 lbs"
- "Drop to 125 lbs due to fatigue"

Do NOT use percentages unless no data exists.

Every movement MUST include a progression note.

Return ONLY valid JSON:

{
  "focus": "...",
  "intensity": "RPE X-X",
  "cycle_guidance": {
    "summary": "...",
    "during_workout": "...",
    "adjustments": "..."
  },
  "structure": [
    {
      "movement": "...",
      "sets": number,
      "reps": "...",
      "rir": "...",
      "note": "Specific progression guidance"
    }
  ],
  "cardio": "...",
  "recovery": "...",
  "why": "..."
}
          `,
        },
        {
          role: "user",
          content: `
Phase: ${phase}
Energy: ${energy}
Time: ${time}
Style: ${style}
Notes: ${notes}

Recent top-set trend (same phase, oldest→newest):
${performanceSummary || "No prior data"}
          `,
        },
      ],
    });

    const text = completion.choices[0].message.content || "";

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      return NextResponse.json(
        { error: "Invalid AI JSON" },
        { status: 500 }
      );
    }

    const structure = parsed.structure || [];
    const movements = structure.map((m: any) => m.movement);

    const { data, error } = await supabase
      .from("workouts")
      .insert([
        {
          user_id,
          phase,
          workout: parsed.focus,
          intensity: parsed.intensity,
          movements,
          structure,
          cycle_guidance: parsed.cycle_guidance,
          cardio: parsed.cardio,
          recovery: parsed.recovery,
          why: parsed.why,
        },
      ])
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { error: "Database insert failed" },
        { status: 500 }
      );
    }

    return NextResponse.json({ id: data.id });

  } catch {
    return NextResponse.json(
      { error: "Server error" },
      { status: 500 }
    );
  }
}