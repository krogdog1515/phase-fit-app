import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Route-level contract tests for POST /api/pregnancy/screening.
 *
 * These cover the client->server contract that the resolveScreeningResult unit
 * tests cannot: those call the function with already-correct types, so they stay
 * green even if the wire format is wrong. This drives the REAL POST handler and
 * asserts the verdict it computes from a raw JSON body.
 *
 *   - tri-state string answers -> the expected verdict
 *   - boolean answers          -> hard_stop (reproduces the historical bug as a
 *                                 regression guard; the route must fail closed)
 *   - a missing q field        -> hard_stop
 */

// Hoisted mock fns so the module-level createClient() can close over them.
const { getUser, rpc } = vi.hoisted(() => ({
  getUser: vi.fn(),
  rpc: vi.fn(),
}));

// One stub serves both the auth client (auth.getUser) and the service client
// (rpc). No OpenAI import in this route, so nothing else needs mocking.
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    auth: { getUser },
    rpc,
  }),
}));

import { POST } from "./route";

/** A due date ~140 days out -> ~gestational week 20, valid whenever run. */
function validDueDate(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 140);
  return d.toISOString().slice(0, 10);
}

const DUE = validDueDate();

type Body = Record<string, unknown>;

function makeReq(over: Body): Request {
  const base: Body = {
    dueDate: DUE,
    q1: "no",
    q2: "no",
    q3: "no",
    q4: "no",
    providerAdvice: "not_consulted",
    disclaimerAcknowledged: true,
    q4_detail: "",
  };
  // JSON.stringify drops keys whose value is `undefined`, which is how the
  // "missing q field" case is expressed.
  return new Request("http://localhost/api/pregnancy/screening", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer test-token",
    },
    body: JSON.stringify({ ...base, ...over }),
  });
}

async function post(
  over: Body,
): Promise<{ status: number; json: { result: string } }> {
  const res = await POST(makeReq(over));
  return { status: res.status, json: (await res.json()) as { result: string } };
}

describe("POST /api/pregnancy/screening — contract", () => {
  beforeEach(() => {
    getUser.mockReset();
    rpc.mockReset();
    getUser.mockResolvedValue({ data: { user: { id: "u-1" } }, error: null });
    rpc.mockResolvedValue({ error: null });
  });

  describe("tri-state string answers -> expected verdict", () => {
    const cases: Array<[string, Body, string]> = [
      ["all no + not_consulted -> clear", {}, "clear"],
      [
        "q1 yes + not_consulted -> provider_conversation",
        { q1: "yes" },
        "provider_conversation",
      ],
      [
        "q1 unsure + not_consulted -> provider_conversation",
        { q1: "unsure" },
        "provider_conversation",
      ],
      [
        "q1 yes + advised_against -> hard_stop",
        { q1: "yes", providerAdvice: "advised_against" },
        "hard_stop",
      ],
      [
        "positive screen + cleared -> clear",
        { q1: "yes", providerAdvice: "cleared" },
        "clear",
      ],
    ];

    cases.forEach(([label, over, expected]) => {
      it(label, async () => {
        const { status, json } = await post(over);
        expect(status).toBe(200);
        expect(json.result).toBe(expected);
      });
    });
  });

  it("boolean answers -> hard_stop (fail closed, regression guard)", async () => {
    const { status, json } = await post({ q1: true, q2: true, q3: false, q4: true });
    expect(status).toBe(200);
    expect(json.result).toBe("hard_stop");
  });

  it("a missing q field -> hard_stop", async () => {
    const { status, json } = await post({ q3: undefined });
    expect(status).toBe(200);
    expect(json.result).toBe("hard_stop");
  });

  it("string literals reach persistence unchanged (rpc args)", async () => {
    const { json } = await post({ q1: "yes" });
    expect(rpc).toHaveBeenCalledTimes(1);
    const fnName = rpc.mock.calls[0][0] as string;
    const params = rpc.mock.calls[0][1] as {
      p_answers: Record<string, unknown>;
      p_screening_result: string;
    };
    expect(fnName).toBe("apply_pregnancy_screening");
    // The literal 'yes' — not a boolean — is what gets stored.
    expect(params.p_answers.q1).toBe("yes");
    expect(params.p_answers.q2).toBe("no");
    // And the persisted verdict matches the response verdict.
    expect(params.p_screening_result).toBe(json.result);
    expect(json.result).toBe("provider_conversation");
  });
});
