# Habits and Levels Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The tutor builds experience and a coding mindset: it observes the learner's habits from code evidence, moves the level inside a band as habits turn solid, offers a step-up (talking test + coding test) at the band edge, and teaches each band's habits (recipe, reading errors, testing, optimizing).

**Architecture:** Seven phases, each its own branch (`habits-p<N>`) merged to main and live-checked before the next. New pure modules hold the rules (`recipe-steps.ts`, `habits.ts`, `levels.ts`, `step-up.ts`, `own-tests.ts`, `pro-score.ts`, `improve.ts`); `index.ts` wires events; `profile.ts` gains migration v6; nvim-tutor gains the right-click entry.

**Tech Stack:** TypeScript (vitest), Lua (plenary), node:sqlite, bubblewrap sandbox, Python `ast` (code metrics), cargo/go toolchains already used.

**Spec:** `docs/superpowers/specs/2026-10-26-habits-and-levels-design.md` (approved 2026-10-26). Background: `docs/superpowers/specs/2026-10-21-teaching-turns-design.md`, `docs/superpowers/specs/2026-10-22-rust-go-checks-design.md`.

## Global Constraints

- The model never moves the level, passes a test or awards a point; code decides, the model writes notes.
- The level never moves without the learner's yes across a band edge; inside a band it moves by itself and every change is shown with its reason.
- Every learner-facing behaviour has off/skip and band-aware defaults.
- Bands: 0–33 beginner, 34–66 intermediate, 67–100 pro (`policy.ts` `bandFor`).
- No stdout/stderr inside Pi; any new Pi API is verified in `pi-tutor/node_modules/@earendil-works/pi-coding-agent/dist/core/extensions/types.d.ts` and added to `pi-tutor/PI_SURFACE.md`; editor paths inside the project root; writes through `writeInRoot`; the bash tool stays off.
- TDD with real toolchains; the full TS suite, `npm run typecheck` and the Lua suite stay green after every task.
- Each phase ends with a live check in real LazyVim with nemotron (`nvidia/nvidia/nemotron-3.5-lightning-30b-a3b`); `~/.pi/agent/settings.json` md5 `8dd33dde3b7fa10561c97ccfd40c1670` unchanged; then merge to main and push.
- Habit states: showing after 2 qualifying events; solid after 5 qualifying events across ≥ 2 projects with the last 3 qualifying; a solid habit whose last 3 of 5 events miss drops to showing (withdraws a step-up offer, never lowers the level).
- Step-up pass bar: each coding part passes ≥ 3 of 4 checks; talking marks pass when the `pieces:` line matches the reference's pieces (aliases count) and part 3 passes ≥ 3 of 4.

## Review Focus

1. A beginner who types `/tutor-plan off` then `/tutor-done` on the next task gets the recipe again, and skipping never counts as a try or changes the level. (Task 1 test.)
2. A habit event from a language the learner has never used before does not move that language's level until one qualifying event exists there (carry rule). (Task 8 test.)
3. A learner placed at 50 by onboarding with no habits is never pulled below 34 by the in-band arithmetic. (Task 8 test.)
4. A talking-test answer with no `pieces:` line is asked once for it, never graded from free chat. (Task 11 test.)
5. An own test that passes on the learner's code but also on a broken stub does not tick the task, and says so. (Task 14 test.)

---

## Phase 1 — the beginner path (branch `habits-p1`)

### Task 1: The recipe starts by itself for beginners; skip and off

**Files:** Modify `pi-tutor/extensions/tutor/workflow.ts` (beginner `MODE`), `pi-tutor/extensions/tutor/index.ts` (`/tutor-plan` handler, `tickDone`, session start); Test `pi-tutor/test/workflow.test.ts`, `pi-tutor/test/smoke.test.ts`.

**Interfaces:** Produces `recipeAutoStart(i: { band: Band; workflow: Workflow | null; task: string | null; offFor: Set<string> }): string | null` in `workflow.ts` (the task to start, or null); `/tutor-plan skip` = today's `next`; `/tutor-plan off` adds the task to `offFor` (kept in the session as a `tutor_workflow_off` entry).

