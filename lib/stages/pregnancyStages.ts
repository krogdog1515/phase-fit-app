/**
 * Pregnancy stage bands — deterministic scaffolding.
 *
 * SAFETY BOUNDARY
 * ---------------
 * This file lives on the deterministic side of the design line. Safety
 * decisions are NOT made here and NOT made by the LLM layer — they are made in
 * vetted, testable code and content authored separately.
 *
 * Populated fields that are purely structural / factual:
 *   - `key`, `weekStart`, `weekEnd`  -> straight from the agreed band table.
 *
 * `energyState` traces to the spec (T1 low / T2 stable / T3 deload), but the
 * six-band split forced one call the spec never made: the spec treats all of
 * T1 as a single 'low' band, so splitting it here left `t1_late` assigned
 * 'building'. That specific value is UNVERIFIED. `energyState` is therefore
 * treated exactly like the clinical fields below — TODO(clinical), reviewed
 * Friday with primary sources open. Nothing should read it until then.
 *
 * The clinical / safety fields below are INTENTIONALLY left as explicit
 * placeholders (null / empty array / 'TODO'):
 *   - `intensityCap`
 *   - `allowedCategories`
 *   - `exclusionFlags`
 *   - `weeklyVolumeTargetMin`
 *   - `messagingTone`
 *
 * Do NOT populate these here. They are being vetted against primary sources
 * separately. Inventing plausible-sounding clinical values is a safety hazard,
 * not a convenience.
 */

/** Stable identifiers for the six pregnancy stage bands. */
export type StageKey =
  | 't1_early'
  | 't1_late'
  | 't2_golden'
  | 't2_late'
  | 't3_early'
  | 't3_late';

/** Coaching energy descriptor for a band (non-clinical). */
export type EnergyState = 'low' | 'building' | 'stable' | 'deload';

/**
 * Movement categories, mirrored from the `movements` table check constraint.
 * Used only to type the (currently empty) `allowedCategories` placeholder.
 */
export type MovementCategory =
  | 'strength'
  | 'mobility'
  | 'breathing'
  | 'walking'
  | 'pelvic_floor'
  | 'recovery'
  | 'education';

export interface PregnancyStage {
  /** Stable band identifier. */
  key: StageKey;
  /** First gestational week in the band (inclusive). */
  weekStart: number;
  /** Last gestational week in the band (inclusive). */
  weekEnd: number;
  /** Coaching energy descriptor. TODO(clinical): unverified — reviewed Friday. */
  energyState: EnergyState;

  // --- Clinical / safety fields: intentional placeholders, do not invent. ---
  /** TODO(clinical): max intensity for the band. Vetted separately. */
  intensityCap: number | null;
  /** TODO(clinical): movement categories permitted in the band. */
  allowedCategories: MovementCategory[];
  /** TODO(clinical): exclusion flags that gate movements out of the band. */
  exclusionFlags: string[];
  /** TODO(clinical): minimum weekly volume target for the band. */
  weeklyVolumeTargetMin: number | null;
  /** TODO(clinical): messaging tone for the band. */
  messagingTone: string;
}

/**
 * The six pregnancy stage bands, contiguous and covering gestational weeks
 * 0–42 with no gaps or overlaps.
 */
export const PREGNANCY_STAGES: readonly PregnancyStage[] = [
  {
    key: 't1_early',
    weekStart: 0,
    weekEnd: 8,
    energyState: 'low', // TODO(clinical)
    intensityCap: null, // TODO(clinical)
    allowedCategories: [], // TODO(clinical)
    exclusionFlags: [], // TODO(clinical)
    weeklyVolumeTargetMin: null, // TODO(clinical)
    messagingTone: 'TODO', // TODO(clinical)
  },
  {
    key: 't1_late',
    weekStart: 9,
    weekEnd: 13,
    energyState: 'building', // TODO(clinical): unverified split of spec's all-of-T1 'low'
    intensityCap: null, // TODO(clinical)
    allowedCategories: [], // TODO(clinical)
    exclusionFlags: [], // TODO(clinical)
    weeklyVolumeTargetMin: null, // TODO(clinical)
    messagingTone: 'TODO', // TODO(clinical)
  },
  {
    key: 't2_golden',
    weekStart: 14,
    weekEnd: 20,
    energyState: 'stable', // TODO(clinical)
    intensityCap: null, // TODO(clinical)
    allowedCategories: [], // TODO(clinical)
    exclusionFlags: [], // TODO(clinical)
    weeklyVolumeTargetMin: null, // TODO(clinical)
    messagingTone: 'TODO', // TODO(clinical)
  },
  {
    key: 't2_late',
    weekStart: 21,
    weekEnd: 27,
    energyState: 'stable', // TODO(clinical)
    intensityCap: null, // TODO(clinical)
    allowedCategories: [], // TODO(clinical)
    exclusionFlags: [], // TODO(clinical)
    weeklyVolumeTargetMin: null, // TODO(clinical)
    messagingTone: 'TODO', // TODO(clinical)
  },
  {
    key: 't3_early',
    weekStart: 28,
    weekEnd: 33,
    energyState: 'deload', // TODO(clinical)
    intensityCap: null, // TODO(clinical)
    allowedCategories: [], // TODO(clinical)
    exclusionFlags: [], // TODO(clinical)
    weeklyVolumeTargetMin: null, // TODO(clinical)
    messagingTone: 'TODO', // TODO(clinical)
  },
  {
    key: 't3_late',
    weekStart: 34,
    weekEnd: 42,
    energyState: 'deload', // TODO(clinical)
    intensityCap: null, // TODO(clinical)
    allowedCategories: [], // TODO(clinical)
    exclusionFlags: [], // TODO(clinical)
    weeklyVolumeTargetMin: null, // TODO(clinical)
    messagingTone: 'TODO', // TODO(clinical)
  },
];
