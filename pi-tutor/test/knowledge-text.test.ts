import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { htmlToText, toText, cap, MAX_REF_CHARS } from "../extensions/tutor/knowledge/text.js";
import { SOURCES, topicsFor, sourcesPath } from "../extensions/tutor/knowledge/sources.js";
import { LANGUAGES } from "../extensions/tutor/start.js";

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

describe("sources", () => {
  const saved = process.env.PI_TUTOR_SOURCES;
  afterEach(() => { if (saved === undefined) delete process.env.PI_TUTOR_SOURCES; else process.env.PI_TUTOR_SOURCES = saved; });

  it("starts the Lua stdlib reference at §6, past the 120k cap's reach (M5 final review I2)", () => {
    expect(SOURCES.lua.find((t) => t.slug === "stdlib")?.from).toBe("The Standard Libraries");
  });

  it("covers every built-in /tutor-start language with valid slugs and http(s) urls", () => {
    for (const lang of LANGUAGES) {
      const topics = SOURCES[lang];
      expect(topics?.length, lang).toBeGreaterThan(0);
      for (const t of topics) {
        expect(t.slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
        expect(t.urls.length).toBeGreaterThan(0);
        for (const u of t.urls) expect(u).toMatch(/^https?:\/\//);
      }
    }
  });
  it("uses the override file per language, keeps built-ins otherwise, and ignores a missing or broken file", () => {
    const file = join(mkdtempSync(join(tmpdir(), "pitutor-src-")), "sources.json");
    process.env.PI_TUTOR_SOURCES = file;
    expect(sourcesPath()).toBe(file);
    expect(topicsFor("rust")).toEqual(SOURCES.rust); // missing file
    writeFileSync(file, "{ not json");
    expect(topicsFor("rust")).toEqual(SOURCES.rust); // broken file
    writeFileSync(file, JSON.stringify({ rust: [{ slug: "mine", title: "Mine", urls: ["http://localhost/x.md"] }], zig: [], cobol: [{ slug: "Bad Slug", title: "x", urls: [] }] }));
    expect(topicsFor("rust")).toEqual([{ slug: "mine", title: "Mine", urls: ["http://localhost/x.md"] }]);
    expect(topicsFor("python")).toEqual(SOURCES.python);
    expect(topicsFor("zig")).toEqual([]);
    expect(topicsFor("cobol")).toEqual([]); // invalid entries are dropped
    expect(topicsFor("haskell")).toBeUndefined();
  });
});
