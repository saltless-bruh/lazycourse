# Learner-Session Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the six findings of the 2026-11-07 learner session so a complete beginner can start, run, and be checked
honestly, and reads clean replies.

**Architecture:** Lua side: `:TutorRun` becomes a visible terminal split; the tutor pane always takes typing. Pi side
(TypeScript): a first-run path, a shared shape contract for checks and the hidden solution with one retry, a reply
normalizer on every turn, a structural leak check in a new pure module, and recipe steps defined once.

**Tech Stack:** Neovim 0.12 Lua (plenary tests), Pi 1.3.0 extension in TypeScript (vitest), Python projects in the
bubblewrap sandbox.

**Spec:** `docs/superpowers/specs/2026-11-07-learner-session-fixes-design.md` (§1–§6).

## Global Constraints

- Nothing writes to stdout/stderr inside Pi; new Pi APIs are verified in `types.d.ts` and recorded in `pi-tutor/PI_SURFACE.md`.
- Editor paths stay inside the project root (realpath); `bash` stays off for the model.
- TDD: each step's test fails first. Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- The model never ticks, scores or moves a level or a recipe step (after this plan: not even `step_done`).
- Learner-facing copy fixed by the spec, verbatim: "New here? Tell me what you'd like to learn — or type /tutor-start.",
  "level not set", "ticked on trust: I could not build a check that works for <task>".
- Branch `learner-fixes` from main 97c6f93; ledger lines appended to `.superpowers/sdd/2026-10-26-habits-and-levels/progress.md`.
- Live check: re-run the learner session with screen-replay (`~/Documents/personal_Project/screen-replay`), nemotron,
  throwaway profile; `~/.pi/agent/settings.json` md5 stays 8dd33dde3b7fa10561c97ccfd40c1670.

## Review Focus

