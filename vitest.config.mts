import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const root = fileURLToPath(new URL('.', import.meta.url));

// Mirrors the "@/*" path alias of tsconfig.json so route handlers can be imported in tests.
export default defineConfig({
  resolve: {
    alias: [{ find: /^@\//, replacement: root }],
  },
  test: {
    environment: 'node',
    // PGlite boots a WASM Postgres per test file; give slow CI runners room.
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
