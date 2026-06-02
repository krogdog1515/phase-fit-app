/* eslint-disable @typescript-eslint/no-explicit-any */

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
    <main className="pf-page p-6">
      <div className="pf-container space-y-6">

        <div className="flex justify-between items-center">
          <h1 className="pf-heading-page">Generate Workout</h1>

          <button
            type="button"
            onClick={() => router.push("/")}
            className="pf-link"
          >
            Back
          </button>
        </div>

        <div className="pf-card p-6 space-y-4">

          <div>
            <label className="pf-label">Cycle Phase</label>
            <select
              value={phase}
              onChange={(e) => setPhase(e.target.value)}
              className="pf-select"
            >
              <option value="">Select Phase</option>
              <option value="menstrual">Menstrual</option>
              <option value="follicular">Follicular</option>
              <option value="ovulatory">Ovulatory</option>
              <option value="luteal">Luteal</option>
            </select>
          </div>

          <div>
            <label className="pf-label">Energy Level</label>
            <select
              value={energy}
              onChange={(e) => setEnergy(e.target.value)}
              className="pf-select"
            >
              <option value="">Select Energy</option>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </div>

          <div>
            <label className="pf-label">Workout Duration</label>
            <select
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className="pf-select"
            >
              <option value="">Select Duration</option>
              <option value="20">20 min</option>
              <option value="40">40 min</option>
              <option value="60">60 min</option>
            </select>
          </div>

          <div>
            <label className="pf-label">Workout Type</label>
            <select
              value={style}
              onChange={(e) => setStyle(e.target.value)}
              className="pf-select"
            >
              <option value="">Select Type</option>
              <option value="strength">Strength</option>
              <option value="upper">Upper Body</option>
              <option value="lower">Lower Body</option>
              <option value="cardio">Cardio / HIIT</option>
              <option value="mobility">Mobility / Recovery</option>
            </select>
          </div>

          <div>
            <label className="pf-label">Notes (optional)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Injuries, preferences, etc."
              className="pf-textarea"
            />
          </div>

          <button
            type="button"
            onClick={generateWorkout}
            disabled={loading}
            className="pf-btn-primary disabled:opacity-60"
          >
            {loading ? "Generating..." : "Generate Workout"}
          </button>
        </div>

      </div>
    </main>
  );
}
