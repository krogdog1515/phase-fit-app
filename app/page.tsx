"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import WorkoutCalendar from "./components/WorkoutCalendar";
import PhaseFitLogo from "./components/PhaseFitLogo";
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

function isSessionComplete(w: WorkoutRow): boolean {
  const c = (w.completed ?? "").trim().toLowerCase();
  return c === "full" || c === "skipped";
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

const OUTSIDE_ACTIVITY_PRESETS = [
  "Pilates",
  "Yoga",
  "Run",
  "Spin Class",
  "Hiking",
  "Strength Class",
  "Walking",
  "Cycling",
  "Swimming",
];

const OUTSIDE_INTENSITY_OPTIONS = ["light", "moderate", "hard"] as const;

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
  const [outsideActivityDates, setOutsideActivityDates] = useState<string[]>(
    []
  );
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

  const [showOutsideModal, setShowOutsideModal] = useState(false);
  const [outsideActivity, setOutsideActivity] = useState("");
  const [outsideDuration, setOutsideDuration] = useState("");
  const [outsideIntensity, setOutsideIntensity] = useState("");
  const [outsideNotes, setOutsideNotes] = useState("");
  const [savingOutside, setSavingOutside] = useState(false);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  const resetOutsideForm = () => {
    setOutsideActivity("");
    setOutsideDuration("");
    setOutsideIntensity("");
    setOutsideNotes("");
  };

  const saveOutsideWorkout = async () => {
    if (!userId) return;

    const activity = outsideActivity.trim();
    const duration = Number(outsideDuration);
    if (!activity) {
      alert("Choose or enter an activity.");
      return;
    }
    if (!Number.isFinite(duration) || duration <= 0) {
      alert("Enter duration in minutes.");
      return;
    }
    if (!OUTSIDE_INTENSITY_OPTIONS.includes(outsideIntensity as typeof OUTSIDE_INTENSITY_OPTIONS[number])) {
      alert("Select intensity.");
      return;
    }

    setSavingOutside(true);

    const { error } = await supabase.from("outside_workouts").insert({
      user_id: userId,
      activity_type: activity,
      duration_minutes: Math.round(duration),
      intensity: outsideIntensity,
      notes: outsideNotes.trim() || null,
    });

    setSavingOutside(false);

    if (error) {
      console.error(error);
      alert(error.message || "Could not save activity.");
      return;
    }

    resetOutsideForm();
    setShowOutsideModal(false);
    setOutsideActivityDates((prev) => [
      new Date().toISOString(),
      ...prev,
    ]);
  };

  useEffect(() => {
    const init = async () => {
      const { data } = await supabase.auth.getUser();

      if (!data.user) {
        router.push("/login");
        return;
      }

      setUserId(data.user.id);

      const [workoutsRes, outsideRes] = await Promise.all([
        supabase
          .from("workouts")
          .select(
            "id, workout, phase, intensity, created_at, completed, difficulty"
          )
          .eq("user_id", data.user.id)
          .order("created_at", { ascending: false }),
        supabase
          .from("outside_workouts")
          .select("created_at")
          .eq("user_id", data.user.id)
          .order("created_at", { ascending: false }),
      ]);

      if (!workoutsRes.error && workoutsRes.data) {
        setWorkouts(workoutsRes.data as WorkoutRow[]);
      }

      if (!outsideRes.error && outsideRes.data) {
        setOutsideActivityDates(
          outsideRes.data.map((row) => String(row.created_at))
        );
      }

      setLoading(false);
    };

    init();
  }, [router]);

  const todaysWorkouts = workouts.filter((w) => isCreatedToday(w.created_at));

  const activeIncompleteToday =
    todaysWorkouts.find((w) => !isSessionComplete(w)) ?? null;

  /** Newest session today when resuming; newest completed today when all are done. */
  const heroWorkout =
    activeIncompleteToday ?? (todaysWorkouts[0] ?? null);

  const heroShowsCompletedOnly =
    heroWorkout != null &&
    activeIncompleteToday == null &&
    todaysWorkouts.length > 0;

  const priorWorkout =
    heroWorkout != null
      ? workouts.find((w) => w.id !== heroWorkout.id)
      : undefined;

  const insight =
    heroWorkout != null
      ? buildAdaptiveInsight(heroWorkout, priorWorkout)
      : null;

  if (loading) {
    return (
      <main className="pf-page flex items-center justify-center">
        <p className="pf-body-muted">Loading...</p>
      </main>
    );
  }

  return (
    <main className="pf-page p-6 pb-10">
      <div className="pf-container space-y-8">

        <div className="flex justify-between items-center gap-3">
          <PhaseFitLogo variant="header" className="shrink-0" priority />

          <button
            type="button"
            onClick={handleLogout}
            className="pf-btn-secondary shrink-0 !w-auto !py-2 !px-3 text-sm"
          >
            Logout
          </button>
        </div>

        {/* Hero: Today’s recommendation */}
        <section
          className="pf-card-hero p-6 sm:p-8"
          aria-labelledby="todays-training-heading"
        >
          <h2
            id="todays-training-heading"
            className="pf-heading-hero text-center"
          >
            Today’s Training Recommendation
          </h2>

          <p className="mt-2 text-center text-sm text-pf-text-secondary leading-relaxed max-w-sm mx-auto">
            Adapted to your cycle phase, recovery, and recent performance
          </p>

          <div className="mt-6 space-y-4">
            {heroWorkout ? (
              <>
                <div className="text-center space-y-2">
                  <p className="text-lg sm:text-xl font-semibold text-pf-text font-[family-name:var(--font-barlow-condensed)] uppercase tracking-wide">
                    {heroWorkout.workout}
                  </p>
                  {insight ? (
                    <p className="text-sm text-pf-coral leading-snug max-w-md mx-auto pf-accent-italic">
                      {insight}
                    </p>
                  ) : null}
                  <span className="pf-badge capitalize inline-block">
                    {heroWorkout.phase} phase
                  </span>
                </div>

                {heroShowsCompletedOnly ? (
                  <div className="space-y-3">
                    <p className="text-center text-sm text-pf-text-secondary leading-relaxed">
                      Your latest session is complete. Review it anytime, or add
                      another round when you&apos;re ready.
                    </p>
                    <button
                      type="button"
                      onClick={() =>
                        router.push(`/workout/${heroWorkout.id}`)
                      }
                      className="pf-btn-primary"
                    >
                      Review Session
                    </button>
                    <button
                      type="button"
                      onClick={() => router.push("/generate")}
                      className="pf-btn-secondary"
                    >
                      Generate Another Session
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() =>
                      router.push(`/workout/${heroWorkout.id}`)
                    }
                    className="pf-btn-primary"
                  >
                    Continue Session
                  </button>
                )}
              </>
            ) : (
              <>
                <p className="text-center text-pf-text-secondary">
                  No workout yet today
                </p>

                <button
                  type="button"
                  onClick={() => router.push("/generate")}
                  className="pf-btn-primary"
                >
                  Generate Today’s Workout
                </button>
              </>
            )}
          </div>
        </section>

        <div className="flex justify-center -mt-4">
          <button
            type="button"
            onClick={() => setShowOutsideModal(true)}
            className="pf-link font-medium py-2 px-3 rounded-lg hover:bg-pf-card transition"
          >
            + Log Outside Workout
          </button>
        </div>

        {showOutsideModal && (
          <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center p-4 z-50">
            <div className="pf-card p-5 w-full max-w-md space-y-4 max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-center">
                <h2 className="pf-heading-section">
                  Log outside activity
                </h2>
                <button
                  type="button"
                  onClick={() => {
                    setShowOutsideModal(false);
                    resetOutsideForm();
                  }}
                  className="text-sm text-pf-text-muted hover:text-pf-text"
                >
                  Close
                </button>
              </div>

              <p className="text-sm text-pf-text-secondary">
                Quick log for activities done outside the app — helps coaching
                understand your overall load.
              </p>

              <div>
                <label className="pf-label">Activity</label>
                <input
                  list="outside-activity-presets"
                  value={outsideActivity}
                  onChange={(e) => setOutsideActivity(e.target.value)}
                  placeholder="e.g. Pilates, Run, Yoga"
                  className="pf-input"
                />
                <datalist id="outside-activity-presets">
                  {OUTSIDE_ACTIVITY_PRESETS.map((a) => (
                    <option key={a} value={a} />
                  ))}
                </datalist>
              </div>

              <div>
                <label className="pf-label">Duration (minutes)</label>
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  value={outsideDuration}
                  onChange={(e) => setOutsideDuration(e.target.value)}
                  placeholder="45"
                  className="pf-input"
                />
              </div>

              <div>
                <label className="pf-label">Intensity</label>
                <select
                  value={outsideIntensity}
                  onChange={(e) => setOutsideIntensity(e.target.value)}
                  className="pf-select"
                >
                  <option value="">Select</option>
                  {OUTSIDE_INTENSITY_OPTIONS.map((level) => (
                    <option key={level} value={level}>
                      {level.charAt(0).toUpperCase() + level.slice(1)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="pf-label">Notes (optional)</label>
                <textarea
                  value={outsideNotes}
                  onChange={(e) => setOutsideNotes(e.target.value)}
                  placeholder="How it felt, anything relevant"
                  rows={2}
                  className="pf-textarea"
                />
              </div>

              <button
                type="button"
                onClick={saveOutsideWorkout}
                disabled={savingOutside}
                className="pf-btn-primary disabled:opacity-60"
              >
                {savingOutside ? "Saving…" : "Save activity"}
              </button>
            </div>
          </div>
        )}

        <WorkoutCalendar
          workouts={workouts}
          outsideActivityDates={outsideActivityDates}
        />

      </div>
    </main>
  );
}
