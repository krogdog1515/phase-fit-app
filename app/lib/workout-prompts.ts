export type WorkoutModality = "strength" | "interval" | "flow";

const STRENGTH_STYLES = new Set(["strength", "upper", "lower"]);

export function getWorkoutModality(style: string): WorkoutModality {
  const s = style.trim().toLowerCase();
  if (s === "cardio") return "interval";
  if (s === "mobility") return "flow";
  if (STRENGTH_STYLES.has(s)) return "strength";
  return "strength";
}

const SENSITIVE_NOTE_KEYWORDS = [
  "injury",
  "injured",
  "pain",
  "hurt",
  "sore",
  "soreness",
  "illness",
  "sick",
  "fatigue",
  "fatigued",
  "exhausted",
  "tired",
  "poor sleep",
  "insomnia",
  "stress",
  "stressed",
  "anxiety",
  "recovery",
  "recovering",
  "miscarriage",
  "pregnancy loss",
  "postpartum",
  "post-partum",
  "post natal",
  "postnatal",
  "c-section",
  "cesarean",
  "pelvic floor",
  "overtrained",
  "burnout",
  "flare",
  "inflammation",
  "doctor",
  "physio",
  "physical therapy",
];

export type NotesAnalysis = {
  hasNotes: boolean;
  sensitive: boolean;
  matchedTerms: string[];
  directive: string;
};

export function analyzeUserNotes(notes: string | undefined | null): NotesAnalysis {
  const text = (notes ?? "").trim();
  if (!text) {
    return {
      hasNotes: false,
      sensitive: false,
      matchedTerms: [],
      directive: "",
    };
  }

  const lower = text.toLowerCase();
  const matchedTerms = SENSITIVE_NOTE_KEYWORDS.filter((kw) =>
    lower.includes(kw)
  );

  const sensitive = matchedTerms.length > 0;

  let directive = `
USER NOTES (CRITICAL — prioritize above phase, energy, and style defaults):
"""
${text}
"""

User notes must be prioritized above all other inputs.
If notes indicate recovery, injury, medical context, emotional recovery, or fatigue:
- reduce intensity
- prioritize safety and nervous system regulation
- avoid maximal stress training
- adjust coaching tone to be warm, supportive, and non-judgmental
- explain adaptations clearly in cycle_guidance.summary (why this session was shaped this way)
`;

  if (sensitive) {
    directive += `
Sensitive context detected (${matchedTerms.join(", ")}).
- Default toward lower intensity and restorative pacing
- Avoid HIIT sprints, maximal lifting, and aggressive progression
- Prefer walking, breathing, mobility, gentle tempo work, and recovery pacing
- If miscarriage, postpartum, illness, or injury: no high-stress intervals or heavy compounds unless notes explicitly allow it
- cycle_guidance.summary MUST acknowledge the user's context and state why intensity was adjusted
`;
  }

  return {
    hasNotes: true,
    sensitive,
    matchedTerms,
    directive,
  };
}

const NOTES_PRIORITY_BLOCK = `
NOTES ARE CRITICAL CONTEXT:
User notes must be prioritized above phase, energy, time, and style defaults when they conflict.
If notes indicate recovery, injury, medical context, emotional recovery, or fatigue:
- reduce intensity
- prioritize safety
- avoid maximal stress training
- use an emotionally intelligent, supportive coaching tone
`;

export const REFLECTION_COACHING_RULES = `
POST-WORKOUT REFLECTION MEMORY (recent user_notes from completed sessions):
Use these reflections as adaptive coaching context alongside load/reps trends.
They should influence movement selection, progression pacing, recovery emphasis, and coaching tone.

Rules:
- Repeated fatigue, crashes, or low energy → reduce intensity and prioritize recovery
- Repeated pain, tightness, or discomfort → avoid aggravating movement patterns; offer swaps
- Repeated positive responses (felt strong, better, great) → allow thoughtful progression when phase supports it
- Do NOT fully override menstrual cycle phase logic
- Do NOT diagnose, treat, or give medical advice—encourage professional care when appropriate
- Be emotionally aware and supportive in cycle_guidance.summary when reflections matter
`;

export type ReflectionWorkoutRow = {
  workout?: string | null;
  user_notes?: string | null;
  created_at?: string | null;
  difficulty?: string | null;
};

