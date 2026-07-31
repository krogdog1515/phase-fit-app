import { PREGNANCY_STAGES, type StageKey } from './pregnancyStages';

/**
 * Discriminated result of resolving a pregnancy stage.
 *
 * FAIL CLOSED: any input we cannot confidently resolve returns `ok: false`.
 * Callers MUST treat `ok: false` as "do not generate a workout". We never
 * guess or clamp an out-of-range value into a band.
 */
export type StageResult =
  | { ok: true; stageKey: StageKey; gestationalWeek: number }
  | { ok: false; reason: 'no_anchor' | 'out_of_range' | 'invalid_date' };

/** Days in a full-term pregnancy, measured from LMP to estimated due date. */
const TERM_DAYS = 280;
const MS_PER_DAY = 86_400_000;

/**
 * Parse a strict `YYYY-MM-DD` calendar date to a UTC-midnight timestamp.
 *
 * Returns `null` for anything that is not a real calendar date in that exact
 * format (wrong shape, month 13, Feb 30, etc.). Parsing in UTC keeps the
 * function deterministic and independent of the host machine's timezone.
 */
function parseAnchorToUtcMidnight(raw: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw.trim());
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  const ts = Date.UTC(year, month - 1, day);
  const dt = new Date(ts);
  // Round-trip check rejects overflow dates (e.g. 2026-02-30 -> March).
  if (
    dt.getUTCFullYear() !== year ||
    dt.getUTCMonth() !== month - 1 ||
    dt.getUTCDate() !== day
  ) {
    return null;
  }
  return ts;
}

/** UTC-midnight timestamp for the calendar date of `today` (time discarded). */
function toUtcMidnight(today: Date): number {
  return Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
}

/**
 * Resolve a pregnancy stage from an estimated due date.
 *
 * Pure and deterministic: no I/O, no Supabase/OpenAI, no `new Date()` inside.
 * `today` is injected so tests can pin it.
 *
 * @param anchorDate Estimated due date as `YYYY-MM-DD`, or `null` if unset.
 * @param today      The reference "now" (only its UTC calendar date is used).
 *
 * Gestational age = TERM_DAYS − days-until-due, floored to whole weeks.
 * Weeks 0–42 resolve to a band; anything outside is `out_of_range`.
 */
export function resolvePregnancyStage(
  anchorDate: string | null,
  today: Date,
): StageResult {
  if (anchorDate === null) {
    return { ok: false, reason: 'no_anchor' };
  }

  const anchorTs = parseAnchorToUtcMidnight(anchorDate);
  if (anchorTs === null) {
    return { ok: false, reason: 'invalid_date' };
  }

  const todayTs = toUtcMidnight(today);
  const daysUntilDue = Math.round((anchorTs - todayTs) / MS_PER_DAY);
  const gestationalDays = TERM_DAYS - daysUntilDue;
  const gestationalWeek = Math.floor(gestationalDays / 7);

  const band = PREGNANCY_STAGES.find(
    (stage) =>
      gestationalWeek >= stage.weekStart && gestationalWeek <= stage.weekEnd,
  );

  // No band -> out of the 0–42 range (or an unusable `today`). Fail closed.
  if (!band) {
    return { ok: false, reason: 'out_of_range' };
  }

  return { ok: true, stageKey: band.key, gestationalWeek };
}
