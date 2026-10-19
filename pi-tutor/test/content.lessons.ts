// Spec 2026-10-19 §7a: a vendored or converted exercise is trusted only when its exemplar passes and
// its stub fails, in the sandbox when bubblewrap can start (Review Focus #3).
import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { homedir, tmpdir } from "node:os";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { LANGUAGES } from "../extensions/tutor/start.js";
import { layout } from "../extensions/tutor/exam/layout.js";
import { loadLessons, levelTasks, checkExercise, textProblems, type Exercise } from "../extensions/tutor/lessons.js";
import { writeFileSync, rmSync } from "node:fs";
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
        // The exemplar passing proves the tests load and are right; a stub may fail by not loading at all, as
        // Exercism's first exercises do on purpose ("MISSING FUNCTION --> … did you forget to define it?").
        expect(r.stub.code, `${name}: the stub already passes`).not.toBe(0);
      });
    }
  });
}
// The lesson text too (side-agent note 2026-10-19): no markup leftovers anywhere, and in lessons marked
// `checked: doctest` every >>> example runs and prints what the lesson shows.
describe("lesson text", () => {
  for (const lang of LANGUAGES) for (const l of loadLessons(lang)) {
    it(`${lang}/${l.concept}: no reStructuredText leftovers`, () => expect(textProblems(l.text)).toEqual([]));
    if (l.checked === "doctest" && lang === "python") it.skipIf(!has("python"))(`${lang}/${l.concept}: its >>> examples run (doctest)`, () => {
      // A block that calls input() waits for a person typing (the tutorial's own example): not doctest material.
      const blocks = [...l.text.matchAll(/```python\n([\s\S]*?)```/g)].map((m) => m[1]).filter((b) => !/\binput\(/.test(b));
      const dir = mkdtempSync(join(tmpdir(), "lesson-doctest-"));
      try {
        writeFileSync(join(dir, "examples.txt"), blocks.join("\n\n"));
        // Files the examples write (open('workfile', 'w')) stay in this temp folder.
        const r = spawnSync("python3", ["-m", "doctest", "-o", "ELLIPSIS", "-o", "NORMALIZE_WHITESPACE", "-o", "IGNORE_EXCEPTION_DETAIL", "examples.txt"],
          { cwd: dir, input: "", encoding: "utf8", timeout: 20_000 });
        expect(r.status, `${lang}/${l.concept} examples:\n${r.stdout}${r.stderr}`).toBe(0);
      } finally { rmSync(dir, { recursive: true, force: true }); }
    });
  }
});
