# nvim-tutor M5: knowledge skills, `/tutor-learn`, ease-based start rung

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The tutor ends up holding real documentation as Pi skills:
- `/tutor-start` for a new language, or `/tutor-docs [language]`, fetches official style, idiom and stdlib docs into `~/.pi/agent/skills/tutor-<lang>-<topic>/`. Each skill gets a model-written description plus `references/*.md` with the raw text.
- `/tutor-learn` turns the last finished stuck episode into a skill draft. You edit it in Pi's editor and keep or discard it.
- The model can actually read skills: the tool guard now allows the skill folders Pi loaded.
- A rung-3 hint cites a `tutor-<lang>-*` skill by name.
- Concepts you already know well start one rung lower.

**Architecture:** New modules, each with one job:
- `knowledge/text.ts`: HTML to text, plus a size cap.
- `knowledge/sources.ts`: the built-in source lists, plus a user override file.
- `knowledge/fetch.ts`: download, one description call, then an atomic write per skill.
- `learn.ts`: pick the episode, build the prompt, check the reply, render the skill, parse its header, save it.

Changes to existing code:
- `guard.ts` takes extra read roots.
- `index.ts` derives those roots from `pi.getCommands()` (skills with their `sourceInfo.path`), and gains a generic `withProgress` (a loader in the TUI, a timeout elsewhere).
- New commands `/tutor-docs` and `/tutor-learn`; `/tutor-start` fetches docs after scaffolding.
- `ladder.ts` gains `easeStart`, applied at an episode's first judgment.
- The ladder prompt tells the model to load and cite `tutor-<lang>-*` skills at rung 3.

**Tech Stack:** Node 26 global `fetch` with `AbortSignal`. Pi 1.1.0 `pi.getCommands()` (`SlashCommandInfo.source/sourceInfo.path`), `ctx.ui.editor`, `ctx.reload()` (ExtensionCommandContext), `ctx.modelRegistry.complete`. TypeScript, vitest with a local `node:http` server (no network in tests), plenary.

**Spec:** `docs/superpowers/specs/2026-10-07-nvim-tutor-design.md` (rev 6; §5 "Concepts with ease ≥ 0.7 start one rung lower", §7 all, §8 `:TutorReload`, §9 `knowledge/fetch.ts`, §10 row M5, §11)

## Global Constraints

- Pi `^1.0`, Node ≥ 22.19 (installed 26.11.1). The extension is inert unless `PI_TUTOR=1`. Nothing writes to stdout or stderr.
- Every new Pi call is verified in `pi-tutor/node_modules/@earendil-works/pi-coding-agent/dist/core/extensions/types.d.ts` and recorded in `pi-tutor/PI_SURFACE.md` (Task 7). Already verified:
  - `pi.getCommands(): SlashCommandInfo[]` (types.d.ts:1269). It always includes every loaded skill as `{ name: "skill:<name>", source: "skill", sourceInfo: { path } }` (agent-session.js:2694-2699, independent of `enableSkillCommands`).
  - `ctx.ui.editor(title, prefill)` returns `Promise<string | undefined>` (:139).
  - `ExtensionCommandContext.reload(): Promise<void>` (:322).
  - `PI_CODING_AGENT_DIR` overrides `~/.pi/agent` (docs/environment-variables.md:81).
- Skill format (docs/skills.md):
  - A directory with `SKILL.md`, whose frontmatter has `name` and `description`.
  - Names: lowercase letters, numbers and hyphens, no leading, trailing or doubled hyphens, at most 64 characters. Descriptions: at most 1024 characters.
  - Malformed files or a missing description mean the skill is not loaded. Name collisions keep the first one found.
  - Run `/reload` after editing.
- Knowledge skills go in `~/.pi/agent/skills/tutor-<lang>-<topic>/` with `references/*.md` (spec §7). Learned skills are **never auto-saved**; `ctx.ui.editor` shows the draft for accept, edit or discard (spec §7).
- v1 source lists cover Python, Rust, Go, TypeScript and Lua. Any other language gets a visible "no cached docs" notice and relies on model knowledge (spec §7).
- The band prompt tells the model to consult `tutor-<lang>-*` skills before a rung-3 pointer and to cite the skill name (spec §7).
- Concepts with ease ≥ 0.7 start one rung lower, with a floor of 1 (spec §5).
- Tests never touch the network or the real `~/.pi/agent`. `fake-pi.ts` points `PI_CODING_AGENT_DIR` and `PI_TUTOR_SOURCES` at temp files.

## Plan decisions (deviations from the spec's letter, carried as rulings)

- **The guard allows reading inside every loaded skill's folder.** It derives these from `pi.getCommands()`, as `dirname(sourceInfo.path)` for each `source === "skill"` entry. Without this, M3's guard blocks the model from reading **any** global skill, because skills load through the `read` tool. Cost if wrong: a skill's folder can be read, but only folders Pi itself loaded as skills.
- **Source overrides are JSON, not `config.toml`.** The file is `$PI_TUTOR_SOURCES` or `~/.config/nvim-tutor/sources.json`, shaped `{ "<lang>": [{ "slug", "title", "urls": [] }] }`, and a language listed there replaces the built-in list. JSON avoids a TOML parser dependency; spec §9 lists "knowledge source overrides" as config. Cost if wrong: one loader function to swap.
- **One description call per language, not one per topic.** The model gets each topic's title and first 1500 characters and returns `{ "skills": [{ "slug", "description" }] }`. That is fewer calls on a slow provider; `completeJson` retries once.
- **HTML is turned into text with a small tag stripper.** Headings become `#`, list items become `- `, and the text is capped at 120 000 characters per reference with a truncation note. Most sources are already Markdown or `.rst` from GitHub raw.
- **A skill is written atomically.** It is built in `<dir>.tmp-<pid>`, the old `<dir>` is removed, then the new one is renamed into place, so a failed download never leaves a half skill. A re-fetch replaces the skill.
- **A topic whose downloads all fail is skipped**, and each failed URL is reported. If nothing is fetched, there is no model call.
- **Learned skills go to `~/.pi/agent/skills/tutor-<lang>-learned-<slug>/`**, which is global. The spec allows project `.pi/skills/` too, but that path makes Pi ask whether to trust the project folder (see the M4 ruling). The name must parse and is never overwritten (a `-2`, `-3`… suffix is added). After saving, `ctx.reload()` makes Pi rescan its skills.
- **The ease start rung is applied at an episode's first judgment.** Concept tags are only known once the model has judged a turn, so at `turns === 0`, if every tag in that judgment has a profile ease ≥ 0.7 for the project's language, the rung drops by one (floor 1) before the judgment is applied. It only happens inside a recorded project.
- **`/tutor-start` fetches docs after the scaffold and before the switch**, when the language has sources and no cached `tutor-<lang>-*` skills. A fetch failure is a warning; the project still opens. The new Pi then picks up the skills at startup.
- **`:TutorDocs [lang]` and `:TutorReload` are slash wrappers in Lua**, like `:TutorLevel`.

## Review Focus

1. A source URL that returns 404, times out, or is HTML: 404s and timeouts are reported and skipped; HTML becomes readable text; the other topics are still written (Task 2 test).
2. Esc during a docs fetch: no half-written skill folder is left behind, and existing skills are untouched (Task 2 test).
3. A learned-skill draft that you edit into invalid frontmatter (name removed, or bad characters): it is refused with a reason and nothing is written (Task 4 test).
4. A learned skill whose name already exists: it is saved with a `-2` suffix, and the existing skill is never overwritten (Task 4 test).
5. A tool `read` of a file inside a loaded skill folder is allowed; a sibling of that folder, or a skill folder Pi did not load, is still blocked (Task 3 test).

---

### Task 1: Text conversion and source lists

**Files:**
- Create: `pi-tutor/extensions/tutor/knowledge/text.ts`, `pi-tutor/extensions/tutor/knowledge/sources.ts`
- Test: `pi-tutor/test/knowledge-text.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // text.ts
  export const MAX_REF_CHARS = 120_000;
  export function htmlToText(html: string): string;
  export function toText(body: string, url: string, contentType?: string): string;
  export function cap(text: string, max?: number): string;
  // sources.ts
  export interface Topic { slug: string; title: string; urls: string[] }
  export const SOURCES: Readonly<Record<string, Topic[]>>;
  export function sourcesPath(): string;                       // $PI_TUTOR_SOURCES or ~/.config/nvim-tutor/sources.json
  export function topicsFor(language: string): Topic[] | undefined; // override file wins per language; [] means none
  ```

- [ ] **Step 1: Write the failing test**

`pi-tutor/test/knowledge-text.test.ts`:
```ts
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
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd pi-tutor && npx vitest run test/knowledge-text.test.ts`
Expected: FAIL. The modules are missing.

- [ ] **Step 3: Implement**

`pi-tutor/extensions/tutor/knowledge/text.ts`:
```ts
// Fetched documentation → plain text for skill references (spec §7).
export const MAX_REF_CHARS = 120_000;

const NAMED: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", nbsp: " " };

function entity(match: string, code: string): string {
  if (code[0] === "#") {
    const n = code[1] === "x" || code[1] === "X" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
    return Number.isFinite(n) ? String.fromCodePoint(n) : match;
  }
  return NAMED[code.toLowerCase()] ?? match;
}

export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style|nav|footer)\b[\s\S]*?<\/\1\s*>/gi, "")
    .replace(/<head\b[\s\S]*?<\/head\s*>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|li|pre|tr|dd|dt|table|ul|ol|section)\s*>/gi, "\n")
    .replace(/<h([1-6])\b[^>]*>/gi, (_m, n: string) => "\n" + "#".repeat(Number(n)) + " ")
    .replace(/<li\b[^>]*>/gi, "- ")
    .replace(/<[^>]+>/g, "")
    .replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, entity)
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function toText(body: string, url: string, contentType = ""): string {
  const html = /html/i.test(contentType) || /\.html?(?:$|[?#])/i.test(url) || /^\s*<(?:!doctype|html)\b/i.test(body);
  return html ? htmlToText(body) : body.trim();
}

export function cap(text: string, max = MAX_REF_CHARS): string {
  return text.length <= max ? text : `${text.slice(0, max)}\n\n[truncated: ${text.length - max} more characters at the source]`;
}
```

