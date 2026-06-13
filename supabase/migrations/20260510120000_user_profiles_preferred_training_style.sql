-- Preferred training style as its own profile field (separate from environment).
alter table public.user_profiles
  add column if not exists preferred_training_style text;

comment on column public.user_profiles.preferred_training_style is
  'Onboarding: Strength training, Muscle building, Running, etc.';

comment on column public.user_profiles.training_environment is
  'Onboarding: Commercial gym, Home gym, Limited equipment, or Bodyweight only';
