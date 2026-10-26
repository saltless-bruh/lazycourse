# Habits and levels: a tutor that builds experience and a coding mindset

Date: 2026-10-26. Author's brainstorm the same day. Builds on main at c9c72ae: teaching turns phases 1+2
(`docs/superpowers/specs/2026-10-21-teaching-turns-design.md`) and Rust/Go checks
(`docs/superpowers/specs/2026-10-22-rust-go-checks-design.md`). Marks: **(author)** = the author decided;
**(designer's call)** = decided here, open to the author's correction; everything else is left to the builder.

## 1. Intent (author)

The end result the tutor gives a learner is not knowledge of one programming language. It is an environment
where the learner gains experience and the right mindset about coding in general: "Most knowledge can look
up, not experiences and mindset."

So the tutor's level must stop being a number only the learner sets, and must follow the habits that make
someone a programmer. Today (c9c72ae): the level is set once at onboarding (experience, self-score, a level
task) or by `/tutor-level`; nothing moves it; the band cut (0–33 / 34–66 / 67–100) changes only how help is
paced; per-concept ease (FSRS) never touches the level.

```
today                                       this design
level ← onboarding or /tutor-level          level ← habits shown, step-up tests passed, learner's yes
band  → how help is paced                   band  → how help is paced + what is taught (recipe, tests, scores)
concept ease → nothing visible              concept ease → what to practise next
```

## 2. Goals, non-goals, anti-goals

Goals:
1. The habits below are observed from evidence code already records or can record, shared across languages.
2. Moving up a band is earned by a step-up (a talking test and a coding test) the tutor offers when the
   habits are there; the learner always confirms. Moving down is suggested, never forced.
3. Each band teaches the habits it is about: beginners the recipe and reading errors, intermediates testing,
   advanced learners optimizing and complex problems.
4. The remaining items of the teaching-turns design (§13 items 3–6) and the known minors are built.

Non-goals: teaching a language's facts for their own sake (they can be looked up); a leaderboard or streaks;
grading design or "taste" by a model.

Anti-goals (a failure even if it works):
- a weak model's opinion moves the level, passes a test or awards a point;
- the level moves without the learner saying yes;
- a habit is "measured" from something the learner cannot see or contest;
- a recipe or test the learner cannot skip or turn off (they can always say `off`, `skip`, `not now`).

## 3. The habits (author)

| Habit | Evidence code uses **(designer's call)** |
|---|---|
| Breaks a problem into steps before coding | recipe Steps/Examples artifacts in the learner's own chat messages (never the model's) before Build |
| Reads the error before asking | the right-click "ask about this error" (§5.2) used after the error was on screen ≥ 5 s, versus a chat question with no error open |
| Looks things up when something is unfamiliar | the unfamiliar-module part of the step-up passes without the fix step; docs skill opened (`:TutorDocs`, `K` on a symbol) before asking |
| Runs small pieces often | `:TutorRun`/`:TutorDone` between edits of ≤ ~15 changed lines on average |
| Fixes own bugs without the handed line | spot closed by a passing check before the ladder's fix step |
| Turns ideas into code | a task's checks pass on code built from the learner's own recipe Steps; also the step-up's part 3 (§6.3) |
| Goes the right direction | successive graded tries on one spot get closer: more checks pass, or the failure moves crash → wrong value → pass |
| Asks the right question | a chat question followed by a closer next try on that spot counts as useful; the same question repeated does not |
| (intermediate → advanced) Optimizes logic, speed, code; design | §8 "improve it" tasks and the pro score |
| (intermediate → advanced) Figures out complex problems | multi-part or unfamiliar-area tasks solved without the fix step |

Each habit has a state per learner: **not yet → showing → solid** **(designer's call)**: *showing* after 2
qualifying events, *solid* after 5 across at least 2 projects, with the last 3 qualifying. Habits are stored
once per learner, not per language (author: experience carries across languages); events record their
language.

## 4. Levels and the band (designer's call, from the author's goal)

- The level stays 0–100 per language (help pacing and code snapshots are language-specific).
- Inside a band, the level moves by itself, toward the band's top as the band's habits turn solid (e.g. 4 of
  the beginner habits solid → 25 of 33), and back down a little when graded tries keep climbing to the fix
  step. Every change is shown ("level 18 → 22: you fixed your own bugs three times").
- At a band's top edge the level stops; crossing it takes the step-up (§6) and the learner's yes.
- Step down: after 3 tasks in a row that reached the fix step, the tutor suggests dropping a band; the
  learner may refuse.
- `/tutor-level` still sets the level by hand (the learner's override); it is recorded as such.
- Concept ease (FSRS) only picks what to practise and which project to suggest.
- Band habits: beginner = the first eight rows of §3; intermediate = "tests that can fail" (an own test that
  passes on the learner's code and fails on a broken stub, §7) and "figures out complex problems"; advanced
  adds optimizing (§8). Step-up-only evidence never gates the step-up that produces it.
- **Languages (author, 2026-10-26):** habits are shared; a habit solid in one language counts in another once
  it has one qualifying event there. The level and the step-up are per language.
- **Placement (author, 2026-10-26):** onboarding still places a learner (it can place above beginner). Habits
  only raise the level inside its band, never pull a placed level below its band; the step-down suggestion
  still applies. Existing levels are kept as they are.
- **Slipping back (designer's call):** misses are recorded as events too; a solid habit whose last 3 of 5 miss
  drops to showing, which withdraws a pending step-up offer but does not lower the level.

## 5. Phase 1 — the beginner path (Python first)

### 5.1 The recipe is the beginner default (spec 2026-10-21 §4)
- The beginner mode no longer half-fills the learner's artifact: the model shows each step on an unrelated
  example and the learner writes their own (designer's call: the habit counts only the learner's text).
- Phase 1 builds every feature for all languages that have checks (Python, Lua, Rust, Go); the live check runs
  Python first (designer's call). The `@dataclass` fix (§5.3) is Python-only by nature.
- At beginner level, `/tutor-done`'s next open task, or the first task of a project, starts the recipe
  (Find → Shape → Examples → Steps → Map → Build) by itself **(author)**.
- `/tutor-plan skip` moves to the next step; `/tutor-plan off` ends it for this task; the next task starts it
  again **(author)**. Skipping is never a try and never changes the level.
- Intermediate and above: off by default, `/tutor-plan <task>` as today.
- A step advances when code recognises its artifact: Shape = a typed signature line; Examples = 2+
  `input → output` rows, one marked edge; Steps = 2+ numbered sentences without code; Map = each step paired
  with a construct; Build = the task's checks **(designer's call)**. Examples rows that parse become extra
  checks for that task, cross-checked against the reference like any check.

### 5.2 Right-click "Ask tutor about this error" (spec 2026-10-21 §9)
- nvim-tutor adds a `PopUp` menu entry next to LazyVim's diagnostics entries (Neovim 0.12 `MenuPopup`
  autocmd, enabled only when the line under the cursor has a diagnostic) and a key, `<leader>te`
  **(designer's call)**. It sends the diagnostic message, the line number and the line's code to Pi as a
  learner question.
- The stuck detector's error-sitting nudge (`stuck.ts` kind "error") is turned off; the learner asks
  **(spec §9)**. Idle, churn and run nudges stay.

### 5.3 Beginner fixes from the known minors (designer's call: these hurt beginners most)
- The near-miss rounding probe no longer flags tasks whose function returns integers (detect from the
  reference run's value type: Python `int`, Rust `{:?}` without a point, Go `%T`); the note is not shown
  for them.
- Prose leaks: the leak check also blocks a reply before the fix step that names the fix in words: the
  reference line's distinctive operator or call (e.g. `/` replacing the learner's `*`, `.floor()`) stated as
  an instruction ("use /", "change * to /"). Rewritten like a code leak.
- Long decimals in notices are shown to 4 significant digits after the point ("16.6667"); comparison is
  unchanged.
- The Python harness registers the module (`types.ModuleType` in `sys.modules`) so `@dataclass` with
  `from __future__ import annotations` loads.

## 6. Phase 2 and 3 — the habit profile and the step-up

### 6.1 Habit profile (phase 2)
- Profile v6 gains a `habits` table (habit, state, events) and a `habit_events` log (habit, language,
  project, time, evidence id). Events come from the places in §3; each event names its evidence (the episode,
  check, or command) so the learner can see why.
- `/tutor-progress` shows the habits with their state and the latest evidence, then concepts as today.

### 6.2 When the step-up is offered
- When every habit of the current band is solid, the tutor offers the step-up once per day (notice + a line in
  `/tutor-progress`); `/tutor-step-up` starts it any time **(designer's call: the name)**.

### 6.3 The step-up (author: a talking test and a coding test)
Runs as an exam (the existing `/tutor-exam` folder, sandbox and timer), with a generous limit (speed is not a
goal, author).
1. **Talking test.** The tutor gives a problem in plain words. The learner plans it in chat: what the program
   needs, the steps, the pieces they would use. Marks (author): real logic, not bluffing; near-correct code
   pieces; flaws fine if near-correct.
2. **Coding test**, three parts (author):
   - *Solve a problem* — a fresh problem that needs one module the learner has not used (picked from the
     language pack's library list against the learner's events); looking it up is expected.
   - *Fix an error* — a broken program; passes when its checks pass and the original failure is gone.
   - *Turn an idea into code* — the learner builds **their own plan from the talking test** (designer's call).
     Real logic (mark 1) is shown by that plan leading to code that passes most checks.
- **Talking-test format (author, 2026-10-26):** the learner talks freely first; then the test asks for a short
  structured plan: numbered steps and one `pieces:` line (`pieces: open, split, dict, sorted`).
- Grading **(designer's call)**: mark 2 = code compares the `pieces:` line with the pieces in the
  hidden reference (cookbook aliases count as close); marks 1 and 3 = part 3 passes at least 3 of 4 checks.
  Each coding part passes at 3 of 4 checks. The step-up passes when the talking marks and all three parts
  pass. The model writes notes (what was missed), never a mark.
- Pass → "you passed the step-up: move to 34 (intermediate)?" — yes / not now. Fail → stays; the result
  names the habits and concepts to practise; a retake is offered after 3 more tasks.

## 7. Phase 4 — intermediate: testing (spec 2026-10-21 §7)
- At 34–66 the tutor teaches test writing the §6 way: rules, the arrange → act → check structure, the
  language's test tool (`unittest`/`pytest`, `cargo test`, `go test`), naming, good practice.
- **Both must pass (author, 2026-10-26):** when the learner's own test for a task exists, the task ticks only
  when that test passes, it fails on a broken stub, and the task's trusted checks pass. The own test adds proof;
  it never replaces the reference-checked checks. (This tightens the 2026-10-21 wording.)
- A task's own test is found by name (`test_p1_t1_*`, `p1_t1_*`, `TestP1T1*` — designer's call). Without one,
  the task's checks alone prove it, so learning to test never blocks the project (author, 2026-10-21). A
  failing own test is a try.
- An own test must fail on a broken stub of the function (the near-miss slip copies, reused) to count; one
  that passes on the stub is "a test that cannot fail" and does not prove the task.

## 8. Phase 5 — advanced: the pro score, "improve it", complex problems
- The intermediate → advanced step-up arrives with this phase: the three parts of §6.3 plus writing tests that
  can fail for the problem, and one "improve it" part (designer's call).
- **Pro score** (spec 2026-10-21 §8): only code-checkable facts — the task's checks pass; the learner's tests
  pass; their tests fail on broken stubs; the "done when" edge cases are covered. Model notes on design and
  naming point at a line and give no points.
- **"Improve it" tasks** (author: optimizing in logic, speed, code, design): working code (the learner's own
  earlier task, or a given one) to make better; checks must still pass. Measured before → after **(designer's
  call)**: logic = edge-case checks added by the task now pass; speed = a large-input check timed against the
  reference; code = function length, nesting depth and branch count from the language's parser (Python `ast`,
  no new dependency); design = model notes only.
- **Complex problems**: multi-part tasks (several functions working together) or an unfamiliar library;
  they count toward the "figures out complex problems" habit when solved without the fix step.

## 9. Phase 6 — optional second model checking replies (spec 2026-10-21 §13 item 6)
- Off by default; `/tutor-checker <model>` turns it on **(designer's call)**. After code's own reply checks
  pass, a second model reads the held reply against the step's rule and answers yes/no with one reason; a no
  is treated like a failed code check (rewrite, at most twice). It can only make a reply stricter, never
  release one code rejected (published work: a weaker model validating hints raised quality).

## 10. Phase 7 — leftovers
JavaScript/TypeScript function checks; `:TutorFix` in Neovim; the Rust/Go harness minors (line map without a
final newline, Go entry at the project root, Rust module subfolders, lifetimes in slip copies, Rust rebuild
caching, the second probe when extra checks are unverified, an unclosed bracket in an expected value);
`checks.md` rewrite after a failed `/tutor-done`; `:TutorDone` completion filtering; phase 1 minors M1, M4–M7;
the exam, sandbox and onboarding minors in project memory; the `/tmp` test-cache leak and the Neovim test's
unhandled error.

## 11. Constraints
- No stdout/stderr inside Pi; new Pi APIs verified and listed in `pi-tutor/PI_SURFACE.md`; editor paths inside
  the project root; writes through `writeInRoot`; the bash tool stays off; TDD with real toolchains.
- Every learner-facing behaviour has an off/skip and band-aware defaults (author's standing rule).
- Live check per phase with nemotron (the weak model, on purpose) in real LazyVim; Pi's settings unchanged.
- The model never moves the level, passes a test or awards a point.

## 12. Order and size
One plan, seven phases in the order above, each merged to main and live-checked before the next. Phases 1–3
are the core of the author's goal.

## 13. Left to the builder
- The exact evidence thresholds within §3's rules, and the level arithmetic inside a band (§4).
- How Examples rows are parsed into checks (§5.1), and the PopUp entry's exact text and placement (§5.2).
- Which modules count as "unfamiliar" per language and how a fresh step-up problem is generated and
  cross-checked (§6.3).
- The profile migration's shape (§6.1).
