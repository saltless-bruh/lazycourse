# nvim-tutor M6b: memory & signals

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The tutor remembers the learner across sessions (its own memory, in the profile, secret-scanned), turns a failing `:TutorRun` into a stuck episode that carries the trace, and takes `/tutor-feedback` to adjust its style and hint level. It also fixes the M6a deferred minors that touch the same code.

**Architecture:**
- **Profile schema v2** adds:
  - a `memory` table with an FTS5 index kept in sync by triggers;
  - a `feedback` table.
- **`memory.ts`** defines two Pi tools: `tutor_remember` (write, secret-scanned) and `tutor_recall` (read-only search). It also renders a frozen, capped snapshot that goes into its own system-prompt section `tutor_memory` at session start.
- **The guard** allows the two tools by name. nvim-tutor adds them to `--tools`, which is an allowlist that also covers extension tools.
- **A failing run** becomes a `run` trigger carrying the last lines of the output. It takes over any open episode and nudges at once.
- **`feedback.ts`** folds the learner's feedback history into active style notes (a hidden `[tutor-feedback]` line) and nudges the rung.
- **Secret scanner:** vendored from `@pify/memory` 0.13.1 (MIT), with its license and an added `nvapi-` pattern.

**Tech Stack:** TypeScript, Pi 1.1.0 extension API (`pi.registerTool`, `defineTool`, TypeBox `Type`), `node:sqlite` FTS5, vitest, Lua/plenary.

**Spec:** `docs/superpowers/specs/2026-10-13-tutor-roles-packs-exams-design.md`:
- §7 #4 (runtime errors), §7 #6 / §7.1 (memory), §7 #7 (feedback);
- §8 (profile v2: feedback and memory tables; exams wait for M8);
- §5.3 (`tutor-stack-traces` skill).

## Global Constraints

- Pi `^1.0`; the extension does nothing unless `PI_TUTOR=1`; nothing writes to stdout or stderr inside Pi.
- Every new Pi API is verified in `types.d.ts` and recorded in `pi-tutor/PI_SURFACE.md`. Verified for this plan (2026-10-13):
  - `pi.registerTool(tool)` with `defineTool({ name, label, description, parameters, execute(toolCallId, params, signal, onUpdate, ctx) })` → `{ content: [{ type: "text", text }], details }` (types.d.ts:446-505, examples/extensions/hello.ts).
  - A tool that throws becomes an error result carrying `error.message` (pi-agent-core agent-loop.js:536).
  - Extensions import `Type` from `typebox`. Pi's loader aliases `typebox` and `@earendil-works/pi-ai` to its own copies (loader.js getAliases).
  - `--tools <list>` is an allowlist of "built-in, extension, or custom tools" (docs/cli.md:120). The tutor's Pi must name `tutor_remember` and `tutor_recall` there.
  - `systemPromptOptions.sections` are "XML-wrapped prompt sections keyed by tag name" (system-prompt.d.ts:25). The memory section key is `tutor_memory`.
  - `node:sqlite` (Node 26.11.1) has FTS5 with `bm25()`. Verified with a probe.
- **§7.1 rules:**
  - No hidden model calls. Writes happen only through `tutor_remember` or the extension's own records.
  - Exactly 2 new tools.
  - Our memory code stays **≤ ~400 production lines**, not counting the vendored scanner; otherwise switch to `@pify/memory` (§7.1 fallback).
  - Memory types: `learner`, `feedback`, `project`, `reference`.
  - Each borrowed file keeps its LICENSE text and a credit line.