`pi-tutor/extensions/tutor/knowledge/sources.ts`:
```ts
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

// v1 source lists (spec §7): official style guide, idioms, stdlib/core per language. Raw text where possible.
export interface Topic { slug: string; title: string; urls: string[] }

const RAW = "https://raw.githubusercontent.com";
export const SOURCES: Readonly<Record<string, Topic[]>> = {
  python: [
    { slug: "style", title: "Python style guide (PEP 8)", urls: [`${RAW}/python/peps/main/peps/pep-0008.rst`] },
    { slug: "idioms", title: "Python control flow and idioms", urls: [`${RAW}/python/cpython/main/Doc/tutorial/controlflow.rst`] },
    { slug: "stdlib", title: "Python standard library tour", urls: [`${RAW}/python/cpython/main/Doc/tutorial/stdlib.rst`] },
  ],
  rust: [
    { slug: "style", title: "Rust API naming guidelines", urls: [`${RAW}/rust-lang/api-guidelines/master/src/naming.md`] },
    { slug: "ownership", title: "Rust ownership", urls: [`${RAW}/rust-lang/book/main/src/ch04-01-what-is-ownership.md`] },
    { slug: "errors", title: "Rust error handling with Result", urls: [`${RAW}/rust-lang/book/main/src/ch09-02-recoverable-errors-with-result.md`] },
  ],
  go: [
    { slug: "style", title: "Go code review comments", urls: [`${RAW}/golang/wiki/master/CodeReviewComments.md`] },
    { slug: "idioms", title: "Effective Go", urls: [`${RAW}/golang/website/master/_content/doc/effective_go.html`] },
  ],
  typescript: [
    { slug: "types", title: "TypeScript everyday types", urls: [`${RAW}/microsoft/TypeScript-Website/v2/packages/documentation/copy/en/handbook-v2/Everyday%20Types.md`] },
    { slug: "narrowing", title: "TypeScript narrowing", urls: [`${RAW}/microsoft/TypeScript-Website/v2/packages/documentation/copy/en/handbook-v2/Narrowing.md`] },
  ],
  lua: [
    { slug: "style", title: "Lua style guide", urls: ["http://lua-users.org/wiki/LuaStyleGuide"] },
    { slug: "stdlib", title: "Lua 5.4 reference manual", urls: ["https://www.lua.org/manual/5.4/manual.html"] },
  ],
};

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export function sourcesPath(): string {
  return process.env.PI_TUTOR_SOURCES || join(homedir(), ".config", "nvim-tutor", "sources.json");
}

function validTopic(t: unknown): t is Topic {
  const o = t as Partial<Topic> | null;
  return !!o && typeof o.slug === "string" && SLUG.test(o.slug) && typeof o.title === "string" && o.title.trim() !== ""
    && Array.isArray(o.urls) && o.urls.length > 0 && o.urls.every((u) => typeof u === "string" && /^https?:\/\//.test(u));
}

/** Built-in list, unless the override file names the language (spec §9 "knowledge source overrides"). */
export function topicsFor(language: string): Topic[] | undefined {
  let override: Record<string, unknown> = {};
  try { override = JSON.parse(readFileSync(sourcesPath(), "utf8")) as Record<string, unknown>; } catch { /* missing or broken: built-ins */ }
  if (override && typeof override === "object" && language in override) {
    const list = override[language];
    return Array.isArray(list) ? list.filter(validTopic) : [];
  }
  return SOURCES[language];
}
```

- [ ] **Step 4: Run tests and typecheck**

Run: `cd pi-tutor && npx vitest run test/knowledge-text.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add pi-tutor/extensions/tutor/knowledge/text.ts pi-tutor/extensions/tutor/knowledge/sources.ts pi-tutor/test/knowledge-text.test.ts
git commit -m "feat(pi-tutor): doc source lists and HTML-to-text for knowledge skills"
```

---

### Task 2: Fetch docs into skill folders

**Files:**
- Create: `pi-tutor/extensions/tutor/knowledge/fetch.ts`, `pi-tutor/prompts/system/skill-describe.md`
- Test: `pi-tutor/test/knowledge-fetch.test.ts`

**Interfaces:**
- Consumes: `toText`, `cap` (Task 1); `Topic` (Task 1); `completeJson`, `Complete` (llm.ts); `systemText` (prompts.ts); `Cancelled` (progress.ts).
- Produces:
  ```ts
  export function skillsRoot(): string;                         // $PI_CODING_AGENT_DIR/skills or ~/.pi/agent/skills
  export function skillName(language: string, slug: string): string; // tutor-<lang>-<slug>
  export function cachedSkills(root: string, language: string): string[]; // fetched (not learned) tutor-<lang>-* with SKILL.md
  export interface FetchDeps { fetch: typeof fetch; complete: Complete; root: string; signal?: AbortSignal; timeoutMs?: number }
  export interface FetchResult { written: string[]; failed: string[] }
  export function fetchKnowledge(language: string, topics: Topic[], d: FetchDeps): Promise<FetchResult>;
  ```

- [ ] **Step 1: Write the failing test**

`pi-tutor/test/knowledge-fetch.test.ts`:
```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer, type Server } from "node:http";
import { mkdtempSync, readFileSync, existsSync, readdirSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import { fetchKnowledge, cachedSkills, skillName, skillsRoot } from "../extensions/tutor/knowledge/fetch.js";
import { Cancelled } from "../extensions/tutor/progress.js";
import type { Complete } from "../extensions/tutor/llm.js";

let server: Server;
let base = "";
beforeAll(async () => {
  server = createServer((req, res) => {
    if (req.url === "/style.md") { res.setHeader("content-type", "text/plain"); res.end("# Naming\n\nUse snake_case for functions.\n"); }
    else if (req.url === "/errors.html") { res.setHeader("content-type", "text/html"); res.end("<html><body><h1>Errors</h1><p>Use <b>Result</b>.</p><script>x()</script></body></html>"); }
    else if (req.url === "/slow") { /* never answers */ }
    else { res.statusCode = 404; res.end("nope"); }
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => { server.closeAllConnections(); server.close(); });

const root = () => mkdtempSync(join(tmpdir(), "pitutor-skills-"));
const describeReply = (slugs: string[]) => JSON.stringify({ skills: slugs.map((s) => ({ slug: s, description: `Rust ${s} rules. Use when the learner's code touches ${s}.` })) });
function model(...replies: string[]) {
  const calls: { system: string; user: string }[] = [];
  const complete: Complete = async (system, user) => { calls.push({ system, user }); return replies.shift() ?? ""; };
  return { complete, calls };
}

describe("fetchKnowledge", () => {
  it("writes one skill per topic with a model description and the fetched text as references", async () => {
    const dir = root();
    const m = model(describeReply(["style", "errors"]));
    const r = await fetchKnowledge("rust", [
      { slug: "style", title: "Rust naming", urls: [`${base}/style.md`] },
      { slug: "errors", title: "Rust errors", urls: [`${base}/errors.html`] },
    ], { fetch, complete: m.complete, root: dir });
    expect(r).toEqual({ written: ["tutor-rust-style", "tutor-rust-errors"], failed: [] });
    const skill = readFileSync(join(dir, "tutor-rust-style", "SKILL.md"), "utf8");
    expect(skill.startsWith('---\nname: tutor-rust-style\ndescription: "Rust style rules. Use when the learner\'s code touches style."\n---\n# Rust naming\n')).toBe(true);
    expect(skill).toContain("`references/1-style.md`");
    expect(skill).toContain("tutor-rust-style");
    expect(readFileSync(join(dir, "tutor-rust-style", "references", "1-style.md"), "utf8")).toContain("Use snake_case for functions.");
    const html = readFileSync(join(dir, "tutor-rust-errors", "references", "1-errors.md"), "utf8");
    expect(html).toContain("# Errors");
    expect(html).toContain("Use Result.");
    expect(html).not.toContain("x()");
    expect(m.calls).toHaveLength(1);
    expect(m.calls[0].user).toContain("style: Rust naming");
    expect(m.calls[0].user).toContain("Use snake_case");
  });

  it("skips a topic whose urls all fail (404, timeout), reports them, writes the rest", async () => {
    const dir = root();
    const m = model(describeReply(["style"]));
    const r = await fetchKnowledge("rust", [
      { slug: "style", title: "Rust naming", urls: [`${base}/style.md`, `${base}/gone.md`] },
      { slug: "slow", title: "Never", urls: [`${base}/slow`] },
    ], { fetch, complete: m.complete, root: dir, timeoutMs: 200 });
    expect(r.written).toEqual(["tutor-rust-style"]);
    expect(r.failed.map((f) => f.split(":")[0] + ":" + f.split(":")[1] + ":" + f.split(":")[2])).toEqual([`${base}/gone.md`, `${base}/slow`]);
    expect(r.failed[0]).toMatch(/HTTP 404/);
    expect(existsSync(join(dir, "tutor-rust-slow"))).toBe(false);
  });

  it("makes no model call and writes nothing when every download fails", async () => {
    const dir = root();
    const m = model();
    const r = await fetchKnowledge("rust", [{ slug: "style", title: "x", urls: [`${base}/gone.md`] }], { fetch, complete: m.complete, root: dir });
    expect(r.written).toEqual([]);
    expect(m.calls).toHaveLength(0);
    expect(readdirSync(dir)).toEqual([]);
  });

  it("writes nothing when the description reply is rejected twice", async () => {
    const dir = root();
    const m = model('{"skills":[]}', '{"skills":[{"slug":"other","description":"x"}]}');
    await expect(fetchKnowledge("rust", [{ slug: "style", title: "x", urls: [`${base}/style.md`] }], { fetch, complete: m.complete, root: dir }))
      .rejects.toThrow(/rejected twice: .*style/);
    expect(readdirSync(dir)).toEqual([]);
  });

  it("an aborted fetch rejects with Cancelled and leaves existing skills untouched", async () => {
    const dir = root();
    mkdirSync(join(dir, "tutor-rust-style"), { recursive: true });
    writeFileSync(join(dir, "tutor-rust-style", "SKILL.md"), "old");
    const ctl = new AbortController();
    const p = fetchKnowledge("rust", [{ slug: "style", title: "x", urls: [`${base}/slow`] }], { fetch, complete: model().complete, root: dir, signal: ctl.signal, timeoutMs: 10_000 });
    setTimeout(() => ctl.abort(), 50);
    await expect(p).rejects.toBeInstanceOf(Cancelled);
    expect(readFileSync(join(dir, "tutor-rust-style", "SKILL.md"), "utf8")).toBe("old");
    expect(readdirSync(dir)).toEqual(["tutor-rust-style"]);
  });

  it("a re-fetch replaces the skill folder", async () => {
    const dir = root();
    mkdirSync(join(dir, "tutor-rust-style", "references"), { recursive: true });
    writeFileSync(join(dir, "tutor-rust-style", "references", "stale.md"), "stale");
    await fetchKnowledge("rust", [{ slug: "style", title: "x", urls: [`${base}/style.md`] }], { fetch, complete: model(describeReply(["style"])).complete, root: dir });
    expect(readdirSync(join(dir, "tutor-rust-style", "references"))).toEqual(["1-style.md"]);
  });
});

