-- Post-workout reflection notes for adaptive coaching memory.
alter table public.workouts
  add column if not exists user_notes text;

comment on column public.workouts.user_notes is 'Optional post-session reflection; used in future workout generation';
