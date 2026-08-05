-- Constrain movements.equipment to a known vocabulary.
--
-- WHY: a typo like 'dumbell' at seed time silently produces a movement that
-- matches no equipment filter and never enters any candidate pool — a quiet
-- failure, the worst kind. This makes a bad equipment token fail loudly at
-- insert instead. Same posture as the stage-key CHECKs.
--
-- `<@` ("contained by") requires every element of equipment to be in the
-- vocabulary; the empty (bodyweight) array satisfies it vacuously. Named
-- explicitly so it can be altered as the library grows and new equipment types
-- are added.

alter table public.movements
  add constraint movements_equipment_vocab_check
  check (equipment <@ array['chair', 'wall', 'band', 'dumbbell', 'bench']::text[]);
