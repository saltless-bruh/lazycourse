# Ask-first stuck help — design (2026-11-09)

## Why

The tutor speaks up on its own when code thinks the learner is stuck: a long pause in a code file, rewriting around
an error, a failed run (a sitting error has been silent since 2026-10-26). In the author's live session (2026-11-09) this produced two
unasked re-teaches while they were simply reading. Their words: thinking time on a hard line "is unpredictable", and
an unasked reply about an error they can already see and are already working on is "like someone else just start
backseat driving".

The help itself is good (the attempt ladder: questions → hint → why → ask → fix). What is wrong is **who starts it**.
After this change the learner always starts it; code only offers, quietly, in a way that needs no answer.

## Goals

1. No editor signal ever starts a tutor reply by itself. Pause, churn (rewriting around an error) and failed run
   (`:TutorRun`, `:TutorRun test`, a failed `/tutor-done` check) all become a small **offer**. An error that sits on a
   line stays silent, as it has been since 2026-10-26 (the "reads errors" habit: the learner asks); the author kept
   that on 2026-11-09.
2. The offer is a Neovim corner notification (LazyVim's notifier, via `vim.notify`): no focus change, fades on its
   own, nothing to dismiss. Ignoring it means "I need more time".
3. `<leader>ts` ("I'm stuck") works at any time, offer or not. It starts the existing stuck help in the tutor pane.
   The cursor stays in the editor; if the pane is hidden, it is shown without taking focus.
4. Back off: an ignored offer is repeated once, after twice the wait; after the second ignored offer that spot gets no
   more offers until something about it changes.
5. Quiet mode: the learner can turn offers off for 1 min, 5 min, 10 min, 1 hour, or until they turn them on again.
   "Until on" survives restarts.

## Non-goals (later, already discussed)

- Learning the learner's pace from their answers and adjusting the wait (idea 2).
- Weighing evidence (pause + error, or after a failed run) to ask sooner or more sharply (idea 3).
- Any change to chat in the pane, to `<leader>te`, `/tutor-plan`, `/tutor-done` themselves, or to the ladder's steps.

## Anti-goals (a failure even if it "works")

- The tutor starts talking because of a timer or an editor signal.
- A notice takes focus, opens a window or dialog, or needs an answer.
- More than two offers about the same spot without something new happening.
- Quiet mode also silencing what the learner asks for (`<leader>ts`, `<leader>te`, chat).

## What the learner sees

```
signal (code, as today)                          offer (corner notice)                      on <leader>ts
───────────────────────────────────────────      ─────────────────────────────────────      ─────────────────────
pause in a code file ≥ T (by level)        ──▶  "Still on line 42 of solution.py?        ──▶ stuck help in the pane,
                                                  <leader>ts if you're stuck"                  cursor stays in code
rewriting around an error (churn)           ──▶  "Line 12's error is still there after a few rewrites.
                                                  <leader>ts for help"
(an error that sits on a line: no offer, as today since 2026-10-26)
failed :TutorRun / test / /tutor-done check ──▶  "test_area failed — read the output;
                                                  <leader>ts for help"
```

Wording is the builder's within these lines: short, names the file/line or test, names `<leader>ts`, never teaches.

## Decided behaviour

**Signals and waits.** Detection stays as it is (`stuck.ts`, `push.lua.ts`, including the per-code-file pause clock
merged on 2026-11-09). Waits come from `policy.ts` thresholds by level (pause T = `idleMs`); churn fires when the detector sees it, as today,
and its repeat waits 2 × `idleMs`. The detector keeps `errorNudges: false`: a sitting error never offers.

**Failed runs.** A failed run still counts as a try on its spot exactly as today (the help level climbs, typo runs
don't count), silently. *My call:* it still opens or advances its run episode through `failedRun` as today (so a chat
message after a failed run gets the ladder context, and the widget shows the stuck state); only the nudge is replaced
by an offer. A run offer is shown once per failed run, never repeated; each new failed run brings its own offer.

**Episodes.** *My call:* a pause or churn offer does not open an episode (failed runs do, above). Offers are
gated only by back-off and quiet mode, never by an open episode (`canOpen`/`yieldsTo` keep governing episodes only). It records a pending offer (trigger + spot). `<leader>ts`
opens the episode with the pending offer's trigger if that offer is still current (its error is still there / its run
is the latest / the cursor is still in that file); otherwise with the cursor's spot (an error on the cursor line → an
error trigger; none → a pause-style trigger at file:line). Then the existing `nudgeFor`/ladder path runs, so the reply
is the same help as today. The `NUDGE_GAP_MS` gap does not apply to a `<leader>ts` request (the learner asked).
Failed-run counts live where they live today, so the help level matches the tries.

