# Ask-first stuck help Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Editor signals (pause, churn, failed run) only offer help in a Neovim corner notice; the learner asks with `<leader>ts`; offers back off and can be silenced.

**Architecture:** Two new pure modules in pi-tutor (`offers.ts`: which offer to show when; `quiet.ts`: quiet-mode parsing and time left) are wired into `index.ts` in place of the auto-nudge. Neovim gets one new RPC method on `NvimLink` (`offer`, a `vim.notify`) and one new payload (`stuck`, sent by `<leader>ts`). The ladder, episodes and failed-run counting stay as they are; only who starts the reply changes.

**Tech Stack:** TypeScript (vitest, real headless Neovim in `test/nvim.test.ts`/`episode.test.ts`), Lua (plenary).

**Spec:** `docs/superpowers/specs/2026-11-09-ask-first-stuck-design.md`

## Global Constraints

- Nothing on stdout/stderr inside Pi (no `console.*`).
- Every new Neovim RPC/Lua use and Pi API goes into `pi-tutor/PI_SURFACE.md`, verified against Pi 1.5.0 types.
- Offers and the `stuck` payload name only files inside the project root (`root + "/"` prefix after `realpath`).
- The model never decides stuck; code offers, the learner asks.
- A sitting error never offers (`StuckDetector` keeps `errorNudges: false`).
- No offers during an exam or a step-up (`exam || stepUp`); `<leader>ts` there answers "not during the exam/test".
- Quiet choices exactly: `1m`, `5m`, `10m`, `1h`, `off` (= until turned on), `on` (= offers back).
- TDD; run the owning suite after each change: `cd pi-tutor && npm test` / `npm run typecheck`; Lua:
  `cd nvim-tutor && nvim --headless -u tests/minimal_init.lua -c "PlenaryBustedDirectory tests/ {minimal_init='tests/minimal_init.lua'}"`.
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. `<leader>ts` while Pi is mid-reply: the request waits and is answered after the reply, never dropped (Task 5 test).
2. `<leader>ts` in a buffer outside the project (help tab, terminal, `[No Name]`): a notice "open a file of your project", no payload with an outside path (Task 5 Lua + TS tests).
3. A timed quiet that runs out mid-session: offers resume with no restart (Task 6 test).
4. An offer while the tutor pane has focus or is hidden: the notice still shows and focus never moves (Task 3 test asserts no window change).
5. Pi restart: back-off counts start fresh (acceptable), but quiet mode persists (Task 6 test).

---

### Task 1: `offers.ts` — what to offer, and when

**Files:**
- Create: `pi-tutor/extensions/tutor/offers.ts`
- Modify: `pi-tutor/extensions/tutor/stuck.ts` (add `pausedIn()`)
- Test: `pi-tutor/test/offers.test.ts`, `pi-tutor/test/stuck.test.ts`

**Interfaces:**
- Produces:
  - `export type OfferKind = "pause" | "churn" | "run"`
  - `export interface Offer { kind: OfferKind; spot: string; trigger: Trigger; text: string; first: number; count: 1 | 2 }`
  - `export function offerSpot(t: Trigger, runSpot?: string): string` — pause `pause:<path>:<floor((line-1)/20)>`,
    churn `churn:<path>:<region[0]>`, run `run:<runSpot ?? cmd.join(" ")>`.
  - `export function offerText(t: Trigger, root: string): string` — relative path; always contains `<leader>ts`; never teaches.
  - `export class OfferBook { constructor(waitMs: () => number); signal(t: Trigger, spot: string, now: number): Offer | null;
    due(now: number, current: (o: Offer) => boolean): Offer | null; pending(): Offer | null; reset(spot: string): void }`
  - `StuckDetector.pausedIn(): { path: string; line: number } | null` — the code file whose pause already fired
    (`idleFired && idlePath`), else null.

