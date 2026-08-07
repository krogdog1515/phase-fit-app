-- Add prior_activity_level to the atomic screening apply function.
--
-- WHY: pregnancy_screening.prior_activity_level exists but was never collected,
-- so a previously-sedentary user and a heavily-training athlete got identical
-- sessions. The mode-switch flow now collects it; the RPC must persist it.
--
-- This REPLACES apply_pregnancy_screening with a 9-arg version. The old 8-arg
-- overload is dropped first (create-or-replace can't change the signature; it
-- would leave a stale overload). Body is otherwise identical to
-- 20260803120000 — same atomicity + NOT FOUND guard. Do NOT edit that applied
-- migration; this is the new one.

drop function if exists public.apply_pregnancy_screening(
  uuid, integer, jsonb, text, boolean, date, boolean, timestamptz
);

create or replace function public.apply_pregnancy_screening(
  p_user_id             uuid,
  p_gestational_week    integer,
  p_answers             jsonb,        -- {q1..q4, providerAdvice, disclaimerAcknowledged}
  p_screening_result    text,         -- computed in TS, passed in (NOT derived here)
  p_hard_stop           boolean,      -- derived in TS: screening_result = 'hard_stop'
  p_stage_anchor_date   date,
  p_provider_cleared    boolean,
  p_provider_cleared_at timestamptz,
  p_prior_activity_level text          -- sedentary | light | active | athlete, or null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- Cheap backstops only. NOT the source of truth for the verdict.
  if p_screening_result not in ('clear', 'provider_conversation', 'hard_stop') then
    raise exception 'invalid screening_result: %', p_screening_result;
  end if;
  if p_prior_activity_level is not null
     and p_prior_activity_level not in ('sedentary', 'light', 'active', 'athlete') then
    raise exception 'invalid prior_activity_level: %', p_prior_activity_level;
  end if;

  insert into public.pregnancy_screening (
    user_id,
    gestational_week_at_entry,
    prior_activity_level,
    contraindications,
    screening_result,
    hard_stop
  ) values (
    p_user_id,
    p_gestational_week,
    p_prior_activity_level,
    coalesce(p_answers, '{}'::jsonb),
    p_screening_result,
    p_hard_stop
  );

  -- training_mode is which CLOCK she is on; screening_result is whether we
  -- PRESCRIBE. Different questions — deliberately not coupled. She is pregnant
  -- regardless of the verdict, so a hard_stop still flips the mode.
  update public.user_profiles
     set training_mode       = 'pregnancy',
         stage_anchor_date   = p_stage_anchor_date,
         provider_cleared    = p_provider_cleared,
         provider_cleared_at = p_provider_cleared_at
   where user_id = p_user_id;

  -- CRITICAL: a zero-row UPDATE does NOT raise in plpgsql. Without this guard
  -- the screening row would insert, the profile would silently stay on 'cycle',
  -- and we'd get the half-configured state the transaction exists to prevent.
  if not found then
    raise exception 'no user_profiles row for user_id %', p_user_id;
  end if;
end;
$$;

-- Server-only. No client (anon/authenticated) may call this directly.
revoke execute on function public.apply_pregnancy_screening(
  uuid, integer, jsonb, text, boolean, date, boolean, timestamptz, text
) from public, anon, authenticated;

grant execute on function public.apply_pregnancy_screening(
  uuid, integer, jsonb, text, boolean, date, boolean, timestamptz, text
) to service_role;

comment on function public.apply_pregnancy_screening(
  uuid, integer, jsonb, text, boolean, date, boolean, timestamptz, text
) is
  'Atomically records a pregnancy screening row (incl. prior_activity_level) and '
  'flips user_profiles into pregnancy mode. Verdict computed in TypeScript and '
  'passed in; this function provides atomicity + a NOT FOUND guard, not safety logic.';
