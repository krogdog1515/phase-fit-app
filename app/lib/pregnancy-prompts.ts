import type { Movement } from "@/lib/movements/types";
import type { StageKey, MovementCategory } from "@/lib/stages/pregnancyStages";
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
};

/** One prescribed movement in a pregnancy session (stored + returned). */
export type PregnancyStructureItem = {
  slug: string;
  movement: string; // canonical name, resolved from the pool by slug
  category: MovementCategory;
  prescription: string;
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
  "intensity": "Gentle, breath-led descriptor (no RPE maxing, no numbers that imply strain)",
  "structure": [
    {
      "slug": "exact_slug_from_the_candidate_list",
      "prescription": "Sets/time/reps in plain language (e.g. '2 sets of 8-12', '5 minutes')",
      "note": "One short coaching cue"
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

Sequence a sensible, gentle session that fits the requested time. Order it well
(warm-up / breathing early, harder strength in the middle, recovery late) using
only what the list offers. The stage band and gestational week are for coaching
voice only — they do not authorize anything outside the list.

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

export function buildPregnancyUserMessage(
  candidates: Movement[],
  ctx: PregnancyContext,
): string {
  const band = STAGE_BAND_LABELS[ctx.stageKey] ?? ctx.stageKey;
  const list = candidates.map(candidateLine).join("\n");
  return `
Client context (for coaching voice only):
- Stage: ${band}
- Gestational week: ${ctx.gestationalWeek}
- Session length: ${ctx.time} minutes

CANDIDATE LIST — select and sequence from these ONLY, by slug:
${list}

Build one session that fits ${ctx.time} minutes. Use only slugs from the list above.
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

/** Generic, non-clinical default prescription per category for the fallback. */
const CANNED_PRESCRIPTION: Record<MovementCategory, string> = {
  education: "Include at the start and end of your session.",
  breathing: "5 minutes, slow nasal breathing.",
  mobility: "1-2 minutes, easy range.",
  pelvic_floor: "2-3 sets of gentle holds.",
  strength: "1-2 sets of 8-12, controlled.",
  walking: "10-20 minutes, conversational pace.",
  recovery: "2-3 minutes.",
};

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
  const ordered = [...pool].sort((a, b) => {
    const ca = CANNED_CATEGORY_ORDER.indexOf(a.category);
    const cb = CANNED_CATEGORY_ORDER.indexOf(b.category);
    if (ca !== cb) return ca - cb;
    return a.slug.localeCompare(b.slug);
  });

  const chosen = ordered.slice(0, Math.min(targetCount(opts.time), ordered.length));

  const structure: PregnancyStructureItem[] = chosen.map((m) => ({
    slug: m.slug,
    movement: m.name,
    category: m.category,
    prescription: CANNED_PRESCRIPTION[m.category] ?? "As able.",
    note: m.cues ?? "",
  }));

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
    items.push({
      slug: m.slug,
      movement: m.name,
      category: m.category,
      prescription: typeof raw.prescription === "string" ? raw.prescription : "As able.",
      note: typeof raw.note === "string" ? raw.note : m.cues ?? "",
    });
  }
  return items;
}
