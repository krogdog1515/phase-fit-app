import { stageOrdinal, type StageKey } from '../stages/pregnancyStages';
import type { Movement } from './types';

/**
 * Filter the movement library to those available at a given stage band.
 *
 * Pure: rows in, rows out. No I/O, no Supabase.
 *
 * `min_stage`/`max_stage` form an inclusive RANGE over the six ordered bands. A
 * movement is available at stage S when:
 *
 *     ordinal(min_stage) <= ordinal(S) <= ordinal(max_stage)
 *
 * FAIL CLOSED:
 *   - If `stageKey` is not one of the six literals -> return [] (place nothing).
 *   - If a movement's `min_stage` or `max_stage` is not one of the six literals,
 *     or the range is inverted (min after max) -> EXCLUDE that movement.
 * Never include a movement you cannot confidently place.
 */
export function filterMovementsByStage(
  movements: Movement[],
  stageKey: StageKey,
): Movement[] {
  const target = stageOrdinal(stageKey);
  if (target === null) return [];

  return movements.filter((m) => {
    const min = stageOrdinal(m.min_stage);
    const max = stageOrdinal(m.max_stage);
    if (min === null || max === null) return false; // unrecognized band -> exclude
    if (min > max) return false; // inverted range -> exclude
    return min <= target && target <= max;
  });
}

/**
 * Filter movements to those doable with the equipment on hand.
 *
 * Pure. A movement passes when it needs no equipment (empty array) or every
 * item it requires is in `available`. Unknown equipment on a movement simply
 * fails the subset check, so it drops out unless explicitly available.
 */
export function filterByEquipment(
  movements: Movement[],
  available: string[],
): Movement[] {
  const have = new Set(available.map((e) => e.trim()).filter(Boolean));
  return movements.filter((m) => m.equipment.every((e) => have.has(e)));
}
