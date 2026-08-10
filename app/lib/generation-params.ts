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

/**
 * Parsed regenerate params, discriminated by mode. Cycle and pregnancy workouts
 * store different `generation_params` shapes (cycle: phase/energy/style;
 * pregnancy: mode/stage_key/equipment). Callers branch on `kind`, NOT on
 * training_mode, so neither shape silently parses as `null`.
 */
export type ParsedGenerationParams =
  | { kind: "cycle"; params: GenerationParams }
  | {
      kind: "pregnancy";
      params: { time: number; equipment: string[]; stageKey: string };
    };

export function parseGenerationParams(raw: unknown): ParsedGenerationParams | null {
  if (!raw || typeof raw !== "object") return null;

  const o = raw as Record<string, unknown>;
  const duration =
    typeof o.duration === "number" ? o.duration : Number(o.duration);
  if (!Number.isFinite(duration) || duration <= 0) return null;

  // Pregnancy shape: carries `mode: "pregnancy"` + equipment + stage_key. No
  // phase/energy. stageKey is the band AT GENERATION TIME (stored), so a
  // historical row keeps its own label rather than reading current profile.
  if (o.mode === "pregnancy") {
    const equipment = Array.isArray(o.equipment)
      ? o.equipment.map((e) => String(e))
      : [];
    const stageKey = typeof o.stage_key === "string" ? o.stage_key : "";
    return {
      kind: "pregnancy",
      params: { time: Math.round(duration), equipment, stageKey },
    };
  }

  // Cycle shape: phase / energy / style strings.
  if (
    typeof o.phase !== "string" ||
    typeof o.energy !== "string" ||
    typeof o.style !== "string"
  ) {
    return null;
  }

  return {
    kind: "cycle",
    params: {
      phase: o.phase,
      energy: o.energy,
      duration: Math.round(duration),
      style: o.style,
      notes: typeof o.notes === "string" ? o.notes : "",
    },
  };
}

/**
 * Cycle regenerate body for POST /api/generate-workout. The route derives the
 * user from the bearer token, so no user_id is sent (the caller attaches the
 * Authorization header).
 */
export function toGenerateApiBody(params: GenerationParams): Record<string, string> {
  return {
    phase: params.phase,
    energy: params.energy,
    time: String(params.duration),
    style: params.style,
    notes: params.notes,
  };
}
