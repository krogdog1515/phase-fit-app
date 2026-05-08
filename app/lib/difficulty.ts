/**
 * Canonical perceived-effort values stored on `workouts.difficulty` and shown in AI prompts.
 */
export const DIFFICULTY_VALUES = ["too_easy", "just_right", "too_hard"] as const;

export type DifficultyValue = (typeof DIFFICULTY_VALUES)[number];

export const DIFFICULTY_LABELS: Record<DifficultyValue, string> = {
  too_easy: "Too easy",
  just_right: "Just right",
  too_hard: "Too hard",
};

const ALIASES: Record<string, DifficultyValue> = {
  tooeasy: "too_easy",
  justright: "just_right",
  toohard: "too_hard",
};

export function normalizeDifficulty(raw: unknown): DifficultyValue | null {
  if (raw === null || raw === undefined) return null;
  const slug = String(raw)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/-/g, "_");
  if (slug === "") return null;
  if ((DIFFICULTY_VALUES as readonly string[]).includes(slug)) {
    return slug as DifficultyValue;
  }
  return ALIASES[slug] ?? null;
}

/** Coerce UI / legacy strings before save. */
export function normalizeDifficultyForStorage(
  raw: string
): DifficultyValue | null {
  return normalizeDifficulty(raw);
}
