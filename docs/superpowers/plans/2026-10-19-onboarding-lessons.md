# Onboarding Conversation and Learn-First Lessons Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/tutor-start` becomes a conversation with the tutor that learns the learner's level, picks a language and one project, then either builds right away or teaches the project's weak concepts first. Lessons and exercises come from established curricula (Exercism, rustlings, official docs) and are checked by real tests in the sandbox. Concepts are remembered with FSRS spaced repetition. Only context7's two MCP tools may reach the model.

**Architecture:**
- **Pure modules** under `pi-tutor/extensions/tutor/`, with `index.ts` doing only the wiring:
  - `onboard.ts`: checklist state, the hidden `tutor-intake` note, code-owned decisions;
  - `lessons.ts`: the vendored lesson loader and lesson state;
  - `review.ts`: an FSRS wrapper.
- **Content** lives in `pi-tutor/lessons/<language>/`. It is vendored by `scripts/vendor-lessons.mjs` from pinned upstream commits, and `npm run lessons` checks it: exemplar passes, stub fails, in the sandbox.
- **Exercises** reuse the exam layouts and `runExamTests`.

**Tech Stack:** TypeScript (Node 26, `node:sqlite`), vitest, Pi 1.3.0 extension API, Lua/plenary, `ts-fsrs` (MIT), bubblewrap sandbox (existing).

**Spec:** `docs/superpowers/specs/2026-10-19-onboarding-conversation-design.md` (Q1–Q27).

## Global Constraints

- No stdout/stderr inside Pi. Every new Pi API is verified in `node_modules/@earendil-works/pi-coding-agent/dist/core/extensions/types.d.ts` (1.3.0) and recorded in `PI_SURFACE.md`.
- `bash` stays off. The model gets `read,grep,find,ls,tutor_remember,tutor_recall` plus only `mcp__context7__resolve_library_id` and `mcp__context7__query_docs`. `codemode` is never enabled.
- Every file the extension writes goes through `writeInRoot` (realpath inside the root). Exercise code runs only through `runExamTests` with the sandbox setting.
- Must hold with `nemotron-3.5-lightning`. Every model output the code depends on has a code-owned fallback.
- The six languages are `python, rust, go, typescript, lua, javascript` (`start.ts` `LANGUAGES`). Lessons are built in this order: Python → Go → JavaScript → Rust → TypeScript → Lua.
- Lesson content is vendored, never generated. Each source keeps its licence text and copyright line, plus a `NOTICE` naming repo and commit. CC BY sources get an attribution line ("Adapted from … , CC BY x.y, changes made"). Sources that are NC, SA or all-rights-reserved are not used.
- A converted or our-own test is trusted only when, in the sandbox, the exemplar or reference solution passes it and the stub fails it.
- Level ladder (Q20), the same in every language: `leap` → `raindrops` → `isogram` → `luhn` (Exercism practice exercises).
- Pacing (Q15): at most 3 concepts per lesson round. Onboarding: at most 6 exchanges before the code-owned fallback (Q6).
- Learner-facing text never says "rung". Diagram and report lines are ≤ 40 columns.
- Work happens on worktree branch `onboarding-lessons`, with TDD and one commit per task (more when a task says so). Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Gates:
  - TS: `cd pi-tutor && npm test && npm run typecheck`. The only allowed error is the known 'write after end'.
  - Lua: `cd nvim-tutor && nvim --headless -u tests/minimal_init.lua -c "PlenaryBustedDirectory tests/ {minimal_init='tests/minimal_init.lua'}"`.
  - Content: `cd pi-tutor && npm run lessons`.

## Review Focus

1. **The weak model never writes the intake note, or writes it broken.** After 2 bad notes or 6 exchanges, the code asks the missing items itself, and onboarding always completes (Task 5 test).
2. **The learner leaves mid-onboarding** (`/new`, quitting Pi, Esc). The next `/tutor-start` resumes from the saved state (profile setting `onboarding`) instead of starting over (Task 6 test).
3. **A vendored or converted exercise whose stub already passes, or whose exemplar fails.** `npm run lessons` fails, naming the exercise, and the loader skips exercises missing an exemplar (Task 3 test).
4. **Background spec generation fails** (model error, timeout, invalid JSON). The learner is told, `/tutor-start spec` retries, and lessons keep working (Task 7 test).
5. **An MCP server added later to `~/.pi/agent/mcp.json`.** Its tools never reach the model: the `--tools` list filters them, and the guard blocks any `mcp__` name other than the two context7 tools (Task 1 tests).

