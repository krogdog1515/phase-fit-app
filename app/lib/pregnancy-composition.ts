import type { Movement, MovementPattern, MovementTier } from "@/lib/movements/types";
import type { IntensityCap } from "@/lib/stages/pregnancyStages";
import type { FocusKey } from "@/lib/movements/focusGroups";

/**
 * Deterministic pregnancy-session composition.
 *
 * ARCHITECTURE BOUNDARY
 * ---------------------
 * The model is a selector + coach, never the author of session STRUCTURE.
 * Structure — how many strength movements, of which tier, which patterns, which
 * equipment, and where the warm-up / cool-down sit — is decided here, in vetted,
 * testable code, then enforced by repair. The prompt states these rules so the
 * model usually complies; this module verifies and, on violation, SWAPS the
 * offending movement for the best in-pool alternative rather than discarding the
 * whole session. Full fallback (buildCannedSession) is the last resort, only
 * when repair cannot produce any strength at all.
 *
 * None of this makes a safety decision: stage, equipment, screening and gating
 * all happened upstream, and the candidate pool is already vetted. We only shape
 * and balance a session within that pool.
 */

/** Pattern balance targets by focus (Change E). Other focuses have no requirement. */
function requiredPatternsFor(focusKey: FocusKey): MovementPattern[] {
  if (focusKey === "upper_body") return ["push", "pull"];
  if (focusKey === "lower_body") return ["squat", "hinge"];
  return [];
}

const PATTERNS: readonly MovementPattern[] = [
  "push",
  "pull",
  "squat",
  "hinge",
  "carry",
  "core",
  "isolation",
  "none",
];

/** Read a movement's pattern defensively (unknown/missing -> 'none'). */
export function patternOf(m: Movement): MovementPattern {
  return PATTERNS.includes(m.movement_pattern) ? m.movement_pattern : "none";
}

/** Read a movement's tier defensively (unknown/missing -> 'none'). */
export function tierOf(m: Movement): MovementTier {
  return m.movement_tier === "compound" || m.movement_tier === "accessory"
    ? m.movement_tier
    : "none";
}

/** Two strength movements "overlap" on equipment when they share ANY item. */
function equipmentOverlap(a: Movement, b: Movement): boolean {
  return a.equipment.some((e) => b.equipment.includes(e));
}

/** Cable/machine are the most-capable (gym) equipment — the Change D target. */
function usesUtilityEquipment(m: Movement): boolean {
  return m.equipment.includes("cable") || m.equipment.includes("machine");
}

/**
 * Equipment that carries trackable, progressable load. Mirrors
 * pregnancy-prompts' LOADED_EQUIPMENT (duplicated here to avoid a module cycle:
 * pregnancy-prompts imports this file, not the other way around).
 */
const LOADED_EQUIPMENT = new Set(["dumbbell", "band", "cable", "machine"]);
function isLoadedEquipment(m: Movement): boolean {
  return m.equipment.some((e) => LOADED_EQUIPMENT.has(e));
}

/**
 * Capability score for the "prefer the most-capable equipment available" rule
 * (Change D, generalized). Higher = more progressable load. Used only to break
 * ties in selection, never as a gate.
 */
function equipmentCapability(m: Movement): number {
  const e = m.equipment;
  if (e.includes("cable") || e.includes("machine")) return 4;
  if (e.includes("dumbbell")) return 3;
  if (e.includes("band")) return 2;
  if (e.includes("bench")) return 1;
  return 0;
}

/** Self-reported activity collapses to three slot tiers (Change B). */
export type ActivityTier = "high" | "mid" | "low";

/**
 * Map the four screening levels onto the three Change-B rows. The brief's table
 * labels (active / somewhat_active / inactive) are indicative; the real enum is
 * sedentary | light | active | athlete (see PriorActivityLevel). athlete+active
 * take the top row, light the middle, sedentary (and any unknown) the bottom —
 * the conservative choice when we can't place a value.
 */
export function activityTier(level: string | null | undefined): ActivityTier {
  if (level === "athlete" || level === "active") return "high";
  if (level === "light") return "mid";
  return "low";
}

export type DurationBucket = 20 | 40 | 60;

/** Session length collapses to the three Change-B columns. */
export function durationBucket(minutes: number): DurationBucket {
  if (minutes <= 20) return 20;
  if (minutes <= 40) return 40;
  return 60;
}

