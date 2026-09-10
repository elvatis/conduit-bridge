import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts', 'src/**/*.test.ts'],
    globals: false,
    // Runs before every file: without a vault key the platform store asks the
    // host for a secret, which a CI runner cannot answer.
    setupFiles: ['./test/setup-vault-key.ts'],
  },
});
