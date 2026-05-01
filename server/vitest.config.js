import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['**/*.test.js'],
    env: {
      HOVERBOARD_AUTH_DISABLED: 'true',
    },
  },
});