- `/tutor-feedback` kinds are exactly `too-long`, `too-vague`, `too-much-help`, `good`. Each is "logged in the profile" (§7 #7).
- The guard is otherwise unchanged; bash stays off.
- TDD: run the owning suite after each change.
  - `cd pi-tutor && npm test && npm run typecheck`
  - Lua: `cd nvim-tutor && nvim --headless -u tests/minimal_init.lua -c "PlenaryBustedDirectory tests/ {minimal_init='tests/minimal_init.lua'}"`

## Plan decisions (rulings)

- **The M3–M5 minors move to M6c.** They are about 30 small fixes in files M6b doesn't otherwise touch (term.lua, nvim.ts, profile paths, scaffold). They get their own plan, so this one stays reviewable. The M6a deferred minors that touch M6b's code are in Task 6.
- **The memory snapshot is frozen at session start.** Like `@henryqw/pi-memory`, it is computed once, so the prompt stays stable within a session. A memory saved this session is found with `tutor_recall` and shows in the snapshot from the next session on.
- **Snapshot scope:** the project's language plus language-free memories. Without a project, everything. Newest first, capped at 1600 characters (~400 tokens) of whole lines.
- **Forgetting is a learner command, not a third tool:** `/tutor-memory` lists memories, and picking one offers "Forget it". That keeps §7.1's limit of 2 tools.
- **A failing run takes over any open episode and nudges at once**, without waiting out the 2-minute nudge gap. Running the code is the learner's explicit action. A run episode holds its place until a run passes.
- **Feedback persists per language through the profile** when the session is in a recorded project; otherwise through session entries. `good` clears the style notes. `too-much-help` also lowers the open episode's rung by one, and `too-vague` raises it by one, within the band's cap.
- **M6b done-when** (spec §9 lists no separate row for M6b): a tmux live check where:
  1. the model calls `tutor_remember` for a stated preference, and after `:TutorRestart` the snapshot shows it;
  2. a failing `:TutorRun` opens a run episode, and the tutor's nudge reply refers to the trace;
  3. `:TutorFeedback too-long` is logged, and the next turn's hidden context carries the note.

## Review Focus

1. **The learner pastes an API key and the model tries to save it.** `tutor_remember` refuses, nothing is stored, and the model is told why. Test: `memory.test.ts` "refuses a secret (nvapi key, env literal)".
2. **Memories pile up across languages.** A Rust session's snapshot shows Rust and language-free memories only, never more than the cap. Test: `memory.test.ts` "snapshot scope and cap".
3. **An existing M6a profile (schema v1) is opened by M6b.** It upgrades in place and keeps levels, concepts, episodes and projects. Test: `profile.test.ts` "upgrades a v1 profile in place".
4. **A run fails while an error episode is open, within 2 minutes of the last nudge.** The run takes over and the tutor is nudged anyway. Test: `episode.test.ts` "a failing run takes over an open error episode and nudges inside the gap" (real headless Neovim).
5. **`/tutor-feedback` with a bad kind, with no episode open, or in the architect role.** The learner gets a warning, or the feedback is logged with no rung change; nothing throws. Test: smoke "/tutor-feedback edge cases".

---

## File map

```
pi-tutor/
  extensions/tutor/vendor/pify-secrets.ts       NEW  vendored scanner (+ nvapi)
  extensions/tutor/vendor/LICENSE-pify-memory   NEW  MIT text
  extensions/tutor/profile.ts     MOD  schema v2: memory+FTS5, feedback
  extensions/tutor/memory.ts      NEW  tools, snapshot, toFtsQuery
  extensions/tutor/feedback.ts    NEW  kinds, fold, notes, rung
  extensions/tutor/guard.ts       MOD  MEMORY_TOOLS allowed by name
  extensions/tutor/ladder.ts      MOD  "run" trigger
  extensions/tutor/stuck.ts       MOD  failing run → open run trigger
  extensions/tutor/context.ts     MOD  run trace in [episode]
  extensions/tutor/compliance.ts  MOD  indented / ~~~ fences
  extensions/tutor/workflow.ts    MOD  drop dead "plan done"
  extensions/tutor/index.ts       MOD  tools, snapshot, run, feedback, minors
  skills/tutor-memory/SKILL.md          NEW
  skills/tutor-stack-traces/SKILL.md    NEW
  golden/harness.ts, golden/tutor.golden.ts   MOD  per-run judgment + tools
  test/{secrets,profile,memory,feedback,stuck,ladder,context,compliance,workflow,smoke,skills,golden-harness}.test.ts
  PI_SURFACE.md
nvim-tutor/lua/tutor/init.lua     MOD  --tools + memory tools, :TutorFeedback
nvim-tutor/tests/init_spec.lua    MOD
README.md, docs/superpowers/specs/2026-10-07-nvim-tutor-design.md (rev 10 line)
```

---

### Task 1: Vendored secret scanner

**Files:**
- Create: `pi-tutor/extensions/tutor/vendor/pify-secrets.ts`, `pi-tutor/extensions/tutor/vendor/LICENSE-pify-memory`
- Test: `pi-tutor/test/secrets.test.ts`

**Interfaces:**
- Produces: `scanForSecrets(text: string, literals?: readonly string[]): SecretMatch[]` and `assertNoSecrets(text: string): void`, which throws `Error("Refusing to save: …")`. Also `SecretMatch { label; preview }`.

- [ ] **Step 1: Write the failing test.** Create `pi-tutor/test/secrets.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { scanForSecrets, assertNoSecrets } from "../extensions/tutor/vendor/pify-secrets.js";

const NV = "nvapi-" + "Zx9Kq2Lm7Rt4Wv8Yb3Nc6Pd1Hf5Gj0Ts";

describe("secret scanner (vendored @pify/memory 0.13.1 + nvapi)", () => {
  it("blocks an NVIDIA key (added pattern) and a provider key", () => {
    expect(scanForSecrets(`my key is ${NV}`, []).map((m) => m.label)).toContain("NVIDIA API key");
    expect(scanForSecrets("ghp_" + "a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6q7R8", []).length).toBeGreaterThan(0);
  });
  it("lets placeholders and plain learner facts through", () => {
    expect(scanForSecrets("nvapi-xxxxxxxxxxxxxxxxxxxxxxxxxxxx", [])).toEqual([]);
    expect(scanForSecrets("learner prefers comparisons with Rust; struggles with closures", [])).toEqual([]);
  });
  it("blocks a literal the environment holds, shape or no shape", () => {
    expect(scanForSecrets("the token is Qw7Rt2Yp9Lk", ["Qw7Rt2Yp9Lk"]).map((m) => m.label)).toEqual(["known credential from the environment"]);
  });
  it("assertNoSecrets throws a message that never contains the whole secret", () => {
    let msg = "";
    try { assertNoSecrets(`key ${NV}`); } catch (e) { msg = (e as Error).message; }
    expect(msg).toMatch(/^Refusing to save/);
    expect(msg).not.toContain(NV);
  });
});
```

- [ ] **Step 2: Run it and watch it fail.**
Run: `cd pi-tutor && npx vitest run test/secrets.test.ts`
Expected: FAIL (the module is missing).

- [ ] **Step 3: Vendor the file.** Download the package into a fresh, empty scratch directory. Read it there; never run anything from it.

```bash
mkdir -p "$SCRATCH/pify" && cd "$SCRATCH/pify" && npm pack @pify/memory@0.13.1 --silent && tar -xzf pify-memory-0.13.1.tgz
cp package/src/secrets.ts  <repo>/pi-tutor/extensions/tutor/vendor/pify-secrets.ts
cp package/LICENSE         <repo>/pi-tutor/extensions/tutor/vendor/LICENSE-pify-memory
```

Then edit `vendor/pify-secrets.ts` in exactly these four places:
1. Replace line 1 (`import type { SecretMatch } from "./types.ts";`) with:

```ts
// Vendored from @pify/memory 0.13.1 src/secrets.ts (MIT, © 2026 pifydev; see LICENSE-pify-memory).
// lazycourse changes: SecretMatch inlined; NVIDIA `nvapi-` keys added (spec 2026-10-13 §7.1).
export interface SecretMatch {
  label: string;
  /** Redacted preview of what matched, safe to show. */
  preview: string;
}
```

2. In `PATTERNS`, after the `Anthropic API key` line, add:

```ts
  { label: "NVIDIA API key", re: /\bnvapi-[A-Za-z0-9_-]{20,}\b/ },
```

3. In `isPlaceholderValue`, add `nvapi` to the prefix list in the `body` regex: `(?:[rs]k|ghp|…|ASIA|nvapi)`.
4. No other changes. Keep the comments and the rest of the file byte-identical, so a later diff against upstream stays small.

- [ ] **Step 4: Run and pass.**
Run: `cd pi-tutor && npx vitest run test/secrets.test.ts && npm run typecheck`
Expected: PASS. If typecheck flags the `.ts` import style, the file has no imports left, so this should not happen.

- [ ] **Step 5: Commit.**

```bash
git add pi-tutor/extensions/tutor/vendor pi-tutor/test/secrets.test.ts
git commit -m "feat(pi-tutor): vendor @pify/memory secret scanner (MIT) with an nvapi- pattern"
```

---

### Task 2: Profile schema v2: memory (+FTS5) and feedback

**Files:**
- Modify: `pi-tutor/extensions/tutor/profile.ts`
- Test: `pi-tutor/test/profile.test.ts`

**Interfaces:**
- Produces (profile.ts):
  - `type MemoryType = "learner" | "feedback" | "project" | "reference"`
  - `interface MemoryRow { id: number; type: MemoryType; text: string; language: string | null; project: string | null; created: number; updated: number }`
  - `type FeedbackKind = "too-long" | "too-vague" | "too-much-help" | "good"`
  - `interface FeedbackRow { kind: FeedbackKind; language: string | null; project: string | null; rung: number | null; created: number }`
  - Methods:
    - `remember(m: { type: MemoryType; text: string; language: string | null; project: string | null }, now: number): { id: number; created: boolean }`
    - `memories(o: { language: string | null; limit: number }): MemoryRow[]`: newest `updated` first. With a language, it returns that language plus `language IS NULL`; with `null`, all languages.
    - `recall(query: string, limit: number): MemoryRow[]`: BM25 order; an empty query gives `[]`.
    - `forget(id: number): boolean`
    - `recordFeedback(f: Omit<FeedbackRow, "created">, now: number): void`
    - `feedback(language: string): FeedbackRow[]`: oldest first.
  - `toFtsQuery(query: string): string`
  - `SCHEMA_VERSION === 2`

- [ ] **Step 1: Write the failing tests.** Append to `pi-tutor/test/profile.test.ts`:

```ts
import { DatabaseSync } from "node:sqlite";
import { toFtsQuery } from "../extensions/tutor/profile.js";

describe("profile v2: memory and feedback (spec 2026-10-13 §7.1, §7 #7, §8)", () => {
  const open = () => Profile.open(":memory:");
  it("is schema v2", () => { expect(SCHEMA_VERSION).toBe(2); expect(open().version).toBe(2); });
  it("upgrades a v1 profile in place and keeps its rows", () => {
    const file = join(mkdtempSync(join(tmpdir(), "pitutor-v1-")), "profile.sqlite");
    const raw = new DatabaseSync(file);
    raw.exec(`CREATE TABLE schema_version (v INTEGER NOT NULL); INSERT INTO schema_version (v) VALUES (1);
      CREATE TABLE languages (name TEXT PRIMARY KEY, level INTEGER NOT NULL, interview_json TEXT NOT NULL, created INTEGER NOT NULL);
      INSERT INTO languages VALUES ('rust', 40, '{}', 1);`);
    raw.close();
    const p = Profile.open(file);
    expect(p.version).toBe(2);
    expect(p.language("rust")?.level).toBe(40);
    expect(p.remember({ type: "learner", text: "knows Go", language: null, project: null }, 2).created).toBe(true);
    p.close();
  });
  it("remember dedupes the same type+text and bumps updated", () => {
    const p = open();
    const a = p.remember({ type: "learner", text: "prefers Rust comparisons", language: "python", project: null }, 1);
    const b = p.remember({ type: "learner", text: "prefers Rust comparisons", language: "python", project: null }, 5);
    expect(b).toEqual({ id: a.id, created: false });
    expect(p.memories({ language: "python", limit: 10 })[0].updated).toBe(5);
  });
  it("memories: newest first, the language plus language-free rows", () => {
    const p = open();
    p.remember({ type: "learner", text: "general fact", language: null, project: null }, 1);
    p.remember({ type: "project", text: "python fact", language: "python", project: "/p" }, 2);
    p.remember({ type: "project", text: "rust fact", language: "rust", project: "/r" }, 3);
    expect(p.memories({ language: "python", limit: 10 }).map((m) => m.text)).toEqual(["python fact", "general fact"]);
    expect(p.memories({ language: null, limit: 2 }).map((m) => m.text)).toEqual(["rust fact", "python fact"]);
  });
  it("recall searches words with BM25 and survives FTS syntax in the query", () => {
    const p = open();
    p.remember({ type: "learner", text: "struggles with closures and borrowing", language: "rust", project: null }, 1);
    p.remember({ type: "reference", text: "uses pytest for tests", language: "python", project: null }, 2);
    expect(p.recall("closures", 5).map((m) => m.text)).toEqual(["struggles with closures and borrowing"]);
    expect(p.recall('closures" OR *', 5).length).toBe(1);
    expect(p.recall("", 5)).toEqual([]);
  });
  it("forget removes the row and its index entry", () => {
    const p = open();
    const { id } = p.remember({ type: "learner", text: "likes diagrams", language: null, project: null }, 1);
    expect(p.forget(id)).toBe(true);
    expect(p.recall("diagrams", 5)).toEqual([]);
    expect(p.forget(id)).toBe(false);
  });
  it("feedback is logged per language, oldest first", () => {
    const p = open();
    p.recordFeedback({ kind: "too-long", language: "python", project: "/p", rung: 2 }, 1);
    p.recordFeedback({ kind: "good", language: "python", project: "/p", rung: null }, 2);
    p.recordFeedback({ kind: "too-vague", language: "rust", project: null, rung: null }, 3);
    expect(p.feedback("python").map((f) => f.kind)).toEqual(["too-long", "good"]);
  });
  it("toFtsQuery quotes each term and ORs them (from @pify/memory fts.ts)", () => {
    expect(toFtsQuery('a closures "x" y*')).toBe('"closures" OR "x" OR "y*"');
    expect(toFtsQuery("  ")).toBe('""');
  });
});
```

Make sure `mkdtempSync`, `tmpdir` and `join` are imported at the top of the file. Add them if missing.

- [ ] **Step 2: Run them and watch them fail.**
Run: `cd pi-tutor && npx vitest run test/profile.test.ts`
Expected: FAIL (`toFtsQuery` and `remember` are missing; the version is 1).

- [ ] **Step 3: Implement in `profile.ts`.** Append a second migration to `MIGRATIONS`:

```ts
  // v2 (spec 2026-10-13 §7.1, §7 #7, §8): tutor memory with a full-text index, and learner feedback.
  `CREATE TABLE memory (id INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT NOT NULL, text TEXT NOT NULL, language TEXT, project TEXT,
     created INTEGER NOT NULL, updated INTEGER NOT NULL);
   CREATE VIRTUAL TABLE memory_fts USING fts5(text, content='memory', content_rowid='id', tokenize='porter unicode61');
   CREATE TRIGGER memory_ai AFTER INSERT ON memory BEGIN INSERT INTO memory_fts(rowid, text) VALUES (new.id, new.text); END;
   CREATE TRIGGER memory_ad AFTER DELETE ON memory BEGIN INSERT INTO memory_fts(memory_fts, rowid, text) VALUES ('delete', old.id, old.text); END;
   CREATE TABLE feedback (id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL, language TEXT, project TEXT, rung INTEGER,
     created INTEGER NOT NULL);`,
```

Add the types and the query helper above `export class Profile`:

```ts
export type MemoryType = "learner" | "feedback" | "project" | "reference";
export interface MemoryRow { id: number; type: MemoryType; text: string; language: string | null; project: string | null; created: number; updated: number }
export type FeedbackKind = "too-long" | "too-vague" | "too-much-help" | "good";
export interface FeedbackRow { kind: FeedbackKind; language: string | null; project: string | null; rung: number | null; created: number }

/** A learner's words → FTS5 syntax: each term quoted, OR'd (idea from @pify/memory src/fts.ts, MIT). */
export function toFtsQuery(query: string): string {
  const terms = query.split(/\s+/).map((t) => t.replace(/"/g, "")).filter((t) => t.length > 1);
  return terms.length ? terms.map((t) => `"${t}"`).join(" OR ") : '""';
}

const str = (v: unknown): string | null => (v === null || v === undefined ? null : String(v));
const memoryRow = (r: Row): MemoryRow => ({
  id: Number(r.id), type: String(r.type) as MemoryType, text: String(r.text), language: str(r.language), project: str(r.project),
  created: Number(r.created), updated: Number(r.updated),
});
```

Add the methods inside `Profile`, after `projects()`:

```ts
  /** One fact; the same type+text again only bumps `updated` (spec §7.1). */
  remember(m: { type: MemoryType; text: string; language: string | null; project: string | null }, now: number): { id: number; created: boolean } {
    const old = this.db.prepare("SELECT id FROM memory WHERE type = ? AND text = ?").get(m.type, m.text) as Row | undefined;
    if (old) {
      this.db.prepare("UPDATE memory SET updated = ? WHERE id = ?").run(now, Number(old.id));
      return { id: Number(old.id), created: false };
    }
    const r = this.db.prepare("INSERT INTO memory (type, text, language, project, created, updated) VALUES (?, ?, ?, ?, ?, ?) RETURNING id")
      .get(m.type, m.text, m.language, m.project, now, now) as Row;
    return { id: Number(r.id), created: true };
  }

  memories(o: { language: string | null; limit: number }): MemoryRow[] {
    const rows = o.language === null
      ? this.db.prepare("SELECT * FROM memory ORDER BY updated DESC, id DESC LIMIT ?").all(o.limit)
      : this.db.prepare("SELECT * FROM memory WHERE language = ? OR language IS NULL ORDER BY updated DESC, id DESC LIMIT ?").all(o.language, o.limit);
    return (rows as Row[]).map(memoryRow);
  }

  recall(query: string, limit: number): MemoryRow[] {
    const q = toFtsQuery(query);
    if (q === '""') return [];
    return (this.db.prepare(`SELECT m.* FROM memory_fts f JOIN memory m ON m.id = f.rowid
      WHERE memory_fts MATCH ? ORDER BY bm25(memory_fts) LIMIT ?`).all(q, limit) as Row[]).map(memoryRow);
  }

  forget(id: number): boolean {
    return Number(this.db.prepare("DELETE FROM memory WHERE id = ?").run(id).changes) > 0;
  }

  recordFeedback(f: Omit<FeedbackRow, "created">, now: number): void {
    this.db.prepare("INSERT INTO feedback (kind, language, project, rung, created) VALUES (?, ?, ?, ?, ?)")
      .run(f.kind, f.language, f.project, f.rung, now);
  }

  feedback(language: string): FeedbackRow[] {
    return (this.db.prepare("SELECT * FROM feedback WHERE language = ? ORDER BY id").all(language) as Row[]).map((r) => ({
      kind: String(r.kind) as FeedbackKind, language: str(r.language), project: str(r.project),
      rung: r.rung === null ? null : Number(r.rung), created: Number(r.created),
    }));
  }
```

Update the header comment's spec reference to "(spec §6; v2: spec 2026-10-13 §7.1, §8)".

- [ ] **Step 4: Run and pass.**
Run: `cd pi-tutor && npm test && npm run typecheck`
Expected: PASS. Existing tests compare against `SCHEMA_VERSION`, so the bump doesn't break them. If the M4 "newer pi-tutor" test hard-codes 2, it sets `SCHEMA_VERSION + 1`, so it still holds.

- [ ] **Step 5: Commit.**

```bash
git add pi-tutor/extensions/tutor/profile.ts pi-tutor/test/profile.test.ts
git commit -m "feat(pi-tutor): profile v2 — memory table with FTS5 index, feedback log"
```

---

### Task 3: Tutor memory: tools, snapshot, guard, `/tutor-memory`, skill, golden

**Files:**
- Create: `pi-tutor/extensions/tutor/memory.ts`, `pi-tutor/skills/tutor-memory/SKILL.md`
- Modify: `pi-tutor/extensions/tutor/guard.ts`, `pi-tutor/extensions/tutor/index.ts`, `nvim-tutor/lua/tutor/init.lua:9-15`, `pi-tutor/golden/harness.ts`, `pi-tutor/golden/tutor.golden.ts`, `pi-tutor/test/fake-pi.ts`
- Test: `pi-tutor/test/memory.test.ts`, `pi-tutor/test/guard.test.ts`, `pi-tutor/test/smoke.test.ts`, `pi-tutor/test/skills.test.ts`, `pi-tutor/test/golden-harness.test.ts`, `nvim-tutor/tests/init_spec.lua`

**Interfaces:**
- Consumes: the Profile memory API (Task 2); `assertNoSecrets` (Task 1).
- Produces:
  - `MEMORY_TOOLS: ReadonlySet<string>` (guard.ts);
  - `interface MemoryScope { profile(): Profile | null; language(): string | null; project(): string | null; now(): number }`;
  - `rememberTool(s: MemoryScope)` and `recallTool(s: MemoryScope)` (Pi tool definitions);
  - `memorySnapshot(rows: MemoryRow[], maxChars?: number): string | null`;
  - `SNAPSHOT_CHARS = 1600`, `MAX_MEMORY_CHARS = 400`;
  - golden `runsOf(stdout): { reply: string; judgment: Judgment | null; tools: string[] }[]`.

- [ ] **Step 1: Write the failing tests.** Create `pi-tutor/test/memory.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { Profile, type MemoryRow } from "../extensions/tutor/profile.js";
import { rememberTool, recallTool, memorySnapshot, SNAPSHOT_CHARS, MAX_MEMORY_CHARS, type MemoryScope } from "../extensions/tutor/memory.js";
import { estimateTokens } from "../extensions/tutor/prompts.js";

const scope = (p: Profile | null, language: string | null = "python"): MemoryScope =>
  ({ profile: () => p, language: () => language, project: () => "/proj", now: () => 7 });
const run = (tool: ReturnType<typeof rememberTool> | ReturnType<typeof recallTool>, params: Record<string, unknown>) =>
  (tool.execute as (id: string, p: unknown) => Promise<{ content: { text: string }[] }>)("call-1", params);
const text = async (p: Promise<{ content: { text: string }[] }>) => (await p).content[0].text;

describe("tutor_remember", () => {
  it("saves a fact under the session's language and project", async () => {
    const p = Profile.open(":memory:");
    expect(await text(run(rememberTool(scope(p)), { type: "learner", text: "  compares everything to Rust  " }))).toBe("saved memory #1");
    expect(p.memories({ language: "python", limit: 5 })).toEqual([{ id: 1, type: "learner", text: "compares everything to Rust", language: "python", project: "/proj", created: 7, updated: 7 }]);
    expect(await text(run(rememberTool(scope(p)), { type: "learner", text: "compares everything to Rust" }))).toBe("already remembered as #1");
  });
  it("refuses a secret (nvapi key, env literal) and stores nothing", async () => {
    const p = Profile.open(":memory:");
    await expect(run(rememberTool(scope(p)), { type: "reference", text: "key nvapi-Zx9Kq2Lm7Rt4Wv8Yb3Nc6Pd1Hf5Gj0Ts" })).rejects.toThrow(/Refusing to save/);
    expect(p.memories({ language: null, limit: 5 })).toEqual([]);
  });
  it("refuses empty, too long, an unknown type, or no profile", async () => {
    const p = Profile.open(":memory:");
    await expect(run(rememberTool(scope(p)), { type: "learner", text: "  " })).rejects.toThrow(/empty/);
    await expect(run(rememberTool(scope(p)), { type: "learner", text: "x".repeat(MAX_MEMORY_CHARS + 1) })).rejects.toThrow(/at most 400/);
    await expect(run(rememberTool(scope(p)), { type: "mood", text: "happy" })).rejects.toThrow(/type must be/);
    await expect(run(rememberTool(scope(null)), { type: "learner", text: "x y" })).rejects.toThrow(/profile is unavailable/);
  });
});

describe("tutor_recall", () => {
  it("finds memories by words, newest-ranked, with ids and types", async () => {
    const p = Profile.open(":memory:");
    p.remember({ type: "learner", text: "struggles with closures", language: "rust", project: null }, 1);
    expect(await text(run(recallTool(scope(p)), { query: "closures" }))).toBe("#1 [learner] struggles with closures (rust)");
    expect(await text(run(recallTool(scope(p)), { query: "monads" }))).toBe('no saved memories match "monads"');
  });
});

describe("memorySnapshot", () => {
  const row = (id: number, text: string, type: MemoryRow["type"] = "learner"): MemoryRow => ({ id, type, text, language: null, project: null, created: id, updated: id });
  it("is null when there is nothing to remember", () => { expect(memorySnapshot([])).toBeNull(); });
  it("lists memories under a header that names both tools, within the cap and ~400 tokens", () => {
    const s = memorySnapshot(Array.from({ length: 100 }, (_, i) => row(i + 1, `fact number ${i + 1} about how this learner works best`)))!;
    expect(s.startsWith("## What you remember about this learner")).toBe(true);
    expect(s).toContain("tutor_recall");
    expect(s).toContain("- [learner] fact number 1 about");
    expect(s.length).toBeLessThanOrEqual(SNAPSHOT_CHARS);
    expect(estimateTokens(s)).toBeLessThanOrEqual(400);
    expect(s.split("\n").at(-1)).toMatch(/^- \[learner\] fact number \d+ about how this learner works best$/); // whole lines only
  });
});

describe("snapshot scope and cap (review focus 2)", () => {
  it("a rust session sees rust + language-free memories only", () => {
    const p = Profile.open(":memory:");
    p.remember({ type: "learner", text: "general", language: null, project: null }, 1);
    p.remember({ type: "project", text: "python only", language: "python", project: null }, 2);
    p.remember({ type: "project", text: "rust only", language: "rust", project: null }, 3);
    const s = memorySnapshot(p.memories({ language: "rust", limit: 40 }))!;
    expect(s).toContain("rust only");
    expect(s).toContain("general");
    expect(s).not.toContain("python only");
  });
});
```

Append to `pi-tutor/test/guard.test.ts`:

```ts
import { MEMORY_TOOLS } from "../extensions/tutor/guard.js";

describe("memory tools (spec 2026-10-13 §7.1)", () => {
  it("allows tutor_remember and tutor_recall by name and nothing else new", () => {
    expect([...MEMORY_TOOLS].sort()).toEqual(["tutor_recall", "tutor_remember"]);
    for (const t of MEMORY_TOOLS) expect(guardToolCall(t, { text: "x" }, "/tmp")).toBeUndefined();
    expect(guardToolCall("memory_write", { text: "x" }, "/tmp")?.block).toBe(true);
  });
});
```

In `pi-tutor/test/fake-pi.ts`, give `fakePi()` a tools registry. Add `const tools: Record<string, { execute: (...a: unknown[]) => Promise<unknown> }> = {};` and, in `pi`, `registerTool: (t: { name: string; execute: (...a: unknown[]) => Promise<unknown> }) => { tools[t.name] = t; },`. Return `tools` too: `return { pi, events, commands, entries, sent, skills, execOut, tools };`. Give `fakeCtx`'s `ui` a scripted `select` (it already exists).

Append to `pi-tutor/test/smoke.test.ts`:

```ts
describe("tutor memory in the extension (spec 2026-10-13 §7.1)", () => {
  it("registers both tools; a saved memory shows in the next session's frozen tutor_memory section", async () => {
    const file = pjoin(mkd(pjoin(tmp(), "pitutor-mem-")), "profile.sqlite");
    const saved = process.env.PI_TUTOR_PROFILE;
    process.env.PI_TUTOR_PROFILE = file;
    try {
      const a = await boot();
      expect(Object.keys(a.tools).sort()).toEqual(["tutor_recall", "tutor_remember"]);
      await a.tools["tutor_remember"].execute("1", { type: "learner", text: "learns best from Rust comparisons" });
      const same = await turn(a.events, a.ctx, "hi", judged("none"));
      expect(same.sections["tutor_memory"]).toBeUndefined(); // frozen: this session started empty
      await a.events["session_shutdown"]({ type: "session_shutdown" }, a.ctx);
      const b = await boot();
      const next = await turn(b.events, b.ctx, "hi", judged("none"));
      expect(next.sections["tutor_memory"]).toContain("- [learner] learns best from Rust comparisons");
      await b.events["session_shutdown"]({ type: "session_shutdown" }, b.ctx);
    } finally {
      if (saved === undefined) delete process.env.PI_TUTOR_PROFILE; else process.env.PI_TUTOR_PROFILE = saved;
    }
  });
  it("/tutor-memory lists memories and forgets the one the learner picks", async () => {
    const b = await boot();
    await b.tools["tutor_remember"].execute("1", { type: "learner", text: "likes diagrams" });
    await b.tools["tutor_remember"].execute("2", { type: "project", text: "uses pytest" });
    b.script.push("#1 [learner] likes diagrams", "Forget it");
    await b.commands["tutor-memory"].handler("", b.ctx);
    expect(b.notes.at(-1)).toBe("forgot memory #1");
    b.script.push(undefined);
    await b.commands["tutor-memory"].handler("", b.ctx);
    const left = await b.tools["tutor_recall"].execute("3", { query: "diagrams pytest" }) as { content: { text: string }[] };
    expect(left.content[0].text).toBe("#2 [project] uses pytest");
  });
});
```

`boot()` gives each boot a private `:memory:` profile, but `session_shutdown` closes it. That is why the first test points `PI_TUTOR_PROFILE` at a file.

In `pi-tutor/test/skills.test.ts`, add `"tutor-memory"` to the loop's list, and add a test that the skill names all four types, both tools, and the phrase "never save":

```ts
  it("tutor-memory names the four types, both tools and what never to save", () => {
    const t = read("tutor-memory");
    for (const s of ["learner", "feedback", "project", "reference", "tutor_remember", "tutor_recall"]) expect(t).toContain(s);
    expect(t).toMatch(/never save/i);
  });
```

That loop also requires at least one diagram, so the skill has one.

Append to `nvim-tutor/tests/init_spec.lua`:

```lua
  it("starts pi with the read tools plus the two tutor memory tools", function()
    local cmd = require("tutor").build_cmd({ "pi" })
    assert.same({ "pi", "--tools", "read,grep,find,ls,tutor_remember,tutor_recall" }, cmd)
  end)
```

Rewrite `pi-tutor/test/golden-harness.test.ts` for the new `runsOf` (keep `repliesOf` as `runsOf(...).map(r => r.reply)`):

```ts
import { describe, it, expect } from "vitest";
import { repliesOf, runsOf } from "../golden/harness.js";

const ev = (o: unknown) => JSON.stringify(o);
const text = (t: string) => ev({ type: "message_end", message: { role: "assistant", content: [{ type: "thinking", thinking: "…" }, { type: "text", text: t }] } });
const call = (name: string, args: unknown = {}) => ev({ type: "message_end", message: { role: "assistant", content: [{ type: "toolCall", name, arguments: args }] } });

describe("golden harness", () => {
  it("repliesOf: the last non-empty assistant text of each run", () => {
    const out = [ev({ type: "agent_start" }), text("reading"), call("read"), text("first"), ev({ type: "agent_end" }), "not json", text("second"), ev({ type: "agent_end" })].join("\n");
    expect(repliesOf(out)).toEqual(["first", "second"]);
  });
  it("a run without text yields an empty reply, not the previous one", () => {
    expect(repliesOf([text("a"), ev({ type: "agent_end" }), ev({ type: "agent_end" })].join("\n"))).toEqual(["a", ""]);
  });
  it("runsOf: tools called and the first judgment in the run, as production takes it", () => {
    const fence = "```tutor-judgment\n{\"judgment\":\"partial\"}\n```";
    const out = [text("look\n" + fence), call("tutor_remember", { type: "learner", text: "x" }), text("done"), ev({ type: "agent_end" })].join("\n");
    expect(runsOf(out)).toEqual([{ reply: "done", judgment: expect.objectContaining({ judgment: "partial" }), tools: ["tutor_remember"] }]);
  });
});
```

- [ ] **Step 2: Run them and watch them fail.**
Run: `cd pi-tutor && npx vitest run test/memory.test.ts test/guard.test.ts test/smoke.test.ts test/skills.test.ts test/golden-harness.test.ts` and the Lua suite.
Expected: FAIL (the modules, tools and command are missing).

- [ ] **Step 3: `guard.ts`.** Add, after `READ_TOOLS`:

```ts
/** Tutor memory tools (spec 2026-10-13 §7.1): allowed by name; they touch only the profile. */
export const MEMORY_TOOLS: ReadonlySet<string> = new Set(["tutor_remember", "tutor_recall"]);
```

In `guardToolCall`, after the bash check, add `if (MEMORY_TOOLS.has(toolName)) return undefined;`.

- [ ] **Step 4: Create `pi-tutor/extensions/tutor/memory.ts`:**

```ts
import { Type } from "typebox";
import { defineTool } from "@earendil-works/pi-coding-agent";
import { assertNoSecrets } from "./vendor/pify-secrets.js";
import type { MemoryRow, MemoryType, Profile } from "./profile.js";

