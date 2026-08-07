"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import PhaseFitLogo from "../../components/PhaseFitLogo";
import supabase from "../../lib/supabase";
import { resolvePregnancyStage } from "@/lib/stages/resolvePregnancyStage";
import { STAGE_BAND_LABELS } from "../../lib/pregnancy-display";
import type {
  ProviderAdvice,
  ScreeningAnswer,
  ScreeningResult,
} from "@/lib/safety/screening";

type AnswerKey = "q1" | "q2" | "q3" | "q4";
type Answers = Record<AnswerKey, ScreeningAnswer | undefined>;

const STEPS = ["mode", "due", "activity", "screening", "provider"] as const;

type ActivityLevel = "sedentary" | "light" | "active" | "athlete";

const ACTIVITY_OPTIONS: Array<{ value: ActivityLevel; label: string }> = [
  { value: "sedentary", label: "Not very active" },
  { value: "light", label: "Lightly active — walking, occasional classes" },
  { value: "active", label: "Active — regular training most weeks" },
  { value: "athlete", label: "Athlete — structured training, competing or close to it" },
];

const ANSWER_OPTIONS: Array<{ value: ScreeningAnswer; label: string }> = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
  { value: "unsure", label: "Not sure" },
];

const Q4_DETAIL_MAX = 500;

// Step 1 options depend on the account's CURRENT mode. From cycle, only
// pregnancy is actionable ('cycle' is already active; postpartum isn't built).
// From pregnancy, 'cycle' becomes the enabled revert-to-cycle path.
function buildModeOptions(
  currentMode: string | null,
): Array<{
  value: "cycle" | "pregnancy" | "postpartum";
  label: string;
  hint: string;
  disabled: boolean;
}> {
  const onPregnancy = currentMode === "pregnancy";
  return [
    {
      value: "cycle",
      label: "Cycle",
      hint: onPregnancy ? "Switch back to cycle tracking" : "Already on cycle mode",
      disabled: !onPregnancy,
    },
    { value: "pregnancy", label: "Pregnant", hint: "Switch to pregnancy tracking", disabled: false },
    { value: "postpartum", label: "Postpartum", hint: "Coming soon", disabled: true },
  ];
}

// Helper text carries the plain-language examples that let someone answer
// without knowing clinical terminology — Q1–Q3 need it, Q4 doesn't.
const SCREENING_QUESTIONS: Array<{ key: AnswerKey; text: string; helper?: string }> = [
  {
    key: "q1",
    text: "Has a doctor or midwife told you about any problem with this pregnancy?",
    helper:
      "For example: bleeding, high blood pressure, an issue with the placenta or cervix, concerns about the baby's growth, twins or more, or signs of early labour.",
  },
  {
    key: "q2",
    text: "Have you had complications in a previous pregnancy?",
    helper: "For example: an early birth, pregnancy loss, or pre-eclampsia.",
  },
  {
    key: "q3",
    text: "Do you have a health condition that makes physical activity difficult, or that a doctor has told you to be careful with?",
    helper:
      "For example: heart or lung conditions, high blood pressure, thyroid or diabetes issues, anaemia, an eating disorder, or an injury or joint problem.",
  },
  {
    key: "q4",
    text: "Do you have any other concerns about being active during this pregnancy?",
  },
];

const PROVIDER_ADVICE_OPTIONS: Array<{ value: ProviderAdvice; label: string }> = [
  { value: "not_consulted", label: "I haven't talked to my provider yet" },
  {
    value: "cleared",
    label:
      "I've told my provider about anything I flagged above, and they cleared me for exercise.",
  },
  { value: "restricted", label: "My provider gave me restrictions" },
  { value: "advised_against", label: "My provider advised against exercise" },
];

