import type { Movement } from "@/lib/movements/types";
import type { StageKey, MovementCategory, IntensityCap } from "@/lib/stages/pregnancyStages";
import { getIntensityCap } from "@/lib/stages/pregnancyStages";
import { STAGE_BAND_LABELS } from "./pregnancy-display";

/**
 * Pregnancy workout prompting + fail-closed validation.
 *
 * The model is a SELECTOR, not an author: it may only choose and sequence
 * movements from a pre-filtered candidate pool, and must reference each by slug
 * so the response can be validated by exact match. It must never invent,
 * substitute, or rename a movement. All gating (stage, screening) has already
 * happened upstream; nothing here makes a safety decision.
 *
 * HARD BOUNDARY: no free-text screening field (e.g. q4_detail) is ever passed
 * into these prompts. This module only receives the vetted candidate pool and
 * structural context (stage band, gestational week, session length).
 */

export type PregnancyContext = {
  stageKey: StageKey;
  gestationalWeek: number;
  /** Session length in minutes. */
  time: number;
  /** Prior activity level (sedentary|light|active|athlete), for coaching context. */
  priorActivityLevel?: string | null;
};

/**
 * One prescribed movement in a pregnancy session (stored + returned).
 *
 * A movement is either set-based (sets + reps, durationSeconds = 0) or
 * time-based (durationSeconds > 0, sets = 0, reps = ""). `intensity` is a plain
 * cue. There is no weight — pregnancy movements are bodyweight or time-based, so
 * the finish flow does not require weight/reps logging (see the workout page).
 */
export type PregnancyStructureItem = {
  slug: string;
  movement: string; // canonical name, resolved from the pool by slug
  category: MovementCategory;
  sets: number;
  reps: string;
  durationSeconds: number;
  intensity: string;
  note: string;
};

export type PregnancyWorkout = {
  focus: string;
  intensity: string;
  structure: PregnancyStructureItem[];
  flow: [];
  why: string;
};

const PREGNANCY_JSON_SCHEMA = `{
  "focus": "Short session title",
  "intensity": "Effort descriptor tied to the prescription, e.g. 'RPE 7, ~3 reps in reserve' — never above the stated ceiling",
  "structure": [
    {
      "slug": "exact_slug_from_the_candidate_list",
      "sets": number,             // set-based movements (strength, mobility, pelvic_floor); 0 for time-based
      "reps": "string",           // e.g. "8-12"; "" for time-based
      "duration_seconds": number, // time-based movements (breathing, walking, recovery, education); 0 for set-based
      "intensity": "string",      // short effort cue, e.g. "gentle, breath-led"
      "note": "string"            // one short coaching cue
    }
  ],
  "why": "1-2 sentences in a warm, stage-aware voice"
}`;

export function buildPregnancySystemPrompt(): string {
  return `
You are a prenatal fitness coach sequencing a single safe session for a pregnant client.

ABSOLUTE RULES — these override everything else:
- You may ONLY use movements from the CANDIDATE LIST provided in the user message.
- Reference each movement by its exact "slug". Do NOT invent movements, do NOT
  substitute similar ones, and do NOT modify or rename a movement.
- If you are unsure, use fewer movements from the list rather than adding anything.
- Every object in "structure" MUST have a "slug" that appears verbatim in the list.

Build a real, appropriately-dosed training session that fits the requested time —
NOT a mobility flow. Order it well (warm-up / breathing early, strength in the
middle, recovery late) using only what the list offers.

Honor the TRAINING PRESCRIPTION in the user message exactly: hit the strength-
movement count, keep sets and reps within the stated ranges, and NEVER exceed the
RPE ceiling or drop below the reps-in-reserve (RIR) floor. Gauge aerobic effort
with the talk test, not a number. The stage band and prior activity level tune
dosage; they do not authorize anything outside the list.

You may quote or paraphrase the "WHY TODAY" rationale in the user message to
explain the session, but you must NEVER invent your own physiological, medical,
or safety explanation.

For EACH movement give a concrete prescription: set-based movements (strength,
mobility, pelvic_floor) use "sets" + "reps" with "duration_seconds" 0; time-based
movements (breathing, walking, recovery, education) use "duration_seconds" with
"sets" 0 and "reps" "". Always include an "intensity" cue.

Return ONLY valid JSON (no markdown fences), matching:
${PREGNANCY_JSON_SCHEMA}
`.trim();
}

/** Render one candidate line for the prompt. Free text is the vetted library's only. */
function candidateLine(m: Movement): string {
  const bits = [`- ${m.slug} — ${m.name} (${m.category})`];
  if (m.cues) bits.push(`  cues: ${m.cues}`);
  if (m.modifications) bits.push(`  modifications: ${m.modifications}`);
  if (m.benefit) bits.push(`  benefit: ${m.benefit}`);
  return bits.join("\n");
}

/** Human-readable load guidance for the prompt (enum -> instruction). */
const LOAD_GUIDANCE_TEXT: Record<IntensityCap["loadGuidance"], string> = {
  maintain: "maintain your usual working load",
  reduce_load_increase_reps: "reduce the load and add reps",
  deload: "deload — noticeably lighter than usual, prioritise movement quality",
};

