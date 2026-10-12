# nvim-tutor M2: band prompts, `/tutor-level`, judgment block

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The tutor's voice changes with the level slider (beginner / intermediate / pro band prompts injected per turn), each turn carries band-scoped editor context pulled from Neovim, `/tutor-level` persists across session resume, and the model's trailing `tutor-judgment` block is parsed on `turn_end` and shown in the widget.

**Architecture:** Pure modules `policy.ts` (band table, thresholds, start rung), `judgment.ts` (fenced-block parser), `prompts.ts` (reads `prompts/system/<band>.md`), `context.ts` (formats an editor snapshot). `nvim.ts` gains one `snapshot()` pull. `index.ts` wires `before_agent_start` (set `systemPromptOptions.sections.tutor`, return a hidden `tutor_editor` custom message with the snapshot) and `turn_end` (parse judgment → widget + `tutor_judgment` entry); `/tutor-level` writes a `tutor_level` entry that `session_start` restores from the session branch.

**Tech Stack:** Pi 1.1.0 extension API (`before_agent_start`, `turn_end`, `appendEntry`, `sessionManager.getBranch`), TypeScript, `neovim` npm client 5.5 over `$NVIM`, vitest with a real headless Neovim.

**Spec:** `docs/superpowers/specs/2026-10-07-nvim-tutor-design.md` (rev 3, sections 4, 5, 9, 10 row M2, 11)

## Global Constraints

