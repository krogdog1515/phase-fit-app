import { describe, it, expect } from "vitest";
import { parseGenerationParams, toGenerateApiBody } from "./generation-params";

describe("parseGenerationParams — discriminated by shape", () => {
  it("parses a cycle shape", () => {
    const parsed = parseGenerationParams({
      phase: "luteal",
      energy: "low",
      duration: 40,
      style: "Strength training",
      notes: "n",
    });
    expect(parsed).toEqual({
      kind: "cycle",
      params: {
        phase: "luteal",
        energy: "low",
        duration: 40,
        style: "Strength training",
        notes: "n",
      },
    });
  });

  it("parses a pregnancy shape (mode + equipment), not null", () => {
    const parsed = parseGenerationParams({
      mode: "pregnancy",
      duration: 30,
      stage_key: "t2_golden",
      gestational_week: 16,
      equipment: ["dumbbell", "band"],
      pool_slugs: ["a"],
      source: "model",
    });
    expect(parsed).toEqual({
      kind: "pregnancy",
      params: { time: 30, equipment: ["dumbbell", "band"], stageKey: "t2_golden" },
    });
  });

  it("pregnancy with no equipment/stage -> empty array + empty stageKey", () => {
    const parsed = parseGenerationParams({ mode: "pregnancy", duration: 20 });
    expect(parsed).toEqual({
      kind: "pregnancy",
      params: { time: 20, equipment: [], stageKey: "" },
    });
  });

  it("extracts focus so regenerate can carry it forward", () => {
    const parsed = parseGenerationParams({
      mode: "pregnancy",
      duration: 30,
      stage_key: "t2_golden",
      gestational_week: 16,
      equipment: [],
      focus: "upper_body",
    });
    expect(parsed?.kind).toBe("pregnancy");
    if (parsed?.kind === "pregnancy") expect(parsed.params.focus).toBe("upper_body");
  });

  it("extracts equipment_preset and notes for regenerate", () => {
    const parsed = parseGenerationParams({
      mode: "pregnancy",
      duration: 30,
      stage_key: "t2_golden",
      gestational_week: 16,
      equipment: ["chair", "wall", "dumbbell"],
      equipment_preset: "dumbbells_only",
      notes: "prefer upper body",
    });
    expect(parsed?.kind).toBe("pregnancy");
    if (parsed?.kind === "pregnancy") {
      expect(parsed.params.equipmentPreset).toBe("dumbbells_only");
      expect(parsed.params.notes).toBe("prefer upper body");
    }
  });

  it("returns null for junk / missing duration / incomplete cycle", () => {
    expect(parseGenerationParams(null)).toBeNull();
    expect(parseGenerationParams({})).toBeNull();
    expect(parseGenerationParams({ duration: 0, mode: "pregnancy" })).toBeNull();
    expect(parseGenerationParams({ phase: "luteal", duration: 40 })).toBeNull(); // no energy/style
  });
});

describe("toGenerateApiBody — cycle body, no user_id", () => {
  it("maps params to the API body without a user_id", () => {
    const body = toGenerateApiBody({
      phase: "luteal",
      energy: "low",
      duration: 40,
      style: "Strength training",
      notes: "n",
    });
    expect(body).toEqual({
      phase: "luteal",
      energy: "low",
      time: "40",
      style: "Strength training",
      notes: "n",
    });
    expect("user_id" in body).toBe(false);
  });
});
