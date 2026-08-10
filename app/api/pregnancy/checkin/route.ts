import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  evaluateRedFlags,
  RED_FLAG_KEYS,
  type RedFlagAnswers,
} from "@/lib/safety/redFlags";
import { isAcceptableClientDate } from "@/lib/dates";

/**
 * POST /api/pregnancy/checkin — server-only, service role.
 *
 * Records today's daily red-flag check-in and returns the SERVER-COMPUTED
 * verdict. Same safety contract as the screening route:
 *  - The user id comes from a verified JWT, never the body.
 *  - The client NEVER supplies the verdict. `blocked` is computed here via
 *    evaluateRedFlags (the single tested source of truth); any client-sent
 *    verdict is ignored.
 *  - "Today" is the client's LOCAL date (see lib/dates), validated to be within
 *    a day of UTC now so a malformed/absurd value can't point at another day.
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;

function authClient() {
  return createClient(SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
}

function serviceClient() {
  return createClient(SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

/** A 1–5 integer, or null. */
function scale(value: unknown): number | null {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= 5 ? n : null;
}

export async function POST(req: Request) {
  // 1. Verify JWT. User id from the token, never the body.
  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) {
    return NextResponse.json({ error: "Missing bearer token" }, { status: 401 });
  }
  const { data: userData, error: authError } = await authClient().auth.getUser(token);
  if (authError || !userData?.user) {
    return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 });
  }
  const userId = userData.user.id;

  // 2. Parse body.
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // 3. Validate the client-local date.
  if (!isAcceptableClientDate(body.date, new Date())) {
    return NextResponse.json({ error: "Invalid or out-of-range date" }, { status: 400 });
  }
  const date = body.date as string;

  // 4. Pick only the six known flag keys. Missing/garbage values pass straight
  //    to evaluateRedFlags, which fails closed to blocked.
  const rawAnswers = (body.answers ?? {}) as Record<string, unknown>;
  const answers = Object.fromEntries(
    RED_FLAG_KEYS.map((k) => [k, rawAnswers[k]]),
  ) as unknown as RedFlagAnswers;

  // 5. Compute the verdict server-side.
  const outcome = evaluateRedFlags(answers);

  const energy = scale(body.energy);
  const sleepQuality = scale(body.sleepQuality);
  const notes =
    typeof body.notes === "string" && body.notes.trim() ? body.notes.slice(0, 1000) : null;

  // 6. Upsert today's row. red_flags stores the answers plus the derived verdict;
  //    the generate gate re-evaluates from the answers rather than trusting the
  //    stored boolean (client-writable table).
  const { error } = await serviceClient()
    .from("daily_checkins")
    .upsert(
      {
        user_id: userId,
        date,
        red_flags: {
          answers,
          blocked: outcome.blocked,
          triggered: outcome.triggered,
        },
        energy,
        sleep_quality: sleepQuality,
        notes,
      },
      { onConflict: "user_id,date" },
    );

  if (error) {
    console.error("[pregnancy/checkin] upsert failed", error);
    return NextResponse.json({ error: "Could not save check-in" }, { status: 500 });
  }

  // Return only the verdict — never which flag fired.
  return NextResponse.json({ blocked: outcome.blocked });
}