---

### Task 1: Lock MCP down, allow only context7

**Files:**
- Modify: `nvim-tutor/lua/tutor/init.lua` (`M.build_cmd`)
- Modify: `pi-tutor/extensions/tutor/guard.ts`
- Modify: `README.md` (a "Docs lookup with context7" section), `pi-tutor/PI_SURFACE.md` (MCP)
- Test: `nvim-tutor/tests/init_spec.lua`, `pi-tutor/test/guard.test.ts`

**Interfaces:**
- Produces: `DOCS_TOOLS: ReadonlySet<string>` in `guard.ts` = `{"mcp__context7__resolve_library_id", "mcp__context7__query_docs"}`.

- [ ] **Step 1: Failing tests**
  - Lua: `build_cmd({"pi"})` contains `--tools` followed by exactly `read,grep,find,ls,tutor_remember,tutor_recall,mcp__context7__resolve_library_id,mcp__context7__query_docs`.
  - TS: `guardToolCall("mcp__context7__query_docs", {libraryId: "/python/cpython", query: "open"}, cwd)` returns `undefined`. `guardToolCall("mcp__other__write_file", {}, cwd)` and `guardToolCall("codemode", {}, cwd)` both block, with a reason containing "read-only".
- [ ] **Step 2: Run them.** Expected: the Lua test fails on the old list, and the TS context7 test fails (it is blocked today).
- [ ] **Step 3: Implement.** Extend the `--tools` string. In `guardToolCall`, let `DOCS_TOOLS` names pass before the `READ_TOOLS` check. The README section shows the `~/.pi/agent/mcp.json` entry for context7: `exposure: "direct"`, `"autoEnableCodemode": false`, and the note that context7 sends search queries to an outside service. `PI_SURFACE.md` records the naming rule from `docs/mcp.md` ("`mcp__<server>__<tool>`, `-` → `_`") and that `--tools` filters MCP tools only when an entry starts with `mcp__`.
- [ ] **Step 4: Run both suites.** Expected: PASS.
- [ ] **Step 5: Commit.** `feat: only context7's two MCP tools reach the model; MCP lock-down`

### Task 2: FSRS spaced repetition and profile v5

**Files:**
- Create: `pi-tutor/extensions/tutor/review.ts`
- Modify: `pi-tutor/extensions/tutor/profile.ts` (migration v5, methods), `pi-tutor/package.json` (dependency `ts-fsrs` pinned to the current 5.x, licence checked to be MIT)
- Test: `pi-tutor/test/review.test.ts`, `pi-tutor/test/profile.test.ts`

**Interfaces:**
- Produces:
  - `review.ts`: `ratingFor(score: number): Rating`, where score is in 0..1 (`< 0.4` Again, `< 0.7` Hard, `< 0.9` Good, else Easy); `seedCard(ease: number, now: number): CardState`; `nextCard(card: CardState, rating: Rating, now: number): CardState`. `CardState` is the JSON-safe ts-fsrs `Card` with dates as epoch milliseconds.
  - `profile.ts` migration v5: `CREATE TABLE cards (language TEXT NOT NULL, tag TEXT NOT NULL, card TEXT NOT NULL, due INTEGER NOT NULL, PRIMARY KEY (language, tag));`.
  - `Profile.rateConcept(language: string, tag: string, score: number, now: number): void` creates the card lazily, seeded from that concept's `ease`, or `seedCard(0.5)` when there is none.
  - `Profile.dueConcepts(language: string, now: number, limit = 3): string[]` returns concepts with `due <= now`, oldest first.
  - `recordEpisode` and `recordExam` also call `rateConcept` for each tag with the same score they fold into `ease`.

