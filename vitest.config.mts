import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

// Minimal harness: pure TS units run in a Node environment. No coverage
// thresholds, no CI wiring — see AGENTS.md scope for tonight.
export default defineConfig({
  // Mirror the tsconfig `@/*` -> repo root alias so route/component modules that
  // import via `@/...` (e.g. the pregnancy screening route) are testable.
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('.', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['**/*.test.ts'],
  },
});
