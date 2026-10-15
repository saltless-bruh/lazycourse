import { describe, it, expect } from "vitest";
import { parsePack, loadPack, vocabOf, normalizeTag, normalizeTags, remapConcepts } from "../extensions/tutor/packs.js";

const CARD = [
  "# Python card", "", "- **Format:** ruff format", "",
  "## Concept tags",
  "- `dicts`: mappings, lookups, KeyError (aliases: dictionary, dict-keyerror, keyerror)",
  "- `loops`: for/while, range, enumerate",
  "not a tag line",
].join("\n");

describe("real cards map the tags the model used in skill-eval iteration 1", () => {
  it.each([
    ["python", ["mutable-defaults", "exception-handling", "file-io", "context-manager"], ["functions", "exceptions", "files-io"]],
    ["go", ["file-i-o", "file-reading", "scanner"], ["files-io"]],
    ["lua", ["table-frequency", "frequency-count", "table-dictionary"], ["tables"]],
    ["rust", ["overlapping-borrows", "borrow-conflict", "sorting"], ["borrowing", "collections"]],
    ["javascript", ["var", "array-methods", "promise", "this-binding"], ["variables", "arrays", "promises", "this"]],
    ["typescript", ["enums", "compilation", "typescript-runtime", "typescript-node-interop"], ["unions", "tooling"]],
  ])("%s", (lang, used, want) => {
    expect(normalizeTags(used, vocabOf(loadPack(lang), loadPack("editor")))).toEqual(want);
  });
  it("editor: a jump-list question is about motions", () => {
    expect(normalizeTags(["jump-list"], vocabOf(loadPack("editor")))).toEqual(["motions"]);
  });
});

describe("packs", () => {
  it("splits the card body from its concept tags", () => {
    const p = parsePack("python", CARD);
    expect(p.body).toBe("# Python card\n\n- **Format:** ruff format");
    expect(p.tags).toEqual([
      { tag: "dicts", meaning: "mappings, lookups, KeyError", aliases: ["dictionary", "dict-keyerror", "keyerror"] },
      { tag: "loops", meaning: "for/while, range, enumerate", aliases: [] },
    ]);
  });
  it("a card without a tag section has no tags", () => {
    expect(parsePack("x", "# X card\n- a").tags).toEqual([]);
  });
  it("normalizes tags to kebab-case", () => {
    expect(normalizeTag("  List_Comprehension ")).toBe("list-comprehension");
    expect(normalizeTag("Dict  Lookup")).toBe("dict-lookup");
  });
  it("maps aliases, keeps known tags, drops unknown, dedupes, keeps order", () => {
    const v = vocabOf(parsePack("python", CARD));
    expect(normalizeTags(["KeyError", "loops", "dicts", "monads", "Dictionary"], v)).toEqual(["dicts", "loops"]);
  });
  it("without a vocabulary tags are only normalized (a language with no pack)", () => {
    expect(normalizeTags(["Pointer Arithmetic", "pointer-arithmetic", "x"], vocabOf(null))).toEqual(["pointer-arithmetic", "x"]);
  });
  it("merges vocabularies (language + editor); the first pack wins a clash", () => {
    const ed = parsePack("editor", "# Editor\n## Concept tags\n- `motions`: moving the cursor (aliases: loops)");
    const v = vocabOf(parsePack("python", CARD), ed)!;
    expect(v.get("motions")).toBe("motions");
    expect(v.get("loops")).toBe("loops");
  });
});

describe("remapConcepts (M7 minor: rows saved before the vocabulary)", () => {
  const vocab = vocabOf(loadPack("python"));
  it("folds old free-form tags into their vocabulary tag as an episode-weighted mean", () => {
    const rows = [
      { language: "python", tag: "dicts", ease: 0.8, episodes: 3 },
      { language: "python", tag: "keyerror", ease: 0.4, episodes: 1 },
      { language: "python", tag: "list-comprehension", ease: 0.9, episodes: 2 },
    ];
    expect(remapConcepts(rows, vocab)).toEqual([
      { language: "python", tag: "dicts", ease: expect.closeTo(0.7, 10), episodes: 4 },
      { language: "python", tag: "comprehensions", ease: 0.9, episodes: 2 },
    ]);
  });
  it("keeps a tag the vocabulary does not know, and every tag when there is no vocabulary", () => {
    const rows = [{ language: "c", tag: "pointer-arithmetic", ease: 0.3, episodes: 1 }];
    expect(remapConcepts(rows, vocab)).toEqual(rows);
    expect(remapConcepts(rows, null)).toEqual(rows);
  });
});
