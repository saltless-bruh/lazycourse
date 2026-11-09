# Learner session, 2026-11-07: a complete beginner in Python, seen on screen

**How:** Claude played a complete beginner, using only the screen, keyboard and mouse, through
[screen-replay](../../../../../screen-replay) (a private X screen running kitty with the author's own LazyVim config;
every changed moment kept as a picture). Pi ran nemotron-3.5-lightning through a wrapper; a throwaway profile and
project under `/tmp`. The author's settings, profile and `~/lazycourse` were not touched. No hidden data was read
during the session; the stored reference was read only afterwards, to confirm one cause (finding 4).

**Covered in ~25 minutes of screen time** (plus a 9-minute wait for the plan): first screen → chat → `/tutor-start`
→ level → project → build now → plan → recipe → three tasks written, run and ticked → a NameError, a syntax error and
a str/int TypeError. Running notes: [session-notes.md](session-notes.md).

## What worked well

- **The checks, when they could run** ([11](11-check-catches-str-int.png)): `:TutorDone P3.T1` typed "0" into my
  program, caught `TypeError: '<' not supported between 'str' and 'int'`, showed what it printed, counted one try, and
  the hint pointed at the problem without the fix ("Line 6 compares a string from input() with an int"). After the fix
  the task ticked on checks that really ran. This is the design working.
- **A syntax error is told apart from a wrong answer** ([10](10-syntax-error-check.png)): a clear warning with the line
  and a caret, and it did not count as a try.
- **Onboarding, once found:** it remembered "never programmed", proposed level 5 in a clear Yes/No dialog
  ([04](04-level-dialog.png)), one fitting project with Start / Show me something else, a sensible default folder.
- **A failed run gets a short, fair first hint** without being asked (`:TutorRun` with a missing `import`).
- **Clear waiting notes:** "the checks for this milestone are still being written; try again in a minute, or … anyway".

## Findings, most harmful first

| # | Finding | Seen | Effect on a beginner |
|---|---|---|---|
| 1 | **`:TutorRun` cannot run a program that asks for input.** It runs out of sight with no way to type; the program hangs forever; every later `:TutorRun` says "a run is already running" and there is no way to stop it. | 18:20 | Blocks the whole guessing-game project from P2 on. |
| 2 | **The tutor never tells a newcomer how to start.** "I want to learn Python" and "do you have a course?" got generic lessons; no mention of `/tutor-start`. The first screen invites nothing ([01](01-first-screen.png)). | 0:35, 1:25 | Without the README, a learner never reaches onboarding. |
| 3 | **"Unrelated" examples are the solution.** The game loop example was the whole core of the project; the P1.T1 example was `number = random.randint(1, 100)` — the task's answer renamed ([06](06-unrelated-example-is-the-solution.png), [07](07-plan-and-recipe.png)). The leak check compares names and the hidden solution's lines, so renamed code passes; before the plan exists it has nothing to compare with. | 6:00, 10:20 | The learner can copy instead of think. |
| 4 | **Beginner ticks are trust-only for variable checks.** P1.T1 and P2.T1 ticked "self-checked" (P2.T1 while the program could not even run). Confirmed cause: the checks name top-level variables (`isinstance(secret_number, int)`), as the beginner plan's tasks do, but the model wrote the hidden reference with functions, so those names exist only as locals and no check can be confirmed. | 17:30, 21:40 | "Code decides" silently becomes "trust me" for the learners who need it most. |
| 5 | **The model's private reasoning is shown** during onboarding: ~50 s of "But the instruction says…", "the tutor_onboard says…", "end with the tutor-intake note…", then again inside the reply as a fenced block ([03](03-private-reasoning-shown.png)). "thinking hidden" did not hold there. | 1:52 | Confusing; shows the machinery. |
| 6 | **Replies render broken:** wrapped in a ```` ```markdown ```` fence, so raw `**bold**`, nested fences and stray backticks show ([02](02-broken-markdown-reply.png)). Internal formats leak too ("The JSON note should be: ```tutor-intake {}```"). | 0:35, 3:06 | Looks broken; hard to read. |
| 7 | **The recipe gets stuck and does not explain itself.** It stayed on "plan 1/6" all session. At step 1 it demanded a "map diagram … blueprint box" (a later step's artifact), repeated the demand word for word when I said I did not know what that is ([08](08-stuck-in-recipe.png)), never mentioned how to skip, and passed its own style rule to me ("Keep lines ≤ 40 characters"). Naming "P1.T1" did not count as finding "P1" (the plan has both). | 11:20, 12:10 | A beginner quits or ignores the tutor. |
| 8 | **The tutor's advice does not fit its own tools:** "open your terminal and type python3" (I am in the editor), "if the prompt is showing, type a number; Ctrl+C kills the run" (there is no prompt or terminal) ([09](09-input-advice-wrong.png)). | 0:35, 21:00 | Sends the learner the wrong way. |
| 9 | **I never see my own program's output** from `:TutorRun`; only the tutor quotes it (and a failing check shows it). | 14:10 | The basic "run it and look" loop is missing. |
| 10 | **A message was silently lost** once (no bubble, no reply) after clicking into the pane; sent again, it worked. | 19:00 | Learner thinks the tutor ignores them. |
| 11 | **Screen clutter and wording:** ~40 skill names (most are the author's unrelated global skills: brandkit, gpt-taste, pixel-art…) and a Pi "Update Available 1.5.0" box fill the first pane; "lvl 50 · intermediate" before anything is known; "stuck: learner question", "judged wrong", "episode closed (run_passed)", "idle 149s", "markdown" as the language, "[tutor] stuck signal: run failed…" shown as if I sent it; a red "Error: Request timed out." on a provider retry. | throughout | Noise and harsh words for a beginner. |
| 12 | **Rendering fault after the switch to the project:** every tutor line cut off on the left until the next redraw ([05](05-left-cut-rendering.png)). | 4:30 | Brief, but looks broken. |
| 13 | **Smaller:** the editor kept "The plan arrives in spec/ shortly" after it arrived and opened nothing; parent task "P1" stays unticked when its only subtask is done; spell-check squiggles on `P1`, `src`, `py` in tasks.md; LazyVim autocomplete ate an Enter and did not dedent `elif`/`else` (editor behaviour a beginner will meet). | — | Friction. |

## What I would fix first

1. **Running programs that read input** (1, 9): run `:TutorRun` in a visible terminal split the learner can type into (and close), or at least feed no stdin, time out, and say why; add a way to stop a run.
2. **A first-run welcome** (2): when no profile/onboarding exists, the first reply (or a widget line) says what `/tutor-start` does; the chat reply to "I want to learn X" offers it.
3. **Make beginner checks provable** (4): ask for the reference in the same top-level script shape the beginner plan uses (or check top-level names only when the reference defines them there, and otherwise ask the model again), so P1/P2 ticks are not trust-only.
4. **Hold back near-solution examples** (3): compare examples against the task's done-when and the hidden solution by structure, not names; before the plan exists, keep examples off the project's own domain.
5. **Never show reasoning or internal formats** (5, 6): strip a reply's outer ```` ```markdown ```` fence and any `tutor-intake` talk; keep thinking hidden during onboarding too.
6. **Recipe for real beginners** (7): explain each step in one sentence when asked, accept "skip" in plain words, accept a subtask id as finding its parent.

