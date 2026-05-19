-- Modality-aware sessions (cardio / mobility) store time-based flow blocks.
alter table public.workouts
  add column if not exists flow jsonb;

comment on column public.workouts.flow is 'Time-based blocks for cardio/mobility sessions; strength sessions use structure';
