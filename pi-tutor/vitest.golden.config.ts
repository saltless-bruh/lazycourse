import { defineConfig } from "vitest/config";

// Golden transcripts call a real model: run with `npm run golden`, never in `npm test`.
export default defineConfig({ test: { include: ["golden/**/*.golden.ts"], testTimeout: 600_000, fileParallelism: false } });