// Tutor memory (spec 2026-10-13 §7.1): the model writes through ONE tool and reads through ONE;
// the extension renders a frozen snapshot at session start. No hidden model calls.
export const MEMORY_TYPES: readonly MemoryType[] = ["learner", "feedback", "project", "reference"];
export const MAX_MEMORY_CHARS = 400;
/** ~400 tokens: the snapshot's share of the per-turn prompt budget (spec §7 #2). */
export const SNAPSHOT_CHARS = 1600;
const RECALL_MAX = 10;

export interface MemoryScope { profile(): Profile | null; language(): string | null; project(): string | null; now(): number }

const result = (text: string, details: Record<string, unknown> = {}) => ({ content: [{ type: "text" as const, text }], details });

function profileOf(s: MemoryScope): Profile {
  const p = s.profile();
  if (!p) throw new Error("the learner profile is unavailable; nothing was saved or searched");
  return p;
}

export function rememberTool(s: MemoryScope) {
  return defineTool({
    name: "tutor_remember",
    label: "Remember",
    description: "Save one durable fact about the learner for future sessions. Types: learner (how they learn, what they know), feedback (how they want to be taught), project (decisions in their project), reference (where something lives). One fact per call, plain words, at most 400 characters. Never save code, secrets, or anything only true right now. The tutor-memory skill has the rules.",
    parameters: Type.Object({
      type: Type.Union([Type.Literal("learner"), Type.Literal("feedback"), Type.Literal("project"), Type.Literal("reference")]),
      text: Type.String({ description: "the fact, in one or two plain sentences" }),
    }),
    async execute(_id, params) {
      const type = params.type as MemoryType;
      if (!MEMORY_TYPES.includes(type)) throw new Error(`type must be one of ${MEMORY_TYPES.join(", ")}`);
      const text = String(params.text ?? "").trim();
      if (!text) throw new Error("the memory text is empty");
      if (text.length > MAX_MEMORY_CHARS) throw new Error(`a memory is at most ${MAX_MEMORY_CHARS} characters; save one fact`);
      assertNoSecrets(text);
      const r = profileOf(s).remember({ type, text, language: s.language(), project: s.project() }, s.now());
      return result(r.created ? `saved memory #${r.id}` : `already remembered as #${r.id}`, { id: r.id });
    },
  });
}

