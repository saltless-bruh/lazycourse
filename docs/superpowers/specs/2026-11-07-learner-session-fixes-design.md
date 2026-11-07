# Learner-session fixes — design

**Source:** the learner session of 2026-11-07 (report: `docs/superpowers/reviews/2026-11-07-learner-session/report.md`)
and its root-cause analysis (findings 1–6). Approved by the author 2026-11-07 ("approved").

**Shared root:** each fix closes a gap *between* two parts that each work: a rule that lives only in a prompt, two
model outputs with no shared contract, a guard tied to one turn type, a feature built for the tutor's needs rather
than the learner's, and tests that only use cooperative inputs.

## §1 A run the learner can see and type into (finding 1, and 9)

`:TutorRun` (kind `run`) runs the project's command in a **visible terminal split** below the editor: the learner sees
the output and types input there. When the program ends, the exit code and the last 60 lines of the split's text are
sent to the tutor as today's `run_output` (`stdout` = those lines, `stderr` = ""). `:TutorRun stop` stops a running
run. A second `:TutorRun` while one runs stops it and starts again (no "already running" dead end). `q` in the
split's normal mode closes it once the program has ended. Kind `test` stays hidden but gets `stdin = "null"` and a
60-second limit, so it can never hang.

## §2 The first run leads (finding 2, and 8)

With no onboarding record, no project and no language in the profile, `session_start` shows a welcome line in the
pane: **"New here? Tell me what you'd like to learn — or type /tutor-start."** The learner's first message then starts
onboarding as `/tutor-start` would, and that message is the conversation's first answer. Until a level is known the
widget shows **"level not set"** instead of `lvl 50 · intermediate`. Every turn's hidden context carries a short,
code-owned list of the tutor's commands so the model's advice fits the tool (`:TutorRun` runs and takes input in a
split; `:TutorDone <task>`; `/tutor-start`; saying "skip" in a recipe).

## §3 Checks and the hidden solution share a contract (finding 4)

The checks prompt and the reference prompt get the same **shape rule**: names in a task's `done when` that are not a
function signature are **top-level** names, and the program is a top-level script in task order, unless a task names
a function signature. For a task that names no function signature, checks are `run` lines (typed input → printed
text) only. After cross-checking, every task left with **no confirmed check** is asked for once more, with the
unconfirmed lines and the reason; a task still without one ticks with the plain note **"ticked on trust: I could not
build a check that works for <task>"**. `spec/checks.md` shows "<n> of <m> checks confirmed" per milestone.

## §4 What the learner reads is clean (finding 5, 6)

Every assistant message the pane shows, on every turn type (onboarding, lessons, chat, teaching), is normalized:
an outer ```` ```markdown ```` / ```` ```md ```` fence wrapping the whole reply is removed; a fenced block or
paragraph before the first bold part that talks about the tutor's own rules or notes (instruction, note, JSON,
tutor-intake, the learner) is removed. The model's **thinking is hidden by default on every band**
(`/tutor-thinking show` shows it). Prompts say only what to do: `style.md` drops "never wrap the whole reply in a
code block" and the 40-column number; the per-turn reminder no longer states a column count (code measures widths).

## §5 Examples may not be the answer (finding 3)

A code block in a reply leaks when, outside the fix step, (a) it shares at least 60 % of its normalized 5-token
windows with the hidden solution (identifiers → `ID`, numbers → `NUM`, strings → `STR`), or (b) it uses at least two
**task terms**: words (4+ letters, not a language keyword or common English word) from the current task's line, or,
before a plan exists, from the project's title and summary, found among the block's identifiers or string words.
A leaking reply is rewritten like any other failed check.

## §6 The recipe explains itself and lets go (finding 6, and 10)

Each recipe step is defined once — name, what the learner writes, a one-sentence explanation — and the same text
feeds the model, code recognition and the learner. Step 1 **Find** asks the learner to "say which task you are on and
what it should do, in your own words". A step advances when code recognizes the learner's artifact — and only those
steps count toward the steps-first habit — or, when code does not, when the model says `step_done` **and** the
learner's latest message is a real attempt (not a question, not a skip or "I don't understand", at least 4 words);
model-accepted steps advance but never count toward a habit, so the model still awards nothing. Code recognizers
accept plain beginner wording (for Shape: "it takes the total and the people and gives back each share"), tested
against real beginner phrasings. Plain words are understood: "skip" / "just let me code" skips the
step; "I don't understand" / "what is a …" gets the step's one-sentence explanation. The kickoff says how to skip and
stop. In the editor, entering the tutor pane (keyboard or mouse) always puts it in input mode, so typed text never
runs as Neovim commands.

## Non-goals

The learn-first path, other languages' run commands beyond what §1 changes, habits/step-up/exams, and Pi's own
skill list and update banner (Pi settings; the author's to change).
