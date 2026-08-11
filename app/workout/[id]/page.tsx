"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import supabase from "../../lib/supabase";
import {
  DIFFICULTY_LABELS,
  DIFFICULTY_VALUES,
  normalizeDifficulty,
  normalizeDifficultyForStorage,
} from "../../lib/difficulty";
import MovementProgressionBlock from "../../components/MovementProgressionBlock";
import CoachingCard from "../../components/CoachingCard";
import { buildPregnancyCoachingDisplay } from "../../lib/pregnancy-display";
import { FOCUS_LABELS, isFocusKey } from "@/lib/movements/focusGroups";
import { localDateISO } from "@/lib/dates";
import {
  getIntensityCap,
  stageOrdinal,
  type StageKey,
} from "@/lib/stages/pregnancyStages";
import {
  buildLastSessionMap,
  shouldShowProgressionBlock,
} from "../../lib/progression-display";
import { useOnboardingGuard } from "../../lib/use-onboarding-guard";
import {
  parseGenerationParams,
  toGenerateApiBody,
} from "../../lib/generation-params";
import { logEvent } from "../../lib/events";

type SetLog = {
  weight: string;
  reps: string;
};

type MovementState = {
  name: string;
  original: string;
  sets: number;
  reps: string;
  rir: string;
  note: string;
  logs: SetLog[];
  notes: string;
  // Pregnancy-only prescription fields (0 / "" for cycle workouts).
  durationSeconds: number;
  intensity: string;
  // Movement category. Drives set-logging vs duration display (see isSetLogged).
  // "" for cycle workouts, whose movements are always set-logged.
  category: string;
};

/**
 * Categories that are time-based (duration display, no inputs). Everything else
 * — strength, mobility, pelvic_floor, and cycle movements (category "") — is
 * set-logged: it gets weight/reps inputs, same as cycle. The branch is on the
 * MOVEMENT'S CATEGORY, never on training_mode: a goblet squat needs load
 * logging in pregnancy exactly as in cycle.
 */
const TIME_BASED_CATEGORIES = new Set([
  "breathing",
  "walking",
  "recovery",
  "education",
]);

function isSetLogged(category: string): boolean {
  return !TIME_BASED_CATEGORIES.has(category);
}

/**
 * Format a time-based movement's duration, defensively.
 *
 * The model sometimes returns e.g. `duration_seconds: 5` meaning 5 MINUTES (so
 * "Warm-up and cool-down" rendered as "5s"). On a time-based category a positive
 * value under 60 is almost certainly minutes mis-typed as seconds — legitimate
 * defaults for these categories are 0 or ≥120s — so we render it as minutes.
 */
function formatTimeBasedDuration(seconds: number, category: string): string {
  if (TIME_BASED_CATEGORIES.has(category) && seconds > 0 && seconds < 60) {
    return `${seconds} min`;
  }
  return formatDuration(seconds);
}

type FlowBlock = {
  block: string;
  duration: string;
  instructions: string;
};

type WorkoutRow = {
  id: string;
  user_id?: string;
  phase?: string;
  cycle_guidance?: {
    summary?: string;
    during_workout?: string;
    adjustments?: string;
  };
  structure?: unknown;
  flow?: unknown;
  intensity?: string;
  completed?: string | null;
  energy_shift?: string | null;
  user_notes?: string | null;
  generation_params?: unknown;
};

type WorkoutLogRow = {
  movement: string;
  original_movement: string | null;
  final_movement: string | null;
  notes: string | null;
  weight: number | string | null;
  reps: number | string | null;
  set_number: number | null;
  created_at?: string | null;
};

/** Human duration from seconds: "5 min", "45s". Empty for non-positive. */
function formatDuration(seconds: number): string {
  if (seconds <= 0) return "";
  if (seconds >= 60) return `${Math.round(seconds / 60)} min`;
  return `${seconds}s`;
}

