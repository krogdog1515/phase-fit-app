"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import supabase from "./lib/supabase";
import { normalizeDifficulty } from "./lib/difficulty";

type WorkoutRow = {
  id: string;
  workout: string;
  phase: string;
  intensity?: string;
  created_at: string;
  completed?: string | null;
  difficulty?: string | null;
};

type TodaySessionKind = "not_started" | "in_progress" | "completed";

function getTodaySessionKind(w: WorkoutRow): TodaySessionKind {
  const c = (w.completed ?? "").trim().toLowerCase();
  if (c === "full" || c === "skipped") return "completed";
  if (c === "partial") return "in_progress";
  return "not_started";
}

/** Prior session is the next row after today’s (list is newest-first). */
function buildAdaptiveInsight(today: WorkoutRow, prior?: WorkoutRow): string {
  const priorDiff = prior ? normalizeDifficulty(prior.difficulty) : null;

  if (priorDiff === "too_hard") {
    return "Reduced intensity based on recent fatigue";
  }
  if (priorDiff === "too_easy") {
    return "Progressing strength after strong recent recovery";
  }

  const phase = (today.phase ?? "").toLowerCase();
  if (phase === "luteal") {
    return "Focus on stability and recovery during luteal phase";
  }
  if (phase === "menstrual") {
    return "Prioritizing recovery while staying consistent";
  }
  if (phase === "follicular") {
    return "Building capacity as energy rises";
  }
  if (phase === "ovulatory") {
    return "Leveraging peak readiness for quality work";
  }

  return "Adapted to your cycle phase, recovery, and recent performance";
}

