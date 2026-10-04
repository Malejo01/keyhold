import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Same `@/` alias as tsconfig.json, so route handlers under app/api can be imported by tests.
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
  test: { include: ["lib/**/*.test.ts", "app/**/*.test.ts"] },
});
