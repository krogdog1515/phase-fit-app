-- Pregnancy screening — three-outcome result + atomic apply.
--
-- WHY: pregnancy_screening.hard_stop (boolean) is too coarse. The validated
-- CSEP screening model produces THREE outcomes, not two:
--   'clear'                 -> proceed
--   'provider_conversation' -> talk to a provider before/while training
--   'hard_stop'             -> do not train on this pathway
-- This migration adds `screening_result` to carry that. `hard_stop` is left in
-- place for now (dropped in a later cleanup migration).
--
-- BACKFILL: none needed. pregnancy_screening has ZERO rows at time of writing
-- (the feature has never shipped a write path). Verified assumption, stated
-- explicitly rather than silently relied on. The `default 'clear'` only exists
-- to satisfy `not null`; no existing row consumes it.
--
-- Also adds the atomic apply function used by POST /api/pregnancy/screening.
-- The two writes it performs (insert screening row + flip user_profiles into
-- pregnancy mode) MUST be all-or-nothing: a profile on training_mode
-- 'pregnancy' with no stage_anchor_date (or the reverse) is the exact
-- half-configured state the gating layer assumes cannot exist.
--
-- IMPORTANT: does NOT touch 20260731120000_pregnancy_mode_foundation.sql —
-- that migration is applied to production. All changes here are additive.

-- 1) Three-outcome column ------------------------------------------------------
alter table public.pregnancy_screening
  add column screening_result text not null default 'clear'
    check (screening_result in ('clear', 'provider_conversation', 'hard_stop'));

comment on column public.pregnancy_screening.screening_result is
  'CSEP three-outcome verdict (clear / provider_conversation / hard_stop). '
  'Computed server-side by resolveScreeningResult (TypeScript, tested) — never '
  'trusted from the client. Supersedes the coarse hard_stop boolean.';

-- 2) Atomic apply function -----------------------------------------------------
-- Job of this function is ATOMICITY, not safety logic. The screening verdict is
-- computed and validated in TypeScript (lib/safety/screening.ts, which is the
-- single tested source of truth) and passed IN. This function does not, and
-- must not, re-derive the decision rules. It only:
--   - backstops that the passed result is one of the three valid values,
--   - inserts the screening row and flips the profile in ONE transaction,
--   - refuses to succeed if there is no user_profiles row to update.
--
-- security definer + pinned search_path: a security-definer function without a
-- pinned search_path is a privilege-escalation vector. execute is revoked from
-- anon/authenticated and granted only to service_role — this is called from a
-- server-only route, never directly by a client.
create or replace function public.apply_pregnancy_screening(
  p_user_id             uuid,
  p_gestational_week    integer,
  p_answers             jsonb,        -- {q1..q4, providerAdvice, disclaimerAcknowledged}
  p_screening_result    text,         -- computed in TS, passed in (NOT derived here)
  p_hard_stop           boolean,      -- derived in TS: screening_result = 'hard_stop'
  p_stage_anchor_date   date,
  p_provider_cleared    boolean,
  p_provider_cleared_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- Cheap backstop only. NOT the source of truth for the verdict.
  if p_screening_result not in ('clear', 'provider_conversation', 'hard_stop') then
    raise exception 'invalid screening_result: %', p_screening_result;
  end if;

  insert into public.pregnancy_screening (
    user_id,
    gestational_week_at_entry,
    contraindications,
    screening_result,
    hard_stop
  ) values (
    p_user_id,
    p_gestational_week,
    coalesce(p_answers, '{}'::jsonb),
    p_screening_result,
    p_hard_stop
  );

  -- training_mode is which CLOCK she is on; screening_result is whether we
  -- PRESCRIBE. Different questions — deliberately not coupled. She is pregnant
  -- regardless of the verdict, so a hard_stop still flips the mode; otherwise
  -- the app would keep generating cycle-phase workouts for a pregnant woman
  -- with a contraindication.
  update public.user_profiles
     set training_mode       = 'pregnancy',
         stage_anchor_date   = p_stage_anchor_date,
         provider_cleared    = p_provider_cleared,
         provider_cleared_at = p_provider_cleared_at
   where user_id = p_user_id;

  -- CRITICAL: a zero-row UPDATE does NOT raise in plpgsql. Without this guard
  -- the screening row would insert, the profile would silently stay on 'cycle',
  -- the function would return void, and the route would return 200 — producing
  -- the half-configured state the transaction was supposed to prevent.
  if not found then
    raise exception 'no user_profiles row for user_id %', p_user_id;
  end if;
end;
$$;

-- Server-only. No client (anon/authenticated) may call this directly.
revoke execute on function public.apply_pregnancy_screening(
  uuid, integer, jsonb, text, boolean, date, boolean, timestamptz
) from public, anon, authenticated;

grant execute on function public.apply_pregnancy_screening(
  uuid, integer, jsonb, text, boolean, date, boolean, timestamptz
) to service_role;

comment on function public.apply_pregnancy_screening(
  uuid, integer, jsonb, text, boolean, date, boolean, timestamptz
) is
  'Atomically records a pregnancy screening row and flips user_profiles into '
  'pregnancy mode. Verdict is computed in TypeScript and passed in; this '
  'function provides atomicity + a NOT FOUND guard, not safety logic.';
