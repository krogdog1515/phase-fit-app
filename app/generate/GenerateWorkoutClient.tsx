/* eslint-disable @typescript-eslint/no-explicit-any */

"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import supabase from "../lib/supabase";

export default function GenerateWorkoutClient() {
  const router = useRouter();

  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const [phase, setPhase] = useState("");
  const [energy, setEnergy] = useState("");
  const [time, setTime] = useState("");
  const [workoutStyle, setWorkoutStyle] = useState("");
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

    if (!phase || !energy || !time || !workoutStyle) {
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
          style: workoutStyle,
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
    <>
      <section
        className="pf-card-hero p-6 sm:p-8"
        aria-labelledby="workout-config-heading"
      >
        <p className="pf-section-eyebrow mb-2">Configuration</p>
        <h2 id="workout-config-heading" className="pf-heading-section">
          Session Details
        </h2>

        <div className="mt-6">
          <div className="pf-form-section">
            <h3 className="pf-form-section-title">Training Goal</h3>
            <p className="pf-form-section-hint">
              What type of session are you aiming for today?
            </p>
            <div>
              <label className="pf-label sr-only" htmlFor="workout-style">
                Workout type
              </label>
              <select
                id="workout-style"
                value={workoutStyle}
                onChange={(e) => setWorkoutStyle(e.target.value)}
                className="pf-select"
              >
                <option value="">Select type</option>
                <option value="strength">Strength</option>
                <option value="upper">Upper Body</option>
                <option value="lower">Lower Body</option>
                <option value="cardio">Cardio / HIIT</option>
                <option value="mobility">Mobility / Recovery</option>
              </select>
            </div>
          </div>

          <div className="pf-form-divider" />

          <div className="pf-form-section">
            <h3 className="pf-form-section-title">Available Time</h3>
            <p className="pf-form-section-hint">
              How long can you train right now?
            </p>
            <div>
              <label className="pf-label sr-only" htmlFor="workout-time">
                Duration
              </label>
              <select
                id="workout-time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="pf-select"
              >
                <option value="">Select duration</option>
                <option value="20">20 min</option>
                <option value="40">40 min</option>
                <option value="60">60 min</option>
              </select>
            </div>
          </div>

          <div className="pf-form-divider" />

          <div className="pf-form-section">
            <h3 className="pf-form-section-title">Equipment</h3>
            <p className="pf-form-section-hint">
              Note what you have access to, injuries, or preferences.
            </p>
            <div>
              <label className="pf-label" htmlFor="workout-notes">
                Equipment &amp; notes (optional)
              </label>
              <textarea
                id="workout-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. dumbbells, bands, full gym, bodyweight only, knee-friendly..."
                rows={3}
                className="pf-textarea"
              />
            </div>
          </div>

          <div className="pf-form-divider" />

          <div className="pf-form-section">
            <h3 className="pf-form-section-title">Energy &amp; Recovery</h3>
            <p className="pf-form-section-hint">
              Helps calibrate intensity to your cycle and how you feel.
            </p>
            <div>
              <label className="pf-label" htmlFor="workout-phase">
                Cycle phase
              </label>
              <select
                id="workout-phase"
                value={phase}
                onChange={(e) => setPhase(e.target.value)}
                className="pf-select"
              >
                <option value="">Select phase</option>
                <option value="menstrual">Menstrual</option>
                <option value="follicular">Follicular</option>
                <option value="ovulatory">Ovulatory</option>
                <option value="luteal">Luteal</option>
              </select>
            </div>
            <div>
              <label className="pf-label" htmlFor="workout-energy">
                Energy level
              </label>
              <select
                id="workout-energy"
                value={energy}
                onChange={(e) => setEnergy(e.target.value)}
                className="pf-select"
              >
                <option value="">Select energy</option>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </div>
          </div>
        </div>
      </section>

      <button
        type="button"
        onClick={generateWorkout}
        disabled={loading}
        className="pf-btn-primary pf-btn-primary-prominent disabled:opacity-60"
      >
        {loading ? "Generating…" : "Generate Workout"}
      </button>

      {loading ? (
        <div
          className="pf-generate-loading"
          role="status"
          aria-live="polite"
          aria-label="Generating workout"
        >
          <div className="pf-card pf-generate-loading-card">
            <div className="pf-loading-spinner" aria-hidden />
            <p className="pf-heading-section text-base mb-2">
              Building your session
            </p>
            <p className="pf-body-muted text-sm">
              Adapting to your cycle, energy, and goals…
            </p>
          </div>
        </div>
      ) : null}
    </>
  );
}