## Not judged

Long-term flow (habits, step-up, exams), the learn-first path, other languages, and anything that needs more than one
session. The author's own look at the screenshots is still needed for taste (colours, density).

## Re-run (2026-11-07 evening, branch learner-fixes)

Same setup: beginner, Python, nemotron, fresh `/tmp` profile and project, no `/tutor-start` typed. Screens in `rerun/`,
notes in `rerun/rerun-notes.md`.

```
finding (first session)            re-run
─────────────────────────────────  ──────────────────────────────────────────────
1 run hidden, input hangs          program in a split, typed input works (07)
2 click left Normal mode           click → input mode, messages arrive whole
3 "unrelated" example = solution   still met in new shapes → three more fixes (below)
4 trust-only ticks                 P1.T1 confirmed (08); P1.T2 says "ticked on trust" (10)
5 raw fences, visible reasoning    thinking hidden (03); two new fence shapes → fixed
6 recipe stuck at step 1           Find in own words (05), "skip" (06), explain (09)
10 no welcome, no onboarding       welcome (01), onboarding from the first message (02)
```

Met live and fixed on the branch (each with a failing test first):
- The README path leak used `reversed`/`reverser` — the stem kept them apart; word families now share one stem.
- A reply wrapped in an untagged ``` before its first heading (never closed) showed raw; it is unwrapped.
- During onboarding the model tagged its intake note `json`; a json fence holding only intake fields is now read and hidden.
- The plan's `split()` made `split` a "learner name", so every Map reply was held; builtins in a plan are not names.
- The plan's variables (`sentence`) were not names, so "`sentence.strip() != ''`" (the P1.T2 answer) passed; they are now.
- "I don't understand" ended in a generic fallback when the model kept leaking; inside the recipe the fallback is now the
  step's own one-sentence explanation.
- The recipe kickoff bubble showed "Tell the learner …"; it now speaks to the learner.

Still open (not fixed here): Pi's queue line and the onboarding nudge bubbles show `[tutor] onboarding: …`; the
`[tutor_welcome]` label above the welcome; the suggestion ignored "a number guessing game"; the widget said "level not
set" until the project was made; the new project's README had no `run:` line (the default `python src/main.py` worked);
the left-cut pane after the folder switch; provider "Request timed out" lines; an empty ``` ``` pair left after the
model echoed `[workflow]` into a fence.
