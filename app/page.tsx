/* eslint-disable @typescript-eslint/no-explicit-any */

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import supabase from "./lib/supabase";

export default function Home() {
  const router = useRouter();

  const [user, setUser] = useState<any>(null);
  const [workouts, setWorkouts] = useState<any[]>([]);
  const [phaseFilter, setPhaseFilter] = useState("all");
  const [loading, setLoading] = useState(true);

  // 🔐 Init
  useEffect(() => {
    const init = async () => {
      const { data } = await supabase.auth.getUser();

      if (!data.user) {
        router.push("/login");
        return;
      }

      setUser(data.user);

      const { data: workoutsData, error } = await supabase
        .from("workouts")
        .select("*")
        .eq("user_id", data.user.id)
        .order("created_at", { ascending: false });

      if (!error) {
        setWorkouts(workoutsData || []);
      }

      setLoading(false);
    };

    init();
  }, [router]);

  // ✅ FILTERED WORKOUTS (NO STATE, NO EFFECT)
  const filteredWorkouts =
    phaseFilter === "all"
      ? workouts
      : workouts.filter((w) => w.phase === phaseFilter);

  const latestWorkout = workouts[0];

  if (loading) {
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
            Phase Fit
          </h1>

          <button
            onClick={() => router.push("/generate")}
            className="px-4 py-2 rounded bg-[#7a1f2a] text-white text-sm font-semibold"
          >
            Generate
          </button>
        </div>

        {/* TODAY'S WORKOUT */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 space-y-2">
          <p className="text-sm text-gray-500">Today’s Recommendation</p>

          {latestWorkout ? (
            <div
              onClick={() => router.push(`/workout/${latestWorkout.id}`)}
              className="cursor-pointer"
            >
              <p className="text-lg font-semibold text-gray-900">
                {latestWorkout.workout}
              </p>
              <p className="text-sm text-gray-500 capitalize">
                {latestWorkout.phase} phase
              </p>
            </div>
          ) : (
            <p className="text-gray-500">
              No workouts yet. Generate your first one.
            </p>
          )}
        </div>

        {/* PRIMARY CTA */}
        <button
          onClick={() => router.push("/generate")}
          className="w-full py-3 rounded font-semibold bg-[#7a1f2a] text-white"
        >
          Generate New Workout
        </button>

        {/* FILTER + TITLE */}
        <div className="flex justify-between items-center">
          <h2 className="text-lg font-semibold text-gray-900">
            Workout History
          </h2>

          <select
            value={phaseFilter}
            onChange={(e) => setPhaseFilter(e.target.value)}
            className="px-3 py-2 rounded border border-gray-300 text-sm"
          >
            <option value="all">All Phases</option>
            <option value="menstrual">Menstrual</option>
            <option value="follicular">Follicular</option>
            <option value="ovulatory">Ovulatory</option>
            <option value="luteal">Luteal</option>
          </select>
        </div>

        {/* WORKOUT LIST */}
        <div className="space-y-3">
          {filteredWorkouts.length === 0 ? (
            <p className="text-gray-500">No workouts found.</p>
          ) : (
            filteredWorkouts.map((w) => (
              <div
                key={w.id}
                onClick={() => router.push(`/workout/${w.id}`)}
                className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm cursor-pointer hover:border-[#7a1f2a]"
              >
                <p className="font-semibold text-gray-900">
                  {w.workout}
                </p>
                <p className="text-sm text-gray-500 capitalize">
                  {w.phase} • {w.intensity}
                </p>
              </div>
            ))
          )}
        </div>

      </div>
    </main>
  );
}