import type { StageKey } from "@/lib/stages/pregnancyStages";

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