- [ ] **Step 1: Failing tests.** `workflow.test.ts`: `recipeAutoStart({ band: "beginner", workflow: null, task: "P1.T1", offFor: new Set() })` → `"P1.T1"`; `"intermediate"` → `null`; a running workflow → `null`; `offFor` containing the task → `null`. The beginner MODE text no longer contains "half-fill" and contains "unrelated example". `smoke.test.ts` "a beginner's ticked task starts the recipe on the next open task; off stops it for that task only (Review Focus #1)": level 10, `/tutor-done P1.T1 anyway` → widget shows the recipe on P1.T2; `/tutor-plan off` → none; `/tutor-done P1.T2 anyway` → recipe on P1.T3; no `tutor_episode` entries; level unchanged.
- [ ] **Step 2: Run** `cd pi-tutor && npx vitest run test/workflow.test.ts test/smoke.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement.** Call `recipeAutoStart` after `tickDone` and at `session_start` (first open task of a project in building); `skip` as an alias of `next`.
- [ ] **Step 4: Run** the tests, `npm test`, `npm run typecheck` — Expected: PASS.
- [ ] **Step 5: Commit** `feat: the design recipe starts by itself for beginners; skip and off`

### Task 2: Code recognises each recipe step's artifact; Examples rows become checks

**Files:** Create `pi-tutor/extensions/tutor/recipe-steps.ts`; Modify `index.ts` (advance on the learner's message), `check-job.ts` (export the reference run); Test `pi-tutor/test/recipe-steps.test.ts`, `pi-tutor/test/check-job.test.ts`.

**Interfaces:** Produces `recognize(step: number, learnerText: string, language: string): boolean` (Shape = a line with an arrow and a type on each side, e.g. `total: float, people: int → float`; Examples = ≥ 2 lines `<call or input> → <output>`, one containing "edge"; Steps = ≥ 2 numbered lines with no code fence and no `(`…`)` call; Map = ≥ 2 lines `<step text> → <construct>`; Find = the task id mentioned; Build = never by text, only by the task's checks); `examplesToChecks(text: string, task: string, language: string, milestone: number): Check[]` (rows of the form `f(args) → value` become value checks; others ignored); `crossCheckOnReference(d: { exec; sandbox; language; entry; runCmd; reference: string; checks: Check[]; root?: string }): Promise<Check[]>` exported from `check-job.ts` (the temp-folder run `writeMilestoneChecks` already does).

- [ ] **Step 1: Failing tests.** `recipe-steps.test.ts`: positive and negative cases for every step in Python, Rust and Go text (`fn split_amount(total: f64, people: u32) -> f64` counts as Shape; prose without an arrow does not); `examplesToChecks("split_amount(50, 3) → 16.666666666666668\nedge: split_amount(0, 3) → 0.0", "P1.T1", "python", 1)` → two value checks. `check-job.test.ts`: `crossCheckOnReference` marks a matching row trusted and a wrong row unverified (real sandbox, Python).
- [ ] **Step 2: Run** `npx vitest run test/recipe-steps.test.ts test/check-job.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement.** In `before_agent_start` for a learner message, `recognize(workflow.step, prompt, language)` advances the step (the model's `step_done` still advances Find); Examples rows are cross-checked and appended to the milestone's checks (state + `spec/checks.md`).
- [ ] **Step 4: Run** tests, `npm test`, typecheck — PASS.
- [ ] **Step 5: Commit** `feat: code recognises each recipe step's artifact; Examples rows become checks`

### Task 3: Right-click "Ask tutor about this error"; no more error-sitting nudges

**Files:** Modify `nvim-tutor/lua/tutor/init.lua`, `pi-tutor/extensions/tutor/stuck.ts`, `index.ts`; Test `nvim-tutor/tests/init_spec.lua`, `pi-tutor/test/stuck.test.ts`, `pi-tutor/test/smoke.test.ts`.

**Interfaces:** Produces Lua `M.ask_error()` (sends `[ask-error] <relpath>:<line>: <message>\n<code line>` through `slash`-style typing into Pi as a learner question; nothing if the line has no diagnostic); a `MenuPopup` autocmd that adds/enables the PopUp entry "Ask tutor about this error" only when the cursor line has a diagnostic; `<leader>te` mapping; `StuckDetector` constructor option `{ errorNudges: boolean }` (default true; index passes false). Index records a `tutor_ask_error` entry `{ path, line, msg, shownMs }` (shownMs = how long the diagnostic had been on screen, from the existing error watch).

- [ ] **Step 1: Failing tests.** `init_spec.lua`: with a buffer and `vim.diagnostic.set` on line 2, `ask_error()` types the `[ask-error] …:2: …` text into the pane; with none, types nothing; after `doautocmd MenuPopup` the PopUp menu has the entry enabled only on a diagnostic line. `stuck.test.ts`: with `errorNudges: false` an error that sits past `errorMs` opens no episode; idle still does. `smoke.test.ts`: an `[ask-error]` prompt is answered as a question and records `tutor_ask_error`.
- [ ] **Step 2: Run** Lua suite and `npx vitest run test/stuck.test.ts test/smoke.test.ts` — FAIL.
- [ ] **Step 3: Implement.** Verify `MenuPopup`/`amenu PopUp` in Neovim 0.12 headless and add them to `PI_SURFACE.md` (Neovim section).
- [ ] **Step 4: Run** both suites, typecheck — PASS.
- [ ] **Step 5: Commit** `feat: right-click "Ask tutor about this error"; the tutor stops nudging about errors on its own`

### Task 4: Beginner fixes

**Files:** Modify `check-run.ts` (Python harness), `check-run-compiled.ts` (Go `%T`), `near-miss.ts`, `check-job.ts`, `compliance.ts`, `index.ts` (`failedCheck`); Test `check-run.test.ts`, `check-run-compiled.test.ts`, `near-miss.test.ts`, `compliance.test.ts`, `episode.test.ts`.

**Interfaces:** `CheckResult.valueType?: "int" | "float" | "other"` (Python `type(got)`, Lua `math.type`, Rust Debug has `.`/`e` → float, Go `%T`); `roundingWeakTasks(checks: Check[], types?: Map<Check, CheckResult["valueType"]>)` skips tasks whose reference values are all `"int"`; `proseFixLeak(raw: string, o: { referenceLines: string[]; sourceLines: string[] }): boolean` in `compliance.ts` (an instruction phrase — "use", "change … to", "replace … with", "instead of", "should be" — naming a token found in a reference line and in no source line); `checkTurn` adds issue `"prose-fix"` before the fix step; `shortNumber(s: string): string` (floats to 4 places after the point, trailing zeros kept to one, e.g. `16.6667`, `16.0`).

- [ ] **Step 1: Failing tests.** `check-run.test.ts`: a Python file with `from __future__ import annotations` and a `@dataclass` passes a value check. `near-miss.test.ts`: `count_words` checks expecting `3`, `5` with reference types `int` → not weak; the same with `float` → weak. `compliance.test.ts`: before the fix step, "use `/` instead of `*`" with reference `return total / people` and source `return total * people` → `prose-fix`; "think about what splitting means" → none; at the fix step → none. `episode.test.ts`: the notice reads `gave 16.0, expected 16.6667`.
- [ ] **Step 2: Run** those files — FAIL.
- [ ] **Step 3: Implement** (Python harness: `types.ModuleType("__tutor_check__")` registered in `sys.modules`, exec into its `__dict__`).
- [ ] **Step 4: Run** suites, typecheck — PASS.
- [ ] **Step 5: Commit** `fix: beginner fixes — integer tasks skip the rounding probe, prose fix leaks, short decimals, @dataclass loads`

### Task 5: Phase 1 live check, docs, merge

- [ ] **Step 1: Live** (driver pattern of `drive3.sh`, Python, level 10, nemotron): the recipe starts on P1.T1; the learner's Shape/Examples/Steps messages advance it; Examples rows appear in `spec/checks.md`; `/tutor-plan off` then the next task starts it again; right-click on a diagnostic line sends the question; no error-sitting nudge; a reply naming the fix in words is rewritten. Expected as listed; settings md5 unchanged.
- [ ] **Step 2: Record** results in the spec (§14 "Live results", phase 1) and README; commit `docs: habits phase 1 live result`; merge `habits-p1` to main and push.

## Phase 2 — the habit profile (branch `habits-p2`)

### Task 6a: Idle nudges pause while a recipe runs (author approved 2026-10-27, from the phase 1 live check)

**Files:** Modify `pi-tutor/extensions/tutor/index.ts`; Test `pi-tutor/test/episode.test.ts`.

**Interfaces:** the idle stuck trigger opens no episode while `workflow` is set (a recipe in progress); runs, checks and churn are unchanged.

- [ ] **Steps 1–5:** test "an idle stretch during a recipe opens no episode; without a recipe it does" (real Neovim, level 10), FAIL, implement, PASS, commit `feat: idle nudges pause while a design recipe runs`.

### Task 6: Habit rules and storage

**Files:** Create `pi-tutor/extensions/tutor/habits.ts`; Modify `profile.ts` (migration v6); Test `pi-tutor/test/habits.test.ts`, `pi-tutor/test/profile.test.ts`.

**Interfaces:** `type HabitId = "steps-first" | "reads-errors" | "looks-up" | "small-runs" | "own-fixes" | "ideas-to-code" | "right-direction" | "right-question" | "tests-that-fail" | "complex" | "optimizes"`; `BAND_HABITS: Record<Band, HabitId[]>` (beginner = the first eight; intermediate = `tests-that-fail`, `complex`; pro = `optimizes`); `interface HabitEvent { habit: HabitId; ok: boolean; language: string; project: string; at: number; evidence: string }`; `habitState(events: HabitEvent[]): "not yet" | "showing" | "solid"` (Global Constraints rule); `solidIn(events, language): boolean` (solid overall and ≥ 1 ok event in that language). `Profile.addHabitEvent(e: HabitEvent): void`, `Profile.habitEvents(habit?: HabitId): HabitEvent[]`; migration v6 `CREATE TABLE habit_events (habit TEXT, ok INTEGER, language TEXT, project TEXT, at INTEGER, evidence TEXT)`.

- [ ] **Step 1: Failing tests.** `habitState`: 1 ok → not yet; 2 ok → showing; 5 ok in one project → showing; 5 ok across 2 projects, last 3 ok → solid; then 3 misses in the last 5 → showing. `solidIn` false for a language with no event. Profile: a v5 file opens and migrates to v6 keeping levels; events round-trip.
- [ ] **Step 2–5:** run (FAIL), implement, run (PASS + suite + typecheck), commit `feat: habit rules and the habit event log (profile v6)`.

### Task 7: Habit events from what code already sees

**Files:** Modify `index.ts`; Create `pi-tutor/extensions/tutor/habit-events.ts` (pure detectors); Test `pi-tutor/test/habit-events.test.ts`, `pi-tutor/test/episode.test.ts`.

**Interfaces:** pure detectors returning `HabitEvent | null`: `directionEvent(prev: TryOutcome, next: TryOutcome)` (`TryOutcome = { passed: number; total: number; crashed: boolean }`; closer = more passed, or crash → no crash); `questionEvent(askedAt: number, nextTry: { closer: boolean } | null, repeated: boolean)`; `readsErrorEvent(ask: { shownMs: number } | null, chatQuestionWithErrorOpen: boolean)` (ok when the right-click ask came after ≥ 5000 ms); `smallRunEvent(changedLines: number)` (ok ≤ 15); `ownFixEvent(closedBy: "checks" | "fix-step")`; `stepsFirstEvent(artifactsBeforeBuild: number)` (ok ≥ 2 of Shape/Examples/Steps from the learner); `ideasToCodeEvent(ownSteps: boolean, checksPassed: boolean)`; `looksUpEvent(docsOpenedBeforeAsk: boolean)`. Index keeps the last run's file text per path to count changed lines.

- [ ] **Step 1: Failing tests** for each detector (one ok and one miss case each), and `episode.test.ts` "a fixed task without the fix step records own-fixes ok, and tries that get closer record right-direction ok" (real sandbox, Python).
- [ ] **Step 2–5:** run, implement, run, commit `feat: habit events from tries, questions, runs, recipe steps and fixes`.

### Task 8: The level moves inside its band; /tutor-progress shows habits

**Files:** Create `pi-tutor/extensions/tutor/levels.ts`; Modify `index.ts` (`/tutor-progress`, level change notices), `progress.ts`; Test `pi-tutor/test/levels.test.ts`, `pi-tutor/test/smoke.test.ts`.

**Interfaces:** `levelInBand(i: { level: number; band: Band; solid: number; total: number; fixStepStreak: number; placedFloor: number }): { level: number; reason: string } | null` (target = band floor + (band top − floor) × solid/total, never above the band top, never below `max(band floor, placedFloor)`; −3 per task in a fix-step streak ≥ 2; null when unchanged); `stepDownSuggested(fixStepStreak: number): boolean` (≥ 3).

- [ ] **Step 1: Failing tests.** 4 of 8 beginner habits solid at level 10 → 22 with a reason naming the newest solid habit; never above 33; placed at 50 with nothing solid → stays 50 (Review Focus #3); Python habits solid but none in Rust → Rust level unchanged (Review Focus #2); `/tutor-progress` lists each habit with its state and latest evidence.
- [ ] **Step 2–5:** run, implement, run, commit `feat: the level moves inside its band as habits turn solid; /tutor-progress shows habits`.

### Task 9: Phase 2 live check, docs, merge (as Task 5, for habits: two tasks done without the fix step show "showing" for own-fixes; a level change notice with its reason).

## Phase 3 — the step-up (branch `habits-p3`)

### Task 10: The offer and `/tutor-step-up`

**Files:** Create `pi-tutor/extensions/tutor/step-up.ts`; Modify `index.ts`, `nvim-tutor/lua/tutor/init.lua` (`:TutorStepUp`); Test `pi-tutor/test/step-up.test.ts`, `smoke.test.ts`, `init_spec.lua`.

**Interfaces:** `stepUpOffered(i: { band: Band; habitsSolidIn: (h: HabitId) => boolean; lastOffer: number | null; now: number }): boolean` (all of the band's habits solid in this language, not offered in the last 24 h); `/tutor-step-up` starts it any time; the offer is a notice plus a `/tutor-progress` line.

- [ ] **Steps 1–5:** tests (offered when all solid, not twice a day, not at pro top), FAIL, implement, PASS, commit `feat: the step-up is offered when a band's habits are solid; /tutor-step-up`.

### Task 11: The talking test

**Files:** Modify `step-up.ts`, `index.ts`; Test `step-up.test.ts`, `smoke.test.ts`.

**Interfaces:** `parsePlan(text: string): { steps: string[]; pieces: string[] } | null` (numbered lines + one `pieces:` line, comma-separated); `piecesMatch(pieces: string[], reference: string, aliases: Record<string, string[]>): { matched: number; total: number }` (reference pieces = called names and keywords from the reference source, aliases from the language pack's cookbook); flow: problem → free talk → "now your plan: numbered steps and one `pieces:` line" → `parsePlan`; no `pieces:` line → asked once more, never graded from free chat.

- [ ] **Steps 1–5:** tests (`parsePlan` cases; `piecesMatch(["open","split","dict","sorted"], <reference using Counter>, {dict:["Counter"]})` counts dict as a match; Review Focus #4 smoke: a reply with no `pieces:` line gets exactly one re-ask), FAIL, implement, PASS, commit `feat: the step-up's talking test: free talk, then a plan code can read`.

### Task 12: The coding test and the result

**Files:** Modify `step-up.ts`, `exam/make.ts` (a step-up exam kind), `index.ts`; Test `step-up.test.ts`, `exam-make.test.ts`, `smoke.test.ts`.

**Interfaces:** `unfamiliarModule(language: string, used: Set<string>): string | null` (from the pack's library list, e.g. Python `datetime`, `collections`, `pathlib`, minus modules seen in the learner's code); exam kind `"step-up"` with three parts: solve (needs that module), fix (a broken program from the reference with one slip mutant applied, checks attached), own plan (the talking test's plan, checks from the reference); `stepUpResult(parts: { passed: number; total: number }[], talking: { matched: number; total: number }): { pass: boolean; practise: string[] }` (each part ≥ 3 of 4; talking matched ≥ 3 of 4 of the reference pieces); pass → notice "move to 34 (intermediate)? /tutor-level 34 or not now" — the level moves only on the learner's command; fail → practise list; retake offered after 3 more ticked tasks; `stepDownSuggested` notice wired.

- [ ] **Steps 1–5:** tests (result rules; the fix part's program fails its checks before repair; a passed result never changes the level by itself), FAIL, implement, PASS, commit `feat: the step-up's coding test, the result, and the learner's yes`.

### Task 13: Phase 3 live check, docs, merge (a beginner with seeded solid habits takes the step-up end to end with nemotron).

## Phase 4 — intermediate: tests (branch `habits-p4`)

### Task 14: Test teaching and own tests that must be able to fail

**Files:** Create `pi-tutor/extensions/tutor/own-tests.ts`; Modify `prompts/system/intermediate.md`, `index.ts` (`/tutor-done`), `packs/*/card.md` (test layout lines); Test `pi-tutor/test/own-tests.test.ts`, `episode.test.ts`.

**Interfaces:** `findOwnTests(root: string, language: string, task: string): string[]` (names `test_p1_t1_*`, `p1_t1_*`, `TestP1T1*`); `runOwnTests(exec, i: { root; language; tests: string[]; sandbox }): Promise<{ pass: boolean; out: string }>`; `canFail(exec, i: { root; language; tests; entry; sandbox }): Promise<boolean>` (the own tests run against slip mutants of the learner's function; true when at least one mutant fails them). Tick rule (author): own test passes AND `canFail` AND trusted checks pass; a failing own test is a try; a test that cannot fail → "your test passes even on a broken version" and no tick; event `tests-that-fail`.

- [ ] **Steps 1–5:** tests (Review Focus #5: an always-true test does not tick; a good test plus passing checks ticks; a failing own test is a try), FAIL, implement, PASS, commit `feat: intermediate — the tutor teaches tests; an own test must pass, be able to fail, and the checks still pass`.

### Task 15: Phase 4 live check, docs, merge.

## Phase 5 — advanced (branch `habits-p5`)

### Task 16: The pro score

**Files:** Create `pi-tutor/extensions/tutor/pro-score.ts`; Modify `index.ts`; Test `pi-tutor/test/pro-score.test.ts`.

**Interfaces:** `proScore(f: { checksPass: boolean; ownTestsPass: boolean; ownTestsCanFail: boolean; edgeCasesCovered: number; edgeCasesTotal: number }): number` (25 each for the first three, 25 × covered/total); shown on tick at 67+; model notes on design/naming listed separately with no points.

- [ ] **Steps 1–5:** tests, FAIL, implement, PASS, commit `feat: the pro score, from facts code can check`.

### Task 17: "Improve it" tasks and complex problems; the advanced step-up

**Files:** Create `pi-tutor/extensions/tutor/improve.ts`; Modify `check-run.ts` (a timed large-input check kind), `exam/make.ts`, `step-up.ts`; Test `pi-tutor/test/improve.test.ts`, `check-run.test.ts`.

**Interfaces:** `codeMetrics(exec, i: { root; entry; sandbox }): Promise<{ longestFunction: number; maxNesting: number; branches: number }>` (Python `ast` in the sandbox); `Check.kind` gains `"timed"` (`expr`, `limitMs` from the reference's run time × 3); `improveResult(before: Metrics & { edgePassed: number; ms: number }, after: same): { better: string[]; worse: string[] }`; event `optimizes` when ≥ 1 better and none worse with checks passing; event `complex` when a task with ≥ 3 functions or an unfamiliar module ticks without the fix step; the intermediate → advanced step-up adds a "write tests that can fail" part and an "improve it" part.

- [ ] **Steps 1–5:** tests (metrics on a nested function; a timed check fails a quadratic version and passes a linear one; improve result), FAIL, implement, PASS, commit `feat: improve-it tasks, complex problems and the advanced step-up`.

### Task 18: Phase 5 live check, docs, merge.

## Phase 6 — optional second model checking replies (branch `habits-p6`)

### Task 19: `/tutor-checker <model|off>`

**Files:** Modify `index.ts` (held-reply path), `PI_SURFACE.md`; Test `smoke.test.ts`.

**Interfaces:** setting `checker` (model id or off, default off); after code's checks pass on a held reply, `rawComplete` with the checker model, prompt = the step's rule + the reply, answer `yes` / `no: <reason>`; `no` is handled as a failed code check (rewrite, at most twice); it can never release a reply code rejected. Verify model lookup by id in `types.d.ts` (`ctx.modelRegistry`) before use and record it in `PI_SURFACE.md`.

- [ ] **Steps 1–5:** tests (off by default: no extra call; on: a `no` triggers a rewrite; a code-rejected reply is never sent to the checker), FAIL, implement, PASS, commit `feat: an optional second model checks held replies`.

### Task 20: Phase 6 live check (glm as checker over nemotron), docs, merge.

## Phase 7 — leftovers (branch `habits-p7`)

### Task 21: Rust/Go harness minors
Line map without a final newline (always append `"\n"` before the harness); Go entry at the project root (strip `./` from diagnostics); Rust module subfolders searched and `functionSpan` scoped to the matching `impl` when the expression names a type; slip mutants skip Rust lifetimes and Lua long strings; the second near-miss probe skipped when every extra check is unverified; an unclosed bracket in an expected value rejected by `parseChecks`. Each with a failing test in `check-run-compiled.test.ts`, `near-miss.test.ts` or `checks.test.ts`. Commit `fix: Rust/Go harness minors`.

### Task 22: Checks and Neovim minors
`spec/checks.md` rewritten after a failed `/tutor-done`; `:TutorDone` completion filtered by the typed prefix; `:TutorFix` command in nvim-tutor. Tests in `episode.test.ts`, `init_spec.lua`. Commit `fix: checks.md after a failed /tutor-done; :TutorDone completion; :TutorFix`.

### Task 23: JavaScript/TypeScript function checks
`VALUE_LANGUAGES` gains javascript and typescript; a Node harness (`node --input-type=module` importing the entry, `util.isDeepStrictEqual` with number tolerance, the `\x1eTUTOR` marker) in `check-run.ts`; reference prompt lines for JS/TS. Tests in `check-run.test.ts`, `checks.test.ts`, `check-job.test.ts` (real node). Commit `feat: function checks for JavaScript and TypeScript`.

### Task 24: Older minors and housekeeping
Phase 1 (teaching turns) M1, M4–M7; the exam, sandbox and onboarding minors listed in project memory, each with a failing test or a ledger ruling that it stands; `test/exam-layout.test.ts` `realHost()` cache removed after each test; the Neovim test's unhandled `write after end` fixed. Commit per group.

### Task 25: Phase 7 live check, docs, merge.