**Back-off.** A spot is the trigger's identity (pause and churn: path + 20-line region; run:
the existing run spot key). Per spot: first offer after its wait; if ignored, a second offer after twice that wait;
then no more offers for that spot. *My call* on what makes a spot "new" again: a new failed
run on it, `<leader>ts` pressed, or the learner opens the help and closes the episode. Typing restarts the pause clock
(as today) but does not reset the spot's offer count.

**How `<leader>ts` reaches Pi.** *My call:* the editor command `:TutorStuck` (the key's twin) sends the request over
the existing RPC link as a hidden `[tutor]` message, not typed into Pi's input like `<leader>te`, so it opens no chat
episode. A one-line notice in the pane says what was asked ("stuck: solution.py:42"). If Pi is mid-reply, the
request waits until the reply ends (as `sendNudge` already retries). In the pane, typing a question still works as
today.

**Modes (the author, 2026-11-09).** During an exam or the step-up talking test: no offers at all, and `<leader>ts`
answers with a notice that help is not available during the exam/test. In architect mode: offers appear, and
`<leader>ts` gets the architect's own answer about the spot (design and reasoning, no code), not the coding ladder.

**Habits (the author, 2026-11-09).** `<leader>ts` pressed with an error on the cursor line counts toward the "reads
errors" habit by the same rule as `<leader>te` (`readsErrorEvent`: a pass when the error was on screen ≥ 5 s).

**Recipe.** As decided 2026-10-27, a pause during `/tutor-plan` is thinking: no pause offers while a recipe runs.
Error, churn and run offers do appear during a recipe.

**Architect role.** Unchanged in effect: it already never interrupts; offers may still show.

**Quiet mode.** `:TutorQuiet` (twin `/tutor-quiet` in the pane) with no argument opens a picker
(`vim.ui.select`): 1 min, 5 min, 10 min, 1 hour, until I turn it on. With an argument: `1m | 5m | 10m | 1h | on | off`
(`on` = offers back on; `off` = until turned on). Stored in the profile (a setting with an end time, or "always"), so
both the timed and the permanent kind survive a Pi or Neovim restart. While quiet: no offers; signals are still
detected and failed runs still counted; `<leader>ts`, `<leader>te` and chat work. *My call:* the tutor widget shows
`notices off` (or `notices off 4m`) while quiet, and a one-line notice confirms each change.

**Where things go.** `<leader>ts` and `:TutorQuiet` live in nvim-tutor next to `<leader>te`; `/tutor-quiet` in the
extension. All three go into `commands.json` (the help tab, README and the command-list tests depend on it) with
twins. The help step of `:TutorTour` (last step) mentions `<leader>ts` in its text; no new tour step.

**No Neovim.** If Pi runs without the editor link, there are no editor signals; a failed `/tutor-done` check shows its
offer as a pane notice (`ctx.ui.notify`) instead of a reply.

## Constraints (project rules)

- Nothing on stdout/stderr inside Pi.
- New Neovim RPC/Lua use (the offer's `vim.notify`, the keymap, the picker) and any new Pi API go into
  `pi-tutor/PI_SURFACE.md`, verified against Pi 1.5.0 types.
- Offers name only files inside the project root.
- The model never decides whether the learner is stuck; code does, and now the learner confirms.
- TDD; both suites; pane-reviewer before merge.

## Known gaps left as is (from the 2026-11-09 review)

With offers instead of replies these matter much less; the builder may fix them if cheap:
- Time in the tutor pane counts toward the pause in the code file left behind.
- A pause can count up to ~60 s early after typing in a doc just before opening a code file.
- Typing followed by switching to the pane within ~30 s can be missed, so a later pause in that file may not offer.

## Left to the builder

Exact offer wording; how the pending offer is stored; notifier options (title, timeout); the profile key names; how
`/tutor-quiet` and `:TutorQuiet` share one implementation; test layout.

## Calls I made (for the author to check)

- Failed runs keep opening/advancing their run episode silently; run offers show once per failed run.
- Offers are not blocked by an open episode.
- `<leader>ts` goes over RPC as a hidden request (`:TutorStuck` twin), waits if Pi is replying, and shows a one-line
  notice in the pane.
- An offer opens no episode; `<leader>ts` opens it (pending offer if still current, else the cursor spot).
- What makes a spot new again; typing doesn't reset the offer count.
- No pause offers during a recipe (keeps the 2026-10-27 decision).
- Widget shows `notices off` while quiet; `/tutor-quiet` twin in the pane; tour mentions `<leader>ts` in its last
  step only.
