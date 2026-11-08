# Wayfinding and First-Run Tour Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The tutor always says where the learner is and the one next thing to do; a single `:TutorTour` teaches Neovim and the tutor; the machinery stops talking in the learner's voice; four re-run findings are fixed.

**Architecture:** One JSON command list (`pi-tutor/commands.json`) is read by TypeScript and Lua and feeds every surface. A pure TS module (`wayfinding.ts`) maps the extension's state to a `Where` value, from which the next-step line, the session card, the model's command note and the help panel's "now" section are derived. The tour runs in Lua (steps, checks, practice files) and reports progress to Pi with a new `tour` payload; Pi only shows cards and answers questions.

**Tech Stack:** TypeScript (vitest, `npm test`, `npm run typecheck` in `pi-tutor/`), Neovim Lua (plenary: `cd nvim-tutor && nvim --headless -u tests/minimal_init.lua -c "PlenaryBustedDirectory tests/ {minimal_init='tests/minimal_init.lua'}"`), Pi 1.3.0 extension API, Neovim 0.12.

**Spec:** `docs/superpowers/specs/2026-11-08-wayfinding-and-tour-design.md` (branch `wayfinding`, 03a2cc1 + the help-tab and first-run-hint edits committed in Task 0).

## Global Constraints

- Nothing writes to stdout/stderr inside Pi (no `console.log`).
- Every new Pi API / Neovim RPC call: verify in `pi-tutor/node_modules/@earendil-works/pi-coding-agent/dist/core/extensions/types.d.ts` and add to `pi-tutor/PI_SURFACE.md` (skill `pi-surface-check`). New ones in this plan: `pi.registerMessageRenderer` (types.d.ts:1250), `BeforeAgentStartCustomEvent.message` (types.d.ts:736), `Text` from `@earendil-works/pi-tui`, `nvim_set_var`, Lua `require("tutor.help").open`, `require("tutor.tour").event`.
- Pi never reads a path outside the project root; tour checks run in Lua and Pi receives only step results.
- The model never moves the level, passes a test, ticks a task, passes a tour step, or picks a title against the learner's idea.
- `bash` stays off for the tutor model. `~/.pi/agent/settings.json` stays unchanged (md5 8dd33dde3b7fa10561c97ccfd40c1670).
- TDD: failing test first, watch it fail. Run the suite that owns the file after each change.
- Never commit `agentdb.rvf*`, `ruvector.db`, `.claude/proven-config*`, `docs/superpowers/reviews/`.
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- `~/.config/nvim/lua/plugins/tutor.lua` is changed only in Task 9, after showing the author the diff.
- Every surface that names a command says where it is typed: `:Tutor…` = editor, `/tutor-…` = tutor pane.

## Review Focus

