export type CoachingDisplay = {
  phase: string;
  noticed: string[];
  adjustments: string[];
  coachNote: string;
};

function formatPhase(phase?: string): string {
  if (!phase?.trim()) return "—";
  const p = phase.trim();
  return p.charAt(0).toUpperCase() + p.slice(1).toLowerCase();
}

function splitSentences(text: string): string[] {
  return (
    text
      .replace(/\n+/g, " ")
      .match(/[^.!?]+[.!?]+|[^.!?]+$/g)
      ?.map((s) => s.trim())
      .filter((s) => s.length > 0) ?? [text.trim()]
  );
}

function stripBulletPrefix(line: string): string {
  return line.replace(/^[\s]*[-•*–]\s+/, "").replace(/^\d+[.)]\s+/, "").trim();
}

/** Split prose into scannable bullet strings (presentation only). */
export function extractBullets(text: string | undefined, max: number): string[] {
  if (!text?.trim() || max <= 0) return [];

  const t = text.trim();
  const lines = t
    .split(/\n+/)
    .map(stripBulletPrefix)
    .filter((line) => line.length > 0);

  if (lines.length > 1 || /^[\s]*[-•*]\s/m.test(t)) {
    return lines.slice(0, max);
  }

  if (t.includes(";")) {
    const parts = t
      .split(";")
      .map((s) => s.trim())
      .filter((s) => s.length > 8);
    if (parts.length >= 2) return parts.slice(0, max);
  }

  const sentences = splitSentences(t);
  if (sentences.length >= 2) return sentences.slice(0, max);

  if (/\s[—-]\s/.test(t)) {
    const parts = t
      .split(/\s[—-]\s+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 8);
    if (parts.length >= 2) return parts.slice(0, max);
  }

  if (t.includes(", ") && t.length > 80) {
    const parts = t
      .split(/,\s+(?=[A-Za-z])/)
      .map((s) => s.trim())
      .filter((s) => s.length > 12);
    if (parts.length >= 2) return parts.slice(0, max);
  }

  return [t];
}

function coachNoteFromText(text: string | undefined): string {
  if (!text?.trim()) return "";
  const t = text.trim();
  if (t.length <= 140) return t;

  const sentences = splitSentences(t);
  if (sentences.length === 1) {
    const cut = t.slice(0, 140);
    return `${cut.replace(/\s+\S*$/, "")}…`;
  }

  const pair = sentences.slice(0, 2).join(" ");
  if (pair.length <= 200) return pair;
  return sentences[0];
}

function dedupeItems(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    const key = item.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function withoutCoachNoteOverlap(
  bullets: string[],
  coachNote: string
): string[] {
  const noteLower = coachNote.toLowerCase();
  return bullets.filter((b) => {
    const bl = b.toLowerCase();
    return bl !== noteLower && !noteLower.includes(bl) && !bl.includes(noteLower);
  });
}

/**
 * Maps existing cycle_guidance strings into a scannable coaching layout.
 * Does not alter stored data or generation output.
 */
export function buildCoachingDisplay(input: {
  phase?: string;
  summary?: string;
  during_workout?: string;
  adjustments?: string;
}): CoachingDisplay {
  const summary = input.summary?.trim() ?? "";
  const during = input.during_workout?.trim() ?? "";
  const adjustmentsText = input.adjustments?.trim() ?? "";

  const coachNote =
    coachNoteFromText(summary) ||
    coachNoteFromText(during) ||
    coachNoteFromText(adjustmentsText);

  let noticed = withoutCoachNoteOverlap(extractBullets(summary, 4), coachNote).slice(
    0,
    3
  );

  if (noticed.length === 0 && summary) {
    const sentences = splitSentences(summary);
    if (sentences.length > 1) {
      noticed = sentences.slice(1, 4);
    } else {
      noticed = extractBullets(summary, 3);
    }
  }

  let adjustments = dedupeItems([
    ...extractBullets(adjustmentsText, 2),
    ...extractBullets(during, 2),
  ]).slice(0, 3);

  if (adjustments.length === 0 && (during || adjustmentsText)) {
    adjustments = extractBullets(
      [adjustmentsText, during].filter(Boolean).join(" "),
      3
    );
  }

  return {
    phase: formatPhase(input.phase),
    noticed,
    adjustments,
    coachNote,
  };
}
