-- Widen the movements equipment vocabulary for the gym-equipment library
-- expansion (34 -> 50 movements).
--
-- Adds 'cable', 'machine' (used by the 16 new movements) and 'bike' (used by
-- stationary_bike, which was dishonestly 'none'). Replaces the vocab CHECK from
-- 20260805130000. Keeps the `<@` containment form, so an empty (bodyweight)
-- array still passes. Apply BEFORE the v4 seed — the seed carries the new values
-- the old constraint would reject.

alter table public.movements
  drop constraint if exists movements_equipment_vocab_check;

alter table public.movements
  add constraint movements_equipment_vocab_check
  check (
    equipment <@ array['chair', 'wall', 'band', 'dumbbell', 'bench', 'cable', 'machine', 'bike']::text[]
  );
