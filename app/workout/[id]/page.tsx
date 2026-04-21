/* eslint-disable @typescript-eslint/no-explicit-any */

"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import supabase from "../../lib/supabase";

export default function WorkoutPage() {
  const { id } = useParams();
  const router = useRouter();

  const [workout, setWorkout] = useState<any>(null);
  const [logs, setLogs] = useState<any>({});
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
        const initialLogs: any = {};
        data.structure.forEach((item: any) => {
          initialLogs[item.movement] = Array.from(
            { length: item.sets },
            () => ({ weight: "", reps: "" })
          );
        });
        setLogs(initialLogs);
      }
    };

    fetchWorkout();
  }, [id]);

  const updateSet = (
    movement: string,
    index: number,
    field: string,
    value: string
  ) => {
    const updated = { ...logs };
    updated[movement][index] = {
      ...updated[movement][index],
      [field]: value,
    };
    setLogs(updated);
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

        {/* COACHING (HERO) */}
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

          {workout.structure?.map((item: any, i: number) => (
            <div
              key={i}
              className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm space-y-3"
            >
              <div>
                <h3 className="font-semibold text-gray-900">
                  {item.movement}
                </h3>

                <p className="text-sm text-gray-500">
                  {item.sets} sets • {item.reps} • RIR {item.rir}
                </p>
              </div>

              {item.note && (
                <p className="text-sm text-[#7a1f2a]">
                  {item.note}
                </p>
              )}

              {/* LOGGING */}
              <div className="space-y-2">
                {logs[item.movement]?.map((set: any, idx: number) => (
                  <div key={idx} className="flex gap-2">
                    <input
                      placeholder="Weight"
                      value={set.weight}
                      onChange={(e) =>
                        updateSet(
                          item.movement,
                          idx,
                          "weight",
                          e.target.value
                        )
                      }
                      className="w-full p-2 border border-gray-300 rounded"
                    />
                    <input
                      placeholder="Reps"
                      value={set.reps}
                      onChange={(e) =>
                        updateSet(
                          item.movement,
                          idx,
                          "reps",
                          e.target.value
                        )
                      }
                      className="w-full p-2 border border-gray-300 rounded"
                    />
                  </div>
                ))}
              </div>
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

        {/* FEEDBACK MODAL */}
        {showFeedback && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl p-6 w-full max-w-md space-y-4">

              <h2 className="text-lg font-semibold text-gray-900">
                How did it go?
              </h2>

              {/* COMPLETION */}
              <div>
                <p className="text-sm text-gray-500 mb-1">
                  Completion
                </p>
                <div className="flex gap-2">
                  {["Completed", "Partial", "Skipped"].map((c) => (
                    <button
                      key={c}
                      onClick={() => setCompleted(c)}
                      className={`px-3 py-1 rounded border ${
                        completed === c
                          ? "bg-[#7a1f2a] text-white"
                          : ""
                      }`}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>

              {/* DIFFICULTY */}
              <div>
                <p className="text-sm text-gray-500 mb-1">
                  Difficulty
                </p>
                <div className="flex gap-2">
                  {["Too Easy", "Just Right", "Too Hard"].map((d) => (
                    <button
                      key={d}
                      onClick={() => setDifficulty(d)}
                      className={`px-3 py-1 rounded border ${
                        difficulty === d
                          ? "bg-[#7a1f2a] text-white"
                          : ""
                      }`}
                    >
                      {d}
                    </button>
                  ))}
                </div>
              </div>

              {/* ENERGY */}
              <div>
                <p className="text-sm text-gray-500 mb-1">
                  Energy After
                </p>
                <div className="flex gap-2">
                  {["Worse", "Same", "Better"].map((e) => (
                    <button
                      key={e}
                      onClick={() => setEnergyShift(e)}
                      className={`px-3 py-1 rounded border ${
                        energyShift === e
                          ? "bg-[#7a1f2a] text-white"
                          : ""
                      }`}
                    >
                      {e}
                    </button>
                  ))}
                </div>
              </div>

              {/* SAVE */}
              <button
                onClick={async () => {
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