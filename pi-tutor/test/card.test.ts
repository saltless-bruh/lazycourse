import { describe, it, expect } from "vitest";
import { parsePack, loadPack } from "../extensions/tutor/packs.js";
import { renderCard, renderEditorCard } from "../extensions/tutor/card.js";
import { estimateTokens } from "../extensions/tutor/prompts.js";
import { LANGUAGES } from "../extensions/tutor/start.js";
import type { RefMeta } from "../extensions/tutor/knowledge/reference.js";

const PY = parsePack("python", "# Python card\n- **Format:** ruff format\n\n## Concept tags\n- `dicts`: mappings (aliases: keyerror)\n- `loops`: for and while");
const tc = { installed: "3.14.8", runtime: null, constraint: "requires-python >=3.12 (pyproject.toml)" };
const ref: RefMeta = { slug: "python~3.14", release: "3.14", mtime: 0, installed: "3.14.8", note: "", format: 2 };

describe("renderCard", () => {
  it("states version, constraint, reference, skills, other languages, then the body and tags", () => {
    const t = renderCard(PY, { tc, ref, knows: ["python", "rust"], skills: ["tutor-python-cookbook", "tutor-python-expert"] });
    expect(t.split("\n").slice(0, 6)).toEqual([
      "[language card: python]",
      "Installed: Python 3.14.8 · project: requires-python >=3.12 (pyproject.toml)",
      "Reference: `tutor-python-ref` for python~3.14; cite it.",
      "Skills: `tutor-python-cookbook` (plain step → idiom), `tutor-python-expert` (patterns, pitfalls, review)",
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

describe.skip("pack budget (gap #2)", () => {
  it.each([...LANGUAGES])("%s card renders ≤ 600 tokens with a full header", (lang) => {
    const p = loadPack(lang);
    expect(p, `packs/${lang}/card.md`).not.toBeNull();
    const t = renderCard(p!, { tc: { installed: "9.99.9", runtime: null, constraint: "x".repeat(60) }, ref: null, knows: ["python", "rust", "go", "typescript", "lua"], skills: [`tutor-${lang}-cookbook`, `tutor-${lang}-expert`] });
    expect(estimateTokens(t)).toBeLessThanOrEqual(600);
    expect(p!.tags.length).toBeGreaterThanOrEqual(12);
  });
  it("editor card ≤ 300 tokens", () => {
    expect(estimateTokens(renderEditorCard(loadPack("editor")!))).toBeLessThanOrEqual(300);
  });
});
