import type { Movement } from "./types";

/**
 * Workout-focus picker for pregnancy sessions. Focus is a PREFERENCE, not a
 * safety gate (the route decides filter vs. preference and never 409s on it).
 * This module only maps a focus to library focus_tags and applies the filter.
 */

export type FocusKey =
  | "full_body"
  | "upper_body"
  | "lower_body"
  | "core_pelvic_floor"
  | "mobility_recovery"
  | "cardio";

export const FOCUS_LABELS: Record<FocusKey, string> = {
  full_body: "Full body",
  upper_body: "Upper body",
  lower_body: "Lower body",
  core_pelvic_floor: "Core & pelvic floor",
  mobility_recovery: "Mobility & recovery",
  cardio: "Cardio",
};

/** Options in display order for the picker. */
export const FOCUS_OPTIONS: FocusKey[] = [
  "full_body",
  "upper_body",
  "lower_body",
  "core_pelvic_floor",
  "mobility_recovery",
  "cardio",
];

/** focus_tags that define each non-full focus (a movement matches on ANY tag). */
export const FOCUS_TAG_GROUPS: Record<Exclude<FocusKey, "full_body">, string[]> = {
  upper_body: ["chest", "shoulders", "back", "upper_body"],
  lower_body: ["legs", "glutes", "hamstrings", "calves", "ankles"],
  core_pelvic_floor: ["core", "pelvic_floor"],
  mobility_recovery: ["spine", "hips", "recovery", "circulation"],
  cardio: ["aerobic", "conditioning"],
};

/**
 * Categories retained in EVERY focused session regardless of the focus tags:
 * - education is the warm-up/cool-down. Guidelines recommend both every session
 *   because ligament laxity raises injury risk — not optional based on a picker.
 * - pelvic_floor: daily prenatal pelvic-floor training is a standing
 *   recommendation (~50% lower incontinence odds); losing it on every
 *   upper-body day is a real cost.
 * Neither is strength-category, so this never changes the strength-floor math.
 * (breathing and walking are genuinely optional per session and are NOT retained
 * — retaining everything would defeat the picker.)
 */
const RETAINED_CATEGORIES = new Set(["pelvic_floor", "education"]);

export function isFocusKey(value: unknown): value is FocusKey {
  return typeof value === "string" && value in FOCUS_LABELS;
}

/**
 * Filter a pool to a focus. `full_body` returns the pool unchanged. Otherwise:
 * keep movements whose focus_tags intersect the group, UNION the always-retained
 * categories (pelvic_floor, education). Pure.
 */
export function filterByFocus(movements: Movement[], focusKey: FocusKey): Movement[] {
  if (focusKey === "full_body") return [...movements];
  const tags = FOCUS_TAG_GROUPS[focusKey];
  return movements.filter(
    (m) =>
      RETAINED_CATEGORIES.has(m.category) ||
      m.focus_tags.some((t) => tags.includes(t)),
  );
}
