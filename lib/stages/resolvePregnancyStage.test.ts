import { describe, it, expect } from 'vitest';
import { resolvePregnancyStage } from './resolvePregnancyStage';
import type { StageKey } from './pregnancyStages';

const MS_PER_DAY = 86_400_000;
const TERM_DAYS = 280;

/** Fixed reference "now" used across the deterministic tests (UTC midnight). */
const TODAY = new Date('2026-06-01T00:00:00.000Z');
const TODAY_TS = Date.UTC(2026, 5, 1);

/** Format a UTC timestamp as a `YYYY-MM-DD` string. */
function isoDate(ts: number): string {
  const d = new Date(ts);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Build the due-date string that yields a given gestational week relative to
 * TODAY. `dayWithinWeek` (0–6) nudges within the week to exercise flooring.
 *
 *   gestationalDays = 7*week + dayWithinWeek
 *   daysUntilDue    = TERM_DAYS - gestationalDays
 *   anchor          = TODAY + daysUntilDue
 */
function anchorForWeek(week: number, dayWithinWeek = 0): string {
  const gestationalDays = 7 * week + dayWithinWeek;
  const daysUntilDue = TERM_DAYS - gestationalDays;
  return isoDate(TODAY_TS + daysUntilDue * MS_PER_DAY);
}

/** Expected band for a gestational week, straight from the agreed table. */
const BANDS: ReadonlyArray<[number, number, StageKey]> = [
  [0, 8, 't1_early'],
  [9, 13, 't1_late'],
  [14, 20, 't2_golden'],
  [21, 27, 't2_late'],
  [28, 33, 't3_early'],
  [34, 42, 't3_late'],
];

function expectedBand(week: number): StageKey {
  const found = BANDS.find(([lo, hi]) => week >= lo && week <= hi);
  if (!found) throw new Error(`test bug: no band for week ${week}`);
  return found[2];
}

describe('resolvePregnancyStage — every gestational week 0..42', () => {
  for (let week = 0; week <= 42; week++) {
    it(`week ${week} -> ${expectedBand(week)}`, () => {
      const result = resolvePregnancyStage(anchorForWeek(week), TODAY);
      expect(result).toEqual({
        ok: true,
        stageKey: expectedBand(week),
        gestationalWeek: week,
      });
    });
  }
});

describe('resolvePregnancyStage — band boundaries', () => {
  const boundaries: ReadonlyArray<[number, StageKey, number, StageKey]> = [
    [8, 't1_early', 9, 't1_late'],
    [13, 't1_late', 14, 't2_golden'],
    [20, 't2_golden', 21, 't2_late'],
    [27, 't2_late', 28, 't3_early'],
    [33, 't3_early', 34, 't3_late'],
  ];

  for (const [lastWeek, lastKey, firstWeek, firstKey] of boundaries) {
    it(`${lastWeek} stays ${lastKey}, ${firstWeek} flips to ${firstKey}`, () => {
      expect(resolvePregnancyStage(anchorForWeek(lastWeek), TODAY)).toEqual({
        ok: true,
        stageKey: lastKey,
        gestationalWeek: lastWeek,
      });
      expect(resolvePregnancyStage(anchorForWeek(firstWeek), TODAY)).toEqual({
        ok: true,
        stageKey: firstKey,
        gestationalWeek: firstWeek,
      });
    });
  }
});

describe('resolvePregnancyStage — flooring to whole weeks', () => {
  it('any day within a gestational week floors down to that week', () => {
    for (let dayWithinWeek = 0; dayWithinWeek <= 6; dayWithinWeek++) {
      const result = resolvePregnancyStage(
        anchorForWeek(20, dayWithinWeek),
        TODAY,
      );
      expect(result).toEqual({
        ok: true,
        stageKey: 't2_golden',
        gestationalWeek: 20,
      });
    }
  });
});

describe('resolvePregnancyStage — range edges', () => {
  it('week 0 (conception-ish, 280 days out) resolves', () => {
    expect(resolvePregnancyStage(anchorForWeek(0), TODAY)).toEqual({
      ok: true,
      stageKey: 't1_early',
      gestationalWeek: 0,
    });
  });

  it('week 42 (14 days past due) still resolves', () => {
    expect(resolvePregnancyStage(anchorForWeek(42), TODAY)).toEqual({
      ok: true,
      stageKey: 't3_late',
      gestationalWeek: 42,
    });
  });

  it('week 43 (beyond term) is out_of_range', () => {
    // 21 days past due -> gestationalWeek 43.
    const anchor = isoDate(TODAY_TS - 21 * MS_PER_DAY);
    expect(resolvePregnancyStage(anchor, TODAY)).toEqual({
      ok: false,
      reason: 'out_of_range',
    });
  });

  it('week -1 (just over 280 days out) is out_of_range', () => {
    const anchor = isoDate(TODAY_TS + 287 * MS_PER_DAY);
    expect(resolvePregnancyStage(anchor, TODAY)).toEqual({
      ok: false,
      reason: 'out_of_range',
    });
  });
});

describe('resolvePregnancyStage — failure cases', () => {
  it('null anchor -> no_anchor', () => {
    expect(resolvePregnancyStage(null, TODAY)).toEqual({
      ok: false,
      reason: 'no_anchor',
    });
  });

  it('anchor far in the future (> 280 days out) -> out_of_range', () => {
    const anchor = isoDate(TODAY_TS + 300 * MS_PER_DAY);
    expect(resolvePregnancyStage(anchor, TODAY)).toEqual({
      ok: false,
      reason: 'out_of_range',
    });
  });

  it('anchor in the past beyond term -> out_of_range', () => {
    const anchor = isoDate(TODAY_TS - 60 * MS_PER_DAY);
    expect(resolvePregnancyStage(anchor, TODAY)).toEqual({
      ok: false,
      reason: 'out_of_range',
    });
  });

  it.each([
    ['not-a-date'],
    ['06/01/2026'],
    ['2026-13-01'], // month 13
    ['2026-02-30'], // Feb 30 does not exist
    ['2026-6-1'], // not zero-padded
    ['2026-10-15T12:00:00Z'], // datetime, not a bare due date
    [''],
    ['   '],
  ])('unparseable anchor %j -> invalid_date', (bad) => {
    expect(resolvePregnancyStage(bad, TODAY)).toEqual({
      ok: false,
      reason: 'invalid_date',
    });
  });
});

describe('resolvePregnancyStage — timezone sanity', () => {
  it('same calendar date resolves identically regardless of time component', () => {
    const anchor = '2026-10-15';
    const times = [
      '2026-06-01T00:00:00.000Z',
      '2026-06-01T06:30:00.000Z',
      '2026-06-01T12:00:00.000Z',
      '2026-06-01T23:59:59.999Z',
    ];
    const results = times.map((t) =>
      resolvePregnancyStage(anchor, new Date(t)),
    );
    for (const r of results) {
      expect(r).toEqual(results[0]);
    }
    // And it is a real, resolved stage (not a fail-closed short-circuit).
    expect(results[0].ok).toBe(true);
  });
});
