-- Lightweight contextual activity logged outside the app.
create table public.outside_workouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  activity_type text not null,
  duration_minutes integer not null check (duration_minutes > 0),
  intensity text not null check (intensity in ('light', 'moderate', 'hard')),
  notes text,
  created_at timestamptz not null default now()
);

create index outside_workouts_user_created_idx
  on public.outside_workouts (user_id, created_at desc);

alter table public.outside_workouts enable row level security;

create policy "Users read own outside workouts"
  on public.outside_workouts
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Users insert own outside workouts"
  on public.outside_workouts
  for insert
  to authenticated
  with check (auth.uid() = user_id);

comment on table public.outside_workouts is 'External activity for recovery/load context only';
