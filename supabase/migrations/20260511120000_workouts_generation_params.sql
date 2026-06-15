-- Snapshot of inputs used to generate each workout (for regeneration and audit).
alter table public.workouts
  add column if not exists generation_params jsonb;

comment on column public.workouts.generation_params is
  'Generation inputs at create time: phase, energy, duration (minutes), style, notes';

alter table public.workouts
  add constraint workouts_generation_params_shape_check
  check (
    generation_params is null
    or (
      jsonb_typeof(generation_params) = 'object'
      and generation_params ? 'phase'
      and generation_params ? 'energy'
      and generation_params ? 'duration'
      and generation_params ? 'style'
      and jsonb_typeof(generation_params -> 'duration') = 'number'
      and (generation_params ->> 'duration')::integer > 0
    )
  );
