import { describe, it, expect } from 'vitest';
import { PREGNANCY_STAGES, getIntensityCap, STAGE_ORDER } from './pregnancyStages';

const LOAD_GUIDANCE = new Set(['maintain', 'reduce_load_increase_reps', 'deload']);

describe('PREGNANCY_STAGES — intensityCap fully populated', () => {
  for (const stage of PREGNANCY_STAGES) {
    it(`${stage.key}: every intensityCap field is populated`, () => {
      const c = stage.intensityCap;
      expect(c).toBeTruthy();

      expect(c.method).toBe('talk_test');

      expect(typeof c.rpeCeiling).toBe('number');
      expect(c.rpeCeiling).toBeGreaterThan(0);
      expect(c.rpeCeiling).toBeLessThanOrEqual(10);

      expect(c.repRange).toHaveLength(2);
      expect(c.repRange[0]).toBeGreaterThan(0);
      expect(c.repRange[1]).toBeGreaterThanOrEqual(c.repRange[0]);

      expect(typeof c.rirFloor).toBe('number');
      expect(c.rirFloor).toBeGreaterThanOrEqual(0);

      expect(c.setsPerMovement).toHaveLength(2);
      expect(c.setsPerMovement[0]).toBeGreaterThan(0);
      expect(c.setsPerMovement[1]).toBeGreaterThanOrEqual(c.setsPerMovement[0]);

      expect(c.strengthMovementTarget).toHaveLength(2);
      expect(c.strengthMovementTarget[0]).toBeGreaterThan(0);
      expect(c.strengthMovementTarget[1]).toBeGreaterThanOrEqual(c.strengthMovementTarget[0]);

      expect(LOAD_GUIDANCE.has(c.loadGuidance)).toBe(true);
      expect(c.weeklyVolumeTargetMin).toBe(150);

      expect(typeof c.coachingRationale).toBe('string');
      expect(c.coachingRationale.trim().length).toBeGreaterThan(0);

      expect(typeof c.sourceRef).toBe('string');
      expect(c.sourceRef.trim().length).toBeGreaterThan(0);
    });
  }

  it('covers all six bands in order', () => {
    expect(PREGNANCY_STAGES.map((s) => s.key)).toEqual([...STAGE_ORDER]);
  });

  it('getIntensityCap returns the band cap for every key', () => {
    for (const stage of PREGNANCY_STAGES) {
      expect(getIntensityCap(stage.key)).toBe(stage.intensityCap);
    }
  });

  it('has no TODO placeholder strings remaining in the data', () => {
    // Serialized values only (comments are not part of the runtime object).
    expect(JSON.stringify(PREGNANCY_STAGES)).not.toContain('TODO');
  });

  it('keeps allowedCategories fail-closed empty (unvetted provider_conversation subset)', () => {
    for (const stage of PREGNANCY_STAGES) {
      expect(stage.allowedCategories).toEqual([]);
    }
  });
});
