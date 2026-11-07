import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir, homedir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { IMPROVE_FALLBACKS, fallbackChecks } from "../extensions/tutor/improve-fallback.js";
import { codeMetrics, improveResult, calledFunctions } from "../extensions/tutor/improve.js";
import { runChecks } from "../extensions/tutor/check-run.js";
import { crossCheckOnReference } from "../extensions/tutor/check-job.js";
import type { SandboxHost } from "../extensions/tutor/exam/sandbox.js";
import { realExec } from "./fake-pi.js";

const bwrapReady = spawnSync("bwrap", ["--ro-bind", "/", "/", "--unshare-all", "true"]).status === 0;
const host = (): SandboxHost => ({ env: process.env, home: homedir(), cacheDir: mkdtempSync(join(tmpdir(), "fb-cache-")) });

// Phase 8 A8, option C (author 2026-11-07): when the model cannot write a working clumsy version (asked twice), the
// intermediate step-up's improve part takes one of these. Each is vetted here, the way the step-up uses it.
describe("ready-made improve-it programs", () => {
  it("there are several, each with a task, clumsy code, a hidden solution and checks that parse", () => {
    expect(IMPROVE_FALLBACKS.length).toBeGreaterThanOrEqual(5);
    for (const f of IMPROVE_FALLBACKS) {
      const { checks, extra } = fallbackChecks(f);
      expect(checks.length, f.task).toBeGreaterThanOrEqual(2);
      expect(extra.some((c) => c.kind === "timed"), f.task).toBe(true);
      expect(new Set(IMPROVE_FALLBACKS.map((x) => x.task)).size).toBe(IMPROVE_FALLBACKS.length);
    }
  });
  for (const f of IMPROVE_FALLBACKS) {
    it.skipIf(!bwrapReady)(`${f.task.slice(0, 50)}…: the solution and the clumsy code pass every check; the solution measures better`, async () => {
      const { checks, extra } = fallbackChecks(f);
      const root = mkdtempSync(join(tmpdir(), "fb-proj-"));
      mkdirSync(join(root, "stepup"));
      const sb = host();
      // like the step-up: every check confirmed on the hidden solution (the timed one gets its limit there)
      const confirmed = await crossCheckOnReference({ exec: realExec, sandbox: sb, language: "python", entry: "stepup/improve.py", runCmd: null, reference: f.reference, checks: [...checks, ...extra], root });
      expect(confirmed.map((c) => [c.expr, c.status]).filter(([, s]) => s !== "trusted"), f.task).toEqual([]);
      const own = confirmed.slice(0, checks.length), more = confirmed.slice(checks.length);
      const measured = async (src: string) => {
        writeFileSync(join(root, "stepup", "improve.py"), src);
        const r = await runChecks(realExec, { language: "python", root, entry: "stepup/improve.py", runCmd: null, checks: [...own, ...more.map((c) => ({ ...c, limitMs: undefined }))], sandbox: sb });
        const m = await codeMetrics(realExec, { root, entry: "stepup/improve.py", sandbox: sb, functions: calledFunctions(own.flatMap((c) => (c.expr ? [c.expr] : []))) });
        return { own: r.results.slice(0, own.length), extra: r.results.slice(own.length), m };
      };
      const clumsy = await measured(f.clumsy), good = await measured(f.reference);
      expect(clumsy.own.map((x) => x.pass), "the clumsy code must work").toEqual(own.map(() => true));
      const at = (x: typeof clumsy) => ({ ...x.m!, edgePassed: x.extra.filter((e) => e.check.kind === "value" && e.pass).length, ms: x.extra.find((e) => e.check.kind === "timed")?.ms ?? null });
      const r = improveResult(at(clumsy), at(good));
      expect(r.better.length, `${f.task}: ${JSON.stringify(r)}`).toBeGreaterThan(0);
      expect(r.worse, f.task).toEqual([]);
    }, 120_000);
  }
});