/** [compounds, accessories] per activity tier × duration (Change B). */
const STRENGTH_SLOT_TABLE: Record<
  ActivityTier,
  Record<DurationBucket, [number, number]>
> = {
  high: { 20: [1, 1], 40: [2, 2], 60: [3, 2] },
  mid: { 20: [1, 1], 40: [2, 2], 60: [2, 3] },
  low: { 20: [1, 1], 40: [1, 2], 60: [1, 3] },
};

export type SlotPlan = {
  /** Compound strength slots after clamping to pool depth. */
  compounds: number;
  /** Accessory strength slots after floor make-up + depth clamp. */
  accessories: number;
  /** compounds + accessories. */
  totalStrength: number;
  /** 1 pelvic-floor-OR-breathing slot (0 only if the pool has neither). */
  pelvicOrBreathing: number;
  /** 1 mobility slot at 40 and 60 minutes (0 at 20, or if the pool has none). */
  mobility: number;
  /** Always 1 — server-placed, not model-selected. */
  warmup: number;
  /** Always 1 — server-placed, not model-selected. */
  cooldown: number;
  /** Compound target straight from the table (pre-clamp), for degrade detection. */
  desiredCompounds: number;
  /** Total strength target after the floor rule (pre-clamp). */
  desiredTotal: number;
  /** The band's per-session strength floor (strengthMovementTarget[0]). */
  floor: number;
  /** The band's per-session strength ceiling (strengthMovementTarget[1]). */
  ceiling: number;
  /** True when the floor raised the total above the table (clamped up). */
  floorApplied: boolean;
  /** True when the band ceiling lowered the total below the table (clamped down). */
  ceilingApplied: boolean;
  /** True when pool depth forced fewer/forced-identical strength than desired. */
  tierDegraded: boolean;
  /** Why we degraded, for generation_params. */
  degradeReason: string | null;
  /** One-line user-visible notice (floor make-up or degradation), or null. */
  notice: string | null;
};

/**
 * Plan the typed slot counts for a session. Pure. Clamps every desired count to
 * what the pool actually offers and degrades (never fails) when it can't.
 */
