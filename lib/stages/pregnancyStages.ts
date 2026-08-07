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
 * treated as TODO(clinical), reviewed with primary sources open. Nothing should
 * read it until then.
 *
 * `intensityCap` is VETTED clinical content. Its MACHINE fields (rpeCeiling,
 * repRange, rirFloor, setsPerMovement, strengthMovementTarget, loadGuidance,
 * weeklyVolumeTargetMin) are deterministic inputs that CONSTRAIN generation.
 * `coachingRationale` is user-facing text the model may quote or paraphrase but
 * must NEVER author itself — same boundary as `movements.benefit`. Provenance
 * is tagged inline: [S] sourced, [J] judgment calibrated against sourced values.
 *
 * Still intentional, fail-closed placeholders — do NOT invent:
 *   - `allowedCategories` ([]): the conservative subset for the (clinically
 *     unvetted) provider_conversation screening state. Empty IS the fail-closed
 *     value; leave it empty until vetted.
 *   - `exclusionFlags` ([]): vetted separately.
 */

/** Stable identifiers for the six pregnancy stage bands. */
export type StageKey =
  | 't1_early'
  | 't1_late'
  | 't2_golden'
  | 't2_late'
  | 't3_early'
  | 't3_late';

/**
 * The six bands in chronological order. Structural (not clinical): it only
 * encodes which band comes before which, used to test whether a movement's
 * [min_stage, max_stage] range covers a given band.
 */
export const STAGE_ORDER: readonly StageKey[] = [
  't1_early',
  't1_late',
  't2_golden',
  't2_late',
  't3_early',
  't3_late',
];

/**
 * Ordinal (0..5) of a stage key, or `null` if it is not one of the six literals.
 * Callers MUST treat `null` as "cannot place" and fail closed — never coerce it
 * to 0 or include a movement they can't position.
 */
export function stageOrdinal(key: string): number | null {
  const i = STAGE_ORDER.indexOf(key as StageKey);
  return i === -1 ? null : i;
}

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

/**
 * Vetted, per-band training constraints.
 *
 * MACHINE FIELDS constrain what the generator produces — they are deterministic
 * inputs, not suggestions. `coachingRationale` is the ONLY user-facing field:
 * vetted text the model may quote or paraphrase but must never generate itself.
 */
export type IntensityCap = {
  /** Field method for aerobic effort. */
  method: 'talk_test';
  /** 1-10 perceived exertion. Generation must NEVER exceed this. */
  rpeCeiling: number;
  repRange: [number, number];
  /** Minimum reps left in the tank. Generation must NEVER go below this. */
  rirFloor: number;
  setsPerMovement: [number, number];
  strengthMovementTarget: [number, number];
  loadGuidance: 'maintain' | 'reduce_load_increase_reps' | 'deload';
  weeklyVolumeTargetMin: 150;
  /**
   * VETTED user-facing text. The model READS this to explain why today's
   * session looks the way it does and may quote or paraphrase it; it must
   * NEVER generate its own physiological explanation. Same boundary as
   * `movements.benefit`.
   */
  coachingRationale: string;
  sourceRef: string;
};

export interface PregnancyStage {
  /** Stable band identifier. */
  key: StageKey;
  /** First gestational week in the band (inclusive). */
  weekStart: number;
  /** Last gestational week in the band (inclusive). */
  weekEnd: number;
  /** Coaching energy descriptor. TODO(clinical): unverified — reviewed with sources. */
  energyState: EnergyState;

  /** Vetted training constraints + coaching rationale for the band. */
  intensityCap: IntensityCap;

  // --- Intentional fail-closed placeholders: do not invent. ---
  /** Fail-closed: conservative category subset for provider_conversation (unvetted). Empty on purpose. */
  allowedCategories: MovementCategory[];
  /** TODO(clinical): exclusion flags that gate movements out of the band. */
  exclusionFlags: string[];
}

/**
 * The six pregnancy stage bands, contiguous and covering gestational weeks
 * 0–42 with no gaps or overlaps.
 */
