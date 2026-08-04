import type { MovementCategory } from '../stages/pregnancyStages';

/**
 * Pregnancy screening — deterministic verdict.
 *
 * SAFETY BOUNDARY
 * ---------------
 * This is the single source of truth for the screening verdict. It is pure and
 * tested; the API route and the SQL layer both defer to it. Safety decisions
 * are made HERE, in vetted testable code — never in the client, never in the
 * LLM layer, never re-derived in SQL.
 *
 * FAIL CLOSED: any input we cannot confidently interpret resolves to
 * `hard_stop`, never `clear`. A malformed screen must never read as safe.
 *
 * NOTE: the question wording for q1..q4 is authored separately (the CSEP
 * instrument is copyrighted). This module only knows them as four booleans.
 */

/** Provider consultation status supplied by the user. */
export type ProviderAdvice =
  | 'not_consulted'
  | 'cleared'
  | 'restricted'
  | 'advised_against';

const PROVIDER_ADVICE_VALUES: readonly ProviderAdvice[] = [
  'not_consulted',
  'cleared',
  'restricted',
  'advised_against',
];

/**
 * Tri-state screening answer. 'unsure' is a first-class, honest answer — a
 * binary would force a guess (which skews to 'no' because people avoid
 * over-flagging), and uncertainty is precisely the signal that warrants a
 * provider conversation. 'unsure' is therefore treated identically to 'yes'.
 */
export type ScreeningAnswer = 'yes' | 'no' | 'unsure';

/** Four tri-state screening answers + provider consultation status. */
export type ScreeningAnswers = {
  q1: ScreeningAnswer;
  q2: ScreeningAnswer;
  q3: ScreeningAnswer;
  q4: ScreeningAnswer;
  providerAdvice: ProviderAdvice;
};

/** Three-outcome CSEP verdict. */
export type ScreeningResult = 'clear' | 'provider_conversation' | 'hard_stop';

export type ScreeningOutcome = {
  result: ScreeningResult;
  /**
   * TODO(clinical): INTENTIONALLY empty for every result. Which movement
   * categories a given screening outcome permits is a clinical judgment being
   * vetted against primary sources separately. Populating a plausible-looking
   * subset here would be consumed downstream as if it had been vetted — the
   * same hazard as the stage-band placeholders. Fail closed: [].
   */
  allowedCategories: MovementCategory[];
  /** Human-readable trace of why this result was reached (for logs/tests). */
  reason: string;
};

function isAnswer(value: unknown): value is ScreeningAnswer {
  return value === 'yes' || value === 'no' || value === 'unsure';
}

/** Build an outcome. allowedCategories is always [] — see the field doc. */
function outcome(result: ScreeningResult, reason: string): ScreeningOutcome {
  return { result, allowedCategories: [], reason };
}

function failClosed(reason: string): ScreeningOutcome {
  return outcome('hard_stop', `fail-closed: ${reason}`);
}

/**
 * Resolve the screening verdict from the four answers + provider advice.
 *
 * A 'yes' OR 'unsure' answer counts as a positive screen ('unsure' is treated
 * identically to 'yes').
 *
 * Precedence (first match wins):
 *   1. provider advised against exercise               -> hard_stop
 *   2. provider cleared for exercise                   -> clear (even w/ positive)
 *   3. provider gave restrictions                      -> provider_conversation
 *   4. any positive screen and provider not consulted  -> provider_conversation
 *   5. all NO and provider not consulted               -> clear
 *
 * Anything else — missing object, an answer that is not one of the three
 * literals, unknown providerAdvice — fails closed to hard_stop. (Note: the
 * verdict depends ONLY on q1..q4 + providerAdvice; any q4_detail free text on
 * the input object is never read here — see the route's HARD BOUNDARY.)
 */
export function resolveScreeningResult(answers: ScreeningAnswers): ScreeningOutcome {
  if (answers === null || answers === undefined || typeof answers !== 'object') {
    return failClosed('missing screening answers');
  }

  const { q1, q2, q3, q4, providerAdvice } = answers as Partial<ScreeningAnswers>;

  if (![q1, q2, q3, q4].every(isAnswer)) {
    return failClosed('non-tri-state screening answer');
  }

  if (
    typeof providerAdvice !== 'string' ||
    !PROVIDER_ADVICE_VALUES.includes(providerAdvice as ProviderAdvice)
  ) {
    return failClosed('unknown providerAdvice');
  }

  // 'unsure' counts as positive, exactly like 'yes'.
  const anyYes = [q1, q2, q3, q4].some((a) => a === 'yes' || a === 'unsure');

  // 1. Provider explicitly advised against — wins even with a NO screen.
  if (providerAdvice === 'advised_against') {
    return outcome('hard_stop', 'provider advised against exercise');
  }

  // 2. Provider cleared — wins even with a YES answer.
  if (providerAdvice === 'cleared') {
    return outcome('clear', 'provider cleared for exercise');
  }

  // 3. Provider gave restrictions — needs a conversation to apply them.
  if (providerAdvice === 'restricted') {
    return outcome('provider_conversation', 'provider gave restrictions');
  }

  // 4/5. providerAdvice === 'not_consulted'
  if (anyYes) {
    return outcome('provider_conversation', 'positive screen, provider not consulted');
  }
  return outcome('clear', 'negative screen, provider not consulted');
}
