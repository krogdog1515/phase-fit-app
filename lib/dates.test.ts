import { describe, it, expect } from "vitest";
import { localDateISO, isAcceptableClientDate } from "./dates";

describe("localDateISO", () => {
  it("formats local calendar components (not UTC)", () => {
    // 2026-08-07 18:30 local -> that same local date, regardless of UTC offset.
    const d = new Date(2026, 7, 7, 18, 30, 0);
    expect(localDateISO(d)).toBe("2026-08-07");
  });

  it("zero-pads month and day", () => {
    expect(localDateISO(new Date(2026, 0, 3))).toBe("2026-01-03");
  });
});

describe("isAcceptableClientDate", () => {
  const now = new Date("2026-08-07T12:00:00.000Z");

  it("accepts today and ±1 day (covers timezone skew)", () => {
    expect(isAcceptableClientDate("2026-08-07", now)).toBe(true);
    expect(isAcceptableClientDate("2026-08-06", now)).toBe(true);
    expect(isAcceptableClientDate("2026-08-08", now)).toBe(true);
  });

  it("rejects dates more than a day away", () => {
    expect(isAcceptableClientDate("2026-08-05", now)).toBe(false);
    expect(isAcceptableClientDate("2026-08-09", now)).toBe(false);
    expect(isAcceptableClientDate("2020-01-01", now)).toBe(false);
  });

  it("rejects malformed or non-string input", () => {
    expect(isAcceptableClientDate("2026-8-7", now)).toBe(false);
    expect(isAcceptableClientDate("07/08/2026", now)).toBe(false);
    expect(isAcceptableClientDate("2026-13-40", now)).toBe(false);
    expect(isAcceptableClientDate("", now)).toBe(false);
    expect(isAcceptableClientDate(null, now)).toBe(false);
    expect(isAcceptableClientDate(undefined, now)).toBe(false);
    expect(isAcceptableClientDate(20260807, now)).toBe(false);
  });
});
