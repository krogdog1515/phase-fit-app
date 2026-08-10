/* eslint-disable @typescript-eslint/no-explicit-any */

"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import supabase from "../lib/supabase";
import { useOnboardingGuard } from "../lib/use-onboarding-guard";
import { getUserProfile } from "../lib/user-profile";
import { localDateISO } from "@/lib/dates";
import { evaluateRedFlags, type RedFlagAnswers } from "@/lib/safety/redFlags";
import {
  resolvePregnancyGenerateView,
  type CheckinStatus,
} from "../lib/pregnancy-generate-gate";
import PregnancyBlockedNotice from "../components/PregnancyBlockedNotice";

// Grouped so chair/wall aren't an easy accidental omission — unchecking them
// silently removes real movements (e.g. the only squat depends on a chair).
const COMMON_EQUIPMENT: Array<{ value: string; label: string }> = [
  { value: "chair", label: "Chair" },
  { value: "wall", label: "Wall" },
];
const OPTIONAL_EQUIPMENT: Array<{ value: string; label: string }> = [
  { value: "band", label: "Resistance band" },
  { value: "dumbbell", label: "Dumbbell" },
  { value: "bench", label: "Bench" },
];
// Chair + wall default to checked — nearly everyone has them.
const DEFAULT_EQUIPMENT = ["chair", "wall"];

/** Bearer token for the API. The route derives the user from it, not the body. */
async function getAccessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

/**
 * Today's daily check-in status for a pregnant user. Fail closed: a read error
 * or no row -> "needed"; a flagged check-in -> "blocked". Verdict recomputed via
 * evaluateRedFlags, never trusted from a stored boolean.
 */
async function fetchCheckinStatus(userId: string): Promise<CheckinStatus> {
  const { data, error } = await supabase
    .from("daily_checkins")
    .select("red_flags")
    .eq("user_id", userId)
    .eq("date", localDateISO(new Date()))
    .maybeSingle();
  if (error || !data) return "needed";
  const answers = (data.red_flags as { answers?: unknown } | null)?.answers;
  return evaluateRedFlags(answers as RedFlagAnswers).blocked ? "blocked" : "clear";
}

