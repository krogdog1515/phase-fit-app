import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  resolveScreeningResult,
  type ProviderAdvice,
  type ScreeningAnswer,
} from "@/lib/safety/screening";
import { resolvePregnancyStage } from "@/lib/stages/resolvePregnancyStage";

/**
 * POST /api/pregnancy/screening — server-only, service role.
 *
 * Switches the caller's account into pregnancy mode: records a screening row
 * and flips user_profiles, atomically.
 *
 * SAFETY CONTRACT:
 *  - The user id comes from a verified JWT, never from the body. (The existing
 *    generate-workout route trusts a body user_id — a known gap; not copied.)
 *  - The client NEVER supplies the verdict. Any screening_result / hard_stop in
 *    the body is ignored outright — not read, not logged as authoritative.
 *  - The verdict is computed here via resolveScreeningResult (the single tested
 *    source of truth).
 *  - Both writes go through one transactional RPC — no partial state.
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;

/** Anon client used only to verify a bearer token and resolve its user. */
function authClient() {
  return createClient(SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
}

/** Service-role client (bypasses RLS) used for the atomic RPC. */
function serviceClient() {
  return createClient(SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

export async function POST(req: Request) {
  // 1. Verify JWT. The user id is taken from the token, not the body.
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

  // 2. Parse the body. Note we DESTRUCTURE ONLY the fields we trust — any
  //    client-sent screening_result / hard_stop / user_id is never read.
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const dueDate = typeof body.dueDate === "string" ? body.dueDate : null;
  const providerAdvice = body.providerAdvice as ProviderAdvice;
  // Disclaimer is independent of provider clearance. provider_cleared is derived
  // solely from providerAdvice === 'cleared'; this is just the not-medical-advice
  // acknowledgment, stored for the record.
  const disclaimerAcknowledged = body.disclaimerAcknowledged === true;

  // Tri-state answers, passed straight to resolveScreeningResult which validates
  // the literals and fails closed on anything unexpected.
  const q1 = body.q1 as ScreeningAnswer;
  const q2 = body.q2 as ScreeningAnswer;
  const q3 = body.q3 as ScreeningAnswer;
  const q4 = body.q4 as ScreeningAnswer;

  // ── HARD BOUNDARY ──────────────────────────────────────────────────────────
  // q4_detail is UNSTRUCTURED USER TEXT. It must NEVER be interpolated into any
  // OpenAI prompt and must NEVER influence a safety decision. The generate route
  // interpolates user_profiles into the AI user message — q4_detail must not
  // follow that path (it lives in pregnancy_screening.contraindications, which
  // the generate route does not read; keep it that way). If someone writes "my
  // doctor said no lifting", the model must not infer a restriction from it.
  // Gating comes from screening_result and the movement library ONLY. It is
  // captured and shown back to the user verbatim — nothing more.
  const q4Detail =
    typeof body.q4_detail === "string" ? body.q4_detail.slice(0, 500) : "";

  // 3. Validate the due date. resolvePregnancyStage fails closed for anything
  //    unparseable or out of range. If it fails, we write NOTHING.
  const stage = resolvePregnancyStage(dueDate, new Date());
  if (!stage.ok) {
    return NextResponse.json(
      { error: "Invalid due date", reason: stage.reason },
      { status: 400 },
    );
  }

  // 4. Compute the verdict server-side. resolveScreeningResult fails closed to
  //    hard_stop on any malformed answer, so garbage answers still produce a
  //    recorded (safe) outcome rather than an error.
  const outcome = resolveScreeningResult({ q1, q2, q3, q4, providerAdvice });

  // 5. Derive persistence-only fields.
  const providerCleared = providerAdvice === "cleared";
  const providerClearedAt = providerCleared ? new Date().toISOString() : null;

  // 6. Atomic write. Both the screening insert and the profile flip happen in
  //    one DB transaction inside apply_pregnancy_screening. If either half
  //    fails (including a missing user_profiles row), nothing persists.
  const { error: rpcError } = await serviceClient().rpc("apply_pregnancy_screening", {
    p_user_id: userId,
    p_gestational_week: stage.gestationalWeek,
    p_answers: {
      q1,
      q2,
      q3,
      q4,
      providerAdvice,
      disclaimerAcknowledged,
      // Stored, never fed to the model or any gating logic — see HARD BOUNDARY.
      q4_detail: q4Detail,
    },
    p_screening_result: outcome.result,
    p_hard_stop: outcome.result === "hard_stop",
    p_stage_anchor_date: dueDate,
    p_provider_cleared: providerCleared,
    p_provider_cleared_at: providerClearedAt,
  });

  if (rpcError) {
    console.error("[pregnancy/screening] apply_pregnancy_screening failed", rpcError);
    return NextResponse.json({ error: "Could not save screening" }, { status: 500 });
  }

  return NextResponse.json({
    result: outcome.result,
    gestationalWeek: stage.gestationalWeek,
    stageKey: stage.stageKey,
  });
}