/** Last 3–5 sessions with non-empty user_notes, newest first (input already ordered desc). */
export function buildReflectionSummary(
  workouts: ReflectionWorkoutRow[]
): string {
  const entries = workouts
    .filter((w) => (w.user_notes ?? "").trim().length > 0)
    .slice(0, 5);

  if (entries.length === 0) return "";

  const lines = entries.map((w) => {
    const title = (w.workout ?? "Session").trim();
    const note = (w.user_notes ?? "").trim().replace(/\s+/g, " ");
    const diff = w.difficulty ? ` [${w.difficulty}]` : "";
    const date = w.created_at
      ? new Date(w.created_at).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        })
      : "";
    const prefix = date ? `${date} — ${title}` : title;
    return `- ${prefix}${diff}: "${note}"`;
  });

  return `Recent post-workout reflections (newest first):\n${lines.join("\n")}`;
}

const STRENGTH_JSON_SCHEMA = `{
  "focus": "...",
  "intensity": "RPE X-X",
  "cycle_guidance": {
    "summary": "Explain cycle + notes adaptation (if notes exist, say WHY intensity was adjusted)",
    "during_workout": "...",
    "adjustments": "..."
  },
  "structure": [
    {
      "movement": "...",
      "sets": number,
      "reps": "...",
      "rir": "...",
      "note": "Specific progression guidance referencing prior loads when available"
    }
  ],
  "flow": [],
  "cardio": "...",
  "recovery": "...",
  "why": "..."
}`;

const INTERVAL_JSON_SCHEMA = `{
  "focus": "Short session title (e.g. Phase-aware Interval Conditioning)",
  "intensity": "RPE or effort zone for work intervals",
  "total_duration": "Must fit requested session time (e.g. 40 min)",
  "cycle_guidance": {
    "summary": "Warm, specific explanation of WHY this session was designed (cycle + notes)",
    "during_workout": "How to pace work vs recovery intervals",
    "adjustments": "When to shorten intervals, walk instead of sprint, or stop"
  },
  "flow": [
    {
      "block": "Warmup | Intervals | Recovery | Cooldown",
      "duration": "e.g. 5 min",
      "instructions": "Clear time-based coaching (no sets/reps)"
    }
  ],
  "structure": [],
  "cardio": "Optional brief summary",
  "recovery": "...",
  "why": "..."
}`;

const FLOW_JSON_SCHEMA = `{
  "focus": "Short restorative session title",
  "intensity": "Very easy to easy — breath-led",
  "total_duration": "Must fit requested session time",
  "cycle_guidance": {
    "summary": "Calm, supportive explanation of WHY this recovery flow was chosen (cycle + notes)",
    "during_workout": "Breath, tempo, and nervous system cues",
    "adjustments": "How to soften or shorten if fatigued"
  },
  "flow": [
    {
      "block": "Breathing | Mobility | Hold | Cooldown",
      "duration": "e.g. 2 min per drill",
      "instructions": "Tempo, holds, breathing — restorative only"
    }
  ],
  "structure": [],
  "cardio": "",
  "recovery": "...",
  "why": "..."
}`;

function strengthSystemPrompt(notesBlock: string, sensitive: boolean): string {
  return `
You are an elite women's fitness coach specializing in menstrual cycle-based training.

You design STRENGTH sessions with intelligent progressive overload.

${NOTES_PRIORITY_BLOCK}
${REFLECTION_COACHING_RULES}
${notesBlock}

Use past performance data when provided. Each movement trend lists up to 3 top sets (oldest first). Last line may end with difficulty: too_easy | just_right | too_hard.

Difficulty tokens:
- too_easy → increase load unless notes contraindicate
- too_hard → reduce intensity (lighter load, higher RIR)
- just_right → maintain or small progression (+2.5–5 lb or +1 rep)

When referencing past performance: include specific prior weight/reps and a concrete recommendation. No vague suggestions.

${sensitive ? "Because user notes indicate recovery/sensitivity: reduce volume/intensity, avoid grinding max sets, and explain adaptations in cycle_guidance.summary." : ""}

Return ONLY valid JSON (no markdown fences):
${STRENGTH_JSON_SCHEMA}
`;
}

