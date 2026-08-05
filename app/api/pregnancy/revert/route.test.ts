import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * Contract tests for POST /api/pregnancy/revert.
 *
 * Requires JWT; resets the four gating fields; must NOT touch pregnancy_screening
 * (append-only history); a cycle-mode user is a no-op that still returns 200.
 */

const { state, getUser } = vi.hoisted(() => ({
  state: { updates: [] as Array<{ table: string; payload: unknown }>, tables: [] as string[] },
  getUser: vi.fn(),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    auth: { getUser },
    from: (table: string) => {
      state.tables.push(table);
      const obj: Record<string, unknown> = {
        update: (payload: unknown) => {
          state.updates.push({ table, payload });
          return obj;
        },
        delete: () => {
          state.updates.push({ table, payload: "DELETE" });
          return obj;
        },
        eq: async () => ({ error: null }),
      };
      return obj;
    },
  }),
}));

import { POST } from "./route";

function req(opts: { auth?: string | null } = {}) {
  const auth = opts.auth === undefined ? "Bearer good" : opts.auth;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (auth) headers["Authorization"] = auth;
  return new Request("http://localhost/api/pregnancy/revert", { method: "POST", headers });
}

beforeEach(() => {
  state.updates = [];
  state.tables = [];
  getUser.mockReset();
  getUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
});

describe("POST /api/pregnancy/revert", () => {
  it("401 without an Authorization header", async () => {
    const res = await POST(req({ auth: null }));
    expect(res.status).toBe(401);
    expect(state.updates).toHaveLength(0);
  });

  it("401 with an invalid token", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: { message: "bad" } });
    expect((await POST(req())).status).toBe(401);
  });

  it("resets all four gating fields on user_profiles", async () => {
    const res = await POST(req());
    expect(res.status).toBe(200);
    const upd = state.updates.find((u) => u.table === "user_profiles");
    expect(upd?.payload).toEqual({
      training_mode: "cycle",
      stage_anchor_date: null,
      provider_cleared: false,
      provider_cleared_at: null,
    });
  });

  it("does NOT touch pregnancy_screening (append-only history)", async () => {
    await POST(req());
    expect(state.tables).not.toContain("pregnancy_screening");
    expect(state.updates.some((u) => u.payload === "DELETE")).toBe(false);
  });

  it("is a no-op that still returns 200 (unconditional reset)", async () => {
    // The endpoint does not read current mode; a cycle user just re-sets cycle
    // values. Same code path, 200.
    expect((await POST(req())).status).toBe(200);
  });
});
