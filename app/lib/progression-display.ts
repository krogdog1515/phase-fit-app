import { normalizeDifficulty, DIFFICULTY_LABELS } from "./difficulty";

export function normalizeMovementPattern(name: string): string {
  const n = name.toLowerCase();

  if (n.includes("squat")) return "squat";
  if (n.includes("deadlift") || n.includes("rdl")) return "hinge";
  if (n.includes("bench") || n.includes("press")) return "press";
  if (n.includes("row")) return "row";
  if (n.includes("lunge")) return "lunge";

  return n.trim();
}

export function coalesceNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

type LogLike = {
  weight?: unknown;
  reps?: unknown;
};

export function pickTopSetFromLogs<T extends LogLike>(rows: T[]): T | null {
  const valid = rows.filter((r) => {
    const w = coalesceNumber(r.weight);
    const rep = coalesceNumber(r.reps);
    return w !== null && rep !== null && w >= 0 && rep >= 0;
  });
  if (!valid.length) return null;
  return valid.reduce((best, cur) => {
    const bw = coalesceNumber(best.weight) ?? 0;
    const cw = coalesceNumber(cur.weight) ?? 0;
    if (cw > bw) return cur;
    if (cw < bw) return best;
    const br = coalesceNumber(best.reps) ?? 0;
    const cr = coalesceNumber(cur.reps) ?? 0;
    return cr >= br ? cur : best;
  });
}

export function formatTargetToday(sets: number, reps: string, rir: string): string {
  const parts = [`${sets} sets × ${reps}`];
  if (rir.trim()) parts.push(`RIR ${rir.trim()}`);
  return parts.join(" • ");
}

export function formatLastSessionLine(
  weight: number,
  reps: number,
  sessionDifficulty?: string | null
): string {
  const canon = sessionDifficulty ? normalizeDifficulty(sessionDifficulty) : null;
  const diffLabel = canon ? DIFFICULTY_LABELS[canon] : null;
  const base = `${weight} lb × ${reps}`;
  return diffLabel ? `${base} (${diffLabel})` : base;
}

export type PriorLogRow = {
  workout_id: string;
  movement: string;
  original_movement: string | null;
  weight: number | string | null;
  reps: number | string | null;
  set_number?: number | null;
};

export type PriorWorkoutRow = {
  id: string;
  difficulty?: string | null;
  created_at?: string;
};

/** Newest prior session top set per movement original name (same phase). */
export function buildLastSessionMap(
  movementOriginals: string[],
  pastWorkouts: PriorWorkoutRow[],
  logs: PriorLogRow[]
): Map<string, string> {
  const result = new Map<string, string>();

  for (const original of movementOriginals) {
    const pattern = normalizeMovementPattern(original);

    for (const workout of pastWorkouts) {
      const rows = logs.filter(
        (l) =>
          l.workout_id === workout.id &&
          normalizeMovementPattern(
            String(l.original_movement ?? l.movement ?? "")
          ) === pattern
      );

      const top = pickTopSetFromLogs(rows);
      if (!top) continue;

      const w = coalesceNumber(top.weight);
      const r = coalesceNumber(top.reps);
      if (w === null || r === null) continue;

      result.set(
        original,
        formatLastSessionLine(w, Math.round(r), workout.difficulty)
      );
      break;
    }
  }

  return result;
}

export function shouldShowProgressionBlock(
  lastSession: string | undefined,
  reasonNote: string
): boolean {
  return Boolean(lastSession?.trim() || reasonNote.trim());
}