export function planPregnancySession(opts: {
  cap: IntensityCap;
  minutes: number;
  priorActivityLevel: string | null | undefined;
  gestationalWeek: number;
  focusKey: FocusKey;
  pool: Movement[];
}): SlotPlan {
  const { cap, minutes, priorActivityLevel, gestationalWeek, focusKey, pool } = opts;

  const tier = activityTier(priorActivityLevel);
  const bucket = durationBucket(minutes);
  const [baseC, baseA] = STRENGTH_SLOT_TABLE[tier][bucket];
  const [floor, ceiling] = cap.strengthMovementTarget;
  const baseTotal = baseC + baseA;

  // Floor/ceiling interaction: strengthMovementTarget is [min, max] and BOTH
  // bind. Clamp the table total into that band. Clamping UP (below the floor)
  // makes up the difference with accessory slots; clamping DOWN (over the band
  // ceiling — e.g. an active user at 60 min in late pregnancy) drops accessory
  // slots first, then compounds, so the ceiling holds where it matters most.
  const desiredTotal = Math.min(Math.max(baseTotal, floor), ceiling);
  let desiredCompounds: number;
  let desiredAccessories: number;
  if (desiredTotal >= baseTotal) {
    desiredCompounds = baseC;
    desiredAccessories = desiredTotal - baseC;
  } else {
    const remove = baseTotal - desiredTotal;
    const dropAccessories = Math.min(remove, baseA);
    desiredAccessories = baseA - dropAccessories;
    desiredCompounds = baseC - (remove - dropAccessories);
  }
  const floorApplied = desiredTotal > baseTotal;
  const ceilingApplied = desiredTotal < baseTotal;

  // Pool depth. A strength row with an unexpected tier (should never happen —
  // every strength row is backfilled compound|accessory) is counted as an
  // accessory rather than dropped, so a data glitch degrades gracefully.
  const strength = pool.filter((m) => m.category === "strength");
  const availCompounds = strength.filter((m) => tierOf(m) === "compound").length;
  const availAccessories = strength.filter((m) => tierOf(m) !== "compound").length;
  const availTotal = strength.length;

  // Fill compounds first, then accessories, then backfill the total from whatever
  // tier still has depth — never inventing beyond availTotal.
  let compounds = Math.min(desiredCompounds, availCompounds);
  let accessories = Math.min(desiredAccessories, availAccessories);
  const targetTotal = Math.min(desiredTotal, availTotal);

  if (compounds + accessories < targetTotal) {
    accessories += Math.min(
      availAccessories - accessories,
      targetTotal - (compounds + accessories),
    );
  }
  if (compounds + accessories < targetTotal) {
    compounds += Math.min(
      availCompounds - compounds,
      targetTotal - (compounds + accessories),
    );
  }
  const totalStrength = compounds + accessories;

  // Support slots, clamped to availability.
  const hasMobility = pool.some((m) => m.category === "mobility");
  const hasPelvicOrBreathing = pool.some(
    (m) => m.category === "pelvic_floor" || m.category === "breathing",
  );
  const mobility = bucket === 20 ? 0 : hasMobility ? 1 : 0;
  const pelvicOrBreathing = hasPelvicOrBreathing ? 1 : 0;

  // Degradation: short of the desired tiers/total, OR zero slack (the selection
  // is forced and will repeat identically — e.g. t3_late lower body). We record
  // the forced case so we can measure it even when counts are technically met.
  const shortOfDesired =
    compounds < desiredCompounds || totalStrength < desiredTotal;
  const zeroSlack = availTotal > 0 && availTotal === totalStrength;
  const tierDegraded = shortOfDesired || zeroSlack;

  let degradeReason: string | null = null;
  if (shortOfDesired) {
    degradeReason =
      `pool depth: wanted ${desiredCompounds}C+${desiredAccessories}A, ` +
      `pool offers ${availCompounds}C+${availAccessories}A (filled ${compounds}C+${accessories}A)`;
  } else if (zeroSlack) {
    degradeReason =
      `forced selection: ${availTotal} strength movements for ${totalStrength} slots (no slack)`;
  }

  // User-visible notice (single notice path). A pool-depth degrade is the most
  // important thing to say; otherwise surface the floor make-up or the ceiling
  // clamp so a lengthened or shortened session reads as explained.
  let notice: string | null = null;
  if (shortOfDesired) {
    notice =
      `Your library has limited ${FOCUS_NOUN[focusKey]} strength movements at this stage, ` +
      `so this session is shorter than usual and may repeat what's available.`;
  } else if (floorApplied) {
    notice =
      `Week ${gestationalWeek} has a ${floor}-movement strength minimum, ` +
      `so this session runs a little longer than ${minutes} minutes.`;
  } else if (ceilingApplied) {
    notice =
      `Week ${gestationalWeek} caps strength work at ${ceiling} movements this far along, ` +
      `so this session is a little shorter than a full ${minutes} minutes.`;
  }

  return {
    compounds,
    accessories,
    totalStrength,
    pelvicOrBreathing,
    mobility,
    warmup: 1,
    cooldown: 1,
    desiredCompounds,
    desiredTotal,
    floor,
    ceiling,
    floorApplied,
    ceilingApplied,
    tierDegraded,
    degradeReason,
    notice,
  };
}

/** Plain-language noun per focus for the degrade notice. */
const FOCUS_NOUN: Record<FocusKey, string> = {
  full_body: "full-body",
  upper_body: "upper-body",
  lower_body: "lower-body",
  core_pelvic_floor: "core",
  mobility_recovery: "mobility",
  cardio: "cardio",
};

export type ComposedSession = {
  /** Ordered NON-bookend movements (warm-up / cool-down are added by the route). */
  movements: Movement[];
  /** Human-readable repair log for generation_params. */
  repairs: string[];
  /** True when the final session fell short of the plan's strength targets. */
  tierDegraded: boolean;
  degradeReason: string | null;
};

type Pick = { m: Movement; reason: string };

/**
 * Build the final (non-bookend) movement list from the model's picks + the plan,
 * repairing toward the structural rules (Changes B–E). Pure and deterministic.
 *
 * The model's selections are honored where they are valid; every substitution or
 * addition is logged in `repairs`. The result satisfies, as far as pool depth
 * allows: typed compound/accessory counts, the redundancy rule (no shared
 * pattern+equipment), equipment utilization (cable/machine when available), and
 * pattern balance (push/pull, squat/hinge).
 */
