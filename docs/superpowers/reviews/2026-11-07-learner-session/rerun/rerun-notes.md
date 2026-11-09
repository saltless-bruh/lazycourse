# Re-run notes (beginner, Python, nemotron) — 2026-11-07
- 0:09 welcome shows ("New here? Tell me what you'd like to learn — or type /tutor-start."), header label "[tutor_welcome]" raw. Widget "tutor level not set". (frame 6)
- 0:20 first message → onboarding starts at once (experience dialog). 2× "Error: Request timed out." provider retries. (frame 14)
- thinking hidden by default: "thinking hidden · /tutor-thinking show"; no reasoning on screen all onboarding. (frame 25)
- Pi's queue line shows "Follow-up: [tutor] onboarding: give the learner your read of …" (internal); the [tutor] onboarding nudge shows as a user bubble (frame 42).
- intake note shown as raw ```json {…}``` block (frames 33, 42) — model used json tag instead of tutor-intake.
- asked for "a number guessing game"; suggestion ignored it (List Filter Tool, then Sentence Word Reverser and Counter).
- widget stayed "level not set" after accepting level 5 until the project was made (then "lvl 5 · beginner").
- project README front matter: test: + language:, no run: line.
- left-cut pane rendering after the folder switch again (frame 54), transient.
- 9:17 Build it now → reply wrapped in an untagged ``` that never closes: raw fences show (frame 59). cleanReply handles only ```markdown/md.
- LEAK (frame 59): "small unrelated snippet" = the project's solution (split, reversed, print each, len). Structural check missed: stem leaves reverse/reversed/reverser apart → 1 task term hit (word), threshold 2.
- 13:20 plan ready (~4 min after Build it now); recipe auto-started; Find asks "in your own words" (frame 67).
- Find answered "I'm doing P1.T1, it asks the person to type a sentence and keeps it" → plan 2/6 by code (frame 73).
- "skip" → plan 3/6 (frame 79). Examples in plain words with an edge case → 4/6 by code. Steps "first …, then …, then …, then …" → 5/6 by code.
- Map: three replies held (the first was really the project's core: reversed(word) printed in a loop); the others held because
  the plan's `split()` made `split` a "learner name" → generic fallback. "just let me code" → 6/6 Build.
- :TutorRun: program opens in a split below, "Type a sentence:" waits, typed input works, output shown, "[Process exited 0]",
  widget "run passed" (frame 122). `q` closes the split.
- :TutorDone P1.T1 → "ticked P1.T1 (2 check(s) passed)" — confirmed checks (frame 134).
- Recipe kickoff bubble showed "Tell the learner in one line…" (machinery) → reworded.
- P1.T2 kickoff reply (old code) gave the answer in prose: `sentence.strip() != ''` — plan variables were not "names".
- After restart on fixed code: "I don't understand what this step wants" → three leaks held (`has_word = len(text.strip()) > 0`,
  the P1.T2 answer renamed) → generic fallback; fixed so the fallback is the step's own sentence.
- "what does find mean?" → Find explained, unrelated example, asks in own words (frame 241).
- :TutorDone P1.T2 (only unverified checks) → "ticked P1.T2 (ticked on trust: I could not build a check that works for P1.T2)" (frame 252 crop).
- steps-first habit: own steps {Find, Examples, Steps}; skipped Shape/Map not counted → ok=true from 2 real artifacts.