- [ ] **Step 1: Write the failing tests** (`offers.test.ts`)
  - `signal` for a pause → offer with `count: 1`; the same spot again → `null`.
  - `due(first + 2*wait - 1, () => true)` → null; `due(first + 2*wait, () => true)` → offer with `count: 2`;
    `due(…, () => false)` → null; after the second, `due` never returns that spot again (no third).
  - `reset(spot)` → the next `signal` offers again with `count: 1`.
  - run triggers: `signal` returns an offer every time (each failed run is new); `due` never repeats a run.
  - `offerText` for pause at `/r/src/main.py:42` with root `/r` contains `src/main.py`, `42`, `<leader>ts`; for a run
    with cmd `["/tutor-done","P1.T2"]` contains `P1.T2` and `read the output`.
  - `pending()` is the most recent offer shown (signal or due).
  - stuck.test: after an idle fire in `/p/a.py`, `pausedIn()` is `{path:"/p/a.py", line}`; after a typed tick or a doc tick, `null`.
- [ ] **Step 2: Run** `npx vitest run test/offers.test.ts test/stuck.test.ts` — expect FAIL (module missing).
- [ ] **Step 3: Implement** `offers.ts` and `pausedIn()`; the book is a `Map<spot, Offer>`.
- [ ] **Step 4: Run** the same — expect PASS.
- [ ] **Step 5: Commit** `feat: offers — which stuck offer to show, back-off to two per spot`.

### Task 2: `quiet.ts` — quiet mode values

**Files:**
- Create: `pi-tutor/extensions/tutor/quiet.ts`
- Test: `pi-tutor/test/quiet.test.ts`

**Interfaces:**
- Produces:
  - `export const QUIET_KEY = "quiet"` (profile setting; JSON `{"until":<epoch ms>}` or `{"always":true}`; absent = on)
  - `export const QUIET_CHOICES = ["1m", "5m", "10m", "1h", "off", "on"] as const`
  - `export function parseQuiet(arg: string, now: number): { until: number } | { always: true } | "on" | null`; unknown → null.
  - `export function quietLeft(raw: string | undefined, now: number): number | "always" | null` (null = notices on; expired or bad JSON = null)
  - `export function quietLabel(left: number | "always"): string` — `"notices off"` / `"notices off 4m"` (minutes rounded up).

- [ ] **Step 1: Write the failing tests:** `parseQuiet("5m", 0)` → `{until: 300000}`; `"1h"` → 3 600 000; `"off"` →
  `{always:true}`; `"on"` → `"on"`; `"7m"` → null. `quietLeft('{"until":300000}', 60000)` → 240000; at 300000 → null;
  `'{"always":true}'` → `"always"`; `undefined`/`"junk"` → null. `quietLabel(240000)` → `"notices off 4m"`, `quietLabel(1)` → `"notices off 1m"`.
- [ ] **Step 2: Run** `npx vitest run test/quiet.test.ts` — expect FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** — expect PASS.
- [ ] **Step 5: Commit** `feat: quiet — parse and time the notices-off setting`.

### Task 3: Neovim link — the corner notice and the `stuck` payload type

**Files:**
- Modify: `pi-tutor/extensions/tutor/nvim.ts` (method + payload type), `pi-tutor/PI_SURFACE.md`
- Test: `pi-tutor/test/nvim.test.ts`

