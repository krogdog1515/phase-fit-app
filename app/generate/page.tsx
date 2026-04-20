"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import supabase from "../lib/supabase";

export default function GeneratePage() {
  const router = useRouter();

  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const [phase, setPhase] = useState("");
  const [energy, setEnergy] = useState("");
  const [time, setTime] = useState("");
  const [style, setStyle] = useState("");
  const [notes, setNotes] = useState("");

  // 🔐 Auth
  useEffect(() => {
    const getUser = async () => {
      const { data } = await supabase.auth.getUser();

      if (!data.user) {
        router.push("/login");
      } else {
        setUser(data.user);
      }
    };

    getUser();
  }, [router]);

  // 🚀 Generate
  const generateWorkout = async () => {
    if (!user) return;

    if (!phase || !energy || !time || !style) {
      alert("Please complete all fields");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/generate-workout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          user_id: user.id,
          phase,
          energy,
          time,
          style,
          notes,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        alert("Failed to generate workout");
        setLoading(false);
        return;
      }

      router.push(`/workout/${data.id}`);
    } catch (err) {
      console.error(err);
      alert("Something went wrong");
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#f9f7f7] p-6">
      <div className="max-w-xl mx-auto space-y-6">

        {/* HEADER */}
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold text-gray-900">
            Generate Workout
          </h1>

          <button
            onClick={() => router.push("/")}
            className="text-sm text-[#7a1f2a] font-medium"
          >
            Back
          </button>
        </div>

        {/* FORM CARD */}
        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm space-y-4">

          {/* PHASE */}
          <div>
            <label className="text-sm text-gray-500">Cycle Phase</label>
            <select
              value={phase}
              onChange={(e) => setPhase(e.target.value)}
              className="w-full mt-1 p-3 border border-gray-300 rounded"
            >
              <option value="">Select Phase</option>
              <option value="menstrual">Menstrual</option>
              <option value="follicular">Follicular</option>
              <option value="ovulatory">Ovulatory</option>
              <option value="luteal">Luteal</option>
            </select>
          </div>

          {/* ENERGY */}
          <div>
            <label className="text-sm text-gray-500">Energy Level</label>
            <select
              value={energy}
              onChange={(e) => setEnergy(e.target.value)}
              className="w-full mt-1 p-3 border border-gray-300 rounded"
            >
              <option value="">Select Energy</option>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </div>

          {/* TIME */}
          <div>
            <label className="text-sm text-gray-500">Workout Duration</label>
            <select
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className="w-full mt-1 p-3 border border-gray-300 rounded"
            >
              <option value="">Select Duration</option>
              <option value="20">20 min</option>
              <option value="40">40 min</option>
              <option value="60">60 min</option>
            </select>
          </div>

          {/* STYLE */}
          <div>
            <label className="text-sm text-gray-500">Workout Type</label>
            <select
              value={style}
              onChange={(e) => setStyle(e.target.value)}
              className="w-full mt-1 p-3 border border-gray-300 rounded"
            >
              <option value="">Select Type</option>
              <option value="strength">Strength</option>
              <option value="upper">Upper Body</option>
              <option value="lower">Lower Body</option>
              <option value="cardio">Cardio / HIIT</option>
              <option value="mobility">Mobility / Recovery</option>
            </select>
          </div>

          {/* NOTES */}
          <div>
            <label className="text-sm text-gray-500">
              Notes (optional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Injuries, preferences, etc."
              className="w-full mt-1 p-3 border border-gray-300 rounded"
            />
          </div>

          {/* CTA */}
          <button
            onClick={generateWorkout}
            disabled={loading}
            className={`w-full py-3 rounded font-semibold ${
              loading
                ? "bg-gray-400 text-white"
                : "bg-[#7a1f2a] text-white"
            }`}
          >
            {loading ? "Generating..." : "Generate Workout"}
          </button>
        </div>

      </div>
    </main>
  );
}