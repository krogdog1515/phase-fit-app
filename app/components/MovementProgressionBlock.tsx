type MovementProgressionBlockProps = {
  sets: number;
  reps: string;
  rir: string;
  lastSession?: string;
  reasonNote?: string;
};

export default function MovementProgressionBlock({
  sets,
  reps,
  rir,
  lastSession,
  reasonNote,
}: MovementProgressionBlockProps) {
  const targetToday = `${sets} sets × ${reps}${rir.trim() ? ` • RIR ${rir.trim()}` : ""}`;

  return (
    <div className="rounded-xl bg-pf-bg border border-pf-border px-3 py-2.5 space-y-1.5 text-sm">
      {lastSession ? (
        <p className="text-pf-text-secondary">
          <span className="font-medium text-pf-text">Last session:</span>{" "}
          {lastSession}
        </p>
      ) : null}
      <p className="text-pf-text-secondary">
        <span className="font-medium text-pf-text">Target today:</span>{" "}
        {targetToday}
      </p>
      {reasonNote?.trim() ? (
        <p className="text-pf-text-secondary">
          <span className="font-medium text-pf-text">Reason:</span>{" "}
          <span className="text-pf-coral">{reasonNote.trim()}</span>
        </p>
      ) : null}
    </div>
  );
}