function intervalSystemPrompt(notesBlock: string, sensitive: boolean): string {
  return `
You are an elite women's fitness coach specializing in menstrual cycle-based training.

You design COACHED CARDIO / HIIT sessions — athletic, intentional, and time-based. NOT generic "do cardio" advice.

${NOTES_PRIORITY_BLOCK}
${REFLECTION_COACHING_RULES}
${notesBlock}

REQUIREMENTS:
- Use "flow" array with structured blocks: Warmup, Intervals (with work/rest timing), Recovery periods, Cooldown
- Include total_duration matching the user's requested session length
- Time-based coaching only — do NOT use sets/reps or heavy lifting in structure
- "structure" must be an empty array []
- Include intensity guidance (RPE, effort zones, or talk-test)
- Intervals must be specific (e.g. 30 sec hard / 90 sec easy × 6 rounds)

Example interval block style:
- Warmup: 5 min brisk walk + dynamic prep
- 6 rounds: 30 sec sprint / 90 sec walk
- Cooldown: 5 min easy walk

${sensitive ? "User context requires lower stress: prefer walk/jog intervals, longer recovery, no all-out sprints unless notes allow. Explain in cycle_guidance.summary." : ""}

Return ONLY valid JSON (no markdown fences):
${INTERVAL_JSON_SCHEMA}
`;
}

function flowSystemPrompt(notesBlock: string, sensitive: boolean): string {
  return `
You are an elite women's fitness coach specializing in menstrual cycle-based training.

You design MOBILITY / RECOVERY flows — restorative, guided, calming, intentional.

${NOTES_PRIORITY_BLOCK}
${REFLECTION_COACHING_RULES}
${notesBlock}

REQUIREMENTS:
- Use "flow" array: breathing work, mobility drills, tempo/hold guidance, recovery pacing
- Each item: block name, duration per movement, clear instructions
- "structure" must be an empty array []
- Do NOT prescribe heavy compounds, barbell lifts, or HIIT
- Match total_duration to requested session time
- Tone: supportive, nervous-system friendly

Example flow items:
- 90/90 hip flow — 2 min
- Cat-cow — 2 min, slow nasal breathing
- Deep squat hold — 2 min, support as needed

${sensitive ? "Prioritize gentle movement, breathing, and emotional safety. cycle_guidance.summary must acknowledge their context with care." : ""}

Return ONLY valid JSON (no markdown fences):
${FLOW_JSON_SCHEMA}
`;
}

export function buildSystemPrompt(
  modality: WorkoutModality,
  notesAnalysis: NotesAnalysis
): string {
  const notesBlock = notesAnalysis.directive;
  const sensitive = notesAnalysis.sensitive;

  switch (modality) {
    case "interval":
      return intervalSystemPrompt(notesBlock, sensitive);
    case "flow":
      return flowSystemPrompt(notesBlock, sensitive);
    default:
      return strengthSystemPrompt(notesBlock, sensitive);
  }
}

export function buildUserMessage(params: {
  phase: string;
  energy: string;
  time: string;
  style: string;
  notes: string;
  performanceSummary: string;
  reflectionSummary: string;
  modality: WorkoutModality;
  notesAnalysis: NotesAnalysis;
}): string {
  const {
    phase,
    energy,
    time,
    style,
    notes,
    performanceSummary,
    reflectionSummary,
    modality,
    notesAnalysis,
  } = params;

  const perfSection =
    modality === "strength" && performanceSummary
      ? `\nRecent top-set trend (same phase, oldest→newest):\n${performanceSummary}`
      : modality === "strength"
        ? "\nRecent top-set trend: No prior data"
        : "";

  const reflectionSection = reflectionSummary
    ? `\n${reflectionSummary}`
    : "\nRecent post-workout reflections: None yet";

  const notesReminder = notesAnalysis.hasNotes
    ? "\nRemember: pre-workout notes are CRITICAL where they conflict with defaults."
    : "";

  return `
Phase: ${phase}
Energy: ${energy}
Time: ${time} minutes requested
Style: ${style}
Pre-workout notes: ${notes.trim() || "(none)"}
${perfSection}
${reflectionSection}
${notesReminder}
`.trim();
}

/** Strip markdown code fences if model wraps JSON. */
export function parseWorkoutJson(text: string): Record<string, unknown> {
  let raw = text.trim();
  if (raw.startsWith("```")) {
    raw = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  }
  return JSON.parse(raw) as Record<string, unknown>;
}

export function extractMovementsList(parsed: Record<string, unknown>): string[] {
  const structure = parsed.structure;
  if (Array.isArray(structure) && structure.length > 0) {
    return structure
      .map((m) =>
        typeof m === "object" && m && "movement" in m
          ? String((m as { movement: unknown }).movement)
          : ""
      )
      .filter(Boolean);
  }

  const flow = parsed.flow;
  if (Array.isArray(flow) && flow.length > 0) {
    return flow
      .map((f) =>
        typeof f === "object" && f && "block" in f
          ? String((f as { block: unknown }).block)
          : ""
      )
      .filter(Boolean);
  }

  return [String(parsed.focus ?? "Workout")];
}
