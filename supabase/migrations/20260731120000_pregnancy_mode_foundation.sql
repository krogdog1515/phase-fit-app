-- Pregnancy mode — deterministic foundation.
--
-- Adds the gating column + provider fields to user_profiles and creates the
-- three supporting tables (pregnancy_screening, daily_checkins, movements)
-- with RLS. No UI, no AI, no route changes.
--
-- IMPORTANT: the existing `user_profiles.life_stage` column is intentionally
-- left completely untouched. It carries free-form onboarding signal
-- (contraception / cycle type) that workout generation already consumes;
-- collapsing it into the pregnancy enum would destroy an existing input.
-- `training_mode` is a NEW, separate column that names what it actually gates:
-- which clock the engine runs on. It is NOT derived from life_stage — everyone
-- defaults to 'cycle' and the pregnancy onboarding branch sets it explicitly
-- only after screening + a due date exist.

-- 1a. user_profiles: training mode + provider clearance -----------------------

alter table public.user_profiles
  add column training_mode text not null default 'cycle'
    check (training_mode in ('cycle', 'pregnancy', 'postpartum')),
  add column stage_anchor_date date,
  add column provider_cleared boolean not null default false,
  add column provider_cleared_at timestamptz;

comment on column public.user_profiles.training_mode is
  'Which clock the engine runs on. Defaults to cycle; set to pregnancy only after screening + due date. Separate from life_stage (onboarding cycle-type signal).';
comment on column public.user_profiles.stage_anchor_date is
  'Estimated due date when training_mode = pregnancy. Null otherwise.';

-- 1b. pregnancy_screening -----------------------------------------------------

create table public.pregnancy_screening (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  gestational_week_at_entry integer not null,
  first_pregnancy boolean,
  prior_activity_level text
    check (prior_activity_level in ('sedentary', 'light', 'active', 'athlete')),
  contraindications jsonb not null default '{}'::jsonb,
  hard_stop boolean not null default false,
  created_at timestamptz not null default now()
);

create index pregnancy_screening_user_created_idx
  on public.pregnancy_screening (user_id, created_at desc);

-- 1c. daily_checkins ----------------------------------------------------------

create table public.daily_checkins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  date date not null,
  red_flags jsonb not null default '{}'::jsonb,
  energy integer check (energy between 1 and 5),
  sleep_quality integer check (sleep_quality between 1 and 5),
  notes text,
  created_at timestamptz not null default now(),
  unique (user_id, date)
);

-- 1d. movements (reference data) ----------------------------------------------

create table public.movements (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  category text not null
    check (category in ('strength', 'mobility', 'breathing', 'walking',
                        'pelvic_floor', 'recovery', 'education')),
  focus_tags text[] not null default '{}',
  equipment text[] not null default '{}',
  min_stage text not null
    constraint movements_min_stage_check
    check (min_stage in ('t1_early', 't1_late', 't2_golden', 't2_late',
                        't3_early', 't3_late')),
  max_stage text not null
    constraint movements_max_stage_check
    check (max_stage in ('t1_early', 't1_late', 't2_golden', 't2_late',
                        't3_early', 't3_late')),
  exclusion_flags text[] not null default '{}',
  cues text,
  modifications text,
  source_ref text,
  benefit text,
  media_url text,
  created_at timestamptz not null default now()
);

create index movements_category_idx on public.movements (category);
create index movements_stage_idx on public.movements (min_stage, max_stage);

comment on column public.movements.benefit is
  'Vetted plain-language reason this movement matters. The LLM layer READS this to explain a recommendation; it must never generate its own rationale for a movement.';
comment on column public.movements.media_url is
  'Curated demonstration link. Never model-generated.';

-- RLS -------------------------------------------------------------------------
-- pregnancy_screening: user-scoped SELECT only. NO client write policies —
--   `hard_stop` is a deterministic contraindication gate and must never be
--   client-editable via PostgREST. Screening rows are written by an API route
--   using the service role (which bypasses RLS), append-only / latest-row-wins.
-- daily_checkins: user-scoped select/insert/update (self-reported; upsert path).
-- movements: authenticated read-only reference data (no client write).

alter table public.pregnancy_screening enable row level security;

create policy "Users read own screening"
  on public.pregnancy_screening
  for select
  to authenticated
  using (auth.uid() = user_id);

alter table public.daily_checkins enable row level security;

create policy "Users read own checkins"
  on public.daily_checkins
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Users insert own checkins"
  on public.daily_checkins
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Users update own checkins"
  on public.daily_checkins
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

alter table public.movements enable row level security;

create policy "Authenticated read movements"
  on public.movements
  for select
  to authenticated
  using (true);

comment on table public.pregnancy_screening is 'One-time-ish screening intake per pregnancy; hard_stop gates generation.';
comment on table public.daily_checkins is 'Daily red-flag + wellbeing check-in, one row per user per date.';
comment on table public.movements is 'Vetted movement library (reference data). Authenticated read-only; no client write.';
