import { describe, it, expect } from "vitest";
import {
  resolvePregnancyGenerateView,
  type CheckinStatus,
} from "./pregnancy-generate-gate";

describe("resolvePregnancyGenerateView", () => {
  it("renders the form ONLY when screening clear + check-in clear", () => {
    expect(
      resolvePregnancyGenerateView({ screening: "clear", checkinStatus: "clear" }),
    ).toBe("form");
  });

  it("does NOT render the form when today's check-in is blocked", () => {
    const view = resolvePregnancyGenerateView({
      screening: "clear",
      checkinStatus: "blocked",
    });
    expect(view).toBe("blocked");
    expect(view).not.toBe("form");
  });

  it("points back to check in when the check-in is missing", () => {
    expect(
      resolvePregnancyGenerateView({ screening: "clear", checkinStatus: "needed" }),
    ).toBe("checkin_needed");
  });

  it("fails closed: any non-clear check-in never yields the form", () => {
    const nonClear: CheckinStatus[] = ["loading", "needed", "blocked"];
    for (const checkinStatus of nonClear) {
      expect(
        resolvePregnancyGenerateView({ screening: "clear", checkinStatus }),
      ).not.toBe("form");
    }
  });

  it("screening gates take precedence over the check-in", () => {
    expect(
      resolvePregnancyGenerateView({ screening: "hard_stop", checkinStatus: "clear" }),
    ).toBe("hard_stop");
    expect(
      resolvePregnancyGenerateView({
        screening: "provider_conversation",
        checkinStatus: "clear",
      }),
    ).toBe("provider_conversation");
    expect(
      resolvePregnancyGenerateView({ screening: null, checkinStatus: "clear" }),
    ).toBe("needs_screening");
  });
});
