import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parsePack, loadPack, cookbookIndex } from "../extensions/tutor/packs.js";
import { renderCard, renderEditorCard, renderIndex, indexWanted } from "../extensions/tutor/card.js";
import { estimateTokens } from "../extensions/tutor/prompts.js";
import { LANGUAGES } from "../extensions/tutor/start.js";
import type { RefMeta } from "../extensions/tutor/knowledge/reference.js";

const PY = parsePack("python", "# Python card\n- **Format:** ruff format\n\n## Concept tags\n- `dicts`: mappings (aliases: keyerror)\n- `loops`: for and while");
const tc = { installed: "3.14.8", runtime: null, constraint: "requires-python >=3.12 (pyproject.toml)" };
const ref: RefMeta = { slug: "python~3.14", release: "3.14", mtime: 0, installed: "3.14.8", note: "", format: 2 };

describe("renderCard", () => {
  it("states version, constraint, reference, skills, other languages, then the body and tags", () => {
    const t = renderCard(PY, { tc, ref, knows: ["python", "rust"], skills: ["tutor-python-cookbook", "tutor-python-expert"], skillsDir: "/pkg/skills" });
    expect(t.split("\n").slice(0, 6)).toEqual([
      "[language card: python]",
      "Installed: Python 3.14.8 · project: requires-python >=3.12 (pyproject.toml)",
      "Reference: `tutor-python-ref` for python~3.14; cite it.",
      // skill-eval iteration 1: the model opened a pack skill 2/14 times and once guessed its path.
      "Skills in /pkg/skills (read <name>/SKILL.md before you answer when one fits): `tutor-python-cookbook` for \"how do I … in Python?\" (find the plain step, show its example); `tutor-python-expert` for review, \"is this idiomatic?\" or a concept beyond one idiom",
      "Learner also knows: rust. Use the cookbook's Bridge lines.",
      "Concept tags: use only the tags listed below in the judgment block.",
    ]);
    expect(t).toContain("- **Format:** ruff format");
    expect(t.trimEnd().split("\n").at(-1)).toBe("Tags: `dicts` mappings · `loops` for and while");
  });
  it("a missing toolchain, no reference, no other languages, no skills", () => {
    const t = renderCard(PY, { tc: { installed: null, runtime: null, constraint: null }, ref: null, knows: [], skills: [] });
    expect(t).toContain("Installed: not installed (from the language's version command)");
    expect(t).toContain("Reference: none yet; suggest `:TutorDocs python`.");
    expect(t).not.toContain("Learner also knows");
    expect(t).not.toContain("Skills:");
  });
  it("TypeScript without tsc names the node runtime", () => {
    const ts = parsePack("typescript", "# TypeScript card");
    expect(renderCard(ts, { tc: { installed: null, runtime: "node 26.11.1", constraint: null }, ref: null, knows: [], skills: [] }))
      .toContain("Installed: tsc not installed · runtime node 26.11.1");
  });
  it("warns when the reference version differs from the installed one", () => {
    const old: RefMeta = { ...ref, slug: "python~3.13", release: "3.13" };
    expect(renderCard(PY, { tc, ref: old, knows: [], skills: [] })).toContain("The reference is for 3.13 but 3.14 is installed: say so when it matters.");
  });
  it("the editor card is its body plus its tags", () => {
    const ed = parsePack("editor", "# Editor card\n- leader is Space\n\n## Concept tags\n- `motions`: moving around");
    expect(renderEditorCard(ed)).toBe("[editor card: LazyVim]\n# Editor card\n- leader is Space\nTags: `motions` moving around");
    expect(estimateTokens(renderEditorCard(ed))).toBeLessThan(300);
  });
});

