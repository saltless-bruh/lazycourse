# Teaching turns, phase 1 (the foundation) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every teaching reply is held, checked by code against this turn's limits, and shown, asked again or
replaced; help climbs with real failed runs instead of the model's judgment.

**Architecture:** The five-rung ladder (`ladder.ts`, rises on the model's `correct`) is replaced by an attempt
count per stuck spot, moved by code from failed `:TutorRun`s. Code picks a turn step from the count
(teach → hint → why → ask → fix), sends one narrow instruction for it, holds the reply off screen while it
streams, and checks it in `message_end` (awaited by Pi) before the UI gets it. A failed reply is replaced and
re-asked through a fresh run, at most twice, then replaced by a safe fallback.

**Tech Stack:** TypeScript (Pi 1.3.0 extension), vitest; no new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-21-teaching-turns-design.md` (§5, §6, §10, §11, §11a; phase 1 of §13).

## Global Constraints

- Nothing writes to stdout/stderr inside Pi (no `console.log`).
- Every Pi API used is verified in `pi-tutor/node_modules/@earendil-works/pi-coding-agent/dist/core/extensions/types.d.ts` and listed in `pi-tutor/PI_SURFACE.md`.
- Editor paths stay inside the project root (`root + "/"` prefix after `realpath`).
- Pi's `bash` tool stays off.
- TDD: write the failing test, watch it fail, implement, watch it pass; run the suite that owns the file.
- Speed is not a goal: a reply may wait for its check.
- The laptop (cloud models, no local checker) must keep working.
- Thinking (spec §6, author): hidden on teaching turns while the fix is not allowed, whatever `/tutor-thinking` says; the learner's setting applies again after the fix and outside teaching turns.
- Which runs count (spec §5, author): a failed run while the editor shows an error in a project file is not an attempt (a typo); a failed run with no error shown is an attempt; a run that succeeds is never an attempt.
- Running code that has not changed since the last failed attempt on that spot is not a new attempt (spec §11a).
- Only graded tries count (spec §5, author): a chat message never moves the attempt count, whatever it says and whether or not the code changed; it is answered at the current step.
- Phases 1 and 2 merge to main together (spec §13): this plan ends on the `teaching-turns` branch with its live check; it is not merged alone.
- Exams: only the teach, hint and why steps; never the ask step, never the fix (spec §11a).
- Out of scope for phase 1: checks and the reference solution (phase 2), the recipe default and teaching format (phase 3), the right-click menu and removing the error nudge (phase 4), intermediate/pro testing (phase 5), the model checker (phase 6). Ticking from `task_done_ids` stays as it is until phase 2.

## Review Focus

1. A reply that quotes the learner's own current (wrong) line, e.g. a `^` marker under `return total * people`, is a quote, not a leak: it must pass the own-code check. (Task 3 test.)
2. When both re-asks fail, the fallback the learner sees must contain no code with the learner's names and no fix. (Task 5 test.)
3. A session saved before this change restores an episode that has `rung` and no `attempts`; it must load as attempts 0, not crash or show `NaN`. (Task 1 test.)
4. An error shown in a file outside the project root (another buffer) must not turn a real failed run into a "typo" run. (Task 4 test.)
5. The rewrite turn is itself held and checked, and the re-ask count does not reset across it: at most 2 re-asks per original reply. (Task 5 test.)

---

### Task 1: The attempt ladder (pure)

**Files:**
- Modify: `pi-tutor/extensions/tutor/ladder.ts` (whole file: `Episode`, rung functions)
- Modify: `pi-tutor/extensions/tutor/policy.ts:24` (`startRung` goes)
- Modify: every importer of a removed name, so the extension keeps loading: `pi-tutor/extensions/tutor/index.ts` (`examCap`, `paint`'s `state.rung`, `setLevel`, `mirror`, `applyTurnJudgment`'s `easeStart` and the recipe's frozen rung, `restoreEpisode` at `:104`), `pi-tutor/extensions/tutor/context.ts:31`, `pi-tutor/extensions/tutor/ui.ts:11,41`
- Test: `pi-tutor/test/ladder.test.ts` (rewrite the `nextRung`/`applyJudgment`/`episodeScore` blocks), `pi-tutor/test/ui.test.ts`

**Interfaces:**
- Produces:
  - `type TurnStep = "teach" | "hint" | "why" | "ask" | "fix"`
  - `Episode` loses `rung`; gains `attempts: number`, `spot?: string`, `lastHash?: string`, `fixAsked?: boolean`, `delay?: 0 | 1`
  - `STAGES: Record<Band, { hint: number; why: number; ask: number; fix: number | null }>` = beginner `{1,2,3,4}`, intermediate `{1,3,5,6}`, pro `{1,2,3,null}`
  - `stepFor(ep: Episode | null, o: { exam: boolean }): TurnStep`
  - `recordAttempt(ep: Episode, a: { spot: string; hash: string }): Episode`
  - `attemptScore(ep: Episode): number | null`
  - `applyJudgment(ep, j, now)` keeps turns, tags and `episode_closed`, never moves help
  - `restoreAttempts(raw: unknown): Episode | null` (old sessions)
- Removed: `RUNG_NAMES`, `rungCap`, `capRung`, `EXAM_RUNG_CAP`, `nextRung`, `easeStart`, `episodeScore`, `startRung`. Their callers change in this task:
  - `examCap` goes, because `stepFor(…, { exam })` caps instead.
  - `TutorState.rung` becomes `attempt?: number`, rendered `try N` only when N > 0.
  - `setLevel` updates `episode.band` only.
  - `mirror()` records `rungs_used: attempts + 1` (the column is kept and now means attempts) and `attemptScore` as the score.
  - At an episode's first judgment, well-known concepts (ease ≥ 0.7) set `delay: 1`, replacing `easeStart`.
  - The recipe's frozen-rung line goes.
  - `context.ts` prints `failed attempts on this spot: N` in place of the rung line; Task 2 adds the instruction.

- [ ] **Step 1: Write the failing tests**

```ts
describe("stepFor (spec 2026-10-21 §5)", () => {
  const ep = (band: Band, attempts: number, extra: Partial<Episode> = {}) => ({ ...openEpisode({ kind: "chat" }, band, 0), attempts, ...extra });
  it("beginner: teach, hint, why, ask, then the fix", () => {
    expect([0, 1, 2, 3, 4, 7].map((n) => stepFor(ep("beginner", n), { exam: false }))).toEqual(["teach", "hint", "why", "ask", "fix", "fix"]);
  });
  it("intermediate takes longer to reach the fix", () => {
    expect([1, 2, 3, 4, 5, 6].map((n) => stepFor(ep("intermediate", n), { exam: false }))).toEqual(["hint", "hint", "why", "why", "ask", "fix"]);
  });
  it("pro: after the question it keeps explaining; the fix only when asked for", () => {
    expect([1, 2, 3, 4, 9].map((n) => stepFor(ep("pro", n), { exam: false }))).toEqual(["hint", "why", "ask", "why", "why"]);
    expect(stepFor(ep("pro", 4, { fixAsked: true }), { exam: false })).toBe("fix");
  });
  it("a well-known concept (delay 1) reaches each later step one attempt later", () => {
    expect([1, 2, 3, 4, 5].map((n) => stepFor(ep("beginner", n, { delay: 1 }), { exam: false }))).toEqual(["hint", "hint", "why", "ask", "fix"]);
  });
  it("during an exam nothing goes past why", () => {
    expect(stepFor(ep("beginner", 6), { exam: true })).toBe("why");
    expect(stepFor(null, { exam: true })).toBe("teach");
  });
});
describe("recordAttempt", () => {
  const base = { ...openEpisode({ kind: "chat" }, "beginner", 0), attempts: 0 };
  it("counts changed code on the same spot, ignores an unchanged rerun, restarts on a new spot", () => {
    const a = recordAttempt(base, { spot: "ZeroDivisionError", hash: "h1" });
    expect(a.attempts).toBe(1);
    expect(recordAttempt(a, { spot: "ZeroDivisionError", hash: "h1" }).attempts).toBe(1);
    expect(recordAttempt(a, { spot: "ZeroDivisionError", hash: "h2" }).attempts).toBe(2);
    expect(recordAttempt(a, { spot: "NameError", hash: "h3" })).toMatchObject({ attempts: 1, spot: "NameError" });
  });
});
describe("attemptScore", () => {
  it("1 without failed attempts, lower the more it took, null when superseded", () => {
    const e = (attempts: number, closeReason?: CloseReason) => ({ ...openEpisode({ kind: "chat" }, "beginner", 0), attempts, closeReason });
    expect(attemptScore(e(0, "run_passed"))).toBe(1);
    expect(attemptScore(e(4, "run_passed"))).toBeCloseTo(0.2);
    expect(attemptScore(e(2, "superseded"))).toBeNull();
  });
});
describe("restoreAttempts (Review Focus #3)", () => {
  it("an episode saved with a rung and no attempts loads as attempts 0", () => {
    expect(restoreAttempts({ id: "ep-1", trigger: { kind: "chat" }, band: "beginner", rung: 3, opened: 1, turns: 2, concept_tags: [] })).toMatchObject({ attempts: 0 });
    expect(restoreAttempts({ id: "ep-1", trigger: { kind: "chat" }, band: "beginner", rung: 3, opened: 1, turns: 2, concept_tags: [], closed: 5 })).toBeNull();
  });
});
```

Also replace the old `applyJudgment` test so it asserts `correct` no longer changes anything but `turns` and tags, and add to `ui.test.ts`:

```ts
it("the widget shows tries, never a rung", () => {
  expect(renderWidget({ ...base, attempt: 2 }).join("\n")).toMatch(/try 2/);
  expect(renderWidget({ ...base }).join("\n")).not.toMatch(/rung|try/);
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd pi-tutor && npx vitest run test/ladder.test.ts`
Expected: FAIL (`stepFor` is not exported).

- [ ] **Step 3: Implement in `ladder.ts`**

`stepFor`: `teach` when `ep` is null or `attempts === 0`; otherwise the latest stage whose start (shifted by `delay` for why/ask/fix) is ≤ `attempts`. A pro past `ask` gets `why` unless `fixAsked` (then `fix`). With `exam: true`, `ask`/`fix` become `why`. `attemptScore`: `null` when superseded; else `1 - min(attempts, F) / (F + 1)`, where F = the band's fix stage (pro: 4). `restoreAttempts` replaces `restoreEpisode`'s shape check in `index.ts:104`: it accepts an open episode with or without `attempts`.

- [ ] **Step 4: Run them to see them pass**

Run: `cd pi-tutor && npm test && npm run typecheck`
Expected: all pass, typecheck clean. Smoke tests that asserted rung numbers are updated to the attempt equivalent in this step; each change is noted in the commit message.

- [ ] **Step 5: Commit**

```bash
git add pi-tutor/extensions/tutor pi-tutor/test
git commit -m "feat: the attempt ladder — help climbs with failed attempts on one spot, not the model's judgment"
```

### Task 2: One narrow instruction per turn

**Files:**
- Create: `pi-tutor/extensions/tutor/turns.ts`
- Modify: `pi-tutor/extensions/tutor/context.ts:27-41` (`formatEpisodeContext`)
- Modify: `pi-tutor/extensions/tutor/compliance.ts` (`replyReminder` takes a step)
- Modify: `pi-tutor/prompts/system/ladder.md`, `pi-tutor/prompts/system/style.md:8,17`, `pi-tutor/skills/tutor-teaching-style/SKILL.md:16,92`
- Modify: `pi-tutor/extensions/tutor/exam/state.ts:24`, where the line becomes `Hints stay at a pointer or a why: never write, complete or fix the learner's solution …`; `pi-tutor/extensions/tutor/report.ts`, where the hint-use series is labelled "tries"
- Test: `pi-tutor/test/turns.test.ts` (new), `pi-tutor/test/context.test.ts`, `pi-tutor/test/compliance.test.ts` (`replyReminder` block), `pi-tutor/test/prompts.test.ts`, `pi-tutor/test/exam-state.test.ts` (`expect(formatExamContext(exam, now)).not.toMatch(/rung/)`), `pi-tutor/test/report.test.ts`

**Interfaces:**
- Consumes: `TurnStep`, `Episode` (Task 1)
- Produces:
  - `TURN_LIMITS: Record<TurnStep, { maxSentences: number | null; ownCode: boolean; question: boolean }>`: teach `{null, false, false}`, hint `{2, false, false}`, why `{6, false, false}`, ask `{3, false, true}`, fix `{null, true, false}`
  - `turnInstruction(step: TurnStep): string`, with this exact copy:
    - teach: `Teach the idea with the labelled parts. Show code only on a small unrelated example, never with the learner's own names, and end by asking them to try their own line.`
    - hint: `One small hint that points at the spot (the line or the value that is off). At most 2 sentences. No code with the learner's names and no fix.`
    - why: `Say clearly why it is wrong and what kind of change fixes it, from the run output. At most 6 sentences. No code with the learner's names, and do not state the corrected line.`
    - ask: `Before explaining anything, ask what they were thinking when they wrote that part, or whether they guessed. Only the question: at most 3 sentences, ending with a question mark.`
    - fix: `Give the fix for only the stuck part: that one line, with one sentence of why. Everything else stays theirs.`
  - `fallbackReply(step: TurnStep, spot?: string): string` (used by Task 5; never contains code)
  - `formatEpisodeContext(ep: Episode, step: TurnStep): string`: lines `[episode] stuck on: …`, `failed attempts on this spot: N`, `this turn: <turnInstruction(step)>`, then concepts and trace as today; it never contains the word "rung"
  - `replyReminder(step: TurnStep | null, recipe?: boolean): string`, ending with `This turn: <instruction>` when `step` is set

- [ ] **Step 1: Write the failing tests**

```ts
describe("turns (spec 2026-10-21 §6)", () => {
  it("each step has its limits and one instruction", () => {
    expect(TURN_LIMITS.hint).toEqual({ maxSentences: 2, ownCode: false, question: false });
    expect(TURN_LIMITS.ask.question).toBe(true);
    expect(TURN_LIMITS.fix.ownCode).toBe(true);
    for (const s of ["teach", "hint", "why", "ask", "fix"] as const) expect(turnInstruction(s)).not.toMatch(/rung/i);
    expect(turnInstruction("ask")).toMatch(/what they were thinking/);
  });
  it("fallbacks hold no code and no fix", () => {
    for (const s of ["teach", "hint", "why", "ask", "fix"] as const) expect(fallbackReply(s, "ZeroDivisionError")).not.toMatch(/`|```/);
  });
});
// context.test.ts
it("the episode context gives the attempt count and this turn's instruction, never a rung", () => {
  const ep = { ...openEpisode({ kind: "chat" }, "beginner", 0), attempts: 2 };
  const t = formatEpisodeContext(ep, "why");
  expect(t).toContain("failed attempts on this spot: 2");
  expect(t).toContain(`this turn: ${turnInstruction("why")}`);
  expect(t).not.toMatch(/rung/i);
});
// prompts.test.ts
it("no system prompt or teaching skill talks about rungs", () => {
  for (const name of ["ladder", "style"]) expect(systemText(name)).not.toMatch(/\brung/i);
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd pi-tutor && npx vitest run test/turns.test.ts test/context.test.ts test/prompts.test.ts test/compliance.test.ts`
Expected: FAIL (`turns.ts` missing; the prompts mention rungs).

- [ ] **Step 3: Implement `turns.ts`, the two signatures and the prompt text**

Rewrite `ladder.md`: the `[episode]` line says how many failed attempts there are and gives **this turn's instruction**; follow it exactly; help comes from attempts the editor counts, never from the learner asking for more; `[tutor]` messages stay automatic signals. In `style.md` and the skill, "the current rung" becomes "this turn's instruction".

- [ ] **Step 4: Run them to see them pass**

Run: `cd pi-tutor && npx vitest run test/turns.test.ts test/context.test.ts test/prompts.test.ts test/compliance.test.ts test/skills.test.ts test/exam-state.test.ts test/report.test.ts`
Expected: PASS. `grep -rn "rung" pi-tutor/extensions pi-tutor/prompts pi-tutor/skills | grep -v "^.*test"` finds only the scrubber's patterns in `compliance.ts`.

- [ ] **Step 5: Commit**

```bash
git add pi-tutor/extensions/tutor/turns.ts pi-tutor/extensions/tutor/context.ts pi-tutor/extensions/tutor/compliance.ts pi-tutor/prompts/system pi-tutor/skills/tutor-teaching-style/SKILL.md pi-tutor/test
git commit -m "feat: one narrow instruction per turn, from the attempt step"
```

### Task 3: Code checks a reply against this turn (C fixes included)

**Files:**
- Modify: `pi-tutor/extensions/tutor/compliance.ts` (new exports; `scrubLine` rung patterns)
- Test: `pi-tutor/test/compliance.test.ts`

**Interfaces:**
- Consumes: `TURN_LIMITS`, `TurnStep` (Tasks 1–2)
- Produces:
  - `type TurnIssue = "own-code" | "too-long" | "no-question" | "machinery"`
  - `ownNames(i: { tasksMd: string | null; sources: string[] }): Set<string>`: every `name(params)` in backticks in `tasksMd`, and every `def|function|fn|func` definition in `sources`, with its parameter names (types and defaults stripped); names shorter than 3 characters are left out
  - `checkTurn(text: string, o: { step: TurnStep; names: Set<string>; sourceLines: string[] }): TurnIssue[]`
  - `foldPreamble(text: string): string`: drops the prose before the first `**Label**:` line, only when such a line exists and the text before it is not a fence
- Rules for `checkTurn`:
  - `own-code` (only when `ownCode` is false): a fenced block (not `markdown`/`md`) or an inline code span that contains a name from `names` *and* another token (operator, bracket, keyword or a second identifier). A code line equal, after trimming, to a line in `sourceLines` is a quote and is allowed. Diagram-only lines (`^`, arrows, box drawing) are ignored.
  - `too-long`: sentences in the prose outside fences > `maxSentences`.
  - `no-question`: `question` is true and the prose has no `?`.
  - `machinery`: the existing `INTERNALS`, plus `/\bthe learner\b/i`, `/\[attempt \d/i`, `/this stage\/\d/i`.

- [ ] **Step 1: Write the failing tests** (strings from the 2026-10-20/21 spike transcripts)

```ts
const names = ownNames({ tasksMd: "- [ ] P2.T2 add `split_amount(total, people)` = total / people", sources: ["def tip_rate(generous):\n    return 0.1\n"] });
describe("ownNames", () => {
  it("task signatures and the learner's definitions, with their parameters", () => {
    expect([...names].sort()).toEqual(["generous", "people", "split_amount", "tip_rate", "total"]);
  });
});
describe("checkTurn (spec 2026-10-21 §6)", () => {
  const src = ["def split_amount(total, people):", "    return total * people"];
  it("nemotron attempt 1, run 1: the fix in the summary is own code", () => {
    expect(checkTurn("Look at the operator.\n\n**In short**: Change `*` to `/` in `return total / people`.", { step: "hint", names, sourceLines: src })).toContain("own-code");
  });
  it("Review Focus #1: quoting the learner's own current line with a marker is allowed", () => {
    const glm = "Look at the operator in this slot:\n\n```\nreturn total * people\n             ^\n```\nWhich one did you type?";
    expect(checkTurn(glm, { step: "hint", names, sourceLines: src })).not.toContain("own-code");
  });
  it("an unrelated example passes; naming a function alone passes", () => {
    expect(checkTurn("Try it on `12 / 4`, then look at `split_amount`.", { step: "hint", names, sourceLines: src })).toEqual([]);
  });
  it("hint: too long; ask: needs a question", () => {
    expect(checkTurn("One. Two. Three.", { step: "hint", names, sourceLines: src })).toContain("too-long");
    expect(checkTurn("Tell me your thinking.", { step: "ask", names, sourceLines: src })).toContain("no-question");
  });
  it("the fix step may show their line", () => {
    expect(checkTurn("```python\nreturn total / people\n```\nOne slash keeps the decimals.", { step: "fix", names, sourceLines: src })).toEqual([]);
  });
  it("machinery: third person, attempt notes, the half-scrubbed rung", () => {
    expect(checkTurn("The learner asks how to divide.", { step: "why", names, sourceLines: src })).toContain("machinery");
    expect(checkTurn("You're at this stage/5 (pointer).", { step: "why", names, sourceLines: src })).toContain("machinery");
  });
});
describe("foldPreamble (C)", () => {
  it("planning before the first heading goes; a reply without headings stays", () => {
    expect(foldPreamble("The user wants a lesson. We need to ask.\n\n**What's happening**: x")).toBe("**What's happening**: x");
    expect(foldPreamble("What were you thinking?")).toBe("What were you thinking?");
  });
});
describe("scrubInternals rung forms (spike run 2)", () => {
  it("'hint rung 3/5 (pointer)' is reworded whole", () => {
    expect(scrubInternals("You're at hint rung 3/5 (pointer) of the Map step.")).toBe("You're at this stage of the Map step.");
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd pi-tutor && npx vitest run test/compliance.test.ts`
Expected: FAIL (`ownNames` not exported; the scrub yields "this stage/5 (pointer)").

- [ ] **Step 3: Implement the four exports and widen the rung patterns in `scrubLine`**

The rung patterns must also match `(hint )?rung \d(/\d)?( \(\w+\))?`.

- [ ] **Step 4: Run them to see them pass**

Run: `cd pi-tutor && npx vitest run test/compliance.test.ts`
Expected: PASS, including every earlier `scrubInternals` test.

- [ ] **Step 5: Commit**

```bash
git add pi-tutor/extensions/tutor/compliance.ts pi-tutor/test/compliance.test.ts
git commit -m "feat: check a reply against this turn — own code, length, the question, machinery; fold planning"
```

### Task 4: Attempts from real runs

**Files:**
- Modify: `pi-tutor/extensions/tutor/stuck.ts` (`spotOf`, `StuckDetector.hasErrorsIn`)
- Create: `pi-tutor/extensions/tutor/source-hash.ts`
- Modify: `pi-tutor/extensions/tutor/index.ts:277-296` (`openEp`), `:360-366` (`onStuck`), the episode restore at `:104`, and a new `/tutor-fix` command near `/tutor-level` (`:907`)
- Test: `pi-tutor/test/stuck.test.ts`, `pi-tutor/test/source-hash.test.ts` (new), `pi-tutor/test/smoke.test.ts` (new `describe("attempts from runs")`)

**Interfaces:**
- Consumes: `recordAttempt`, `stepFor`, `restoreAttempts` (Task 1)
- Produces:
  - `spotOf(trace: string): string`: the last line matching `/error|exception|panic|assert|failed/i` (else the last non-empty line), digits replaced by `#`, trimmed, at most 120 characters
  - `StuckDetector.hasErrorsIn(root: string): boolean`: true when a tracked error's path is inside `root` (realpath prefix `root + "/"`)
  - `sourceHash(root: string): string`: sha1 over the relative paths and contents of the files under `root`, skipping `.git node_modules target __pycache__ spec learn exam .pi .checks`, at most 200 files and 1 MB in total
  - `/tutor-fix`: pro only, sets `episode.fixAsked = true` on the open episode; at other bands it notifies `the fix comes after a few tries on the same spot`
- Behaviour in `openEp` for a failed run: `hasErrorsIn(project root)` → no attempt, no nudge, and the signal reads `run failed: fix the error marked in your file`. Otherwise `recordAttempt` on the run episode with `spotOf(trace)` and `sourceHash(root)`; a new spot closes the old episode (`superseded`) and opens a new one with attempts 1. The nudge is sent only when the count went up.

- [ ] **Step 1: Write the failing tests**

```ts
// stuck.test.ts
it("spotOf keys a run by its error line", () => {
  expect(spotOf('Traceback…\n  File "src/main.py", line 12, in split_amount\nZeroDivisionError: division by zero\n')).toBe("ZeroDivisionError: division by zero");
  expect(spotOf("AssertionError: expected 16.0, got 144 at line 3")).toBe("AssertionError: expected #.#, got # at line #");
});
it("hasErrorsIn only counts errors inside the project (Review Focus #4)", () => {
  const d = new StuckDetector(() => ({ errorMs: 1, idleMs: 1 }));
  d.observe({ kind: "diagnostics", buf: 1, path: "/elsewhere/x.py", errors: 1, warnings: 0, first: { line: 1, msg: "e" } }, 0);
  expect(d.hasErrorsIn("/proj")).toBe(false);
  d.observe({ kind: "diagnostics", buf: 2, path: "/proj/src/main.py", errors: 1, warnings: 0, first: { line: 1, msg: "e" } }, 0);
  expect(d.hasErrorsIn("/proj")).toBe(true);
});
// source-hash.test.ts
it("changes when a source file changes, not when spec/ does", () => {
  const d = realpathSync(mkdtempSync(join(tmpdir(), "hash-")));
  mkdirSync(join(d, "src")); mkdirSync(join(d, "spec"));
  writeFileSync(join(d, "src", "main.py"), "a = 1\n"); writeFileSync(join(d, "spec", "tasks.md"), "- [ ] P1.T1\n");
  const h1 = sourceHash(d);
  writeFileSync(join(d, "spec", "tasks.md"), "- [x] P1.T1\n");
  expect(sourceHash(d)).toBe(h1);
  writeFileSync(join(d, "src", "main.py"), "a = 2\n");
  expect(sourceHash(d)).not.toBe(h1);
});
// smoke.test.ts, describe("attempts from runs (spec 2026-10-21 §5)")
it("failed runs on one spot climb; an unchanged rerun and a typo run do not", async () => {
  // boot in a temp project; push run_output (code 1, the same trace) after editing src/main.py → attempts 1, 2;
  // push the same run without editing → still 2; push a diagnostics error in src/main.py, then a failed run → still 2, no nudge sent
});
it("a chat message never counts as an attempt, even after the code changed (only graded tries count)", async () => {
  // with a run episode at attempts 1: edit src/main.py, then run a chat turn "I changed it, still wrong"
  // → attempts stays 1, and that turn's step is still "hint"
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd pi-tutor && npx vitest run test/stuck.test.ts test/source-hash.test.ts test/smoke.test.ts -t "spotOf|hasErrorsIn|source|attempts from runs"`
Expected: FAIL.

- [ ] **Step 3: Implement**

Verify `pi.registerCommand` usage matches the existing commands; no new Pi API is needed in this task.

- [ ] **Step 4: Run them to see them pass**

Run: `cd pi-tutor && npx vitest run test/stuck.test.ts test/source-hash.test.ts test/smoke.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add pi-tutor/extensions/tutor pi-tutor/test
git commit -m "feat: failed runs count as attempts on their spot; typo runs and unchanged reruns do not"
```

### Task 5: Hold, check, re-ask, fall back (plus thinking and the judgment block)

**Files:**
- Modify: `pi-tutor/extensions/tutor/index.ts` (`before_agent_start` at `:480-533`, the markdown transformer at `:605`, `message_end` at `:611`, `turn_end` at `:634`, a new `message_start` handler, an `agent_end` hook for the re-ask)
- Modify: `pi-tutor/extensions/tutor/thinking.ts` (`thinkingHidden` gains `guarded`)
- Modify: `pi-tutor/PI_SURFACE.md` (`message_start`; the transformer's `isStreaming`; `message_end` awaited and replacing, Pi 1.3.0, `agent-session.js` "Emit to extensions first, then notify public listeners")
- Test: `pi-tutor/test/smoke.test.ts` (new `describe("held replies")`), `pi-tutor/test/thinking.test.ts`

**Interfaces:**
- Consumes: `stepFor`, `TURN_LIMITS`, `turnInstruction`, `fallbackReply`, `checkTurn`, `ownNames`, `foldPreamble`, `scrubInternals`
- Produces:
  - `const MAX_REASKS = 2`, `HOLD_TEXT = "_(tutor is checking this reply…)_"`, `REWRITE_TEXT = "_(tutor is rewriting this reply…)_"`
  - `thinkingHidden(mode: ThinkingMode, band: Band, guarded = false): boolean`, true also when `guarded`
  - Run state gains `step: TurnStep | null`, `reasks: number`, `rejected: boolean`
- Behaviour:
  - `before_agent_start` (ladder role, not onboarding) sets `run.step = stepFor(episode, { exam: !!exam })` and puts `turnInstruction` in the context (Task 2). A prompt starting with `[tutor] rewrite:` keeps the previous run's `reasks` and adds the failed issues through the existing `formatCheck` path.
  - The transformer shows `HOLD_TEXT` while `isStreaming` on a held run. After streaming it shows `foldPreamble(scrubInternals(md))` with the `tutor-judgment` fence removed (D: display only; the stored message keeps it for `turn_end`). Thinking uses `thinkingHidden(mode, band, run.step !== null && run.step !== "fix")`.
  - `message_end` (assistant, held run): `names = ownNames({ tasksMd: <spec/tasks.md in root, or null>, sources: <files the editor snapshot and src/ hold, inside the root> })`, then `checkTurn`. Pass: the message is replaced with the folded, scrubbed text. Fail: when `reasks < MAX_REASKS`, its text becomes `REWRITE_TEXT`, `run.rejected = true`, and after `agent_end` a `sendWhenIdle(ctx, "[tutor] rewrite: <issues>")` follows. Otherwise the text becomes `fallbackReply(step, episode?.spot)` and the attempt to rewrite ends.
  - `turn_end` applies no judgment when `run.rejected`.

- [ ] **Step 1: Write the failing tests**

```ts
describe("held replies (spec 2026-10-21 §6)", () => {
  it("a leaking hint is replaced, re-asked through a fresh run, and the second reply is checked too", async () => {
    // episode with attempts 1 on a temp project whose src/main.py defines split_amount(total, people)
    // reply 1: "Change it to `return total / people`." → stored text is REWRITE_TEXT, no judgment applied,
    //          and after agent_end a sendUserMessage starting "[tutor] rewrite:" is queued
    // reply 2 (the rewrite run) passes → it is shown, judgment applied
  });
  it("Review Focus #2/#5: after two failed re-asks the learner sees the fallback, with no code", async () => {
    // three leaking replies in a row → the third stored text equals fallbackReply("hint", spot); no backticks; no 4th re-ask
  });
  it("the transformer holds a streaming reply and hides the judgment block after it", () => {
    // transformer(md, { messageType: "assistant", isStreaming: true }) === HOLD_TEXT on a held run
    // after: the fence ```tutor-judgment … ``` is absent from the shown text
  });
  it("thinking is hidden while the fix is not allowed, whatever the setting", () => {
    // /tutor-thinking show; attempts 1 → assistant-thinking transformer returns THINKING_LABEL; attempts 4 (fix) → shown
  });
});
// thinking.test.ts
it("guarded turns hide thinking", () => { expect(thinkingHidden("show", "beginner", true)).toBe(true); });
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd pi-tutor && npx vitest run test/smoke.test.ts -t "held replies" test/thinking.test.ts`
Expected: FAIL.

- [ ] **Step 3: Verify the Pi surface, then implement**

```bash
grep -n 'on(event: "message_start"\|isStreaming\|interface MessageEndEventResult' pi-tutor/node_modules/@earendil-works/pi-coding-agent/dist/core/extensions/types.d.ts
```
Expected: `message_start` at about line 1216, `isStreaming: boolean` in `MarkdownTransformContext`, and `message?: AgentMessage` in `MessageEndEventResult`. Record all three in `PI_SURFACE.md` with `pi --version`.

- [ ] **Step 4: Run the whole gate**

Run: `cd pi-tutor && npm test && npm run typecheck && npm run lessons && cd ../nvim-tutor && nvim --headless -u tests/minimal_init.lua -c "PlenaryBustedDirectory tests/ {minimal_init='tests/minimal_init.lua'}"`
Expected: all pass, typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add pi-tutor/extensions/tutor pi-tutor/PI_SURFACE.md pi-tutor/test
git commit -m "feat: hold every teaching reply, check it against this turn, re-ask twice, then a safe fallback"
```

### Task 6: Live check with both weak models

**Files:**
- Modify: `docs/superpowers/specs/2026-10-21-teaching-turns-design.md` (add "Phase 1 live result" under §2)
- Modify: `README.md` (`/tutor-fix`; how help climbs)

- [ ] **Step 1: Run the real editor with a wrong `split_amount`**

In tmux (`-L lazycourse`), with Neovim + the tutor and a temp profile at level 10:
1. Write `return total * people`, then `:TutorRun` with a script that asserts `split_amount(48, 3) == 16.0`.
2. Change the line to `return total * people * 1.0`, run again.
3. Run again without changing anything.
4. Introduce a syntax error, run.
5. Fix the syntax, write `//`, run twice more with edits.

Do this for `nvidia/nvidia/nemotron-3.5-lightning-30b-a3b` and `nvidia/z-ai/glm-5.3-flash`.
Expected for both models:
- the widget reads try 1, try 2, try 2 (unchanged rerun), try 2 (typo run), try 3, try 4;
- no reply shows the learner's corrected line before try 4;
- the try-3 reply is a question;
- no `tutor-judgment` block and no "rung" text on screen;
- `~/.pi/agent/settings.json` is unchanged (md5).

- [ ] **Step 2: Record what each model did (shown, re-asked, fallback) in the spec's §2**

- [ ] **Step 3: Commit**

```bash
git add docs README.md
git commit -m "docs: phase 1 live result; /tutor-fix and how help climbs"
```