- [ ] **Step 1: Failing tests**
  - `ratingFor` at 0.39 / 0.4 / 0.69 / 0.7 / 0.89 / 0.9 gives Again / Hard / Hard / Good / Good / Easy.
  - `nextCard(seedCard(0.5, t), Again, t).due` is earlier than `nextCard(seedCard(0.5, t), Easy, t).due`.
  - A v4 profile file opens at v5, keeping its rows.
  - Recording an episode with tags `["loops"]` and score 0.2 makes `dueConcepts("python", far future)` contain `loops`.
  - A concept rated Easy yesterday is not due today.
- [ ] **Step 2: Run them.** Expected: FAIL, because `review.ts` is missing and `SCHEMA_VERSION` is 4.
- [ ] **Step 3: Implement** with ts-fsrs's default parameters (`fsrs()`, `createEmptyCard`, `scheduler.next(card, date, rating)`). Store `card` as JSON with dates converted to milliseconds.
- [ ] **Step 4: Run.** Expected: PASS, and the full gate is green.
- [ ] **Step 5: Commit.** `feat: FSRS cards per concept (profile v5)`

### Task 3: Lesson format, loader and checker

**Files:**
- Create: `pi-tutor/extensions/tutor/lessons.ts`, `pi-tutor/test/lessons.test.ts`, `pi-tutor/test/lessons-content.test.ts`, `pi-tutor/vitest.lessons.config.ts`, `pi-tutor/lessons/README.md` (the format below)
- Modify: `pi-tutor/package.json` (`"lessons": "vitest run --config vitest.lessons.config.ts"`, and `files` includes `lessons`), `pi-tutor/vitest.config.ts` (exclude `lessons-content.test.ts`)

**Format** (fixed here; Tasks 4, 8–12 write it):

```
lessons/<language>/
  SOURCES.md                     what each source is, repo, pinned commit, licence, attribution lines
  licenses/<source>/LICENSE      verbatim licence text (+ NOTICE)
  <concept>/lesson.md            front matter: concept, title, tags (pack vocabulary), source, order
                                 body: the lesson text (vendored, edited only to cut), ≤ ~60 lines
  <concept>/<n>-<slug>/          one exercise, n = 1.. (easiest first)
      instructions.md            from the source's .docs/instructions.md (+ hints.md appended under "Hints")
      <stub file>                layout(language).stub name, e.g. solution.py
      <tests file>               layout(language).tests name, e.g. test_examples.py
      .exemplar/<stub file>      reference solution (never copied to the learner)
  _levels/<n>-<slug>/            the level ladder (same exercise shape), n = 1..4: leap, raindrops, isogram, luhn
```

**Interfaces:**
- Consumes: `layout`, `runExamTests`, `RunExec` (`exam/layout.ts`); `SandboxHost` (`exam/sandbox.ts`); `writeInRoot` (`files.ts`).
- Produces:
  - `interface Exercise { id: string; dir: string; instructions: string; stub: string; tests: string; exemplar: string }`.
  - `interface Lesson { language: string; concept: string; title: string; tags: string[]; source: string; order: number; text: string; exercises: Exercise[] }`.
  - `loadLessons(language: string, root = LESSONS_DIR): Lesson[]`, sorted by `order`. It skips an exercise missing any of its four files.
  - `levelTasks(language: string, root = LESSONS_DIR): Exercise[]`.
  - `writeExercise(projectRoot: string, rel: string, language: string, ex: Exercise): string[]` writes `instructions.md`, the stub, the tests and the layout's `extras` through `writeInRoot`, never `.exemplar`.
  - `checkExercise(exec: RunExec, language: string, ex: Exercise, sandbox: SandboxHost | null): Promise<{ exemplar: TestRun; stub: TestRun }>` runs both in temp folders.

- [ ] **Step 1: Failing tests (`lessons.test.ts`, fixture tree in a temp dir)**
  - `loadLessons` returns lessons in `order`, with front matter parsed (via `parseFrontmatter`).
  - An exercise folder without `.exemplar` is skipped.
  - `writeExercise` writes no `.exemplar`, refuses a `rel` outside the root, and creates `go.mod` for go (layout extras).
  - `checkExercise` with a Python fixture whose exemplar passes and stub fails returns `exemplar.code === 0` and `stub.code !== 0`. Use `realExec`, `skipIf` no python3.