function isCreatedToday(isoDate: string): boolean {
  const d = new Date(isoDate);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

export default function Home() {
  const router = useRouter();

  const [workouts, setWorkouts] = useState<WorkoutRow[]>([]);
  const [phaseFilter, setPhaseFilter] = useState("all");
  const [loading, setLoading] = useState(true);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  useEffect(() => {
    const init = async () => {
      const { data } = await supabase.auth.getUser();

      if (!data.user) {
        router.push("/login");
        return;
      }

      const { data: workoutsData, error } = await supabase
        .from("workouts")
        .select("id, workout, phase, intensity, created_at, completed, difficulty")
        .eq("user_id", data.user.id)
        .order("created_at", { ascending: false });

      if (!error && workoutsData) {
        setWorkouts(workoutsData as WorkoutRow[]);
      }

      setLoading(false);
    };

    init();
  }, [router]);

  const filteredWorkouts =
    phaseFilter === "all"
      ? workouts
      : workouts.filter((w) => w.phase === phaseFilter);

  const todaysWorkout =
    workouts.find((w) => isCreatedToday(w.created_at)) ?? null;

  const priorWorkout =
    todaysWorkout != null
      ? workouts.find((w) => w.id !== todaysWorkout.id)
      : undefined;

  const todaySessionKind = todaysWorkout
    ? getTodaySessionKind(todaysWorkout)
    : null;

  const insight =
    todaysWorkout != null
      ? buildAdaptiveInsight(todaysWorkout, priorWorkout)
      : null;

  if (loading) {
    return (
      <main className="min-h-screen bg-[#f9f7f7] flex items-center justify-center">
        <p className="text-gray-500">Loading...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f9f7f7] p-6 pb-10">
      <div className="max-w-xl mx-auto space-y-8">

        <div className="flex justify-between items-center gap-3">
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">
            Phase Fit
          </h1>

          <button
            type="button"
            onClick={handleLogout}
            className="px-3 py-2 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-100 shrink-0"
          >
            Logout
          </button>
        </div>

        {/* Hero: Today’s recommendation */}
        <section
          className="rounded-2xl border-2 border-[#7a1f2a]/20 bg-white p-6 sm:p-8 shadow-md shadow-[#7a1f2a]/10 ring-1 ring-black/[0.03]"
          aria-labelledby="todays-training-heading"
        >
          <h2
            id="todays-training-heading"
            className="text-xl sm:text-2xl font-bold text-gray-900 text-center"
          >
            Today’s Training Recommendation
          </h2>

          <p className="mt-2 text-center text-sm text-gray-600 leading-relaxed max-w-sm mx-auto">
            Adapted to your cycle phase, recovery, and recent performance
          </p>

          <div className="mt-6 space-y-4">
            {todaysWorkout ? (
              <>
                <div className="text-center space-y-2">
                  <p className="text-lg sm:text-xl font-semibold text-gray-900">
                    {todaysWorkout.workout}
                  </p>
                  {insight ? (
                    <p className="text-sm text-[#7a1f2a]/90 leading-snug max-w-md mx-auto">
                      {insight}
                    </p>
                  ) : null}
                  <p className="text-sm text-gray-500 capitalize">
                    {todaysWorkout.phase} phase
                  </p>
                </div>

                {todaySessionKind === "completed" ? (
                  <div className="space-y-3">
                    <p className="text-center text-sm text-gray-600 leading-relaxed">
                      Nice work — you&apos;re set for today. A fresh recommendation
                      will be ready when you come back tomorrow.
                    </p>
                    <button
                      type="button"
                      onClick={() =>
                        router.push(`/workout/${todaysWorkout.id}`)
                      }
                      className="w-full rounded-xl border-2 border-[#7a1f2a]/30 bg-[#f9f7f7] py-3 px-4 text-sm font-semibold text-[#7a1f2a] hover:bg-[#7a1f2a]/5 transition"
                    >
                      Review session
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() =>
                      router.push(`/workout/${todaysWorkout.id}`)
                    }
                    className="w-full rounded-xl bg-[#7a1f2a] py-4 px-4 text-base font-semibold text-white shadow-lg shadow-[#7a1f2a]/25 hover:bg-[#641a24] active:scale-[0.99] transition"
                  >
                    {todaySessionKind === "in_progress"
                      ? "Continue Session"
                      : "Start Session"}
                  </button>
                )}
              </>
            ) : (
              <>
                <p className="text-center text-gray-600">
                  No workout yet today
                </p>

                <button
                  type="button"
                  onClick={() => router.push("/generate")}
                  className="w-full rounded-xl bg-[#7a1f2a] py-4 px-4 text-base font-semibold text-white shadow-lg shadow-[#7a1f2a]/25 hover:bg-[#641a24] active:scale-[0.99] transition"
                >
                  Generate Today’s Workout
                </button>
              </>
            )}
          </div>
        </section>

        <div className="flex justify-between items-center pt-2">
          <h2 className="text-lg font-semibold text-gray-900">
            Workout History
          </h2>

          <select
            value={phaseFilter}
            onChange={(e) => setPhaseFilter(e.target.value)}
            className="px-3 py-2 rounded-lg border border-gray-300 text-sm bg-white"
          >
            <option value="all">All Phases</option>
            <option value="menstrual">Menstrual</option>
            <option value="follicular">Follicular</option>
            <option value="ovulatory">Ovulatory</option>
            <option value="luteal">Luteal</option>
          </select>
        </div>

        <div className="space-y-3">
          {filteredWorkouts.length === 0 ? (
            <p className="text-gray-500 text-sm">No workouts found.</p>
          ) : (
            filteredWorkouts.map((w) => (
              <button
                key={w.id}
                type="button"
                onClick={() => router.push(`/workout/${w.id}`)}
                className="w-full text-left bg-white p-4 rounded-xl border border-gray-200 shadow-sm hover:border-[#7a1f2a]/40 hover:shadow transition"
              >
                <p className="font-semibold text-gray-900">{w.workout}</p>
                <p className="text-sm text-gray-500 capitalize">
                  {w.phase}
                  {w.intensity ? ` • ${w.intensity}` : ""}
                </p>
              </button>
            ))
          )}
        </div>

      </div>
    </main>
  );
}
