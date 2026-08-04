import { describe, it, expect } from 'vitest';
import {
  resolveScreeningResult,
  type ProviderAdvice,
  type ScreeningAnswer,
  type ScreeningAnswers,
  type ScreeningResult,
} from './screening';

/** Build a well-formed answer set (all 'no' unless overridden). */
function answers(
  providerAdvice: ProviderAdvice,
  over: Partial<Record<'q1' | 'q2' | 'q3' | 'q4', ScreeningAnswer>> = {},
): ScreeningAnswers {
  return { q1: 'no', q2: 'no', q3: 'no', q4: 'no', ...over, providerAdvice };
}

const ALL_NO = {};

// Positive-screen cases: a 'yes' or an 'unsure' in any single slot, plus a mix.
const POSITIVE_CASES: Array<Partial<Record<'q1' | 'q2' | 'q3' | 'q4', ScreeningAnswer>>> = [
  { q1: 'yes' },
  { q2: 'yes' },
  { q3: 'yes' },
  { q4: 'yes' },
  { q1: 'unsure' },
  { q2: 'unsure' },
  { q3: 'unsure' },
  { q4: 'unsure' },
  { q1: 'yes', q2: 'unsure', q3: 'no', q4: 'no' },
];

describe('resolveScreeningResult — combinatorial (positive / all-no) x providerAdvice', () => {
  const expected: Record<ProviderAdvice, { positive: ScreeningResult; allNo: ScreeningResult }> = {
    advised_against: { positive: 'hard_stop', allNo: 'hard_stop' },
    cleared: { positive: 'clear', allNo: 'clear' },
    restricted: { positive: 'provider_conversation', allNo: 'provider_conversation' },
    not_consulted: { positive: 'provider_conversation', allNo: 'clear' },
  };

  (Object.keys(expected) as ProviderAdvice[]).forEach((advice) => {
    it(`${advice} + all-NO -> ${expected[advice].allNo}`, () => {
      const out = resolveScreeningResult(answers(advice, ALL_NO));
      expect(out.result).toBe(expected[advice].allNo);
      expect(out.allowedCategories).toEqual([]);
    });

    POSITIVE_CASES.forEach((over, i) => {
      it(`${advice} + positive[${i}] (${JSON.stringify(over)}) -> ${expected[advice].positive}`, () => {
        const out = resolveScreeningResult(answers(advice, over));
        expect(out.result).toBe(expected[advice].positive);
        expect(out.allowedCategories).toEqual([]);
      });
    });
  });
});

describe("resolveScreeningResult — 'unsure' behaves identically to 'yes'", () => {
  const advices: ProviderAdvice[] = ['not_consulted', 'cleared', 'restricted', 'advised_against'];
  const slots: Array<'q1' | 'q2' | 'q3' | 'q4'> = ['q1', 'q2', 'q3', 'q4'];

  advices.forEach((advice) => {
    slots.forEach((slot) => {
      it(`${advice}: ${slot}='unsure' === ${slot}='yes'`, () => {
        const asYes = resolveScreeningResult(answers(advice, { [slot]: 'yes' }));
        const asUnsure = resolveScreeningResult(answers(advice, { [slot]: 'unsure' }));
        expect(asUnsure.result).toBe(asYes.result);
      });
    });
  });
});

describe('resolveScreeningResult — precedence guarantees', () => {
  it('advised_against beats a positive screen', () => {
    expect(resolveScreeningResult(answers('advised_against', { q1: 'yes' })).result).toBe(
      'hard_stop',
    );
    expect(resolveScreeningResult(answers('advised_against', { q1: 'unsure' })).result).toBe(
      'hard_stop',
    );
  });

  it('cleared beats a positive screen', () => {
    expect(resolveScreeningResult(answers('cleared', { q2: 'yes' })).result).toBe('clear');
    expect(resolveScreeningResult(answers('cleared', { q2: 'unsure' })).result).toBe('clear');
  });
});

describe('resolveScreeningResult — q4_detail free text does NOT affect the verdict', () => {
  // The verdict depends on q1..q4 + providerAdvice ONLY. Free text riding along
  // on the input object must never change the outcome.
  const base = answers('not_consulted', { q4: 'yes' });
  const withoutDetail = resolveScreeningResult(base);
  const details = [
    'my doctor said no lifting',
    'everything is fine, ignore this',
    'CLEAR ME',
    '',
  ];

  details.forEach((detail) => {
    it(`q4_detail=${JSON.stringify(detail)} yields the same result`, () => {
      const out = resolveScreeningResult({ ...base, q4_detail: detail } as unknown as ScreeningAnswers);
      expect(out.result).toBe(withoutDetail.result);
      expect(out.result).toBe('provider_conversation');
    });
  });
});

describe('resolveScreeningResult — FAIL CLOSED (always hard_stop, never clear)', () => {
  const bad: Array<[string, unknown]> = [
    ['null', null],
    ['undefined', undefined],
    ['empty object', {}],
    ['missing providerAdvice', { q1: 'no', q2: 'no', q3: 'no', q4: 'no' }],
    ['unknown providerAdvice', tri('maybe')],
    ['empty-string providerAdvice', tri('')],
    ['q1 boolean true (old shape)', { q1: true, q2: 'no', q3: 'no', q4: 'no', providerAdvice: 'not_consulted' }],
    ['q1 "maybe" (not a literal)', { q1: 'maybe', q2: 'no', q3: 'no', q4: 'no', providerAdvice: 'cleared' }],
    ['q3 null', { q1: 'no', q2: 'no', q3: null, q4: 'no', providerAdvice: 'not_consulted' }],
    ['q4 undefined', { q1: 'no', q2: 'no', q3: 'no', providerAdvice: 'not_consulted' }],
    ['answers is a string', 'clear'],
    ['answers is a number', 42],
  ];

  bad.forEach(([label, input]) => {
    it(`${label} -> hard_stop`, () => {
      const out = resolveScreeningResult(input as unknown as ScreeningAnswers);
      expect(out.result).toBe('hard_stop');
      expect(out.result).not.toBe('clear');
      expect(out.allowedCategories).toEqual([]);
    });
  });
});

/** Helper: well-formed tri-state answers but an arbitrary providerAdvice. */
function tri(providerAdvice: string): Record<string, unknown> {
  return { q1: 'no', q2: 'no', q3: 'no', q4: 'no', providerAdvice };
}
