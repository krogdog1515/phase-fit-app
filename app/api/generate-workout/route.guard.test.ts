import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Mode-gate fail-closed tests for POST /api/generate-workout.
 *
 * After JWT verification, the route reads training_mode for the verified user
 * and must FAIL CLOSED: a read error, a missing profile row, or any mode outside
 * {cycle, pregnancy} returns 409. (The pregnancy sub-gates and auth 401s are
 * covered in pregnancy-gate.test.ts.)
 */

const { getUser, maybeSingle } = vi.hoisted(() => ({
  getUser: vi.fn(),
  maybeSingle: vi.fn(),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => {
    const obj: Record<string, unknown> = {
      select: () => obj,
      eq: () => obj,
      order: () => obj,
      limit: () => obj,
      insert: () => obj,
      maybeSingle,
      single: async () => ({ data: null, error: null }),
      then: (res: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(res),
    };
    return { auth: { getUser }, from: () => obj };
  },
}));

// Mock OpenAI so module-level `new OpenAI(...)` doesn't throw; it must never be
// reached in these blocked cases.
vi.mock("openai", () => ({ default: class {} }));

import { POST } from "./route";

function req() {
  return new Request("http://localhost/api/generate-workout", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer good",
    },
    body: JSON.stringify({ time: "40", phase: "follicular", energy: "medium", style: "strength" }),
  });
}

describe("generate-workout mode gate — fail closed", () => {
  beforeEach(() => {
    getUser.mockReset();
    maybeSingle.mockReset();
    getUser.mockResolvedValue({ data: { user: { id: "u-1" } }, error: null });
  });

  it("blocks (409) when the profile read errors", async () => {
    maybeSingle.mockResolvedValue({ data: null, error: { message: "boom" } });
    expect((await POST(req())).status).toBe(409);
  });

  it("blocks (409) when there is no profile row", async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null });
    expect((await POST(req())).status).toBe(409);
  });

  it("blocks (409) when training_mode is an unexpected value", async () => {
    maybeSingle.mockResolvedValue({ data: { training_mode: "postpartum" }, error: null });
    expect((await POST(req())).status).toBe(409);
  });
});
