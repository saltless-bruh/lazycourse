import { describe, it, expect } from "vitest";
import { chooseBundle, splitHtml, buildReference, referenceSkill, CHUNK_CHARS, type CatalogEntry, type DevdocsIndex } from "../extensions/tutor/knowledge/devdocs.js";
import { Cancelled } from "../extensions/tutor/progress.js";
import { parseSkillHeader } from "../extensions/tutor/learn.js";

const e = (slug: string, type: string, release: string): CatalogEntry =>
  ({ name: type[0].toUpperCase() + type.slice(1), slug, type, version: release.split(".").slice(0, 2).join("."), release, mtime: 1, db_size: 1, attribution: "&copy; Example. Licensed under <b>MIT</b>." });
const catalog = [
  e("python~3.15", "python", "3.15.0"), e("python~3.14", "python", "3.14.8"), e("python~3.13", "python", "3.13.8"),
  e("rust", "rust", "1.98.0"), e("lua~5.5", "lua", "5.5.0"), e("lua~5.4", "lua", "5.4.1"),
];

describe("chooseBundle", () => {
  it("takes the exact major.minor match", () => {
    expect(chooseBundle(catalog, "python", "3.14.2")).toEqual({ entry: catalog[1], exact: true, note: "" });
    expect(chooseBundle(catalog, "lua", "5.5.1")?.entry.slug).toBe("lua~5.5");
  });
  it("falls back to the nearest lower version, with a note", () => {
    const c = chooseBundle(catalog, "python", "3.16.1")!;
    expect(c.entry.slug).toBe("python~3.15");
    expect(c.exact).toBe(false);
    expect(c.note).toMatch(/nearest lower/);
  });
  it("uses the newest when only newer docs exist, and warns to check (Rust 1.90 vs 1.98)", () => {
    const c = chooseBundle(catalog, "rust", "1.90.0")!;
    expect(c.entry.slug).toBe("rust");
    expect(c.note).toMatch(/newer than installed 1\.90\.0/);
  });
  it("uses the newest when the toolchain is not detected", () => {
    const c = chooseBundle(catalog, "python", null)!;
    expect(c.entry.slug).toBe("python~3.15");
    expect(c.note).toMatch(/not detected/);
  });
  it("honours a slug pin, and returns null for an unknown type or pin", () => {
    expect(chooseBundle(catalog, "python", "3.14.0", "python~3.13")).toMatchObject({ entry: { slug: "python~3.13" }, exact: false });
    expect(chooseBundle(catalog, "cobol", "1.0")).toBeNull();
    expect(chooseBundle(catalog, "python", "3.14", "python~2.7")).toBeNull();
  });
});

describe("splitHtml", () => {
  it("keeps a small page whole and splits a large one before h1-h3 headings", () => {
    expect(splitHtml("<h1>A</h1><p>x</p>")).toEqual(["<h1>A</h1><p>x</p>"]);
    const big = "<h1>A</h1>" + "a".repeat(40) + "<h2>B</h2>" + "b".repeat(40) + "<h3>C</h3>" + "c".repeat(40);
    expect(splitHtml(big, 60)).toEqual(["<h1>A</h1>" + "a".repeat(40), "<h2>B</h2>" + "b".repeat(40), "<h3>C</h3>" + "c".repeat(40)]);
    expect(splitHtml("<p>" + "x".repeat(100) + "</p>", 10)).toHaveLength(1); // one oversize section stays whole
    expect(CHUNK_CHARS).toBe(60_000);
  });
});

describe("buildReference", () => {
  const index: DevdocsIndex = {
    entries: [
      { name: "string.format", path: "manual#pdf-string.format", type: "Standard Libraries" },
      { name: "Arithmetic Operators", path: "manual#3.4.1", type: "Language" },
      { name: "pathlib", path: "library/pathlib", type: "Files" },
      { name: "gone", path: "missing#x", type: "Files" },
    ],
    types: [{ name: "Files", count: 2, slug: "files" }, { name: "Language", count: 1, slug: "language" }, { name: "Standard Libraries", count: 1, slug: "standard-libraries" }],
  };
  const manual = `<h1 id="3">Language</h1><h3 id="3.4.1">Arithmetic</h3><p>${"+".repeat(30)}</p><h2 id="6">Standard Libraries</h2><p id="pdf-string.format">string.format &amp; more</p>`;
  const db = { manual, "library/pathlib": "<h1>pathlib</h1><p>Path.rglob</p>" };

  it("writes converted chunks and maps each entry to the chunk holding its anchor", async () => {
    const b = await buildReference(index, db, { yieldEvery: 1 });
    const paths = b.files.map((f) => f.path);
    expect(paths).toEqual(["references/manual.md", "references/library_pathlib.md"]);
    expect(b.files[0].text).toContain("string.format & more");
    expect(b.index).toContain("## Standard Libraries\n- string.format → references/manual.md");
    expect(b.index).toContain("## Files\n- pathlib → references/library_pathlib.md");
    expect(b.index).not.toContain("gone");
    expect(b.entries).toBe(3);
    expect(b.index.indexOf("## Files")).toBeLessThan(b.index.indexOf("## Language"));
  });

  it("points an anchor in a later chunk to that chunk (one-page manuals like Lua)", async () => {
    // filler after string.format pushes the whole §6 section into its own chunk
    const big = { manual: manual.replace("string.format &amp; more</p>", "string.format &amp; more</p><p>" + "z".repeat(CHUNK_CHARS) + "</p>") };
    const b = await buildReference(index, big);
    expect(b.files.map((f) => f.path)).toEqual(["references/manual.1.md", "references/manual.2.md"]);
    expect(b.index).toContain("- string.format → references/manual.2.md");
    expect(b.index).toContain("- Arithmetic Operators → references/manual.1.md");
  });

  it("stops with Cancelled when aborted between pages", async () => {
    const ctl = new AbortController(); ctl.abort();
    await expect(buildReference(index, db, { signal: ctl.signal, yieldEvery: 1 })).rejects.toBeInstanceOf(Cancelled);
  });
});

describe("referenceSkill", () => {
  const idx: DevdocsIndex = { entries: [], types: [{ name: "Files", count: 1, slug: "f" }] };
  it("renders a SKILL.md Pi can load, with version, note, lookup steps and attribution", () => {
    const text = referenceSkill("rust", { entry: e("rust", "rust", "1.98.0"), exact: false, note: "docs 1.98.0 are newer than installed 1.90.0" }, "1.90.0", idx);
    const h = parseSkillHeader(text);
    expect(h.name).toBe("tutor-rust-ref");
    expect(h.description.length).toBeLessThanOrEqual(1024);
    expect(h.description).toContain("Rust 1.98.0 reference from DevDocs");
    expect(text).toContain("Installed rust: 1.90.0. Note: docs 1.98.0 are newer than installed 1.90.0.");
    expect(text).toContain("`grep` INDEX.md");
    expect(text).toContain("© Example. Licensed under MIT.");
  });
});
