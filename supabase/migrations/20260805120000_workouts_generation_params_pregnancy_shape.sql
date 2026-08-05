-- Allow a pregnancy-shaped generation_params on workouts.
--
-- WHY: workouts_generation_params_shape_check (20260511120000) requires the
-- cycle shape (phase + energy + duration + style). Pregnancy sessions are
-- generated from stage + equipment only, so they carry a different, honest
-- shape. Rather than write fake cycle values (energy:'n/a', style:'none') — which
-- would read as real to anyone querying later and defeat the point of the
-- constraint — this branches the constraint on an explicit mode marker.
--
-- The pregnancy shape records the inputs that actually determined the session
-- (stage_key + gestational_week) so a given workout stays reconstructable.
--
-- No data migration: every existing row is cycle-shaped and satisfies the cycle
-- branch unchanged. A pregnancy row missing stage_key/gestational_week fails
-- both branches — the DB fails closed too.

alter table public.workouts
  drop constraint if exists workouts_generation_params_shape_check;

alter table public.workouts
  add constraint workouts_generation_params_shape_check
  check (
    generation_params is null
    or (
      jsonb_typeof(generation_params) = 'object'
      and generation_params ? 'duration'
      and jsonb_typeof(generation_params -> 'duration') = 'number'
      and (generation_params ->> 'duration')::integer > 0
      and (
        -- cycle shape (unchanged): phase + energy + style
        (
          generation_params ? 'phase'
          and generation_params ? 'energy'
          and generation_params ? 'style'
        )
        or
        -- pregnancy shape: explicit marker + the stage inputs that drove it
        (
          generation_params ->> 'mode' = 'pregnancy'
          and generation_params ? 'stage_key'
          and generation_params ? 'gestational_week'
          and jsonb_typeof(generation_params -> 'gestational_week') = 'number'
        )
      )
    )
  );

comment on column public.workouts.generation_params is
  'Generation inputs at create time. Cycle shape: phase, energy, duration '
  '(minutes), style, notes. Pregnancy shape: mode=''pregnancy'', duration, '
  'stage_key, gestational_week, equipment, pool_slugs, source.';
