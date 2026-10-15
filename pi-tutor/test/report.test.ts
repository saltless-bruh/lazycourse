import { describe, it, expect } from "vitest";
import { progressReport } from "../extensions/tutor/report.js";
import { DIAGRAM_COLS } from "../extensions/tutor/compliance.js";
import { loadPack, vocabOf } from "../extensions/tutor/packs.js";

const ep = (rungs_used: number) => ({ language: "python", project: null, concept_tags: [], rungs_used, turns: 1, opened: 1, closed: 2 });
const ex = (exam: string, score: number, minutes: number, late = false) => ({ exam, project: "/p", language: "python", topic: null, score, minutes, late, concepts: [], created: 1 });

describe("progressReport (gap #8)", () => {
  const r = progressReport({
    language: "python", level: 45,
    episodes: [4, 4, 3, 2, 2, 1].map(ep),
    exams: [ex("01-word-frequency", 85, 18), ex("02-parse-csv", 60, 51.2, true)],
    concepts: [
      { language: "python", tag: "keyerror", ease: 0.9, episodes: 2 },
      { language: "python", tag: "loops", ease: 0.55, episodes: 1 },
      { language: "python", tag: "exceptions", ease: 0.2, episodes: 3 },
    ],
    vocab: vocabOf(loadPack("python")),
  });
  it("shows level, hint use over time, exams with trend, and the concept map", () => {
    expect(r).toContain("**python** · level 45 (intermediate)");
    expect(r).toContain("`▇▇▅▃▃▁`"); // rungs 4,4,3,2,2,1 → ▁▃▅▇█ by index rung−1
    expect(r).toMatch(/hint levels used: 3\.7 → 1\.7/);
    expect(r).toContain("- 01-word-frequency 85 · 18 min"); // ExamRecord has no limit: minutes only
    expect(r).toMatch(/02-parse-csv 60 · 51\.2 min · late/);
    expect(r).toMatch(/trend: 85 → 60/);
    expect(r).toMatch(/strong: dicts/);
    expect(r).toMatch(/shaky: loops/);
    expect(r).toMatch(/weak: exceptions/);
    expect(r).not.toMatch(/rung/i);
  });
  it("every line fits the pane (≤ 40 columns)", () => {
    for (const l of r.split("\n")) expect(Array.from(l).length).toBeLessThanOrEqual(DIAGRAM_COLS);
  });
  it("says so when there is nothing yet", () => {
    expect(progressReport({ language: "go", level: null, episodes: [], exams: [], concepts: [], vocab: null })).toMatch(/no episodes or exams yet/);
  });
});
