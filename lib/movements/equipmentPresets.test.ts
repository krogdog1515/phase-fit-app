import { describe, it, expect } from "vitest";
import {
  EQUIPMENT_PRESETS,
  EQUIPMENT_PRESET_OPTIONS,
  DEFAULT_EQUIPMENT_PRESET,
  isEquipmentPresetKey,
  resolveEquipmentPreset,
} from "./equipmentPresets";

describe("equipmentPresets", () => {
  it("resolves each preset to its equipment set", () => {
    expect(resolveEquipmentPreset("home_weights")).toEqual([
      "chair",
      "wall",
      "bench",
      "band",
      "dumbbell",
    ]);
    expect(resolveEquipmentPreset("dumbbells_only")).toEqual(["chair", "wall", "dumbbell"]);
    expect(resolveEquipmentPreset("bodyweight")).toEqual(["chair", "wall"]);
  });

  it("includes chair + wall in every preset (universal)", () => {
    EQUIPMENT_PRESET_OPTIONS.forEach((k) => {
      expect(EQUIPMENT_PRESETS[k]).toContain("chair");
      expect(EQUIPMENT_PRESETS[k]).toContain("wall");
    });
  });

  it("does not ship a Full gym preset yet", () => {
    expect(EQUIPMENT_PRESET_OPTIONS).not.toContain("full_gym");
    expect(EQUIPMENT_PRESET_OPTIONS).toHaveLength(3);
  });

  it("defaults to the widest set (home_weights)", () => {
    expect(DEFAULT_EQUIPMENT_PRESET).toBe("home_weights");
  });

  it("guards unknown keys", () => {
    EQUIPMENT_PRESET_OPTIONS.forEach((k) => expect(isEquipmentPresetKey(k)).toBe(true));
    expect(isEquipmentPresetKey("full_gym")).toBe(false);
    expect(isEquipmentPresetKey("")).toBe(false);
    expect(isEquipmentPresetKey(undefined)).toBe(false);
  });

  it("resolveEquipmentPreset returns a fresh array (no shared mutation)", () => {
    const a = resolveEquipmentPreset("bodyweight");
    a.push("dumbbell");
    expect(EQUIPMENT_PRESETS.bodyweight).toEqual(["chair", "wall"]);
  });
});