- [ ] **Step 2: Run.** Expected: FAIL (module missing).
- [ ] **Step 3: Implement `lessons.ts`.** `LESSONS_DIR` = `<package>/lessons`. Also write `lessons-content.test.ts`: for every language with toolchains present and every exercise and level task, `checkExercise` gives exemplar `code 0` and stub `code ≠ 0` and `!broken`. Failures name `<language>/<concept>/<exercise>`. It runs the sandbox when `bwrap` is ready, otherwise unsandboxed.
- [ ] **Step 4: Run** `npm test` (unit) and `npm run lessons`. Expected: PASS; content has none yet, so the content test passes vacuously.
- [ ] **Step 5: Commit.** `feat: lesson format, loader and content checker`

### Task 4: Vendoring script and Python lessons

**Files:**
- Create: `pi-tutor/scripts/vendor-lessons.mjs`, `pi-tutor/lessons/python/**`
- Test: content through `npm run lessons`; the converter's unit tests go in `pi-tutor/test/vendor.test.ts`

**Interfaces:**
- Produces:
  - `node scripts/vendor-lessons.mjs <language>` reads a pinned source list at the top of the script (repo URL, commit SHA, licence path). It shallow-clones into a temp dir (network at dev time only), converts, and writes `lessons/<language>/` plus `SOURCES.md` and `licenses/`.
  - It exports pure converters for testing: `stripPytest(src: string): string` (Python), `jestToNodeTest(src: string): string | null` (JS/TS; `null` = unsupported pattern, so the exercise is skipped and listed in `SOURCES.md` as skipped), `bustedToHarness(src: string): string | null` (Lua).

- [ ] **Step 1: Failing converter tests (`vendor.test.ts`)**
  - `stripPytest` removes `import pytest`, `@pytest.mark.task(taskno=N)` lines, and `pytest.raises(X)` → `self.assertRaises(X)`, leaving a `unittest.TestCase` file.
  - `jestToNodeTest` turns `describe/test/expect(a).toBe(b)/toEqual/toStrictEqual/toThrow` into `node:test` + `node:assert/strict`, and returns `null` for `jest.fn`, `toMatchSnapshot` or `beforeEach`.
  - `bustedToHarness` maps `describe/it/assert.are.equal/assert.is_true` onto the existing Lua `check(name, f)` harness form, else `null`.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement the script and the converters.** Python sources:
  - `exercism/python`, pinned at the commit current on the day, MIT;
  - `concepts/<slug>/{introduction.md}` as the lesson text;
  - `exercises/concept/<slug>/` (instructions, hints, `.meta/exemplar.py`, stub, tests via `stripPytest`) as exercises;
  - `exercises/practice/{leap,raindrops,isogram,luhn}` (plain unittest; the example solution in `.meta/example.py`) as `_levels`.

  Map Exercism concept slugs to the Python pack's tag vocabulary (`packs/python/card.md` tags). Record unmapped slugs in `SOURCES.md` and give them their own tag.
- [ ] **Step 4: Gap lessons for Python (Q25).** Write `functions`, `errors` (raising and handling), `input` (reading user input), and `files` (read and write a text file) as our own lessons:
  - **Text:** quoted or adapted from the Python tutorial (PSF License v2: keep the PSF notice under `licenses/python-docs/`), with section links.
  - **Exercises:** each has an `.exemplar`. Input exercises take an injected `input_fn`/stream so they can be tested; file exercises use a temp path the test creates.
- [ ] **Step 5: Run `npm run lessons`.** Expected: every Python exercise and level task has exemplar pass and stub fail. Fix or drop any that do not, and record each drop in `SOURCES.md`.
- [ ] **Step 6: Commit** (two commits: the script and its tests, then the content). `feat: vendor-lessons script; Python lessons from Exercism + Python tutorial`