/** The band's vetted training prescription, rendered as hard prompt constraints. */
function prescriptionBlock(cap: IntensityCap): string {
  const [strMin, strMax] = cap.strengthMovementTarget;
  const [setMin, setMax] = cap.setsPerMovement;
  const [repMin, repMax] = cap.repRange;
  return [
    "TRAINING PRESCRIPTION — HARD CONSTRAINTS (do not exceed):",
    `- Include between ${strMin} and ${strMax} strength-category movements. This is a real training`,
    "  session, not a mobility flow — do not default to gentleness.",
    `- Set-based movements: ${setMin}-${setMax} sets, ${repMin}-${repMax} reps.`,
    `- Effort ceiling: RPE ${cap.rpeCeiling}/10 — NEVER exceed it. Finish every set with at least`,
    `  ${cap.rirFloor} reps in reserve (RIR) — NEVER go below that.`,
    `- Load: ${LOAD_GUIDANCE_TEXT[cap.loadGuidance]}.`,
    "- For anything aerobic, gauge effort with the talk test (able to hold a conversation), not a number.",
  ].join("\n");
}

export function buildPregnancyUserMessage(
  candidates: Movement[],
  ctx: PregnancyContext,
): string {
  const band = STAGE_BAND_LABELS[ctx.stageKey] ?? ctx.stageKey;
  const cap = getIntensityCap(ctx.stageKey);
  const list = candidates.map(candidateLine).join("\n");
  const activity = ctx.priorActivityLevel
    ? `\n- Prior activity level: ${ctx.priorActivityLevel} (tune volume/intensity to this — do not patronize an active client, do not overload a sedentary one)`
    : "";
  return `
Client context (for coaching voice and dosage only):
- Stage: ${band}
- Gestational week: ${ctx.gestationalWeek}
- Session length: ${ctx.time} minutes${activity}

WHY TODAY LOOKS THE WAY IT DOES (vetted — you may quote or paraphrase this, but do
NOT add your own physiological claims):
${cap.coachingRationale}

${prescriptionBlock(cap)}

CANDIDATE LIST — select and sequence from these ONLY, by slug:
${list}

Build one session that fits ${ctx.time} minutes, honoring the PRESCRIPTION above.
Use only slugs from the list above.
`.trim();
}

/**
 * Validate a parsed model response against the candidate pool.
 *
 * FAIL CLOSED: valid only when `structure` is a non-empty array and EVERY item's
 * slug is a string present in `poolSlugs`. Any missing/extra/renamed slug fails.
 */
export function validatePregnancyWorkout(
  parsed: unknown,
  poolSlugs: Set<string>,
): { valid: boolean; slugs: string[]; badSlugs: string[] } {
  const structure =
    parsed && typeof parsed === "object" && Array.isArray((parsed as Record<string, unknown>).structure)
      ? ((parsed as Record<string, unknown>).structure as unknown[])
      : [];

  if (structure.length === 0) {
    return { valid: false, slugs: [], badSlugs: [] };
  }

  const slugs: string[] = [];
  const badSlugs: string[] = [];
  for (const item of structure) {
    const slug =
      item && typeof item === "object" && typeof (item as Record<string, unknown>).slug === "string"
        ? ((item as Record<string, unknown>).slug as string)
        : "";
    if (!slug || !poolSlugs.has(slug)) {
      badSlugs.push(slug || "(missing slug)");
    } else {
      slugs.push(slug);
    }
  }

  return { valid: badSlugs.length === 0, slugs, badSlugs };
}

/** Category ordering for the deterministic fallback (warm-up first, recovery last). */
const CANNED_CATEGORY_ORDER: MovementCategory[] = [
  "education",
  "breathing",
  "mobility",
  "pelvic_floor",
  "strength",
  "walking",
  "recovery",
];

type PrescriptionSpec = {
  sets: number;
  reps: string;
  durationSeconds: number;
  intensity: string;
};

/**
 * Generic, non-clinical default prescription per category. It also decides the
 * SHAPE of a movement (set-based vs time-based): a category with sets > 0 is
 * set-based; otherwise time-based. resolveStructure uses this shape and lets the
 * model tune the numbers; buildCannedSession uses it verbatim.
 */
const CATEGORY_SPEC: Record<MovementCategory, PrescriptionSpec> = {
  education: { sets: 0, reps: "", durationSeconds: 0, intensity: "Include at the start and end" },
  breathing: { sets: 0, reps: "", durationSeconds: 300, intensity: "Slow nasal breathing" },
  mobility: { sets: 1, reps: "8-10", durationSeconds: 0, intensity: "Easy range, no strain" },
  pelvic_floor: { sets: 3, reps: "5", durationSeconds: 0, intensity: "Gentle holds, full release" },
  strength: { sets: 2, reps: "8-12", durationSeconds: 0, intensity: "Controlled, keep breathing" },
  walking: { sets: 0, reps: "", durationSeconds: 900, intensity: "Conversational pace" },
  recovery: { sets: 0, reps: "", durationSeconds: 120, intensity: "Relaxed" },
};

