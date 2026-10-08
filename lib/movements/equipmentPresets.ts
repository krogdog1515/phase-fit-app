/**
 * Equipment presets for the pregnancy generate form. A preset resolves to a
 * structured equipment array (same vocabulary as filterByEquipment / the
 * movements equipment_vocab CHECK), so the loaded-strength floor — which counts
 * movements whose equipment is trackable/progressable load (dumbbell, band,
 * cable, machine) — stays derivable. Do NOT make equipment free text; the floor
 * is what stopped the mobility-flow problem.
 *
 * chair and wall are in EVERY preset (including Bodyweight): they're universal
 * and excluding them silently drops the box squat and wall push-up.
 */

export type EquipmentPresetKey =
  | "full_gym"
  | "home_weights"
  | "dumbbells_only"
  | "bodyweight";

export const EQUIPMENT_PRESET_LABELS: Record<EquipmentPresetKey, string> = {
  full_gym: "Full gym",
  home_weights: "Home with weights",
  dumbbells_only: "Dumbbells only",
  bodyweight: "Bodyweight",
};

/** In display order (Full gym first). */
export const EQUIPMENT_PRESET_OPTIONS: EquipmentPresetKey[] = [
  "full_gym",
  "home_weights",
  "dumbbells_only",
  "bodyweight",
];

export const EQUIPMENT_PRESETS: Record<EquipmentPresetKey, string[]> = {
  full_gym: ["chair", "wall", "band", "dumbbell", "bench", "cable", "machine", "bike"],
  home_weights: ["chair", "wall", "bench", "band", "dumbbell"],
  dumbbells_only: ["chair", "wall", "dumbbell"],
  bodyweight: ["chair", "wall"],
};

/** Default to the widest set she's likely to have (Alex has gym access). */
export const DEFAULT_EQUIPMENT_PRESET: EquipmentPresetKey = "home_weights";

export function isEquipmentPresetKey(value: unknown): value is EquipmentPresetKey {
  return typeof value === "string" && value in EQUIPMENT_PRESETS;
}

export function resolveEquipmentPreset(key: EquipmentPresetKey): string[] {
  return [...EQUIPMENT_PRESETS[key]];
}
