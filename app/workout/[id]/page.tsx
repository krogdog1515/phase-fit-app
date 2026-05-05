/* eslint-disable @typescript-eslint/no-explicit-any */

"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import supabase from "../../lib/supabase";

export default function WorkoutPage() {
  const { id } = useParams();
  const router = useRouter();

  const [workout, setWorkout] = useState<any>(null);
  const [movements, setMovements] = useState<any[]>([]);
  const [showFeedback, setShowFeedback] = useState(false);

  const [completed, setCompleted] = useState("");
  const [difficulty, setDifficulty] = useState("");
  const [energyShift, setEnergyShift] = useState("");

  // 🔄 Fetch workout
  useEffect(() => {
    const fetchWorkout = async () => {
      const { data } = await supabase
        .from("workouts")
        .select("*")
        .eq("id", id)
        .single();

      setWorkout(data);

      if (data?.structure) {
        const initialized = data.structure.map((item: any) => ({
          name: item.movement,
          original: item.movement,
          sets: item.sets,
          reps: item.reps,
          rir: item.rir,
          note: item.note,
          logs: Array.from({ length: item.sets }, () => ({
            weight: "",
            reps: "",
          })),
          notes: "",
        }));

        setMovements(initialized);
      }
    };

    fetchWorkout();
  }, [id]);

  // 🔧 Update movement name
  const updateMovementName = (index: number, value: string) => {
    const updated = [...movements];
    updated[index].name = value;
    setMovements(updated);
  };

  // 🔧 Update notes
  const updateNotes = (index: number, value: string) => {
    const updated = [...movements];
    updated[index].notes = value;
    setMovements(updated);
  };

  // 🔧 Update sets
  const updateSet = (
    movementIndex: number,
    setIndex: number,
    field: string,
    value: string
  ) => {
    const updated = [...movements];
    updated[movementIndex].logs[setIndex][field] = value;
    setMovements(updated);
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

        {/* HEADER */}
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold text-gray-900">
            Today’s Workout
          </h1>

          <button
            onClick={() => router.push("/")}
            className="text-sm text-[#7a1f2a] font-medium"
          >
            Back
          </button>
        </div>

        {/* COACHING */}
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

        {/* PLAN */}
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">
            Your Plan
          </h2>

          {movements.map((item, i) => (
            <div
              key={i}
              className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm space-y-3"
            >

              {/* EDITABLE MOVEMENT */}
              <input
                value={item.name}
                onChange={(e) =>
                  updateMovementName(i, e.target.value)
                }
                className="w-full p-2 border border-gray-300 rounded font-semibold"
              />

              <p className="text-sm text-gray-500">
                {item.sets} sets • {item.reps} • RIR {item.rir}
              </p>

              {item.note && (
                <p className="text-sm text-[#7a1f2a]">
                  {item.note}
                </p>
              )}

              {/* LOGGING */}
              <div className="space-y-2">
                {item.logs.map((set: any, idx: number) => (
                  <div key={idx} className="flex gap-2">
                    <input
                      placeholder="Weight"
                      value={set.weight}
                      onChange={(e) =>
                        updateSet(i, idx, "weight", e.target.value)
                      }
                      className="w-full p-2 border border-gray-300 rounded"
                    />
                    <input
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

              {/* NOTES */}
              <textarea
                placeholder="Notes (optional)"
                value={item.notes}
                onChange={(e) =>
                  updateNotes(i, e.target.value)
                }
                className="w-full p-2 border border-gray-300 rounded"
              />

            </div>
          ))}
        </div>

        {/* CTA */}
        <button
          onClick={() => setShowFeedback(true)}
          className="w-full py-3 rounded font-semibold bg-[#7a1f2a] text-white"
        >
          Finish Workout
        </button>

        {/* FEEDBACK */}
        {showFeedback && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl p-6 w-full max-w-md space-y-4">

              <h2 className="text-lg font-semibold text-gray-900">
                How did it go?
              </h2>

              <button
                onClick={async () => {
                  // 🔥 SAVE LOGS
                  const logsToInsert = movements.map((m) => ({
                    workout_id: workout.id,
                    movement: m.name,
                    original_movement: m.original,
                    final_movement: m.name,
                    notes: m.notes,
                  }));

                  await supabase
                    .from("workout_logs")
                    .insert(logsToInsert);

                  // 🔥 SAVE FEEDBACK
                  await supabase
                    .from("workouts")
                    .update({
                      completed,
                      difficulty,
                      energy_shift: energyShift,
                    })
                    .eq("id", workout.id);

                  router.push("/");
                }}
                className="w-full bg-[#7a1f2a] text-white py-2 rounded"
              >
                Save & Finish
              </button>

            </div>
          </div>
        )}
      </div>
    </main>
  );
}