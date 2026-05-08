-- Canonical workout.difficulty values: too_easy | just_right | too_hard
-- Normalizes common legacy spellings (e.g. "Too Easy", "just right").

update public.workouts
set difficulty = 'too_easy'
where difficulty is not null
  and replace(replace(lower(trim(difficulty::text)), '-', ' '), ' ', '_')
    in ('too_easy', 'tooeasy');

update public.workouts
set difficulty = 'just_right'
where difficulty is not null
  and replace(replace(lower(trim(difficulty::text)), '-', ' '), ' ', '_')
    in ('just_right', 'justright');

update public.workouts
set difficulty = 'too_hard'
where difficulty is not null
  and replace(replace(lower(trim(difficulty::text)), '-', ' '), ' ', '_')
    in ('too_hard', 'toohard');
