import { describe, it, expect } from 'vitest';

// Trivial test proving the vitest harness runs. Real coverage lives in the
// colocated lib/stages/*.test.ts files.
describe('harness', () => {
  it('runs', () => {
    expect(1 + 1).toBe(2);
  });
});
