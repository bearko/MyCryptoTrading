/// <reference types="vitest/config" />
import { defineConfig } from 'vite';

export default defineConfig({
  // Relative base so the build works from any sub-path (static hosting).
  base: './',
  build: {
    assetsInlineLimit: 0,
  },
  test: {
    testTimeout: 60_000,
    exclude: ['**/node_modules/**', '**/dist/**', 'vendor/**', '.claude/**'],
  },
});