### Task 5: Onboarding state and the hidden intake note

**Files:**
- Create: `pi-tutor/extensions/tutor/onboard.ts`, `pi-tutor/prompts/system/onboard.md`, `pi-tutor/test/onboard.test.ts`
- Modify: `pi-tutor/extensions/tutor/compliance.ts` (`scrubInternals` also removes `tutor-intake` fences)

**Interfaces:**
- Produces:
  - `type Field = "experience" | "known" | "target" | "selfScore" | "idea" | "path"`.
  - `interface Onboarding { fields: Partial<{ experience: string; known: string[]; target: string; selfScore: number; confidence: string; idea: string | null; path: "build" | "learn" }>; exchanges: number; badNotes: number; levelCheck: { task: string; passed: boolean | null } | null; level: number | null; project: { title: string; summary: string; concepts: string[] } | null; stage: "talk" | "check" | "read" | "project" | "choose" | "done" }`.
  - `parseIntake(text: string): Partial<Onboarding["fields"]> | null`: the last `tutor-intake` fence (JSON). Unknown keys are dropped, `target` is accepted only if it is in `LANGUAGES`, and `selfScore` must be an integer from 1 to 10.
  - `applyTurn(o: Onboarding, note: Partial<…> | null): Onboarding` increments `exchanges`, merges the note, and counts a null note in `badNotes`.
  - `missing(o: Onboarding): Field[]`. `selfScore` is required only when the learner named the target (`known` includes it, or they asked for it). `target` is filled by code with `"python"` when `known` is empty (Q1).
  - `needsFallback(o): boolean` = `exchanges >= 6 || badNotes >= 2`.
  - `levelFrom(o): number` (0–100) maps experience, selfScore and the check result. It is monotonic in each; the exact table is the builder's call, written in the function's doc comment.
  - `onboardPrompt(o: Onboarding): string` is the per-turn hidden section: the known fields, the missing ones, the stage instructions, and the note format.
  - `prompts/system/onboard.md` is the conversation rules for the model: talk like a tutor; one question at a time; explain why when recommending; never write code; end every reply with a ```` ```tutor-intake ```` JSON fence holding only what was learned.

- [ ] **Step 1: Failing tests**
  - `parseIntake` reads a valid fence. It drops `target: "pytutor-architect"`, returns null for broken JSON, and uses the last of two fences.
  - Two broken notes → `needsFallback`. Six exchanges → `needsFallback`.
  - `known: []` → `missing` excludes `target`, and code sets `target === "python"`.
  - `known: ["python"], target: "rust"` → `selfScore` is missing.
  - `levelFrom` is monotonic: experience none < over 3 years; selfScore 3 < 8; a failed check < a passed check.
  - `scrubInternals` removes a `tutor-intake` fence entirely, and leaves a `tutor-judgment` fence unchanged.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the full gate. Expected: PASS.
- [ ] **Step 5: Commit.** `feat: onboarding state, hidden tutor-intake note, code-owned decisions`

### Task 6: `/tutor-start` as a conversation (talk → check → read → project → choose)

**Files:**
- Modify: `pi-tutor/extensions/tutor/index.ts` (the `tutor-start` handler, `before_agent_start`, `turn_end`), `pi-tutor/extensions/tutor/start.ts` (`runStart` is reduced to project creation, see Interfaces), `pi-tutor/extensions/tutor/suggest.ts` (one suggestion, `exclude` titles)
- Modify: `nvim-tutor/lua/tutor/init.lua` (`TutorStart` completion: `check`, `off`, `spec`)
- Test: `pi-tutor/test/smoke.test.ts` (a new describe block), `pi-tutor/test/start.test.ts`, `pi-tutor/test/suggest.test.ts`

**Interfaces:**
- Consumes: Task 5 (all), Task 3 (`levelTasks`, `writeExercise`), `runExamTests`, `sandboxHost()` (`index.ts`).
- Produces:
  - Profile setting `onboarding` (JSON `Onboarding`, keyed `onboarding:<language or "new">`) is written after every change and cleared at `stage: "done"`.
  - `/tutor-start [language]` starts or resumes. `/tutor-start off` stops and keeps the state. `/tutor-start check` runs the level task.
  - `suggestPrompt(i & { count: 1; exclude: string[] })` returns one suggestion; "show me something else" calls it again with the shown titles excluded.
  - `createProject(d: StartDeps & { language; level; project; dir }): Promise<{ dir: string }>`, in `start.ts`, creates the folder with `README.md` front matter (`run:`/`test:`/`language:`), `AGENTS.md` and `profile.addProject`. It writes no spec yet; the spec comes in Task 7.

- [ ] **Step 1: Failing smoke tests** (fake Pi, scripted model replies with intake fences)
  - `/tutor-start` with no profile row: the model's turn gets the `onboard` section (sections include `tutor_onboard`), and a reply with a fence `{"experience":"none yet","known":[]}` saves state with `target: "python"`.
  - The visible text sent on (after `message_end`) has no `tutor-intake` fence.
  - Typing `/tutor-start pytutor-architect` gives the notice "pick one of: python, rust, go, typescript, lua, javascript" and no state.
  - Two replies without a fence: the next turn uses `ctx.ui.select`/`ctx.ui.input` for each missing field (the fake UI answers), and the stage moves on.
  - A named language with selfScore 7 → `/tutor-start check` writes `~/lazycourse/.checks/<lang>/<n>-leap/` (home = temp) through `writeExercise`, runs `runExamTests` with the sandbox setting, sets `levelCheck.passed`, and the "read" notice names the level and its reason. With selfScore 3, no task is written; the stage is `talk` with the "technical questions" instruction in `onboardPrompt`.
  - A new boot with a saved `onboarding` setting resumes at the saved stage (Review Focus #2).
  - Choosing a project → `createProject` writes the folder (default `~/lazycourse/<language>-<slug>` shown in `ctx.ui.input`), then `link.switchProject(dir, "README.md")` is called. Expected: state saved with `stage: "choose"` and the `path` choice pending in the new session.
  - Second `/tutor-start` for a language with a profile row and a finished project: the onboard section says "check-in" (last project title, `dueConcepts`), not the full checklist.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement the wiring.** The handler sets `onboarding` and sends a kickoff `sendUserMessage("[tutor] start onboarding", {deliverAs: "followUp"})` like `/tutor-plan`. `before_agent_start` adds `sections["tutor_onboard"] = onboardPrompt(o)` while active. `turn_end` runs `parseIntake` and `applyTurn`, saves, and when `needsFallback` asks the missing fields with dialogs. Stage transitions are code-owned:
  - `talk` → `check` (selfScore ≥ 5) or `read`;
  - `check` → `read` after `/tutor-start check`;
  - `read` → `project` after the learner confirms (`ctx.ui.confirm`);
  - `project` → `choose` after the project is accepted and created;
  - `choose` → `done` in the project session (Task 7).

  The hint ladder and judgment do not apply during onboarding: no episode opens while `onboarding` is active.
- [ ] **Step 4: Run** the full gate and the Lua suite. Expected: PASS.
- [ ] **Step 5: Commit.** `feat: /tutor-start is a conversation: talk, level check, read, one project, early switch`

### Task 7: Build or learn: background spec and lesson rounds

**Files:**
- Modify: `pi-tutor/extensions/tutor/index.ts`, `pi-tutor/extensions/tutor/scaffold.ts` (`scaffoldPrompt` takes `rounds`; `writeScaffold` writes into the existing project folder, keeping README/AGENTS), `pi-tutor/prompts/system/scaffold.md` (tasks grouped by milestone: `## Milestone k: <concepts>` headings in `tasks.md`), `pi-tutor/extensions/tutor/lessons.ts` (lesson state)
- Create: `pi-tutor/prompts/system/lesson.md` (teaching a vendored lesson: present the text in our structure; ask the learner a question before explaining; never write the exercise's solution)
- Modify: `nvim-tutor/lua/tutor/init.lua` (`:TutorLesson`, completion `next skip check off review`)
- Test: `pi-tutor/test/lessons.test.ts`, `pi-tutor/test/smoke.test.ts`, `pi-tutor/test/scaffold.test.ts`, `nvim-tutor/tests/init_spec.lua`

**Interfaces:**
- Consumes: Tasks 2, 3, 5, 6.
- Produces:
  - `planRounds(project: string[], known: Set<string>, weak: string[], lessons: Lesson[]): string[][]` gives the project's concepts that have lessons and are not known, weak first, in chunks of ≤ 3. Concepts with no lesson are left out; the tutor explains those from the cookbook and docs (Q21).
  - `interface LessonState { rounds: string[][]; round: number; concept: string; exercise: number; fails: number; stepBack: boolean }` is saved as profile setting `lesson:<project path>`.
  - `/tutor-lesson next | skip | check | off | review`:
    - `next` writes the next exercise to `learn/<concept>/<n>-<slug>/`;
    - `check` runs it in the sandbox. A pass gives `rateConcept(…, 1.0)` and advances; a fail increments `fails`, and at 2 sets `stepBack` (the model is told to take a smaller step and say so in one line, Q17) and offers the concept's easier exercise if one exists;
    - `skip` gives `rateConcept(…, 0.9)` and marks the concept known (Q14);
    - `review` runs a due concept's first exercise (Task 2 `dueConcepts`).
  - The spec job: `startSpecJob(project, rounds)` runs `completeJson(scaffold…)` in the background (not awaited by the handler) and writes the spec through `writeScaffold`. Its status is shown in the widget's second line (`spec: writing…` / `spec: ready` / `spec: failed — /tutor-start spec retries`). `/tutor-start spec` retries.
- [ ] **Step 1: Failing tests**
  - `planRounds` with 7 unknown project concepts gives rounds of 3, 3, 1; known concepts and concepts without a lesson are absent; weak concepts come first.
  - In the new project session with `stage: "choose"`, answering "learn" starts the spec job and lesson round 1; answering "build" starts only the spec job. Both set `stage: "done"`.
  - The spec job resolving writes `spec/tasks.md` with `## Milestone 1:` naming round-1 concepts.
  - A spec job whose model call throws (Review Focus #4) sets the widget to `spec: failed — /tutor-start spec retries`; lessons still work, and `/tutor-start spec` retries and writes the spec.
  - `/tutor-lesson next` writes no `.exemplar`. `check` with a failing stub twice sets `stepBack` and the lesson section says so. `check` after the exemplar is copied in rates the concept 1.0 and advances.
  - `skip` marks the concept known, and the next round plan excludes it.
  - The lesson section injected in `before_agent_start` contains the lesson text and the rule "ask the learner a question before explaining".
  - Lua: `:TutorLesson` is defined with that completion list.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.** The lesson's `concept` drives the widget's first line (`lesson: loops 1/2`). The episode/judgment machinery stays on during lessons (normal tutoring), with the lesson section added.
- [ ] **Step 4: Run** the full gate. Expected: PASS.
- [ ] **Step 5: Commit.** `feat: build or learn: background spec in milestones, lesson rounds with exercises, skip, step back, review`

### Tasks 8–12: Lessons for Go, JavaScript, Rust, TypeScript, Lua (one task each, in this order)

The steps are the same for each language. Each task ends green on `npm run lessons` for its language, or with every dropped exercise listed in `SOURCES.md`.

**Files:** `pi-tutor/lessons/<language>/**`, plus the source entries in `scripts/vendor-lessons.mjs`.

| Task | Language | Lesson text | Exercises | Level ladder | Notes |
|---|---|---|---|---|---|
| 8 | go | Exercism go `concepts/*/introduction.md` | Exercism go concept exercises (`go test`) | Exercism go practice | Go by Example only for gap text (input, files), CC BY 3.0 attribution |
| 9 | javascript | Exercism javascript concept docs | Exercism javascript concept exercises via `jestToNodeTest` | Exercism javascript practice via `jestToNodeTest` | unsupported Jest patterns are skipped and listed |
| 10 | rust | The Rust Book chapter sections (MIT/Apache-2.0) | rustlings exercises with `#[test]` (MIT), plus Exercism rust concept exercises; tests run with `cargo test -- --include-ignored` | Exercism rust practice | layout: a stub in `src/lib.rs`, tests in `tests/examples.rs` |
| 11 | typescript | TS Handbook sections (CC BY 4.0, attribution) + Exercism javascript concept docs | Exercism typescript practice via `jestToNodeTest` | Exercism typescript practice | README marks TS lessons "thin" |
| 12 | lua | Lua 5.4 manual sections (Lua licence, notice kept) | Exercism lua practice via `bustedToHarness` | Exercism lua practice | README marks Lua lessons "thin" |

- [ ] **Step 1:** Add the source entries (pinned commits). Run `node scripts/vendor-lessons.mjs <language>`.
- [ ] **Step 2:** For input and files, write gap lessons as in Task 4 Step 4, citing the language's official docs. Rust uses the Rust Book ch. 9 and 12; JS/TS use Node's `readline` and `fs` docs (MIT, Node.js licence); Lua uses the manual's `io` library.
- [ ] **Step 3:** Run `npm run lessons`. Expected: exemplar passes and stub fails for every remaining exercise.
- [ ] **Step 4:** Commit: `feat: <language> lessons from <sources>`.

### Task 13: Docs, live check, `/tutor-live`

**Files:** `README.md` (onboarding, lessons, `/tutor-lesson`, context7, the lesson sources and licences, thin languages), `docs/superpowers/specs/2026-10-07-nvim-tutor-design.md` (§6 points to the new spec), `pi-tutor/PI_SURFACE.md`, `~/.config/nvim/lua/plugins/tutor.lua` (cmd list adds `TutorLesson`; outside the repo, noted in the final message)

- [ ] **Step 1: Write the docs.**
- [ ] **Step 2: Live check** (tmux, real Neovim with `PI_TUTOR_PROFILE` set to a temp profile, `nemotron-3.5-lightning`), as a beginner with no language:
  1. `/tutor-start`. Expected: a conversation; the tutor recommends Python with reasons; no `tutor-intake` fence on screen.
  2. Answer "no idea" → one project + "show me something else".
  3. Accept → folder default shown → Neovim and Pi move into the project.
  4. Choose "learn" → the widget shows `spec: writing…`, and lesson 1 appears with a question to the learner.
  5. `/tutor-lesson next` → an exercise in `learn/`; write a wrong solution → `check` fails twice → the step-back line; then a right solution → passes.
  6. `spec: ready` and `spec/tasks.md` has `## Milestone 1:`.

  Then once more as a learner naming Rust with self-score 7, through `/tutor-start check` on the `leap` task.
  Expected: every step as described; `settings.json` unchanged; no stray `pi` or `bwrap`.
- [ ] **Step 3: MCP lock-down live check** (Review Focus #5): a temp project with `.pi/mcp.json` naming a local stdio MCP server (a ~20-line node script exposing a `write_note` tool), started through the tutor's `pi` command line. Expected: `/mcp` lists the server, but a request asking the model to call `write_note` gets "tool not found" or the guard's block. Remove the temp project after.
- [ ] **Step 4: Run `/tutor-live`.** Expected: all lines pass.
- [ ] **Step 5: Commit.** `docs: onboarding conversation, lessons, context7`

## Self-review notes (author)

**Spec coverage:**
- §5 flow: Tasks 5–7.
- §6 conversation mechanism: Tasks 5 and 6.
- §7 lessons: Tasks 3, 4, 7, 8–12.
- §7a sources and licences: Tasks 4, 8–12.
- §7b FSRS: Tasks 2 and 7.
- §8 context7 and lock-down: Tasks 1 and 13.
- §10 calls: Tasks 3 and 6.
- §12 language validation: Task 6.
- Second-time check-in (Q9): Task 6.
- Background spec (Q10, Q22): Task 7.
- Early switch (Q23): Task 6.
- Level task (Q7, Q13, Q20): Tasks 3, 4 and 6.

**Builder's calls:** the exact `levelFrom` table, the converters' supported patterns, and the widget wording. All are stated as such in the relevant tasks.
