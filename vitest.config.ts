import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Test runner config. Tests are colocated as `*.test.ts` next to the source
// they cover. Explicit imports from "vitest" (globals: false) keep tsc happy
// without polluting the global type space.
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    globals: false,
    include: ["src/**/*.test.ts"],
    // Integration tests that need a live DB/Redis opt in via TEST_INTEGRATION=1.
    // They self-skip otherwise (see each suite) — never silently dropped.
  },
});
