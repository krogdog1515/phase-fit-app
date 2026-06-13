"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import OnboardingOptionGroup from "../components/OnboardingOptionGroup";
import PhaseFitLogo from "../components/PhaseFitLogo";
import {
  ONBOARDING_CHALLENGE_OPTIONS,
  ONBOARDING_ENVIRONMENT_OPTIONS,
  ONBOARDING_EXPERIENCE_OPTIONS,
  ONBOARDING_FREQUENCY_OPTIONS,
  ONBOARDING_GOAL_OPTIONS,
  ONBOARDING_LIFE_STAGE_OPTIONS,
  ONBOARDING_STEPS,
  ONBOARDING_TRAINING_STYLE_OPTIONS,
  type OnboardingFormValues,
} from "../lib/onboarding-options";
import supabase from "../lib/supabase";
import { getUserProfile, saveOnboardingProfile } from "../lib/user-profile";

const STEP_OPTIONS: Record<
  (typeof ONBOARDING_STEPS)[number]["id"],
  readonly string[]
> = {
  goal: ONBOARDING_GOAL_OPTIONS,
  trainingStyle: ONBOARDING_TRAINING_STYLE_OPTIONS,
  lifeStage: ONBOARDING_LIFE_STAGE_OPTIONS,
  trainingExperience: ONBOARDING_EXPERIENCE_OPTIONS,
  trainingEnvironment: ONBOARDING_ENVIRONMENT_OPTIONS,
  trainingFrequency: ONBOARDING_FREQUENCY_OPTIONS,
  biggestChallenge: ONBOARDING_CHALLENGE_OPTIONS,
};

const EMPTY_VALUES: OnboardingFormValues = {
  goal: "",
  trainingStyle: "",
  lifeStage: "",
  trainingExperience: "",
  trainingEnvironment: "",
  trainingFrequency: "",
  biggestChallenge: "",
};

export default function OnboardingPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [stepIndex, setStepIndex] = useState(0);
  const [values, setValues] = useState<OnboardingFormValues>(EMPTY_VALUES);
  const [saving, setSaving] = useState(false);

  const step = ONBOARDING_STEPS[stepIndex];
  const stepKey = step.id;
  const currentValue = values[stepKey];
  const isLastStep = stepIndex === ONBOARDING_STEPS.length - 1;

  const progressLabel = useMemo(
    () => `Step ${stepIndex + 1} of ${ONBOARDING_STEPS.length}`,
    [stepIndex]
  );

  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      const { data } = await supabase.auth.getUser();

      if (!data.user) {
        router.replace("/login");
        return;
      }

      const profile = await getUserProfile(data.user.id);

      if (profile?.onboarding_completed) {
        router.replace("/");
        return;
      }

      if (!cancelled) {
        setChecking(false);
      }
    };

    init();

    return () => {
      cancelled = true;
    };
  }, [router]);

  const setStepValue = (value: string) => {
    setValues((prev) => ({ ...prev, [stepKey]: value }));
  };

  const goBack = () => {
    if (stepIndex === 0) {
      router.push("/onboarding/privacy");
      return;
    }
    setStepIndex((i) => i - 1);
  };

  const goNext = async () => {
    if (!currentValue) {
      alert("Choose an option to continue.");
      return;
    }

    if (!isLastStep) {
      setStepIndex((i) => i + 1);
      return;
    }

    const { data } = await supabase.auth.getUser();
    if (!data.user) {
      router.replace("/login");
      return;
    }

    setSaving(true);
    const { error } = await saveOnboardingProfile(data.user.id, values);
    setSaving(false);

    if (error) {
      alert(error);
      return;
    }

    router.replace("/");
  };

  if (checking) {
    return (
      <main className="pf-page flex items-center justify-center p-6">
        <p className="pf-body-muted">Loading...</p>
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
              <p className="pf-section-eyebrow">Onboarding</p>
              <span className="text-xs text-pf-text-muted">{progressLabel}</span>
            </div>
            <div
              className="pf-onboarding-progress"
              role="progressbar"
              aria-valuenow={stepIndex + 1}
              aria-valuemin={1}
              aria-valuemax={ONBOARDING_STEPS.length}
              aria-label="Onboarding progress"
            >
              {ONBOARDING_STEPS.map((item, index) => (
                <span
                  key={item.id}
                  className={
                    index <= stepIndex
                      ? "pf-onboarding-progress-dot is-active"
                      : "pf-onboarding-progress-dot"
                  }
                />
              ))}
            </div>
          </div>

          <OnboardingOptionGroup
            name={`onboarding-${stepKey}`}
            legend={step.title}
            hint={step.hint}
            options={STEP_OPTIONS[stepKey]}
            value={currentValue}
            onChange={setStepValue}
            columns={stepKey === "goal" || stepKey === "trainingStyle" ? 1 : 2}
          />

          <div className="mt-auto pt-2 grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={goBack}
              disabled={saving}
              className="pf-btn-secondary"
            >
              Back
            </button>
            <button
              type="button"
              onClick={goNext}
              disabled={saving}
              className="pf-btn-primary disabled:opacity-60"
            >
              {saving
                ? "Saving…"
                : isLastStep
                  ? "Finish"
                  : "Continue"}
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
