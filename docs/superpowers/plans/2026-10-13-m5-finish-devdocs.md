# nvim-tutor M5-finish: DevDocs reference + version detection

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fetch each language's documentation from DevDocs at the version installed on this machine, and turn it into a searchable skill, `tutor-<lang>-ref` (`SKILL.md` + `INDEX.md` + `references/`), that the tutor greps and cites. This replaces M5's fixed source lists (which shipped the Lua 5.4 manual while Lua 5.5 is installed). After this, M5 can merge.

**Architecture:**
- `knowledge/versions.ts` runs the version command through `pi.exec`. The extension runs it, not the model.
- `knowledge/devdocs.ts` is pure: it chooses the bundle (exact, nearest lower, or newest, each with a note), splits HTML pages at headings, builds the reference files and an index grouped by type, and renders `SKILL.md`.
- `knowledge/reference.ts` downloads the catalog, the index and the database, skips the work when the bundle is unchanged, yields while converting, and swaps the skill folder in atomically through a dot-prefixed temp folder.
- `sources.json` becomes a per-language DevDocs slug pin.
- `/tutor-docs` and `/tutor-start` use the new path. M5's topic fetcher, its describe prompt and its tests are retired.

**Tech Stack:** DevDocs bundles (`https://devdocs.io/docs.json`, `https://documents.devdocs.io/<slug>/{index,db}.json`), Node 26 `fetch` with `AbortSignal`, Pi 1.1.0 `pi.exec`, TypeScript, vitest with a local `node:http` mirror (no network in tests).

**Spec:** `docs/superpowers/specs/2026-10-13-tutor-roles-packs-exams-design.md` §5.1, §5.2, §9 row M5-finish (and `2026-10-07-nvim-tutor-design.md` rev 7 §7).

## Global Constraints

- Pi `^1.0`; the extension is inert unless `PI_TUTOR=1`; nothing writes to stdout or stderr.
- New Pi calls must be verified in `types.d.ts` and recorded in `PI_SURFACE.md`:
  - `pi.exec(command, args, { timeout?, signal?, cwd? })` → `Promise<{ stdout, stderr, code, killed }>` (types.d.ts:1256, exec.d.ts).
- DevDocs formats, verified 2026-10-13:
  - Catalog entry: `{ name, slug, type, version, release, mtime, db_size, attribution }`.
  - `index.json`: `{ entries: [{ name, path: "page#anchor", type }], types: [{ name, count, slug }] }`.
  - `db.json`: `{ "<page>": "<html>" }`.
  - URLs: `https://documents.devdocs.io/<slug>/index.json?<mtime>` and `…/db.json?<mtime>`.
- Bundle choice (spec §5.2):
  - pick the exact `major.minor` match;
  - otherwise the nearest lower version;
  - otherwise the newest, and the card or skill warns about the mismatch.
- Measured on this machine: Python 3.14.8 → `python~3.14`; Go 1.27.2 → `go` 1.27.0; Lua 5.5.1 → `lua~5.5`; Rust 1.90 → `rust` 1.98 (newer, so warned); TypeScript has no `tsc` → newest.
- Skill: name `tutor-<lang>-ref`, `description` JSON-quoted, ≤ 1024 characters, and must parse with Pi's `parseFrontmatter` (the M5 learn fix).
- The guard already allows `read` and `grep` inside loaded skill folders, so the model can grep `INDEX.md` and read `references/`.
- Large bundles (Rust is 70 MB, about 37k entries) must not freeze Pi: yield to the event loop while converting, every 25 pages.
- The temp folder starts with a dot, `.tutor-<lang>-ref.tmp-<pid>` (fixes the M5 deferred minor: Pi skips dot entries).
- Tests never touch the network: `PI_TUTOR_DEVDOCS` points every DevDocs URL at a base (a local mirror in tests). That is also a real user setting, for offline or self-hosted mirrors.

## Plan decisions (rulings)

- **Project constraints (`pyproject.toml` and similar) wait for M7.** The spec's §5.1 shows them on the language card, which M7 builds; the reference itself only needs the installed version.
- **TypeScript is detected with `tsc --version`.** It isn't installed here, so the newest `typescript` bundle is used with a note. Node's version doesn't describe the TS language.
- **No model call to describe the skill.** The description is built from DevDocs metadata, which is faster, cheaper and deterministic. M5's `skill-describe.md` prompt and the topic fetcher are retired.
- **One file per DevDocs page, split at `<h1>`–`<h3>` into chunks of ≤ 60 000 HTML characters.** `INDEX.md` lists every entry under its type and points at the exact chunk that holds the entry's anchor. The model greps the index, then reads one file.
- **"Background" means a cancellable loader with a size in its label, not a detached job.** A truly detached download would need progress UI that Pi has no API for. Cost if wrong: the first Rust fetch blocks the Pi input for about a minute (Esc cancels).
- **The cache check uses `slug + mtime`.** A newer DevDocs build, or a different installed version that maps to another bundle, triggers a refetch. `/tutor-docs` always forces one.
- **`sources.json` keeps its path but changes meaning:** `{ "<lang>": "<devdocs slug>" }` pins a bundle. The old topic-list format is ignored.

## Review Focus

1. A toolchain that isn't installed (`tsc` missing here), or whose version output goes to stderr instead of stdout: the newest bundle is used with a clear note, never a crash (Task 1, Task 2 tests).
2. Rust's newer-only bundle (1.98 for installed 1.90): the skill says the docs are newer and the model must check that an item exists in 1.90 (Task 2 test).
3. Esc or a network failure mid-download: the previous `tutor-<lang>-ref` stays untouched and no temp folder is left behind (Task 3 test).
4. A one-page manual (Lua is a single 270 000-character page) still maps every index entry to the chunk holding its anchor, not to chunk 1 (Task 2 test).
5. Pi parses the generated `SKILL.md` as a valid skill: name pattern, quoted description ≤ 1024 (Task 2 test via `parseSkillHeader`).