export default function ModeSwitchPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [stepIndex, setStepIndex] = useState(0);

  const [mode, setMode] = useState<"cycle" | "pregnancy" | "postpartum" | "">("");
  const [dueDate, setDueDate] = useState("");
  const [activityLevel, setActivityLevel] = useState<ActivityLevel | "">("");
  const [answers, setAnswers] = useState<Answers>({
    q1: undefined,
    q2: undefined,
    q3: undefined,
    q4: undefined,
  });
  const [providerAdvice, setProviderAdvice] = useState<ProviderAdvice | "">("");
  // Independent of providerAdvice: always required. NOT a clearance affirmation
  // (that's captured by providerAdvice === 'cleared') — just a disclaimer.
  const [disclaimerAck, setDisclaimerAck] = useState(false);

  // Optional free text revealed when q4 is 'yes'/'unsure'.
  //
  // HARD BOUNDARY: this is unstructured user text. It is stored and shown back
  // to the user verbatim ONLY. It must never be interpolated into an AI prompt
  // and must never influence a safety decision — gating comes from
  // screening_result and the movement library alone. The server enforces the
  // same boundary (see the route's HARD BOUNDARY comment).
  const [q4Detail, setQ4Detail] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Post-submit outcome view. Null until a successful submit.
  const [result, setResult] = useState<ScreeningResult | null>(null);

  // The account's current mode, and the revert-to-cycle confirmation state.
  const [currentMode, setCurrentMode] = useState<string | null>(null);
  const [revertConfirm, setRevertConfirm] = useState(false);
  const [reverting, setReverting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const init = async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        router.replace("/login");
        return;
      }
      const { data: profile } = await supabase
        .from("user_profiles")
        .select("training_mode")
        .eq("user_id", data.user.id)
        .maybeSingle();
      if (!cancelled) {
        setCurrentMode((profile?.training_mode as string) ?? null);
        setChecking(false);
      }
    };
    init();
    return () => {
      cancelled = true;
    };
  }, [router]);

  const step = STEPS[stepIndex];
  const isLastStep = stepIndex === STEPS.length - 1;

  // Client-side preview of the due date. The server re-validates and is the
  // authority — this only gives the user immediate feedback.
  const duePreview = useMemo(
    () => resolvePregnancyStage(dueDate || null, new Date()),
    [dueDate],
  );

  const canContinue = useMemo(() => {
    switch (step) {
      case "mode":
        // Pregnancy is always actionable; 'cycle' only as the revert path when
        // already on pregnancy.
        return mode === "pregnancy" || (mode === "cycle" && currentMode === "pregnancy");
      case "due":
        return dueDate !== "" && duePreview.ok;
      case "activity":
        return activityLevel !== "";
      case "screening":
        // All four answered. NOT gated on the optional q4 detail.
        return SCREENING_QUESTIONS.every((q) => answers[q.key] !== undefined);
      case "provider":
        return providerAdvice !== "" && disclaimerAck;
      default:
        return false;
    }
  }, [step, mode, currentMode, dueDate, duePreview, activityLevel, answers, providerAdvice, disclaimerAck]);

  const goBack = () => {
    setError(null);
    if (stepIndex === 0) {
      router.push("/settings");
      return;
    }
    setStepIndex((i) => i - 1);
  };

  const submit = async () => {
    const { data: sess } = await supabase.auth.getSession();
    const token = sess.session?.access_token;
    if (!token) {
      router.replace("/login");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/pregnancy/screening", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        // NOTE: no verdict is sent — the server computes it.
        body: JSON.stringify({
          dueDate,
          q1: answers.q1,
          q2: answers.q2,
          q3: answers.q3,
          q4: answers.q4,
          providerAdvice,
          disclaimerAcknowledged: disclaimerAck,
          q4_detail: q4Detail,
          priorActivityLevel: activityLevel,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error ?? "Could not save. Please try again.");
        setSubmitting(false);
        return;
      }
      // Show the outcome (with the q4 detail reflected back) rather than
      // silently routing home.
      setResult((data?.result as ScreeningResult) ?? "clear");
      setSubmitting(false);
    } catch {
      setError("Something went wrong. Please try again.");
      setSubmitting(false);
    }
  };

  const doRevert = async () => {
    const { data: sess } = await supabase.auth.getSession();
    const token = sess.session?.access_token;
    if (!token) {
      router.replace("/login");
      return;
    }
    setReverting(true);
    setError(null);
    try {
      const res = await fetch("/api/pregnancy/revert", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data?.error ?? "Could not switch back. Please try again.");
        setReverting(false);
        return;
      }
      router.replace("/");
    } catch {
      setError("Something went wrong. Please try again.");
      setReverting(false);
    }
  };

  const goNext = () => {
    if (!canContinue) return;
    setError(null);
    // Revert path: choosing cycle (only enabled from pregnancy) goes to a single
    // confirmation step, not the four-step pregnancy flow.
    if (step === "mode" && mode === "cycle") {
      setRevertConfirm(true);
      return;
    }
    if (!isLastStep) {
      setStepIndex((i) => i + 1);
      return;
    }
    submit();
  };

  if (checking) {
    return (
      <main className="pf-page flex items-center justify-center p-6">
        <p className="pf-body-muted">Loading...</p>
      </main>
    );
  }

  // Revert-to-cycle confirmation. Neutral copy — the app doesn't know why she's
  // switching and shouldn't guess (no congratulation, no commiseration).
  if (revertConfirm) {
    return (
      <main className="pf-page flex flex-col min-h-full p-6 pb-10">
        <div className="w-full max-w-md mx-auto flex flex-col flex-1 space-y-5">
          <div className="text-center pt-1">
            <PhaseFitLogo variant="auth" className="flex justify-center" priority />
          </div>
          <div className="pf-card p-5 sm:p-6 space-y-4">
            <p className="pf-section-eyebrow">Switch to cycle</p>
            <p className="pf-body-secondary text-sm">
              This will switch you back to cycle tracking and clear your pregnancy
              details. You can switch back any time.
            </p>
            {error ? <p className="text-sm text-pf-coral">{error}</p> : null}
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => {
                  setRevertConfirm(false);
                  setError(null);
                }}
                disabled={reverting}
                className="pf-btn-secondary"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={doRevert}
                disabled={reverting}
                className="pf-btn-primary disabled:opacity-60"
              >
                {reverting ? "Switching…" : "Switch to cycle"}
              </button>
            </div>
          </div>
        </div>
      </main>
    );
  }

  // Post-submit outcome. Pregnancy mode is on regardless of the verdict (the
  // verdict is about whether we prescribe, not which clock she's on).
  if (result) {
    const headline =
      result === "hard_stop"
        ? "We've saved your answers"
        : result === "provider_conversation"
          ? "A quick check first"
          : "You're all set";
    const body =
      result === "hard_stop"
        ? "Please talk with your provider before doing guided activity here."
        : result === "provider_conversation"
          ? "Based on your answers, we'd suggest checking with your provider before starting."
          : "You're switched to pregnancy mode. Tailored sessions are on the way.";
    // Surface the q4 detail back ONLY in the provider_conversation state, and
    // only if she wrote something. Verbatim, never fed to any model.
    const q4Trimmed = q4Detail.trim();
    const showMention = result === "provider_conversation" && q4Trimmed !== "";

    return (
      <main className="pf-page flex flex-col min-h-full p-6 pb-10">
        <div className="w-full max-w-md mx-auto flex flex-col flex-1 space-y-5">
          <div className="text-center pt-1">
            <PhaseFitLogo variant="auth" className="flex justify-center" priority />
          </div>
          <div className="pf-card p-5 sm:p-6 space-y-4">
            <p className="pf-section-eyebrow">Pregnancy mode</p>
            <h2 className="pf-heading-section">{headline}</h2>
            <p className="pf-body-secondary text-sm">{body}</p>
            {showMention ? (
              <p className="pf-body-secondary text-sm">
                You mentioned: &ldquo;{q4Trimmed}&rdquo; — worth raising with your
                provider.
              </p>
            ) : null}
            <button
              type="button"
              onClick={() => router.replace("/")}
              className="pf-btn-primary w-full"
            >
              Go to home
            </button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="pf-page flex flex-col min-h-full p-6 pb-10">
      <div className="w-full max-w-md mx-auto flex flex-col flex-1 space-y-5">
        <div className="text-center pt-1">
          <PhaseFitLogo variant="auth" className="flex justify-center" priority />
        </div>

        <div className="pf-card p-5 sm:p-6 flex flex-col flex-1 space-y-5">
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <p className="pf-section-eyebrow">Change training mode</p>
              <span className="text-xs text-pf-text-muted">
                Step {stepIndex + 1} of {STEPS.length}
              </span>
            </div>
            <div
              className="pf-onboarding-progress"
              role="progressbar"
              aria-valuenow={stepIndex + 1}
              aria-valuemin={1}
              aria-valuemax={STEPS.length}
              aria-label="Mode switch progress"
            >
              {STEPS.map((s, index) => (
                <span
                  key={s}
                  className={
                    index <= stepIndex
                      ? "pf-onboarding-progress-dot is-active"
                      : "pf-onboarding-progress-dot"
                  }
                />
              ))}
            </div>
          </div>

          {/* Step 1 — mode selection */}
          {step === "mode" ? (
            <fieldset className="border-0 p-0 m-0">
              <legend className="pf-form-section-title mb-1">Select a mode</legend>
              <p className="pf-form-section-hint mb-3">
                Which clock should the app run on?
              </p>
              <div className="pf-radio-group pf-radio-group-single" role="radiogroup" aria-label="Training mode">
                {buildModeOptions(currentMode).map((opt) => (
                  <label
                    key={opt.value}
                    className="pf-radio-option"
                    style={opt.disabled ? { opacity: 0.5, cursor: "not-allowed" } : undefined}
                  >
                    <input
                      type="radio"
                      name="training-mode"
                      value={opt.value}
                      disabled={opt.disabled}
                      checked={mode === opt.value}
                      onChange={() => setMode(opt.value)}
                      className="pf-radio-input"
                    />
                    <span>
                      {opt.label}
                      <span className="block pf-body-muted text-xs">{opt.hint}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
          ) : null}

          {/* Step 2 — due date */}
          {step === "due" ? (
            <div className="space-y-2">
              <label className="pf-form-section-title block" htmlFor="due-date">
                Estimated due date
              </label>
              <p className="pf-form-section-hint">
                Used to calculate your gestational week.
              </p>
              <input
                id="due-date"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="pf-input"
              />
              {dueDate !== "" ? (
                duePreview.ok ? (
                  <p className="pf-body-secondary text-sm">
                    Week {duePreview.gestationalWeek} ·{" "}
                    {STAGE_BAND_LABELS[duePreview.stageKey]}
                  </p>
                ) : (
                  <p className="text-sm text-pf-coral">
                    That date doesn&apos;t resolve to a valid pregnancy week. Check it and try again.
                  </p>
                )
              ) : null}
            </div>
          ) : null}

          {/* Step 3 — prior activity level */}
          {step === "activity" ? (
            <fieldset className="border-0 p-0 m-0">
              <legend className="pf-form-section-title mb-1">
                How active were you before pregnancy?
              </legend>
              <p className="pf-form-section-hint mb-3">
                This helps us pitch sessions at the right level for you.
              </p>
              <div className="pf-radio-group pf-radio-group-single" role="radiogroup" aria-label="Prior activity level">
                {ACTIVITY_OPTIONS.map((opt) => (
                  <label key={opt.value} className="pf-radio-option">
                    <input
                      type="radio"
                      name="activity-level"
                      value={opt.value}
                      checked={activityLevel === opt.value}
                      onChange={() => setActivityLevel(opt.value)}
                      className="pf-radio-input"
                    />
                    <span>{opt.label}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          ) : null}

          {/* Step 4 — screening questions */}
          {step === "screening" ? (
            <div className="space-y-5">
              <p className="pf-form-section-hint">
                These help us know whether to suggest checking with your provider
                first. There are no wrong answers — if you&apos;re not sure, say so.
              </p>
              {SCREENING_QUESTIONS.map((q) => {
                const showDetail =
                  q.key === "q4" &&
                  (answers.q4 === "yes" || answers.q4 === "unsure");
                return (
                  <fieldset key={q.key} className="border-0 p-0 m-0">
                    <legend className="pf-body-secondary text-sm mb-1">
                      {q.text}
                    </legend>
                    {q.helper ? (
                      <p className="pf-body-muted text-xs mb-2">{q.helper}</p>
                    ) : null}
                    <div
                      className="pf-radio-group"
                      role="radiogroup"
                      aria-label={q.text}
                    >
                      {ANSWER_OPTIONS.map((opt) => (
                        <label key={opt.value} className="pf-radio-option">
                          <input
                            type="radio"
                            name={`screening-${q.key}`}
                            checked={answers[q.key] === opt.value}
                            onChange={() =>
                              setAnswers((prev) => ({ ...prev, [q.key]: opt.value }))
                            }
                            className="pf-radio-input"
                          />
                          <span>{opt.label}</span>
                        </label>
                      ))}
                    </div>

                    {showDetail ? (
                      <div className="mt-3 space-y-1">
                        <label
                          className="pf-body-secondary text-sm"
                          htmlFor="q4-detail"
                        >
                          What&apos;s on your mind?{" "}
                          <span className="pf-body-muted text-xs">(optional)</span>
                        </label>
                        <textarea
                          id="q4-detail"
                          value={q4Detail}
                          onChange={(e) =>
                            setQ4Detail(e.target.value.slice(0, Q4_DETAIL_MAX))
                          }
                          maxLength={Q4_DETAIL_MAX}
                          rows={3}
                          placeholder="Anything you'd want to mention to your provider."
                          className="pf-textarea"
                        />
                      </div>
                    ) : null}
                  </fieldset>
                );
              })}
            </div>
          ) : null}

          {/* Step 5 — provider advice + clearance acknowledgment */}
          {step === "provider" ? (
            <div className="space-y-4">
              <fieldset className="border-0 p-0 m-0">
                <legend className="pf-form-section-title mb-1">
                  Provider guidance
                </legend>
                <p className="pf-form-section-hint mb-3">
                  What has your healthcare provider said about exercise?
                </p>
                <div className="pf-radio-group pf-radio-group-single" role="radiogroup" aria-label="Provider guidance">
                  {PROVIDER_ADVICE_OPTIONS.map((opt) => (
                    <label key={opt.value} className="pf-radio-option">
                      <input
                        type="radio"
                        name="provider-advice"
                        value={opt.value}
                        checked={providerAdvice === opt.value}
                        onChange={() => setProviderAdvice(opt.value)}
                        className="pf-radio-input"
                      />
                      <span>{opt.label}</span>
                    </label>
                  ))}
                </div>
              </fieldset>

              <label className="flex items-start gap-2 pf-body-secondary text-sm">
                <input
                  type="checkbox"
                  checked={disclaimerAck}
                  onChange={(e) => setDisclaimerAck(e.target.checked)}
                  className="mt-1"
                />
                <span>
                  I understand Phase Fit is not medical advice and does not
                  replace my provider&apos;s guidance.
                </span>
              </label>
            </div>
          ) : null}

          {error ? <p className="text-sm text-pf-coral">{error}</p> : null}

          <div className="mt-auto pt-2 grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={goBack}
              disabled={submitting}
              className="pf-btn-secondary"
            >
              Back
            </button>
            <button
              type="button"
              onClick={goNext}
              disabled={submitting || !canContinue}
              className="pf-btn-primary disabled:opacity-60"
            >
              {submitting ? "Saving…" : isLastStep ? "Finish" : "Continue"}
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
