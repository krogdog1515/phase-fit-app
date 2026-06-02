export type CalendarWorkout = {
  id: string;
  phase: string;
  created_at: string;
};

export const PHASE_STYLES: Record<
  string,
  { cell: string; dot: string; label: string }
> = {
  menstrual: {
    cell: "bg-[#FDEBEA]",
    dot: "bg-[#E86B63]",
    label: "Menstrual",
  },
  follicular: {
    cell: "bg-[#EAF2FA]",
    dot: "bg-[#6B9FD4]",
    label: "Follicular",
  },
  ovulatory: {
    cell: "bg-[#E8F5EC]",
    dot: "bg-[#5BAF7A]",
    label: "Ovulatory",
  },
  luteal: {
    cell: "bg-[#FBF3E6]",
    dot: "bg-[#D4A85A]",
    label: "Luteal",
  },
};

export function toLocalDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function dateKeyFromIso(iso: string): string {
  return toLocalDateKey(new Date(iso));
}

export type DayCalendarData = {
  workoutId: string;
  phase: string;
};

/** Newest workout per local calendar day (input should be newest-first). */
export function buildWorkoutDayMap(
  workouts: CalendarWorkout[]
): Map<string, DayCalendarData> {
  const map = new Map<string, DayCalendarData>();
  for (const w of workouts) {
    const key = dateKeyFromIso(w.created_at);
    if (!map.has(key)) {
      map.set(key, {
        workoutId: w.id,
        phase: (w.phase ?? "").trim().toLowerCase(),
      });
    }
  }
  return map;
}

export function buildOutsideDateSet(isoDates: string[]): Set<string> {
  const set = new Set<string>();
  for (const iso of isoDates) {
    set.add(dateKeyFromIso(iso));
  }
  return set;
}

export function getMonthGrid(year: number, month: number): (Date | null)[] {
  const first = new Date(year, month, 1);
  const startPad = first.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (Date | null)[] = [];

  for (let i = 0; i < startPad; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(new Date(year, month, d));
  }
  while (cells.length % 7 !== 0) cells.push(null);

  return cells;
}

export const WEEKDAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];
