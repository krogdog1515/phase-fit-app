"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import WorkoutCalendar from "./components/WorkoutCalendar";
import PhaseFitLogo from "./components/PhaseFitLogo";
import supabase from "./lib/supabase";
import { normalizeDifficulty } from "./lib/difficulty";
import { useOnboardingGuard } from "./lib/use-onboarding-guard";
import { getUserProfile } from "./lib/user-profile";
import { resolvePregnancyStage } from "@/lib/stages/resolvePregnancyStage";
import { STAGE_BAND_LABELS } from "./lib/pregnancy-display";

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

const CYCLE_PHASE_OPTIONS = [
  { value: "menstrual", label: "Menstrual" },
  { value: "follicular", label: "Follicular" },
  { value: "ovulatory", label: "Ovulatory" },
  { value: "luteal", label: "Luteal" },
] as const;

type CyclePhaseValue = (typeof CYCLE_PHASE_OPTIONS)[number]["value"];

function isKnownCyclePhase(value: string | undefined): value is CyclePhaseValue {
  if (!value) return false;
  return CYCLE_PHASE_OPTIONS.some((option) => option.value === value.toLowerCase());
}

function resolveKnownPhase(workouts: WorkoutRow[]): CyclePhaseValue | "" {
  const candidates = [
    workouts.find((w) => isCreatedToday(w.created_at))?.phase,
    workouts[0]?.phase,
  ];

  for (const phase of candidates) {
    const normalized = (phase ?? "").toLowerCase();
    if (isKnownCyclePhase(normalized)) return normalized;
  }

  return "";
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
  const onboardingReady = useOnboardingGuard();

  const [workouts, setWorkouts] = useState<WorkoutRow[]>([]);
  const [outsideActivityDates, setOutsideActivityDates] = useState<string[]>(
    []
  );
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  // Pregnancy-mode home block. Null in cycle mode — the cycle path is unchanged.
  const [pregnancy, setPregnancy] = useState<{ week: number; band: string } | null>(
    null
  );
  // Fail closed: the generate CTA renders ONLY when we positively confirm a
  // generatable state (cycle, or pregnancy with a 'clear' screening). A failed
  // or ambiguous read leaves this false so the UI never invites a click the
  // server would 409.
  const [canGenerate, setCanGenerate] = useState(false);
  const [trainingMode, setTrainingMode] = useState<string | null>(null);
  const [pregnancyScreening, setPregnancyScreening] = useState<string | null>(null);

  const [showOutsideModal, setShowOutsideModal] = useState(false);
  const [outsideActivity, setOutsideActivity] = useState("");
  const [outsideDuration, setOutsideDuration] = useState("");
  const [outsideIntensity, setOutsideIntensity] = useState("");
  const [outsideCyclePhase, setOutsideCyclePhase] = useState<CyclePhaseValue | "">("");
  const [outsideNotes, setOutsideNotes] = useState("");
  const [savingOutside, setSavingOutside] = useState(false);

  const resetOutsideForm = () => {
    setOutsideActivity("");
    setOutsideDuration("");
    setOutsideIntensity("");
    setOutsideCyclePhase("");
    setOutsideNotes("");
  };

  const openOutsideModal = () => {
    setOutsideCyclePhase(resolveKnownPhase(workouts));
    setShowOutsideModal(true);
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
    if (!isKnownCyclePhase(outsideCyclePhase)) {
      alert("Select your cycle phase.");
      return;
    }

    setSavingOutside(true);

    const { error } = await supabase.from("outside_workouts").insert({
      user_id: userId,
      activity_type: activity,
      duration_minutes: Math.round(duration),
      intensity: outsideIntensity,
      cycle_phase: outsideCyclePhase,
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
    if (!onboardingReady) return;

    const init = async () => {
      const { data } = await supabase.auth.getUser();

      if (!data.user) {
        router.push("/login");
        return;
      }

      setUserId(data.user.id);

      const profile = await getUserProfile(data.user.id);
      const mode = profile?.training_mode ?? null;
      setTrainingMode(mode);

      if (mode === "cycle") {
        setCanGenerate(true);
      } else if (mode === "pregnancy") {
        if (profile?.stage_anchor_date) {
          const stage = resolvePregnancyStage(profile.stage_anchor_date, new Date());
          if (stage.ok) {
            setPregnancy({
              week: stage.gestationalWeek,
              band: STAGE_BAND_LABELS[stage.stageKey],
            });
          }
        }
        // Own screening rows are readable via RLS.
        const { data: row } = await supabase
          .from("pregnancy_screening")
          .select("screening_result")
          .eq("user_id", data.user.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        const result = (row?.screening_result as string) ?? null;
        setPregnancyScreening(result);
        setCanGenerate(result === "clear");
      }

      const [workoutsRes, outsideRes] = await Promise.all([
        supabase
          .from("workouts")
          .select(
            "id, workout, phase, intensity, created_at, completed, difficulty"
          )
          .eq("user_id", data.user.id)
          .neq("completed", "cancelled")
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
  }, [router, onboardingReady]);

  const todaysWorkouts = workouts.filter((w) => isCreatedToday(w.created_at));
  const latestToday = todaysWorkouts[0] ?? null;

  /** Newest session today drives hero state and CTAs. */
  const heroWorkout = latestToday;

  const heroShowsCompletedOnly =
    heroWorkout != null && isSessionComplete(heroWorkout);

  const priorWorkout =
    heroWorkout != null
      ? workouts.find((w) => w.id !== heroWorkout.id)
      : undefined;

  const insight =
    heroWorkout != null
      ? buildAdaptiveInsight(heroWorkout, priorWorkout)
      : null;

  const heroHeadline =
    insight ??
    (heroWorkout
      ? "Your session is ready when you are"
      : "Train smarter through every phase");

  const heroSubcopy = heroWorkout
    ? "Personalized to your cycle, recovery, and recent performance"
    : "Adaptive coaching that meets you where you are today";

  if (loading || !onboardingReady) {
    return (
      <main className="pf-page flex items-center justify-center">
        <p className="pf-body-muted">Loading...</p>
      </main>
    );
  }

  return (
    <main className="pf-page pb-12">
      {/* Utility bar */}
      <div className="px-5 pt-4 flex justify-end">
        <button
          type="button"
          onClick={() => router.push("/settings")}
          className="pf-btn-ghost"
        >
          Settings
        </button>
      </div>

      {/* Branded hero */}
      <section
        className="pf-home-hero px-5 pt-4 pb-8 sm:pb-10 text-center"
        aria-label="Welcome"
      >
        <PhaseFitLogo
          variant="dashboard"
          className="flex justify-center mb-6"
          priority
        />
        <p className="pf-section-eyebrow mb-2">Adaptive coaching</p>
        <h2 className="pf-heading-hero max-w-md mx-auto leading-snug">
          {heroHeadline}
        </h2>
        <p className="mt-3 pf-body-secondary max-w-sm mx-auto text-[0.9375rem]">
          {heroSubcopy}
        </p>
      </section>

      <div className="pf-container px-5 space-y-7 sm:space-y-8">

        {/* Pregnancy status — additive, pregnancy mode only. Proof of pipeline;
            cycle mode never renders this. */}
        {pregnancy ? (
          <section className="pf-card p-5 sm:p-6" aria-label="Pregnancy status">
            <p className="pf-section-eyebrow mb-2">Pregnancy</p>
            <p className="pf-heading-section text-lg">Week {pregnancy.week}</p>
            <p className="pf-body-secondary text-sm mt-1">{pregnancy.band}</p>
          </section>
        ) : null}

        {/* Today's recommendation */}
        <section
          className="pf-card-hero p-6 sm:p-8 -mt-2"
          aria-labelledby="todays-training-heading"
        >
          <p className="pf-section-eyebrow mb-2">Today</p>
          <h2
            id="todays-training-heading"
            className="pf-heading-section text-xl sm:text-2xl"
          >
            Today&apos;s Training Recommendation
          </h2>

          <div className="mt-6 space-y-5">
            {!canGenerate ? (
              /* Fail closed: the generate CTA shows only for a confirmed
                 generatable state. Pregnancy gets screening-specific copy;
                 anything unconfirmed -> a neutral message. Never the button. */
              <p className="text-pf-text-secondary text-[0.9375rem] leading-relaxed">
                {trainingMode === "pregnancy"
                  ? pregnancyScreening === "hard_stop"
                    ? "Based on your screening, please work with your provider before training here."
                    : pregnancyScreening === "provider_conversation"
                      ? "We're waiting on your provider conversation before suggesting workouts."
                      : "Finish your pregnancy screening in Settings to start."
                  : "We couldn't confirm your training mode just now. Refresh to try again."}
              </p>
            ) : heroWorkout ? (
              <>
                <div className="space-y-3">
                  <p className="text-xl sm:text-2xl font-bold text-pf-text font-[family-name:var(--font-barlow-condensed)] uppercase tracking-wide leading-tight">
                    {heroWorkout.workout}
                  </p>
                  <span className="pf-badge capitalize inline-block">
                    {heroWorkout.phase} phase
                  </span>
                </div>

                {heroShowsCompletedOnly ? (
                  <div className="space-y-3 pt-1">
                    <p className="text-sm text-pf-text-secondary leading-relaxed">
                      Your latest session is complete. Review it anytime, or add
                      another round when you&apos;re ready.
                    </p>
                    <button
                      type="button"
                      onClick={() =>
                        router.push(`/workout/${heroWorkout.id}`)
                      }
                      className="pf-btn-primary pf-btn-primary-prominent"
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
                    className="pf-btn-primary pf-btn-primary-prominent"
                  >
                    Continue Session
                  </button>
                )}
              </>
            ) : (
              <div className="space-y-5">
                <p className="text-pf-text-secondary text-[0.9375rem] leading-relaxed">
                  No workout yet today — generate one tailored to how you feel
                  right now.
                </p>

                <button
                  type="button"
                  onClick={() => router.push("/generate")}
                  className="pf-btn-primary pf-btn-primary-prominent"
                >
                  Generate Today&apos;s Workout
                </button>
              </div>
            )}
          </div>
        </section>

        {/* Outside workout */}
        <button
          type="button"
          onClick={openOutsideModal}
          className="pf-outside-cta"
        >
          <span aria-hidden className="text-lg leading-none text-pf-coral">
            +
          </span>
          Log Outside Workout
        </button>

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

              <fieldset className="border-0 p-0 m-0">
                <legend className="pf-label mb-2">Cycle phase</legend>
                <div className="pf-radio-group" role="radiogroup" aria-label="Cycle phase">
                  {CYCLE_PHASE_OPTIONS.map((option) => (
                    <label
                      key={option.value}
                      className="pf-radio-option"
                    >
                      <input
                        type="radio"
                        name="outside-cycle-phase"
                        value={option.value}
                        checked={outsideCyclePhase === option.value}
                        onChange={() => setOutsideCyclePhase(option.value)}
                        className="pf-radio-input"
                      />
                      <span>{option.label}</span>
                    </label>
                  ))}
                </div>
              </fieldset>

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

        {/* Timeline */}
        <section aria-labelledby="timeline-heading">
          <div className="mb-4 px-0.5">
            <p className="pf-section-eyebrow mb-1.5">Your progress</p>
            <h2 id="timeline-heading" className="pf-heading-section">
              Training Timeline
            </h2>
            <p className="mt-1.5 pf-body-muted text-[0.8125rem]">
              Sessions and outside activity mapped to your cycle
            </p>
          </div>

          <WorkoutCalendar
            workouts={workouts}
            outsideActivityDates={outsideActivityDates}
            hideHeading
          />
        </section>

      </div>
    </main>
  );
}