/** Keep latest row per movement slot + set when users save more than once. */
function dedupeLogsByLatest(logs: WorkoutLogRow[]): WorkoutLogRow[] {
  const best = new Map<string, WorkoutLogRow>();
  for (const log of logs) {
    const om = log.original_movement ?? "";
    const sn = Number(log.set_number) || 0;
    const key = `${om}|${sn}`;
    const prev = best.get(key);
    const t = log.created_at ? new Date(log.created_at).getTime() : 0;
    const pt = prev?.created_at ? new Date(prev.created_at).getTime() : -1;
    if (!prev || t >= pt) best.set(key, log);
  }
  return [...best.values()];
}

function mergeSavedLogsIntoMovements(
  structureItems: Record<string, unknown>[],
  base: MovementState[],
  rawLogs: WorkoutLogRow[]
): MovementState[] {
  if (!rawLogs.length) return base;

  const logs = dedupeLogsByLatest(rawLogs);

  return base.map((mov, i) => {
    const structureMovement = String(structureItems[i]?.movement ?? mov.original);
    const rows = logs
      .filter((l) => {
        const om = String(l.original_movement ?? "");
        if (om && om === structureMovement) return true;
        if (!l.original_movement && String(l.movement) === structureMovement)
          return true;
        return false;
      })
      .sort(
        (a, b) =>
          (Number(a.set_number) || 0) - (Number(b.set_number) || 0)
      );

    if (rows.length === 0) return mov;

    const logsFilled = mov.logs.map((slot, idx) => {
      const row = rows.find((r) => Number(r.set_number) === idx + 1);
      const w = row?.weight;
      const r = row?.reps;
      const wStr =
        w != null && String(w).trim() !== "" && Number.isFinite(Number(w))
          ? String(w)
          : "";
      const rStr =
        r != null && String(r).trim() !== "" && Number.isFinite(Number(r))
          ? String(r)
          : "";
      return { weight: wStr, reps: rStr };
    });

    const notesFromLog =
      rows.find(
        (r) => Number(r.set_number) === 1 && r.notes?.trim()
      )?.notes?.trim() ??
      rows.find((r) => r.notes?.trim())?.notes?.trim() ??
      "";

    const displayName =
      rows.find((r) => r.final_movement?.trim())?.final_movement?.trim() ??
      rows.find((r) => r.movement?.trim())?.movement?.trim() ??
      mov.name;

    return {
      ...mov,
      name: displayName || mov.name,
      logs: logsFilled,
      notes: notesFromLog || mov.notes,
    };
  });
}

