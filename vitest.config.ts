import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    exclude: ["node_modules", ".next", "dist"],
    globals: false,
    setupFiles: ["./tests/setup-env.ts"],
    // Integration tests share a single Postgres; running test files in
    // parallel workers leads to purgeAll() in one worker truncating rows
    // mid-test in another. Force serial execution. Unit tests are slow only
    // by a few hundred ms — not worth the parallel speedup over correctness.
    pool: "forks",
    poolOptions: {
      forks: { singleFork: true },
    },
    fileParallelism: false,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