/** Positive integer from an unknown value, or null. */
function positiveInt(value: unknown): number | null {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function targetCount(time: number): number {
  if (time <= 20) return 4;
  if (time <= 40) return 6;
  return 8;
}

/**
 * Deterministic safe session built directly from the pool — the fail-closed
 * fallback when the model returns an unvalidated response twice. Uses only pool
 * movements, ordered by category then slug, so it is fully reproducible.
 */
export function buildCannedSession(
  pool: Movement[],
  opts: { time: number; context?: PregnancyContext },
): PregnancyWorkout {
  const byCategoryThenSlug = (a: Movement, b: Movement) => {
    const ca = CANNED_CATEGORY_ORDER.indexOf(a.category);
    const cb = CANNED_CATEGORY_ORDER.indexOf(b.category);
    if (ca !== cb) return ca - cb;
    return a.slug.localeCompare(b.slug);
  };

  const total = Math.min(targetCount(opts.time), pool.length);
  const cap = opts.context ? getIntensityCap(opts.context.stageKey) : null;

  const chosen: Movement[] = [];
  const used = new Set<string>();

  // 1. Reserve the strength floor first, so strength can't be squeezed out by
  //    earlier-ordered categories. Deterministic: strength movements by slug.
  if (cap) {
    const strengthBySlug = pool
      .filter((m) => m.category === "strength")
      .sort((a, b) => a.slug.localeCompare(b.slug));
    const floor = Math.min(cap.strengthMovementTarget[0], strengthBySlug.length, total);
    for (const m of strengthBySlug.slice(0, floor)) {
      chosen.push(m);
      used.add(m.slug);
    }
  }

  // 2. Fill remaining slots in category order, skipping picks already made and
  //    capping strength at the band's max.
  const strengthMax = cap ? cap.strengthMovementTarget[1] : Infinity;
  for (const m of [...pool].sort(byCategoryThenSlug)) {
    if (chosen.length >= total) break;
    if (used.has(m.slug)) continue;
    if (
      m.category === "strength" &&
      chosen.filter((x) => x.category === "strength").length >= strengthMax
    ) {
      continue;
    }
    chosen.push(m);
    used.add(m.slug);
  }

  // 3. Present in a sensible order (warm-up first, recovery last).
  chosen.sort(byCategoryThenSlug);

  const structure: PregnancyStructureItem[] = chosen.map((m) => {
    const spec = CATEGORY_SPEC[m.category];
    // Strength items express the band's prescription (sets/reps/effort) when we
    // have a cap; other set-based categories keep their generic default shape.
    const strengthDosed = cap && m.category === "strength";
    return {
      slug: m.slug,
      movement: m.name,
      category: m.category,
      sets: strengthDosed ? cap!.setsPerMovement[0] : spec.sets,
      reps: strengthDosed ? `${cap!.repRange[0]}-${cap!.repRange[1]}` : spec.reps,
      durationSeconds: spec.durationSeconds,
      intensity: strengthDosed
        ? `RPE ${cap!.rpeCeiling}, keep ${cap!.rirFloor}+ reps in reserve`
        : spec.intensity,
      note: m.cues ?? "",
    };
  });

  return {
    focus: "Gentle pregnancy session",
    intensity: "Easy, breath-led",
    structure,
    flow: [],
    why: "A safe, gentle session assembled from your stage-appropriate movements.",
  };
}

/**
 * Resolve a validated model response into stored structure items, using the
 * pool's CANONICAL name/category per slug (the model cannot rename a movement).
 */
export function resolveStructure(
  parsed: unknown,
  poolBySlug: Map<string, Movement>,
): PregnancyStructureItem[] {
  const structure =
    parsed && typeof parsed === "object" && Array.isArray((parsed as Record<string, unknown>).structure)
      ? ((parsed as Record<string, unknown>).structure as Array<Record<string, unknown>>)
      : [];

  const items: PregnancyStructureItem[] = [];
  for (const raw of structure) {
    const slug = typeof raw.slug === "string" ? raw.slug : "";
    const m = poolBySlug.get(slug);
    if (!m) continue; // validated upstream; defensive

    // Category decides the SHAPE (set-based vs time-based); the model tunes the
    // numbers. This keeps the prescription sensible even if the model omits a
    // field or puts sets on a breathing drill.
    const spec = CATEGORY_SPEC[m.category];
    const setBased = spec.sets > 0;
    const modelReps = typeof raw.reps === "string" && raw.reps.trim() ? raw.reps.trim() : null;
    const modelIntensity =
      typeof raw.intensity === "string" && raw.intensity.trim() ? raw.intensity.trim() : null;

    items.push({
      slug: m.slug,
      movement: m.name,
      category: m.category,
      sets: setBased ? positiveInt(raw.sets) ?? spec.sets : 0,
      reps: setBased ? modelReps ?? spec.reps : "",
      durationSeconds: setBased ? 0 : positiveInt(raw.duration_seconds) ?? spec.durationSeconds,
      intensity: modelIntensity ?? spec.intensity,
      note: typeof raw.note === "string" ? raw.note : m.cues ?? "",
    });
  }
  return items;
}
