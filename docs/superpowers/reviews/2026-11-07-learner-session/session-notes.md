# Learner session notes (beginner, Python, nemotron) — 2026-11-07

## 0:00 First screen
- LazyVim dashboard: nothing mentions the tutor; `space t t` must be known from the README.
- Tutor pane: ~40 skill names (most unrelated: brandkit, gpt-taste, pixel-art…), then a Pi "Update Available 1.5.0" box. My prompt is at the bottom.
- Widget says "tutor lvl 50 / tutor lvl 50 · intermediate" before I said anything — a new learner is labelled intermediate.
- No welcome line telling me what to do first.

## 0:35 "hi, I want to learn Python. I have never programmed before."
- Reply after ~30 s. Rendered BROKEN: wrapped in a ```markdown fence, so raw `**What's happening**`, nested ```python, stray ``` show (frame 000015).
- No onboarding: no /tutor-start mention, no question about me; widget still "lvl 50 · intermediate"; filed as "stuck: learner question".
- "What to try: open your terminal or command prompt and type python3" — sends me out of the editor I am in.

## 1:25 "how do I start properly? do you have a course?"
- Same generic lesson, same broken ```markdown rendering, again "open your terminal and type python3".
- The tutor never mentions /tutor-start or that it can build a course/project for me, even when asked directly.
  A learner who has not read the README is stuck here. (biggest finding so far)

## 1:52 /tutor-start
- ~50 s of the model's PRIVATE REASONING streamed into my pane (italic, frame 000030): "But the instruction says…",
  "the tutor_onboard says…", "end with the tutor-intake note…". Then the reasoning again inside the reply as a green
  ``` block (frame 000062). The learner sees the machinery; "thinking hidden" did not hold during onboarding.
- Good: it used what I said earlier ("never programmed") → "level 5/100 (beginner). Does that sound right?" as a clear
  Yes/No dialog. Widget meanwhile still says "lvl 50 · intermediate".

