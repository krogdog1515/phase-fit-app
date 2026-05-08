"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import supabase from "../../lib/supabase";
import {
  DIFFICULTY_LABELS,
  DIFFICULTY_VALUES,
  normalizeDifficulty,
  normalizeDifficultyForStorage,
} from "../../lib/difficulty";

type SetLog = {
  weight: string;
  reps: string;
};

type MovementState = {
  name: string;
  original: string;
  sets: number;
  reps: string;
  rir: string;
  note: string;
  logs: SetLog[];
  notes: string;
};

type WorkoutRow = {
  id: string;
  cycle_guidance?: {
    summary?: string;
    during_workout?: string;
    adjustments?: string;
  };
  structure?: unknown;
  completed?: string | null;
  energy_shift?: string | null;
};

type WorkoutLogRow = {
  movement: string;
  original_movement: string | null;
  final_movement: string | null;
  notes: string | null;
  weight: number | string | null;
  reps: number | string | null;
  set_number: number | null;
  created_at?: string | null;
};

/** Keep latest row per movement slot + set when users save more than once. */
function dedupeLogsByLatest(logs: WorkoutLogRow[]): WorkoutLogRow[] {
  const best = new Map<string, WorkoutLogRow>();
  for (const log of logs) {
    const om = log.original_movement ?? "";
    const sn = Number(log.set_number) || 0;
    const key = `${om}|${sn}`;
    const prev = best.get(key);
    const t = log.created_at ? new Date(log.created_at).getTime() : 0;
    const pt = prev?.created_at ? new Date(prev.created_at).getTime() : -1;
    if (!prev || t >= pt) best.set(key, log);
  }
  return [...best.values()];
}

function mergeSavedLogsIntoMovements(
  structureItems: Record<string, unknown>[],
  base: MovementState[],
  rawLogs: WorkoutLogRow[]
): MovementState[] {
  if (!rawLogs.length) return base;

  const logs = dedupeLogsByLatest(rawLogs);

  return base.map((mov, i) => {
    const structureMovement = String(structureItems[i]?.movement ?? mov.original);
    const rows = logs
      .filter((l) => {
        const om = String(l.original_movement ?? "");
        if (om && om === structureMovement) return true;
        if (!l.original_movement && String(l.movement) === structureMovement)
          return true;
        return false;
      })
      .sort(
        (a, b) =>
          (Number(a.set_number) || 0) - (Number(b.set_number) || 0)
      );

    if (rows.length === 0) return mov;

    const logsFilled = mov.logs.map((slot, idx) => {
      const row = rows.find((r) => Number(r.set_number) === idx + 1);
      const w = row?.weight;
      const r = row?.reps;
      const wStr =
        w != null && String(w).trim() !== "" && Number.isFinite(Number(w))
          ? String(w)
          : "";
      const rStr =
        r != null && String(r).trim() !== "" && Number.isFinite(Number(r))
          ? String(r)
          : "";
      return { weight: wStr, reps: rStr };
    });

    const notesFromLog =
      rows.find(
        (r) => Number(r.set_number) === 1 && r.notes?.trim()
      )?.notes?.trim() ??
      rows.find((r) => r.notes?.trim())?.notes?.trim() ??
      "";

    const displayName =
      rows.find((r) => r.final_movement?.trim())?.final_movement?.trim() ??
      rows.find((r) => r.movement?.trim())?.movement?.trim() ??
      mov.name;

    return {
      ...mov,
      name: displayName || mov.name,
      logs: logsFilled,
      notes: notesFromLog || mov.notes,
    };
  });
}

