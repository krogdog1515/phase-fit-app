"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import PhaseFitLogo from "../components/PhaseFitLogo";
import supabase from "../lib/supabase";
import { getUserProfile, type UserProfileRow } from "../lib/user-profile";
import { resolvePregnancyStage } from "@/lib/stages/resolvePregnancyStage";
import { STAGE_BAND_LABELS } from "../lib/pregnancy-display";

const MODE_LABELS: Record<UserProfileRow["training_mode"], string> = {
  cycle: "Cycle",
  pregnancy: "Pregnancy",
  postpartum: "Postpartum",
};

export default function SettingsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<UserProfileRow | null>(null);

  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        router.replace("/login");
        return;
      }
      const p = await getUserProfile(data.user.id);
      if (!cancelled) {
        setProfile(p);
        setLoading(false);
      }
    };

    init();
    return () => {
      cancelled = true;
    };
  }, [router]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  if (loading) {
    return (
      <main className="pf-page flex items-center justify-center p-6">
        <p className="pf-body-muted">Loading...</p>
      </main>
    );
  }

  const trainingMode = profile?.training_mode ?? "cycle";

  // Read-only pregnancy status. Purely informational — not editable yet.
  let pregnancyStatus: { week: number; band: string; dueDate: string } | null = null;
  if (trainingMode === "pregnancy" && profile?.stage_anchor_date) {
    const stage = resolvePregnancyStage(profile.stage_anchor_date, new Date());
    if (stage.ok) {
      pregnancyStatus = {
        week: stage.gestationalWeek,
        band: STAGE_BAND_LABELS[stage.stageKey],
        dueDate: profile.stage_anchor_date,
      };
    }
  }

  return (
    <main className="pf-page flex flex-col min-h-full p-6 pb-10">
      <div className="w-full max-w-md mx-auto flex flex-col flex-1 space-y-5">
        <div className="text-center pt-1">
          <PhaseFitLogo variant="auth" className="flex justify-center" priority />
        </div>

        <div className="pf-card p-5 sm:p-6 space-y-5">
          <div className="flex items-center justify-between gap-3">
            <p className="pf-section-eyebrow">Settings</p>
            <button
              type="button"
              onClick={() => router.push("/")}
              className="text-sm text-pf-text-muted hover:text-pf-text"
            >
              Done
            </button>
          </div>

          {/* Training mode */}
          <button
            type="button"
            onClick={() => router.push("/settings/mode")}
            className="w-full text-left pf-card p-4 flex items-center justify-between gap-3 hover:border-pf-coral"
          >
            <span>
              <span className="pf-form-section-title block">Training mode</span>
              <span className="pf-body-muted text-sm">
                Currently: {MODE_LABELS[trainingMode]}
              </span>
            </span>
            <span aria-hidden className="text-pf-text-muted">
              ›
            </span>
          </button>

          {/* Read-only pregnancy status */}
          {pregnancyStatus ? (
            <div className="pf-card p-4 space-y-1">
              <span className="pf-form-section-title block">Pregnancy status</span>
              <p className="pf-body-secondary text-sm">
                Due date: {pregnancyStatus.dueDate}
              </p>
              <p className="pf-body-secondary text-sm">
                Week {pregnancyStatus.week} · {pregnancyStatus.band}
              </p>
              <p className="pf-body-muted text-xs pt-1">Read-only for now.</p>
            </div>
          ) : null}

          <button type="button" onClick={handleLogout} className="pf-btn-secondary w-full">
            Logout
          </button>
        </div>
      </div>
    </main>
  );
}