1. A program that prints, asks for input twice, then exits non-zero: the split shows both prompts, takes both inputs, and the tutor gets the traceback tail (Task 1).
2. The learner closes the run split (`:q`) while the program still runs: the job stops and the run is reported as stopped, never as a failed run (Task 1).
3. A first message that is off-topic ("what is LazyVim?") before onboarding: onboarding still starts, and the reply answers within it (Task 3).
4. The retry returns the same unconfirmable checks: the tick says "ticked on trust…", checks.md shows "0 of 2 checks confirmed" (Task 4).
5. A reply whose only code is one legitimate ```` ```markdown ```` line quote among prose keeps the quote (Task 5).

---

### Task 1: `:TutorRun` runs in a visible split (spec §1)

**Files:**
- Modify: `nvim-tutor/lua/tutor/init.lua` (`M.run`, `setup` command `TutorRun`)
- Create: `nvim-tutor/lua/tutor/runpane.lua`
- Test: `nvim-tutor/tests/init_spec.lua`

**Interfaces:**
- Produces: `require("tutor.runpane").start(argv: string|string[], cwd: string, on_exit: fun(code: integer, lines: string[]))`
  → `{ buf: integer, win: integer, job: integer }`; `.stop()`; `.running(): boolean`. `M.run("run")` uses it; `M.run("stop")` stops it.
- The `run_output` payload is unchanged in shape: `{ kind="run_output", cmd, code, stdout=table.concat(last 60 non-empty lines,"\n"), stderr="" }`.

- [ ] **Step 1: Write the failing tests** in `init_spec.lua`:
  - `":TutorRun shows the program in a split and takes typed input"`: run_cmd `{ "sh", "-c", 'printf "name? "; read x; printf "age? "; read y; echo "hi $x $y"; exit 3' }` (Review Focus 1); after `vim.cmd("TutorRun")` a window with a `terminal` buffer exists; `vim.fn.chansend(job, "bo\n")`, then `vim.fn.chansend(job, "9\n")`; payload arrives with `code == 3` and `stdout` matching `"name%? .*age%? .*hi bo 9"`.
  - `":TutorRun stop stops a running program, reported as stopped"`: run_cmd `{ "sh", "-c", "sleep 30" }`; `vim.cmd("TutorRun stop")`; no `run_output` payload is sent; `tutor.state.run_job == nil`.
  - `"a second :TutorRun restarts instead of refusing"`: two `:TutorRun` in a row; the first job is stopped, the second runs; no "already running" notice.
  - `"closing the split stops the program"` (Review Focus 2): `vim.api.nvim_win_close(win, true)` → job stopped, no payload.
  - `"TutorRun test can never hang"`: test_cmd `{ "sh", "-c", "read x" }` → payload arrives within 2 s (stdin is null: `read` fails at once).
- [ ] **Step 2: Run** `cd nvim-tutor && nvim --headless -u tests/minimal_init.lua -c "PlenaryBustedDirectory tests/ {minimal_init='tests/minimal_init.lua'}"` — the five tests FAIL.
- [ ] **Step 3: Implement `runpane.lua`**: `botright 12split`, new scratch buffer, `vim.fn.jobstart(argv, { term = true, cwd = cwd, on_exit = … })` inside `nvim_win_call`; on exit read `nvim_buf_get_lines(buf, 0, -1, false)`, drop trailing empty lines, keep the last 60, call `on_exit`; buffer-local `q` mapping closes the window only after exit; a `WinClosed` autocmd for that window calls `stop()`. `stop()` marks the job stopped (no `on_exit` callback) and `jobstop`s it. In `M.run`: kind `"stop"` → `runpane.stop()`; kind `"run"` → stop any running pane, then `runpane.start`; kind `"test"` keeps the hidden `jobstart` with `stdin = "null"` plus `vim.defer_fn(jobstop, 60000)`. Command completion: `{ "run", "test", "stop" }`.
- [ ] **Step 4: Run the Lua suite** — all pass (49 old + 5 new).
- [ ] **Step 5: Commit** `feat: :TutorRun runs in a visible split you can type into; stop and restart (learner session #1)`

### Task 2: The tutor pane always takes typing (spec §6, last sentence)

**Files:**
- Modify: `nvim-tutor/lua/tutor/term.lua` (where the pane buffer is created in `_spawn`)
- Test: `nvim-tutor/tests/term_spec.lua`

**Interfaces:** none new.

- [ ] **Step 1: Failing test** `"entering the pane by keyboard or mouse puts it in input mode"`: `t:show()`, `vim.cmd("wincmd p")` (to the editor), then `vim.api.nvim_set_current_win(t.win)`; after `vim.wait(200)`, `vim.api.nvim_get_mode().mode == "t"`.
- [ ] **Step 2: Run** the Lua suite — FAILS (mode `"n"`).
- [ ] **Step 3: Implement** a buffer-local `WinEnter`/`BufWinEnter` autocmd on the pane buffer that runs `vim.cmd.startinsert()` through `vim.schedule` when the job is running.
- [ ] **Step 4: Run** the Lua suite — passes.
- [ ] **Step 5: Commit** `fix: the tutor pane always takes typing when entered (learner session #6c, #10)`

### Task 3: The first run leads (spec §2)

**Files:**
- Modify: `pi-tutor/extensions/tutor/index.ts` (`session_start`, `before_agent_start` user path, `paint`), `pi-tutor/extensions/tutor/ui.ts` (`renderWidget`, `renderStatus`)
- Create: `pi-tutor/extensions/tutor/commands-note.ts`
- Test: `pi-tutor/test/smoke.test.ts`, `pi-tutor/test/ui.test.ts`

**Interfaces:**
- Produces: `COMMANDS_NOTE: string` (exported from `commands-note.ts`; the hidden context's command list); `TutorState.levelKnown?: boolean` in `ui.ts` (false → widget and status say "level not set").
- Consumes: `newOnboarding(language: string | null)` (`onboard.ts:40`), `saveOnboarding`, `kick` (index.ts).

- [ ] **Step 1: Failing tests:**
  - smoke `"a brand-new learner is welcomed and their first message starts onboarding"`: fresh profile, no project; after `session_start` a displayed message contains "New here? Tell me what you'd like to learn — or type /tutor-start."; `turn(…, "hi, I want to learn Python. I have never programmed before.")` → the `onboarding` setting exists with `stage` not `"done"` and the run's system prompt has the onboarding section.
  - smoke Review Focus 3: first message `"what is LazyVim?"` → onboarding also starts.
  - smoke `"a learner with a profile language is not welcomed"`: profile with `saveLanguage("python", 10, …)` → no welcome, no onboarding.
  - ui `"level not set until a level is known"`: `renderWidget({ state: "idle", connected: true, levelKnown: false })[0]` contains "level not set" and not "lvl"; same for `renderStatus`.
  - smoke `"every turn's hidden context lists the tutor's commands"`: the `tutor_editor` message content contains `:TutorRun` and `/tutor-start`.
- [ ] **Step 2: Run** `cd pi-tutor && npx vitest run test/smoke.test.ts test/ui.test.ts` — FAIL.
- [ ] **Step 3: Implement:** first-run = no onboarding record, no project, `profile.languages().length === 0`. At `session_start` send the welcome as a display-only custom message (`tutor_welcome`, added to the context hook's learner-only set). In `before_agent_start` for a user message on first run: `saveOnboarding(newOnboarding(null))`, `onboardingHere = true`, and continue as an onboarding turn with that message. `state.levelKnown = restoreLevel(ctx) !== null || project-level row exists || onboarding has a level`. Push `COMMANDS_NOTE` into the hidden context parts.
- [ ] **Step 4: Run** the full TS suite and typecheck — all pass.
- [ ] **Step 5: Commit** `feat: a first run welcomes the learner and starts onboarding from their first message (learner session #2)`

### Task 4: Checks and the hidden solution share a contract, with one retry (spec §3)

**Files:**
- Modify: `pi-tutor/extensions/tutor/check-job.ts` (`checksPrompt`, `referencePrompt`, `writeMilestoneChecks`), `pi-tutor/extensions/tutor/checks.ts` (`renderChecksMd`), `pi-tutor/extensions/tutor/index.ts` (tick `"self"` wording at the "none verified" branch), `pi-tutor/prompts/system/checks.md`, `pi-tutor/prompts/system/reference.md`
- Test: `pi-tutor/test/check-job.test.ts`, `pi-tutor/test/checks.test.ts`, `pi-tutor/test/episode.test.ts`

**Interfaces:**
- Produces: `SHAPE_RULE: string` (exported from `check-job.ts`, included in both prompts); `MilestoneChecks.confirmed: { trusted: number; total: number }`; `writeMilestoneChecks(…, { retry?: boolean })` (default `true`; the step-up passes `false`, it has its own `sure()`).

- [ ] **Step 1: Failing tests:**
  - check-job `"both prompts carry the same shape rule"`: `checksPrompt(i)` and `referencePrompt(i)` both contain `SHAPE_RULE`, and `SHAPE_RULE` says top-level names and "run lines only" for tasks with no function signature.
  - check-job `"a task left with no confirmed check is asked for once more"`: fake `complete` returns first `check P1.T1: isinstance(secret_number, int) == True`, a reference defining `secret_number` inside a function, then on the retry `run P1.T1: stdin "" -> stdout contains "…"`; result has a trusted check for P1.T1 and the retry prompt quoted the unconfirmed line.
  - check-job Review Focus 4: the retry returns the same unconfirmable line → no second retry; `confirmed` is `{ trusted: 0, total: 1 }`.
  - checks `renderChecksMd` shows `"0 of 2 checks confirmed"` under the milestone.
  - episode `"a task with no confirmed check ticks on trust, and says so"`: notice matches `/ticked on trust: I could not build a check that works for P2\.T2/`.
- [ ] **Step 2: Run** those files — FAIL.
- [ ] **Step 3: Implement:** after the first cross-check, collect tasks with no trusted check; if `retry`, ask once with: the unconfirmed lines, "they could not be confirmed on a working solution", and `SHAPE_RULE`; cross-check the new lines; merge. Count `confirmed`. Replace the "self-checked: none of its checks is verified" wording with the spec's copy.
- [ ] **Step 4: Run** the full TS suite — all pass.
- [ ] **Step 5: Commit** `fix: checks and the hidden solution share a shape rule; unconfirmed tasks get one retry; trust ticks say so (learner session #4)`

### Task 5: Clean replies on every turn; thinking hidden by default (spec §4)

**Files:**
- Modify: `pi-tutor/extensions/tutor/compliance.ts` (new `cleanReply`, `replyReminder`), `pi-tutor/extensions/tutor/thinking.ts`, `pi-tutor/extensions/tutor/index.ts` (markdown transformer, `message_end`), `pi-tutor/prompts/system/style.md:16`
- Test: `pi-tutor/test/compliance.test.ts`, `pi-tutor/test/thinking.test.ts`, `pi-tutor/test/smoke.test.ts`

**Interfaces:**
- Produces: `cleanReply(text: string): string` (compliance.ts) — removes an outer `markdown`/`md` fence around the whole reply and any paragraph or fenced block before the first bold part that mentions instruction / note / JSON / tutor-intake / "the learner"; leaves inner quotes.

- [ ] **Step 1: Failing tests** (use the real captured replies from the session; save them as fixtures under `pi-tutor/test/fixtures/replies/`):
  - compliance `"an outer markdown fence is unwrapped"` (frame 000015's reply) → output starts with `**What's happening**`, contains no "```markdown".
  - compliance `"reasoning before the first bold part is removed"` (frame 000062 / 000081 text with "The JSON note should be") → no "JSON note", no "tutor-intake", the real reply kept.
  - compliance Review Focus 5: prose plus one inner ```` ```markdown ```` line quote → unchanged.
  - thinking `"auto hides thinking on every band"`: `thinkingHidden("auto", "beginner")` is `true`; `"show"` shows.
  - compliance `"the reminder states no column count"`: `replyReminder("teach")` does not match `/\d+ characters/`.
  - smoke `"an onboarding reply is cleaned before display"`: the transformer output for an onboarding reply wrapped in ```` ```markdown ```` has no fence.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement** `cleanReply`; apply it in the markdown transformer to every `assistant` message before the existing steps, and in `message_end` to the stored text only after the onboarding intake note has been read. `thinkingHidden`: `mode !== "show"`, still `true` when `guarded`. `style.md:16` keeps the positive rule only: "Quote a single file line in its own ```markdown block; everything else is plain text." `replyReminder`: "keep diagrams narrow" without a number.
- [ ] **Step 4: Run** the full TS suite and the golden check if it touches style (`npm run golden` optional) — pass.
- [ ] **Step 5: Commit** `fix: replies are cleaned on every turn and thinking is hidden by default (learner session #5)`

### Task 6: Structural leak check (spec §5)

**Files:**
- Create: `pi-tutor/extensions/tutor/similarity.ts`
- Modify: `pi-tutor/extensions/tutor/compliance.ts` (`checkTurn` options), `pi-tutor/extensions/tutor/index.ts` (run setup: reference code and task terms)
- Test: `pi-tutor/test/similarity.test.ts`, `pi-tutor/test/compliance.test.ts`

**Interfaces:**
- Produces (similarity.ts): `normalizedTokens(code: string): string[]`; `windowOverlap(code: string, reference: string, n = 5): number` (share of the code's windows found in the reference, 0..1); `taskTerms(text: string): Set<string>`; `termHits(code: string, terms: Set<string>): number`.
- `checkTurn` gains `{ referenceCode?: string; taskTerms?: Set<string> }`; a fenced code block (not a quote, not a diagram) with `windowOverlap ≥ 0.6` or `termHits ≥ 2` adds `"own-code"` outside the fix step.

- [ ] **Step 1: Failing tests** with the session's exact cases:
  - similarity `"renaming does not hide a solution"`: `windowOverlap("secret = random.randint(1, 100)\nguess = int(input('Guess: '))", "secret_number = random.randint(1, 100)\nguess = int(input('Enter: '))") >= 0.6`.
  - similarity `"task terms catch the renamed task"`: `termHits("number = random.randint(1, 100)", taskTerms("P1.T1 Generate random secret number and store in variable"))` is `2` (number, random).
  - similarity `"a concept example on another domain passes"`: `termHits("die = random.randint(1, 6)", taskTerms(…P1.T1…))` is `1`.
  - similarity `"before a plan, the project's words count"`: the session's game-loop example vs `taskTerms("Number Guessing Game Prompt the user to guess a randomly generated number")` ≥ 2.
  - compliance `"checkTurn holds an 'unrelated' example that is the task"` → issues include `"own-code"` at step `teach`; and not at step `fix`.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement** the module (stopwords: Python/JS keywords and builtins, plus common English words; terms ≥ 4 letters, lowercased, split on `_`), the checkTurn branch, and in index.ts pass `referenceCode` (current milestone reference) and `taskTerms` from the open episode's task line, or from the onboarding project's title + summary when no tasks exist.
- [ ] **Step 4: Run** the full TS suite — pass.
- [ ] **Step 5: Commit** `fix: examples that rename the task's solution or use its words are held (learner session #3)`

### Task 7: Recipe steps defined once; plain-word skip; code-only advance (spec §6)

**Files:**
- Modify: `pi-tutor/extensions/tutor/workflow.ts` (`STEPS`, `ARTIFACT` → `STEP_SPECS`; the recipe note the model reads at `workflow.ts:49`), `pi-tutor/extensions/tutor/recipe-steps.ts`, `pi-tutor/extensions/tutor/index.ts` (`recipeStep`, `applyTurnJudgment`, `beginRecipe`)
- Test: `pi-tutor/test/workflow.test.ts`, `pi-tutor/test/recipe-steps.test.ts`, `pi-tutor/test/smoke.test.ts`

**Interfaces:**
- Produces: `STEP_SPECS: { name: string; learnerWrites: string; explain: string }[]` (workflow.ts; index 0 = Find with `learnerWrites` "say which task you are on and what it should do, in your own words"); `recipeIntent(text: string): "skip" | "explain" | null` (recipe-steps.ts).

- [ ] **Step 1: Failing tests:**
  - workflow `"each step is defined once and Find asks for the task in the learner's words"`: `STEP_SPECS[0].learnerWrites` contains "which task", and no spec text contains "blueprint" or "map" except step 5's name.
  - recipe-steps `recipeIntent`: "skip" / "can I just try writing the code?" / "just let me code" → `"skip"`; "I don't know what a map diagram is" / "what is a step?" → `"explain"`; "the first task is P1.T1" → `null`.
  - smoke `"saying 'can I just try writing the code' skips the step"`: recipe at step 1 → after that message the step is 2.
  - smoke `"the model's step_done no longer moves the recipe"`: a judged reply with `step_done: true` and no learner artifact → step unchanged.
  - smoke `"the kickoff says how to skip and stop"`: the kickoff message contains "skip" and "/tutor-plan off".
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement:** replace `ARTIFACT` uses with `STEP_SPECS`; in `recipeStep` check `recipeIntent` first (skip → advance without counting it as the learner's own; explain → a hidden note for this turn: "Explain step <name> in one sentence: <explain>; then ask for it again"); remove `advanceWorkflow(j.step_done …)` from `applyTurnJudgment` (Build still ends on a tick).
- [ ] **Step 4: Run** the full TS suite — pass.
- [ ] **Step 5: Commit** `fix: recipe steps explain themselves, skip in plain words, and move only on the learner's work (learner session #6)`

### Task 8: Live learner session again, docs, review, merge

**Files:**
- Modify: `README.md` (`:TutorRun` split, first run, recipe skip, thinking default), `docs/superpowers/reviews/2026-11-07-learner-session/report.md` (a "Re-run" section)

- [ ] **Step 1:** Re-run the learner session with screen-replay exactly as on 2026-11-07 (beginner, Python, nemotron, `/tmp` profile and project; no `/tutor-start` typed by hand). Pass when: the welcome shows; onboarding starts from the first message; the guessing game runs in the split and takes a typed guess; P1/P2 tick on a confirmed check or say "ticked on trust"; no raw fence or reasoning shows; "skip" leaves the recipe step.
- [ ] **Step 2:** Update README and the report's re-run section with what the screenshots show.
- [ ] **Step 3:** Independent review of `main..learner-fixes` (pane-reviewer); fix findings with tests.
- [ ] **Step 4:** Both suites and typecheck pass; settings md5 unchanged; merge to main and push.