export function recallTool(s: MemoryScope) {
  return defineTool({
    name: "tutor_recall",
    label: "Recall",
    description: "Search what you saved about this learner in earlier sessions (words, any order). Returns up to 10 memories as `#id [type] text`.",
    parameters: Type.Object({
      query: Type.String({ description: "words to search for" }),
      limit: Type.Optional(Type.Number({ description: "at most 10; default 5" })),
    }),
    async execute(_id, params) {
      const limit = Math.min(RECALL_MAX, Math.max(1, Math.floor(Number(params.limit ?? 5)) || 5));
      const rows = profileOf(s).recall(String(params.query ?? ""), limit);
      if (rows.length === 0) return result(`no saved memories match "${String(params.query ?? "")}"`);
      return result(rows.map(line).join("\n"), { ids: rows.map((r) => r.id) });
    },
  });
}

function line(r: MemoryRow): string {
  return `#${r.id} [${r.type}] ${r.text}${r.language ? ` (${r.language})` : ""}`;
}

/** The `tutor_memory` system-prompt section, frozen at session start (idea from @henryqw/pi-memory). */
export function memorySnapshot(rows: MemoryRow[], maxChars = SNAPSHOT_CHARS): string | null {
  if (rows.length === 0) return null;
  const out = ["## What you remember about this learner", "Saved in earlier sessions with tutor_remember, newest first. Search for more with tutor_recall."];
  let size = out.join("\n").length;
  for (const r of rows) {
    const l = `- [${r.type}] ${r.text}`;
    if (size + 1 + l.length > maxChars) break;
    out.push(l);
    size += 1 + l.length;
  }
  return out.join("\n");
}
```

In the test, the `ReturnType<typeof rememberTool>`-based `run` helper casts `execute`, so the test doesn't depend on Pi's full `execute` signature. If `defineTool`'s inferred params type makes `params.type as MemoryType` a type error, cast through `String(params.type)`.

- [ ] **Step 5: Wire it into `index.ts`.**
  - Imports: `import { rememberTool, recallTool, memorySnapshot } from "./memory.js";`.
  - Right after `const detector = …`:

```ts
  // Spec 2026-10-13 §7.1: the model's two memory tools, scoped to this session's project.
  const memoryScope = { profile: () => profile, language: () => project?.language ?? null, project: () => project?.path ?? null, now: Date.now };
  pi.registerTool(rememberTool(memoryScope));
  pi.registerTool(recallTool(memoryScope));
  /** Frozen at session start (spec §7.1): stable prompt within a session; new memories show next session. */
  let memoryNote: string | null = null;
