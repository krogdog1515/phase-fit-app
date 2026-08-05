import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * POST /api/pregnancy/revert — switch an account back to cycle tracking.
 *
 * Server-only, service role. Same JWT contract as the other pregnancy routes:
 * the user id comes from the verified token, never the body.
 *
 * Resets the four pregnancy gating fields on user_profiles. Deliberately does
 * NOT delete pregnancy_screening rows — that table is append-only history; the
 * record of what was asked and answered must survive a revert. Idempotent: a
 * user already on cycle is a no-op that still returns 200.
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;

function authClient() {
  return createClient(SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
}

function serviceClient() {
  return createClient(SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

export async function POST(req: Request) {
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

  const { error } = await serviceClient()
    .from("user_profiles")
    .update({
      training_mode: "cycle",
      stage_anchor_date: null,
      provider_cleared: false,
      provider_cleared_at: null,
    })
    .eq("user_id", userId);

  if (error) {
    console.error("[pregnancy/revert] update failed", error);
    return NextResponse.json({ error: "Could not switch back to cycle" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
