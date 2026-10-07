import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    /* Optics tests: displacement is pure math (node is fine), but registry +
     * preference parity touch document/localStorage → jsdom. */
    environment: 'jsdom',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    setupFiles: ['src/design/optics/__tests__/setup.ts'],
  },
});