function parsePositiveNumber(raw: string): number | null {
  const t = raw.trim();
  if (t === "") return null;
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

export default function WorkoutPage() {
  const params = useParams();
  const workoutId =
    typeof params.id === "string"
      ? params.id
      : Array.isArray(params.id)
        ? params.id[0]
        : "";
  const router = useRouter();
  const onboardingReady = useOnboardingGuard();

  const [workout, setWorkout] = useState<WorkoutRow | null>(null);
  const [movements, setMovements] = useState<MovementState[]>([]);
  const [flowBlocks, setFlowBlocks] = useState<FlowBlock[]>([]);
  const [showFeedback, setShowFeedback] = useState(false);

  const [completed, setCompleted] = useState("");
  const [difficulty, setDifficulty] = useState("");
  const [energyShift, setEnergyShift] = useState("");
  const [userNotes, setUserNotes] = useState("");
  const [lastSessionByMovement, setLastSessionByMovement] = useState<
    Record<string, string>
  >({});
  const [recentSessionCount, setRecentSessionCount] = useState(0);
  const [saving, setSaving] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  // Inline, scoped error copy (replacing window.alert): per-movement for set
  // logging, saveError in the finish modal, actionError by the action buttons.
  const [movementErrors, setMovementErrors] = useState<Record<number, string>>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const parsedParams = parseGenerationParams(workout?.generation_params);
  // Pregnancy workouts are bodyweight/time-based — no weight to log, so the
  // finish flow and movement cards branch on this. phase is set to 'pregnancy'
  // at generation time.
  const isPregnancy = workout?.phase === "pregnancy";

  // Pregnancy coaching context comes from generation_params (parseGenerationParams
  // returns null for pregnancy, which stores `mode` not `phase`), so read it
  // directly. The cap (and its vetted coachingRationale) is derived from
  // stage_key — never from the model.
  const pregParams = (workout?.generation_params ?? {}) as Record<string, unknown>;
  const pregStageKeyRaw =
    typeof pregParams.stage_key === "string" ? pregParams.stage_key : null;
  const pregStageKey =
    pregStageKeyRaw && stageOrdinal(pregStageKeyRaw) !== null
      ? (pregStageKeyRaw as StageKey)
      : null;
  const pregWeek = Number(pregParams.gestational_week);
  const pregActivity =
    typeof pregParams.prior_activity_level === "string"
      ? pregParams.prior_activity_level
      : null;
  const pregCap = isPregnancy && pregStageKey ? getIntensityCap(pregStageKey) : null;
  // Requested focus + whether it fell back to the full pool, for the WHAT I
  // NOTICED notice. full_body is never surfaced (it's the default, no fallback).
  const pregFocusKey =
    typeof pregParams.focus === "string" && isFocusKey(pregParams.focus)
      ? pregParams.focus
      : null;
  const pregFocus =
    pregFocusKey && pregFocusKey !== "full_body"
      ? { label: FOCUS_LABELS[pregFocusKey], fallback: pregParams.focus_fallback === true }
      : null;
  const pregnancyCoaching =
    isPregnancy && pregStageKey && Number.isFinite(pregWeek)
      ? buildPregnancyCoachingDisplay({
          stageKey: pregStageKey,
          gestationalWeek: pregWeek,
          priorActivityLevel: pregActivity,
          recentSessionCount,
          focus: pregFocus,
        })
      : null;

  useEffect(() => {
    if (!onboardingReady) return;

    const fetchWorkout = async () => {
      const [{ data }, logsRes] = await Promise.all([
        supabase.from("workouts").select("*").eq("id", workoutId).single(),
        supabase
          .from("workout_logs")
          .select(
            "movement, original_movement, final_movement, notes, weight, reps, set_number, created_at"
          )
          .eq("workout_id", workoutId),
      ]);

      if (logsRes.error) {
        console.error(logsRes.error);
      }

      const logsRaw = !logsRes.error && logsRes.data ? logsRes.data : [];

      setWorkout(data as WorkoutRow);

      setDifficulty(normalizeDifficulty(data?.difficulty) ?? "");
      setCompleted(
        typeof data?.completed === "string" ? data.completed : ""
      );
      setEnergyShift(
        typeof data?.energy_shift === "string" ? data.energy_shift : ""
      );
      setUserNotes(
        typeof data?.user_notes === "string" ? data.user_notes : ""
      );

      const flowItems = Array.isArray(data?.flow)
        ? (data.flow as Record<string, unknown>[]).map((f) => ({
            block: String(f.block ?? ""),
            duration: String(f.duration ?? ""),
            instructions: String(f.instructions ?? ""),
          }))
        : [];
      setFlowBlocks(flowItems);

      if (data?.structure && Array.isArray(data.structure)) {
        const structureItems = data.structure as Record<string, unknown>[];
        if (structureItems.length > 0) {
          const initialized = structureItems.map((item) => ({
            name: String(item.movement ?? ""),
            original: String(item.movement ?? ""),
            sets: Number(item.sets) || 0,
            reps: String(item.reps ?? ""),
            rir: String(item.rir ?? ""),
            note: String(item.note ?? ""),
            logs: Array.from(
              { length: Number(item.sets) || 0 },
              () =>
                ({
                  weight: "",
                  reps: "",
                }) satisfies SetLog
            ),
            notes: "",
            durationSeconds: Number(item.durationSeconds) || 0,
            intensity: String(item.intensity ?? ""),
            category: String(item.category ?? ""),
          }));

          const logs = logsRaw as WorkoutLogRow[];
          setMovements(
            logs.length > 0
              ? mergeSavedLogsIntoMovements(structureItems, initialized, logs)
              : initialized
          );

          const userId = data?.user_id as string | undefined;
          const phase = data?.phase as string | undefined;
          if (userId && phase) {
            const originals = initialized.map((m) => m.original);
            const { data: pastWorkouts } = await supabase
              .from("workouts")
              .select("id, difficulty, created_at")
              .eq("user_id", userId)
              .eq("phase", phase)
              .neq("id", workoutId)
              .order("created_at", { ascending: false })
              .limit(3);

            setRecentSessionCount(pastWorkouts?.length ?? 0);

            if (pastWorkouts && pastWorkouts.length > 0) {
              const pastIds = pastWorkouts.map((w) => w.id);
              const { data: priorLogs } = await supabase
                .from("workout_logs")
                .select(
                  "workout_id, movement, original_movement, weight, reps, set_number"
                )
                .in("workout_id", pastIds);

              if (priorLogs && priorLogs.length > 0) {
                const map = buildLastSessionMap(
                  originals,
                  pastWorkouts,
                  priorLogs
                );
                setLastSessionByMovement(Object.fromEntries(map));
              }
            }
          }
        } else {
          setMovements([]);
        }
      }
    };

    fetchWorkout();
  }, [workoutId, onboardingReady]);

  const updateMovementName = (index: number, value: string) => {
    setMovements((prev) =>
      prev.map((m, i) => (i === index ? { ...m, name: value } : m))
    );
  };

  const updateNotes = (index: number, value: string) => {
    setMovements((prev) =>
      prev.map((m, i) => (i === index ? { ...m, notes: value } : m))
    );
  };

  const updateSet = (
    movementIndex: number,
    setIndex: number,
    field: keyof SetLog,
    value: string
  ) => {
    setMovements((prev) =>
      prev.map((m, mi) => {
        if (mi !== movementIndex) return m;
        return {
          ...m,
          logs: m.logs.map((set, si) =>
            si !== setIndex ? set : { ...set, [field]: value }
          ),
        };
      })
    );
    // Editing a movement's sets clears its validation error.
    setMovementErrors((prev) => {
      if (!prev[movementIndex]) return prev;
      const next = { ...prev };
      delete next[movementIndex];
      return next;
    });
  };

  function buildLogRows(): Array<{
    workout_id: string;
    movement: string;
    original_movement: string;
    final_movement: string;
    notes: string | null;
    weight: number;
    reps: number;
    set_number: number;
  }> {
    if (!workout) return [];

    const rows: Array<{
      workout_id: string;
      movement: string;
      original_movement: string;
      final_movement: string;
      notes: string | null;
      weight: number;
      reps: number;
      set_number: number;
    }> = [];

    for (const m of movements) {
      m.logs.forEach((set, idx) => {
        const w = parsePositiveNumber(set.weight);
        const r = parsePositiveNumber(set.reps);
        const emptyBoth =
          set.weight.trim() === "" && set.reps.trim() === "";
        if (emptyBoth) return;
        if (w === null || r === null) return;

        const repsInt = Math.round(r);
        if (!Number.isFinite(repsInt)) return;

        rows.push({
          workout_id: workout.id,
          movement: m.name,
          original_movement: m.original,
          final_movement: m.name,
          notes: idx === 0 ? (m.notes.trim() || null) : null,
          weight: w,
          reps: repsInt,
          set_number: idx + 1,
        });
      });
    }

    return rows;
  }

  const saveWorkout = async () => {
    if (!workout) return;

    setSaveError(null);
    setMovementErrors({});

    for (let mi = 0; mi < movements.length; mi++) {
      for (const set of movements[mi].logs) {
        const wEmpty = set.weight.trim() === "";
        const rEmpty = set.reps.trim() === "";
        if (wEmpty !== rEmpty) {
          // Scope the error to the movement, and close the modal so she sees it.
          setMovementErrors({
            [mi]: "Each started set needs both weight and reps (or leave both blank).",
          });
          setShowFeedback(false);
          return;
        }
      }
    }

    // Sessions with nothing to log: time-based flow sessions, and pregnancy
    // sessions (bodyweight / time-based, no weight to record). Do NOT weaken the
    // cycle strength path — it still requires a logged set below.
    const isFlowSession =
      flowBlocks.length > 0 && movements.length === 0;
    const allowNoLogs = isFlowSession || isPregnancy;

    const logsToInsert = buildLogRows();
    if (logsToInsert.length === 0 && !allowNoLogs) {
      setSaveError(
        "Log at least one set with weight and reps so future workouts can progress."
      );
      return;
    }

    for (const row of logsToInsert) {
      if (
        !Number.isFinite(row.weight) ||
        !Number.isFinite(row.reps) ||
        !Number.isFinite(row.set_number)
      ) {
        setSaveError("Invalid weight, reps, or set number. Check your log entries.");
        return;
      }
    }

    setSaving(true);

    if (logsToInsert.length > 0) {
      const { error: logError } = await supabase.from("workout_logs").insert(
        logsToInsert.map((row) => ({
          workout_id: row.workout_id,
          movement: row.movement,
          original_movement: row.original_movement,
          final_movement: row.final_movement,
          notes: row.notes,
          weight: row.weight,
          reps: row.reps,
          set_number: row.set_number,
        }))
      );

      if (logError) {
        console.error(logError);
        setSaveError(logError.message || "Could not save workout logs.");
        setSaving(false);
        return;
      }
    }

    const { error: workoutError } = await supabase
      .from("workouts")
      .update({
        completed,
        difficulty: normalizeDifficultyForStorage(difficulty),
        energy_shift: energyShift,
        user_notes: userNotes.trim() || null,
      })
      .eq("id", workout.id);

    if (workoutError) {
      console.error(workoutError);
      setSaveError(workoutError.message || "Could not save workout feedback.");
      setSaving(false);
      return;
    }

    if (
      workout.user_id &&
      (completed === "full" || completed === "partial")
    ) {
      await Promise.all([
        logEvent(workout.user_id, "workout_completed", { completed, difficulty }),
        logEvent(workout.user_id, "reflection_submitted", {
          has_notes: userNotes.trim().length > 0,
        }),
      ]);
    }

    router.push("/");
  };

  const cancelWorkout = async () => {
    if (!workout) return;
    if (!confirm("Are you sure you want to cancel this workout?")) return;

    setActionError(null);

    const { error } = await supabase
      .from("workouts")
      .update({ completed: "cancelled" })
      .eq("id", workout.id);

    if (error) {
      console.error(error);
      setActionError(error.message || "Could not cancel workout.");
      return;
    }

    if (workout.user_id) {
      await logEvent(workout.user_id, "workout_cancelled");
    }

    router.push("/");
  };

  const regenerateWorkout = async () => {
    if (!workout?.user_id || !parsedParams) {
      setActionError(
        "Original session settings are unavailable. Generate a new workout from the builder."
      );
      return;
    }

    setActionError(null);
    setRegenerating(true);

    try {
      // The route derives the user from the bearer token for both branches.
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) {
        router.push("/login");
        return;
      }

      const { error: skipError } = await supabase
        .from("workouts")
        .update({ completed: "skipped" })
        .eq("id", workout.id);

      if (skipError) {
        console.error(skipError);
        setActionError(skipError.message || "Could not update the previous workout.");
        setRegenerating(false);
        return;
      }

      await logEvent(workout.user_id, "regeneration_triggered");

      // Branch on the params shape, not training_mode. Pregnancy also sends the
      // client-local date for the daily check-in gate.
      const body =
        parsedParams.kind === "pregnancy"
          ? {
              time: parsedParams.params.time,
              equipment: parsedParams.params.equipment,
              date: localDateISO(new Date()),
              focus: parsedParams.params.focus,
            }
          : toGenerateApiBody(parsedParams.params);

      const res = await fetch("/api/generate-workout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok) {
        setActionError(data?.error ?? "Failed to regenerate workout.");
        setRegenerating(false);
        return;
      }

      router.replace(`/workout/${data.id}`);
    } catch (err) {
      console.error(err);
      setActionError("Something went wrong. Please try again.");
      setRegenerating(false);
    }
  };

  if (!onboardingReady || !workout) {
    return (
      <main className="pf-page flex items-center justify-center">
        <p className="pf-body-muted">Loading...</p>
      </main>
    );
  }

  return (
    <main className="pf-page p-6">
      <div className="pf-container space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="pf-heading-page">
            Today’s Workout
          </h1>

          <button
            type="button"
            onClick={() => router.push("/")}
            className="pf-link"
          >
            Back
          </button>
        </div>

        {pregnancyCoaching ? (
          <CoachingCard display={pregnancyCoaching} />
        ) : (
          <CoachingCard
            phase={workout.phase}
            summary={workout.cycle_guidance?.summary}
            duringWorkout={workout.cycle_guidance?.during_workout}
            adjustments={workout.cycle_guidance?.adjustments}
          />
        )}

        <div className="space-y-4">
          <h2 className="pf-heading-section">Your Plan</h2>

          {flowBlocks.length > 0 && movements.length === 0 ? (
            <div className="space-y-3">
              {workout.intensity ? (
                <p className="text-sm text-pf-text-secondary">
                  Intensity: {workout.intensity}
                </p>
              ) : null}
              {flowBlocks.map((block, i) => (
                <div
                  key={i}
                  className="pf-card p-5 space-y-2"
                >
                  <p className="font-semibold text-pf-text">{block.block}</p>
                  {block.duration ? (
                    <p className="text-sm text-pf-coral">{block.duration}</p>
                  ) : null}
                  <p className="text-sm text-pf-text-secondary leading-relaxed whitespace-pre-wrap">
                    {block.instructions}
                  </p>
                </div>
              ))}
            </div>
          ) : null}

          {movements.map((item, i) => {
            const lastSession = lastSessionByMovement[item.original];
            const showProgression = shouldShowProgressionBlock(
              lastSession,
              item.note
            );
            // Category, not mode, decides logging vs duration display.
            const setLogged = isSetLogged(item.category);

            return (
            <div
              key={i}
              className="pf-card p-5 space-y-3"
            >
              <input
                value={item.name}
                onChange={(e) => updateMovementName(i, e.target.value)}
                className="pf-input !mt-0 font-semibold"
              />

              {isPregnancy ? (
                <MovementProgressionBlock
                  sets={item.sets}
                  reps={item.reps}
                  rir={setLogged && pregCap ? String(pregCap.rirFloor) : ""}
                  reasonNote={item.note}
                  targetOverride={
                    setLogged
                      ? undefined
                      : [
                          formatTimeBasedDuration(item.durationSeconds, item.category),
                          item.intensity,
                        ]
                          .filter(Boolean)
                          .join(" • ")
                  }
                />
              ) : showProgression ? (
                <MovementProgressionBlock
                  sets={item.sets}
                  reps={item.reps}
                  rir={item.rir}
                  lastSession={lastSession}
                  reasonNote={item.note}
                />
              ) : (
                <>
                  <p className="text-sm text-pf-text-muted">
                    {item.sets} sets • {item.reps} • RIR {item.rir}
                  </p>
                  {item.note ? (
                    <p className="text-sm text-pf-coral">{item.note}</p>
                  ) : null}
                </>
              )}

              {/* Set logging: cycle movements and set-based pregnancy movements
                  (strength / mobility / pelvic_floor). Time-based pregnancy
                  movements (breathing / walking / recovery / education) have
                  nothing to log. */}
              {setLogged ? (
                <div className="space-y-2">
                  {item.logs.map((set, idx) => (
                    <div key={idx} className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
                      <span className="text-xs text-pf-text-muted w-14 shrink-0">
                        Set {idx + 1}
                      </span>
                      <input
                        type="text"
                        inputMode="decimal"
                        placeholder="Weight"
                        value={set.weight}
                        onChange={(e) =>
                          updateSet(i, idx, "weight", e.target.value)
                        }
                        className="pf-input !mt-0 !py-2"
                      />
                      <input
                        type="text"
                        inputMode="numeric"
                        placeholder="Reps"
                        value={set.reps}
                        onChange={(e) =>
                          updateSet(i, idx, "reps", e.target.value)
                        }
                        className="pf-input !mt-0 !py-2"
                      />
                    </div>
                  ))}
                </div>
              ) : null}

              {movementErrors[i] ? (
                <p className="text-sm text-pf-coral">{movementErrors[i]}</p>
              ) : null}

              <textarea
                placeholder="Notes (optional)"
                value={item.notes}
                onChange={(e) => updateNotes(i, e.target.value)}
                className="pf-textarea !mt-0 !py-2"
              />
            </div>
            );
          })}
        </div>

        <div className="space-y-3">
          <button
            type="button"
            onClick={() => setShowFeedback(true)}
            disabled={regenerating}
            className="pf-btn-primary disabled:opacity-60"
          >
            Finish Workout
          </button>

          <button
            type="button"
            onClick={regenerateWorkout}
            disabled={regenerating || !parsedParams}
            className="pf-btn-secondary disabled:opacity-60"
            title={
              parsedParams
                ? undefined
                : "Session settings unavailable — generate a new workout from the builder"
            }
          >
            {regenerating ? "Regenerating…" : "Regenerate Workout"}
          </button>

          <button
            type="button"
            onClick={cancelWorkout}
            disabled={regenerating}
            className="pf-link disabled:opacity-60"
          >
            Cancel Workout
          </button>

          {actionError ? (
            <p className="text-sm text-pf-coral">{actionError}</p>
          ) : null}
        </div>

        {showFeedback && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
            <div className="pf-card p-6 w-full max-w-md space-y-4 max-h-[90vh] overflow-y-auto">
              <h2 className="pf-heading-section">
                How did it go?
              </h2>

              <p className="text-sm text-pf-text-secondary">
                {flowBlocks.length > 0 && movements.length === 0
                  ? "Share how the session felt—your feedback shapes future coaching."
                  : "Your logged sets (weight × reps) are saved for progressive overload. Add quick feedback below—coaching uses this on the next generation."}
              </p>

              <div>
                <label className="pf-label">Completed</label>
                <select
                  value={completed}
                  onChange={(e) => setCompleted(e.target.value)}
                  className="pf-select"
                >
                  <option value="">Select</option>
                  <option value="full">Full workout</option>
                  <option value="partial">Partial</option>
                  <option value="skipped">Skipped</option>
                </select>
              </div>

              <div>
                <label className="pf-label">Difficulty</label>
                <select
                  value={difficulty}
                  onChange={(e) => setDifficulty(e.target.value)}
                  className="pf-select"
                >
                  <option value="">Select</option>
                  {DIFFICULTY_VALUES.map((v) => (
                    <option key={v} value={v}>
                      {DIFFICULTY_LABELS[v]}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="pf-label">Energy after</label>
                <select
                  value={energyShift}
                  onChange={(e) => setEnergyShift(e.target.value)}
                  className="pf-select"
                >
                  <option value="">Select</option>
                  <option value="better">Better</option>
                  <option value="same">Same</option>
                  <option value="worse">Worse</option>
                </select>
              </div>

              <div>
                <label className="pf-label">
                  How did this workout feel?
                </label>
                <textarea
                  value={userNotes}
                  onChange={(e) => setUserNotes(e.target.value)}
                  placeholder="Optional — e.g. Felt strong today, lower back tight during hinges"
                  rows={3}
                  className="pf-textarea"
                />
              </div>

              {saveError ? (
                <p className="text-sm text-pf-coral">{saveError}</p>
              ) : null}

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowFeedback(false)}
                  disabled={saving}
                  className="flex-1 pf-btn-secondary !w-auto"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={saveWorkout}
                  disabled={saving}
                  className="flex-1 pf-btn-primary !w-auto disabled:opacity-60"
                >
                  {saving ? "Saving…" : "Save & finish"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
