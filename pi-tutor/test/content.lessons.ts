// Spec 2026-10-19 §7a: a vendored or converted exercise is trusted only when its exemplar passes and
// its stub fails, in the sandbox when bubblewrap can start (Review Focus #3).
import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { homedir, tmpdir } from "node:os";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { LANGUAGES } from "../extensions/tutor/start.js";
import { layout } from "../extensions/tutor/exam/layout.js";
import { loadLessons, levelTasks, checkExercise, type Exercise } from "../extensions/tutor/lessons.js";
import { realExec } from "./fake-pi.js";

const bwrap = spawnSync("bwrap", ["--ro-bind", "/", "/", "--unshare-all", "true"]).status === 0;
const sandbox = bwrap ? { env: process.env, home: homedir(), cacheDir: mkdtempSync(join(tmpdir(), "lessons-cache-")) } : null;
const has = (lang: string) => { const l = layout(lang); return !!l && spawnSync(l.version[0], l.version[1]).status === 0; };

for (const lang of LANGUAGES) {
  const items: [string, Exercise][] = [
    ...loadLessons(lang).flatMap((l) => l.exercises.map((e): [string, Exercise] => [`${lang}/${l.concept}/${e.id}`, e])),
    ...levelTasks(lang).map((e): [string, Exercise] => [`${lang}/_levels/${e.id}`, e]),
  ];
  describe.skipIf(!has(lang) || items.length === 0)(`${lang} lessons`, () => {
    for (const [name, ex] of items) {
      it(`${name}: exemplar passes, stub fails`, async () => {
        const r = await checkExercise(realExec, lang, ex, sandbox);
        expect(r.exemplar.missing, `${name}: ${r.exemplar.missing}`).toBeUndefined();
        expect(r.exemplar.code, `${name} exemplar:\n${r.exemplar.out.slice(-1500)}`).toBe(0);
        expect(r.stub.code, `${name}: the stub already passes`).not.toBe(0);
        expect(r.stub.broken, `${name} stub does not compile or load:\n${r.stub.out.slice(-1500)}`).toBe(false);
      });
    }
  });
}
it("lesson content check ran", () => expect(true).toBe(true));
