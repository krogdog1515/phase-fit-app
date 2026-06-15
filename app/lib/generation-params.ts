export type GenerationParams = {
  phase: string;
  energy: string;
  duration: number;
  style: string;
  notes: string;
};

export function buildGenerationParams(input: {
  phase: string;
  energy: string;
  time: string | number;
  style: string;
  notes?: string | null;
}): GenerationParams {
  const duration = Math.round(Number(input.time));
  return {
    phase: input.phase,
    energy: input.energy,
    duration,
    style: input.style,
    notes: input.notes?.trim() ?? "",
  };
}

export function parseGenerationParams(raw: unknown): GenerationParams | null {
  if (!raw || typeof raw !== "object") return null;

  const o = raw as Record<string, unknown>;
  const duration =
    typeof o.duration === "number" ? o.duration : Number(o.duration);

  if (
    typeof o.phase !== "string" ||
    typeof o.energy !== "string" ||
    typeof o.style !== "string" ||
    !Number.isFinite(duration) ||
    duration <= 0
  ) {
    return null;
  }

  return {
    phase: o.phase,
    energy: o.energy,
    duration: Math.round(duration),
    style: o.style,
    notes: typeof o.notes === "string" ? o.notes : "",
  };
}

/** Map stored params to existing generate-workout API body (`time` as string). */
export function toGenerateApiBody(
  userId: string,
  params: GenerationParams
): Record<string, string> {
  return {
    user_id: userId,
    phase: params.phase,
    energy: params.energy,
    time: String(params.duration),
    style: params.style,
    notes: params.notes,
  };
}
