import { buildCoachingDisplay } from "../lib/coaching-display";

type CoachingCardProps = {
  phase?: string;
  summary?: string;
  duringWorkout?: string;
  adjustments?: string;
};

function BulletBlock({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;

  return (
    <div className="pf-coaching-block">
      <h3 className="pf-coaching-block-title">{title}</h3>
      <ul className="pf-coaching-list">
        {items.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

export default function CoachingCard({
  phase,
  summary,
  duringWorkout,
  adjustments,
}: CoachingCardProps) {
  const coaching = buildCoachingDisplay({
    phase,
    summary,
    during_workout: duringWorkout,
    adjustments,
  });

  const hasContent =
    coaching.coachNote ||
    coaching.noticed.length > 0 ||
    coaching.adjustments.length > 0 ||
    coaching.phase !== "—";

  if (!hasContent) return null;

  return (
    <section className="pf-coaching-card pf-card-hero" aria-label="Today's coaching">
      <p className="pf-section-eyebrow">Today&apos;s coaching</p>

      <div className="pf-coaching-phase">
        <span className="pf-coaching-block-title">Phase</span>
        <p className="pf-coaching-phase-value">{coaching.phase}</p>
      </div>

      <div className="pf-coaching-sections">
        <BulletBlock title="What I noticed" items={coaching.noticed} />
        <BulletBlock title="Today's adjustment" items={coaching.adjustments} />
      </div>

      {coaching.coachNote ? (
        <div className="pf-coaching-note">
          <h3 className="pf-coaching-block-title">Coach&apos;s note</h3>
          <p className="pf-coaching-note-text">{coaching.coachNote}</p>
        </div>
      ) : null}
    </section>
  );
}
