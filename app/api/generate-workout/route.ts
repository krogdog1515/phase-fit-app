/* eslint-disable @typescript-eslint/no-explicit-any */

import { NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

console.log("API SUPABASE URL:", process.env.NEXT_PUBLIC_SUPABASE_URL);

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// 🔥 Movement Normalization (Progression Accuracy)
function normalizeMovement(name: string) {
  const n = name.toLowerCase();

  if (n.includes("squat")) return "squat";
  if (n.includes("deadlift") || n.includes("rdl")) return "hinge";
  if (n.includes("bench") || n.includes("press")) return "press";
  if (n.includes("row")) return "row";
  if (n.includes("lunge")) return "lunge";

  return n;
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
        const grouped: any = {};

        logs.forEach((log) => {
          const key = normalizeMovement(log.movement);

          const workout = pastWorkouts.find(
            (w) => w.id === log.workout_id
          );

          if (!grouped[key]) grouped[key] = [];

          grouped[key].push({
            weight: log.weight,
            reps: log.reps,
            difficulty: workout?.difficulty,
          });
        });

        performanceSummary = Object.keys(grouped)
          .map((movement) => {
            const last = grouped[movement][0];

            return `${movement}:
- Last session: ${last.weight} lbs x ${last.reps} reps (${last.difficulty})`;
          })
          .join("\n\n");
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

Rules:
- If previous session was "Too Easy" → increase weight or reps
- If "Too Hard" → decrease weight or increase RIR
- If energy was worse → reduce intensity

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

Recent performance:
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