export const PREGNANCY_STAGES: readonly PregnancyStage[] = [
  // ── WEEKS 0-8 ──────────────────────────────────────────────────────────────
  {
    key: 't1_early',
    weekStart: 0,
    weekEnd: 8,
    energyState: 'low', // TODO(clinical)
    allowedCategories: [], // fail-closed: unvetted provider_conversation subset
    exclusionFlags: [], // TODO(clinical)
    intensityCap: {
      method: 'talk_test',
      rpeCeiling: 7, // [J]
      repRange: [10, 15], // [J] — OB guidance: reduce load, raise reps
      rirFloor: 3, // [J]
      setsPerMovement: [2, 3], // [J]
      strengthMovementTarget: [3, 5], // [J]
      loadGuidance: 'reduce_load_increase_reps',
      weeklyVolumeTargetMin: 150, // [S] SOGC/CSEP 2019 Rec 2
      coachingRationale:
        "Nothing structural has changed yet — your uterus hasn't risen out of your pelvis, your centre of " +
        "gravity is where it's always been, and there's no bump to work around. What has changed is how you " +
        "feel: nausea and fatigue usually peak somewhere in weeks 6 to 10. So the limiter right now is " +
        "symptoms, not capacity. We keep the same movements you already know, drop the load, add a couple of " +
        "reps, and let your daily check-in decide how hard any given day goes. Staying active from the first " +
        "trimester is associated with better outcomes than stopping — this isn't a season to sit out.",
      sourceRef:
        'SOGC/CSEP 2019 (T1 activity not associated with increased miscarriage or anomaly risk; inactivity ' +
        'associated with higher complication odds) · Duchette 2024 IJWH · OB guidance 8/3/26',
    },
  },

  // ── WEEKS 9-13 ─────────────────────────────────────────────────────────────
  {
    key: 't1_late',
    weekStart: 9,
    weekEnd: 13,
    energyState: 'building', // TODO(clinical): unverified split of spec's all-of-T1 'low'
    allowedCategories: [], // fail-closed: unvetted provider_conversation subset
    exclusionFlags: [], // TODO(clinical)
    intensityCap: {
      method: 'talk_test',
      rpeCeiling: 7, // [J]
      repRange: [10, 15], // [J]
      rirFloor: 3, // [J]
      setsPerMovement: [2, 4], // [J]
      strengthMovementTarget: [3, 5], // [J]
      loadGuidance: 'reduce_load_increase_reps',
      weeklyVolumeTargetMin: 150, // [S] SOGC/CSEP 2019 Rec 2
      coachingRationale:
        "Most women start feeling more like themselves through these weeks — nausea and fatigue commonly ease " +
        "toward the end of the first trimester. Still no anatomical restrictions, so if energy is coming back, " +
        "this is where you rebuild rhythm and consistency. Same loads-lighter, reps-higher approach; we add " +
        "volume before we add weight.",
      sourceRef: 'SOGC/CSEP 2019 · Duchette 2024 IJWH · OB guidance 8/3/26',
    },
  },

  // ── WEEKS 14-20 ────────────────────────────────────────────────────────────
  {
    key: 't2_golden',
    weekStart: 14,
    weekEnd: 20,
    energyState: 'stable', // TODO(clinical)
    allowedCategories: [], // fail-closed: unvetted provider_conversation subset
    exclusionFlags: [], // TODO(clinical)
    intensityCap: {
      method: 'talk_test',
      rpeCeiling: 8, // [J] — highest of any band
      repRange: [8, 12], // [J]
      rirFloor: 2, // [J]
      setsPerMovement: [3, 4], // [J]
      strengthMovementTarget: [4, 6], // [J]
      loadGuidance: 'maintain',
      weeklyVolumeTargetMin: 150, // [S] SOGC/CSEP 2019 Rec 2
      coachingRationale:
        "This is the strongest training window of the pregnancy, and it isn't folklore — the main randomised " +
        "trial of moderate-to-vigorous resistance training in pregnancy ran precisely through weeks 14 to 25. " +
        "Early symptoms have usually settled and the bump isn't limiting positions yet. If you're going to " +
        "build strength anywhere in these nine months, it's here. We hold reps a little higher than you'd use " +
        "outside pregnancy and keep a couple in reserve, but this is a real training block.",
      sourceRef:
        'Petrov Fieril 2015 RCT, Acta Obstet Gynecol Scand (weeks 14-25, supervised moderate-to-vigorous RT, ' +
        'twice weekly) · Duchette 2024 IJWH · SOGC/CSEP 2019 Rec 4 (high-quality evidence)',
    },
  },

  // ── WEEKS 21-27 ────────────────────────────────────────────────────────────
  {
    key: 't2_late',
    weekStart: 21,
    weekEnd: 27,
    energyState: 'stable', // TODO(clinical)
    allowedCategories: [], // fail-closed: unvetted provider_conversation subset
    exclusionFlags: [], // TODO(clinical)
    intensityCap: {
      method: 'talk_test',
      rpeCeiling: 7, // [J]
      repRange: [10, 15], // [J]
      rirFloor: 3, // [J]
      setsPerMovement: [2, 4], // [J]
      strengthMovementTarget: [3, 5], // [J]
      loadGuidance: 'reduce_load_increase_reps',
      weeklyVolumeTargetMin: 150, // [S] SOGC/CSEP 2019 Rec 2
      coachingRationale:
        "Still a strong training window — what changes is positioning, not capacity. Lying flat on your back " +
        "can start to feel wrong for some women as the uterus presses on the big vein returning blood to your " +
        "heart, so pressing moves to an incline. Balance-dependent work like free-standing lunges starts to " +
        "come out. Note we're changing *how* things are done rather than whether — you're still lifting.",
      sourceRef:
        'Duchette 2024 IJWH (supine venous return; inclined bench as the named modification; balance caution) · ' +
        'SOGC/CSEP 2019 Rec 6 (supine is symptom-triggered, not calendar-triggered)',
    },
  },

  // ── WEEKS 28-33 ────────────────────────────────────────────────────────────
  {
    key: 't3_early',
    weekStart: 28,
    weekEnd: 33,
    energyState: 'deload', // TODO(clinical)
    allowedCategories: [], // fail-closed: unvetted provider_conversation subset
    exclusionFlags: [], // TODO(clinical)
    intensityCap: {
      method: 'talk_test',
      rpeCeiling: 6, // [J]
      repRange: [10, 15], // [J]
      rirFloor: 4, // [J]
      setsPerMovement: [2, 3], // [J]
      strengthMovementTarget: [3, 4], // [J]
      loadGuidance: 'reduce_load_increase_reps',
      weeklyVolumeTargetMin: 150, // [S] SOGC/CSEP 2019 Rec 2
      coachingRationale:
        "Your centre of gravity has moved forward and relaxin has loosened your joints — together that means " +
        "more range of motion than you're used to and a higher injury risk in movements that ask for balance " +
        "or speed. So we shift toward supported and bilateral work: both feet down, something to hold, nothing " +
        "explosive. Strength work continues. Strong glutes and a strong upper back are what carry you through " +
        "the last stretch, and around three in four pregnant women get back pain — this is the direct defence.",
      sourceRef:
        'Duchette 2024 IJWH (centre of gravity, relaxin, joint laxity, ballistic movement caution; ~76% back ' +
        'pain prevalence) · SOGC/CSEP 2019 (warm-up/cool-down, ligament laxity)',
    },
  },

  // ── WEEKS 34-42 ────────────────────────────────────────────────────────────
  {
    key: 't3_late',
    weekStart: 34,
    weekEnd: 42,
    energyState: 'deload', // TODO(clinical)
    allowedCategories: [], // fail-closed: unvetted provider_conversation subset
    exclusionFlags: [], // TODO(clinical)
    intensityCap: {
      method: 'talk_test',
      rpeCeiling: 5, // [J]
      repRange: [12, 20], // [J]
      rirFloor: 5, // [J]
      setsPerMovement: [2, 3], // [J]
      strengthMovementTarget: [2, 3], // [J]
      loadGuidance: 'deload',
      weeklyVolumeTargetMin: 150, // [S] SOGC/CSEP 2019 Rec 2
      coachingRationale:
        "Your blood volume and cardiac output are near their peak and your body is doing an enormous amount of " +
        "work at rest. Volume comes down and the emphasis shifts to mobility, breathing and preparing for " +
        "delivery. Keep moving — women who trained through pregnancy tended to have a shorter first stage of " +
        "labour and fewer operative deliveries — but this is maintenance and preparation, not building. " +
        "Anything that feels like effort today probably is.",
      sourceRef:
        'Duchette 2024 IJWH (shorter first stage of labour, lower operative delivery incidence with supervised ' +
        'RT) · SOGC/CSEP 2019',
    },
  },
];

/**
 * The band's vetted training constraints. `key` is one of the six literals
 * (it comes from resolvePregnancyStage), so this always resolves; the throw is
 * a defensive guard for an impossible input, never expected at runtime.
 */
export function getIntensityCap(key: StageKey): IntensityCap {
  const band = PREGNANCY_STAGES.find((s) => s.key === key);
  if (!band) throw new Error(`getIntensityCap: unknown stage key ${key}`);
  return band.intensityCap;
}