## 3:06 level accepted → project suggestion
- Straight to one project: "Number Guessing Game", clear Start / Show me something else dialog. Good for a beginner.
- Internal format visible again: "The JSON note should be: ```tutor-intake {} ```"; reply inside a raw ```markdown fence.
- "uses basic Python features you've already met: print(), input()…" — I have met nothing (never programmed).

## 4:30 folder → project made, editor moved to it
- Good: README.md of the project opened in the editor; widget now "lvl 5 · beginner"; clear choice "Build it now, or learn the ideas it needs first?".
- RENDERING FAULT (frame 000093): every line of the tutor pane is cut off on the left ("unds exciting!", "ou prefer", "irst") after the switch. Model reasoning visible again at the top.
- (I pick Build it now to cover the core loop in this session; a real beginner would likely pick learn first.)

## 5:20 Build it now
- Left-cut rendering gone after redraw (transient after the switch).
- Best reply so far (frame 000099): clean format, one idea (a secret target), an unrelated example (die roll),
  ends with a question to me. Widget: "spec: writing…" while the plan is written in the background; it says
  "markdown" because the README is open — odd for a learner.

## 6:00 my answer about how the game works
- Nice ASCII flow diagram of the game loop.
- LEAK (crop104.png / frame 000104): the "small unrelated example" IS my project's core: random secret, int(input()),
  if/elif/else "Too low"/"Too high"/"You got it!". Labelled unrelated; copy-paste solves most of the game.
  The leak check has nothing to compare against yet (plan still being written, no tasks, no reference).
- Every reply is labelled "stuck: learner question" though I am not stuck; reads as a judgment to a beginner.

## 6:10–10:20 waiting for the plan (~9 min after "Build it now")
- Plan ready; recipe auto-started ("plan 1/6"). Editor still shows "The plan arrives in spec/ shortly"; nothing opened tasks.md for me.
- LEAK again (frame 000112): P1.T1 = "generate random secret number and store in variable"; the "unrelated" example is
  `number = random.randint(1, 100)` — the task's solution renamed. Name-based leak check passes it.
- Recipe skips ahead: at step 1 (Find) it shows a full "Map" and asks me to write the map.

## 11:00 opened spec/tasks.md (clicked into editor, :e)
- Clear task list: P1..P4, each with a subtask and "done when". Good.
- Spell-check squiggles on P1, src, py in every line (markdown spell on) — noise.

## 11:20 "the first task is P1.T1, making the secret number"
- Recipe did NOT advance (still "plan 1/6"). tasks.md has both "P1 Set up…" and "P1.T1 …"; the recipe is likely on P1,
  and naming P1.T1 does not count as finding P1 — the two look the same to a learner.
- Tutor again asks for a "map diagram … blueprint box" at step 1 of 6, and tells ME "Keep lines ≤ 40 characters"
  (its own style rule handed to the learner). Example now a die roll (fine).

## 12:10 "I don't know what a map diagram or blueprint box is. can I just try writing the code?"
- STUCK IN THE RECIPE: the tutor repeats the same demand nearly word for word ("I won't fill it in for you — this is
  your artifact"), never explains what a map diagram is, never mentions /tutor-plan skip|off. A beginner would quit or
  ignore it. (crop124.png)

## 12:50 opened src/main.py — starter comment "Start here: spec/tasks.md, task P1.T1. You write the code; the tutor coa…" (good, cut off by width)

## 13:10 writing code (my driver mis-sent keys once — my fault, recovered)
- LazyVim autocomplete ate Enter: after `randint(1, 100)` a popup was open, Enter inserted "randint" instead of a new
  line → `…randint(1, 100)randintprint(secret_number)`. A fast-typing beginner meets this too; nothing tells them.

## 14:10 :TutorRun with the missing import
- Tutor reacted by itself to the failed run, short hint at try 1: names the NameError at line 2, "random module hasn't
  been imported yet" (close to the fix, fair for a beginner).
- I NEVER SAW MY PROGRAM'S OUTPUT OR TRACEBACK: :TutorRun runs out of sight; only the tutor quotes it.
- Internal wording shown as if I sent it: "[tutor] stuck signal: run failed (exit 1): python src/main.py".

## 14:45 added `import random`, :TutorRun → passed
- Widget just says "episode closed (run_passed)" — internal words, no "that works / well done". Still no program output visible.

## 15:15–17:30 :TutorDone P1.T1
- First try: clear note "checks still being written; try again in a minute, or … anyway". Good.
- After waiting: ticked, but "(done, self-checked)": both P1.T1 checks are (unverified) — `isinstance(secret_number, int)`
  on a module-level variable. For a beginner's script (no functions) the checks could not be confirmed, so nothing
  really checked my code. Parent "P1" stays unticked though its only subtask is done.
- Widget shows "idle 149s" to the learner.
- checks.md is readable and honest (says unverified / "a near miss may pass these checks").

## 18:20 P2.T1: added `guess = input("Guess a number: ")`, :TutorRun
- NOTHING VISIBLE HAPPENS. The program hangs forever in the background waiting for input I cannot give (confirmed:
  `python src/main.py` still running). No prompt, no output, no message. The whole project is input-based, so
  :TutorRun cannot run any task from here on.
- 2nd :TutorRun → toast "Warning: tutor a run is already running" (top right). No command to stop the stuck run →
  the learner can never run their program again this session. BLOCKER.

## 19:00–21:00 asking the tutor how to type my guess
- First send was SILENTLY LOST (no bubble, no reply); had to send again.
- Answer does not fit the tool: "if the prompt is showing, just type a number", "in many terminals <C-c> kills the
  current run". There is no prompt, no terminal, nothing to Ctrl+C. The tutor does not know how :TutorRun works.

## 21:40 :TutorDone P2.T1 (while my program hangs in the background)
- Ticked "(done, self-checked)" — its only check `isinstance(guess, str)` is unverified. A program that cannot even be
  run (hangs on input) passed its tick. Second trust-only tick in a row.
- Tutor moved on to P3 with an if/elif/else example on "sign of a number" — structure identical to my P3 solution
  ("unrelated" but the whole shape of the answer).

## 22:30 P3: wrote if/elif/else; LazyVim did not dedent elif/else (both indented under if) → syntax error
- :TutorDone P3.T1 → "running 3 check(s) for P3.T1…" then a clear orange warning with the SyntaxError, line, caret.
  Not counted as a try. Very good.

## 23:10 fixed indentation, :TutorDone P3.T1 with the str<int bug — THE CHECK SYSTEM AT ITS BEST
- "P3.T1 not yet: typing "0" should print "Too low"; it failed: … TypeError … it printed: 53 Guess a number:" — first
  time I see my program's output (via the check). Graded try ("try 1").
- Hint at try 1: "Line 6 compares a string from input() with an int from random.randint()." Good: points at the
  problem, not the fix.
- Red "Error: Request timed out." in the pane (provider retry) — looks like a failure to a beginner.
- Widget "judged wrong" — harsh label for an honest try. My debug `print(secret_number)` shows the secret; not mentioned.

## 24:50 fixed with int(input(...)), :TutorDone P3.T1 → "(done)": the confirmed io checks ("0"→Too low, "101"→Too high)
   ran against my program and passed. A real, check-proven tick. Recipe still "plan 1/6" all session; tutor asks for the
   P4.T1 map next.