---

### Task 1: Version detection

**Files:**
- Create: `pi-tutor/extensions/tutor/knowledge/versions.ts`
- Test: `pi-tutor/test/versions.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type Exec = (command: string, args: string[], options?: { timeout?: number }) => Promise<{ stdout: string; stderr: string; code: number }>;
  export interface LangSpec { devdocsType: string; command: string; args: string[] }
  export const LANGS: Readonly<Record<string, LangSpec>>;   // python, rust, go, typescript, lua
  export function parseVersion(text: string): string | null; // first "x.y" or "x.y.z"
  export function detectVersion(language: string, exec: Exec): Promise<string | null>;
  ```

- [ ] **Step 1: Write the failing test**

`pi-tutor/test/versions.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { parseVersion, detectVersion, LANGS, type Exec } from "../extensions/tutor/knowledge/versions.js";
import { LANGUAGES } from "../extensions/tutor/start.js";

describe("parseVersion", () => {
  it("reads the version from each toolchain's real output format", () => {
    expect(parseVersion("Python 3.14.8")).toBe("3.14.8");
    expect(parseVersion("rustc 1.90.0 (1159e78c4 2025-09-14)")).toBe("1.90.0");
    expect(parseVersion("go version go1.27.2-X:nodwarf5 linux/amd64")).toBe("1.27.2");
    expect(parseVersion("Lua 5.5.1  Copyright (C) 1994-2026 Lua.org, PUC-Rio")).toBe("5.5.1");
    expect(parseVersion("Version 5.9.3")).toBe("5.9.3");
    expect(parseVersion("v26.11")).toBe("26.11");
    expect(parseVersion("command not found")).toBeNull();
  });
});

describe("detectVersion", () => {
  const exec = (out: Partial<{ stdout: string; stderr: string; code: number }> | Error): { exec: Exec; calls: string[][] } => {
    const calls: string[][] = [];
    return { calls, exec: async (c, a) => { calls.push([c, ...a]); if (out instanceof Error) throw out; return { stdout: "", stderr: "", code: 0, ...out }; } };
  };
  it("runs the language's version command and parses stdout", async () => {
    const e = exec({ stdout: "Python 3.14.8\n" });
    expect(await detectVersion("python", e.exec)).toBe("3.14.8");
    expect(e.calls).toEqual([["python3", "--version"]]);
  });
  it("falls back to stderr (some versions print there)", async () => {
    expect(await detectVersion("lua", exec({ stderr: "Lua 5.4.6  Copyright" }).exec)).toBe("5.4.6");
  });
  it("returns null for a missing toolchain, a non-zero exit, a throw, or an unknown language", async () => {
    expect(await detectVersion("typescript", exec({ stderr: "tsc: not found", code: 127 }).exec)).toBeNull();
    expect(await detectVersion("go", exec(new Error("ENOENT")).exec)).toBeNull();
    expect(await detectVersion("cobol", exec({ stdout: "1.0" }).exec)).toBeNull();
  });
  it("covers every /tutor-start language with a DevDocs type", () => {
    expect(Object.keys(LANGS).sort()).toEqual([...LANGUAGES].sort());
    expect(LANGS.typescript).toEqual({ devdocsType: "typescript", command: "tsc", args: ["--version"] });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd pi-tutor && npx vitest run test/versions.test.ts`
Expected: FAIL. The module is missing.

- [ ] **Step 3: Implement**

`pi-tutor/extensions/tutor/knowledge/versions.ts`:
```ts
// Installed toolchain version per language (spec 2026-10-13 §5.1). Run by the extension, never by the model.
export type Exec = (command: string, args: string[], options?: { timeout?: number }) => Promise<{ stdout: string; stderr: string; code: number }>;

export interface LangSpec { devdocsType: string; command: string; args: string[] }

export const LANGS: Readonly<Record<string, LangSpec>> = {
  python: { devdocsType: "python", command: "python3", args: ["--version"] },
  rust: { devdocsType: "rust", command: "rustc", args: ["--version"] },
  go: { devdocsType: "go", command: "go", args: ["version"] },
  typescript: { devdocsType: "typescript", command: "tsc", args: ["--version"] },
  lua: { devdocsType: "lua", command: "lua", args: ["-v"] },
};

export function parseVersion(text: string): string | null {
  const m = /(\d+)\.(\d+)(?:\.(\d+))?/.exec(text);
  return m ? m[0] : null;
}

export async function detectVersion(language: string, exec: Exec): Promise<string | null> {
  const spec = LANGS[language];
  if (!spec) return null;
  try {
    const r = await exec(spec.command, spec.args, { timeout: 5000 });
    if (r.code !== 0) return null;
    return parseVersion(`${r.stdout}\n${r.stderr}`);
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run tests and typecheck**

Run: `cd pi-tutor && npx vitest run test/versions.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add pi-tutor/extensions/tutor/knowledge/versions.ts pi-tutor/test/versions.test.ts
git commit -m "feat(pi-tutor): detect installed toolchain versions"
```

---

### Task 2: DevDocs bundle choice and reference builder (pure)

**Files:**
- Create: `pi-tutor/extensions/tutor/knowledge/devdocs.ts`
- Test: `pi-tutor/test/devdocs.test.ts`

**Interfaces:**
- Consumes: `htmlToText` (knowledge/text.ts); `Cancelled` (progress.ts); `parseSkillHeader` (learn.ts, in the test only).
- Produces:
  ```ts
  export interface CatalogEntry { name: string; slug: string; type: string; version: string; release: string; mtime: number; db_size: number; attribution: string }
  export interface IndexEntry { name: string; path: string; type: string }
  export interface DevdocsIndex { entries: IndexEntry[]; types: { name: string; count: number; slug: string }[] }
  export interface Choice { entry: CatalogEntry; exact: boolean; note: string }
  export interface Built { files: { path: string; text: string }[]; index: string; entries: number }
  export const CHUNK_CHARS = 60_000;
  export function chooseBundle(catalog: CatalogEntry[], devdocsType: string, installed: string | null, override?: string): Choice | null;
  export function splitHtml(html: string, max?: number): string[];
  export function buildReference(index: DevdocsIndex, db: Record<string, string>, opts?: { signal?: AbortSignal; yieldEvery?: number }): Promise<Built>;
  export function referenceSkill(language: string, c: Choice, installed: string | null, index: DevdocsIndex): string;
  ```

- [ ] **Step 1: Write the failing test**

`pi-tutor/test/devdocs.test.ts`:
```ts
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
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd pi-tutor && npx vitest run test/devdocs.test.ts`
Expected: FAIL. The module is missing.

- [ ] **Step 3: Implement**

`pi-tutor/extensions/tutor/knowledge/devdocs.ts`:
```ts
import { htmlToText } from "./text.js";
import { Cancelled } from "../progress.js";