function parsePositiveNumber(raw: string): number | null {
  const t = raw.trim();
  if (t === "") return null;
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

export default function WorkoutPage() {
  const params = useParams();
  const workoutId =
    typeof params.id === "string"
      ? params.id
      : Array.isArray(params.id)
        ? params.id[0]
        : "";
  const router = useRouter();

  const [workout, setWorkout] = useState<WorkoutRow | null>(null);
  const [movements, setMovements] = useState<MovementState[]>([]);
  const [showFeedback, setShowFeedback] = useState(false);

  const [completed, setCompleted] = useState("");
  const [difficulty, setDifficulty] = useState("");
  const [energyShift, setEnergyShift] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const fetchWorkout = async () => {
      const [{ data }, logsRes] = await Promise.all([
        supabase.from("workouts").select("*").eq("id", workoutId).single(),
        supabase
          .from("workout_logs")
          .select(
            "movement, original_movement, final_movement, notes, weight, reps, set_number, created_at"
          )
          .eq("workout_id", workoutId),
      ]);

      if (logsRes.error) {
        console.error(logsRes.error);
      }

      const logsRaw = !logsRes.error && logsRes.data ? logsRes.data : [];

      setWorkout(data as WorkoutRow);

      setDifficulty(normalizeDifficulty(data?.difficulty) ?? "");
      setCompleted(
        typeof data?.completed === "string" ? data.completed : ""
      );
      setEnergyShift(
        typeof data?.energy_shift === "string" ? data.energy_shift : ""
      );

      if (data?.structure && Array.isArray(data.structure)) {
        const structureItems = data.structure as Record<string, unknown>[];
        const initialized = structureItems.map((item) => ({
          name: String(item.movement ?? ""),
          original: String(item.movement ?? ""),
          sets: Number(item.sets) || 0,
          reps: String(item.reps ?? ""),
          rir: String(item.rir ?? ""),
          note: String(item.note ?? ""),
          logs: Array.from(
            { length: Number(item.sets) || 0 },
            () =>
              ({
                weight: "",
                reps: "",
              }) satisfies SetLog
          ),
          notes: "",
        }));

        const logs = logsRaw as WorkoutLogRow[];
        setMovements(
          logs.length > 0
            ? mergeSavedLogsIntoMovements(structureItems, initialized, logs)
            : initialized
        );
      }
    };

    fetchWorkout();
  }, [workoutId]);

  const updateMovementName = (index: number, value: string) => {
    setMovements((prev) =>
      prev.map((m, i) => (i === index ? { ...m, name: value } : m))
    );
  };

  const updateNotes = (index: number, value: string) => {
    setMovements((prev) =>
      prev.map((m, i) => (i === index ? { ...m, notes: value } : m))
    );
  };

  const updateSet = (
    movementIndex: number,
    setIndex: number,
    field: keyof SetLog,
    value: string
  ) => {
    setMovements((prev) =>
      prev.map((m, mi) => {
        if (mi !== movementIndex) return m;
        return {
          ...m,
          logs: m.logs.map((set, si) =>
            si !== setIndex ? set : { ...set, [field]: value }
          ),
        };
      })
    );
  };

  function buildLogRows(): Array<{
    workout_id: string;
    movement: string;
    original_movement: string;
    final_movement: string;
    notes: string | null;
    weight: number;
    reps: number;
    set_number: number;
  }> {
    if (!workout) return [];

    const rows: Array<{
      workout_id: string;
      movement: string;
      original_movement: string;
      final_movement: string;
      notes: string | null;
      weight: number;
      reps: number;
      set_number: number;
    }> = [];

    for (const m of movements) {
      m.logs.forEach((set, idx) => {
        const w = parsePositiveNumber(set.weight);
        const r = parsePositiveNumber(set.reps);
        const emptyBoth =
          set.weight.trim() === "" && set.reps.trim() === "";
        if (emptyBoth) return;
        if (w === null || r === null) return;

        const repsInt = Math.round(r);
        if (!Number.isFinite(repsInt)) return;

        rows.push({
          workout_id: workout.id,
          movement: m.name,
          original_movement: m.original,
          final_movement: m.name,
          notes: idx === 0 ? (m.notes.trim() || null) : null,
          weight: w,
          reps: repsInt,
          set_number: idx + 1,
        });
      });
    }

    return rows;
  }

  const saveWorkout = async () => {
    if (!workout) return;

    for (const m of movements) {
      for (const set of m.logs) {
        const wEmpty = set.weight.trim() === "";
        const rEmpty = set.reps.trim() === "";
        if (wEmpty !== rEmpty) {
          alert(
            "Each started set needs both weight and reps (or leave both blank)."
          );
          return;
        }
      }
    }

    const logsToInsert = buildLogRows();
    if (logsToInsert.length === 0) {
      alert(
        "Log at least one set with weight and reps so future workouts can progress."
      );
      return;
    }

    for (const row of logsToInsert) {
      if (
        !Number.isFinite(row.weight) ||
        !Number.isFinite(row.reps) ||
        !Number.isFinite(row.set_number)
      ) {
        alert("Invalid weight, reps, or set number. Check your log entries.");
        return;
      }
    }

    setSaving(true);

    const { error: logError } = await supabase.from("workout_logs").insert(
      logsToInsert.map((row) => ({
        workout_id: row.workout_id,
        movement: row.movement,
        original_movement: row.original_movement,
        final_movement: row.final_movement,
        notes: row.notes,
        weight: row.weight,
        reps: row.reps,
        set_number: row.set_number,
      }))
    );

    if (logError) {
      console.error(logError);
      alert(logError.message || "Could not save workout logs.");
      setSaving(false);
      return;
    }

    const { error: workoutError } = await supabase
      .from("workouts")
      .update({
        completed,
        difficulty: normalizeDifficultyForStorage(difficulty),
        energy_shift: energyShift,
      })
      .eq("id", workout.id);

    if (workoutError) {
      console.error(workoutError);
      alert(workoutError.message || "Could not save workout feedback.");
      setSaving(false);
      return;
    }

    router.push("/");
  };

  if (!workout) {
    return (
      <main className="min-h-screen bg-[#f9f7f7] flex items-center justify-center">
        <p className="text-gray-500">Loading...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f9f7f7] p-6">
      <div className="max-w-xl mx-auto space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold text-gray-900">
            Today’s Workout
          </h1>

          <button
            type="button"
            onClick={() => router.push("/")}
            className="text-sm text-[#7a1f2a] font-medium"
          >
            Back
          </button>
        </div>

        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm space-y-3">
          <p className="text-sm text-[#7a1f2a] font-semibold">
            Cycle-Based Coaching
          </p>

          <p className="text-lg font-semibold text-gray-900">
            {workout.cycle_guidance?.summary}
          </p>

          <div className="text-sm text-gray-600 space-y-1">
            <p>
              <span className="font-medium text-gray-900">
                During workout:
              </span>{" "}
              {workout.cycle_guidance?.during_workout}
            </p>

            <p>
              <span className="font-medium text-gray-900">
                Adjust if needed:
              </span>{" "}
              {workout.cycle_guidance?.adjustments}
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">Your Plan</h2>

          {movements.map((item, i) => (
            <div
              key={i}
              className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm space-y-3"
            >
              <input
                value={item.name}
                onChange={(e) => updateMovementName(i, e.target.value)}
                className="w-full p-2 border border-gray-300 rounded font-semibold"
              />

              <p className="text-sm text-gray-500">
                {item.sets} sets • {item.reps} • RIR {item.rir}
              </p>

              {item.note && (
                <p className="text-sm text-[#7a1f2a]">{item.note}</p>
              )}

              <div className="space-y-2">
                {item.logs.map((set, idx) => (
                  <div key={idx} className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
                    <span className="text-xs text-gray-500 w-14 shrink-0">
                      Set {idx + 1}
                    </span>
                    <input
                      type="text"
                      inputMode="decimal"
                      placeholder="Weight"
                      value={set.weight}
                      onChange={(e) =>
                        updateSet(i, idx, "weight", e.target.value)
                      }
                      className="w-full p-2 border border-gray-300 rounded"
                    />
                    <input
                      type="text"
                      inputMode="numeric"
                      placeholder="Reps"
                      value={set.reps}
                      onChange={(e) =>
                        updateSet(i, idx, "reps", e.target.value)
                      }
                      className="w-full p-2 border border-gray-300 rounded"
                    />
                  </div>
                ))}
              </div>

              <textarea
                placeholder="Notes (optional)"
                value={item.notes}
                onChange={(e) => updateNotes(i, e.target.value)}
                className="w-full p-2 border border-gray-300 rounded"
              />
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={() => setShowFeedback(true)}
          className="w-full py-3 rounded font-semibold bg-[#7a1f2a] text-white"
        >
          Finish Workout
        </button>

        {showFeedback && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-xl p-6 w-full max-w-md space-y-4 max-h-[90vh] overflow-y-auto">
              <h2 className="text-lg font-semibold text-gray-900">
                How did it go?
              </h2>

              <p className="text-sm text-gray-600">
                Your logged sets (weight × reps) are saved for progressive
                overload. Add quick feedback below—coaching uses this on the
                next generation.
              </p>

              <div>
                <label className="text-sm text-gray-500">Completed</label>
                <select
                  value={completed}
                  onChange={(e) => setCompleted(e.target.value)}
                  className="w-full mt-1 p-3 border border-gray-300 rounded"
                >
                  <option value="">Select</option>
                  <option value="full">Full workout</option>
                  <option value="partial">Partial</option>
                  <option value="skipped">Skipped</option>
                </select>
              </div>

              <div>
                <label className="text-sm text-gray-500">Difficulty</label>
                <select
                  value={difficulty}
                  onChange={(e) => setDifficulty(e.target.value)}
                  className="w-full mt-1 p-3 border border-gray-300 rounded"
                >
                  <option value="">Select</option>
                  {DIFFICULTY_VALUES.map((v) => (
                    <option key={v} value={v}>
                      {DIFFICULTY_LABELS[v]}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-sm text-gray-500">Energy after</label>
                <select
                  value={energyShift}
                  onChange={(e) => setEnergyShift(e.target.value)}
                  className="w-full mt-1 p-3 border border-gray-300 rounded"
                >
                  <option value="">Select</option>
                  <option value="better">Better</option>
                  <option value="same">Same</option>
                  <option value="worse">Worse</option>
                </select>
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowFeedback(false)}
                  disabled={saving}
                  className="flex-1 py-2 rounded border border-gray-300 text-gray-800"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={saveWorkout}
                  disabled={saving}
                  className="flex-1 bg-[#7a1f2a] text-white py-2 rounded font-semibold disabled:opacity-60"
                >
                  {saving ? "Saving…" : "Save & finish"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