```

  - In `session_start`, after `state.level = …`:

```ts
    memoryNote = null;
    if (profile) { const p = profile; profileWrite(() => { memoryNote = memorySnapshot(p.memories({ language: project?.language ?? null, limit: 40 })); }); }
```

  - In `before_agent_start`, right after the `tutor` section line:

```ts
    if (memoryNote) event.systemPromptOptions.sections["tutor_memory"] = memoryNote;
```

  - Add the command, before `tutor-level`:

```ts
  pi.registerCommand("tutor-memory", {
    description: "List what the tutor remembers about you; pick one to forget it",
    handler: async (_args, ctx) => {
      if (!profile) { ctx.ui.notify("tutor profile unavailable; see the earlier warning", "error"); return; }
      const rows = profile.memories({ language: null, limit: 50 });
      if (rows.length === 0) { ctx.ui.notify("the tutor has not saved any memories yet", "info"); return; }
      const lines = rows.map((r) => `#${r.id} [${r.type}] ${r.text}`);
      if (!ctx.hasUI) { ctx.ui.notify(lines.join("\n"), "info"); return; }
      const pick = await ctx.ui.select("Saved memories (Esc to close)", lines);
      if (!pick) return;
      const id = Number(/^#(\d+)/.exec(pick)?.[1]);
      if ((await ctx.ui.select(pick, ["Keep it", "Forget it"])) !== "Forget it") return;
      const p = profile;
      let gone = false;
      profileWrite(() => { gone = p.forget(id); });
      ctx.ui.notify(gone ? `forgot memory #${id}` : `memory #${id} was already gone`, "info");
    },
  });
```

- [ ] **Step 6: Lua `--tools`.** In `nvim-tutor/lua/tutor/init.lua` `M.build_cmd`, change the list to `{ "--tools", "read,grep,find,ls,tutor_remember,tutor_recall" }`, with this comment above it: `-- pi-tutor's memory tools (spec 2026-10-13 §7.1); --tools is an allowlist for extension tools too.` Make the same change to the golden harness `--tools` string.

- [ ] **Step 7: Create `pi-tutor/skills/tutor-memory/SKILL.md`.** Follow skill-creator's rules for the description: it says what the skill is and when to use it, and is a little pushy.

````markdown
---
name: tutor-memory
description: "When and how the lazycourse tutor saves and looks up durable facts about the learner with the tutor_remember and tutor_recall tools: the four memory types, what makes a good memory, and what never to save. Use whenever the learner states a preference, a goal, a strength or a weakness, gives feedback on your teaching, makes a project decision, or when you need to know how they learn before answering."
---
# Tutor memory

You keep a small memory about the learner in their profile. It outlives this session. You see its newest entries in the "What you remember about this learner" section. Search the rest with `tutor_recall`.

```
learner says something durable
  │
  ▼
is it one of the four types?
  │ yes
  ▼
tutor_remember {type, text}
  │
  ▼
next session: shown in your prompt
```

## The four types

| Type | Save | Example |
|---|---|---|
| learner | how they learn, what they already know | "knows Go well; compare Rust ideas to Go" |
| feedback | how they want to be taught | "wants shorter replies with one example" |
| project | decisions in their project | "todo CLI stores tasks in todo.json" |
| reference | where something lives | "their notes on ownership are in notes/rust.md" |

## Rules

- One fact per call, in plain words, at most 400 characters.
- Save only what will still be true next week. A memory is not a log of this conversation.
- Before saving, check that the fact isn't already in your memory section; use `tutor_recall` if unsure.
- Use what you remember: when a saved preference applies, follow it without announcing it.

## Never save

- Secrets: keys, tokens, passwords (the tool refuses them anyway).
- Code, stack traces, or file contents: the files are the source of truth.
- Things only true right now ("is stuck on line 4").
- Your judgments of single answers: the extension already records episodes and ease.
````

- [ ] **Step 8: The golden harness.** In `golden/harness.ts`, import `parseJudgment, toJudgment, isJudgmentTool` from `../extensions/tutor/judgment.js` and `type Judgment`. Replace `repliesOf` with:

```ts
type Content = { type: string; text?: string; name?: string; arguments?: unknown };
type JsonEvent = { type?: string; message?: { role?: string; content?: Content[] } };

/**
 * One entry per agent run: the last non-empty assistant text, the first judgment in the run (from
 * any turn's text or a tutor-judgment tool call, as production takes it), and the tools called.
 */
export function runsOf(stdout: string): { reply: string; judgment: Judgment | null; tools: string[] }[] {
  const runs: { reply: string; judgment: Judgment | null; tools: string[] }[] = [];
  let reply = "", judgment: Judgment | null = null, tools: string[] = [];
  for (const line of stdout.split("\n")) {
    let ev: JsonEvent;
    try { ev = JSON.parse(line) as JsonEvent; } catch { continue; }
    if (ev.type === "message_end" && ev.message?.role === "assistant") {
      const content = ev.message.content ?? [];
      const text = content.filter((c) => c.type === "text").map((c) => c.text ?? "").join("\n");
      for (const c of content) if (c.type === "toolCall" && c.name) {
        tools.push(c.name);
        if (!judgment && isJudgmentTool(c.name)) judgment = toJudgment(c.arguments);
      }
      if (!judgment) judgment = parseJudgment(text);
      if (text.trim()) reply = text;
    } else if (ev.type === "agent_end") {
      runs.push({ reply, judgment, tools });
      reply = ""; judgment = null; tools = [];
    }
  }
  return runs;
}

export function repliesOf(stdout: string): string[] {
  return runsOf(stdout).map((r) => r.reply);
}
```

`GoldenRun` gains `runs: ReturnType<typeof runsOf>` (set in `close`: `runs: runsOf(out)`, plus `replies: repliesOf(out)`), and it also returns the `profilePath` it seeded. In `golden/tutor.golden.ts`, `report()` takes the run's judgment: `report(reply, judgment, o)` uses `judgment` instead of `parseJudgment(reply)`. Each case passes `r.runs[i].judgment`. Add one case:

```ts
  it("memory: a stated preference is saved with tutor_remember", async () => {
    const r = await runTutor({ level: 50, language: "python", files: { "app.py": APP },
      messages: ["Please remember this for later: I already know Go well, so explain Python ideas by comparing them to Go."] });
    const run = r.runs.at(-1);
    expect(run?.tools, run?.reply).toContain("tutor_remember");
    const p = Profile.open(r.profilePath);
    expect(p.memories({ language: null, limit: 5 }).map((m) => m.text).join(" "), run?.reply).toMatch(/Go/);
    p.close();
  }, T);
```

(import `Profile` from `../extensions/tutor/profile.js`).

- [ ] **Step 9: Run and pass, then count lines.**
Run: `cd pi-tutor && npm test && npm run typecheck`, then the Lua suite.
Expected: PASS.
Then run `wc -l extensions/tutor/memory.ts`, and count the lines added to `profile.ts` and `index.ts` for memory (`git diff --stat`). Write the total in the ledger. If it is over 400, stop and report: the §7.1 fallback to `@pify/memory` is triggered.

- [ ] **Step 10: Commit.**

```bash
git add pi-tutor nvim-tutor
git commit -m "feat(pi-tutor): tutor memory — tutor_remember/tutor_recall, frozen snapshot, /tutor-memory, tutor-memory skill"
```

---

### Task 4: Runtime-error episodes from a failing `:TutorRun`

**Files:**
- Modify: `pi-tutor/extensions/tutor/ladder.ts`, `stuck.ts`, `context.ts`, `index.ts`
- Create: `pi-tutor/skills/tutor-stack-traces/SKILL.md`
- Test: `pi-tutor/test/ladder.test.ts`, `stuck.test.ts`, `context.test.ts`, `episode.test.ts`, `skills.test.ts`

**Interfaces:**
- Produces:
  - `Trigger` gains `{ kind: "run"; cmd: string[]; code: number; trace: string }`;
  - `traceOf(stdout: string, stderr: string): string` (stuck.ts);
  - `TRACE_LINES = 30`, `TRACE_CHARS = 3000`;
  - `yieldsTo` holds run episodes too.

- [ ] **Step 1: Write the failing tests.**

`test/stuck.test.ts` (append):

```ts
import { traceOf, TRACE_LINES, TRACE_CHARS } from "../extensions/tutor/stuck.js";

describe("failing runs (spec 2026-10-13 §7 #4)", () => {
  const det = () => new StuckDetector(() => ({ errorMs: 0, idleMs: 1000 }), () => false); // canOpen false: a run still opens
  it("a non-zero exit opens a run trigger carrying the trace; zero passes", () => {
    const d = det();
    expect(d.observe({ kind: "run_output", cmd: ["python", "a.py"], code: 1, stdout: "", stderr: "Traceback\n  File \"a.py\", line 3\nKeyError: 'x'" }, 1))
      .toEqual([{ type: "open", trigger: { kind: "run", cmd: ["python", "a.py"], code: 1, trace: "Traceback\n  File \"a.py\", line 3\nKeyError: 'x'" } }]);
    expect(d.observe({ kind: "run_output", cmd: ["x"], code: 0, stdout: "", stderr: "" }, 2)).toEqual([{ type: "run_passed" }]);
  });
  it("traceOf keeps the last lines of stderr (stdout when stderr is blank), capped", () => {
    const long = Array.from({ length: 100 }, (_, i) => `line ${i}`).join("\n");
    const t = traceOf("", long);
    expect(t.split("\n")).toHaveLength(TRACE_LINES);
    expect(t.endsWith("line 99")).toBe(true);
    expect(traceOf("only stdout", "  \n")).toBe("only stdout");
    expect(traceOf("", "y".repeat(10_000)).length).toBeLessThanOrEqual(TRACE_CHARS);
  });
});
```

`test/ladder.test.ts` (append):

```ts
describe("run episodes", () => {
  const run = { kind: "run" as const, cmd: ["cargo", "run"], code: 101, trace: "thread 'main' panicked at src/main.rs:4:5" };
  it("hold their place against editor triggers and describe the failed command", () => {
    expect(yieldsTo(openEpisode(run, "beginner", 1))).toBe(false);
    expect(describeTrigger(run)).toBe("run failed (exit 101): cargo run");
  });
});
```

`test/context.test.ts` (append; import `openEpisode` if needed):

```ts
describe("run episode context", () => {
  it("carries the trace and points at the stack-trace skill", () => {
    const ep = openEpisode({ kind: "run", cmd: ["python", "a.py"], code: 1, trace: "KeyError: 'x'" }, "beginner", 1);
    const c = formatEpisodeContext(ep);
    expect(c).toMatch(/^\[episode\] stuck on: run failed \(exit 1\): python a\.py/);
    expect(c).toContain("```text\nKeyError: 'x'\n```");
    expect(c).toContain("tutor-stack-traces");
  });
});
```

`test/episode.test.ts` (append; it already boots against a real headless Neovim through `linked()`, so payloads take the real `vim.rpcnotify` path that `:TutorRun` uses):

```ts
/** What `:TutorRun` sends (nvim-tutor init.lua M.run → M.notify_tutor). */
const runPayload = (code: number, stderr = "") =>
  nvim!.lua(`vim.rpcnotify(vim.g.tutor_chan, "tutor", ...)`, [{ kind: "run_output", cmd: ["python3", "a.py"], code, stdout: "", stderr }]);

describe("runtime-error episodes (spec 2026-10-13 §7 #4)", () => {
  it("a failing run takes over an open error episode and nudges inside the gap", async () => {
    const b = await linked();
    await setError("boom");
    await until(() => b.sent.length === 1); // the error episode's nudge starts the 2-minute gap
    await runPayload(1, "Traceback (most recent call last):\n  File \"a.py\", line 1\nKeyError: 'x'");
    await until(() => b.sent.length === 2);
    expect(b.sent[1].text).toBe("[tutor] stuck signal: run failed (exit 1): python3 a.py");
    const eps = episodes(b.entries);
    expect(eps.at(-1)).toMatchObject({ trigger: { kind: "run", code: 1, trace: expect.stringContaining("KeyError: 'x'") } });
    expect(eps.find((e) => (e.trigger as { kind: string }).kind === "error" && e.closeReason === "superseded")).toBeTruthy();
    expect(b.widgets["tutor"]?.[1]).toBe("stuck: run failed (exit 1): python3 a.py");
  }, 20000);

  it("a passing run closes the run episode; an editor error does not replace it", async () => {
    const b = await linked();
    await runPayload(1, "KeyError: 'x'");
    await until(() => b.widgets["tutor"]?.[1]?.startsWith("stuck: run failed") === true);
    await setError("later"); // run episodes hold their place
    await new Promise((r) => setTimeout(r, 300));
    expect(episodes(b.entries).at(-1)).toMatchObject({ trigger: { kind: "run" } });
    await runPayload(0);
    await until(() => b.widgets["tutor"]?.[1] === "episode closed (run_passed)");
  }, 20000);
});
```

`test/skills.test.ts`: add `"tutor-stack-traces"` to the loop list, plus:

```ts
  it("tutor-stack-traces teaches the method and covers the five languages", () => {
    const t = read("tutor-stack-traces");
    for (const s of ["## Python", "## Rust", "## Go", "## TypeScript", "## Lua", "last line"]) expect(t).toContain(s);
  });
```

- [ ] **Step 2: Run them and watch them fail.**
Run: `cd pi-tutor && npx vitest run test/stuck.test.ts test/ladder.test.ts test/context.test.ts test/episode.test.ts test/skills.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement.**

`ladder.ts`: add the trigger kind and make `yieldsTo` hold runs:

```ts
  | { kind: "run"; cmd: string[]; code: number; trace: string }
```

```ts
export function yieldsTo(ep: Episode | null): boolean {
  return ep === null || (ep.trigger.kind !== "error" && ep.trigger.kind !== "run");
}
```

Update the doc comment: "Error and run episodes hold their place: they close from the editor (the error clears, a run passes)". Add to `describeTrigger`:

```ts
    case "run": {
      const cmd = t.cmd.join(" ");
      return `run failed (exit ${t.code}): ${cmd.length > 60 ? `${cmd.slice(0, 59)}…` : cmd}`;
    }
```

`stuck.ts`:

```ts
/** How much of a failing run's output an episode carries (spec 2026-10-13 §7 #4). */
export const TRACE_LINES = 30;
export const TRACE_CHARS = 3000;

/** The end of the output, where traces put the error: stderr, or stdout when stderr is blank. */
export function traceOf(stdout: string, stderr: string): string {
  const src = stderr.trim() ? stderr : stdout;
  const lines = src.split(/\r?\n/).filter((l) => l.trim()).slice(-TRACE_LINES).join("\n");
  return lines.length > TRACE_CHARS ? lines.slice(-TRACE_CHARS) : lines;
}
```

and the `run_output` case becomes:

```ts
      case "run_output":
        // A failed run is the learner's own explicit check: it opens even when another episode is open.
        out.push(p.code === 0 ? { type: "run_passed" } : { type: "open", trigger: { kind: "run", cmd: p.cmd, code: p.code, trace: traceOf(p.stdout, p.stderr) } });
        break;
```

Also update the `StuckEvent` comment: "run_output → run_passed or a run trigger".

`context.ts` `formatEpisodeContext`: after the concepts line, add:

```ts
  if (ep.trigger.kind === "run") {
    out.push("trace (last lines of the output):", "```text", ep.trigger.trace, "```",
      "Read it with the learner from the last line up to their own file; the tutor-stack-traces skill has the method.");
  }
```

`index.ts` `openEp`:

```ts
  function openEp(trigger: Trigger, nudge: boolean) {
    // A failed run is the learner's explicit check: it replaces any episode and nudges without the gap.
    const run = trigger.kind === "run";
    if (episode) {
      if (!nudge || !(run || yieldsTo(episode))) return;
      closeEp("superseded");
    }
    const now = Date.now();
    episode = openEpisode(trigger, bandFor(level()), now);
    pi.appendEntry("tutor_episode", episode);
    if (nudge && session?.isIdle() && (run || now - lastNudge >= NUDGE_GAP_MS)) {
      lastNudge = now;
      pi.sendUserMessage(`${TUTOR_PREFIX} stuck signal: ${describeTrigger(trigger)}`, { deliverAs: "followUp" });
    }
  }
```

(Keep the existing comments about chat/idle/churn and spec §4 above the matching lines.)

`skills/tutor-stack-traces/SKILL.md`:

````markdown
---
name: tutor-stack-traces
description: "How the lazycourse tutor teaches a learner to read an error trace from a failed run (Python tracebacks, Rust panics, Go panics, Node/TypeScript stack traces, Lua errors): start at the last line, find the learner's own frame, open that line, ask what value was there. Use whenever an [episode] says a run failed, or the learner pastes an error with a stack trace."
---
# Reading a stack trace

Teach the method, not the fix: the learner reads the trace with you.

```
last line: what went wrong
  │
  ▼
walk up the frames
  │  skip library/runtime frames
  ▼
first frame in the learner's files
  │
  ▼
open that file:line
  │
  ▼
which value was not what they
expected there?
```

At rung 1 ask which line of the trace says what went wrong. At rung 2 name the error type and what it means. At rung 3 point at their frame (`path:line`).

## Python
`Traceback (most recent call last)`: the **last line** is the error (`KeyError: 'name'`); the frame just above it is where it happened. Frames from `site-packages` or `/lib/python3` are not theirs.

## Rust
`thread 'main' panicked at src/main.rs:4:5:` names the place, and the next line is the message. `RUST_BACKTRACE=1` shows the frames; theirs start with their crate name.

## Go
`panic: …` is the message; under `goroutine 1 [running]:` each frame is a function line followed by a `file.go:line` line. The first frame in their `main` package is theirs.

## TypeScript
Node prints the error first (`TypeError: …`), then `at fn (file.ts:line:col)` frames, newest first. Frames under `node_modules` or `node:internal` are not theirs.

## Lua
`lua: file.lua:3: attempt to index a nil value (local 'user')` is the place and message; `stack traceback:` lists the callers below.
````

- [ ] **Step 4: Run and pass.**
Run: `cd pi-tutor && npm test && npm run typecheck`
Expected: PASS. If `learn.ts` or `ui.ts` switches on `trigger.kind` exhaustively, TypeScript flags it. Add the `run` case there with the same wording as `describeTrigger`.

- [ ] **Step 5: Commit.**

```bash
git add pi-tutor
git commit -m "feat(pi-tutor): a failing :TutorRun opens a run episode with the trace; tutor-stack-traces skill"
```

---

### Task 5: `/tutor-feedback`

**Files:**
- Create: `pi-tutor/extensions/tutor/feedback.ts`
- Modify: `pi-tutor/extensions/tutor/index.ts`, `nvim-tutor/lua/tutor/init.lua`
- Test: `pi-tutor/test/feedback.test.ts`, `pi-tutor/test/smoke.test.ts`, `nvim-tutor/tests/init_spec.lua`

**Interfaces:**
- Consumes: `FeedbackKind`, `Profile.recordFeedback`, `Profile.feedback` (Task 2); `rungCap` (ladder.ts).
- Produces:
  - `FEEDBACK_KINDS: readonly FeedbackKind[]`;
  - `activeFeedback(history: FeedbackKind[]): FeedbackKind[]`;
  - `feedbackRung(kind: FeedbackKind, rung: number, cap: number): number`;
  - `formatFeedback(active: FeedbackKind[]): string | null`.

- [ ] **Step 1: Write the failing tests.** Create `pi-tutor/test/feedback.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { FEEDBACK_KINDS, activeFeedback, feedbackRung, formatFeedback } from "../extensions/tutor/feedback.js";

describe("/tutor-feedback (spec 2026-10-13 §7 #7)", () => {
  it("has exactly the four kinds", () => {
    expect(FEEDBACK_KINDS).toEqual(["too-long", "too-vague", "too-much-help", "good"]);
  });
  it("folds history: kinds stay active until good clears them", () => {
    expect(activeFeedback(["too-long", "too-vague", "too-long"])).toEqual(["too-long", "too-vague"]);
    expect(activeFeedback(["too-long", "good", "too-much-help"])).toEqual(["too-much-help"]);
    expect(activeFeedback([])).toEqual([]);
  });
  it("too-much-help lowers the rung, too-vague raises it, both within 1..cap", () => {
    expect(feedbackRung("too-much-help", 3, 5)).toBe(2);
    expect(feedbackRung("too-much-help", 1, 5)).toBe(1);
    expect(feedbackRung("too-vague", 4, 4)).toBe(4);
    expect(feedbackRung("too-vague", 2, 5)).toBe(3);
    expect(feedbackRung("too-long", 3, 5)).toBe(3);
    expect(feedbackRung("good", 3, 5)).toBe(3);
  });
  it("renders one [tutor-feedback] note per active kind, or null", () => {
    expect(formatFeedback([])).toBeNull();
    const n = formatFeedback(["too-long", "too-much-help"])!;
    expect(n.startsWith("[tutor-feedback]")).toBe(true);
    expect(n).toMatch(/too long/);
    expect(n).toMatch(/work things out/);
    expect(n).toMatch(/complete/i); // shorter never means dropping needed detail (spec §2 "Complete")
  });
});
```

Append to `pi-tutor/test/smoke.test.ts`:

```ts
describe("/tutor-feedback in the extension", () => {
  it("logs to the profile in a project, adjusts the open episode's rung, and notes the style next turn", async () => {
    const dir = mkd(pjoin(tmp(), "pitutor-fb-"));
    const file = pjoin(dir, "profile.sqlite");
    const { Profile } = await import("../extensions/tutor/profile.js");
    const seed = Profile.open(file); seed.saveLanguage("python", 50, {}, 1); seed.addProject("python", dir, "p", 1); seed.close();
    const saved = process.env.PI_TUTOR_PROFILE; process.env.PI_TUTOR_PROFILE = file;
    try {
      const b = await boot({ cwd: dir });
      await turn(b.events, b.ctx, REASONED, judged("correct")); // chat episode, rung 2 → 3
      await b.commands["tutor-feedback"].handler("too-much-help", b.ctx);
      expect(episodes(b.entries).at(-1)).toMatchObject({ rung: 2 });
      await b.commands["tutor-feedback"].handler("too-long", b.ctx);
      const next = await turn(b.events, b.ctx, "hi", judged("none"));
      expect(next.message?.content).toMatch(/\[tutor-feedback\][\s\S]*too long/);
      await b.events["session_shutdown"]({ type: "session_shutdown" }, b.ctx);
      const check = Profile.open(file);
      expect(check.feedback("python").map((f) => [f.kind, f.rung])).toEqual([["too-much-help", 3], ["too-long", 2]]);
      check.close();
      const again = await boot({ cwd: dir }); // a new session in the same project keeps the note
      const t = await turn(again.events, again.ctx, "hi", judged("none"));
      expect(t.message?.content).toMatch(/too long/);
      await again.commands["tutor-feedback"].handler("good", again.ctx);
      const cleared = await turn(again.events, again.ctx, "hi", judged("none"));
      expect(cleared.message?.content ?? "").not.toContain("[tutor-feedback]");
    } finally {
      if (saved === undefined) delete process.env.PI_TUTOR_PROFILE; else process.env.PI_TUTOR_PROFILE = saved;
    }
  });
  it("/tutor-feedback edge cases: bad kind warns; no episode or architect role logs without a rung change", async () => {
    const b = await boot();
    await b.commands["tutor-feedback"].handler("meh", b.ctx);
    expect(b.notes.at(-1)).toMatch(/usage: \/tutor-feedback too-long\|too-vague\|too-much-help\|good/);
    await b.commands["tutor-feedback"].handler("too-vague", b.ctx); // no episode open
    expect(b.entries.filter((e) => e.type === "tutor_feedback").at(-1)?.data).toMatchObject({ kind: "too-vague" });
    await turn(b.events, b.ctx, REASONED, judged("none"));
    const before = episodes(b.entries).length;
    await b.commands["tutor-architect"].handler("", b.ctx);
    await b.commands["tutor-feedback"].handler("too-much-help", b.ctx);
    expect(episodes(b.entries).length).toBe(before);
  });
});
```

Append to `nvim-tutor/tests/init_spec.lua`:

```lua
  it(":TutorFeedback types its slash command and completes the four kinds", function()
    local tutor = require("tutor")
    vim.cmd("Tutor")
    vim.cmd("TutorFeedback too-long")
    local buf = tutor.state.term:bufnr()
    vim.wait(1000, function() return vim.tbl_contains(vim.api.nvim_buf_get_lines(buf, 0, -1, false), "/tutor-feedback too-long") end)
    assert.is_true(vim.tbl_contains(vim.api.nvim_buf_get_lines(buf, 0, -1, false), "/tutor-feedback too-long"))
    assert.same({ "too-long", "too-vague", "too-much-help", "good" }, vim.fn.getcompletion("TutorFeedback ", "cmdline"))
  end)
```

- [ ] **Step 2: Run them and watch them fail.**
Run the pi-tutor files above and the Lua suite. Expected: FAIL.

- [ ] **Step 3: Create `pi-tutor/extensions/tutor/feedback.ts`:**

```ts
import type { FeedbackKind } from "./profile.js";

// `/tutor-feedback` (spec 2026-10-13 §7 #7): adjusts style and rung, logged in the profile.
export const FEEDBACK_KINDS: readonly FeedbackKind[] = ["too-long", "too-vague", "too-much-help", "good"];

const NOTES: Record<Exclude<FeedbackKind, "good">, string> = {
  "too-long": "the learner finds your replies too long: keep every part they need, but say each in one or two sentences and drop examples they did not ask for",
  "too-vague": "the learner finds your replies too vague: point at exact lines (path:line), name the concept precisely, and give one concrete example",
  "too-much-help": "the learner wants to work things out: hint less, ask one more question before pointing",
};

/** History → active kinds: each kind stays on until `good` clears them all; first-seen order. */
export function activeFeedback(history: FeedbackKind[]): FeedbackKind[] {
  let active: FeedbackKind[] = [];
  for (const k of history) {
    if (k === "good") active = [];
    else if (!active.includes(k)) active.push(k);
  }
  return active;
}

export function feedbackRung(kind: FeedbackKind, rung: number, cap: number): number {
  if (kind === "too-much-help") return Math.max(1, rung - 1);
  if (kind === "too-vague") return Math.min(cap, rung + 1);
  return rung;
}

/** The hidden per-turn note; shorter never means dropping needed detail (spec §2 "Complete"). */
export function formatFeedback(active: FeedbackKind[]): string | null {
  const lines = active.filter((k): k is Exclude<FeedbackKind, "good"> => k !== "good").map((k) => `- ${NOTES[k]}`);
  return lines.length ? ["[tutor-feedback] The learner told you how to teach them; keep replies complete, and:", ...lines].join("\n") : null;
}
```

- [ ] **Step 4: Wire it into `index.ts`.**
  - Imports: `import { FEEDBACK_KINDS, activeFeedback, feedbackRung, formatFeedback } from "./feedback.js";`, `type FeedbackKind` from profile.js, and `rungCap` from ladder.js.
  - State: `/** The learner's feedback history (spec §7 #7): the profile's per language in a project, else this session's. */ let feedbackHistory: FeedbackKind[] = [];`
  - In `session_start`, after the memory snapshot:

```ts
    feedbackHistory = [];
    if (project && profile) { const p = profile, lang = project.language; profileWrite(() => { feedbackHistory = p.feedback(lang).map((f) => f.kind); }); }
    else for (const e of ctx.sessionManager.getBranch()) {
      if (e.type === "custom" && e.customType === "tutor_feedback") feedbackHistory.push((e.data as { kind: FeedbackKind }).kind);
    }
```

  - In `before_agent_start`, after the `[tutor-check]` line: `const fb = formatFeedback(activeFeedback(feedbackHistory)); if (fb) parts.push(fb);`.
  - The command:

```ts
  pi.registerCommand("tutor-feedback", {
    description: "Tell the tutor how it is teaching: too-long | too-vague | too-much-help | good",
    handler: async (args, ctx) => {
      const kind = args.trim() as FeedbackKind;
      if (!FEEDBACK_KINDS.includes(kind)) { ctx.ui.notify("usage: /tutor-feedback too-long|too-vague|too-much-help|good", "warning"); return; }
      const rung = episode ? episode.rung : null;
      if (episode && roleNamed(activeRole).ladder) {
        const next = feedbackRung(kind, episode.rung, rungCap(episode.band));
        if (next !== episode.rung) { episode = { ...episode, rung: next }; pi.appendEntry("tutor_episode", episode); }
      }
      feedbackHistory.push(kind);
      pi.appendEntry("tutor_feedback", { kind, rung });
      if (project && profile) { const p = profile, proj = project; profileWrite(() => p.recordFeedback({ kind, language: proj.language, project: proj.path, rung }, Date.now())); }
      paint();
      ctx.ui.notify(kind === "good" ? "thanks — the tutor keeps going like this" : `noted: ${kind}; the tutor adjusts from the next reply`, "info");
    },
  });
```

  The profile log records the rung **before** the adjustment. The test expects `[["too-much-help", 3], ["too-long", 2]]`.

- [ ] **Step 5: Lua.** In `M.setup`, after `TutorArchitect`:

```lua
  cmd("TutorFeedback", slash("/tutor-feedback"), { nargs = 1,
    complete = function() return { "too-long", "too-vague", "too-much-help", "good" } end })
```

- [ ] **Step 6: Run and pass.** Run both suites and the typecheck. Expected: PASS.

- [ ] **Step 7: Commit.**

```bash
git add pi-tutor nvim-tutor
git commit -m "feat: /tutor-feedback and :TutorFeedback adjust style and rung, logged in the profile"
```

---

### Task 6: M6a deferred minors that live in M6b's code

**Files:**
- Modify: `pi-tutor/extensions/tutor/compliance.ts`, `workflow.ts`, `index.ts`
- Test: `pi-tutor/test/compliance.test.ts`, `workflow.test.ts`, `smoke.test.ts`, `episode.test.ts`

The minors (from the M6a ledger):
- (a) indented and `~~~` fences escape `checkReply`;
- (b) `turn_end` uses a stop-reason deny-list;
- (c) `/tutor-architect` doesn't suspend an active recipe;
- (d) stuck nudges fire in the architect role;
- (e) `workflowLabel` has a dead "plan done" branch.

The golden harness minor was done in Task 3. "Steering mid-run" stays unverified and is recorded for M6c.

- [ ] **Step 1: Write the failing tests.** Append to `compliance.test.ts`:

```ts
describe("M6a minors: fence forms", () => {
  it("an indented fence inside a list item and a ~~~ fence are checked", () => {
    const listed = ["1. Try this:", "   ```python", "   a = 1", "   ```", JUDGED].join("\n");
    expect(checkReply(listed, { ...ok, rung: 2 })).toContain("code-above-rung");
    expect(checkReply(["~~~", "x".repeat(DIAGRAM_COLS + 1), "~~~", JUDGED].join("\n"), ok)).toContain("wide-diagram");
  });
});
```

In `workflow.test.ts`, change the "advances…" test: after `w = advance(w, true, 9)`, drop the `"plan done"` expectation, and assert instead `expect(workflowLabel({ ...w, done: undefined })).toBe("plan 6/6")`.

Append to `smoke.test.ts`:

```ts
describe("M6a minors in the turn loop", () => {
  it("turns that stop for any reason other than stop or toolUse carry no judgment", async () => {
    const b = await boot();
    for (const stop of ["pending", "deferred"]) await turn(b.events, b.ctx, REASONED, judged("correct", false, stop));
    expect(b.entries.some((e) => e.type === "tutor_judgment")).toBe(false);
  });
  it("the architect role suspends an active recipe: no [workflow] context, no step_done, no recipe hold", async () => {
    const dir = mkd(pjoin(tmp(), "plan-")); mkdir(pjoin(dir, "spec"));
    wfile(pjoin(dir, "spec", "tasks.md"), "- [ ] P1.T1 Parse argv\n");
    const b = await boot({ cwd: dir });
    await b.commands["tutor-plan"].handler("P1.T1", b.ctx);
    await b.commands["tutor-architect"].handler("", b.ctx);
    const opts = await turn(b.events, b.ctx, REASONED, assistant('ok\n```tutor-judgment\n{"judgment":"none","step_done":true}\n```'));
    expect(opts.message?.content ?? "").not.toContain("[workflow]");
    expect(opts.message?.content ?? "").not.toContain("During the design recipe");
    expect(b.entries.filter((e) => e.type === "tutor_workflow").at(-1)?.data).toMatchObject({ step: 1 });
    await b.commands["tutor-architect"].handler("off", b.ctx);
    const back = await turn(b.events, b.ctx, "hi", judged("none"));
    expect(back.message?.content).toContain("[workflow]");
  });
});
```

For (d), append to `test/episode.test.ts` (real Neovim, as in Task 4):

```ts
describe("architect role and stuck signals (M6a minor)", () => {
  it("an editor error opens an episode silently while the architect is active", async () => {
    const b = await linked();
    await b.commands["tutor-architect"].handler("", b.ctx);
    await setError("boom");
    await until(() => episodes(b.entries).some((e) => (e.trigger as { kind: string }).kind === "error"));
    await new Promise((r) => setTimeout(r, 300));
    expect(b.sent).toEqual([]);
  }, 20000);
});
```

- [ ] **Step 2: Run them and watch them fail.**

- [ ] **Step 3: Implement.**
  - (a) `compliance.ts`:

```ts
const FENCES = /^ {0,3}(`{3,}|~{3,})([^\n`~]*)\r?\n([\s\S]*?)(?:^ {0,3}\1[ \t]*$|(?![\s\S]))/gm;
```

    In `checkReply`, the tag is `m[2]` and the body is `m[3]`. Strip up to the opening indent from each body line before measuring width: `body.map((l) => l.replace(/^ {0,3}/, ""))`. Update every `m[1]` and `m[2]` use.
  - (b) `index.ts` `turn_end`: replace the deny-list line with `if (m.stopReason !== "stop" && m.stopReason !== "toolUse") return; // pending, deferred, aborted, error, length carry no judgment`.
  - (c) `index.ts`:
    - `before_agent_start`: `if (workflow && role.ladder) parts.push(formatWorkflowContext(workflow, band));` and `replyReminder(run.rung, workflow !== null && role.ladder)`;
    - `applyTurnJudgment`: compute `const ladder = roleNamed(activeRole).ladder;` first, then `const inRecipe = workflow !== null && ladder; if (ladder) advanceWorkflow(j.step_done);`.
  - (d) `index.ts` `openEp`: the nudge condition gains `roleNamed(activeRole).ladder &&`, with the comment `// the architect discusses design; editor stuck signals still open episodes but do not interrupt it`.
  - (e) `workflow.ts`: `export function workflowLabel(w: Workflow): string { return \`plan ${w.step}/${STEPS.length}\`; }`. A finished workflow is never shown (index.ts drops it).

