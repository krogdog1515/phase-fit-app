import Link from "next/link";
import DashboardHero from "../components/DashboardHero";
import GenerateWorkoutClient from "./GenerateWorkoutClient";

export default function GeneratePage() {
  return (
    <main className="pf-page pb-12">
      <div className="px-5 pt-4 flex justify-end">
        <Link href="/" className="pf-btn-ghost">
          Back
        </Link>
      </div>

      <DashboardHero
        eyebrow="Workout builder"
        title="Build Today's Training Session"
        description="Your session adapts to cycle phase, recovery, energy, and training goals — built for how you feel today."
        ariaLabel="Workout builder"
      />

      <div className="pf-container px-5 -mt-2 space-y-6">
        <GenerateWorkoutClient />
      </div>
    </main>
  );
}
