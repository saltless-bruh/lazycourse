import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Every test's temp folder goes under one folder per run, removed at the end (test/global-tmp.ts).
    globalSetup: ["test/global-tmp.ts"],
  },
});
