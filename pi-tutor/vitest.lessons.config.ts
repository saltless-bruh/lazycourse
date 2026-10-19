import { defineConfig } from "vitest/config";

// Vendored lesson content runs every exemplar and stub with the real toolchains: `npm run lessons`, never in `npm test`.
export default defineConfig({ test: { include: ["test/**/*.lessons.ts"], testTimeout: 180_000 } });