**Interfaces:**
- Produces:
  - `NvimLink.offer(text: string): Promise<void>` — Lua `vim.notify(text, vim.log.levels.INFO, { title = "tutor" })`
    inside `vim.schedule`, bounded like the other calls (2 s). No window or mode change.
  - `TutorPayload` gains `| { kind: "stuck"; path: string; line: number; error?: string }` (absolute path; `error` = the
    cursor line's first diagnostic message when there is one).

- [ ] **Step 1: Write the failing test** in `nvim.test.ts`: replace `vim.notify` in the headless Neovim with a recorder
  (`vim.g.got = {msg, level, title}`), call `link.offer("Still on line 3?")`, wait ≤ 500 ms; assert the recorded msg,
  level `INFO` (2), title `"tutor"`, and `nvim_get_current_win()` unchanged before/after.
- [ ] **Step 2: Run** `npx vitest run test/nvim.test.ts -t offer` — expect FAIL.
- [ ] **Step 3: Implement**; add the `vim.notify` call and the `stuck` payload to PI_SURFACE.md (Neovim side list).
- [ ] **Step 4: Run** — expect PASS; `npm run typecheck`.
- [ ] **Step 5: Commit** `feat: link offer — a tutor notice in Neovim's corner, no focus change`.

### Task 4: Never talk first — signals become offers

**Files:**
- Modify: `pi-tutor/extensions/tutor/index.ts` (`onStuck` ~line 465, `failedRun` ~382, `nudgeFor` ~411, the tick ~600,
  `paint`/state), `pi-tutor/extensions/tutor/ui.ts` (`TutorState.quiet?: string`, shown on line 2 after the state)
- Test: `pi-tutor/test/smoke.test.ts`, `pi-tutor/test/episode.test.ts` (existing nudge expectations change)

**Interfaces:**
- Consumes: `OfferBook`, `offerSpot`, `offerText` (Task 1), `quietLeft`, `quietLabel`, `QUIET_KEY` (Task 2), `NvimLink.offer` (Task 3).
- Produces (inside the extension closure, used by Tasks 5–6): `function showOffer(o: Offer): void` (no-op when quiet,
  `exam` or `stepUp`; else `link.offer(o.text)`, or `ui.notify(o.text, "info")` without a link); `const offers: OfferBook`
  (wait = `thresholds(level()).idleMs`); `function quietNow(): number | "always" | null`.

Behaviour:
- `onStuck`: an `open` event for `idle` (still skipped during a recipe, as today) or `churn` → `offers.signal` →
  `showOffer`; **no** `openEp`. `run_passed` and `cleared` handling unchanged.
- `failedRun`: episode bookkeeping unchanged; every `nudgeFor(...)` call there (normal, timed-out) becomes
  `showOffer(offers.signal(trigger, offerSpot(trigger, spot), now))`. `/tutor-done` failures reach it unchanged.
- `nudgeFor` keeps its body but is called only from Task 5's ask path; no editor signal calls it.
- The existing tick also calls `offers.due(now, current)` where `current(o)` is: pause → `detector.pausedIn()` has
  `o.trigger.path`; churn → an entry of `detector.errorKeys()` is for that path; run → false.
- A passed run (`run_passed`) → `offers.reset` for that run spot.
- Widget: `state.quiet = quietLeft(...) ? quietLabel(...) : undefined` on each paint.

- [ ] **Step 1: Write the failing tests** (smoke, no Neovim): idle payloads in `/p/src/main.py` past `idleMs` →
  `b.nudges` empty, `b.notes` has one note containing `src/main.py` and `<leader>ts`, no `tutor_episode` entry for idle;
  a failing `/tutor-done` check → `tutor_episode` with `attempts` 1 as today, `b.nudges` empty, an offer note naming the
  task; a churn sequence → offer, no nudge; during `/tutor-exam` the same idle → no note.
  Update every existing test that expected a stuck nudge from idle/churn/run to expect the offer instead (search
  `stuck signal:` in `test/`); tests of the ladder itself stay.
- [ ] **Step 2: Run** `npx vitest run test/smoke.test.ts test/episode.test.ts` — expect the new tests to FAIL.
- [ ] **Step 3: Implement** as above.
- [ ] **Step 4: Run** the full suite `npm test` and `npm run typecheck` — expect PASS.
- [ ] **Step 5: Commit** `feat: stuck signals only offer help — pause, churn and failed runs show a notice, the tutor never talks first`.

### Task 5: `<leader>ts` — the learner asks

**Files:**
- Modify: `nvim-tutor/lua/tutor/init.lua` (`M.ask_stuck`, keymap, `:TutorStuck`), `pi-tutor/extensions/tutor/index.ts`
  (`onPayload` case `"stuck"`), `pi-tutor/commands.json` (`:TutorStuck`, `<leader>ts` twin `:TutorStuck`, group
  `coding`, `when: ["stuck", "project"]`), `README.md` (both names), `nvim-tutor/tour/steps.lua` (last step's text
  names `<leader>ts`), `pi-tutor/PI_SURFACE.md`
- Test: `nvim-tutor/tests/init_spec.lua`, `pi-tutor/test/smoke.test.ts`, `pi-tutor/test/episode.test.ts`

**Interfaces:**
- Consumes: `offers.pending()`, `offers.reset`, `nudgeFor`, `openEpisode`, `closeEp`, `detector.errorSince`,
  `readsErrorEvent`, `recordHabit` (existing).
- Produces: `M.ask_stuck()` in Lua; payload `{ kind = "stuck", path, line, error? }`.

Lua `M.ask_stuck()`: current buffer must be a normal file inside `opts.cwd` (else
`vim.notify("[tutor] open a file of your project, then <leader>ts")` and return); if the tutor pane is hidden, show it
and put the cursor back in the editor window in NORMAL mode (the pattern in `on_start`); then `M.notify_tutor(payload)`.

Pi `"stuck"` payload:
1. Path not under the realpath'd project root → ignore.
2. `exam || stepUp` → `link.offer("Not during the exam: …")` (test or step-up wording) and stop.
3. Habit: with `error`, `recordHabit("reads-errors", readsErrorEvent({ shownMs }, false), "stuck:<rel>:<line>")`,
   `shownMs` from `detector.errorSince` as the `[ask-error]` path does.
4. Trigger: `offers.pending()` if still current (same rule as Task 4's `current`, plus a run offer whose episode is
   open) → its trigger; else `error` → `{kind:"error", path, line, msg:error}`; else `{kind:"idle", path, line}`.
5. Episode: if one is open on that trigger's spot, keep it; else `closeEp("superseded")` if any and `openEpisode`.
   `offers.reset(spot)`. Then nudge with `anyGap = true`; in a role without the ladder (architect) send the nudge
   anyway (`${TUTOR_PREFIX} stuck (asked): …`) so the architect answers in its own way. The nudge waits for an idle
   session via `sendNudge` (Review Focus 1).
6. Pane notice `stuck: <rel>:<line>`.

- [ ] **Step 1: Write the failing tests.**
  Lua (`init_spec`): with `_notify_override` recording, `<leader>ts` on line 3 of a project file sends
  `{kind="stuck", path=<abs>, line=3}` (and `error` when a diagnostic is set on line 3); the current window and mode
  are unchanged; on a `[No Name]` buffer nothing is sent and a notice names `<leader>ts`; with the pane hidden it is
  shown and the cursor stays in the editor.
  TS (smoke): a `stuck` payload → one nudge containing `stuck (asked)`, an episode opened, note `stuck: src/main.py:3`;
  with `session.isIdle()` false for 200 ms the nudge arrives after it turns true; after an idle offer, the payload uses
  the offer's trigger and the next `signal` for that spot offers again (reset); during `/tutor-exam` → no nudge, offer
  text contains `Not during`; with `error` and the error seen 10 s → a `reads-errors` pass recorded; architect role →
  a nudge is sent; a path outside the root → nothing.
  commands tests and the Lua command-list test pass with the new entries.
- [ ] **Step 2: Run** both suites — expect the new tests to FAIL.
- [ ] **Step 3: Implement** (Lua, Pi, commands.json, README, tour text, PI_SURFACE).
- [ ] **Step 4: Run** both suites and `npm run typecheck` — expect PASS.
- [ ] **Step 5: Commit** `feat: <leader>ts asks for stuck help — the pane answers, the cursor stays in the code`.

### Task 5b: Help climbs on asks, not on runs

**Files:**
- Modify: `pi-tutor/extensions/tutor/ladder.ts` (`Episode.climbs?`, `Episode.askedAt?`, `askHelp`, `stepFor`,
  `restoreAttempts`), `pi-tutor/extensions/tutor/index.ts` (`askStuck`, the `[ask-error]` path, `spotMemory`,
  `/tutor-fix` message, `answersRun`)
- Test: `pi-tutor/test/ladder.test.ts`, `pi-tutor/test/episode.test.ts`

**Interfaces:**
- Produces: `Episode.climbs?: number` (asks that followed new effort; absent = 0), `Episode.askedAt?: { attempts:
  number; hash: string }`; `export function askHelp(ep: Episode, hash: string): Episode` — first ask: `climbs =
  attempts > 0 ? 1 : 0`; later asks: `+1` only if `attempts > askedAt.attempts || hash !== askedAt.hash`; always sets
  `askedAt`. `stepFor` reads `climbs` where it read `attempts` (same STAGES, delay, pro and exam rules).
- Unchanged on `attempts`: `recordAttempt`, `attemptScore`, `mirror` (`rungs_used`), widget `try N`, feedback rung.

- [ ] **Step 1: Failing tests.** ladder: `stepFor` with `attempts: 7, climbs: 0` → `teach`; the existing stage rows
  rewritten on `climbs`; `askHelp`: first ask with attempts 3 → climbs 1; same hash and attempts → unchanged climbs;
  new hash → +1; more attempts → +1. episode: five failed runs on one spot, then a `stuck` payload → the turn's
  `this turn:` line is the hint instruction; pressing again with no change → still hint; edit + failed run + ask →
  why (beginner). `[ask-error]` counts as an ask on an open episode.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement** (an ask nudge prompt `[tutor] stuck (asked): run failed…` counts
  as answering the run for the fix step). **Step 4:** both suites + typecheck PASS. **Step 5: Commit**
  `feat: help climbs on the learner's asks, not on failed runs — runs still count for habits`.

### Task 6: Quiet mode — `/tutor-quiet` and `:TutorQuiet`

**Files:**
- Modify: `pi-tutor/extensions/tutor/index.ts` (register `tutor-quiet`), `nvim-tutor/lua/tutor/init.lua`
  (`:TutorQuiet [arg]`), `pi-tutor/commands.json` (`/tutor-quiet` with args `[1m | 5m | 10m | 1h | off | on]`, group
  `record`; `:TutorQuiet` twin), `README.md`
- Test: `pi-tutor/test/smoke.test.ts`, `nvim-tutor/tests/init_spec.lua`

**Interfaces:**
- Consumes: `parseQuiet`, `quietLeft`, `quietLabel`, `QUIET_KEY`, `QUIET_CHOICES` (Task 2); `showOffer` (Task 4).
- Produces: `/tutor-quiet <choice>`; `:TutorQuiet` without an argument opens `vim.ui.select` over
  `1 minute, 5 minutes, 10 minutes, 1 hour, until I turn them on, turn them back on` and types `/tutor-quiet <choice>`
  into the pane (the existing `slash` wrapper pattern); with an argument types it directly.

`/tutor-quiet` with no argument shows `ctx.ui.select` with the same six labels. It saves the profile setting
(`"on"` deletes it), repaints, and notifies `notices off for 5 min` / `notices off until /tutor-quiet on` / `notices on`.
`showOffer` reads `quietLeft` on every offer, so an expired quiet needs no timer (Review Focus 3).

- [ ] **Step 1: Write the failing tests.** TS: `/tutor-quiet 5m` → an idle offer within 5 min is not shown, widget line
  2 contains `notices off 5m`; at +5 min + 1 s the next offer shows with no restart; `/tutor-quiet off` then a fresh
  `boot()` on the same profile → still quiet (Review Focus 5); `/tutor-quiet on` → offers show; `/tutor-quiet 7m` → a
  warning naming the six choices; while quiet a `stuck` payload is still answered. Lua: `:TutorQuiet 10m` types
  `/tutor-quiet 10m`; `:TutorQuiet` with a stubbed `vim.ui.select` choosing "1 hour" types `/tutor-quiet 1h`.
- [ ] **Step 2: Run** both suites — expect FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** both suites and `npm run typecheck` — expect PASS.
- [ ] **Step 5: Commit** `feat: quiet mode — notices off for 1m/5m/10m/1h or until turned on, kept across restarts`.

### Task 7: Live check and review

- [ ] **Step 1:** Live check with the weak model in a `tmux -L lazycourse` test Pi (explicit `--model
  nvidia/nvidia/nemotron-3.5-lightning-30b-a3b:off`, temp `PI_TUTOR_PROFILE`; never the user's settings): pause in a
  `.py` file past the level wait → corner notice, no reply; `<leader>ts` → reply in the pane, cursor in code; second
  notice after 2× wait, none after; `:TutorQuiet 1m`; failed `:TutorRun test` → notice only.
- [ ] **Step 2:** pane-reviewer on the branch; bring any "Need you to" items to the author before merge.