- Pi `^1.0`, Node ≥ 22.19, unmodified upstream Pi; Pi runs with `--tools read,grep,find,ls`.
- Nothing in the extension may write to stdout/stderr (Pi's full-screen TUI). No `console.*`.
- Every new Pi or Neovim API call is verified in `pi-tutor/node_modules/@earendil-works/pi-coding-agent/dist/core/extensions/types.d.ts` and listed in `pi-tutor/PI_SURFACE.md` (Task 6).
- Only buffers whose path is inside the project root (`root + "/"` after `realpath`) are ever read.
- Band prompt goes into `systemPromptOptions.sections` — never replace Pi's whole system prompt (spec §4).
- Widget lines stay ≤ 44 display cells.
- Bands: beginner 0–33, intermediate 34–66, pro 67–100. Start rung: beginner 3, intermediate 2, pro 1. Editor pull: beginner = whole buffer + diagnostics; intermediate/pro = diagnostics + 40 lines around the cursor (spec §4).
- Judgment block: fenced ` ```tutor-judgment ` JSON `{judgment: correct|partial|wrong|none, concept_tags: [], task_done_ids: [], episode_closed: bool}` (spec §5).
- One module per responsibility; tests in `pi-tutor/test/<module>.test.ts`.

## Plan decisions (deviations from the spec's letter, carried as rulings)

- **Editor context is a hidden custom message, not a prompt section.** `before_agent_start` returns `{ message: { customType: "tutor_editor", display: false } }`. The band prompt is stable per band so it lives in a section (cache-friendly); the snapshot changes every turn so it is a per-turn message. Cost if wrong: snapshots accumulate in context until compaction.
- **Threshold interpolation anchors at band midpoints** (17 → beginner values, 50 → intermediate, 83 → pro), clamped outside. The spec says "scales linearly between the band's neighbours" without anchors. Cost if wrong: M3 tunes two numbers.
- **Default level is 50** until `/tutor-level` or the profile (M4) sets one. Cost if wrong: a newcomer's first turn is intermediate-voiced until they run `:TutorLevel`.
- **A turn without a judgment block shows `judged missing`** in the widget so prompt drift is visible. Turns that end in tool calls are not judged.
- **Prompt files are read at runtime** from `prompts/system/` via `import.meta.url` (spec §9 layout). `package.json`'s `"prompts": ["./prompts/*.md"]` glob is non-recursive, so Pi does not register them as `/` templates.
- **Whole-buffer snapshots are capped at 400 lines**, with a truncation note.

## Review Focus

1. Pi started outside Neovim: `before_agent_start` must still set the band section and return no message; `turn_end` must still parse (Task 5 test).
2. A current buffer outside the project root: `snapshot()` returns `null`, no editor message is sent (Task 4 test).
3. A model reply with two `tutor-judgment` blocks, or malformed JSON inside one: last block wins; malformed → `null`, never a throw inside `turn_end` (Task 2 tests).
4. Session resume with several `tutor_level` entries on the branch: the latest wins (Task 5 test).
5. Cursor on line 1 or past the last line in window mode: `from` is clamped to 1 and the Lua call never errors (Task 4 test).

---

### Task 1: Policy module (band table, thresholds, start rung)

**Files:**
- Create: `pi-tutor/extensions/tutor/policy.ts`
- Test: `pi-tutor/test/policy.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type Band = "beginner" | "intermediate" | "pro";
  export const DEFAULT_LEVEL = 50;
  export function bandFor(level: number): Band;
  export function startRung(band: Band): 1 | 2 | 3;
  export function thresholds(level: number): { errorMs: number; idleMs: number };
  ```

- [ ] **Step 1: Write the failing test**

`pi-tutor/test/policy.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { bandFor, startRung, thresholds, DEFAULT_LEVEL } from "../extensions/tutor/policy.js";

describe("bandFor", () => {
  it("splits 0-33 / 34-66 / 67-100", () => {
    expect(bandFor(0)).toBe("beginner");
    expect(bandFor(33)).toBe("beginner");
    expect(bandFor(34)).toBe("intermediate");
    expect(bandFor(66)).toBe("intermediate");
    expect(bandFor(67)).toBe("pro");
    expect(bandFor(100)).toBe("pro");
  });
  it("clamps out-of-range input", () => {
    expect(bandFor(-5)).toBe("beginner");
    expect(bandFor(140)).toBe("pro");
  });
  it("defaults to intermediate", () => {
    expect(bandFor(DEFAULT_LEVEL)).toBe("intermediate");
  });
});

describe("startRung", () => {
  it("is 3 / 2 / 1 by band", () => {
    expect(startRung("beginner")).toBe(3);
    expect(startRung("intermediate")).toBe(2);
    expect(startRung("pro")).toBe(1);
  });
});

describe("thresholds", () => {
  const MIN = 60_000;
  it("returns the band table values at band midpoints", () => {
    expect(thresholds(17)).toEqual({ errorMs: 0, idleMs: 2 * MIN });
    expect(thresholds(50)).toEqual({ errorMs: 1 * MIN, idleMs: 5 * MIN });
    expect(thresholds(83)).toEqual({ errorMs: 3 * MIN, idleMs: 10 * MIN });
  });
  it("interpolates linearly between midpoints and clamps outside", () => {
    expect(thresholds(0)).toEqual({ errorMs: 0, idleMs: 2 * MIN });
    expect(thresholds(100)).toEqual({ errorMs: 3 * MIN, idleMs: 10 * MIN });
    const mid = thresholds(33.5); // halfway between 17 and 50
    expect(mid.errorMs).toBe(0.5 * MIN);
    expect(mid.idleMs).toBe(3.5 * MIN);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd pi-tutor && npx vitest run test/policy.test.ts`
Expected: FAIL — `Failed to resolve import "../extensions/tutor/policy.js"`

- [ ] **Step 3: Write minimal implementation**

`pi-tutor/extensions/tutor/policy.ts`:
```ts
// Level policy (spec §4): one integer 0-100 → band, start rung, stuck thresholds.
export type Band = "beginner" | "intermediate" | "pro";

export const DEFAULT_LEVEL = 50;

const MIN = 60_000;

/** Band table values, anchored at each band's midpoint for interpolation. */
const ANCHORS: { level: number; band: Band; errorMs: number; idleMs: number }[] = [
  { level: 17, band: "beginner", errorMs: 0, idleMs: 2 * MIN },
  { level: 50, band: "intermediate", errorMs: 1 * MIN, idleMs: 5 * MIN },
  { level: 83, band: "pro", errorMs: 3 * MIN, idleMs: 10 * MIN },
];

function clamp(level: number): number {
  return Math.min(100, Math.max(0, level));
}

export function bandFor(level: number): Band {
  const l = clamp(level);
  return l <= 33 ? "beginner" : l <= 66 ? "intermediate" : "pro";
}

export function startRung(band: Band): 1 | 2 | 3 {
  return band === "beginner" ? 3 : band === "intermediate" ? 2 : 1;
}

export function thresholds(level: number): { errorMs: number; idleMs: number } {
  const l = clamp(level);
  const first = ANCHORS[0], last = ANCHORS[ANCHORS.length - 1];
  if (l <= first.level) return { errorMs: first.errorMs, idleMs: first.idleMs };
  if (l >= last.level) return { errorMs: last.errorMs, idleMs: last.idleMs };
  for (let i = 1; i < ANCHORS.length; i++) {
    const a = ANCHORS[i - 1], b = ANCHORS[i];
    if (l <= b.level) {
      const t = (l - a.level) / (b.level - a.level);
      return { errorMs: a.errorMs + t * (b.errorMs - a.errorMs), idleMs: a.idleMs + t * (b.idleMs - a.idleMs) };
    }
  }
  return { errorMs: last.errorMs, idleMs: last.idleMs };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd pi-tutor && npx vitest run test/policy.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add pi-tutor/extensions/tutor/policy.ts pi-tutor/test/policy.test.ts
git commit -m "feat(pi-tutor): level policy — bands, start rung, thresholds"
```

---

### Task 2: Judgment block parser

**Files:**
- Create: `pi-tutor/extensions/tutor/judgment.ts`
- Test: `pi-tutor/test/judgment.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type JudgmentValue = "correct" | "partial" | "wrong" | "none";
  export interface Judgment { judgment: JudgmentValue; concept_tags: string[]; task_done_ids: string[]; episode_closed: boolean }
  export function parseJudgment(text: string): Judgment | null;
  ```

- [ ] **Step 1: Write the failing test**

`pi-tutor/test/judgment.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { parseJudgment } from "../extensions/tutor/judgment.js";

const block = (json: string) => "Some explanation.\n\n```tutor-judgment\n" + json + "\n```\n";

describe("parseJudgment", () => {
  it("parses a well-formed trailing block", () => {
    const j = parseJudgment(block('{"judgment":"correct","concept_tags":["ownership"],"task_done_ids":["P1.T1"],"episode_closed":true}'));
    expect(j).toEqual({ judgment: "correct", concept_tags: ["ownership"], task_done_ids: ["P1.T1"], episode_closed: true });
  });
  it("fills missing optional fields with defaults", () => {
    expect(parseJudgment(block('{"judgment":"partial"}'))).toEqual({ judgment: "partial", concept_tags: [], task_done_ids: [], episode_closed: false });
  });
  it("returns null when there is no block", () => {
    expect(parseJudgment("just prose")).toBeNull();
    expect(parseJudgment("```json\n{\"judgment\":\"correct\"}\n```")).toBeNull();
  });
  it("returns null on malformed JSON or an unknown judgment value", () => {
    expect(parseJudgment(block("{judgment: correct}"))).toBeNull();
    expect(parseJudgment(block('{"judgment":"excellent"}'))).toBeNull();
    expect(parseJudgment(block('"a string"'))).toBeNull();
  });
  it("uses the last block when there are several", () => {
    const text = block('{"judgment":"wrong"}') + "more\n" + block('{"judgment":"none"}');
    expect(parseJudgment(text)?.judgment).toBe("none");
  });
  it("drops non-string entries from the tag arrays", () => {
    const j = parseJudgment(block('{"judgment":"correct","concept_tags":["a",1,null],"task_done_ids":[2,"P1.T2"]}'));
    expect(j?.concept_tags).toEqual(["a"]);
    expect(j?.task_done_ids).toEqual(["P1.T2"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd pi-tutor && npx vitest run test/judgment.test.ts`
Expected: FAIL — `Failed to resolve import "../extensions/tutor/judgment.js"`

- [ ] **Step 3: Write minimal implementation**

`pi-tutor/extensions/tutor/judgment.ts`:
```ts
// Parses the fenced `tutor-judgment` JSON block the band prompt asks the model to end every turn with (spec §5).
export type JudgmentValue = "correct" | "partial" | "wrong" | "none";

export interface Judgment {
  judgment: JudgmentValue;
  concept_tags: string[];
  task_done_ids: string[];
  episode_closed: boolean;
}

const VALUES: readonly JudgmentValue[] = ["correct", "partial", "wrong", "none"];
const FENCE = /```tutor-judgment[ \t]*\r?\n([\s\S]*?)```/g;

function strings(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

export function parseJudgment(text: string): Judgment | null {
  let body: string | null = null;
  for (const m of text.matchAll(FENCE)) body = m[1];
  if (body === null) return null;
  let raw: unknown;
  try { raw = JSON.parse(body.trim()); } catch { return null; }
  if (typeof raw !== "object" || raw === null) return null;
  const o = raw as Record<string, unknown>;
  if (!VALUES.includes(o.judgment as JudgmentValue)) return null;
  return {
    judgment: o.judgment as JudgmentValue,
    concept_tags: strings(o.concept_tags),
    task_done_ids: strings(o.task_done_ids),
    episode_closed: o.episode_closed === true,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd pi-tutor && npx vitest run test/judgment.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add pi-tutor/extensions/tutor/judgment.ts pi-tutor/test/judgment.test.ts
git commit -m "feat(pi-tutor): parse the tutor-judgment block"
```

---

### Task 3: Band prompt files and loader

**Files:**
- Create: `pi-tutor/prompts/system/beginner.md`, `pi-tutor/prompts/system/intermediate.md`, `pi-tutor/prompts/system/pro.md`, `pi-tutor/prompts/system/judgment.md`
- Create: `pi-tutor/extensions/tutor/prompts.ts`
- Test: `pi-tutor/test/prompts.test.ts`

**Interfaces:**
- Consumes: `Band` from Task 1.
- Produces: `export function bandPrompt(band: Band): string` — the band file's text followed by `judgment.md`. Each band file begins with the line `# Tutor band: <band>`.

- [ ] **Step 1: Write the failing test**

`pi-tutor/test/prompts.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { bandPrompt } from "../extensions/tutor/prompts.js";

describe("bandPrompt", () => {
  it("starts with the band marker line", () => {
    expect(bandPrompt("beginner").startsWith("# Tutor band: beginner\n")).toBe(true);
    expect(bandPrompt("intermediate").startsWith("# Tutor band: intermediate\n")).toBe(true);
    expect(bandPrompt("pro").startsWith("# Tutor band: pro\n")).toBe(true);
  });
  it("appends the shared judgment protocol to every band", () => {
    for (const b of ["beginner", "intermediate", "pro"] as const) {
      expect(bandPrompt(b)).toContain("```tutor-judgment");
      expect(bandPrompt(b)).toContain('"episode_closed"');
    }
  });
  it("gives each band a distinct voice", () => {
    const set = new Set([bandPrompt("beginner"), bandPrompt("intermediate"), bandPrompt("pro")]);
    expect(set.size).toBe(3);
    expect(bandPrompt("pro")).toMatch(/never write code/i);
    expect(bandPrompt("beginner")).toMatch(/why each part exists/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd pi-tutor && npx vitest run test/prompts.test.ts`
Expected: FAIL — `Failed to resolve import "../extensions/tutor/prompts.js"`

- [ ] **Step 3: Write the prompt files**

`pi-tutor/prompts/system/judgment.md`:
```markdown
## Turn protocol

You are a tutor inside the learner's editor. You have read-only tools and never edit files. The learner writes all the code. Keep replies short: the pane is 45 columns wide, so prefer 6-12 short lines over paragraphs. When you point at code, cite it as `path:line` using the editor context you were given.

End EVERY reply with exactly one fenced block tagged `tutor-judgment` containing one JSON object, and write nothing after it:

```tutor-judgment
{"judgment":"correct","concept_tags":["example-tag"],"task_done_ids":[],"episode_closed":false}
```

- `judgment`: how the learner's latest reasoning holds up — `correct`, `partial`, `wrong`, or `none` when they asked something without reasoning about it.
- `concept_tags`: 1-3 short kebab-case tags for the concepts in play (e.g. `borrow-checker`, `list-comprehension`).
- `task_done_ids`: ids like `P1.T2.S3` from `spec/tasks.md` the learner clearly completed this turn, else `[]`.
- `episode_closed`: `true` only when the problem the learner was stuck on is resolved.
```

`pi-tutor/prompts/system/beginner.md`:
```markdown
# Tutor band: beginner

You teach a beginner. Explain how the code is structured, what each syntax element means, and why each part exists. Assume nothing is obvious: name the construct, say what it does, then say why it is there.

- Walk through the learner's own code line by line when they are confused; use the editor context, not hypothetical code.
- You may show a tiny snippet (1-3 lines) to illustrate a syntax form, but never the solution to their task and never a rewrite of their code.
- When there is an error, start from the exact message, say what the compiler or interpreter was trying to do, and ask what they think the fix is before you reveal it.
- Prefer one idea per reply. End with one concrete thing to try.
```

`pi-tutor/prompts/system/intermediate.md`:
```markdown
# Tutor band: intermediate

You coach an intermediate learner. Name the concept behind their situation and point them at where to read about it; do not spell out the mechanics they can work out themselves.

- Lead with the concept's name and a one-sentence definition, then where it applies in their code (`path:line`).
- Point at documentation or a skill by name rather than quoting it at length.
- Do not write the solution. If they are stuck after two exchanges, give the shape of the fix in words, not code.
- Ask one guiding question per reply.
```

`pi-tutor/prompts/system/pro.md`:
```markdown
# Tutor band: pro

You advise an experienced developer learning a new language. Give hints and knowledge only: idioms, pitfalls, what the standard library already offers, how this language differs from the ones they know.

- Never write code, not even pseudocode. Describe the idea and let them write it.
- Be terse: a hint is one or two sentences. Expand only if asked.
- Cite the relevant doc, RFC, or skill by name when one exists.
- Flag non-idiomatic patterns you notice in the editor context, briefly.
```

- [ ] **Step 4: Write the loader**

`pi-tutor/extensions/tutor/prompts.ts`:
```ts
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { Band } from "./policy.js";

// prompts/system/<band>.md + judgment.md (spec §4, §9). Read lazily and cached; files are tiny.
const DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "prompts", "system");
const cache = new Map<string, string>();

function read(name: string): string {
  let text = cache.get(name);
  if (text === undefined) {
    text = readFileSync(join(DIR, `${name}.md`), "utf8").trimEnd();
    cache.set(name, text);
  }
  return text;
}

export function bandPrompt(band: Band): string {
  return `${read(band)}\n\n${read("judgment")}\n`;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd pi-tutor && npx vitest run test/prompts.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 6: Commit**

```bash
git add pi-tutor/prompts/system pi-tutor/extensions/tutor/prompts.ts pi-tutor/test/prompts.test.ts
git commit -m "feat(pi-tutor): band system prompts and loader"
```

---

### Task 4: Editor snapshot pull and formatter

**Files:**
- Modify: `pi-tutor/extensions/tutor/nvim.ts` (add `EditorSnapshot`, `snapshot()`)
- Create: `pi-tutor/extensions/tutor/context.ts`
- Test: `pi-tutor/test/nvim.test.ts` (append), `pi-tutor/test/context.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // nvim.ts
  export interface EditorSnapshot {
    path: string; filetype: string; cursor: number;   // cursor is 1-based
    from: number;                                     // 1-based first line of `lines`
    lines: string[];
    diagnostics: { line: number; severity: number; msg: string }[];
  }
  NvimLink.prototype.snapshot(mode: "full" | "window", radius?: number): Promise<EditorSnapshot | null>;
  // context.ts
  export const MAX_SNAPSHOT_LINES = 400;
  export function formatEditorContext(s: EditorSnapshot): string;
  ```

- [ ] **Step 1: Write the failing formatter test**

`pi-tutor/test/context.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { formatEditorContext, MAX_SNAPSHOT_LINES } from "../extensions/tutor/context.js";
import type { EditorSnapshot } from "../extensions/tutor/nvim.js";

const snap = (over: Partial<EditorSnapshot> = {}): EditorSnapshot => ({
  path: "/p/src/a.py", filetype: "python", cursor: 2, from: 1,
  lines: ["x = 1", "y = x +", "print(y)"],
  diagnostics: [{ line: 2, severity: 1, msg: "invalid syntax" }, { line: 3, severity: 2, msg: "unused" }],
  ...over,
});

describe("formatEditorContext", () => {
  it("renders header, diagnostics and numbered lines", () => {
    const out = formatEditorContext(snap());
    expect(out.split("\n")).toEqual([
      "[editor] /p/src/a.py (python), cursor line 2",
      "diagnostics:",
      "  L2 E: invalid syntax",
      "  L3 W: unused",
      "--- lines 1-3 ---",
      "   1| x = 1",
      "   2| y = x +",
      "   3| print(y)",
    ]);
  });
  it("says none when there are no diagnostics and numbers from `from`", () => {
    const out = formatEditorContext(snap({ diagnostics: [], from: 10, lines: ["a", "b"] }));
    expect(out).toContain("diagnostics: none");
    expect(out).toContain("--- lines 10-11 ---");
    expect(out).toContain("  10| a");
  });
  it("caps the buffer at MAX_SNAPSHOT_LINES and notes the truncation", () => {
    const lines = Array.from({ length: MAX_SNAPSHOT_LINES + 50 }, (_, i) => `l${i + 1}`);
    const out = formatEditorContext(snap({ lines, diagnostics: [] }));
    expect(out).toContain(`--- lines 1-${MAX_SNAPSHOT_LINES} (truncated, ${MAX_SNAPSHOT_LINES + 50} total) ---`);
    expect(out).not.toContain(`l${MAX_SNAPSHOT_LINES + 1}`);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd pi-tutor && npx vitest run test/context.test.ts`
Expected: FAIL — `Failed to resolve import "../extensions/tutor/context.js"`

- [ ] **Step 3: Write the formatter**

`pi-tutor/extensions/tutor/context.ts`:
```ts
import type { EditorSnapshot } from "./nvim.js";

// Renders the per-turn editor context the model receives as a hidden custom message (spec §4).
export const MAX_SNAPSHOT_LINES = 400;

const SEV: Record<number, string> = { 1: "E", 2: "W", 3: "I", 4: "H" };

export function formatEditorContext(s: EditorSnapshot): string {
  const out: string[] = [`[editor] ${s.path} (${s.filetype || "unknown"}), cursor line ${s.cursor}`];
  if (s.diagnostics.length === 0) out.push("diagnostics: none");
  else {
    out.push("diagnostics:");
    for (const d of s.diagnostics) out.push(`  L${d.line} ${SEV[d.severity] ?? "?"}: ${d.msg}`);
  }
  const total = s.lines.length;
  const lines = total > MAX_SNAPSHOT_LINES ? s.lines.slice(0, MAX_SNAPSHOT_LINES) : s.lines;
  const last = s.from + lines.length - 1;
  out.push(total > MAX_SNAPSHOT_LINES ? `--- lines ${s.from}-${last} (truncated, ${total} total) ---` : `--- lines ${s.from}-${last} ---`);
  lines.forEach((l, i) => out.push(`${String(s.from + i).padStart(4)}| ${l}`));
  return out.join("\n");
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `cd pi-tutor && npx vitest run test/context.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Write the failing snapshot tests against headless Neovim**

Append inside the `describe("NvimLink", …)` block of `pi-tutor/test/nvim.test.ts`, before its closing `});`:
```ts
  it("snapshot('full') returns the whole buffer, filetype, cursor and diagnostics", async () => {
    const { link, h } = await setup();
    writeFileSync(join(h.root, "s.py"), Array.from({ length: 60 }, (_, i) => `line${i + 1}`).join("\n") + "\n");
    await link.raw.command(`edit ${join(h.root, "s.py")}`);
    await link.raw.lua(`vim.bo.filetype = "python"; vim.api.nvim_win_set_cursor(0, { 30, 0 })`);
    await link.raw.lua(`local ns = vim.api.nvim_create_namespace("t"); vim.diagnostic.set(ns, 0, {{ lnum = 4, col = 0, severity = 1, message = "boom" }})`);
    const s = await link.snapshot("full");
    expect(s).not.toBeNull();
    expect(s!.path).toBe(join(h.root, "s.py"));
    expect(s!.filetype).toBe("python");
    expect(s!.cursor).toBe(30);
    expect(s!.from).toBe(1);
    expect(s!.lines).toHaveLength(60);
    expect(s!.diagnostics).toEqual([{ line: 5, severity: 1, msg: "boom" }]);
  }, 20000);

  it("snapshot('window') returns radius lines around the cursor, clamped at the top", async () => {
    const { link, h } = await setup();
    writeFileSync(join(h.root, "w.py"), Array.from({ length: 60 }, (_, i) => `line${i + 1}`).join("\n") + "\n");
    await link.raw.command(`edit ${join(h.root, "w.py")}`);
    await link.raw.lua(`vim.api.nvim_win_set_cursor(0, { 30, 0 })`);
    const mid = await link.snapshot("window", 20);
    expect(mid!.from).toBe(10);
    expect(mid!.lines).toHaveLength(41);
    expect(mid!.lines[0]).toBe("line10");
    await link.raw.lua(`vim.api.nvim_win_set_cursor(0, { 1, 0 })`);
    const top = await link.snapshot("window", 20);
    expect(top!.from).toBe(1);
    expect(top!.lines).toHaveLength(21);
    await link.raw.lua(`vim.api.nvim_win_set_cursor(0, { 60, 0 })`);
    const bottom = await link.snapshot("window", 20);
    expect(bottom!.from).toBe(40);
    expect(bottom!.lines).toHaveLength(21);
  }, 20000);

  it("snapshot returns null for a buffer outside the root", async () => {
    const { link } = await setup();
    await link.raw.command(`edit /tmp/outside-snap-${process.pid}.py`);
    expect(await link.snapshot("full")).toBeNull();
    expect(await link.snapshot("window")).toBeNull();
  }, 20000);
```

- [ ] **Step 6: Run them to verify they fail**

Run: `cd pi-tutor && npx vitest run test/nvim.test.ts -t snapshot`
Expected: FAIL ×3 — `link.snapshot is not a function`

- [ ] **Step 7: Implement `snapshot()`**

In `pi-tutor/extensions/tutor/nvim.ts`, add after the `TutorPayload` type:
```ts
export interface EditorSnapshot {
  path: string;
  filetype: string;
  /** 1-based cursor line. */
  cursor: number;
  /** 1-based line number of `lines[0]`. */
  from: number;
  lines: string[];
  diagnostics: { line: number; severity: number; msg: string }[];
}
```
and add this method to `NvimLink` (after `diagnostics()`):
```ts
  /** One round trip: current buffer's path, filetype, cursor, lines (all or ±radius) and diagnostics. */
  async snapshot(mode: "full" | "window", radius = 20): Promise<EditorSnapshot | null> {
    const s = (await this.raw.lua(
      `local mode, radius = ...
       local b = vim.api.nvim_get_current_buf()
       local cur = vim.api.nvim_win_get_cursor(0)[1]
       local from, to = 1, -1
       if mode == "window" then from = math.max(1, cur - radius); to = cur + radius end
       local lines = vim.api.nvim_buf_get_lines(b, from - 1, to, false)
       local diags = {}
       for _, d in ipairs(vim.diagnostic.get(b)) do diags[#diags + 1] = { line = d.lnum + 1, severity = d.severity, msg = d.message } end
       return { path = vim.api.nvim_buf_get_name(b), filetype = vim.bo[b].filetype, cursor = cur, from = from, lines = lines, diagnostics = diags }`,
      [mode, radius],
    )) as EditorSnapshot;
    return this.isInRoot(s.path) ? s : null;
  }
```

- [ ] **Step 8: Run the snapshot tests to verify they pass**

Run: `cd pi-tutor && npx vitest run test/nvim.test.ts`
Expected: PASS, all nvim tests including the 3 new ones.

- [ ] **Step 9: Commit**

```bash
git add pi-tutor/extensions/tutor/nvim.ts pi-tutor/extensions/tutor/context.ts pi-tutor/test/nvim.test.ts pi-tutor/test/context.test.ts
git commit -m "feat(pi-tutor): editor snapshot pull and context formatter"
```

---

### Task 5: Wire the extension — band section, editor message, judgment, persisted level

**Files:**
- Modify: `pi-tutor/extensions/tutor/index.ts`
- Modify: `pi-tutor/extensions/tutor/ui.ts`
- Test: `pi-tutor/test/ui.test.ts`, `pi-tutor/test/smoke.test.ts`

**Interfaces:**
- Consumes: `bandFor`, `startRung`, `DEFAULT_LEVEL` (Task 1); `parseJudgment` (Task 2); `bandPrompt` (Task 3); `NvimLink.snapshot`, `formatEditorContext` (Task 4).
- Produces: session entries `tutor_level` `{ level: number }` and `tutor_judgment` `Judgment`; system prompt section key `tutor`; custom message `customType: "tutor_editor"`, `display: false`, `details: { band, path }`. `TutorState.last` holds the latest judgment word (`correct | partial | wrong | none | missing`).

- [ ] **Step 1: Write the failing ui tests**

Replace `pi-tutor/test/ui.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { renderWidget, renderStatus } from "../extensions/tutor/ui.js";

describe("renderWidget", () => {
  it("renders language, level, rung, task on line 1 and state on line 2", () => {
    const w = renderWidget({ language: "python", level: 30, rung: 2, task: "P1.T2.S1", state: "idle", connected: true });
    expect(w).toEqual(["tutor  python · lvl 30 · rung 2 · P1.T2.S1", "idle"]);
  });
  it("appends the last judgment to line 2", () => {
    const w = renderWidget({ level: 30, state: "clean", connected: true, last: "correct" });
    expect(w[1]).toBe("clean · judged correct");
  });
  it("says detached when not connected to Neovim", () => {
    const w = renderWidget({ state: "idle", connected: false, last: "wrong" });
    expect(w[1]).toBe("detached: pi started outside Neovim");
  });
  it("keeps both lines within 44 cells", () => {
    const w = renderWidget({ language: "typescript", level: 100, rung: 5, task: "P12.T34.S56", state: "stuck: cannot borrow `x` as mutable more than once at a time", connected: true, last: "partial" });
    for (const l of w) expect(l.length).toBeLessThanOrEqual(44);
    expect(w[1].endsWith("…")).toBe(true);
  });
  it("omits missing fields", () => {
    expect(renderWidget({ state: "idle", connected: true })[0]).toBe("tutor");
  });
});

describe("renderStatus", () => {
  it("is the level with its band, or 'tutor' when unknown", () => {
    expect(renderStatus({ level: 30, state: "idle", connected: true })).toBe("tutor lvl 30 · beginner");
    expect(renderStatus({ level: 70, state: "idle", connected: true })).toBe("tutor lvl 70 · pro");
    expect(renderStatus({ state: "idle", connected: true })).toBe("tutor");
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd pi-tutor && npx vitest run test/ui.test.ts`
Expected: FAIL ×2 — "appends the last judgment" (got `"clean"`) and "renderStatus" (got `"tutor lvl 30"`).

- [ ] **Step 3: Update ui.ts**

Replace `pi-tutor/extensions/tutor/ui.ts`:
```ts
import { bandFor } from "./policy.js";

export interface TutorState {
  language?: string; level?: number; rung?: number; task?: string;
  state: string; connected: boolean;
  /** Latest judgment word from the model, or "missing" when a reply had no block. */
  last?: string;
}

const MAX = 44;

function clip(s: string): string {
  const chars = Array.from(s);
  return chars.length <= MAX ? s : chars.slice(0, MAX - 1).join("") + "…";
}

export function renderWidget(s: TutorState): string[] {
  const parts: string[] = [];
  if (s.language) parts.push(s.language);
  if (s.level !== undefined) parts.push(`lvl ${s.level}`);
  if (s.rung !== undefined) parts.push(`rung ${s.rung}`);
  if (s.task) parts.push(s.task);
  const line1 = parts.length ? `tutor  ${parts.join(" · ")}` : "tutor";
  const line2 = !s.connected ? "detached: pi started outside Neovim" : s.last ? `${s.state} · judged ${s.last}` : s.state;
  return [clip(line1), clip(line2)];
}

export function renderStatus(s: TutorState): string {
  return s.level !== undefined ? `tutor lvl ${s.level} · ${bandFor(s.level)}` : "tutor";
}
```

- [ ] **Step 4: Run the ui tests to verify they pass**

Run: `cd pi-tutor && npx vitest run test/ui.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Write the failing wiring tests**

Replace `pi-tutor/test/smoke.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import extension from "../extensions/tutor/index.js";

type Handler = (...a: unknown[]) => unknown;
function fakePi() {
  const events: Record<string, Handler> = {};
  const commands: Record<string, { handler: (args: string, ctx: unknown) => Promise<void> }> = {};
  const entries: { type: string; data: unknown }[] = [];
  const pi = {
    on: (name: string, h: Handler) => { events[name] = h; return () => {}; },
    registerCommand: (name: string, def: { handler: (args: string, ctx: unknown) => Promise<void> }) => { commands[name] = def; },
    appendEntry: (type: string, data: unknown) => { entries.push({ type, data }); },
  };
  return { pi, events, commands, entries };
}
function fakeCtx(branch: unknown[] = []) {
  const widgets: Record<string, string[] | undefined> = {};
  const statuses: Record<string, string | undefined> = {};
  const notes: string[] = [];
  return {
    ctx: {
      hasUI: true, cwd: "/tmp/proj",
      sessionManager: { getBranch: () => branch },
      ui: {
        setWidget: (k: string, c: string[] | undefined) => { widgets[k] = c; },
        setStatus: (k: string, t: string | undefined) => { statuses[k] = t; },
        notify: (m: string) => notes.push(m),
      },
    },
    widgets, statuses, notes,
  };
}
/** Boot the extension detached (no $NVIM) so tests never need a Neovim. */
async function boot(branch: unknown[] = []) {
  const f = fakePi();
  extension(f.pi as never);
  const c = fakeCtx(branch);
  const saved = process.env.NVIM; delete process.env.NVIM;
  await f.events["session_start"]({ type: "session_start", reason: "startup" }, c.ctx);
  if (saved) process.env.NVIM = saved;
  return { ...f, ...c };
}
const assistant = (text: string) => ({ role: "assistant", content: [{ type: "text", text }], stopReason: "stop" });

describe("extension wiring", () => {
  it("registers lifecycle handlers and commands", () => {
    const { pi, events, commands } = fakePi();
    extension(pi as never);
    expect(Object.keys(events)).toEqual(expect.arrayContaining(["session_start", "session_shutdown", "before_agent_start", "turn_end"]));
    expect(Object.keys(commands)).toEqual(expect.arrayContaining(["tutor-level", "tutor-status"]));
  });

  it("starts detached at the default level", async () => {
    const { widgets, statuses } = await boot();
    expect(widgets["tutor"]?.[1]).toBe("detached: pi started outside Neovim");
    expect(statuses["tutor"]).toBe("tutor lvl 50 · intermediate");
  });

  it("/tutor-level validates, persists a tutor_level entry, and sets the start rung", async () => {
    const { commands, ctx, widgets, notes, entries } = await boot();
    await commands["tutor-level"].handler("abc", ctx);
    expect(notes.at(-1)).toMatch(/0-100/);
    await commands["tutor-level"].handler("20", ctx);
    expect(widgets["tutor"]?.[0]).toBe("tutor  lvl 20 · rung 3");
    expect(entries).toContainEqual({ type: "tutor_level", data: { level: 20 } });
  });

  it("restores the latest tutor_level entry from the session branch on start", async () => {
    const { widgets } = await boot([
      { type: "custom", customType: "tutor_level", data: { level: 10 } },
      { type: "custom", customType: "tutor_signal", data: {} },
      { type: "custom", customType: "tutor_level", data: { level: 80 } },
    ]);
    expect(widgets["tutor"]?.[0]).toBe("tutor  lvl 80 · rung 1");
  });

  it("before_agent_start sets the band section and sends no editor message when detached", async () => {
    const { events, commands, ctx } = await boot();
    const opts = { sections: {} as Record<string, string> };
    const r1 = await events["before_agent_start"]({ type: "before_agent_start", prompt: "hi", systemPromptOptions: opts }, ctx);
    expect(opts.sections["tutor"]).toMatch(/^# Tutor band: intermediate\n/);
    expect(opts.sections["tutor"]).toContain("```tutor-judgment");
    expect(r1).toBeUndefined();
    await commands["tutor-level"].handler("5", ctx);
    await events["before_agent_start"]({ type: "before_agent_start", prompt: "hi", systemPromptOptions: opts }, ctx);
    expect(opts.sections["tutor"]).toMatch(/^# Tutor band: beginner\n/);
  });

  it("turn_end parses the judgment into the widget and a tutor_judgment entry", async () => {
    const { events, ctx, widgets, entries } = await boot();
    (widgets as Record<string, unknown>)["tutor"] = undefined;
    await events["turn_end"]({ type: "turn_end", message: assistant('ok\n```tutor-judgment\n{"judgment":"correct","concept_tags":["x"]}\n```') }, ctx);
    expect(entries.at(-1)).toEqual({ type: "tutor_judgment", data: { judgment: "correct", concept_tags: ["x"], task_done_ids: [], episode_closed: false } });
    // detached line 2 hides the judgment; the status/notify path still reflects it via /tutor-status
    await events["turn_end"]({ type: "turn_end", message: assistant("no block here") }, ctx);
    expect(entries.at(-1)?.type).toBe("tutor_judgment");
  });

  it("turn_end ignores turns that end in tool calls and never throws on malformed blocks", async () => {
    const { events, ctx, entries } = await boot();
    const before = entries.length;
    await events["turn_end"]({ type: "turn_end", message: { role: "assistant", content: [{ type: "toolCall", id: "1", name: "read", arguments: {} }], stopReason: "toolUse" } }, ctx);
    expect(entries.length).toBe(before);
    await expect(events["turn_end"]({ type: "turn_end", message: assistant("```tutor-judgment\n{nope\n```") }, ctx)).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 6: Run them to verify they fail**

Run: `cd pi-tutor && npx vitest run test/smoke.test.ts`
Expected: FAIL — "registers lifecycle handlers" (no `before_agent_start`/`turn_end`), "starts detached" (status is `"tutor"`), "/tutor-level" (no entry, no rung), "restores", "before_agent_start" and "turn_end" (handler undefined → TypeError).

- [ ] **Step 7: Rewrite index.ts**

Replace `pi-tutor/extensions/tutor/index.ts`:
```ts
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { NvimLink, type TutorPayload } from "./nvim.js";
import { renderWidget, renderStatus, type TutorState } from "./ui.js";
import { bandFor, startRung, DEFAULT_LEVEL } from "./policy.js";
import { bandPrompt } from "./prompts.js";
import { parseJudgment } from "./judgment.js";
import { formatEditorContext } from "./context.js";

type Ui = ExtensionContext["ui"];

/** Last `tutor_level` custom entry on the active branch, if any. */
function restoreLevel(ctx: ExtensionContext): number | undefined {
  let level: number | undefined;
  for (const e of ctx.sessionManager.getBranch()) {
    if (e.type === "custom" && e.customType === "tutor_level") {
      const l = (e.data as { level?: unknown } | undefined)?.level;
      if (typeof l === "number") level = l;
    }
  }
  return level;
}

export default function (pi: ExtensionAPI): void {
  const state: TutorState = { state: "idle", connected: false };
  let link: NvimLink | null = null;
  let ui: Ui | null = null;

  function paint() {
    if (!ui) return;
    ui.setWidget("tutor", renderWidget(state));
    ui.setStatus("tutor", renderStatus(state));
  }

  function setLevel(level: number) {
    state.level = level;
    state.rung = startRung(bandFor(level));
  }

  function onPayload(p: TutorPayload) {
    // M3 replaces this with the stuck detector; for now reflect the latest signal.
    switch (p.kind) {
      case "diagnostics":
        state.state = p.errors > 0 ? `error: ${p.first?.msg ?? ""}` : p.warnings > 0 ? `${p.warnings} warning(s)` : "clean";
        break;
      case "idle": state.state = `idle ${Math.round(p.since_ms / 1000)}s`; break;
      case "churn": state.state = `churning lines ${p.region[0]}-${p.region[1]}`; break;
      case "run_output": state.state = p.code === 0 ? "run passed" : `run failed (exit ${p.code})`; break;
    }
    pi.appendEntry("tutor_signal", p);
    paint();
  }

  pi.on("session_start", async (_event, ctx) => {
    ui = ctx.hasUI ? ctx.ui : null;
    setLevel(restoreLevel(ctx) ?? DEFAULT_LEVEL);
    if (!link) {
      link = await NvimLink.connect({
        root: ctx.cwd,
        onPayload,
        onDisconnect: () => { state.connected = false; link = null; paint(); },
      });
      state.connected = link !== null;
    }
    paint();
  });

  pi.on("session_shutdown", async () => {
    await link?.close();
    link = null;
    state.connected = false;
  });

  // Spec §4: select the band prompt section and pull band-scoped editor context for this turn.
  pi.on("before_agent_start", async (event) => {
    const band = bandFor(state.level ?? DEFAULT_LEVEL);
    event.systemPromptOptions.sections["tutor"] = bandPrompt(band);
    if (!link) return;
    let snap = null;
    try { snap = await link.snapshot(band === "beginner" ? "full" : "window"); } catch { snap = null; }
    if (!snap) return;
    if (snap.filetype) { state.language = snap.filetype; paint(); }
    return { message: { customType: "tutor_editor", content: formatEditorContext(snap), display: false, details: { band, path: snap.path } } };
  });

  // Spec §5: parse the trailing tutor-judgment block. Ladder application lands in M3.
  pi.on("turn_end", async (event) => {
    const m = event.message;
    if (m.role !== "assistant") return;
    if (m.content.some((c) => c.type === "toolCall")) return;
    const text = m.content.filter((c): c is { type: "text"; text: string } => c.type === "text").map((c) => c.text).join("\n");
    const j = parseJudgment(text);
    state.last = j ? j.judgment : "missing";
    if (j) pi.appendEntry("tutor_judgment", j);
    paint();
  });

  pi.registerCommand("tutor-level", {
    description: "Set the tutor level 0-100 (beginner → pro)",
    handler: async (args, ctx) => {
      const n = Number(args.trim());
      if (!Number.isInteger(n) || n < 0 || n > 100) {
        ctx.ui.notify("usage: /tutor-level <0-100>", "warning");
        return;
      }
      setLevel(n);
      pi.appendEntry("tutor_level", { level: n });
      paint();
      ctx.ui.notify(`tutor level set to ${n} (${bandFor(n)})`, "info");
    },
  });

  pi.registerCommand("tutor-status", {
    description: "Show the tutor's current state",
    handler: async (_args, ctx) => {
      ctx.ui.notify(renderWidget(state).join(" | "), "info");
    },
  });
}
```

- [ ] **Step 8: Run the wiring tests and typecheck**

Run: `cd pi-tutor && npx vitest run test/smoke.test.ts && npm run typecheck`
Expected: PASS, 7 tests; `tsc` prints nothing. If `tsc` complains that `m.content` items lack `type: "toolCall"`, check `AssistantMessage["content"]` in `pi-ai/dist/types.d.ts` — the union is `TextContent | ThinkingContent | ToolCall` and `ToolCall.type` is `"toolCall"`.

- [ ] **Step 9: Run the whole suite**

Run: `cd pi-tutor && npm test`
Expected: all files pass (policy, judgment, prompts, context, nvim, ui, smoke).

- [ ] **Step 10: Commit**

```bash
git add pi-tutor/extensions/tutor/index.ts pi-tutor/extensions/tutor/ui.ts pi-tutor/test/ui.test.ts pi-tutor/test/smoke.test.ts
git commit -m "feat(pi-tutor): band prompt per turn, editor context message, judgment in widget, persisted level"
```

---

### Task 6: Surface doc, README, spec note, live acceptance

**Files:**
- Modify: `pi-tutor/PI_SURFACE.md`
- Modify: `README.md` (Status section)
- Modify: `docs/superpowers/specs/2026-10-07-nvim-tutor-design.md` (§4 implementation paragraph, header rev)

**Interfaces:** none (docs).

- [ ] **Step 1: Add the new surface to PI_SURFACE.md**

Under "## Pi extension API" append:
```markdown
- `pi.on("before_agent_start", (event, ctx) => …)`: mutate `event.systemPromptOptions.sections["tutor"]`
  (band prompt); return `{ message: { customType: "tutor_editor", content, display: false, details } }`
  for the per-turn editor context (BeforeAgentStartEventResult.message). Never return `systemPrompt`.
- `pi.on("turn_end", (event) => …)`: `event.message` is the AgentMessage; assistant `content` is
  `(TextContent | ThinkingContent | ToolCall)[]`, `ToolCall.type === "toolCall"`.
- `ctx.sessionManager.getBranch()` (ReadonlySessionManager): custom entries are
  `{ type: "custom", customType, data }`; used to restore `tutor_level` on resume.
- Custom entry types we write: `tutor_signal`, `tutor_level { level }`, `tutor_judgment` (Judgment).
- System prompt section key: `tutor`. `package.json` `"prompts": ["./prompts/*.md"]` is non-recursive,
  so `prompts/system/*.md` are not registered as `/` templates.
```
Under "## Neovim" append:
```markdown
- `vim.bo[b].filetype`, `nvim_win_get_cursor(0)`, `nvim_buf_get_lines(b, from, to, false)` with
  `to` past EOF (strict_indexing=false clamps) — one `nvim_exec_lua` round trip in `NvimLink.snapshot()`.
```
Bump the header line to say `Pi 1.1.0 types (2026-10-12)`.

- [ ] **Step 2: Update README Status**

In `README.md` under `## Status`, add a line for M2:
```markdown
- **M2 (2026-10-12):** band system prompts (beginner / intermediate / pro) selected per turn from the
  level slider; each turn carries the current buffer (beginner) or ±20 lines (others) plus diagnostics
  as a hidden message; `/tutor-level` / `:TutorLevel` persists across session resume; the model's
  trailing `tutor-judgment` block is parsed and shown in the widget (`judged correct`).
```

- [ ] **Step 3: Record the mechanism in the spec**

In spec §4, replace the sentence beginning "It also *pulls* editor context" with:
```markdown
It also *pulls* editor context for the turn by band and returns it from
`before_agent_start` as a hidden custom message (`tutor_editor`,
`display: false`): beginner gets the whole current buffer (capped at 400
lines) plus diagnostics; intermediate and pro get diagnostics and the 40
lines around the cursor. Nothing is pulled while Pi is idle. Only
buffers whose path is inside the project root are ever read. The level
defaults to 50 until `/tutor-level` or the profile sets it, and is
persisted as a `tutor_level` session entry. Idle thresholds interpolate
between band midpoints (17, 50, 83) and clamp outside.
```
Delete the sentence "Snapshot sending is gated in Lua: outside the beginner band the `snapshot` signal is never emitted." (there is no snapshot signal since rev 3; pulling is band-gated in the extension). Bump the header to `rev 4, 2026-10-12: M2 editor context as hidden message, level persistence`.

- [ ] **Step 4: Typecheck and full suite**

Run: `cd pi-tutor && npm run typecheck && npm test`
Expected: clean typecheck; all tests pass.

- [ ] **Step 5: Commit**

```bash
git add pi-tutor/PI_SURFACE.md README.md docs/superpowers/specs/2026-10-07-nvim-tutor-design.md
git commit -m "docs: M2 surface, README status, spec rev 4"
```

- [ ] **Step 6: Live acceptance (manual, in the real LazyVim config, after merge)**

1. `pi install ./pi-tutor` is already registered as a local path; run `/reload` in an open Pi or restart `:Tutor`.
2. Open a project file with a syntax error, `:TutorLevel 10`, ask "what is wrong here?" — reply should explain the construct line by line and end with a `tutor-judgment` block; widget line 2 shows `judged …`; footer shows `tutor lvl 10 · beginner`.
3. `:TutorLevel 90`, ask the same — reply is a terse hint with no code.
4. Quit Pi (`/quit`), `:TutorRestart`, resume the session — footer still shows `lvl 90 · pro`.
5. `/session` → export or `cat` the session JSONL — a `tutor_editor` custom message precedes each user prompt and a `tutor_judgment` entry follows each reply.