export function composePregnancySession(
  modelSlugs: string[],
  pool: Movement[],
  plan: SlotPlan,
  ctx: { focusKey: FocusKey; equipmentList: string[]; loadedFloor?: number },
): ComposedSession {
  const poolBySlug = new Map(pool.map((m) => [m.slug, m]));
  const modelSet = new Set(modelSlugs.filter((s) => poolBySlug.has(s)));

  const strengthPool = pool.filter((m) => m.category === "strength");
  const compoundsPool = strengthPool.filter((m) => tierOf(m) === "compound");
  // Non-compound strength fills accessory slots (an unexpected 'none' tier on a
  // strength row is treated as accessory, never dropped).
  const accessoriesPool = strengthPool.filter((m) => tierOf(m) !== "compound");

  const requiredPatterns = requiredPatternsFor(ctx.focusKey);
  const utilAvailable =
    ctx.equipmentList.includes("cable") || ctx.equipmentList.includes("machine");
  const utilTarget = utilAvailable
    ? Math.min(
        Math.ceil(plan.totalStrength / 2),
        strengthPool.filter(usesUtilityEquipment).length,
      )
    : 0;

  const selected: Pick[] = [];
  const repairs: string[] = [];

  const isSelected = (slug: string) => selected.some((s) => s.m.slug === slug);
  const coveredPatterns = () => new Set(selected.map((s) => patternOf(s.m)));
  const utilCount = () => selected.filter((s) => usesUtilityEquipment(s.m)).length;

  // Redundancy + pattern-cap(2) gate.
  function canAdd(m: Movement): boolean {
    const p = patternOf(m);
    const same = selected.filter((s) => patternOf(s.m) === p);
    if (same.length >= 2) return false; // cap any one pattern at 2
    return !same.some((s) => equipmentOverlap(s.m, m)); // no pattern+equipment dup
  }

  function scoreCandidate(m: Movement, needUtil: boolean): number {
    let score = 0;
    const p = patternOf(m);
    if (requiredPatterns.includes(p) && !coveredPatterns().has(p)) score += 1000;
    if (needUtil && usesUtilityEquipment(m)) score += 500;
    if (modelSet.has(m.slug)) score += 100;
    score += equipmentCapability(m) * 5;
    return score;
  }

  function fillFrom(candidates: Movement[], count: number, slotLabel: string) {
    for (let i = 0; i < count; i++) {
      const needUtil = utilCount() < utilTarget;
      const eligible = candidates.filter((m) => !isSelected(m.slug) && canAdd(m));
      if (eligible.length === 0) break; // degrade: no legal pick left
      eligible.sort((a, b) => {
        const d = scoreCandidate(b, needUtil) - scoreCandidate(a, needUtil);
        return d !== 0 ? d : a.slug.localeCompare(b.slug);
      });
      const pick = eligible[0];
      const p = patternOf(pick);
      let reason = slotLabel;
      if (requiredPatterns.includes(p) && !coveredPatterns().has(p)) {
        reason = `pattern balance (${p})`;
      } else if (needUtil && usesUtilityEquipment(pick)) {
        reason = "equipment utilization";
      }
      selected.push({ m: pick, reason });
    }
  }

  fillFrom(compoundsPool, plan.compounds, "compound slot");
  fillFrom(accessoriesPool, plan.accessories, "accessory slot");

  /**
   * Repair toward an equipment floor: while fewer than `target` selected
   * movements satisfy `pred`, swap a non-satisfying pick (one not uniquely
   * carrying a required pattern) for the best in-pool candidate that does. Logs
   * each swap. Degrades silently (stops) when no legal swap exists.
   */
  function ensureFloor(
    pred: (m: Movement) => boolean,
    target: number,
    reasonLabel: string,
  ) {
    const count = () => selected.filter((s) => pred(s.m)).length;
    let guard = selected.length + strengthPool.length;
    while (count() < target && guard-- > 0) {
      const swapIn = strengthPool
        .filter((m) => pred(m) && !isSelected(m.slug))
        .sort(
          (a, b) =>
            equipmentCapability(b) - equipmentCapability(a) ||
            a.slug.localeCompare(b.slug),
        )[0];
      if (!swapIn) break;

      const dropIdx = selected.findIndex((s, idx) => {
        if (pred(s.m)) return false; // already satisfies — don't drop it
        const p = patternOf(s.m);
        if (requiredPatterns.includes(p)) {
          const othersCover = selected.some(
            (o, j) => j !== idx && patternOf(o.m) === p,
          );
          if (!othersCover) return false; // uniquely covers a required pattern
        }
        return true;
      });
      if (dropIdx === -1) break;

      const dropped = selected[dropIdx];
      selected.splice(dropIdx, 1);
      if (!canAdd(swapIn)) {
        selected.splice(dropIdx, 0, dropped); // can't legally place the swap-in
        break;
      }
      selected.push({ m: swapIn, reason: reasonLabel });
      repairs.push(`swapped ${dropped.m.slug} → ${swapIn.slug} for ${reasonLabel}`);
    }
  }

  // Change D (concrete): cable/machine for at least half the strength slots.
  if (utilAvailable) ensureFloor(usesUtilityEquipment, utilTarget, "equipment utilization");
  // Loaded-strength floor (per activity level): guarantee trackable load appears.
  const loadedTarget = Math.min(
    ctx.loadedFloor ?? 0,
    strengthPool.filter(isLoadedEquipment).length,
  );
  if (loadedTarget > 0) ensureFloor(isLoadedEquipment, loadedTarget, "loaded strength floor");

  // Log additions (server chose a movement the model did not) and model picks we
  // could not keep, so the DB shows how often the model complied on its own.
  for (const s of selected) {
    if (!modelSet.has(s.m.slug) && !repairs.some((r) => r.includes(`→ ${s.m.slug} `))) {
      repairs.push(`added ${s.m.slug} (${s.reason})`);
    }
  }
  const finalSlugs = new Set(selected.map((s) => s.m.slug));
  for (const slug of modelSet) {
    const m = poolBySlug.get(slug);
    if (m && m.category === "strength" && !finalSlugs.has(slug)) {
      if (!repairs.some((r) => r.includes(`${slug} →`))) {
        repairs.push(`dropped ${slug} (redundant or over the pattern cap)`);
      }
    }
  }

  // Support slots. Prefer a model-chosen movement, else the deepest pool option.
  let supportBreathing: Movement | null = null;
  let supportPelvic: Movement | null = null;
  if (plan.pelvicOrBreathing > 0) {
    const chosen =
      pickSupport(pool, modelSet, "pelvic_floor") ??
      pickSupport(pool, modelSet, "breathing");
    if (chosen) {
      if (chosen.category === "breathing") supportBreathing = chosen;
      else supportPelvic = chosen;
    }
  }
  let supportMobility: Movement | null = null;
  if (plan.mobility > 0) {
    supportMobility = pickSupport(pool, modelSet, "mobility");
  }

  // Order: breathing (early) → mobility → compounds → accessories → pelvic floor
  // (down-training, late). Strength keeps compounds before accessories.
  const compounds = selected.filter((s) => tierOf(s.m) === "compound").map((s) => s.m);
  const accessories = selected.filter((s) => tierOf(s.m) !== "compound").map((s) => s.m);
  const ordered: Movement[] = [
    ...(supportBreathing ? [supportBreathing] : []),
    ...(supportMobility ? [supportMobility] : []),
    ...compounds,
    ...accessories,
    ...(supportPelvic ? [supportPelvic] : []),
  ];

  const tierDegraded = plan.tierDegraded || selected.length < plan.totalStrength;
  const degradeReason =
    selected.length < plan.totalStrength && !plan.degradeReason
      ? `filled ${selected.length} of ${plan.totalStrength} strength slots from the pool`
      : plan.degradeReason;

  return { movements: ordered, repairs, tierDegraded, degradeReason };
}

/** Pick one support movement of a category, preferring a model-chosen slug. */
function pickSupport(
  pool: Movement[],
  modelSet: Set<string>,
  category: Movement["category"],
): Movement | null {
  const options = pool.filter((m) => m.category === category);
  if (options.length === 0) return null;
  const sorted = [...options].sort((a, b) => {
    const am = modelSet.has(a.slug) ? 0 : 1;
    const bm = modelSet.has(b.slug) ? 0 : 1;
    return am !== bm ? am - bm : a.slug.localeCompare(b.slug);
  });
  return sorted[0];
}
