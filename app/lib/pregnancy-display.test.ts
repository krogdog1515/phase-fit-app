import { describe, it, expect } from "vitest";
import { buildPregnancyCoachingDisplay } from "./pregnancy-display";

describe("buildPregnancyCoachingDisplay — WHAT I NOTICED", () => {
  const base = {
    stageKey: "t2_golden" as const,
    gestationalWeek: 17,
    priorActivityLevel: "active",
  };

  it("surfaces the composition notice in the noticed list, verbatim", () => {
    const notice =
      "Week 17 has a 4-movement strength minimum, so this session runs a little longer than 20 minutes.";
    const d = buildPregnancyCoachingDisplay({ ...base, notice });
    expect(d.noticed).toContain(notice);
  });

  it("omits the notice line when there is none", () => {
    const d = buildPregnancyCoachingDisplay({ ...base, notice: null });
    expect(d.noticed.some((n) => n.includes("minimum"))).toBe(false);
    // Whitespace-only is treated as absent.
    const blank = buildPregnancyCoachingDisplay({ ...base, notice: "   " });
    expect(blank.noticed).not.toContain("   ");
  });

  it("surfaces both a focus fallback and a composition notice when both apply", () => {
    const d = buildPregnancyCoachingDisplay({
      ...base,
      focus: { label: "Upper body", fallback: true },
      notice: "Your library has limited core strength movements at this stage.",
    });
    expect(d.noticed.some((n) => n.includes("built around it"))).toBe(true);
    expect(d.noticed).toContain("Your library has limited core strength movements at this stage.");
  });
});
