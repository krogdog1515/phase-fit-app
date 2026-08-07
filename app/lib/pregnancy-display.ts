import type { StageKey, IntensityCap } from "@/lib/stages/pregnancyStages";
import { getIntensityCap } from "@/lib/stages/pregnancyStages";
import type { CoachingDisplay } from "./coaching-display";

/**
 * Human-readable labels for the six pregnancy stage bands.
 *
 * These are STRUCTURAL descriptors of the band boundaries (which trimester,
 * early/late), not clinical guidance and NOT a characterization of how she'll
 * feel. Deliberately no "golden window" or energy language — if she feels awful
 * at week 16, a promise about her experience reads as out of touch. Anything
 * clinical (intensity, allowed movements, tone) still lives behind the
 * TODO(clinical) placeholders in lib/stages/pregnancyStages.ts, not here.
 */
export const STAGE_BAND_LABELS: Record<StageKey, string> = {
  t1_early: "First trimester · early",
  t1_late: "First trimester · late",
  t2_golden: "Second trimester",
  t2_late: "Second trimester · late",
  t3_early: "Third trimester · early",
  t3_late: "Third trimester · late",
};

/** User-facing load guidance for the coaching card (enum -> plain sentence). */
const CARD_LOAD_GUIDANCE: Record<IntensityCap["loadGuidance"], string> = {
  maintain: "Maintain your usual working load.",
  reduce_load_increase_reps: "Lighter load than usual, with a few more reps.",
  deload: "Deload — noticeably lighter, focused on movement quality.",
};

/**
 * Build the pregnancy coaching card from deterministic band data — the same
 * CoachingDisplay shape the cycle card uses, so it renders through the same
 * component and sections.
 *
 * COACH'S NOTE is the band's vetted `coachingRationale` VERBATIM. It is read
 * from the cap, never generated: the model may quote or paraphrase this text but
 * must never author its own physiological explanation, and the card shows the
 * source directly.
 */
export function buildPregnancyCoachingDisplay(input: {
  stageKey: StageKey;
  gestationalWeek: number;
  priorActivityLevel?: string | null;
  recentSessionCount?: number;
}): CoachingDisplay {
  const cap = getIntensityCap(input.stageKey);
  const bandLabel = STAGE_BAND_LABELS[input.stageKey] ?? input.stageKey;

  const noticed: string[] = [];
  if (input.priorActivityLevel) {
    noticed.push(`Prior activity level: ${input.priorActivityLevel}.`);
  }
  noticed.push(`Stage: ${bandLabel}, week ${input.gestationalWeek}.`);
  if (input.recentSessionCount && input.recentSessionCount > 0) {
    const n = input.recentSessionCount;
    noticed.push(`Building on your last ${n} session${n === 1 ? "" : "s"}.`);
  }

  const [repMin, repMax] = cap.repRange;
  const adjustments: string[] = [
    `${repMin}-${repMax} reps per set, keeping at least ${cap.rirFloor} in reserve (RPE ${cap.rpeCeiling} ceiling).`,
    CARD_LOAD_GUIDANCE[cap.loadGuidance],
  ];

  return {
    phase: `Pregnancy · Week ${input.gestationalWeek} · ${bandLabel}`,
    noticed,
    adjustments,
    coachNote: cap.coachingRationale,
  };
}
