import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Guard-only tests for POST /api/generate-workout.
 *
 * Scope: the pregnancy-mode stopgap guard, which must FAIL CLOSED — only a
 * successfully-read training_mode === 'cycle' may proceed. A read error, a
 * missing profile row, or any non-'cycle' mode must return 409 and generate
 * nothing. We assert the three block cases; the OpenAI/generation path beyond
 * the guard is never reached, so it is not mocked.
 */

// Controllable profile read. Every test sets its resolved value.
const mockMaybeSingle = vi.fn();

// Mock the Supabase client so the module-level createClient() returns a stub
// whose profile-read chain resolves to whatever the test wants. If the guard
// ever let a request through, the deeper chain (.order/.limit) is undefined and
// the test would throw — a useful tripwire.
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: mockMaybeSingle,
        }),
      }),
    }),
  }),
}));

// Mock OpenAI so the module-level `new OpenAI({ apiKey })` doesn't throw on a
// missing key at import time.
vi.mock("openai", () => ({
  default: class {},
}));

import { POST } from "./route";

function reqWithValidFields() {
  return new Request("http://localhost/api/generate-workout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      user_id: "u-1",
      phase: "follicular",
      energy: "medium",
      time: "40",
      style: "strength",
    }),
  });
}

describe("generate-workout pregnancy guard — fail closed", () => {
  beforeEach(() => {
    mockMaybeSingle.mockReset();
  });

  it("blocks (409) when the profile read errors", async () => {
    mockMaybeSingle.mockResolvedValue({ data: null, error: { message: "boom" } });
    const res = await POST(reqWithValidFields());
    expect(res.status).toBe(409);
  });

  it("blocks (409) when there is no profile row", async () => {
    mockMaybeSingle.mockResolvedValue({ data: null, error: null });
    const res = await POST(reqWithValidFields());
    expect(res.status).toBe(409);
  });

  it("blocks (409) when training_mode is pregnancy", async () => {
    mockMaybeSingle.mockResolvedValue({
      data: { training_mode: "pregnancy" },
      error: null,
    });
    const res = await POST(reqWithValidFields());
    expect(res.status).toBe(409);
  });

  it("blocks (409) when training_mode is an unexpected value", async () => {
    mockMaybeSingle.mockResolvedValue({
      data: { training_mode: "postpartum" },
      error: null,
    });
    const res = await POST(reqWithValidFields());
    expect(res.status).toBe(409);
  });
});