// DevDocs bundles → a tutor-<lang>-ref skill (spec 2026-10-13 §5.2). Pure apart from yielding.
export interface CatalogEntry { name: string; slug: string; type: string; version: string; release: string; mtime: number; db_size: number; attribution: string }
export interface IndexEntry { name: string; path: string; type: string }
export interface DevdocsIndex { entries: IndexEntry[]; types: { name: string; count: number; slug: string }[] }
export interface Choice { entry: CatalogEntry; exact: boolean; note: string }
export interface Built { files: { path: string; text: string }[]; index: string; entries: number }

export const CHUNK_CHARS = 60_000;
const ANCHOR = /\b(?:id|name)="([^"]+)"/g;

function majorMinor(v: string): [number, number] | null {
  const m = /^(\d+)\.(\d+)/.exec(v);
  return m ? [Number(m[1]), Number(m[2])] : null;
}
function compare(a: [number, number], b: [number, number]): number {
  return a[0] - b[0] || a[1] - b[1];
}
function newest(list: CatalogEntry[]): CatalogEntry {
  return [...list].sort((x, y) => compare(majorMinor(y.release) ?? [0, 0], majorMinor(x.release) ?? [0, 0]))[0];
}

export function chooseBundle(catalog: CatalogEntry[], devdocsType: string, installed: string | null, override?: string): Choice | null {
  if (override) {
    const pinned = catalog.find((c) => c.slug === override);
    return pinned ? { entry: pinned, exact: false, note: `docs pinned to ${override} by sources.json` } : null;
  }
  const candidates = catalog.filter((c) => c.type === devdocsType);
  if (candidates.length === 0) return null;
  const want = installed ? majorMinor(installed) : null;
  if (!want) {
    const n = newest(candidates);
    return { entry: n, exact: false, note: `${devdocsType} not detected; using the newest docs (${n.release})` };
  }
  const exact = candidates.find((c) => { const v = majorMinor(c.release); return !!v && compare(v, want) === 0; });
  if (exact) return { entry: exact, exact: true, note: "" };
  const lower = candidates.filter((c) => { const v = majorMinor(c.release); return !!v && compare(v, want) < 0; });
  if (lower.length) {
    const l = newest(lower);
    return { entry: l, exact: false, note: `docs ${l.release} for installed ${installed} (nearest lower; newer features may be missing)` };
  }
  const n = newest(candidates);
  return { entry: n, exact: false, note: `docs ${n.release} are newer than installed ${installed}: check that an item exists in ${installed} before teaching it` };
}

/** Split before <h1>-<h3> and pack sections into chunks of at most `max` HTML characters. */
export function splitHtml(html: string, max = CHUNK_CHARS): string[] {
  const out: string[] = [];
  let cur = "";
  for (const part of html.split(/(?=<h[1-3][\s>])/i)) {
    if (cur && cur.length + part.length > max) { out.push(cur); cur = ""; }
    cur += part;
  }
  if (cur || out.length === 0) out.push(cur);
  return out;
}

function safeName(page: string): string {
  return page.replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 120) || "page";
}

export async function buildReference(index: DevdocsIndex, db: Record<string, string>, opts: { signal?: AbortSignal; yieldEvery?: number } = {}): Promise<Built> {
  const files: Built["files"] = [];
  const anchorFile = new Map<string, string>();
  const firstFile = new Map<string, string>();
  const used = new Set<string>();
  let n = 0;
  for (const [page, html] of Object.entries(db)) {
    if (++n % (opts.yieldEvery ?? 25) === 0) {
      await new Promise((r) => setImmediate(r)); // keep Pi's UI responsive on 70 MB bundles
      if (opts.signal?.aborted) throw new Cancelled();
    }
    const chunks = splitHtml(html);
    let base = safeName(page);
    while (used.has(base)) base += "_";
    used.add(base);
    chunks.forEach((chunk, i) => {
      const path = `references/${base}${chunks.length > 1 ? `.${i + 1}` : ""}.md`;
      files.push({ path, text: `${htmlToText(chunk)}\n` });
      if (i === 0) firstFile.set(page, path);
      for (const m of chunk.matchAll(ANCHOR)) {
        const key = `${page}#${m[1]}`;
        if (!anchorFile.has(key)) anchorFile.set(key, path);
      }
    });
  }
  if (opts.signal?.aborted) throw new Cancelled();
  const byType = new Map<string, string[]>();
  for (const entry of index.entries) {
    const file = anchorFile.get(entry.path) ?? firstFile.get(entry.path.split("#")[0]);
    if (!file) continue;
    const list = byType.get(entry.type) ?? [];
    list.push(`- ${entry.name} → ${file}`);
    byType.set(entry.type, list);
  }
  const lines = ["# Index", "", "grep this file for a name, then read the file it points to.", ""];
  for (const [type, list] of [...byType].sort((a, b) => a[0].localeCompare(b[0]))) lines.push(`## ${type}`, ...list, "");
  return { files, index: lines.join("\n"), entries: [...byType.values()].reduce((s, l) => s + l.length, 0) };
}

