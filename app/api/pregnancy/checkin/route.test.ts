import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Route-level contract tests for POST /api/pregnancy/checkin.
 *
 * Drives the real handler: asserts the verdict it COMPUTES from a raw body, that
 * a client-sent verdict is ignored, and that it fails closed on malformed input.
 */

const { getUser, upsert } = vi.hoisted(() => ({
  getUser: vi.fn(),
  upsert: vi.fn(),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    auth: { getUser },
    from: () => ({ upsert }),
  }),
}));

import { POST } from "./route";

/** UTC today — always within ±1 day of the server's UTC now. */
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

const ALL_NO = {
  bleeding: "no",
  fluidLeak: "no",
  contractions: "no",
  chestPain: "no",
  dizziness: "no",
  breathlessness: "no",
};

function makeReq(over: Record<string, unknown>, auth: string | null = "Bearer good"): Request {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (auth) headers["Authorization"] = auth;
  return new Request("http://localhost/api/pregnancy/checkin", {
    method: "POST",
    headers,
    body: JSON.stringify({ date: today(), answers: ALL_NO, ...over }),
  });
}

/** The row passed to the most recent upsert() call. */
function upsertedRow(): Record<string, unknown> {
  return upsert.mock.calls.at(-1)?.[0] as Record<string, unknown>;
}

beforeEach(() => {
  getUser.mockReset();
  upsert.mockReset();
  getUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
  upsert.mockResolvedValue({ error: null });
});

describe("auth + date", () => {
  it("401 without a bearer token", async () => {
    const res = await POST(makeReq({}, null));
    expect(res.status).toBe(401);
    expect(upsert).not.toHaveBeenCalled();
  });

  it("400 on an out-of-range date", async () => {
    const res = await POST(makeReq({ date: "2000-01-01" }));
    expect(res.status).toBe(400);
    expect(upsert).not.toHaveBeenCalled();
  });
});

describe("server-computed verdict", () => {
  it("all-no -> not blocked, persists verdict + keyed on user_id/date", async () => {
    const res = await POST(makeReq({}));
    expect(res.status).toBe(200);
    expect((await res.json()).blocked).toBe(false);

    const row = upsertedRow();
    expect(row.user_id).toBe("u1");
    expect(row.date).toBe(today());
    expect((row.red_flags as Record<string, unknown>).blocked).toBe(false);
  });

  it("a 'yes' flag blocks", async () => {
    const res = await POST(makeReq({ answers: { ...ALL_NO, bleeding: "yes" } }));
    expect((await res.json()).blocked).toBe(true);
    expect((upsertedRow().red_flags as Record<string, unknown>).blocked).toBe(true);
  });

  it("'unsure' blocks like 'yes'", async () => {
    const res = await POST(makeReq({ answers: { ...ALL_NO, dizziness: "unsure" } }));
    expect((await res.json()).blocked).toBe(true);
  });

  it("a missing flag key fails closed to blocked", async () => {
    const missing: Record<string, string> = { ...ALL_NO };
    delete missing.bleeding;
    const res = await POST(makeReq({ answers: missing }));
    expect((await res.json()).blocked).toBe(true);
  });

  it("a client-sent 'blocked' verdict is ignored (server recomputes)", async () => {
    const res = await POST(
      makeReq({ blocked: false, answers: { ...ALL_NO, chestPain: "yes" } }),
    );
    expect((await res.json()).blocked).toBe(true);
  });

  it("persists validated energy/sleep, drops out-of-range", async () => {
    await POST(makeReq({ energy: 4, sleepQuality: 9 }));
    const row = upsertedRow();
    expect(row.energy).toBe(4);
    expect(row.sleep_quality).toBe(null);
  });
});