- [ ] **Step 4: Run and pass.** Run both suites and the typecheck.

- [ ] **Step 5: Commit.**

```bash
git add pi-tutor
git commit -m "fix(pi-tutor): M6a minors — indented/~~~ fences, stop-reason allow-list, architect suspends the recipe and nudges"
```

---

### Task 7: Surface, docs, golden, live check

**Files:**
- Modify: `pi-tutor/PI_SURFACE.md`, `README.md`, `docs/superpowers/specs/2026-10-07-nvim-tutor-design.md`

- [ ] **Step 1: `PI_SURFACE.md`.** Add the facts from Global Constraints, under the matching headings:
  - `pi.registerTool` / `defineTool` and the execute signature;
  - a thrown error becomes an error result;
  - the `typebox` alias;
  - `--tools` as an allowlist for extension tools;
  - the `tutor_memory` section key;
  - FTS5 in `node:sqlite`;
  - session entries `tutor_feedback { kind, rung }`;
  - profile v2 tables `memory`, `memory_fts`, `feedback`;
  - the `run` trigger.

- [ ] **Step 2: `README.md`.** Add:
  - a "Milestone 6b" paragraph: memory (what it saves, `/tutor-memory` to forget), failing runs open an episode, `:TutorFeedback`;
  - the new commands with one line each;
  - `"TutorFeedback"` added to the setup snippet's `cmd` list.

  In the spec rev line, add `rev 10, 2026-10-13: M6b memory, run episodes, feedback`.

