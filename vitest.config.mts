import { defineConfig } from 'vitest/config';

// Minimal harness: pure TS units run in a Node environment. No coverage
// thresholds, no CI wiring — see AGENTS.md scope for tonight.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['**/*.test.ts'],
  },
});
