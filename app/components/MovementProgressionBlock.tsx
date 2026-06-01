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
    <div className="rounded-lg bg-[#f9f7f7] border border-gray-100 px-3 py-2.5 space-y-1.5 text-sm">
      {lastSession ? (
        <p className="text-gray-700">
          <span className="font-medium text-gray-900">Last session:</span>{" "}
          {lastSession}
        </p>
      ) : null}
      <p className="text-gray-700">
        <span className="font-medium text-gray-900">Target today:</span>{" "}
        {targetToday}
      </p>
      {reasonNote?.trim() ? (
        <p className="text-gray-700">
          <span className="font-medium text-gray-900">Reason:</span>{" "}
          <span className="text-[#7a1f2a]">{reasonNote.trim()}</span>
        </p>
      ) : null}
    </div>
  );
}