- [ ] **Step 3: Run both suites and the typecheck. Commit.**

```bash
git add pi-tutor/PI_SURFACE.md README.md docs/superpowers/specs/2026-10-07-nvim-tutor-design.md
git commit -m "docs: M6b surface (memory tools, run episodes, feedback), README"
```

- [ ] **Step 4: Golden run.** Run `cd pi-tutor && npm run golden`, which needs the network. Record each case in the ledger, especially the new memory case. Wording fixes, at most one round, go to `skills/tutor-memory/SKILL.md` or the tool descriptions, never to the checks.

- [ ] **Step 5: Live tmux check (the M6b done-when).** Reuse the M6a live-check setup:
  - an isolated `nvim --clean -u init.lua` that loads the worktree's nvim-tutor and pi-tutor (`pi -ne -e … --skill …`);
  - `vim.g.loaded_tutor_mode_plugin = 1`;
  - drive with `C-\ C-n`;
  - a temp profile seeded with python lvl 20 and the project;
  - `run_cmd = { "python3", "todo.py" }`, with a `todo.py` that raises `KeyError`.

  Done when:
  1. "Please remember that I know Go well; compare Python to Go." → the session shows a `tutor_remember` call; `:TutorRestart` → the next reply's prompt has the `tutor_memory` section (check the session file's system message) and the reply compares to Go;
  2. `:TutorRun` → the widget shows `stuck: run failed (exit 1): python3 todo.py` and the nudge reply refers to the `KeyError` line of the trace;
  3. `:TutorFeedback too-long` → the session has a `tutor_feedback` entry, the profile has the row, and the next turn's hidden context has the note.

  Record the results in the ledger.