1. **A nudge queued while the model is still answering** (stuck signal at index.ts:375, recipe kickoff at :1113, step move at :1089 are sent mid-run today): after the switch to hidden messages it must still reach the model exactly once and never be lost. Test in Task 4: "a nudge sent while busy is delivered once when idle".
2. **A learner's typed message while the tour runs on a first-run profile** must not start onboarding (index.ts:578 treats it as the onboarding's first answer). Test in Task 11: "a question during the tour is no onboarding answer".
3. **README buffer with unsaved edits when the plan job finishes**: no reload, no W12 prompt, a notice. Test in Task 6: "a modified README buffer is not reloaded".
4. **`nvim COMMIT_EDITMSG` from a project folder** (git's editor inside a project) must not open Pi. Test in Task 9: `should_autostart({ "COMMIT_EDITMSG" }, project_dir, …) == false`.
5. **An idea that is a whole sentence with punctuation or non-ASCII** ("I want to make a número guessing game!") becomes a short title and a valid folder slug. Test in Task 7: `ideaTitle` table row.

---

### Task 0: Commit the spec edits

- [ ] **Step 1:** `git add docs/superpowers/specs/2026-11-08-wayfinding-and-tour-design.md docs/superpowers/plans/2026-11-08-wayfinding-and-tour.md && git commit -m "spec+plan: help opens in its own tab; first-run hint outside lazycourse; implementation plan"` (with the Co-Authored-By line).

### Task 1: One command list, with a drift test

**Files:**
- Create: `pi-tutor/commands.json`, `pi-tutor/extensions/tutor/commands.ts`, `pi-tutor/test/commands.test.ts`, `nvim-tutor/lua/tutor/commands.lua`, `nvim-tutor/tests/commands_spec.lua`
- Modify: `pi-tutor/extensions/tutor/index.ts` (every `registerCommand` description), `pi-tutor/extensions/tutor/commands-note.ts` (delete `COMMANDS_NOTE`; `WELCOME` stays until Task 3)

**Interfaces:**
- Produces (JSON entry): `{ "name": string, "where": "editor"|"pane"|"key", "twin"?: string, "args"?: string, "for": string, "help": string, "group": "start"|"moving"|"coding"|"paths"|"record", "when": Where[] | ["always"] }`. `for` is one line (card, next-step), `help` is the full explanation (help tab). `twin` links `:TutorDone` ↔ `/tutor-done`.
- Produces (TS): `loadCommands(): Command[]`; `describe(name: string): string` (the `for` text; throws on unknown name, so a typo fails at load); `commandsFor(w: Where): Command[]`; `commandNote(w: Where): string` (the model's note, state-aware, replaces `COMMANDS_NOTE` in `before_agent_start`).
- Produces (Lua): `require("tutor.commands").load() -> table[]`, `.for_where(where) -> table[]`. The JSON path: `opts.commands_path` defaulting to `<plugin dir>/../pi-tutor/commands.json` (resolve the plugin dir from `debug.getinfo(1, "S").source`).
- `Where` is defined in Task 2; in this task use the string values listed there.

- [ ] **Step 1: failing tests.**
  - `commands.test.ts` "every Pi command is in the list and the list names no unknown one": boot `fakePi()`, take `Object.keys(commands)`; expect the set equal to the list's `where:"pane"` names without the leading `/` (the list also holds Pi's built-in `/reload`; exclude names marked `"builtin": true`).
  - "every description comes from the list": for each registered command, `def.description === describe("/" + name)`.
  - "commandNote names where each command is typed": `commandNote("coding")` contains `:TutorRun` and the word `editor`, and `/tutor-plan` with `tutor pane`.
  - `commands_spec.lua` "every :Tutor command and tutor key is in the list": after `require("tutor").setup({})`, the `Tutor*` names from `nvim_get_commands({})` equal the list's `where=="editor"` names; `<leader>te` (and from Task 9 `<leader>tt`, `<leader>tr`, `<leader>t?`) appear as `where=="key"` entries.
- [ ] **Step 2:** run both suites; expect failures (module not found).
- [ ] **Step 3:** write `commands.json` with every command in the 2026-11-08 inventory: 20 Pi commands + `/reload` (builtin) + `/tutor-help` (Task 8), 19 `:Tutor*` + `:TutorTour`, `:TutorHelp`, keys `<leader>tt`, `<leader>tr`, `<leader>te`, `<leader>t?`, right-click "Ask tutor about this error", `<Esc><Esc>` (pane), `<C-w>h`, `q` (run split). Every entry needs `for` and `help` in plain beginner words. Implement `commands.ts` (read the file with `readFileSync` next to the package, as `packs.ts` does with `import.meta.url`) and `commands.lua`. Point every `registerCommand` description at `describe(...)`. Replace the `COMMANDS_NOTE` section with `commandNote(whereNow())`; until Task 2 exists, `whereNow()` may return `"project"`.
- [ ] **Step 4:** both suites and `npm run typecheck` pass.
- [ ] **Step 5:** commit "feat: one command list feeds Pi descriptions and the model's note; drift tests for Pi and Neovim".

### Task 2: `Where` and the next-step line

**Files:**
- Create: `pi-tutor/extensions/tutor/wayfinding.ts`, `pi-tutor/test/wayfinding.test.ts`
- Modify: `pi-tutor/extensions/tutor/ui.ts` (`TutorState.next?: string`, `renderWidget` third line), `pi-tutor/test/ui.test.ts`, `pi-tutor/extensions/tutor/index.ts` (`paint()` sets `state.next`; `whereNow()` real)

**Interfaces:**
- Produces: `type Where = "fresh" | "tour" | "onboarding-talk" | "level-task" | "onboarding-dialog" | "project-elsewhere" | "onboarding-paused" | "plan-writing" | "plan-failed" | "project" | "recipe" | "stuck" | "checks-pass" | "lesson" | "exam" | "step-up"`.
- Produces: `interface WayInput { firstRun: boolean; tour: { step: number; total: number; title: string } | null; onboarding: { stage: Stage; paused: boolean; levelTaskOpen: boolean; dialog: boolean; elsewhere: string | null } | null; spec: "writing" | "failed" | null; project: boolean; recipe: { task: string; step: number; action: string } | null; stuck: boolean; passingTask: string | null; lesson: boolean; exam: boolean; stepUp: boolean }`.
- Produces: `whereOf(i: WayInput): Where` (precedence: tour > exam > step-up > lesson > onboarding states > spec > recipe > checks-pass > stuck > project > fresh); `nextStep(i: WayInput): string` (starts with `next: `; every command it names exists in the list, through `describe`).
- `passingTask`: the task whose checks last passed and is not ticked (from the existing run_passed / `/tutor-done` state in index.ts).

- [ ] **Step 1: failing tests.** `wayfinding.test.ts` "next step per state" — `it.each` over one `WayInput` per `Where`, asserting `whereOf` and a fragment of `nextStep`:
  fresh → `:TutorTour`; level-task → `/tutor-start check`; project-elsewhere `"/home/x/p"` → `/home/x/p`; onboarding-paused → `/tutor-start`; plan-failed → `/tutor-start spec`; project → `/tutor-plan`; recipe step 2 → `skip`; stuck → `:TutorRun test` and `<leader>te`; checks-pass `P1.T2` → `:TutorDone P1.T2`; tour 4/18 "Delete with x" → `4/18`.
  "every command nextStep names is in the list": extract `/tutor-[\w-]+|:Tutor\w+|<leader>\S+` from every row's output; each passes `describe`.
  `ui.test.ts` "a next step is a clipped third line": `renderWidget({ state: "clean", connected: true, next: "next: " + "x".repeat(80) })` has length 3 and line 3 width ≤ 44; without `next`, length 2.
- [ ] **Step 2:** run; fail.
- [ ] **Step 3:** implement `wayfinding.ts`; in `index.ts` add `wayInput(): WayInput` from existing state (`firstRun()`, `onboarding`, `onboardingActive()`, `specStatus`, `project`, `workflow`, `episode`, `lesson`, `exam`, `stepUp`, tour state from Task 11 — `null` until then) and set `state.next = nextStep(wayInput())` in `paint()`.
- [ ] **Step 4:** pass; typecheck.
- [ ] **Step 5:** commit "feat: the widget's third line says the next step for where the learner is".

### Task 3: Session card replaces the welcome

**Files:**
- Modify: `pi-tutor/extensions/tutor/wayfinding.ts` (`sessionCard`), `pi-tutor/extensions/tutor/index.ts:481` (welcome) and `:1042` (`LEARNER_ONLY`), `pi-tutor/extensions/tutor/commands-note.ts` (remove `WELCOME`), `pi-tutor/test/smoke.test.ts` (tests that expect `tutor_welcome`), `pi-tutor/test/wayfinding.test.ts`, `pi-tutor/PI_SURFACE.md`

**Interfaces:**
- Produces: `sessionCard(i: WayInput, info: { project?: string; task?: string; level?: number; tourOffered: boolean }): string` — exactly three lines: `Where you are: …`, `Next: …` (the `nextStep` text without `next: `), `Help: <leader>t? in the editor · /tutor-help in this pane · :TutorTour`. On `fresh` with `tourOffered` the Where line reads `new here — :TutorTour teaches Neovim and the tutor, or just tell me what you'd like to learn`.
- Custom type `tutor_card`, in `LEARNER_ONLY`; `pi.registerMessageRenderer("tutor_card", (m) => new Text(String(m.content), 1, 0))`.

- [ ] **Step 1: failing tests.** `wayfinding.test.ts` "the card has three lines and says where help is" (fresh, onboarding-talk, project rows). `smoke.test.ts`: change the first-run welcome test to "every session opens with a card the model never sees": session_start on an empty profile → `messages` has one `{customType:"tutor_card", display:true}` with `triggerTurn:false`; a second boot on a profile with a project → a card naming the project; the `context` handler drops `tutor_card`.
- [ ] **Step 2:** run; fail.
- [ ] **Step 3:** send the card at session_start for every state (replacing the `firstRun()`-only welcome), register the renderer. `tourOffered` = `firstRun()` and profile setting `tour` is unset (Task 11 sets it). Add the two API lines to `PI_SURFACE.md`.
- [ ] **Step 4:** pass; typecheck.
- [ ] **Step 5:** commit "feat: a three-line session card on every session, never sent to the model".

### Task 4: Hidden `[tutor]` nudges

**Files:**
- Modify: `pi-tutor/extensions/tutor/index.ts` (lines 375, 1089, 1111-1113, 2244-2251, 2475, 2535, and `before_agent_start` ~575-600), `pi-tutor/test/fake-pi.ts` (helper), `pi-tutor/test/smoke.test.ts`, `pi-tutor/test/episode.test.ts`, `pi-tutor/test/card.test.ts` (assertions that read `sent` for `[tutor]` text)

**Interfaces:**
- Produces: `function nudge(ctx: ExtensionContext, text: string): void` in index.ts — `text` keeps its `[tutor] ` prefix; waits for idle like `sendWhenIdle` (same 50 ms / 600 tries), then `pi.sendMessage({ customType: "tutor_nudge", content: text, display: false }, { triggerTurn: true })`. `sendWhenIdle` and every `pi.sendUserMessage(\`${TUTOR_PREFIX}…\`)` go through it. Learner-typed text forwarded by `:TutorArchitect` (line 1062) stays `sendUserMessage`.
- `before_agent_start`: `const prompt = event.messageType === "user" ? event.prompt : event.message.customType === "tutor_nudge" ? String(event.message.content) : "";` — used everywhere `prompt` is used today (including the onboarding branch's `run.prompt`), so every `startsWith(TUTOR_PREFIX)` check, `answersRun` (line 610) and `compliance.ts` keep working unchanged.
- `fake-pi.ts`: `nudges(fp) => fp.messages.filter(m => m.message.customType === "tutor_nudge").map(m => m.message.content)`.

- [ ] **Step 1: failing tests.** smoke "a nudge is a hidden message that starts a turn": `/tutor-plan P1.T1` → no `sent` entry; one `tutor_nudge` with `display:false`, `triggerTurn:true`, content matching the existing kickoff regex (smoke.test.ts:595). "a nudge sent while busy is delivered once when idle" (Review Focus 1): set `busy.value = true`, trigger a failed run payload, advance timers 200 ms → no nudge; set busy false, advance → exactly one. "a nudge-started turn is no learner message": fire `before_agent_start` with `{ messageType: "custom", message: { customType: "tutor_nudge", content: "[tutor] stuck signal: run failed …" } }` → no chat episode opens, the recipe does not move, `answersRun` path taken (the existing run-failed reply test, re-pointed). Re-point the existing `sent`-based assertions to `nudges(fp)`.
- [ ] **Step 2:** run; fail.
- [ ] **Step 3:** implement; record `BeforeAgentStartCustomEvent.message` in `PI_SURFACE.md`.
- [ ] **Step 4:** full TS suite + typecheck pass.
- [ ] **Step 5:** commit "fix: the tutor's own nudges are hidden messages, not the learner's voice (re-run topic 1)".

### Task 5: The level shows as soon as it is accepted (topic 3)

**Files:** Modify `pi-tutor/extensions/tutor/index.ts` (read step ~2316-2326; `levelKnown` at :480); Test `pi-tutor/test/smoke.test.ts`

- [ ] **Step 1: failing tests.** "accepting the read sets the level at once": drive onboarding to `stage:"read", presented:"read"`, script `confirm → true`; after `onboardStep`, widget line 1 contains `lvl <n>` and not `level not set`, before any project exists. Same with confirm false + input `"30"` → `lvl 30`. "a resumed onboarding with level null still says level not set" (`newOnboarding` has `level: null`; `:480` compares `=== undefined`).
- [ ] **Step 2:** fail.
- [ ] **Step 3:** after the dialog, call `setLevel(level)` and `paint()`; write `profile.setLevel` only when `profile.language(lang)` exists (createProject still writes it for a new language). Fix `:480` to treat `null` as unknown.
- [ ] **Step 4:** pass. **Step 5:** commit "fix: the accepted level shows at once (re-run topic 3)".

### Task 6: Open buffers follow the plan job (topic 4)

**Files:** Modify `pi-tutor/extensions/tutor/index.ts` (spec job after `writeScaffold(…, { existing: true })`, ~2494); Test `pi-tutor/test/smoke.test.ts` (near :2190)

**Interfaces:** Consumes `link.isModified(path): Promise<boolean>`, `link.reloadFile(path): Promise<void>` (nvim.ts:215-224).

- [ ] **Step 1: failing tests.** With a fake link recording calls: "after the plan job, open README and tasks buffers reload": `reloadFile` called with `<root>/README.md` and `<root>/spec/tasks.md`. "a modified README buffer is not reloaded" (Review Focus 3): `isModified` true for README → no `reloadFile` for it, one notify containing `README.md` and `:e`.
- [ ] **Step 2:** fail.
- [ ] **Step 3:** after a successful write and only if `generation === mine`, for each of the two files: modified → notify "README.md changed on disk: :e! to see the plan's version (your edits would be lost)"; else `reloadFile`. Keep the existing catch. Verify in the headless test (`nvim.test.ts`) that `checktime` on an unmodified, loaded buffer reloads with no prompt; set `autoread` locally in the Lua snippet if it does not.
- [ ] **Step 4:** pass. **Step 5:** commit "fix: the README and task list in the editor show the plan once it is written (re-run topic 4)".

### Task 7: The suggestion keeps the learner's idea (topic 2)

**Files:** Modify `pi-tutor/extensions/tutor/start.ts` (`suggestOne`), `pi-tutor/extensions/tutor/suggest.ts` (prompt input), `pi-tutor/prompts/suggest.md` (or wherever `systemText("suggest")` reads), `pi-tutor/extensions/tutor/index.ts` (~2328-2340); Tests `pi-tutor/test/start.test.ts`, `pi-tutor/test/suggest.test.ts`

**Interfaces:**
- Produces: `ideaTitle(idea: string): string` — strips lead-ins (`i want to (make|build|write|create)`, `make`, `build`, `a`, `an`), trailing punctuation; cuts at a word boundary ≤ 40 chars; Title Case; keeps non-ASCII letters (the folder slug comes from the existing `defaultProjectDir`).
- Produces: `tiedToIdea(text: string, idea: string): boolean` — true when `text` shares at least one content word (length ≥ 4, not a stop word) with `idea`, case-insensitive.
- Model reply gains `fits: boolean` and, when `fits` is false, `smaller: { title, summary, concepts }` (a smaller version of the same idea).
- `suggestOne` input gains `idea: string | null` (from `o.fields.idea` while the idea has not been rejected); returns `Suggestion & { tooBig?: boolean }`.

- [ ] **Step 1: failing tests.** `start.test.ts` `ideaTitle` table: `"a number guessing game"` → `"Number Guessing Game"`; `"I want to make a número guessing game!"` → `"Número Guessing Game"` (Review Focus 5) and `defaultProjectDir(home,"python",that)` is a valid path segment; a 120-char idea → ≤ 40 chars, no cut word. `tiedToIdea` table. `suggestOne` with a fake model: fits → `title === ideaTitle(idea)` even when the model returns "Todo List CLI"; not fits with a tied smaller → `tooBig: true`, title the model's smaller title; not fits with an untied smaller → one re-ask; untied again → throws an Error whose message says the idea could not be scaled (the caller's existing catch shows it). No idea → today's behaviour.
- [ ] **Step 2:** fail.
- [ ] **Step 3:** implement; in index.ts, a `tooBig` suggestion's kick text says the idea is too big for level N and offers the smaller version; "Show me something else" sets an `ideaDropped` flag on the onboarding so later asks pass `idea: null`.
- [ ] **Step 4:** pass. **Step 5:** commit "fix: the project is the learner's idea, or a smaller version of it (re-run topic 2)".

### Task 8: Help in its own tab

**Files:**
- Create: `nvim-tutor/lua/tutor/help.lua`, `nvim-tutor/tests/help_spec.lua`
- Modify: `nvim-tutor/lua/tutor/init.lua` (`:TutorHelp`), `pi-tutor/extensions/tutor/nvim.ts` (`openHelp`, `setNow`), `pi-tutor/extensions/tutor/index.ts` (`/tutor-help`; `paint()` pushes `now`), `pi-tutor/test/nvim.test.ts`, `pi-tutor/PI_SURFACE.md`

**Interfaces:**
- Produces (Lua): `require("tutor.help").open() -> integer` (the tab's buffer). Reads `vim.g.tutor_now` = `{ where = string, next = string }` (may be nil: then no "now" section). Layout: "Now: <next>", then the commands for `where`; then sections "In the editor", "In the tutor pane", "Moving around", each entry `name args` with its `help` text wrapped under it. A `nofile`, `nomodifiable` buffer in `tabnew`; buffer-local `q` closes the tab. A second `open()` while the tab exists switches to it.
- Produces (TS): `link.openHelp(): Promise<void>` (`raw.lua('require("tutor.help").open()')`); `link.setNow(now: { where: Where; next: string }): Promise<void>` (`nvim_set_var("tutor_now", now)`, called from `paint()` only when the value changed).

- [ ] **Step 1: failing tests.** `help_spec.lua`: "open makes one tab with all three sections and q closes it" (tab count +1, buffer contains `In the editor`, `In the tutor pane`, `:TutorDone`, `/tutor-done`; `q` → tab count back); "with tutor_now it starts with the next step"; "opening twice keeps one tab". `nvim.test.ts` (real headless Neovim): `openHelp()` adds a tab; `setNow` sets `vim.g.tutor_now`. smoke: `/tutor-help` calls `openHelp`; without a link it notifies "help opens in Neovim: :TutorHelp".
- [ ] **Step 2:** fail. **Step 3:** implement; register `:TutorHelp`. **Step 4:** both suites pass. **Step 5:** commit "feat: help opens in its own tab from :TutorHelp, <leader>t? or /tutor-help".

### Task 9: Keys in the plugin, auto-open, first-run hint

**Files:**
- Modify: `nvim-tutor/lua/tutor/init.lua` (`setup`), `nvim-tutor/tests/init_spec.lua`, `pi-tutor/extensions/tutor/profile.ts` or `start.ts` (projects file), `pi-tutor/test/profile.test.ts`, `README.md` (setup snippet + first steps), `~/.config/nvim/lua/plugins/tutor.lua` (out of repo; diff shown to the author first)

**Interfaces:**
- Produces (TS): `writeProjectsFile(profile: Profile, path = join(dirname(defaultProfilePath()), "projects.json")): void` — JSON array of project paths; called at session_start and after `createProject`. Skipped when the profile path is `:memory:`.
- Produces (Lua): `M.should_autostart(argv: string[], cwd: string, projects: string[], lazycourse: string) -> boolean` — false if any argv entry is a file (not a directory), false in headless (`#vim.api.nvim_list_uis() == 0`, checked by the caller), true only if `cwd` (realpath) equals or is under a project path or `lazycourse`. `opts.auto_open` (default `true`) turns it off. `opts.projects_file` defaults to `stdpath("data")/../nvim-tutor/projects.json`; `opts.profile_file` to `.../nvim-tutor/profile.sqlite`.
- Keys set in `setup()`: `<leader>tt` (`:Tutor`), `<leader>tr` (`:TutorRun`), `<leader>te` (exists), `<leader>t?` (`:TutorHelp`), each with a `desc` from the command list.
- First-run hint: on `VimEnter`, if not autostarting, the profile file is absent and the UI is attached → `vim.notify("[tutor] New to lazycourse? :TutorTour teaches Neovim and the tutor")`.

- [ ] **Step 1: failing tests.** `init_spec.lua` `should_autostart` table: `({}, project)` true; `({}, lazycourse.."/x")` true; `({}, home)` false; `({ "COMMIT_EDITMSG" }, project)` false (Review Focus 4); `({ project }, home)` (a directory arg) → true only if that directory is a project (resolve cwd from the dir arg). "setup sets the four tutor keys". "the first-run hint shows only without a profile file" (use `capture_notes`). `profile.test.ts`: `writeProjectsFile` writes the paths of all projects.
- [ ] **Step 2:** fail. **Step 3:** implement; `VimEnter` autocmd in `setup()` opens the pane when `should_autostart`. Update the README snippet: `lazy = false`, no `keys`, `opts = {}`, the `cmd` list removed.
- [ ] **Step 4:** both suites pass.
- [ ] **Step 5:** show the author the `tutor.lua` diff (lazy = false; `keys` and `cmd` removed). Write it only after their OK.
- [ ] **Step 6:** commit (repo files only) "feat: tutor keys live in the plugin; nvim in a project or ~/lazycourse opens the tutor; a first-run hint elsewhere".

### Task 10: Tour engine and Part 1 (Neovim)

**Files:**
- Create: `nvim-tutor/lua/tutor/tour.lua`, `nvim-tutor/tour/steps.lua`, `nvim-tutor/tour/LICENSE-vim.txt` (the Vim license notice for text derived from `vim-01/02-beginner.tutor`), `nvim-tutor/tests/tour_spec.lua`
- Modify: `nvim-tutor/lua/tutor/init.lua` (`:TutorTour [restart|off]`), `pi-tutor/commands.json` (already has `:TutorTour` from Task 1)

**Interfaces:**
- Step data: `{ id = string, part = 1|2, title = string, text = string[] (lines shown in tour.txt), check = { kind = "lines", expect = { [relative_line] = string } } | { kind = "event", name = string } }`.
- `require("tutor.tour")`: `start(opts?: { restart?: boolean })` — creates `~/lazycourse/.tour/` if missing, writes `tour.txt` (all step texts with practice lines, steps marked `step N/M`), `hello.lua` and a `README.md` with front matter `run: nvim -l hello.lua` (for Part 2), saves state, then `require("tutor").switch(dir, "tour.txt")` and jumps to the current step; `stop()`; `event(name: string)` (Part 2 events; also called by Pi); `state() -> { step, total, status = "running"|"done"|"off" }` read from `~/lazycourse/.tour/state.json`.
- Each pass sends `require("tutor").notify_tutor({ kind = "tour", step = n, total = m, title = t, status = s })`.
- Line checks: on `TextChanged`/`TextChangedI` in `tour.txt`, compare the step's expected lines; ✓/✗ signs via an own extmark namespace (`tutor.tour`).

- [ ] **Step 1: failing tests.** `tour_spec.lua` (set `HOME` to a temp dir): "start writes the practice folder and opens step 1"; "fixing the step-1 line passes it, shows ✓ and sends a tour payload" (use `M._notify_override`); "the step resumes after stop and start"; "restart starts at step 1"; "off stops and sends status off"; "a step whose line is still wrong shows ✗ and does not pass".
- [ ] **Step 2:** fail.
- [ ] **Step 3:** implement the engine and Part 1 steps (about 10): insert/normal mode, h j k l and w b, `x`, `dw`/`dd`, `u`/`<C-r>`, `i`/`a`/`o`, `:w`, `/search`, `:e <file>` and LazyVim's `<leader><space>` picker, `<C-w>` window moves. Text cut down and reworded from Neovim's lessons, plain and short.
- [ ] **Step 4:** pass. **Step 5:** commit "feat: :TutorTour part 1 — Neovim basics checked in the editor, from Neovim's own lessons".

### Task 11: Tour Part 2 (the tutor) and Pi's side

**Files:**
- Modify: `nvim-tutor/tour/steps.lua`, `nvim-tutor/lua/tutor/tour.lua`, `nvim-tutor/tests/tour_spec.lua`, `pi-tutor/extensions/tutor/nvim.ts` (`TutorPayload` gains `{ kind: "tour"; step: number; total: number; title: string; status: "running"|"done"|"off" }`; `link.tourEvent(name)`), `pi-tutor/extensions/tutor/index.ts` (payload case, tour prompt section, first-message guard, `wayInput().tour`, setting `tour`), `pi-tutor/prompts/tour.md` (new prompt section), `pi-tutor/test/smoke.test.ts`

**Interfaces:**
- Part 2 event names (Lua autocmds unless noted): `pane_open` (TermEnter in the tutor term buffer), `pane_left` (TermLeave there), `editor_back` (WinEnter on a non-terminal window after `pane_left`), `asked` (Pi: a learner message while the tour runs → `link.tourEvent("asked")`), `run_done` (run split job exit), `run_closed` (run split WinClosed), `asked_error` (`<leader>te` used: `M.ask_error` calls `tour.event`), `help_opened` (`help.open`). The ask-error step sets its own diagnostic on a line of `hello.lua` (`vim.diagnostic.set` with the `tutor.tour` namespace), so it never depends on a language server.
- Pi: on a `tour` payload — set profile setting `tour` to `"seen"` (first payload), keep `tourState` for `wayInput()`, post a `tutor_card`-type message `tour <step>/<total>: <title>` (LEARNER_ONLY), `paint()`. While `status === "running"`, `before_agent_start` adds section `tutor_tour` (from `prompts/tour.md`: answer questions about the current step briefly; never say a step is done) and skips the first-run onboarding start at :578 (Review Focus 2). On `status: "done"` the card says "tour done — tell me what you'd like to learn".

- [ ] **Step 1: failing tests.** `tour_spec.lua`: each Part 2 event passes only its own step; "the ask-error step works with no language server". smoke: "a tour payload records the offer as seen and paints the tour step" (widget line 3 `4/18`); "a question during the tour is no onboarding answer" (first-run profile, tour running, `before_agent_start` user message → `onboarding` still null, section `tutor_tour` set); "the learner's message during the tour sends asked to Neovim"; "tour done hands over to onboarding" (next message starts onboarding as today).
- [ ] **Step 2:** fail. **Step 3:** implement Part 2 (about 8 steps): open the pane `<leader>tt`, type a question, `<Esc><Esc>`, `<C-w>h` back, `:TutorRun` (types a name into hello.lua's prompt), `q` closes the run split, `<leader>te`, `<leader>t?` / the next-step line, then the hand-off.
- [ ] **Step 4:** both suites + typecheck pass. **Step 5:** commit "feat: :TutorTour part 2 — the pane, running code and asking, with Pi answering questions".

### Task 12: Pane cut off after the folder switch (topic 5)

**Files:** depends on the cause; likely `nvim-tutor/lua/tutor/term.lua` or `init.lua` (`M.switch`), with a test in `nvim-tutor/tests/term_spec.lua`.

- [ ] **Step 1:** reproduce with screen-replay (`sr`, see memory `reference-screen-replay`): fresh profile, onboarding to "Start this project", watch the frames after `switch`. Save the frames that show the cut in the scratchpad; record the cause in the commit message.
- [ ] **Step 2:** write a failing test for the cause found (e.g. "after restart the job gets the pane's final width": `jobresize` called with the window width once `WinResized`/`VimResized` settles).
- [ ] **Step 3:** fix the cause. If the cause is inside Pi itself, stop and report to the author instead of working around it.
- [ ] **Step 4:** Lua suite passes; re-run the `sr` replay; no cut frame. **Step 5:** commit "fix: the tutor pane draws at its final width after the folder switch (re-run topic 5)".

### Task 13: Docs, live checks, review

- [ ] **Step 1:** README: setup snippet (Task 9), first steps (`mkdir -p ~/lazycourse && cd ~/lazycourse && nvim`, or `:TutorTour` anywhere), the next-step line, the card, help (`<leader>t?`, `:TutorHelp`, `/tutor-help`), `:TutorTour`; the command table either generated from `commands.json` or checked by a test in `commands.test.ts` ("the README names every command in the list").
- [ ] **Step 2:** live run with nemotron in the real config from an empty profile (`PI_TUTOR_PROFILE` pointed at a temp file, real `settings.json` untouched): `nvim` in `~` → hint only; `:TutorTour` → full tour → hand-off; idea "a number guessing game" kept; "a 3D game engine" at level 5 → smaller version; level shows on "Yes"; README buffer shows `run:`; no `[tutor] …` line appears as a learner message — check whether Pi's "Follow-up:" line still shows hidden queued messages and report it if it does; no cut pane. Second run on an established profile: card and next-step line match; `<leader>t?` tab shows all sections.
- [ ] **Step 3:** check `md5sum ~/.pi/agent/settings.json` equals 8dd33dde3b7fa10561c97ccfd40c1670.
- [ ] **Step 4:** pane-reviewer on the branch; fix Critical/Important findings with tests.
- [ ] **Step 5:** commit docs; merge to main after the author's OK.
