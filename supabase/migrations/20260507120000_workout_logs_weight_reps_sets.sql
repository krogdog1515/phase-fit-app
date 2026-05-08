-- Progressive overload: one row per set with numeric load and volume.
-- Run against your Supabase project if these columns are missing.

alter table public.workout_logs
  add column if not exists weight double precision;

alter table public.workout_logs
  add column if not exists reps integer;

alter table public.workout_logs
  add column if not exists set_number integer;

comment on column public.workout_logs.weight is 'Load used for this set (same unit as UI, e.g. lb)';
comment on column public.workout_logs.reps is 'Reps completed for this set';
comment on column public.workout_logs.set_number is '1-based set index within the movement';