export default function GenerateWorkoutClient() {
  const router = useRouter();
  const onboardingReady = useOnboardingGuard();

  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  // Fail closed: `mode` is null until the profile read resolves; `checking`
  // keeps any form from flashing before we know the mode + screening state.
  const [mode, setMode] = useState<string | null>(null);
  const [screening, setScreening] = useState<string | null>(null);
  const [checkinStatus, setCheckinStatus] = useState<CheckinStatus>("loading");
  const [checking, setChecking] = useState(true);
  // Inline, on-brand error copy — replaces window.alert everywhere here.
  const [formError, setFormError] = useState<string | null>(null);

  // Cycle inputs.
  const [phase, setPhase] = useState("");
  const [energy, setEnergy] = useState("");
  const [time, setTime] = useState("");
  const [workoutStyle, setWorkoutStyle] = useState("");
  const [notes, setNotes] = useState("");

  // Pregnancy inputs (simplified form): session length + equipment on hand.
  const [equipment, setEquipment] = useState<string[]>(DEFAULT_EQUIPMENT);

  useEffect(() => {
    if (!onboardingReady) return;

    const init = async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        router.push("/login");
        return;
      }
      setUser(data.user);
      const profile = await getUserProfile(data.user.id);
      const trainingMode = profile?.training_mode ?? null;
      setMode(trainingMode);

      if (trainingMode === "pregnancy") {
        // Own screening rows are readable via RLS ("Users read own screening").
        const { data: row } = await supabase
          .from("pregnancy_screening")
          .select("screening_result")
          .eq("user_id", data.user.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        const result = (row?.screening_result as string) ?? null;
        setScreening(result);
        // Daily check-in gate — same as the home screen. Only relevant once
        // screening is clear; fail closed otherwise.
        if (result === "clear") {
          setCheckinStatus(await fetchCheckinStatus(data.user.id));
        }
      }
      setChecking(false);
    };

    init();
  }, [router, onboardingReady]);

  const toggleEquipment = (value: string) => {
    setEquipment((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value],
    );
  };

  const generateCycle = async () => {
    if (!phase || !energy || !time || !workoutStyle) {
      setFormError("Please complete all fields.");
      return;
    }
    setFormError(null);
    setLoading(true);
    try {
      const token = await getAccessToken();
      if (!token) {
        router.push("/login");
        return;
      }
      const res = await fetch("/api/generate-workout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ phase, energy, time, style: workoutStyle, notes }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFormError(data?.error ?? "Failed to generate workout. Please try again.");
        setLoading(false);
        return;
      }
      router.push(`/workout/${data.id}`);
    } catch (err) {
      console.error(err);
      setFormError("Something went wrong. Please try again.");
      setLoading(false);
    }
  };

  const generatePregnancy = async () => {
    if (!time) {
      setFormError("Select a session length.");
      return;
    }
    setFormError(null);
    setLoading(true);
    try {
      const token = await getAccessToken();
      if (!token) {
        router.push("/login");
        return;
      }
      const res = await fetch("/api/generate-workout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        // date: client-local "today" for the daily check-in gate.
        body: JSON.stringify({ time, equipment, date: localDateISO(new Date()) }),
      });
      const data = await res.json();
      if (!res.ok) {
        // 409 race: she may have flagged a check-in in another tab after this
        // page loaded clear. Re-derive the gate; the render then shows the
        // blocked / check-in card inline. Never a native alert.
        if (res.status === 409 && user?.id) {
          const status = await fetchCheckinStatus(user.id);
          setCheckinStatus(status);
          setFormError(
            status === "clear"
              ? data?.error ?? "We can't generate a session right now."
              : null,
          );
        } else {
          setFormError(data?.error ?? "Couldn't generate right now. Please try again.");
        }
        setLoading(false);
        return;
      }
      router.push(`/workout/${data.id}`);
    } catch (err) {
      console.error(err);
      setFormError("Something went wrong. Please try again.");
      setLoading(false);
    }
  };

  const loadingOverlay = loading ? (
    <div
      className="pf-generate-loading"
      role="status"
      aria-live="polite"
      aria-label="Generating workout"
    >
      <div className="pf-card pf-generate-loading-card">
        <div className="pf-loading-spinner" aria-hidden />
        <p className="pf-heading-section text-base mb-2">Building your session</p>
        <p className="pf-body-muted text-sm">Assembling your session…</p>
      </div>
    </div>
  ) : null;

  const stateCard = (eyebrow: string, heading: string, body: string) => (
    <section className="pf-card-hero p-6 sm:p-8 text-center space-y-3">
      <p className="pf-section-eyebrow">{eyebrow}</p>
      <h2 className="pf-heading-section">{heading}</h2>
      <p className="pf-body-secondary text-sm">{body}</p>
      <button
        type="button"
        onClick={() => router.push("/")}
        className="pf-btn-secondary"
      >
        Back to home
      </button>
    </section>
  );

  if (!onboardingReady || !user || checking) {
    return (
      <div className="pf-card p-6 text-center">
        <p className="pf-body-muted">Loading...</p>
      </div>
    );
  }

  // ---- Pregnancy branch (separate from cycle; selected by training_mode) ----
  if (mode === "pregnancy") {
    // Fail closed: the form renders ONLY for screening-clear + check-in-clear.
    const view = resolvePregnancyGenerateView({ screening, checkinStatus });

    if (view === "hard_stop") {
      return stateCard(
        "Pregnancy",
        "Let's pause on workouts",
        "Based on your screening, please work with your provider before training here.",
      );
    }
    if (view === "provider_conversation") {
      return stateCard(
        "Pregnancy",
        "A quick check first",
        "We're waiting on your provider conversation before suggesting workouts. Once you're cleared, come back and we'll build your session.",
      );
    }
    if (view === "needs_screening") {
      return stateCard(
        "Pregnancy",
        "Finish your screening",
        "Complete the pregnancy screening in Settings before generating a workout.",
      );
    }
    if (view === "checkin_needed") {
      return stateCard(
        "Pregnancy",
        "Quick check first",
        "Head back home to do today's check-in before we plan a session.",
      );
    }
    if (view === "blocked") {
      return (
        <section className="pf-card-hero p-6 sm:p-8 text-center space-y-3">
          <p className="pf-section-eyebrow">Pregnancy</p>
          <PregnancyBlockedNotice />
          <button
            type="button"
            onClick={() => router.push("/")}
            className="pf-btn-secondary"
          >
            Back to home
          </button>
        </section>
      );
    }

    // view === 'form' -> simplified pregnancy form.
    return (
      <>
        <section className="pf-card-hero p-6 sm:p-8" aria-labelledby="preg-config-heading">
          <p className="pf-section-eyebrow mb-2">Pregnancy session</p>
          <h2 id="preg-config-heading" className="pf-heading-section">
            Session Details
          </h2>

          <div className="mt-6">
            <div className="pf-form-section">
              <h3 className="pf-form-section-title">Available Time</h3>
              <p className="pf-form-section-hint">How long can you train right now?</p>
              <label className="pf-label sr-only" htmlFor="preg-time">Duration</label>
              <select
                id="preg-time"
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

            <div className="pf-form-divider" />

            <div className="pf-form-section">
              <h3 className="pf-form-section-title">Equipment available</h3>
              <p className="pf-form-section-hint">
                Bodyweight movements are always included. Uncheck anything you don&apos;t have.
              </p>

              <p className="pf-label mt-1 mb-1">Almost everyone has these</p>
              <div className="pf-radio-group" role="group" aria-label="Common equipment">
                {COMMON_EQUIPMENT.map((opt) => (
                  <label key={opt.value} className="pf-radio-option">
                    <input
                      type="checkbox"
                      checked={equipment.includes(opt.value)}
                      onChange={() => toggleEquipment(opt.value)}
                      className="pf-radio-input"
                    />
                    <span>{opt.label}</span>
                  </label>
                ))}
              </div>

              <p className="pf-label mt-3 mb-1">Optional</p>
              <div className="pf-radio-group" role="group" aria-label="Optional equipment">
                {OPTIONAL_EQUIPMENT.map((opt) => (
                  <label key={opt.value} className="pf-radio-option">
                    <input
                      type="checkbox"
                      checked={equipment.includes(opt.value)}
                      onChange={() => toggleEquipment(opt.value)}
                      className="pf-radio-input"
                    />
                    <span>{opt.label}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        </section>

        {formError ? (
          <p className="text-sm text-pf-coral">{formError}</p>
        ) : null}

        <button
          type="button"
          onClick={generatePregnancy}
          disabled={loading}
          className="pf-btn-primary pf-btn-primary-prominent disabled:opacity-60"
        >
          {loading ? "Generating…" : "Generate Workout"}
        </button>

        {loadingOverlay}
      </>
    );
  }

  // Fail closed: anything not positively confirmed 'cycle' shows no form.
  if (mode !== "cycle") {
    return stateCard(
      "Unavailable",
      "Workout generation is unavailable",
      "We couldn't confirm your training mode just now. Head back and try again.",
    );
  }

  // ---- Cycle branch (unchanged form; now sends a Bearer token) ----
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

      {formError ? (
        <p className="text-sm text-pf-coral">{formError}</p>
      ) : null}

      <button
        type="button"
        onClick={generateCycle}
        disabled={loading}
        className="pf-btn-primary pf-btn-primary-prominent disabled:opacity-60"
      >
        {loading ? "Generating…" : "Generate Workout"}
      </button>

      {loadingOverlay}
    </>
  );
}