describe("cachedSkills / skillName / skillsRoot", () => {
  it("lists only fetched skills of that language that have a SKILL.md", () => {
    const dir = root();
    for (const n of ["tutor-rust-style", "tutor-rust-learned-borrow", "tutor-rustlings-x", "tutor-go-style", "tutor-rust-empty"]) mkdirSync(join(dir, n));
    for (const n of ["tutor-rust-style", "tutor-rust-learned-borrow", "tutor-rustlings-x", "tutor-go-style"]) writeFileSync(join(dir, n, "SKILL.md"), "x");
    expect(cachedSkills(dir, "rust")).toEqual(["tutor-rust-style"]);
    expect(cachedSkills(join(dir, "missing"), "rust")).toEqual([]);
    expect(skillName("rust", "style")).toBe("tutor-rust-style");
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

- [ ] **Step 2: Run to verify it fails**

Run: `cd pi-tutor && npx vitest run test/knowledge-fetch.test.ts`
Expected: FAIL. The module is missing.

- [ ] **Step 3: Implement**

`pi-tutor/prompts/system/skill-describe.md`:
```markdown
You write routing descriptions for documentation skills that a coding tutor loads on demand.

Reply with only one JSON object, no prose, in exactly this shape:

{"skills":[{"slug":"…","description":"…"}]}

- One entry per topic you are given, using its exact slug.
- Each description is one sentence of at most 300 characters: what the reference covers, then when to use it ("Use when …").
- Name concrete things the reference teaches (e.g. naming rules, Result and the ? operator), not generic praise.
```

`pi-tutor/extensions/tutor/knowledge/fetch.ts`:
```ts
import { existsSync, mkdirSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { completeJson, type Complete } from "../llm.js";
import { systemText } from "../prompts.js";
import { Cancelled } from "../progress.js";
import { cap, toText } from "./text.js";
import type { Topic } from "./sources.js";

// knowledge/fetch.ts (spec §7, §9): source lists → one skill per topic with references/*.md.
export interface FetchDeps { fetch: typeof fetch; complete: Complete; root: string; signal?: AbortSignal; timeoutMs?: number }
export interface FetchResult { written: string[]; failed: string[] }

interface Ref { file: string; url: string; text: string }

export function skillsRoot(): string {
  return join(process.env.PI_CODING_AGENT_DIR || join(homedir(), ".pi", "agent"), "skills");
}

export function skillName(language: string, slug: string): string {
  return `tutor-${language}-${slug}`;
}

export function cachedSkills(root: string, language: string): string[] {
  if (!existsSync(root)) return [];
  const prefix = `tutor-${language}-`;
  return readdirSync(root)
    .filter((n) => n.startsWith(prefix) && !n.startsWith(`${prefix}learned-`) && existsSync(join(root, n, "SKILL.md")))
    .sort();
}

function refFile(i: number, url: string): string {
  const base = decodeURIComponent(new URL(url).pathname.split("/").pop() || "doc").replace(/\.(rst|html?|md|txt)$/i, "");
  return `${i + 1}-${base.replace(/[^A-Za-z0-9._-]+/g, "-").toLowerCase() || "doc"}.md`;
}

async function download(url: string, d: FetchDeps): Promise<string> {
  const timeout = AbortSignal.timeout(d.timeoutMs ?? 30_000);
  const signal = d.signal ? AbortSignal.any([d.signal, timeout]) : timeout;
  const res = await d.fetch(url, { signal, redirect: "follow" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return cap(toText(await res.text(), url, res.headers.get("content-type") ?? ""));
}

function describePrompt(language: string, topics: { topic: Topic; refs: Ref[] }[]): string {
  return [`language: ${language}`, ...topics.map(({ topic, refs }) => `\n## ${topic.slug}: ${topic.title}\n${refs[0].text.slice(0, 1500)}`)].join("\n");
}

function checkDescriptions(slugs: string[]) {
  return (v: unknown): Record<string, string> => {
    const list = (v as { skills?: unknown } | null)?.skills;
    if (!Array.isArray(list)) throw new Error('reply must be {"skills":[…]}');
    const out: Record<string, string> = {};
    for (const e of list) {
      const o = (e ?? {}) as { slug?: unknown; description?: unknown };
      if (typeof o.slug === "string" && typeof o.description === "string" && o.description.trim()) {
        out[o.slug] = o.description.replace(/\s+/g, " ").trim().slice(0, 1024);
      }
    }
    const missing = slugs.filter((s) => !(s in out));
    if (missing.length) throw new Error(`missing descriptions for ${missing.join(", ")}`);
    return out;
  };
}

function skillText(name: string, description: string, title: string, refs: Ref[]): string {
  return `---\nname: ${name}\ndescription: ${JSON.stringify(description)}\n---\n# ${title}\n\n` +
    `Fetched reference text for the tutor. Read the files below for the full text, and name this skill (\`${name}\`) when you point the learner at it.\n\n` +
    refs.map((r) => `- \`references/${r.file}\` — from ${r.url}\n`).join("");
}

/** Build each skill in a temp sibling, then swap it in, so a failure never leaves half a skill. */
function writeSkill(root: string, name: string, text: string, refs: Ref[]): void {
  const dir = join(root, name);
  const tmp = `${dir}.tmp-${process.pid}`;
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(join(tmp, "references"), { recursive: true });
  for (const r of refs) writeFileSync(join(tmp, "references", r.file), r.text + "\n");
  writeFileSync(join(tmp, "SKILL.md"), text);
  rmSync(dir, { recursive: true, force: true });
  renameSync(tmp, dir);
}

export async function fetchKnowledge(language: string, topics: Topic[], d: FetchDeps): Promise<FetchResult> {
  const failed: string[] = [];
  const fetched: { topic: Topic; refs: Ref[] }[] = [];
  for (const topic of topics) {
    const refs: Ref[] = [];
    for (const [i, url] of topic.urls.entries()) {
      try {
        refs.push({ file: refFile(i, url), url, text: await download(url, d) });
      } catch (e) {
        if (d.signal?.aborted) throw new Cancelled();
        const reason = e instanceof Error && e.name === "TimeoutError" ? "timed out" : e instanceof Error ? e.message : String(e);
        failed.push(`${url}: ${reason}`);
      }
    }
    if (refs.length) fetched.push({ topic, refs });
  }
  if (fetched.length === 0) return { written: [], failed };
  const descriptions = await completeJson(d.complete, systemText("skill-describe"), describePrompt(language, fetched), checkDescriptions(fetched.map((f) => f.topic.slug)));
  if (d.signal?.aborted) throw new Cancelled();
  mkdirSync(d.root, { recursive: true });
  const written: string[] = [];
  for (const { topic, refs } of fetched) {
    const name = skillName(language, topic.slug);
    writeSkill(d.root, name, skillText(name, descriptions[topic.slug], topic.title, refs), refs);
    written.push(name);
  }
  return { written, failed };
}
```

- [ ] **Step 4: Run tests and typecheck**

Run: `cd pi-tutor && npx vitest run test/knowledge-fetch.test.ts && npm run typecheck`
Expected: PASS. In the "skips a topic" test, each `failed` entry starts with its URL (`http://127.0.0.1:<port>/gone.md: HTTP 404`). The test re-joins the first three `:`-separated parts to get the URL back. If Node reports the timeout as `AbortError` rather than `TimeoutError`, the reason text changes, but the URL prefix still matches.

- [ ] **Step 5: Commit**

```bash
git add pi-tutor/extensions/tutor/knowledge/fetch.ts pi-tutor/prompts/system/skill-describe.md pi-tutor/test/knowledge-fetch.test.ts
git commit -m "feat(pi-tutor): fetch language docs into tutor-<lang>-* skills"
```

---

### Task 3: Let the guard read loaded skill folders

**Files:**
- Modify: `pi-tutor/extensions/tutor/guard.ts`
- Modify: `pi-tutor/extensions/tutor/index.ts` (`tool_call` handler)
- Modify: `pi-tutor/test/fake-pi.ts` (`getCommands`, temp `PI_CODING_AGENT_DIR`/`PI_TUTOR_SOURCES`)
- Test: `pi-tutor/test/guard.test.ts`, `pi-tutor/test/smoke.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export function guardToolCall(toolName: string, input: Record<string, unknown>, cwd: string, extraRoots?: string[]): GuardResult;
  export function skillDirs(commands: { source: string; sourceInfo?: { path?: string } }[]): string[];
  ```
  `fake-pi.ts`: `fakePi()` returns `skills: { path: string }[]`, and `pi.getCommands()` maps them to `{ name, source: "skill", sourceInfo: { path } }`.

- [ ] **Step 1: Write the failing tests**

`pi-tutor/test/guard.test.ts`, add:
```ts
import { skillDirs } from "../extensions/tutor/guard.js";

describe("skill folders (M5)", () => {
  it("allows reads inside an extra root such as a loaded skill folder, and nothing next to it", () => {
    const skills = mkdtempSync(join(tmpdir(), "pitutor-skills-"));
    const dir = join(skills, "tutor-rust-style");
    mkdirSync(join(dir, "references"), { recursive: true });
    writeFileSync(join(dir, "SKILL.md"), "x");
    writeFileSync(join(skills, "secret.md"), "x");
    expect(guardToolCall("read", { path: join(dir, "SKILL.md") }, root, [dir])).toBeUndefined();
    expect(guardToolCall("read", { path: join(dir, "references", "1-style.md") }, root, [dir])).toBeUndefined();
    expect(guardToolCall("read", { path: join(skills, "secret.md") }, root, [dir])).toMatchObject({ block: true });
    expect(guardToolCall("read", { path: join(dir, "SKILL.md") }, root)).toMatchObject({ block: true });
    expect(guardToolCall("bash", { command: "cat x" }, root, [dir])).toMatchObject({ block: true });
  });
  it("derives skill folders from Pi's command list", () => {
    expect(skillDirs([
      { source: "skill", sourceInfo: { path: "/a/skills/tutor-rust-style/SKILL.md" } },
      { source: "extension", sourceInfo: { path: "/a/ext/index.ts" } },
      { source: "prompt", sourceInfo: { path: "/a/prompts/x.md" } },
      { source: "skill", sourceInfo: {} },
    ])).toEqual(["/a/skills/tutor-rust-style"]);
  });
});
```
(Merge the `skillDirs` import into the existing import line. `mkdirSync` and `writeFileSync` are already imported in this file.)

`pi-tutor/test/fake-pi.ts`:
- Add these imports at the top of the file, next to the existing one:
  ```ts
  import { mkdtempSync as __mk, writeFileSync as __wf } from "node:fs";
  import { tmpdir as __tmp } from "node:os";
  import { join as __join } from "node:path";
  ```
  and these lines below the `PI_TUTOR_PROFILE` line:
  ```ts
  // Never touch the real ~/.pi/agent or the network: temp skills root, and no built-in doc sources.
  const __dir = __mk(__join(__tmp(), "pitutor-agent-"));
  process.env.PI_CODING_AGENT_DIR ??= __dir;
  if (!process.env.PI_TUTOR_SOURCES) {
    process.env.PI_TUTOR_SOURCES = __join(__dir, "sources.json");
    __wf(process.env.PI_TUTOR_SOURCES, JSON.stringify({ python: [], rust: [], go: [], typescript: [], lua: [] }));
  }
  ```
- In `fakePi()`, add `const skills: { path: string }[] = [];`, add this method to `pi`:
  ```ts
  getCommands: () => skills.map((s) => ({ name: "skill:x", source: "skill", sourceInfo: { path: s.path } })),
  ```
  and return `skills` too.

`pi-tutor/test/smoke.test.ts`, add:
```ts
describe("M5 skill reads", () => {
  it("tool_call lets the model read a skill Pi loaded, outside the project", async () => {
    const b = await boot();
    b.skills.push({ path: "/home/u/.pi/agent/skills/tutor-rust-style/SKILL.md" });
    const call = (path: string) => b.events["tool_call"]({ type: "tool_call", toolCallId: "1", toolName: "read", input: { path } }, b.ctx);
    expect(await call("/home/u/.pi/agent/skills/tutor-rust-style/SKILL.md")).toBeUndefined();
    expect(await call("/home/u/.pi/agent/skills/tutor-rust-style/references/1-naming.md")).toBeUndefined();
    expect(await call("/home/u/.pi/agent/auth.json")).toMatchObject({ block: true });
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd pi-tutor && npx vitest run test/guard.test.ts test/smoke.test.ts`
Expected: FAIL. `skillDirs` is not exported, and the skill read is blocked.

- [ ] **Step 3: Implement**

`guard.ts`: change the signature and the final check, and add `skillDirs`:
```ts
export function guardToolCall(toolName: string, input: Record<string, unknown>, cwd: string, extraRoots: string[] = []): GuardResult {
  if (toolName === "bash") return { block: true, reason: BASH_REASON };
  if (!READ_TOOLS.has(toolName)) return { block: true, reason: `the tutor is read-only: ${toolName} is not allowed` };
  const p = input.path;
  if (p === undefined && toolName !== "read") return undefined; // defaults to cwd
  if (typeof p !== "string") return { block: true, reason: `${toolName} needs a string path inside the project` };
  const root = realpathLoose(cwd);
  const target = realpathLoose(resolveToolPath(p, cwd));
  for (const r of [root, ...extraRoots.map(realpathLoose)]) {
    const prefix = r.endsWith("/") ? r : r + "/";
    if (target === r || target.startsWith(prefix)) return undefined;
  }
  return { block: true, reason: `${p} is outside the project root ${root}; the tutor only reads project files and loaded skills` };
}

/** Folders of the skills Pi loaded (spec §7): the model reads SKILL.md and references/ through `read`. */
export function skillDirs(commands: { source: string; sourceInfo?: { path?: string } }[]): string[] {
  return commands.filter((c) => c.source === "skill" && typeof c.sourceInfo?.path === "string").map((c) => dirname(c.sourceInfo!.path!));
}
```
(`dirname` is already imported in guard.ts.)

`index.ts`: replace the `tool_call` handler:
```ts
  // Spec §8 tool fence: read-only tools inside the project root, plus the folders of skills Pi loaded (§7).
  pi.on("tool_call", (event, ctx) => guardToolCall(event.toolName, event.input as Record<string, unknown>, ctx.cwd, skillDirs(pi.getCommands())));
```
Update the import to `import { guardToolCall, skillDirs } from "./guard.js";`.

- [ ] **Step 4: Run all tests and the typecheck**

Run: `cd pi-tutor && npm test && npm run typecheck`
Expected: PASS. The existing guard test "names the refused path in the reason" still matches.

- [ ] **Step 5: Commit**

```bash
git add pi-tutor/extensions/tutor/guard.ts pi-tutor/extensions/tutor/index.ts pi-tutor/test/guard.test.ts pi-tutor/test/smoke.test.ts pi-tutor/test/fake-pi.ts
git commit -m "fix(pi-tutor): tool guard allows reading the skill folders Pi loaded"
```

---

### Task 4: `/tutor-learn`

**Files:**
- Create: `pi-tutor/extensions/tutor/learn.ts`, `pi-tutor/prompts/system/learn.md`
- Modify: `pi-tutor/extensions/tutor/index.ts` (`withProgress`, `rawComplete`, the `tutor-learn` command)
- Modify: `pi-tutor/test/fake-pi.ts` (`ui.editor`, `reload`)
- Test: `pi-tutor/test/learn.test.ts`, `pi-tutor/test/smoke.test.ts`

**Interfaces:**
- Consumes: `Episode`, `describeTrigger`, `RUNG_NAMES` (ladder.ts); `skillsRoot` (Task 2).
- Produces:
  ```ts
  export interface Learned { slug: string; description: string; body: string }
  export function lastClosedEpisode(branch: unknown[]): Episode | null;
  export function transcript(branch: unknown[], maxChars?: number): string;
  export function learnPrompt(language: string, ep: Episode, convo: string): string;
  export function checkLearned(v: unknown): Learned;
  export function renderLearned(language: string, l: Learned): string;    // full SKILL.md text, name tutor-<lang>-learned-<slug>
  export function parseSkillHeader(text: string): { name: string; description: string }; // throws with a reason
  export function saveSkill(root: string, name: string, text: string): string; // created dir; never overwrites
  ```
  In `index.ts`:
  - `rawComplete(ctx, signal): Complete`.
  - `withProgress<T>(ctx, label, run: (signal) => Promise<T>): Promise<T>`, which is a loader in the TUI and a timeout otherwise. `modelComplete` now uses it.
  - The `tutor-learn` command.

- [ ] **Step 1: Write the failing tests**

`pi-tutor/test/learn.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { mkdtempSync, readFileSync, mkdirSync, writeFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { lastClosedEpisode, transcript, learnPrompt, checkLearned, renderLearned, parseSkillHeader, saveSkill } from "../extensions/tutor/learn.js";
import { openEpisode, closeEpisode } from "../extensions/tutor/ladder.js";

const ep = (closed: boolean) => {
  const e = { ...openEpisode({ kind: "error", path: "/p/src/main.rs", line: 4, msg: "borrow of moved value" }, "beginner", 1), rung: 4, turns: 3, concept_tags: ["ownership", "move-semantics"] };
  return closed ? closeEpisode(e, "judged", 9) : e;
};
const entry = (data: unknown) => ({ type: "custom", customType: "tutor_episode", data });
const msg = (role: string, content: unknown) => ({ type: "message", message: { role, content } });

describe("lastClosedEpisode / transcript", () => {
  it("finds the newest closed episode on the branch", () => {
    expect(lastClosedEpisode([entry(ep(true)), entry(ep(false))])).toMatchObject({ closeReason: "judged" });
    expect(lastClosedEpisode([entry(ep(false))])).toBeNull();
    expect(lastClosedEpisode([])).toBeNull();
  });
  it("keeps the newest user/assistant text within the budget and skips tool calls and custom messages", () => {
    const branch = [
      msg("user", "old question"),
      msg("assistant", [{ type: "text", text: "old answer" }, { type: "toolCall", name: "read" }]),
      { type: "message", message: { role: "custom", customType: "tutor_editor", content: "[editor] secret" } },
      msg("user", [{ type: "text", text: "why moved?" }]),
      msg("assistant", [{ type: "text", text: "because String is not Copy" }]),
    ];
    const t = transcript(branch, 10_000);
    expect(t).toBe("learner: old question\ntutor: old answer\nlearner: why moved?\ntutor: because String is not Copy");
    expect(transcript(branch, 60)).toBe("learner: why moved?\ntutor: because String is not Copy"); // 54 chars; the older answer does not fit
  });
});

describe("learnPrompt / checkLearned / renderLearned", () => {
  it("puts the episode facts and conversation into the prompt", () => {
    const p = learnPrompt("rust", ep(true), "learner: why?");
    for (const s of ["language: rust", 'error "borrow of moved value" at main.rs:4', "ownership, move-semantics", "rung 4 (pseudocode)", "3 turn(s)", "learner: why?"]) expect(p).toContain(s);
  });
  it("accepts a well-formed draft and rejects bad slugs, multi-line descriptions and empty bodies", () => {
    const good = { slug: "moved-string", description: "Moving a String into a function. Use when the learner sees 'borrow of moved value'.", body: "## Misconception\n..." };
    expect(checkLearned(good)).toEqual(good);
    expect(() => checkLearned({ ...good, slug: "Moved String" })).toThrow(/slug/);
    expect(() => checkLearned({ ...good, description: "a\nb" })).toThrow(/description/);
    expect(() => checkLearned({ ...good, body: " " })).toThrow(/body/);
  });
  it("renders a SKILL.md that parses back to its name and description", () => {
    const text = renderLearned("rust", { slug: "moved-string", description: "Moving a String: use clone or borrow.", body: "## Fix pattern\nBorrow with &." });
    expect(text.startsWith("---\nname: tutor-rust-learned-moved-string\n")).toBe(true);
    expect(parseSkillHeader(text)).toEqual({ name: "tutor-rust-learned-moved-string", description: "Moving a String: use clone or borrow." });
  });
});

describe("parseSkillHeader", () => {
  it("refuses a draft edited into invalid frontmatter, with a reason", () => {
    expect(() => parseSkillHeader("no frontmatter")).toThrow(/frontmatter/);
    expect(() => parseSkillHeader("---\ndescription: x\n---\nbody")).toThrow(/name/);
    expect(() => parseSkillHeader("---\nname: Bad Name\ndescription: x\n---\n")).toThrow(/name/);
    expect(() => parseSkillHeader("---\nname: a--b\ndescription: x\n---\n")).toThrow(/name/);
    expect(() => parseSkillHeader("---\nname: ok-name\n---\n")).toThrow(/description/);
    expect(parseSkillHeader('---\nname: ok-name\ndescription: "quoted: yes"\n---\n')).toEqual({ name: "ok-name", description: "quoted: yes" });
  });
});

describe("saveSkill", () => {
  it("writes SKILL.md in a new folder and never overwrites an existing skill", () => {
    const root = mkdtempSync(join(tmpdir(), "pitutor-learn-"));
    mkdirSync(join(root, "tutor-rust-learned-x"));
    writeFileSync(join(root, "tutor-rust-learned-x", "SKILL.md"), "mine");
    const a = saveSkill(root, "tutor-rust-learned-x", "---\nname: tutor-rust-learned-x\n---\nnew");
    expect(a).toBe(join(root, "tutor-rust-learned-x-2"));
    expect(readFileSync(join(root, "tutor-rust-learned-x", "SKILL.md"), "utf8")).toBe("mine");
    expect(readFileSync(join(a, "SKILL.md"), "utf8")).toContain("name: tutor-rust-learned-x-2");
    expect(saveSkill(root, "tutor-rust-learned-x", "---\nname: tutor-rust-learned-x\n---\n")).toBe(join(root, "tutor-rust-learned-x-3"));
    expect(readdirSync(root).sort()).toEqual(["tutor-rust-learned-x", "tutor-rust-learned-x-2", "tutor-rust-learned-x-3"]);
  });
});
```

`pi-tutor/test/fake-pi.ts`, in `fakeCtx`:
- Add `const edits: (string | undefined)[] = [];`, `const editorSeen: string[] = [];` and `const reloads = { n: 0 };`.
- Add `editor: async (_title: string, prefill?: string) => { editorSeen.push(prefill ?? ""); return edits.length ? edits.shift() : prefill; },` to `ui`.
- Add `reload: async () => { reloads.n++; },` to `ctx`.
- Return `edits, editorSeen, reloads`.

`pi-tutor/test/smoke.test.ts`, add:
```ts
describe("M5 /tutor-learn", () => {
  const closedEp = { id: "ep-1", trigger: { kind: "error", path: "/p/main.rs", line: 4, msg: "borrow of moved value" }, band: "beginner", rung: 4, opened: 1, turns: 2, concept_tags: ["ownership"], closed: 5, closeReason: "judged" };
  const branch = [
    { type: "custom", customType: "tutor_episode", data: closedEp },
    { type: "message", message: { role: "user", content: "why is s moved?" } },
  ];
  const draft = JSON.stringify({ slug: "moved-string", description: "Moving a String into a call. Use when the learner sees borrow of moved value.", body: "## Fix\nBorrow with &s." });

  it("drafts from the last closed episode, shows the editor, saves the accepted text, reloads Pi", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const b = await boot({ branch });
    b.replies.push(draft);
    await b.commands["tutor-learn"].handler("", b.ctx);
    expect(b.editorSeen[0]).toContain("name: tutor-general-learned-moved-string");
    const file = join(process.env.PI_CODING_AGENT_DIR!, "skills", "tutor-general-learned-moved-string", "SKILL.md");
    expect(readFileSync(file, "utf8")).toBe(b.editorSeen[0]);
    expect(b.reloads.n).toBe(1);
    expect(b.notes.at(-1)).toMatch(/saved .*tutor-general-learned-moved-string/);
  });

  it("Esc in the editor discards: nothing written, no reload", async () => {
    const b = await boot({ branch });
    b.replies.push(JSON.stringify({ slug: "discarded-one", description: "x.", body: "y" }));
    b.edits.push(undefined);
    await b.commands["tutor-learn"].handler("", b.ctx);
    const { existsSync } = await import("node:fs");
    const { join } = await import("node:path");
    expect(existsSync(join(process.env.PI_CODING_AGENT_DIR!, "skills", "tutor-general-learned-discarded-one"))).toBe(false);
    expect(b.reloads.n).toBe(0);
    expect(b.notes.at(-1)).toMatch(/discarded/);
  });

  it("an edit that breaks the frontmatter is refused with the reason", async () => {
    const b = await boot({ branch });
    b.replies.push(draft);
    b.edits.push("---\nname: Not Valid\ndescription: x\n---\n");
    await b.commands["tutor-learn"].handler("", b.ctx);
    expect(b.notes.at(-1)).toMatch(/not saved: .*name/);
    expect(b.reloads.n).toBe(0);
  });

  it("says so when there is no finished episode yet", async () => {
    const b = await boot();
    await b.commands["tutor-learn"].handler("", b.ctx);
    expect(b.notes.at(-1)).toMatch(/no finished stuck episode/);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd pi-tutor && npx vitest run test/learn.test.ts test/smoke.test.ts`
Expected: FAIL. `learn.ts` is missing and `tutor-learn` is not registered.

- [ ] **Step 3: Implement**

`pi-tutor/prompts/system/learn.md`:
```markdown
You turn one finished tutoring episode into a short, reusable skill the tutor can load next time the learner meets the same problem.

Reply with only one JSON object, no prose, in exactly this shape:

{"slug":"kebab-case-topic","description":"…","body":"…"}

- `slug`: 2-5 lowercase words joined by single hyphens, naming the concept.
- `description`: one sentence of at most 300 characters: the concept and when to load the skill ("Use when …").
- `body`: Markdown with three sections — `## Concept` (one paragraph), `## Misconception` (what the learner believed and why it was wrong), `## Fix pattern` (the shape of the fix in words; no full solution code).
- Write for a tutor that coaches; never paste the learner's whole program.
```

`pi-tutor/extensions/tutor/learn.ts`:
```ts
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { RUNG_NAMES, describeTrigger, type Episode } from "./ladder.js";

// /tutor-learn (spec §7): last closed episode → a drafted SKILL.md the learner edits, keeps, or discards.
export interface Learned { slug: string; description: string; body: string }

const NAME = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export function lastClosedEpisode(branch: unknown[]): Episode | null {
  for (let i = branch.length - 1; i >= 0; i--) {
    const e = branch[i] as { type?: string; customType?: string; data?: Episode };
    if (e.type === "custom" && e.customType === "tutor_episode" && e.data && e.data.closed !== undefined) return e.data;
  }
  return null;
}

function textOf(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.filter((c): c is { type: "text"; text: string } => c?.type === "text" && typeof c.text === "string").map((c) => c.text).join("\n");
}

/** Newest learner/tutor lines that fit in `maxChars`, oldest first. */
export function transcript(branch: unknown[], maxChars = 8000): string {
  const lines: string[] = [];
  let used = 0;
  for (let i = branch.length - 1; i >= 0; i--) {
    const m = (branch[i] as { type?: string; message?: { role?: string; content?: unknown } }).message;
    if ((branch[i] as { type?: string }).type !== "message" || !m || (m.role !== "user" && m.role !== "assistant")) continue;
    const text = textOf(m.content).trim();
    if (!text) continue;
    const line = `${m.role === "user" ? "learner" : "tutor"}: ${text}`;
    if (used + line.length + 1 > maxChars) break;
    lines.unshift(line);
    used += line.length + 1;
  }
  return lines.join("\n");
}

export function learnPrompt(language: string, ep: Episode, convo: string): string {
  return [
    `language: ${language}`,
    `stuck on: ${describeTrigger(ep.trigger)}`,
    `concepts: ${ep.concept_tags.join(", ") || "none tagged"}`,
    `closed at rung ${ep.rung} (${RUNG_NAMES[ep.rung - 1]}) after ${ep.turns} turn(s)`,
    "",
    "conversation:",
    convo || "(none recorded)",
  ].join("\n");
}

export function checkLearned(v: unknown): Learned {
  const o = (v ?? {}) as Record<string, unknown>;
  if (typeof o.slug !== "string" || !NAME.test(o.slug) || o.slug.length > 40) throw new Error("slug must be kebab-case, at most 40 characters");
  if (typeof o.description !== "string" || !o.description.trim() || /\n/.test(o.description) || o.description.length > 1024) {
    throw new Error("description must be one non-empty line of at most 1024 characters");
  }
  if (typeof o.body !== "string" || !o.body.trim()) throw new Error("body must be non-empty markdown");
  return { slug: o.slug, description: o.description.trim(), body: o.body.trim() };
}

export function renderLearned(language: string, l: Learned): string {
  return `---\nname: tutor-${language}-learned-${l.slug}\ndescription: ${JSON.stringify(l.description)}\n---\n${l.body}\n`;
}

function unquote(v: string): string {
  const t = v.trim();
  if (t.startsWith("\"")) { try { return String(JSON.parse(t)); } catch { return t; } }
  if (t.startsWith("'") && t.endsWith("'")) return t.slice(1, -1);
  return t;
}

/** The frontmatter Pi needs to load a skill (docs/skills.md): a valid name and a description. */
export function parseSkillHeader(text: string): { name: string; description: string } {
  const m = /^---\n([\s\S]*?)\n---(?:\n|$)/.exec(text);
  if (!m) throw new Error("missing --- frontmatter --- at the top");
  const fields: Record<string, string> = {};
  for (const line of m[1].split("\n")) {
    const kv = /^([a-z-]+):\s*(.*)$/.exec(line);
    if (kv) fields[kv[1]] = unquote(kv[2]);
  }
  const name = fields.name ?? "";
  if (!NAME.test(name) || name.length > 64) throw new Error("name must be lowercase letters, digits and single hyphens, at most 64 characters");
  const description = fields.description ?? "";
  if (!description || description.length > 1024) throw new Error("description is required (at most 1024 characters)");
  return { name, description };
}

/** Writes <root>/<name>/SKILL.md; an existing name gets -2, -3, … (also rewritten in the frontmatter). */
export function saveSkill(root: string, name: string, text: string): string {
  let final = name;
  for (let n = 2; existsSync(join(root, final)); n++) final = `${name}-${n}`;
  const dir = join(root, final);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "SKILL.md"), final === name ? text : text.replace(/^(---\nname:\s*)\S+/, `$1${final}`), { flag: "wx" });
  return dir;
}
```

`index.ts`: replace `modelComplete` with these three functions:
```ts
/** Pi's model as a plain JSON-call function bound to one abort signal. */
function rawComplete(ctx: ExtensionContext, signal: AbortSignal): Complete {
  return async (system, user) => {
    const model = ctx.model;
    if (!model) throw new Error("no model selected");
    const r = await ctx.modelRegistry.complete(model, { systemPrompt: system, messages: [{ role: "user", content: [{ type: "text", text: user }], timestamp: Date.now() }] }, { signal });
    if (r.stopReason !== "stop") throw new Error(`model stopped (${r.stopReason})${r.errorMessage ? `: ${r.errorMessage}` : ""}`);
    return r.content.filter((c): c is { type: "text"; text: string } => c.type === "text").map((c) => c.text).join("\n");
  };
}

/** Run slow work behind Pi's BorderedLoader (Esc cancels) in the TUI, or just a timeout elsewhere. */
async function withProgress<T>(ctx: ExtensionContext, label: string, run: (signal: AbortSignal) => Promise<T>): Promise<T> {
  if (ctx.mode !== "tui" || typeof ctx.ui.custom !== "function") return run(AbortSignal.timeout(MODEL_TIMEOUT_MS));
  const { BorderedLoader } = await import("@earendil-works/pi-coding-agent");
  const make = (tui: unknown, theme: unknown, message: string) => new BorderedLoader(tui as never, theme as never, message, { cancellable: true });
  return withLoader(ctx.ui.custom.bind(ctx.ui) as unknown as CustomUi, make, label, run, MODEL_TIMEOUT_MS);
}

/** Each model call gets its own loader showing `label()` (spec §6 suggest/scaffold). */
function modelComplete(ctx: ExtensionContext, label: () => string): Complete {
  return (system, user) => withProgress(ctx, label(), (signal) => rawComplete(ctx, signal)(system, user));
}
```
Then add the command next to `tutor-start`:
```ts
  pi.registerCommand("tutor-learn", {
    description: "Draft a skill from the last finished stuck episode; edit it, then submit to keep or Esc to discard",
    handler: async (_args, ctx) => {
      const branch = ctx.sessionManager.getBranch() as unknown[];
      const ep = lastClosedEpisode(branch);
      if (!ep) { ctx.ui.notify("no finished stuck episode to learn from yet", "info"); return; }
      if (!ctx.model) { ctx.ui.notify("no model selected; pick one with /model first", "error"); return; }
      const language = project?.language ?? (state.language && /^[a-z0-9]+$/.test(state.language) ? state.language : "general");
      let draft: Learned;
      try {
        draft = await completeJson(modelComplete(ctx, () => "tutor: drafting a skill…"), systemText("learn"), learnPrompt(language, ep, transcript(branch)), checkLearned);
      } catch (e) {
        ctx.ui.notify(e instanceof Cancelled ? "tutor-learn cancelled" : `tutor-learn failed: ${e instanceof Error ? e.message : String(e)}`, e instanceof Cancelled ? "info" : "error");
        return;
      }
      const edited = await ctx.ui.editor("Learned skill: edit, submit to save, Esc to discard", renderLearned(language, draft));
      if (edited === undefined) { ctx.ui.notify("learned skill discarded", "info"); return; }
      let header: { name: string };
      try { header = parseSkillHeader(edited); } catch (e) { ctx.ui.notify(`not saved: ${e instanceof Error ? e.message : String(e)}`, "error"); return; }
      const dir = saveSkill(skillsRoot(), header.name, edited);
      ctx.ui.notify(`saved ${dir}; reloading skills`, "info");
      await ctx.reload();
    },
  });
```
Imports to add:
```ts
import { completeJson } from "./llm.js";
import { systemText } from "./prompts.js";
import { Cancelled } from "./progress.js";
import { lastClosedEpisode, transcript, learnPrompt, checkLearned, renderLearned, parseSkillHeader, saveSkill, type Learned } from "./learn.js";
import { skillsRoot } from "./knowledge/fetch.js";
```
Merge `completeJson` into the existing `./llm.js` import (`import { completeJson, type Complete } from "./llm.js";`) and `Cancelled` into the existing `./progress.js` import. `prompts.js` already exports `bandPrompt`, so add `systemText` to that import.

- [ ] **Step 4: Run all tests and the typecheck**

Run: `cd pi-tutor && npm test && npm run typecheck`
Expected: PASS, including the M4 loader smoke test, which now runs through `withProgress`.

- [ ] **Step 5: Commit**

```bash
git add pi-tutor/extensions/tutor/learn.ts pi-tutor/prompts/system/learn.md pi-tutor/extensions/tutor/index.ts pi-tutor/test/learn.test.ts pi-tutor/test/smoke.test.ts pi-tutor/test/fake-pi.ts
git commit -m "feat(pi-tutor): /tutor-learn drafts a skill from the last episode; edit to keep, Esc to discard"
```

---

### Task 5: Ease-based start rung and the citation rule

**Files:**
- Modify: `pi-tutor/extensions/tutor/ladder.ts` (add `easeStart`)
- Modify: `pi-tutor/extensions/tutor/index.ts` (`turn_end`)
- Modify: `pi-tutor/prompts/system/ladder.md`
- Test: `pi-tutor/test/ladder.test.ts`, `pi-tutor/test/prompts.test.ts`, `pi-tutor/test/smoke.test.ts`

**Interfaces:**
- Produces: `export function easeStart(ep: Episode, tags: string[], easeOf: (tag: string) => number | undefined): Episode;`. The rung drops by one (floor 1) when `ep.turns === 0`, `tags` is non-empty, and every tag has an ease ≥ 0.7. Otherwise `ep` is returned unchanged.

- [ ] **Step 1: Write the failing tests**

`pi-tutor/test/ladder.test.ts`, add:
```ts
import { easeStart } from "../extensions/tutor/ladder.js";

describe("easeStart (spec §5 ease ≥ 0.7 starts one rung lower)", () => {
  const ease = (m: Record<string, number>) => (t: string) => m[t];
  const ep0 = openEpisode({ kind: "chat" }, "beginner", 1); // rung 3
  it("lowers the first-turn rung when every tag is well known", () => {
    expect(easeStart(ep0, ["traits", "generics"], ease({ traits: 0.9, generics: 0.7 })).rung).toBe(2);
  });
  it("keeps the rung for an unknown or weak tag, no tags, a later turn, or rung 1", () => {
    expect(easeStart(ep0, ["traits", "lifetimes"], ease({ traits: 0.9, lifetimes: 0.4 })).rung).toBe(3);
    expect(easeStart(ep0, ["traits", "new"], ease({ traits: 0.9 })).rung).toBe(3);
    expect(easeStart(ep0, [], ease({})).rung).toBe(3);
    expect(easeStart({ ...ep0, turns: 1 }, ["traits"], ease({ traits: 1 })).rung).toBe(3);
    expect(easeStart(openEpisode({ kind: "chat" }, "pro", 1), ["traits"], ease({ traits: 1 })).rung).toBe(1);
  });
});
```
(Merge `easeStart` into the existing ladder import.)

`pi-tutor/test/prompts.test.ts`, add inside `describe("bandPrompt", …)`:
```ts
  it("tells the model to load and cite a tutor-<lang>-* skill for a rung 3 pointer (spec §7)", () => {
    expect(bandPrompt("beginner")).toMatch(/tutor-<lang>-\*/);
    expect(bandPrompt("beginner")).toMatch(/cite the skill('s)? name/i);
  });
```

`pi-tutor/test/smoke.test.ts`, add:
```ts
describe("M5 ease start rung", () => {
  it("a first judgment on concepts with ease ≥ 0.7 starts the episode one rung lower", async () => {
    const { mkdtempSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const { Profile } = await import("../extensions/tutor/profile.js");
    const dir = mkdtempSync(join(tmpdir(), "pitutor-ease-"));
    const file = join(dir, "p.sqlite");
    const seed = Profile.open(file);
    seed.saveLanguage("rust", 20, {}, 1);
    seed.addProject("rust", dir, "T", 1);
    seed.recordEpisode({ language: "rust", project: dir, concept_tags: ["traits"], rungs_used: 1, turns: 1, opened: 1, closed: 2 }, 0.9);
    seed.close();
    const saved = process.env.PI_TUTOR_PROFILE;
    process.env.PI_TUTOR_PROFILE = file;
    try {
      const b = await boot({ cwd: dir });
      await b.events["before_agent_start"]({ type: "before_agent_start", prompt: "q", systemPromptOptions: { sections: {} } }, b.ctx);
      expect(b.widgets["tutor"]?.[0]).toBe("tutor  rust · lvl 20 · rung 3");
      await b.events["turn_end"]({ type: "turn_end", message: assistant('hm\n```tutor-judgment\n{"judgment":"wrong","concept_tags":["traits"]}\n```') }, b.ctx);
      expect(b.widgets["tutor"]?.[0]).toBe("tutor  rust · lvl 20 · rung 2");
    } finally { if (saved === undefined) delete process.env.PI_TUTOR_PROFILE; else process.env.PI_TUTOR_PROFILE = saved; }
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd pi-tutor && npx vitest run test/ladder.test.ts test/prompts.test.ts test/smoke.test.ts`
Expected: FAIL. `easeStart` is missing, the prompt has no `tutor-<lang>-*` rule, and the widget stays at rung 3.

- [ ] **Step 3: Implement**

`ladder.ts`, add:
```ts
/** Spec §5: well-known concepts (ease ≥ 0.7) start one rung lower; applied at an episode's first judgment, when tags are known. */
export function easeStart(ep: Episode, tags: string[], easeOf: (tag: string) => number | undefined): Episode {
  if (ep.turns !== 0 || tags.length === 0) return ep;
  if (!tags.every((t) => (easeOf(t) ?? 0) >= 0.7)) return ep;
  return { ...ep, rung: Math.max(1, ep.rung - 1) };
}
```

`index.ts` `turn_end`: inside `if (episode) {`, before `episode = applyJudgment(...)`, add:
```ts
        if (episode.turns === 0 && project && profile) {
          let known = new Map<string, number>();
          const p = profile, lang = project.language;
          profileWrite(() => { known = new Map(p.concepts(lang).map((c) => [c.tag, c.ease])); });
          episode = easeStart(episode, j.concept_tags, (t) => known.get(t));
        }
```
(`profileWrite` already catches and warns; the name is accurate enough for a guarded profile access.) Add `easeStart` to the `./ladder.js` import.

`prompts/system/ladder.md`: replace the rung 3 line with:
```markdown
3. pointer — say where in their code to look (`path:line`) and point at a reference. Before giving it, load the matching `tutor-<lang>-*` skill (for example `tutor-rust-errors`) if one is listed, and cite the skill's name in your hint.
```

- [ ] **Step 4: Run all tests and the typecheck**

Run: `cd pi-tutor && npm test && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add pi-tutor/extensions/tutor/ladder.ts pi-tutor/extensions/tutor/index.ts pi-tutor/prompts/system/ladder.md pi-tutor/test/ladder.test.ts pi-tutor/test/prompts.test.ts pi-tutor/test/smoke.test.ts
git commit -m "feat(pi-tutor): well-known concepts start a rung lower; rung 3 cites tutor-<lang>-* skills"
```

---

### Task 6: `/tutor-docs`, docs during `/tutor-start`, Lua wrappers

**Files:**
- Modify: `pi-tutor/extensions/tutor/index.ts` (`fetchDocs`, the `tutor-docs` command, `tutor-start` integration)
- Modify: `nvim-tutor/lua/tutor/init.lua` (`:TutorDocs`, `:TutorReload`)
- Test: `pi-tutor/test/smoke.test.ts`, `nvim-tutor/tests/init_spec.lua`

**Interfaces:**
- Consumes: `topicsFor` (Task 1); `fetchKnowledge`, `cachedSkills`, `skillsRoot` (Task 2); `withProgress`, `rawComplete` (Task 4).
- Produces: `async function fetchDocs(ctx, language): Promise<"fetched" | "none" | "failed">`, plus the commands `/tutor-docs [language]` (re-fetch, then `ctx.reload()`) and `:TutorDocs [language]` / `:TutorReload`.

- [ ] **Step 1: Write the failing tests**

`pi-tutor/test/smoke.test.ts`, add:
```ts
describe("M5 /tutor-docs and /tutor-start docs", () => {
  async function docServer() {
    const { createServer } = await import("node:http");
    const server = createServer((req, res) => { if (req.url === "/style.md") res.end("# Naming\nsnake_case"); else { res.statusCode = 404; res.end(); } });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    const port = (server.address() as { port: number }).port;
    return { server, url: `http://127.0.0.1:${port}/style.md` };
  }
  async function withSources(map: Record<string, unknown>, fn: () => Promise<void>) {
    const { writeFileSync, mkdtempSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const saved = process.env.PI_TUTOR_SOURCES;
    process.env.PI_TUTOR_SOURCES = join(mkdtempSync(join(tmpdir(), "pitutor-src-")), "s.json");
    writeFileSync(process.env.PI_TUTOR_SOURCES, JSON.stringify(map));
    try { await fn(); } finally { process.env.PI_TUTOR_SOURCES = saved; }
  }

  it("/tutor-docs fetches the language's docs into skills and reloads Pi", async () => {
    const { existsSync } = await import("node:fs");
    const { join } = await import("node:path");
    const { server, url } = await docServer();
    try {
      await withSources({ rust: [{ slug: "style", title: "Rust naming", urls: [url] }] }, async () => {
        const b = await boot();
        b.replies.push(JSON.stringify({ skills: [{ slug: "style", description: "Rust naming. Use when naming things." }] }));
        await b.commands["tutor-docs"].handler("rust", b.ctx);
        expect(existsSync(join(process.env.PI_CODING_AGENT_DIR!, "skills", "tutor-rust-style", "SKILL.md"))).toBe(true);
        expect(b.notes.at(-1)).toMatch(/tutor-rust-style/);
        expect(b.reloads.n).toBe(1);
      });
    } finally { server.close(); }
  });

  it("/tutor-docs for a language without sources says the tutor relies on model knowledge", async () => {
    const b = await boot();
    await b.commands["tutor-docs"].handler("cobol", b.ctx);
    expect(b.notes.at(-1)).toMatch(/no cached docs for cobol/);
    expect(b.reloads.n).toBe(0);
  });

  it("/tutor-start fetches docs for a new language before switching; a fetch failure only warns", async () => {
    const { mkdtempSync, existsSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    await withSources({ go: [{ slug: "style", title: "Go style", urls: ["http://127.0.0.1:9/never"] }] }, async () => {
      const root = mkdtempSync(join(tmpdir(), "pitutor-startdocs-"));
      const b = await boot({ cwd: root });
      b.replies.push(
        JSON.stringify({ projects: [1, 2, 3].map((n) => ({ title: `P${n}`, summary: "s.", size: "small", concepts: [] })) }),
        JSON.stringify({ design_md: "# D", tasks_md: "- [ ] P1.T1 x", requirements_md: "## P1.T1", entry_file: "src/main.go", run_cmd: "go run ./src" }),
      );
      b.script.push("none yet", "", "never used it", "", "small (1-2 h)", "1. P1 (small) — s.", join(root, "p1"));
      await b.commands["tutor-start"].handler("go", b.ctx);
      expect(existsSync(join(root, "p1", "spec", "tasks.md"))).toBe(true);
      expect(b.notes.some((n) => /go docs: nothing fetched/.test(n))).toBe(true);
      expect(b.notes.at(-1)).toContain(`cd ${join(root, "p1")} && pi`);
    });
  });
});
```

`nvim-tutor/tests/init_spec.lua`, add inside `describe("tutor.init", …)`:
```lua
  it(":TutorDocs and :TutorReload type their slash commands into pi", function()
    local tutor = require("tutor")
    vim.cmd("Tutor")
    vim.cmd("TutorDocs rust")
    vim.cmd("TutorReload")
    local buf = tutor.state.term:bufnr()
    local has = function(s) return vim.tbl_contains(vim.api.nvim_buf_get_lines(buf, 0, -1, false), s) end
    vim.wait(1000, function() return has("/tutor-docs rust") and has("/reload") end)
    assert.is_true(has("/tutor-docs rust"))
    assert.is_true(has("/reload"))
  end)
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd pi-tutor && npx vitest run test/smoke.test.ts`, then the plenary command in `nvim-tutor/`.
Expected: FAIL. `tutor-docs` is not registered, `/tutor-start` makes no docs notice, and `:TutorDocs` does not exist.

- [ ] **Step 3: Implement**

`index.ts`: inside the factory, add:
```ts
  /** Spec §7: fetch the language's doc sources into tutor-<lang>-* skills, behind a cancellable loader. */
  async function fetchDocs(ctx: ExtensionContext, language: string): Promise<"fetched" | "none" | "failed"> {
    const topics = topicsFor(language);
    if (!topics || topics.length === 0) {
      ctx.ui.notify(`no cached docs for ${language}; the tutor relies on model knowledge`, "info");
      return "none";
    }
    try {
      const r = await withProgress(ctx, `tutor: fetching ${language} docs…`, (signal) =>
        fetchKnowledge(language, topics, { fetch, complete: rawComplete(ctx, signal), root: skillsRoot(), signal }));
      if (r.written.length === 0) {
        ctx.ui.notify(`${language} docs: nothing fetched (${r.failed.join("; ")})`, "warning");
        return "failed";
      }
      const extra = r.failed.length ? ` (failed: ${r.failed.join("; ")})` : "";
      ctx.ui.notify(`${language} docs: ${r.written.join(", ")}${extra}`, "info");
      return "fetched";
    } catch (e) {
      ctx.ui.notify(e instanceof Cancelled ? `${language} docs fetch cancelled` : `${language} docs fetch failed: ${e instanceof Error ? e.message : String(e)}`, "warning");
      return "failed";
    }
  }
```
Register:
```ts
  pi.registerCommand("tutor-docs", {
    description: "Fetch (or re-fetch) official docs for a language into tutor-<lang>-* skills",
    handler: async (args, ctx) => {
      const language = (args.trim() || project?.language || state.language || "").toLowerCase();
      if (!/^[a-z][a-z0-9+#.-]{0,30}$/.test(language)) { ctx.ui.notify("usage: /tutor-docs <language>", "warning"); return; }
      if (!ctx.model) { ctx.ui.notify("no model selected; pick one with /model first", "error"); return; }
      if ((await fetchDocs(ctx, language)) === "fetched") await ctx.reload();
    },
  });
```
In `tutor-start`, after `if (!r) return;` and before the `if (link)` switch block, add:
```ts
      if (cachedSkills(skillsRoot(), r.language).length === 0) await fetchDocs(ctx, r.language);
```
Imports:
```ts
import { topicsFor } from "./knowledge/sources.js";
import { fetchKnowledge, cachedSkills, skillsRoot } from "./knowledge/fetch.js";
```
Merge `skillsRoot` with the import added in Task 4.

`nvim-tutor/lua/tutor/init.lua`, in `M.setup` after the `TutorLearn` line:
```lua
  cmd("TutorDocs", slash("/tutor-docs"), { nargs = "?" })
  cmd("TutorReload", slash("/reload"), {})
```

- [ ] **Step 4: Run both suites and the typecheck**

Run: `cd pi-tutor && npm test && npm run typecheck`, then the plenary command.
Expected: everything PASSES. The M4 `/tutor-start` smoke tests still pass: `fake-pi` maps python, rust and the other built-ins to `[]`, so they only get the "no cached docs" notice and make no network call.

- [ ] **Step 5: Commit**

```bash
git add pi-tutor/extensions/tutor/index.ts pi-tutor/test/smoke.test.ts nvim-tutor/lua/tutor/init.lua nvim-tutor/tests/init_spec.lua
git commit -m "feat: /tutor-docs, docs fetched on /tutor-start, :TutorDocs and :TutorReload"
```

---

### Task 7: Surface, docs, live check

**Files:**
- Modify: `pi-tutor/PI_SURFACE.md`, `README.md`, `docs/superpowers/specs/2026-10-07-nvim-tutor-design.md`

- [ ] **Step 1: Re-verify the surface** (pi-surface-check)

Run:
```bash
cd pi-tutor && T=node_modules/@earendil-works/pi-coding-agent/dist/core/extensions/types.d.ts
grep -n "getCommands(): SlashCommandInfo\|editor(title\|    reload(): Promise" $T
grep -n "source: \"skill\"" node_modules/@earendil-works/pi-coding-agent/dist/core/agent-session.js
```
Expected: every grep hits.

- [ ] **Step 2: `PI_SURFACE.md`**

Under "Pi extension API", add:
```markdown
- `pi.getCommands()` → `SlashCommandInfo[]`; skills appear as `{ source: "skill", sourceInfo: { path: <SKILL.md> } }`
  regardless of `enableSkillCommands` (agent-session.js:2694). `guard.ts` allows `read/grep/find/ls` inside
  `dirname(path)` of each, because skills load through the `read` tool.
- `ctx.ui.editor(title, prefill)` → `string | undefined` (types.d.ts:139): the `/tutor-learn` draft; Esc = discard.
- `ctx.reload()` (ExtensionCommandContext, types.d.ts:322) after saving or fetching skills, so Pi rescans them.
- Skill format (docs/skills.md): `SKILL.md` frontmatter `name` (lowercase, digits, single hyphens, ≤ 64) and
  `description` (≤ 1024); malformed or description-less skills are not loaded. Global root
  `$PI_CODING_AGENT_DIR/skills` (default `~/.pi/agent/skills`).
```

- [ ] **Step 3: README and spec**

`README.md`: after the Milestone 4 paragraph, add:
```markdown
Milestone 5 done (2026-10-12): starting a project in Python, Rust, Go, TypeScript or Lua also
fetches that language's official style, idiom and stdlib docs into Pi skills
(`~/.pi/agent/skills/tutor-<lang>-*`); `:TutorDocs [lang]` re-fetches. When the tutor points
you at a reference (rung 3) it names the skill. After a stuck episode, `:TutorLearn` drafts a
skill from it in Pi's editor — edit and submit to keep, Esc to discard. Concepts you've shown
you know start one hint rung lower. Custom doc sources: `~/.config/nvim-tutor/sources.json`.
```
Update the Plans bullet with `, M5 knowledge/learn`.

Spec: change the header to `rev 7, 2026-10-12: M5 skill reads in the guard, JSON source overrides, learned skills global, ease applied at first judgment; rev 6: …`. In §7, after the "Learned skills" bullet, add:
```markdown
- M5 rulings: the tool guard also allows reads inside every skill folder Pi loaded
  (`pi.getCommands()` skill paths), since skills load through `read`. Source overrides live in
  `~/.config/nvim-tutor/sources.json` (`{ "<lang>": [{ "slug", "title", "urls" }] }`; a listed
  language replaces the built-in list). Learned skills are saved globally as
  `tutor-<lang>-learned-<slug>` (project `.pi/skills` would trigger Pi's trust prompt). The
  ease start rung is applied at an episode's first judgment, when its concept tags are known.
```

- [ ] **Step 4: Run everything; live check after merge**

Run both suites.
Expected: green.

After the merge, run the live check through tmux, using the fast default model (`nvidia/nemotron-3.5-lightning-30b-a3b`) and a temp `PI_TUTOR_PROFILE`:
1. In a temp project folder, run `:TutorDocs rust`. Expected: a notice listing `tutor-rust-style, tutor-rust-ownership, tutor-rust-errors`, the folders exist under `~/.pi/agent/skills/`, and Pi reloads.
2. Run `/tutor-level 10` (beginner, start rung 3), then ask "how should I handle a function that can fail in Rust?". Expected: the reply names a `tutor-rust-*` skill, and Pi's transcript shows a `read` of that skill's `SKILL.md` that the guard did not block.
3. `/tutor-live` still passes (M3 regression).

The live check writes real skills into `~/.pi/agent/skills/` (the intended feature). The temp profile is deleted afterwards.

- [ ] **Step 5: Commit**

```bash
git add pi-tutor/PI_SURFACE.md README.md docs/superpowers/specs/2026-10-07-nvim-tutor-design.md
git commit -m "docs: M5 surface, README status, spec rev 7"
```