describe("card index (Option A: a short always-on index pointing at the skill files)", () => {
  const COOK = "# X\n\n## read-args: read the args\nsince: 1\nindex: `sys.argv[1:]`\nbody\n\n## errors: report a failure\nsince: 1\nindex: `raise` with `try`/`except`\n";
  it("reads each recipe's step and index line", () => {
    expect(cookbookIndex(COOK)).toEqual([{ step: "read-args", idiom: "`sys.argv[1:]`" }, { step: "errors", idiom: "`raise` with `try`/`except`" }]);
    expect(cookbookIndex("# no recipes")).toEqual([]);
  });
  it("renders a compact block: the instruction, one line of recipes, the expert's file and references", () => {
    const t = renderIndex({ language: "python", dir: "/pkg/skills", entries: cookbookIndex(COOK), expertRefs: ["testing.md", "type-system.md"] });
    expect(t.split("\n")).toEqual([
      // Side-agent note: an answer list on every turn invites leaks, so it says what the names are for.
      "[index: python] Prefer it over memory. Names to point at, not lines to write: below rung 5 never put one into the learner's code. Full examples: /pkg/skills/tutor-python-cookbook/SKILL.md, \"## <step>\".",
      "read-args `sys.argv[1:]` | errors `raise`", // first code span only; the cookbook has the rest
      "Review or a concept: tutor-python-expert/SKILL.md in the same folder (checklist; references/: testing, type-system).",
    ]);
  });
  it("leaves out what does not exist", () => {
    expect(renderIndex({ language: "c", dir: "/d", entries: [], expertRefs: null })).toBe("");
    expect(renderIndex({ language: "lua", dir: "/d", entries: [], expertRefs: [] })).toBe("Review or a concept: /d/tutor-lua-expert/SKILL.md (checklist).");
  });
  it.each([...LANGUAGES])("%s: the real index stays within its own 250-token allowance", (lang) => {
    const dir = join(dirname(fileURLToPath(import.meta.url)), "..", "skills");
    const entries = cookbookIndex(readFileSync(join(dir, `tutor-${lang}-cookbook`, "SKILL.md"), "utf8"));
    expect(entries).toHaveLength(17);
    expect(renderIndex({ language: lang, dir: "/d", entries, expertRefs: null })).not.toContain("read-trace"); // tutor-stack-traces is listed by Pi already
    const t = renderIndex({ language: lang, dir: "/home/ple/Documents/personal_Project/AI-Driven_Teaching_Coding_Project/pi-tutor/skills", entries, expertRefs: readdirSync(join(dir, `tutor-${lang}-expert`, "references")) });
    expect(estimateTokens(t)).toBeLessThanOrEqual(250);
  });
});

describe("indexWanted (Option 2: the index only where it pays off)", () => {
  it.each([
    "How do I count words in Python?",
    "how can I read a file line by line",
    "how to sort these by age?",
    "What's the idiomatic way to group items?",
    "is there a function that splits a string?",
    "which method gives a default for a missing key",
  ])("a how-do-I question gets it: %s", (prompt) => {
    expect(indexWanted({ prompt, mapStep: false })).toBe(true);
  });
  it.each([
    "why does my loop stop one item early?",
    "I think the bug is that range excludes the end",
    "what does KeyError mean?",
    "hi",
    "[tutor] stuck signal: error \"boom\" at a.py:1 — how do I fix it",
  ])("other turns do not: %s", (prompt) => {
    expect(indexWanted({ prompt, mapStep: false })).toBe(false);
  });
  it("the design recipe's Map step always gets it", () => {
    expect(indexWanted({ prompt: "done with steps", mapStep: true })).toBe(true);
  });
  it("our own [tutor] nudges never get it, not even at the Map step (final review I1)", () => {
    expect(indexWanted({ prompt: "[tutor] the learner moved on to step 5 (Map)", mapStep: true })).toBe(false);
    expect(indexWanted({ prompt: "[tutor] stuck signal: idle at a.py:3", mapStep: true })).toBe(false);
  });
});

describe("pack budget (gap #2)", () => {
  it.each([...LANGUAGES])("%s card renders ≤ 600 tokens with a full header", (lang) => {
    const p = loadPack(lang);
    expect(p, `packs/${lang}/card.md`).not.toBeNull();
    const t = renderCard(p!, { tc: { installed: "9.99.9", runtime: null, constraint: "x".repeat(60) }, ref: null, knows: ["python", "rust", "go", "typescript", "lua"], skills: [`tutor-${lang}-cookbook`, `tutor-${lang}-expert`], skillsDir: "/home/ple/Documents/personal_Project/AI-Driven_Teaching_Coding_Project/pi-tutor/skills" });
    expect(estimateTokens(t)).toBeLessThanOrEqual(600);
    expect(p!.tags.length).toBeGreaterThanOrEqual(12);
  });
  it("editor card ≤ 300 tokens", () => {
    expect(estimateTokens(renderEditorCard(loadPack("editor")!))).toBeLessThanOrEqual(300);
  });
});
