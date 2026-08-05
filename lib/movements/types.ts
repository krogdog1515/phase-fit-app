import type { MovementCategory } from '../stages/pregnancyStages';

/**
 * A movement from the vetted library (one row of `public.movements`).
 *
 * `min_stage` / `max_stage` are stored as plain strings (not `StageKey`) because
 * a row loaded from the DB could, in principle, carry an unrecognized value; the
 * stage filter validates them and fails closed rather than trusting the type.
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
  cues: string | null;
  modifications: string | null;
  source_ref?: string | null;
  benefit: string | null;
  media_url?: string | null;
};
