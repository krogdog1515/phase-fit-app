import type { MovementCategory } from '../stages/pregnancyStages';

/**
 * Movement pattern, mirrored from the `movements.movement_pattern` CHECK
 * constraint (added + backfilled in production 2026-10-09). Strength rows carry
 * a real pattern; every non-strength row is `'none'`. Used to balance a session
 * (push/pull, squat/hinge) and to enforce the redundancy rule (no two strength
 * movements sharing both pattern and equipment).
 */
export type MovementPattern =
  | 'push'
  | 'pull'
  | 'squat'
  | 'hinge'
  | 'carry'
  | 'core'
  | 'isolation'
  | 'none';

/**
 * Movement tier, mirrored from the `movements.movement_tier` CHECK constraint
 * (added + backfilled in production 2026-10-09). Strength rows are `compound`
 * or `accessory`; every non-strength row is `'none'`. Drives the typed strength
 * slots (compound slots fill before accessory slots).
 */
export type MovementTier = 'compound' | 'accessory' | 'none';

/**
 * A movement from the vetted library (one row of `public.movements`).
 *
 * `min_stage` / `max_stage` are stored as plain strings (not `StageKey`) because
 * a row loaded from the DB could, in principle, carry an unrecognized value; the
 * stage filter validates them and fails closed rather than trusting the type.
 *
 * `movement_pattern` / `movement_tier` are NOT NULL with defaults in the DB, so
 * a live row always carries them; the composition code still reads them
 * defensively (treats a missing/unknown value as `'none'`) because a row could
 * predate a backfill in some environments.
 */
export type Movement = {
  slug: string;
  name: string;
  category: MovementCategory;
  min_stage: string;
  max_stage: string;
  focus_tags: string[];
  equipment: string[];
  exclusion_flags: string[];
  movement_pattern: MovementPattern;
  movement_tier: MovementTier;
  cues: string | null;
  modifications: string | null;
  source_ref?: string | null;
  benefit: string | null;
  media_url?: string | null;
};