export function referenceSkill(language: string, c: Choice, installed: string | null, index: DevdocsIndex): string {
  const name = `tutor-${language}-ref`;
  const topics = index.types.slice(0, 8).map((t) => t.name).join(", ") + (index.types.length > 8 ? ", …" : "");
  const description = `${c.entry.name} ${c.entry.release} reference from DevDocs (${topics}). Use when you need exact API or language details for ${language}, or to cite documentation in a hint.`.slice(0, 1024);
  return `---\nname: ${name}\ndescription: ${JSON.stringify(description)}\n---\n# ${c.entry.name} ${c.entry.release} reference\n\n` +
    `Installed ${language}: ${installed ?? "not detected"}.${c.note ? ` Note: ${c.note}.` : ""}\n\n` +
    "How to look something up:\n" +
    "1. `grep` INDEX.md in this folder for the name (a function, type, module or keyword).\n" +
    "2. `read` the file it points to.\n" +
    `3. In your hint, cite this skill (\`${name}\`) and the entry name.\n\n` +
    `Source: DevDocs \`${c.entry.slug}\`. ${htmlToText(c.entry.attribution).replace(/\s+/g, " ")}\n`;
}
```

Also in `pi-tutor/extensions/tutor/knowledge/text.ts`, widen the named-entity table. DevDocs attribution and manuals use these, and the `referenceSkill` test needs `©`. This also fixes the M5 deferred minor about raw entities:
```ts
const NAMED: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", nbsp: " ",
  copy: "©", ndash: "–", mdash: "—", lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”",
  le: "≤", ge: "≥", sect: "§", middot: "·", pi: "π", hellip: "…", times: "×", rarr: "→",
};
```

- [ ] **Step 4: Run tests and typecheck**

Run: `cd pi-tutor && npx vitest run test/devdocs.test.ts test/knowledge-text.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add pi-tutor/extensions/tutor/knowledge/devdocs.ts pi-tutor/test/devdocs.test.ts pi-tutor/extensions/tutor/knowledge/text.ts
git commit -m "feat(pi-tutor): choose DevDocs bundles by installed version and build reference skills"
```

---

### Task 3: Download, cache, atomic write; retire the M5 topic fetcher

**Files:**
- Create: `pi-tutor/extensions/tutor/knowledge/reference.ts`
- Modify: `pi-tutor/extensions/tutor/knowledge/sources.ts` (keep `sourcesPath`, replace topics with `overrideFor`)
- Delete: `pi-tutor/extensions/tutor/knowledge/fetch.ts`, `pi-tutor/prompts/system/skill-describe.md`, `pi-tutor/test/knowledge-fetch.test.ts`
- Modify: `pi-tutor/test/knowledge-text.test.ts` (drop the topics tests, add `overrideFor`)
- Test: `pi-tutor/test/reference.test.ts`

**Interfaces:**
- Consumes: `chooseBundle`, `buildReference`, `referenceSkill`, `CatalogEntry`, `DevdocsIndex` (Task 2); `Cancelled`.
- Produces:
  ```ts
  // reference.ts
  export interface RefMeta { slug: string; release: string; mtime: number; installed: string | null; note: string }
  export interface RefDeps { fetch: typeof fetch; root: string; installed: string | null; devdocsType: string; override?: string; force?: boolean; signal?: AbortSignal; timeoutMs?: number }
  export interface RefResult { status: "fetched" | "cached"; name: string; meta: RefMeta; entries: number }
  export function skillsRoot(): string;
  export function devdocsUrls(): { catalog: string; documents: string };   // PI_TUTOR_DEVDOCS overrides
  export function referenceInfo(root: string, language: string): RefMeta | null;
  export function fetchReference(language: string, d: RefDeps): Promise<RefResult>;
  // sources.ts
  export function sourcesPath(): string;
  export function overrideFor(language: string): string | undefined;   // { "<lang>": "<slug>" }
  ```

- [ ] **Step 1: Write the failing test**

`pi-tutor/test/reference.test.ts`:
```ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createServer, type Server } from "node:http";
import { mkdtempSync, readFileSync, existsSync, readdirSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import { fetchReference, referenceInfo, devdocsUrls, skillsRoot } from "../extensions/tutor/knowledge/reference.js";
import { Cancelled } from "../extensions/tutor/progress.js";
import { parseSkillHeader } from "../extensions/tutor/learn.js";

const catalog = [
  { name: "Python", slug: "python~3.14", type: "python", version: "3.14", release: "3.14.8", mtime: 100, db_size: 10, attribution: "&copy; PSF" },
  { name: "Slow", slug: "slow", type: "slow", version: "", release: "1.0", mtime: 1, db_size: 1, attribution: "" },
  { name: "Broken", slug: "broken", type: "broken", version: "", release: "1.0", mtime: 1, db_size: 1, attribution: "" },
];
const index = { entries: [{ name: "pathlib.Path.rglob", path: "library/pathlib#rglob", type: "Files" }], types: [{ name: "Files", count: 1, slug: "files" }] };
const db = { "library/pathlib": '<h1>pathlib</h1><p id="rglob">Path.rglob(pattern)</p>' };

let server: Server;
let base = "";
let hits: string[] = [];
beforeAll(async () => {
  server = createServer((req, res) => {
    const url = (req.url ?? "").split("?")[0];
    hits.push(url);
    if (url === "/docs.json") return res.end(JSON.stringify(catalog));
    if (url === "/python~3.14/index.json") return res.end(JSON.stringify(index));
    if (url === "/python~3.14/db.json") return res.end(JSON.stringify(db));
    if (url === "/broken/index.json") return res.end(JSON.stringify(index));
    if (url.startsWith("/slow/")) return; // never answers
    res.statusCode = 404; res.end("nope");
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => { server.closeAllConnections(); server.close(); });
beforeEach(() => { hits = []; process.env.PI_TUTOR_DEVDOCS = base; });

const root = () => mkdtempSync(join(tmpdir(), "pitutor-ref-"));
const deps = (dir: string, over: Record<string, unknown> = {}) => ({ fetch, root: dir, installed: "3.14.8", devdocsType: "python", ...over });

describe("fetchReference", () => {
  it("downloads the matching bundle and writes a loadable tutor-<lang>-ref skill", async () => {
    const dir = root();
    const r = await fetchReference("python", deps(dir));
    expect(r).toMatchObject({ status: "fetched", name: "tutor-python-ref", entries: 1, meta: { slug: "python~3.14", release: "3.14.8", mtime: 100, installed: "3.14.8", note: "" } });
    const skill = join(dir, "tutor-python-ref");
    expect(parseSkillHeader(readFileSync(join(skill, "SKILL.md"), "utf8")).name).toBe("tutor-python-ref");
    expect(readFileSync(join(skill, "INDEX.md"), "utf8")).toContain("- pathlib.Path.rglob → references/library_pathlib.md");
    expect(readFileSync(join(skill, "references", "library_pathlib.md"), "utf8")).toContain("Path.rglob(pattern)");
    expect(referenceInfo(dir, "python")).toEqual(r.meta);
    expect(hits).toEqual(["/docs.json", "/python~3.14/index.json", "/python~3.14/db.json"]);
  });

  it("skips the download when the same bundle build is already there, unless forced", async () => {
    const dir = root();
    await fetchReference("python", deps(dir));
    hits = [];
    expect((await fetchReference("python", deps(dir))).status).toBe("cached");
    expect(hits).toEqual(["/docs.json"]);
    expect((await fetchReference("python", deps(dir, { force: true }))).status).toBe("fetched");
  });

  it("an abort mid-download rejects with Cancelled, keeps the old skill, leaves no temp folder", async () => {
    const dir = root();
    mkdirSync(join(dir, "tutor-slow-ref"));
    writeFileSync(join(dir, "tutor-slow-ref", "SKILL.md"), "old");
    const ctl = new AbortController();
    const p = fetchReference("slow", deps(dir, { devdocsType: "slow", installed: null, signal: ctl.signal }));
    setTimeout(() => ctl.abort(), 50);
    await expect(p).rejects.toBeInstanceOf(Cancelled);
    expect(readFileSync(join(dir, "tutor-slow-ref", "SKILL.md"), "utf8")).toBe("old");
    expect(readdirSync(dir)).toEqual(["tutor-slow-ref"]);
  });

  it("a failed download (404) throws and writes nothing", async () => {
    const dir = root();
    await expect(fetchReference("broken", deps(dir, { devdocsType: "broken", installed: null }))).rejects.toThrow(/HTTP 404/);
    expect(readdirSync(dir)).toEqual([]);
  });

  it("throws when DevDocs has no bundle for the language", async () => {
    await expect(fetchReference("cobol", deps(root(), { devdocsType: "cobol" }))).rejects.toThrow(/no cobol documentation/);
  });
});

describe("devdocsUrls / skillsRoot", () => {
  it("defaults to devdocs.io and honours PI_TUTOR_DEVDOCS as one mirror base", () => {
    process.env.PI_TUTOR_DEVDOCS = "http://mirror.local/dd/";
    expect(devdocsUrls()).toEqual({ catalog: "http://mirror.local/dd/docs.json", documents: "http://mirror.local/dd" });
    delete process.env.PI_TUTOR_DEVDOCS;
    expect(devdocsUrls()).toEqual({ catalog: "https://devdocs.io/docs.json", documents: "https://documents.devdocs.io" });
  });
  it("roots skills under PI_CODING_AGENT_DIR", () => {
    const saved = process.env.PI_CODING_AGENT_DIR;
    process.env.PI_CODING_AGENT_DIR = "/agent";
    try { expect(skillsRoot()).toBe("/agent/skills"); } finally {
      if (saved === undefined) delete process.env.PI_CODING_AGENT_DIR; else process.env.PI_CODING_AGENT_DIR = saved;
    }
  });
});
```

`pi-tutor/test/knowledge-text.test.ts`: delete the whole `describe("sources", …)` block and its `SOURCES`, `topicsFor` and `LANGUAGES` imports. Add:
```ts
import { overrideFor, sourcesPath } from "../extensions/tutor/knowledge/sources.js";

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
```
(`afterEach`, `mkdtempSync`, `writeFileSync`, `tmpdir` and `join` are already imported there. Keep them.)

- [ ] **Step 2: Run to verify it fails**

Run: `cd pi-tutor && npx vitest run test/reference.test.ts test/knowledge-text.test.ts`
Expected: FAIL. `reference.js` and `overrideFor` are missing.

- [ ] **Step 3: Implement**

`pi-tutor/extensions/tutor/knowledge/reference.ts`:
```ts
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { Cancelled } from "../progress.js";
import { buildReference, chooseBundle, referenceSkill, type CatalogEntry, type DevdocsIndex } from "./devdocs.js";

// Download a DevDocs bundle into ~/.pi/agent/skills/tutor-<lang>-ref (spec 2026-10-13 §5.2).
export interface RefMeta { slug: string; release: string; mtime: number; installed: string | null; note: string }
export interface RefDeps { fetch: typeof fetch; root: string; installed: string | null; devdocsType: string; override?: string; force?: boolean; signal?: AbortSignal; timeoutMs?: number }
export interface RefResult { status: "fetched" | "cached"; name: string; meta: RefMeta; entries: number }

export function skillsRoot(): string {
  return join(process.env.PI_CODING_AGENT_DIR || join(homedir(), ".pi", "agent"), "skills");
}

/** PI_TUTOR_DEVDOCS: one base URL serving docs.json and <slug>/{index,db}.json (offline mirror; tests). */
export function devdocsUrls(): { catalog: string; documents: string } {
  const b = process.env.PI_TUTOR_DEVDOCS?.replace(/\/+$/, "");
  return b ? { catalog: `${b}/docs.json`, documents: b } : { catalog: "https://devdocs.io/docs.json", documents: "https://documents.devdocs.io" };
}

export function referenceInfo(root: string, language: string): RefMeta | null {
  try { return JSON.parse(readFileSync(join(root, `tutor-${language}-ref`, ".devdocs.json"), "utf8")) as RefMeta; } catch { return null; }
}

async function getJson<T>(url: string, d: RefDeps): Promise<T> {
  const timeout = AbortSignal.timeout(d.timeoutMs ?? 300_000);
  const signal = d.signal ? AbortSignal.any([d.signal, timeout]) : timeout;
  try {
    const res = await d.fetch(url, { signal });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    return (await res.json()) as T;
  } catch (e) {
    if (d.signal?.aborted) throw new Cancelled();
    if (e instanceof Error && e.name === "TimeoutError") throw new Error(`timed out fetching ${url}`);
    throw e;
  }
}

export async function fetchReference(language: string, d: RefDeps): Promise<RefResult> {
  const urls = devdocsUrls();
  const catalog = await getJson<CatalogEntry[]>(urls.catalog, d);
  const choice = chooseBundle(catalog, d.devdocsType, d.installed, d.override);
  if (!choice) throw new Error(`DevDocs has no ${language} documentation`);
  const name = `tutor-${language}-ref`;
  const meta: RefMeta = { slug: choice.entry.slug, release: choice.entry.release, mtime: choice.entry.mtime, installed: d.installed, note: choice.note };
  const prev = referenceInfo(d.root, language);
  if (!d.force && prev && prev.slug === meta.slug && prev.mtime === meta.mtime) return { status: "cached", name, meta: prev, entries: 0 };

  const docs = `${urls.documents}/${choice.entry.slug}`;
  const index = await getJson<DevdocsIndex>(`${docs}/index.json?${choice.entry.mtime}`, d);
  const db = await getJson<Record<string, string>>(`${docs}/db.json?${choice.entry.mtime}`, d);
  const built = await buildReference(index, db, { signal: d.signal });
  if (d.signal?.aborted) throw new Cancelled();

  // Dot-prefixed temp folder: Pi skips it and cachedSkills-style scans never match it.
  const dir = join(d.root, name);
  const tmp = join(d.root, `.${name}.tmp-${process.pid}`);
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(tmp, { recursive: true });
  for (const f of built.files) {
    mkdirSync(dirname(join(tmp, f.path)), { recursive: true });
    writeFileSync(join(tmp, f.path), f.text);
  }
  writeFileSync(join(tmp, "INDEX.md"), built.index);
  writeFileSync(join(tmp, "SKILL.md"), referenceSkill(language, choice, d.installed, index));
  writeFileSync(join(tmp, ".devdocs.json"), `${JSON.stringify(meta, null, 2)}\n`);
  rmSync(dir, { recursive: true, force: true });
  renameSync(tmp, dir);
  return { status: "fetched", name, meta, entries: built.entries };
}
```

Replace `pi-tutor/extensions/tutor/knowledge/sources.ts` with:
```ts
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

// sources.json pins a language to a DevDocs slug (spec 2026-10-13 §5.2): { "python": "python~3.12" }.
export function sourcesPath(): string {
  return process.env.PI_TUTOR_SOURCES || join(homedir(), ".config", "nvim-tutor", "sources.json");
}

export function overrideFor(language: string): string | undefined {
  try {
    const v = (JSON.parse(readFileSync(sourcesPath(), "utf8")) as Record<string, unknown>)[language];
    return typeof v === "string" && /^[a-z0-9_.~-]+$/i.test(v) ? v : undefined;
  } catch {
    return undefined;
  }
}
```

Delete `knowledge/fetch.ts`, `prompts/system/skill-describe.md` and `test/knowledge-fetch.test.ts` (`git rm`). `index.ts` still imports `fetch.ts` and `sources.ts` names; Task 4 rewires those imports. Until then the typecheck fails, which is expected, and this task's commit includes Task 4's import fix only if needed to keep the suite green. See Step 4.

- [ ] **Step 4: Run the new tests**

Run: `cd pi-tutor && npx vitest run test/reference.test.ts test/knowledge-text.test.ts test/devdocs.test.ts test/versions.test.ts`
Expected: PASS. The full suite and the typecheck are red until Task 4 rewires `index.ts`, so **don't commit yet**: Tasks 3 and 4 share one commit (end of Task 4). Record a Task 3 ruling noting this.

---

### Task 4: Wire `/tutor-docs` and `/tutor-start` to DevDocs

**Files:**
- Modify: `pi-tutor/extensions/tutor/index.ts` (`fetchDocs`, `tutor-docs`, `tutor-start`, imports)
- Modify: `pi-tutor/test/fake-pi.ts` (`pi.exec`, `PI_TUTOR_DEVDOCS`, sources file content)
- Modify: `pi-tutor/test/smoke.test.ts` (rewrite the `M5 /tutor-docs and /tutor-start docs` block)

**Interfaces:**
- Consumes: Tasks 1–3; `pi.exec`.
- Produces: `/tutor-docs [lang]` (forced refetch, then `ctx.reload()`), and `/tutor-start` fetching the reference when it is missing or stale.

- [ ] **Step 1: Update fake-pi and write the failing smoke tests**

`pi-tutor/test/fake-pi.ts`:
- Replace the `PI_TUTOR_SOURCES` block with:
  ```ts
  process.env.PI_TUTOR_DEVDOCS ??= "http://127.0.0.1:9"; // refused: tests never reach devdocs.io
  if (!process.env.PI_TUTOR_SOURCES) {
    process.env.PI_TUTOR_SOURCES = __join(__dir, "sources.json");
    __wf(process.env.PI_TUTOR_SOURCES, "{}");
  }
  ```
- In `fakePi()`, add `const execOut: Record<string, { stdout: string; stderr: string; code: number }> = {};`, and this method on `pi`:
  ```ts
  exec: async (command: string) => ({ ...(execOut[command] ?? { stdout: "", stderr: `${command}: not found`, code: 127 }), killed: false }),
  ```
  Return `execOut` too.

`pi-tutor/test/smoke.test.ts`: replace the whole `describe("M5 /tutor-docs and /tutor-start docs", …)` block with:
```ts
describe("M5-finish /tutor-docs and /tutor-start (DevDocs)", () => {
  async function mirror() {
    const { createServer } = await import("node:http");
    const catalog = [{ name: "Python", slug: "python~3.14", type: "python", version: "3.14", release: "3.14.8", mtime: 7, db_size: 1, attribution: "&copy; PSF" }];
    const server = createServer((req, res) => {
      const u = (req.url ?? "").split("?")[0];
      if (u === "/docs.json") return res.end(JSON.stringify(catalog));
      if (u === "/python~3.14/index.json") return res.end(JSON.stringify({ entries: [{ name: "len", path: "library/functions#len", type: "Built-in" }], types: [{ name: "Built-in", count: 1, slug: "b" }] }));
      if (u === "/python~3.14/db.json") return res.end(JSON.stringify({ "library/functions": '<h1>Built-in</h1><p id="len">len(s)</p>' }));
      res.statusCode = 404; res.end();
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    return { server, base: `http://127.0.0.1:${(server.address() as { port: number }).port}` };
  }

  it("/tutor-docs detects the installed version, writes tutor-python-ref, reloads Pi", async () => {
    const { existsSync } = await import("node:fs");
    const { join } = await import("node:path");
    const { server, base } = await mirror();
    const saved = process.env.PI_TUTOR_DEVDOCS;
    process.env.PI_TUTOR_DEVDOCS = base;
    try {
      const b = await boot();
      b.execOut["python3"] = { stdout: "Python 3.14.8\n", stderr: "", code: 0 };
      await b.commands["tutor-docs"].handler("python", b.ctx);
      expect(existsSync(join(process.env.PI_CODING_AGENT_DIR!, "skills", "tutor-python-ref", "INDEX.md"))).toBe(true);
      expect(b.notes.at(-1)).toMatch(/python docs: tutor-python-ref \(3\.14\.8, 1 entries\)/);
      expect(b.reloads.n).toBe(1);
    } finally { process.env.PI_TUTOR_DEVDOCS = saved; server.close(); }
  });

  it("/tutor-docs for a language without DevDocs support says the tutor relies on model knowledge", async () => {
    const b = await boot();
    await b.commands["tutor-docs"].handler("cobol", b.ctx);
    expect(b.notes.at(-1)).toMatch(/no cached docs for cobol/);
    expect(b.reloads.n).toBe(0);
  });

  it("/tutor-start fetches docs before switching; an unreachable DevDocs only warns", async () => {
    const { mkdtempSync, existsSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const root = mkdtempSync(join(tmpdir(), "pitutor-startdocs-"));
    const b = await boot({ cwd: root });
    b.replies.push(
      JSON.stringify({ projects: [1, 2, 3].map((n) => ({ title: `P${n}`, summary: "s.", size: "small", concepts: [] })) }),
      JSON.stringify({ design_md: "# D", tasks_md: "- [ ] P1.T1 x", requirements_md: "## P1.T1", entry_file: "src/main.go", run_cmd: "go run ./src" }),
    );
    b.script.push("none yet", "", "never used it", "", "small (1-2 h)", "1. P1 (small) — s.", join(root, "p1"));
    await b.commands["tutor-start"].handler("go", b.ctx);
    expect(existsSync(join(root, "p1", "spec", "tasks.md"))).toBe(true);
    expect(b.notes.some((n) => /go docs fetch failed/.test(n))).toBe(true);
    expect(b.notes.at(-1)).toContain(`cd ${join(root, "p1")} && pi`);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd pi-tutor && npx vitest run test/smoke.test.ts`
Expected: FAIL. `index.ts` still imports the deleted `fetch.ts` (a module-not-found error at import), and once that is fixed the new notes are missing.

- [ ] **Step 3: Rewire `index.ts`**

Replace the two knowledge imports with:
```ts
import { fetchReference, skillsRoot } from "./knowledge/reference.js";
import { overrideFor } from "./knowledge/sources.js";
import { LANGS, detectVersion } from "./knowledge/versions.js";
```
Replace the whole `fetchDocs` function with:
```ts
  /** Spec 2026-10-13 §5.2: the language's DevDocs bundle at the installed version → tutor-<lang>-ref. */
  async function fetchDocs(ctx: ExtensionContext, language: string, force: boolean): Promise<"fetched" | "cached" | "none" | "failed"> {
    const spec = LANGS[language];
    if (!spec) {
      ctx.ui.notify(`no cached docs for ${language}; the tutor relies on model knowledge`, "info");
      return "none";
    }
    const installed = await detectVersion(language, (command, args, options) => pi.exec(command, args, options));
    try {
      const r = await withProgress(ctx, `tutor: fetching ${language} docs (DevDocs)…`, (signal) =>
        fetchReference(language, { fetch, root: skillsRoot(), installed, devdocsType: spec.devdocsType, override: overrideFor(language), force, signal }));
      const note = r.meta.note ? ` — ${r.meta.note}` : "";
      ctx.ui.notify(r.status === "cached"
        ? `${language} docs already current (${r.name}, ${r.meta.release})`
        : `${language} docs: ${r.name} (${r.meta.release}, ${r.entries} entries)${note}`, "info");
      return r.status;
    } catch (e) {
      ctx.ui.notify(e instanceof Cancelled ? `${language} docs fetch cancelled` : `${language} docs fetch failed: ${e instanceof Error ? e.message : String(e)}`, "warning");
      return "failed";
    }
  }
```
In `tutor-docs`, delete the `if (!ctx.model) …` line (no model call any more) and change the last line to:
```ts
      if ((await fetchDocs(ctx, language, true)) === "fetched") await ctx.reload();
```
In `tutor-start`, replace the M5 line `if (cachedSkills(skillsRoot(), r.language).length === 0) await fetchDocs(ctx, r.language);` with:
```ts
      await fetchDocs(ctx, r.language, false); // cached unless missing or a newer DevDocs build
```
`learn.ts` and the `tutor-learn` command keep using `skillsRoot`, now imported from `reference.js`.

- [ ] **Step 4: Run both suites and the typecheck**

Run: `cd pi-tutor && npm test && npm run typecheck`, then the plenary command in `nvim-tutor/`.
Expected: everything PASSES, the M5 learn, guard and ease tests included. `grep -rn "fetchKnowledge\|topicsFor\|skill-describe" pi-tutor/extensions pi-tutor/test` returns nothing.

- [ ] **Step 5: Commit Tasks 3 and 4 together**

```bash
git add -A pi-tutor/extensions/tutor/knowledge pi-tutor/extensions/tutor/index.ts pi-tutor/test pi-tutor/prompts/system
git commit -m "feat(pi-tutor): DevDocs references at the installed version replace fixed doc sources"
```

---

### Task 5: Surface, docs, live check

**Files:**
- Modify: `pi-tutor/PI_SURFACE.md`, `README.md`, `docs/superpowers/specs/2026-10-07-nvim-tutor-design.md`

- [ ] **Step 1: Re-verify**

Run:
```bash
cd pi-tutor && grep -n "    exec(command: string" node_modules/@earendil-works/pi-coding-agent/dist/core/extensions/types.d.ts
grep -n "killed: boolean" node_modules/@earendil-works/pi-coding-agent/dist/core/exec.d.ts
```
Expected: both hit.

- [ ] **Step 2: `PI_SURFACE.md`**

Under "Pi extension API", add:
```markdown
- `pi.exec(command, args, { timeout })` → `{ stdout, stderr, code, killed }` (types.d.ts:1256, exec.d.ts): the
  extension (never the model) runs `python3 --version`, `rustc --version`, `go version`, `tsc --version`,
  `lua -v` to pick the DevDocs bundle.
```
Add a section:
```markdown
## DevDocs (external, verified 2026-10-13)
- Catalog `https://devdocs.io/docs.json`: `[{ name, slug, type, version, release, mtime, db_size, attribution }]`.
- Bundle `https://documents.devdocs.io/<slug>/index.json?<mtime>` → `{ entries: [{ name, path: "page#anchor", type }], types }`;
  `…/db.json?<mtime>` → `{ "<page>": "<html>" }`. `PI_TUTOR_DEVDOCS=<base>` points both at a mirror.
- Installed here: Python 3.14.8 → python~3.14; Go 1.27.2 → go 1.27.0; Lua 5.5.1 → lua~5.5; Rust 1.90 → rust 1.98
  (newer, warned); TypeScript: no tsc → newest.
```

- [ ] **Step 3: README and spec**

`README.md`: replace the first sentence of the Milestone 5 paragraph ("starting a project in Python, Rust, Go, TypeScript or Lua also fetches that language's official style, idiom and stdlib docs into Pi skills (`~/.pi/agent/skills/tutor-<lang>-*`)") with:
```markdown
starting a project in Python, Rust, Go, TypeScript or Lua also fetches that language's full
reference from DevDocs at the version installed on your machine, as a searchable Pi skill
(`~/.pi/agent/skills/tutor-<lang>-ref`); `:TutorDocs [lang]` re-fetches;
```
And replace "Custom doc sources: `~/.config/nvim-tutor/sources.json`." with "Pin a docs version: `~/.config/nvim-tutor/sources.json` (`{ \"python\": \"python~3.12\" }`)."

Spec `2026-10-07-nvim-tutor-design.md`: change the header to `rev 8, 2026-10-13: M5-finish DevDocs references at installed versions replace fixed source lists; rev 7: …`. In §7, after the M5 rulings bullet, add:
```markdown
- M5-finish (2026-10-13 design §5.2): fetched docs come from DevDocs bundles matched to the
  installed toolchain (`pi.exec`), one `tutor-<lang>-ref` skill per language with `INDEX.md` +
  `references/`. The fixed source lists and the model-written description call are retired;
  `sources.json` now pins a DevDocs slug per language.
```

- [ ] **Step 4: Run everything; live check after merge**

Run both suites.
Expected: green.

After the merge, run this through tmux with the fast default model and a temp `PI_TUTOR_PROFILE`:
1. Run `:TutorDocs python`. Expected: "python docs: tutor-python-ref (3.14.8, … entries)", and `~/.pi/agent/skills/tutor-python-ref/INDEX.md` exists.
2. Run `:TutorDocs lua`. Expected: `lua~5.5` is used (no 5.4).
3. Run `/tutor-level 10`, then ask "how do I list all .txt files in a folder recursively in Python?". Expected: the reply cites `tutor-python-ref`, and the transcript shows a `grep`/`read` inside the skill folder.
4. `/tutor-live` still passes.

Afterwards, delete the old M5 test skill folders `tutor-*-style|ownership|errors|idioms|types|narrowing|stdlib` only if an earlier run created them (`ls ~/.pi/agent/skills`). Show the user the list before removing anything.

- [ ] **Step 5: Commit**

```bash
git add pi-tutor/PI_SURFACE.md README.md docs/superpowers/specs/2026-10-07-nvim-tutor-design.md
git commit -m "docs: M5-finish surface (pi.exec, DevDocs), README, spec rev 8"
```
