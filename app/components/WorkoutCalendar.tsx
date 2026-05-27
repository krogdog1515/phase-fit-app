"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  buildOutsideDateSet,
  buildWorkoutDayMap,
  CalendarWorkout,
  getMonthGrid,
  PHASE_STYLES,
  toLocalDateKey,
  WEEKDAY_LABELS,
} from "../lib/calendar-utils";

type WorkoutCalendarProps = {
  workouts: CalendarWorkout[];
  outsideActivityDates?: string[];
};

export default function WorkoutCalendar({
  workouts,
  outsideActivityDates = [],
}: WorkoutCalendarProps) {
  const router = useRouter();
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());

  const workoutDays = useMemo(
    () => buildWorkoutDayMap(workouts),
    [workouts]
  );
  const outsideDays = useMemo(
    () => buildOutsideDateSet(outsideActivityDates),
    [outsideActivityDates]
  );

  const cells = useMemo(
    () => getMonthGrid(viewYear, viewMonth),
    [viewYear, viewMonth]
  );

  const monthLabel = new Date(viewYear, viewMonth, 1).toLocaleDateString(
    "en-US",
    { month: "long", year: "numeric" }
  );

  const shiftMonth = (delta: number) => {
    const d = new Date(viewYear, viewMonth + delta, 1);
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth());
  };

  const todayKey = toLocalDateKey(today);

  return (
    <section
      className="rounded-2xl bg-white/80 p-4 sm:p-5 shadow-sm ring-1 ring-black/[0.04]"
      aria-label="Workout calendar"
    >
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900">Your timeline</h2>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => shiftMonth(-1)}
            className="p-2 rounded-lg text-gray-600 hover:bg-gray-100 text-sm"
            aria-label="Previous month"
          >
            ‹
          </button>
          <span className="text-sm font-medium text-gray-800 min-w-[8.5rem] text-center">
            {monthLabel}
          </span>
          <button
            type="button"
            onClick={() => shiftMonth(1)}
            className="p-2 rounded-lg text-gray-600 hover:bg-gray-100 text-sm"
            aria-label="Next month"
          >
            ›
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1 mb-1">
        {WEEKDAY_LABELS.map((label, i) => (
          <div
            key={`${label}-${i}`}
            className="text-center text-[10px] font-medium text-gray-400 py-1"
          >
            {label}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {cells.map((date, i) => {
          if (!date) {
            return <div key={`empty-${i}`} className="aspect-square" />;
          }

          const key = toLocalDateKey(date);
          const dayData = workoutDays.get(key);
          const hasOutside = outsideDays.has(key);
          const phaseStyle = dayData
            ? PHASE_STYLES[dayData.phase] ?? null
            : null;
          const isToday = key === todayKey;
          const hasWorkout = Boolean(dayData);

          const cellClasses = [
            "aspect-square rounded-xl flex flex-col items-center justify-center gap-0.5 relative transition",
            phaseStyle?.cell ?? "bg-transparent",
            isToday ? "ring-2 ring-[#7a1f2a]/40 ring-offset-1 ring-offset-[#f9f7f7]" : "",
            hasWorkout
              ? "cursor-pointer hover:opacity-90 active:scale-95"
              : "cursor-default",
          ]
            .filter(Boolean)
            .join(" ");

          return (
            <button
              key={key}
              type="button"
              disabled={!hasWorkout}
              onClick={() => {
                if (dayData) router.push(`/workout/${dayData.workoutId}`);
              }}
              className={cellClasses}
              aria-label={
                hasWorkout
                  ? `${date.getDate()}, ${dayData?.phase} phase workout`
                  : `${date.getDate()}, no workout`
              }
            >
              <span
                className={`text-xs ${
                  isToday ? "font-bold text-gray-900" : "text-gray-700"
                }`}
              >
                {date.getDate()}
              </span>
              <div className="flex items-center gap-0.5 min-h-[6px]">
                {hasWorkout ? (
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      phaseStyle?.dot ?? "bg-[#7a1f2a]"
                    }`}
                    title="App workout"
                  />
                ) : null}
                {hasOutside ? (
                  <span
                    className="w-1.5 h-1.5 rounded-full bg-gray-400"
                    title="Outside activity"
                  />
                ) : null}
              </div>
            </button>
          );
        })}
      </div>

      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-[11px] text-gray-500">
        {Object.entries(PHASE_STYLES).map(([phase, style]) => (
          <span key={phase} className="inline-flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${style.dot}`} />
            {style.label}
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-gray-400" />
          Outside activity
        </span>
      </div>
    </section>
  );
}
