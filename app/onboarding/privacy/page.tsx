"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import PhaseFitLogo from "../../components/PhaseFitLogo";
import supabase from "../../lib/supabase";
import { getUserProfile } from "../../lib/user-profile";

export default function OnboardingPrivacyPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);

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

      if (profile && !profile.onboarding_completed) {
        router.replace("/onboarding");
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

  if (checking) {
    return (
      <main className="pf-page flex items-center justify-center p-6">
        <p className="pf-body-muted">Loading...</p>
      </main>
    );
  }

  return (
    <main className="pf-page flex flex-col min-h-full p-6 pb-10">
      <div className="w-full max-w-md mx-auto flex flex-col flex-1 space-y-6">
        <div className="text-center pt-2">
          <PhaseFitLogo variant="auth" className="flex justify-center" priority />
        </div>

        <div className="pf-card-hero p-6 sm:p-8 flex flex-col flex-1">
          <p className="pf-section-eyebrow mb-2">Welcome</p>
          <h1 className="pf-heading-section text-xl sm:text-2xl">
            Your data stays private
          </h1>

          <div className="mt-5 space-y-4 pf-body-secondary text-[0.9375rem] leading-relaxed">
            <p>
              Phase Fit uses your workout history, cycle information, and
              feedback to personalize recommendations.
            </p>
            <p>
              Your information is not sold to third parties and is only used to
              improve your experience inside Phase Fit.
            </p>
            <p>
              Our goal is to create a coaching experience that feels personal,
              private, and secure.
            </p>
          </div>

          <div className="mt-auto pt-8">
            <button
              type="button"
              onClick={() => router.push("/onboarding")}
              className="pf-btn-primary pf-btn-primary-prominent"
            >
              Continue
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
