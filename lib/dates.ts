/**
 * Calendar-date helpers for the daily check-in gate.
 *
 * "Today" is the USER'S LOCAL calendar day, not UTC. Sacramento is UTC-7/-8, so
 * UTC midnight is late afternoon local — a UTC-based "today" would demand a
 * fresh check-in every evening. The client therefore sends its local date and
 * the server validates it is plausible (within a day of UTC now). The check-in
 * is self-reported anyway, so a client-chosen day boundary is the right trust
 * model; the red-flag verdict is still computed server-side regardless.
 */

/** Local calendar date as `YYYY-MM-DD`, from the Date's LOCAL components. */
export function localDateISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Accept a client-sent date only if it is a well-formed `YYYY-MM-DD` real date
 * within one day either side of UTC `now`. Rejects malformed or absurd values so
 * they can't be used to point the gate at some other day's check-in.
 *
 * `now` is injected for determinism (no `new Date()` inside).
 */
export function isAcceptableClientDate(raw: unknown, now: Date): raw is string {
  if (typeof raw !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return false;
  const ts = Date.parse(`${raw}T00:00:00.000Z`);
  if (Number.isNaN(ts)) return false;
  const utcToday = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.abs(ts - utcToday) <= 86_400_000; // within 1 day either side
}
