import { describe, it, expect } from "vitest";
import { parsePack, vocabOf, normalizeTag, normalizeTags } from "../extensions/tutor/packs.js";

const CARD = [
  "# Python card", "", "- **Format:** ruff format", "",
  "## Concept tags",
  "- `dicts`: mappings, lookups, KeyError (aliases: dictionary, dict-keyerror, keyerror)",
  "- `loops`: for/while, range, enumerate",
  "not a tag line",
].join("\n");

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
