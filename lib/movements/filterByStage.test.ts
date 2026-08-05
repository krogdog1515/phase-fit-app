import { describe, it, expect } from 'vitest';
import { filterMovementsByStage, filterByEquipment } from './filterByStage';
import { STAGE_ORDER } from '../stages/pregnancyStages';
import type { Movement } from './types';

function mv(over: Partial<Movement> & Pick<Movement, 'slug'>): Movement {
  return {
    name: over.slug,
    category: 'strength',
    min_stage: 't1_early',
    max_stage: 't3_late',
    focus_tags: [],
    equipment: [],
    exclusion_flags: [],
    cues: null,
    modifications: null,
    benefit: null,
    ...over,
  };
}

const FULL = mv({ slug: 'full', min_stage: 't1_early', max_stage: 't3_late' });
const PUSHUP = mv({ slug: 'pushup', min_stage: 't1_early', max_stage: 't2_golden' });
const T3ONLY = mv({ slug: 't3only', min_stage: 't3_early', max_stage: 't3_late' });
const INVERTED = mv({ slug: 'inverted', min_stage: 't2_late', max_stage: 't1_early' });
const BAD_MIN = mv({ slug: 'bad_min', min_stage: 'foo', max_stage: 't3_late' });
const BAD_MAX = mv({ slug: 'bad_max', min_stage: 't1_early', max_stage: 'bar' });

const ALL = [FULL, PUSHUP, T3ONLY, INVERTED, BAD_MIN, BAD_MAX];

describe('filterMovementsByStage — expected subset per band', () => {
  const expectedByBand: Record<string, string[]> = {
    t1_early: ['full', 'pushup'],
    t1_late: ['full', 'pushup'],
    t2_golden: ['full', 'pushup'],
    t2_late: ['full'],
    t3_early: ['full', 't3only'],
    t3_late: ['full', 't3only'],
  };

  STAGE_ORDER.forEach((band) => {
    it(`${band} -> ${expectedByBand[band].join(', ')}`, () => {
      const slugs = filterMovementsByStage(ALL, band).map((m) => m.slug);
      expect(slugs.sort()).toEqual([...expectedByBand[band]].sort());
    });
  });
});

describe('filterMovementsByStage — fail closed', () => {
  it('inverted range (min after max) is excluded from every band', () => {
    STAGE_ORDER.forEach((band) => {
      expect(filterMovementsByStage([INVERTED], band)).toEqual([]);
    });
  });

  it('a movement with a non-literal min_stage is excluded', () => {
    expect(filterMovementsByStage([BAD_MIN], 't1_early')).toEqual([]);
  });

  it('a movement with a non-literal max_stage is excluded', () => {
    expect(filterMovementsByStage([BAD_MAX], 't1_early')).toEqual([]);
  });

  it('an unrecognized stageKey returns []', () => {
    // @ts-expect-error — deliberately passing an invalid stage key.
    expect(filterMovementsByStage(ALL, 'not_a_stage')).toEqual([]);
  });
});

describe('filterByEquipment', () => {
  const band = [
    mv({ slug: 'bodyweight', equipment: [] }),
    mv({ slug: 'needs_band', equipment: ['band'] }),
    mv({ slug: 'needs_dumbbell', equipment: ['dumbbell'] }),
    mv({ slug: 'needs_two', equipment: ['band', 'bench'] }),
  ];

  it('no equipment available -> only bodyweight', () => {
    expect(filterByEquipment(band, []).map((m) => m.slug)).toEqual(['bodyweight']);
  });

  it('band available -> bodyweight + needs_band', () => {
    expect(filterByEquipment(band, ['band']).map((m) => m.slug).sort()).toEqual(
      ['bodyweight', 'needs_band'].sort(),
    );
  });

  it('requires ALL listed equipment (subset, not intersection)', () => {
    expect(filterByEquipment(band, ['band']).map((m) => m.slug)).not.toContain('needs_two');
    expect(
      filterByEquipment(band, ['band', 'bench']).map((m) => m.slug),
    ).toContain('needs_two');
  });
});
