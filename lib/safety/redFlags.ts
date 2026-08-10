/**
 * Daily red-flag check-in — deterministic verdict.
 *
 * SAFETY BOUNDARY
 * ---------------
 * Single source of truth for whether today's self-reported symptoms block
 * training. Pure and tested; the check-in route, the home screen, and the
 * generate gate all defer to it. The verdict is never computed in the client,
 * never trusted from a stored boolean, never re-derived elsewhere.
 *
 * FAIL CLOSED: any input we cannot confidently interpret returns
 * `blocked: true`. A malformed check-in must never read as safe.
 *
 * Tri-state, same reasoning as screening: 'unsure' is a first-class answer and
 * is treated identically to 'yes' — uncertainty about a warning sign is exactly
 * when we should not prescribe.
 */

export type RedFlagAnswer = 'yes' | 'no' | 'unsure';

/** The six warning signs. Order is stable (used by tests and the UI). */
export type RedFlagKey =
  | 'bleeding'
  | 'fluidLeak'
  | 'contractions'
  | 'chestPain'
  | 'dizziness'
  | 'breathlessness';

export const RED_FLAG_KEYS: readonly RedFlagKey[] = [
  'bleeding',
  'fluidLeak',
  'contractions',
  'chestPain',
  'dizziness',
  'breathlessness',
];

export type RedFlagAnswers = Record<RedFlagKey, RedFlagAnswer>;

export type RedFlagOutcome = {
  /** true if any flag is 'yes'/'unsure', or the input is unparseable. */
  blocked: boolean;
  /** Keys that fired. For logs/tests only — never shown back to the user. */
  triggered: RedFlagKey[];
};

function isAnswer(value: unknown): value is RedFlagAnswer {
  return value === 'yes' || value === 'no' || value === 'unsure';
}

/**
 * Evaluate the six daily red flags.
 *
 * `blocked` is true if ANY answer is 'yes' or 'unsure'. Missing, undefined, or
 * non-literal input on any key fails closed to `blocked: true`.
 */
export function evaluateRedFlags(answers: RedFlagAnswers): RedFlagOutcome {
  if (answers === null || answers === undefined || typeof answers !== 'object') {
    return { blocked: true, triggered: [...RED_FLAG_KEYS] };
  }

  const triggered: RedFlagKey[] = [];
  let malformed = false;

  for (const key of RED_FLAG_KEYS) {
    const answer = (answers as Partial<Record<RedFlagKey, unknown>>)[key];
    if (!isAnswer(answer)) {
      malformed = true; // a non-tri-state answer -> fail closed
      continue;
    }
    if (answer === 'yes' || answer === 'unsure') {
      triggered.push(key);
    }
  }

  if (malformed) {
    return { blocked: true, triggered };
  }

  return { blocked: triggered.length > 0, triggered };
}
