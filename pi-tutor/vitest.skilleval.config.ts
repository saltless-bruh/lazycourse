import { defineConfig } from "vitest/config";

// skill-creator test runs for the pack skills: real model calls, run with `npm run skill-evals`,
// never in `npm test`. See golden/skills.skilleval.ts for the environment variables.
export default defineConfig({ test: { include: ["golden/**/*.skilleval.ts"], testTimeout: 6 * 60 * 60 * 1000 } });
