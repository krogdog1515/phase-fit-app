create table events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  event_name text not null,
  metadata jsonb,
  created_at timestamptz default now() not null
);

alter table events enable row level security;

create policy "Users can insert own events"
  on events for insert
  to authenticated
  with check (auth.uid() = user_id);
