import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { htmlToText, toText, cap, MAX_REF_CHARS } from "../extensions/tutor/knowledge/text.js";
import { overrideFor, sourcesPath } from "../extensions/tutor/knowledge/sources.js";

describe("htmlToText", () => {
  it("drops scripts and styles, keeps headings, list items, paragraphs and entities", () => {
    const html = `<html><head><style>p{}</style><script>alert(1)</script></head><body>
      <h2>Names</h2><p>Use <code>MixedCaps</code> &amp; short names&nbsp;&lt;3.</p>
      <ul><li>one</li><li>two</li></ul>line<br>break &#8212; &#x2014;</body></html>`;
    const t = htmlToText(html);
    expect(t).not.toMatch(/alert|p\{\}/);
    expect(t).toContain("## Names");
    expect(t).toContain("Use MixedCaps & short names <3.");
    expect(t).toContain("- one\n");
    expect(t).toContain("- two");
    expect(t).toContain("line\nbreak — —");
    expect(t).not.toMatch(/\n{3,}/);
  });
});

describe("toText / cap", () => {
  it("converts HTML by content type, extension or doctype, and passes markdown/rst through", () => {
    expect(toText("<p>a</p>", "https://x/y", "text/html; charset=utf-8")).toBe("a");
    expect(toText("<p>a</p>", "https://x/doc.html")).toBe("a");
    expect(toText("<!DOCTYPE html><p>a</p>", "https://x/raw")).toBe("a");
    expect(toText("# Title\n\n<not a tag>\n", "https://x/a.md", "text/plain")).toBe("# Title\n\n<not a tag>");
  });
  it("caps long text with a truncation note", () => {
    expect(cap("abc", 5)).toBe("abc");
    expect(cap("abcdefgh", 5)).toBe("abcde\n\n[truncated: 3 more characters at the source]");
    expect(MAX_REF_CHARS).toBe(120_000);
  });
});

describe("overrideFor (sources.json pins a DevDocs slug)", () => {
  const saved = process.env.PI_TUTOR_SOURCES;
  afterEach(() => { if (saved === undefined) delete process.env.PI_TUTOR_SOURCES; else process.env.PI_TUTOR_SOURCES = saved; });
  it("returns a valid slug per language and ignores missing, broken or old-format files", () => {
    const file = join(mkdtempSync(join(tmpdir(), "pitutor-src-")), "sources.json");
    process.env.PI_TUTOR_SOURCES = file;
    expect(sourcesPath()).toBe(file);
    expect(overrideFor("python")).toBeUndefined(); // missing file
    writeFileSync(file, "{ nope");
    expect(overrideFor("python")).toBeUndefined();
    writeFileSync(file, JSON.stringify({ python: "python~3.12", rust: [{ slug: "old-format" }], go: "bad slug!" }));
    expect(overrideFor("python")).toBe("python~3.12");
    expect(overrideFor("rust")).toBeUndefined();
    expect(overrideFor("go")).toBeUndefined();
  });
});
