# Teaching turns, phase 2 (graded tries from checks) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tasks are proven by checks that run, so "runs but gives the wrong answer" becomes a graded try, tasks
are ticked from evidence, and typo runs are read from the run's own syntax error.

**Architecture:** For each milestone (or the whole flat plan) a background job asks the model for strict-form
checks and, in a separate request that never sees them, for a reference solution; code runs the checks against
the reference in the exam sandbox and marks each one trusted or unverified. `/tutor-done` runs a task's checks
against the learner's code in the sandbox: all trusted checks pass → tick; a failing check → a graded try on
that check's spot (phase 1's ladder). The reference's lines also feed phase 1's leak check.

**Tech Stack:** TypeScript (Pi 1.3.0 extension), vitest, the exam sandbox (bubblewrap), Lua plugin (plenary).

**Spec:** `docs/superpowers/specs/2026-10-21-teaching-turns-design.md` (§5 "Which runs count" as changed
2026-10-21, §6 leak check, §7, §11a; phase 2 of §13).

## Global Constraints

- Everything in phase 1's Global Constraints still holds (no stdout/stderr in Pi; Pi APIs verified and listed in `pi-tutor/PI_SURFACE.md`; editor paths inside the project root; bash off; TDD; speed is not a goal).
- Only graded tries count: a failed run whose output is not a syntax error, or a failed trusted check (spec §5). Chat never counts.
- A failed run with a syntax error in its own output is a typo run: no attempt, no nudge. Editor marks no longer decide this (author, 2026-10-21).
- Checks are written per milestone, in the background, not in the plan request (spec §7).
- Strict form only (spec §7): a function value `<expr> == <value>` or typed input → output `stdin "…" → stdout contains "…"`.
- Cross-check: a reference solution written in a separate request that never sees the checks. Agree → trusted; disagree → unverified, shown, never blocks a tick (spec §7).
- No check ever blocks a beginner without a way out (spec §7): `/tutor-done <task> anyway` ticks it, labelled as ticked by you.
- Decimals compare with a tolerance, never exactly (spec §7).
- Checks belong to a milestone; a later milestone's check on the same function retires the earlier one (spec §7).
- Tasks with nothing to check are ticked when the learner confirms, labelled self-checked (spec §7).
- Model-written code (checks, reference) runs only in the exam sandbox; with no sandbox, nothing model-written runs, checks are all unverified and `/tutor-done` ticks as self-checked (spec §11a).
- The reference solution stays out of the learner's reach and out of the tutor's read tools: it lives in the profile, never under the project root (spec §12).
- Function-value checks run for Python and Lua; for JavaScript, TypeScript, Go and Rust only typed input → output checks run in phase 2 (see Review Focus #5).
- Ticking from the model's `task_done_ids` and from "a run passed" goes away; only `/tutor-done` ticks (spec §7: evidence, never the model).
- Lua projects the tutor creates get `.luarc.json` with `"runtime.version"` = the installed Lua's version, as lua_ls names it (`"Lua 5.1"` … `"Lua 5.5"`; verified in lua_ls `script/config/template.lua:187-194`, installed `lua -v` = 5.5.1).

## Review Focus

1. A check calls a function the learner has not written yet: the check fails with a plain message ("`split_amount` is not defined yet"), never crashes the job or `/tutor-done`. (Task 4 test.)
2. The learner's code loops forever under a check: the run is cut off by the sandbox time limit and reported as a failed check ("took too long"), never hangs `/tutor-done`. (Task 4 test.)
3. The learner's file asks for input when it is loaded (top-level `input()` / `io.read()`): value checks report "your file reads input when it is loaded; move that into main()" instead of a confusing EOF error. (Task 4 test.)
4. The learner edits or deletes `spec/checks.md`: the checks in the profile are the truth; the file is rewritten on the next check run and nothing is lost. (Task 6 test.)
5. A JavaScript/TypeScript/Go/Rust project: the check job asks only for typed input → output checks, and a value-form line the model writes anyway is rejected by the parser for that language. (Task 3 test.)

---

### Task 1: Typo runs come from the run's own syntax error

**Files:**
- Modify: `pi-tutor/extensions/tutor/stuck.ts` (add `isSyntaxError`; remove `StuckDetector.hasErrorsIn`)
- Modify: `pi-tutor/extensions/tutor/index.ts` (`failedRun`)
- Test: `pi-tutor/test/stuck.test.ts`, `pi-tutor/test/episode.test.ts` ("attempts from runs")

**Interfaces:**
- Produces: `isSyntaxError(trace: string): boolean`: true for Python `SyntaxError`/`IndentationError`/`TabError`, Lua `'…' expected near`/`unexpected symbol near`/`unfinished string near`, JS/TS `SyntaxError:`, Go `syntax error:`, Rust `error: expected` / `error: unexpected` / `error: mismatched closing delimiter`. Not true for runtime errors (`NameError`, `TypeError: x is not a function`, Lua `attempt to call a nil value`, a Rust `error[E0308]` type error).
- Behaviour: in `failedRun`, `isSyntaxError(trigger.trace)` replaces `detector.hasErrorsIn(root)`; the signal reads `run failed: a syntax error (fix the line it names)`.

- [ ] **Step 1: Write the failing tests**

```ts
it("isSyntaxError: syntax errors in the run's own output, never runtime or type errors", () => {
  expect(isSyntaxError('  File "src/main.py", line 3\n    def f(\n         ^\nSyntaxError: \'(\' was never closed')).toBe(true);
  expect(isSyntaxError("IndentationError: expected an indented block after function definition on line 1")).toBe(true);
  expect(isSyntaxError("lua: error loading module 'main' from file 'src/main.lua':\n\tsrc/main.lua:4: ')' expected near 'end'")).toBe(true);
  expect(isSyntaxError("SyntaxError: Unexpected token '}'")).toBe(true);
  expect(isSyntaxError("./main.go:5:2: syntax error: unexpected newline, expected comma or }")).toBe(true);
  expect(isSyntaxError("error: expected one of `,`, `:`, or `}`, found `{`")).toBe(true);
  for (const t of ["NameError: name 'totl' is not defined", "TypeError: total is not a function", "lua: src/main.lua:4: attempt to call a nil value (global 'splt')", "error[E0308]: mismatched types", "split_amount(48, 3) gave 144, expected 16.0"])
    expect(isSyntaxError(t), t).toBe(false);
});
// episode.test.ts: replaces the "typo run" case — no editor marks, a SyntaxError trace → no attempt, no nudge;
// and an error marked in the editor with a NameError trace → an attempt (editor marks no longer decide).
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd pi-tutor && npx vitest run test/stuck.test.ts test/episode.test.ts -t "isSyntaxError|attempts from runs"`
Expected: FAIL (`isSyntaxError` not exported).

- [ ] **Step 3: Implement; remove `hasErrorsIn` and its test** (the rule it served was replaced by the author).

- [ ] **Step 4: Run them to see them pass**

Run: `cd pi-tutor && npx vitest run test/stuck.test.ts test/episode.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit** — `feat: a typo run is a syntax error in the run's own output, not an editor mark`

### Task 2: Lua projects get `.luarc.json`

**Files:**
- Create: `pi-tutor/extensions/tutor/luarc.ts`
- Modify: `pi-tutor/extensions/tutor/start.ts` (`createProject`), `pi-tutor/extensions/tutor/scaffold.ts` (`writeScaffold`, into an existing Lua folder only when absent)
- Test: `pi-tutor/test/luarc.test.ts` (new), `pi-tutor/test/start.test.ts`, `pi-tutor/test/scaffold.test.ts`

**Interfaces:**
- Produces: `luaRuntime(versionOutput: string): string | null` (`"Lua 5.5.1  Copyright…"` → `"Lua 5.5"`; `"Lua 5.4.6"` → `"Lua 5.4"`; `"LuaJIT 2.1…"` → `"LuaJIT"`; above 5.5 → `"Lua 5.5"`; unreadable → `null`) and `luarcJson(runtime: string): string` (`{"$schema": "https://raw.githubusercontent.com/LuaLS/vscode-lua/master/setting/schema.json", "runtime.version": "<runtime>"}` plus a newline).
- Behaviour: creating a Lua project runs `lua -v` (through `pi.exec`, inside the existing toolchain probe) and writes `.luarc.json` when `luaRuntime` returns a value; an existing `.luarc.json` is never overwritten.

- [ ] **Step 1: Write the failing tests** — `luaRuntime` for the five inputs above; `createProject` for `lua` writes `.luarc.json` with `"Lua 5.5"` when given that version and nothing for `python`; `writeScaffold(..., { existing: true })` keeps a learner's own `.luarc.json`.
- [ ] **Step 2: Run them to see them fail** — `cd pi-tutor && npx vitest run test/luarc.test.ts test/start.test.ts test/scaffold.test.ts` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them to see them pass** — same command → PASS.
- [ ] **Step 5: Commit** — `feat: Lua projects get a .luarc.json naming the Lua they run`

### Task 3: Checks — the strict form, parsed and shown

**Files:**
- Create: `pi-tutor/extensions/tutor/checks.ts`
- Test: `pi-tutor/test/checks.test.ts` (new)

**Interfaces:**
- Produces:
  - `type Check = { task: string; kind: "value" | "io"; expr?: string; expected?: string; stdin?: string; contains?: string; milestone: number; status: "trusted" | "unverified" }`
  - `VALUE_LANGUAGES = new Set(["python", "lua"])`
  - `parseChecks(text: string, o: { language: string; taskIds: string[]; milestone: number }): { checks: Check[]; rejected: string[] }`: lines `check <id>: <expr> == <expected>` and `run <id>: stdin "<text>" -> stdout contains "<text>"` (also `→`); an unknown task id, a value line for a language outside `VALUE_LANGUAGES`, or any other line is rejected (listed, not fatal); `\n` in stdin is a newline; new checks start `unverified`.
  - `liveChecks(all: Check[], milestone: number): Check[]`: checks of milestones ≤ `milestone`, minus an earlier milestone's value check whose called function (`name(` at the start of `expr`) a later milestone ≤ `milestone` also checks.
  - `renderChecksMd(checks: Check[], ticked: Set<string>): string`: `# Checks` then per task `- P2.T2 · tip_amount(40, 0.2) == 8.0` with ` (unverified)` where unverified, and a first line saying the file is rewritten by the tutor.

- [ ] **Step 1: Write the failing tests** — with the spike's real lines:

```ts
const ids = ["P2.T1", "P2.T2", "P2.T3", "P3.T2"];
it("parses value and io lines; rejects unknown ids and stray text", () => {
  const r = parseChecks('check P2.T2: tip_amount(40, 0.2) == 8.0\nrun P2.T3: stdin "48\\nn\\n" -> stdout contains "17.6"\ncheck P9.T1: x() == 1\nLet me write the checks:', { language: "python", taskIds: ids, milestone: 2 });
  expect(r.checks).toEqual([
    { task: "P2.T2", kind: "value", expr: "tip_amount(40, 0.2)", expected: "8.0", milestone: 2, status: "unverified" },
    { task: "P2.T3", kind: "io", stdin: "48\nn\n", contains: "17.6", milestone: 2, status: "unverified" },
  ]);
  expect(r.rejected).toHaveLength(2);
});
it("Review Focus #5: value lines are rejected outside Python and Lua", () => {
  expect(parseChecks("check P2.T2: tipAmount(40, 0.2) == 8.0", { language: "typescript", taskIds: ids, milestone: 2 }).checks).toEqual([]);
});
it("a later milestone's check on the same function retires the earlier one (spec §7: tip_rate 0.15 → 0.2/0.1)", () => {
  const c = (task: string, expr: string, expected: string, milestone: number): Check => ({ task, kind: "value", expr, expected, milestone, status: "trusted" });
  const all = [c("P1.T2", "tip_rate(True)", "0.15", 1), c("P2.T1", "tip_rate(True)", "0.2", 2), c("P1.T3", "include_tip(True, False)", "True", 1)];
  expect(liveChecks(all, 2).map((x) => x.task)).toEqual(["P2.T1", "P1.T3"]);
  expect(liveChecks(all, 1).map((x) => x.task)).toEqual(["P1.T2", "P1.T3"]);
});
```

- [ ] **Step 2: Run them to see them fail** — `cd pi-tutor && npx vitest run test/checks.test.ts` → FAIL (module missing).
- [ ] **Step 3: Implement `checks.ts`.**
- [ ] **Step 4: Run them to see them pass** — same → PASS.
- [ ] **Step 5: Commit** — `feat: checks in strict form — parsed, per milestone, retired by a later milestone, shown in spec/checks.md`

### Task 4: Running checks in the sandbox

**Files:**
- Create: `pi-tutor/extensions/tutor/check-run.ts`
- Test: `pi-tutor/test/check-run.test.ts` (new; real `python3` and `lua`, skipped when missing, like `test/lessons.test.ts`)

**Interfaces:**
- Consumes: `Check` (Task 3); `sandboxArgv`, `toolBinds`, `SANDBOX_MISSING`, `SandboxHost` (`exam/sandbox.ts`); `RunExec` (`exam/layout.ts`); `projectSources`'s walk rules (`source-hash.ts`).
- Produces:
  - `type CheckResult = { check: Check; pass: boolean; got?: string; error?: string }`
  - `runChecks(exec: RunExec, i: { language: string; root: string; entry: string; runCmd: string | null; checks: Check[]; sandbox: SandboxHost | null; limitSec?: number }): Promise<{ results: CheckResult[]; missing?: string }>`
- Behaviour:
  - Copies the learner's source files (the `projectSources` walk, same skips) into a fresh temp dir and runs everything there, inside `sandboxArgv(tempDir, …)`; with `sandbox: null` it returns `{ results: [], missing: SANDBOX_MISSING }` and runs nothing (spec §11a).
  - Python value checks: one harness, `runpy.run_path(entry, run_name="__tutor_check__")` with stdin closed, then each `expr` evaluated in that namespace and compared with `expected` (numbers with `math.isclose(rel_tol=1e-9, abs_tol=1e-9)`), one JSON line per check.
  - Lua value checks: `loadfile(entry)` in an env whose `__index` is `_G`, the chunk's returned table also searched for names, the same comparison, one JSON line per check.
  - io checks: the project's `run:` command (from README front matter) with `stdin` fed, pass when stdout contains `contains`.
  - Plain messages (Review Focus #1–#3): a missing name → `"<name> is not defined yet"`; time limit (default 20 s) → `"took too long (an endless loop?)"`; reading input while loading → `"your file reads input when it is loaded; move that into main()"`.

- [ ] **Step 1: Write the failing tests** — a temp Python project with `split_amount` returning `total * people`: `split_amount(48, 3) == 16.0` fails with `got: "144"`; after fixing to `/`, `split_amount(52.8, 3) == 17.6` passes (tolerance); a check on `tip_rate` (not written) fails with "tip_rate is not defined yet"; a `while True: pass` body fails with "took too long" (limitSec 2); a top-level `input()` gives the input message; the same three for Lua; an io check on `run: python3 src/main.py` that prints `17.60` passes; `sandbox: null` runs nothing and returns `missing`. Run the sandboxed cases with a real `SandboxHost` when `bwrap` works (as `test/exam-sandbox.test.ts` does), else skip them.
- [ ] **Step 2: Run them to see them fail** — `cd pi-tutor && npx vitest run test/check-run.test.ts` → FAIL.
- [ ] **Step 3: Implement `check-run.ts`.**
- [ ] **Step 4: Run them to see them pass** — same → PASS.
- [ ] **Step 5: Commit** — `feat: run checks against a copy of the learner's code in the sandbox, with plain failure messages`

### Task 5: The check job — checks and a separate reference, cross-checked

**Files:**
- Create: `pi-tutor/prompts/system/checks.md`, `pi-tutor/prompts/system/reference.md`
- Create: `pi-tutor/extensions/tutor/check-job.ts`
- Modify: `pi-tutor/extensions/tutor/index.ts` (start the job after the plan is written; when a lesson round turns to building; at session start for a project with `spec/tasks.md` and no checks state)
- Test: `pi-tutor/test/check-job.test.ts` (new), `pi-tutor/test/smoke.test.ts` (new `describe("checks job")`)

**Interfaces:**
- Consumes: `parseChecks` (Task 3), `runChecks` (Task 4), `completeJson`/`rawComplete` with `PROVIDER_RETRY` (existing), `taskIds` (`scaffold.ts`).
- Produces:
  - `checksPrompt(i: { language: string; tasksMd: string; milestone: number | null }): string` — the milestone's (or all) task lines with their "done when", the two line forms, and for a language outside `VALUE_LANGUAGES` "write only run lines".
  - `referencePrompt(i: { language: string; tasksMd: string; milestone: number | null; entry: string }): string` — the same task lines with every "done when:" removed (the reference never sees the expected values), asking for the whole entry file at the end of that milestone.
  - `crossCheck(results: CheckResult[]): Check[]` — pass → `trusted`, fail → `unverified`.
  - Profile setting `checks:<project path>` = `{ milestones: { [k: number]: { checks: Check[]; reference: string } } }` (the reference lives only here).
- Behaviour:
  - Background, like the plan job (frozen model, generation counter, not blocking the learner).
  - Milestone k = the lesson round being built; a flat plan is milestone 1.
  - Writes `spec/checks.md` (`renderChecksMd`) inside the root.
  - With no sandbox: the checks are stored unverified, the reference is not run, and `spec/checks.md` says checks could not be run here.

- [ ] **Step 1: Write the failing tests**
  - `referencePrompt` never contains "done when" or any expected value from the tasks.
  - `crossCheck` marks the spike's case: nemotron's `split_amount(52.8, [...]) == 17.6` against a correct reference stays trusted thanks to the tolerance; a check whose expected value the reference contradicts (`$13.20` vs a reference printing `$17.60`) becomes unverified.
  - smoke: after a plan is written in a fake project (fake model replies: plan, then checks text, then reference code), the profile holds milestone 1's checks with statuses, `spec/checks.md` lists them, and no file under the root contains the reference.
- [ ] **Step 2: Run them to see them fail** — `cd pi-tutor && npx vitest run test/check-job.test.ts test/smoke.test.ts -t "checks job|check-job"` → FAIL.
- [ ] **Step 3: Implement**; verify any new Pi call in `types.d.ts` and list it in `PI_SURFACE.md` (none is expected: the job reuses `modelRegistry.complete` and `pi.exec`).
- [ ] **Step 4: Run them to see them pass** — same → PASS.
- [ ] **Step 5: Commit** — `feat: a background job writes each milestone's checks and a separate reference, then cross-checks them`

### Task 6: `/tutor-done` — tick from evidence, failed checks are graded tries

**Files:**
- Modify: `pi-tutor/extensions/tutor/index.ts` (new command; `onStuck`'s `run_passed` no longer ticks; `applyTurnJudgment` no longer queues `task_done_ids`)
- Modify: `nvim-tutor/lua/tutor/init.lua` (`:TutorDone` wrapper with task-id completion from `spec/tasks.md`), `~/.config/nvim/lua/plugins/tutor.lua` (add `"TutorDone"` to `cmd`)
- Test: `pi-tutor/test/episode.test.ts` (new `describe("tutor-done")`, real Neovim), `pi-tutor/test/smoke.test.ts`, `nvim-tutor/tests/init_spec.lua`

**Interfaces:**
- Consumes: `liveChecks`, `renderChecksMd`, `runChecks`, `recordAttempt` and the per-spot memory (phase 1), `tickTasks` (`tasks.ts`).
- Produces:
  - `/tutor-done [task id] [anyway]`. Without an id: the first open task in `spec/tasks.md`.
  - A failed check is a graded try on the spot `check:<task>:<expr or stdin>`, through the same `recordAttempt`/nudge path as a failed run. The nudge carries the failure (`tip_amount(40, 0.2)` gave `8.4`, expected `8.0`).
- Behaviour:
  - Every trusted check of the task passes → tick the task, its subtasks and `spec/checks.md`; the episode closes `run_passed`; the spot memory clears.
  - Only unverified checks fail → tick, noting which checks could not be trusted.
  - No checks → tick labelled self-checked.
  - `anyway` → tick labelled "ticked by you".
  - A failing check counts as a try only when the source hash changed since the last try on that spot (phase 1 rule).
  - No sandbox → tick as self-checked with the sandbox note.
  - `spec/checks.md` is rewritten from the profile each time (Review Focus #4).

- [ ] **Step 1: Write the failing tests**
  - episode.test (real Neovim + `python3`): a project with a trusted check `split_amount(48, 3) == 16.0`.
    - `split_amount` multiplying: `/tutor-done P2.T2` → not ticked, the episode is at try 1 on the check's spot, and the nudge names 144 and 16.0.
    - Unchanged → `/tutor-done` again: still try 1.
    - Fixed → ticked, `[x] P2.T2` and its subtasks.
  - `anyway` ticks a failing task with the note.
  - smoke: a model reply carrying `task_done_ids` ticks nothing.
  - smoke: a passing run ticks nothing.
  - smoke: a deleted `spec/checks.md` is rewritten on the next `/tutor-done`.
  - Lua spec: `:TutorDone` types `/tutor-done` into the pane and completes task ids.
- [ ] **Step 2: Run them to see them fail** — `cd pi-tutor && npx vitest run test/episode.test.ts test/smoke.test.ts -t "tutor-done|ticks nothing|checks.md"` and the Lua suite → FAIL.
- [ ] **Step 3: Implement.** Remove the `task_done_ids` queueing (the judgment still parses the field; it is ignored).
- [ ] **Step 4: Run them to see them pass** — the full gate: `cd pi-tutor && npm test && npm run typecheck && npm run lessons`, and the Lua suite → PASS.
- [ ] **Step 5: Commit** — `feat: /tutor-done ticks from checks; a failed check is a graded try; the model never ticks`

### Task 7: The reference also feeds the leak check

**Files:**
- Modify: `pi-tutor/extensions/tutor/compliance.ts` (`checkTurn` takes `referenceLines`)
- Modify: `pi-tutor/extensions/tutor/index.ts` (`before_agent_start` loads the current milestone's reference into the run)
- Test: `pi-tutor/test/compliance.test.ts`

**Interfaces:**
- Produces: `checkTurn(text, o: { step; names; sourceLines; referenceLines?: string[] })`.
- Behaviour: a code line or inline span that equals a reference line is `own-code` before the fix step.
  - Only reference lines of 8+ characters count.
  - A line the learner already has in `sourceLines` is not a leak.

- [ ] **Step 1: Write the failing test** — reference `["def split_amount(total, people):", "    return total / people"]`; a hint reply with `` `return total / people` `` → `own-code`, even with no task names known (`names` empty); the same line already in `sourceLines` → no issue; `` `x` `` (short) → no issue.
- [ ] **Step 2: Run it to see it fail** — `cd pi-tutor && npx vitest run test/compliance.test.ts -t reference` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run it to see it pass** — `cd pi-tutor && npm test && npm run typecheck` → PASS.
- [ ] **Step 5: Commit** — `feat: a reply that shows the hidden reference's line before the fix is own code`

### Task 8: Live check

**Files:**
- Modify: `docs/superpowers/specs/2026-10-21-teaching-turns-design.md` (§2 "Phase 2 live result"), `README.md` (`/tutor-done`, checks, typo runs)

- [ ] **Step 1: Python, real LazyVim (no Python language server), nemotron then glm**
  1. A fresh beginner project through `/tutor-start` with learn-first, then `/tutor-lesson` to the first build milestone.
  2. Wait for `spec/checks.md`.
  3. Write wrong code and run `:TutorDone`, then fix it.

  Expected:
  - checks appear, each trusted or marked unverified;
  - a wrong answer that runs is a try on the check's spot, and the widget shows `try N`;
  - a missing `:` run is a typo run (no try);
  - the fixed task ticks;
  - nothing under the project holds the reference;
  - `~/.pi/agent/settings.json` is unchanged.
- [ ] **Step 2: Lua** — a new Lua project has `.luarc.json`. With it, lua_ls no longer marks `//` (verify LazyVim's lua_ls honours a project `.luarc.json` over its LuaJIT default; if it does not, say so and record it).
- [ ] **Step 3: Record both in the spec's §2 and update the README; commit** — `docs: phase 2 live result; /tutor-done and checks`
