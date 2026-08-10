import { describe, it, expect } from 'vitest';
import {
  evaluateRedFlags,
  RED_FLAG_KEYS,
  type RedFlagAnswers,
} from './redFlags';

/** All-clear baseline: every flag 'no'. */
function allNo(): RedFlagAnswers {
  return {
    bleeding: 'no',
    fluidLeak: 'no',
    contractions: 'no',
    chestPain: 'no',
    dizziness: 'no',
    breathlessness: 'no',
  };
}

describe('evaluateRedFlags', () => {
  it('all "no" does not block', () => {
    const r = evaluateRedFlags(allNo());
    expect(r.blocked).toBe(false);
    expect(r.triggered).toEqual([]);
  });

  it('each flag alone (yes) blocks and is the only one triggered', () => {
    for (const key of RED_FLAG_KEYS) {
      const answers = { ...allNo(), [key]: 'yes' };
      const r = evaluateRedFlags(answers);
      expect(r.blocked).toBe(true);
      expect(r.triggered).toEqual([key]);
    }
  });

  it('"unsure" behaves exactly like "yes"', () => {
    for (const key of RED_FLAG_KEYS) {
      const r = evaluateRedFlags({ ...allNo(), [key]: 'unsure' });
      expect(r.blocked).toBe(true);
      expect(r.triggered).toEqual([key]);
    }
  });

  it('multiple positives are all reported', () => {
    const r = evaluateRedFlags({
      ...allNo(),
      bleeding: 'yes',
      dizziness: 'unsure',
    });
    expect(r.blocked).toBe(true);
    expect(r.triggered).toEqual(['bleeding', 'dizziness']);
  });

  it('fails closed on missing / undefined / non-object input', () => {
    // @ts-expect-error deliberately wrong
    expect(evaluateRedFlags(undefined).blocked).toBe(true);
    // @ts-expect-error deliberately wrong
    expect(evaluateRedFlags(null).blocked).toBe(true);
    // @ts-expect-error deliberately wrong
    expect(evaluateRedFlags('yes').blocked).toBe(true);
  });

  it('fails closed on a missing key', () => {
    const partial = { ...allNo() } as Partial<RedFlagAnswers>;
    delete partial.contractions;
    expect(evaluateRedFlags(partial as RedFlagAnswers).blocked).toBe(true);
  });

  it('fails closed on a non-tri-state value', () => {
    const bad = { ...allNo(), chestPain: 'maybe' } as unknown as RedFlagAnswers;
    expect(evaluateRedFlags(bad).blocked).toBe(true);
  });
});
