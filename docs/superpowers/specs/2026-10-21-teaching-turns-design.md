# Teaching turns: the tutor teaches, code decides — design

Date: 2026-10-21. Status: for the author's approval (builder check done).
Fixes the learner-session findings A–E (2026-10-19): A the solution at every hint level, B never asks the
learner back, C its own planning leaks into replies, D the judgment block shows and breaks, E finished
tasks are never ticked.

## 1. Intent

The author is a beginner who wants to learn to *write* code, not to receive it. What they lacked when
learning was the step between knowing what they want and the line of code: how a sentence in their head
becomes a construct, the way a grammar pattern ("S + could have + positive effects + on STH") becomes an
English sentence. The tutor today diagnoses errors well but behaves like an answer machine: it hands over
fixes at every hint level, never asks anything back, and never shows progress.

The one principle behind every decision here: **the model advises, code decides.** Every weak-model
failure fixed in this project so far (copied notes, invented tags, missed ticks) was fixed by moving a
decision from a prompt rule into code. This design does the same for teaching.

## 2. Evidence this design rests on

- **Learner session 2026-10-19** (nemotron, real Neovim): findings A–E above.
- **Spike 2026-10-20/21** (throwaway; two runs each of nemotron-3.5-lightning and glm-5.3-flash on NVIDIA,
  same project, same learner messages, the teaching format below appended to the system prompt):
  - glm followed the attempt ladder (§5) correctly in both runs: hint and a question at attempt 1, a clear
    why at 2, "what were you thinking?" at 3, only the stuck line at 4. It still leaked in a different
    place each run (an "In short" line that names the answer; the learner's own line as the model row).
  - nemotron ignored the ladder and the teaching format in both runs: the fix at attempt 1 or 2, never a
    question, repeated itself, judged `none` every turn, leaked machinery ("rung 3/5"; our scrubber turned
    it into "this stage/5"). Thinking was on in all runs (NVIDIA's default); it did not help.
  - Neither model used the appended teaching format fully; the existing five headings won.
  - A reply can be held off screen until an async check finishes and then released or replaced
    (Pi 1.3.0: `message_end` handlers are awaited before the UI receives the message; the markdown
    transformer sees `isStreaming`). Verified live.
  - Checks from the plan: plain code could read only 5 of 12 tasks' prose "done when" lines. Asked for a
    strict form, nemotron wrote 12 checks (5 of 6 tasks, no input/output checks), glm 36 (6 of 6, 14 typed
    input → output checks). Against references written in separate requests (one per model) they agreed
    10/12 and 32/36. The disagreements: 2 wrong checks (exact decimal comparison, `17.599999… ≠ 17.6`) and
    4 right checks where *both* references, from two different models, made the same mistake. So
    disagreement is a useful alarm, and neither side can be trusted blindly.
- **Phase 1 live result (2026-10-21, real LazyVim, Lua project, wrong `split_amount`, 6 runs):** both models
  reached try 1, 2, 2 (unchanged rerun), 2 (a typo lua_ls marked), 3, 4. nemotron: hint after rewrites, why
  ended in the code-written fallback after 3 broken replies, "What were you thinking when you used
  `math.floor`…?" at try 3, the line at try 4. glm: hint after one rewrite, a why with a diagram and no code,
  the ask, and "replace line 4 with exactly this: `return total / people`". The live runs found six defects,
  each fixed test-first: the spot key (numbers that change, stack frames, Lua's message line), a typo in
  between resetting a spot's count, re-ask requests showing in the chat, the fallback printing the internal
  key, the model closing a run's episode, and quoting the error's own text counted as a leak. Not yet live:
  Python typos with no Python language server (nothing marks them, so they count as tries).
- **Phase 2 live result (2026-10-22, real LazyVim, Python with no language server, a learn-first project one
  concept short of milestone 1, `:TutorLesson skip` → building):** both models wrote `spec/checks.md` within a
  minute (nemotron 2 checks for P1.T1 and 1 for P1.T2, glm 2 and 2), all trusted by the separate reference.
  `:TutorDone P1.T1` on `* people`, `* 1.0`, the same code again, three syntax errors (unclosed bracket, missing
  `:`, unindented body), `//`, then `/`: try 1, 2, 2, 2, 2, 2, try 1 on the new check, ticked ("2 check(s)
  passed"). The syntax notes quote Python's own message with the line. The reference never entered the
  project; Pi's settings were unchanged. The first nemotron run found two defects, fixed test-first before the
  reruns: the widget clipped `try N` behind "build: milestone 1", and its only check was
  `split_amount(48, 3)`, where `//` and `/` agree, so floor division ticked the task (the checks prompt now
  asks for inputs that tell a close wrong answer apart; both models then added `50, 3`). Replies: glm gave a
  hint at try 1 and a why with an unrelated example at try 2; nemotron named the fix in prose at try 1 ("use
  `/` instead of `*`", "true division is needed"). The leak check compares code only, so prose fixes pass.
  Lua: with the generated `.luarc.json` ("Lua 5.5" from `lua -v`), LazyVim's lua_ls stops marking `7 // 2`;
  without it, it reports "LuaJIT does not support this grammar".
- **Published work:** CodeAid (CHI 2024: pseudo-code with line-by-line explanation, no solutions, 700
  students); CodeHelp (Koli Calling 2023: prompt rules leaked code, so it added a code-removal pass);
  Phung et al. (LAK 2024: a weaker model validating a stronger model's hints raised hint quality);
  help-abuse research (students click through to the bottom-out hint; attempt-gated hints counter it);
  subgoal labels (labelled worked-example steps lower failure and drop-out); LLM-written unit tests
  (wrong expected values are their main failure).

## 3. Goals, non-goals, anti-goals

Goals
- A beginner learns to turn plain sentences into code through the design recipe, with patterns taught
  like grammar, on examples that are never their own task.
- Help climbs with real failed attempts, asks what the learner was thinking before the fix, and gives the
  fix only for the stuck part, last.
- No reply the learner sees gives away their own task's code before the ladder allows it, whatever the
  model writes.
- Tasks are ticked from real evidence (checks that run), never from the model saying so.
- It works with a weak model; a stronger model only makes it better.

Non-goals
- Generating new lesson content (lessons stay vendored, §7a of the onboarding design).
- Mutation-testing tools (mutmut, Stryker, cargo-mutants): a later add-on, not now.
- Speed. Learners are learning; a reply that waits for a check is fine (author, 2026-10-20).

Anti-goals (a failure even if everything else works)
- The tutor hands over the learner's own code before the ladder allows it.
- A learner is blocked by a check that is wrong.
- A learner spends time arguing with a score a model made up.
- The tutor talks about its own machinery (rungs, judgment blocks, "the learner").

## 4. The design recipe is the default for beginners (author's decision)

Today the six-step recipe (`/tutor-plan`: Find → Shape → Examples → Steps → Map → Build) is opt-in and
was never used. For a learner in the beginner band (level 0–33) it becomes the normal way a task is
worked: starting a task starts the recipe. Steps 4–5 are the author's "grammar" idea: the job in plain
sentences, then each sentence mapped to the construct that does it, shown on an unrelated example from
the language cookbook.

Moving between steps is decided by code where it can be (an artifact the learner pasted or wrote that has
the step's shape, a check that passes), not by the model's `step_done` alone. *(Builder: how each step's
artifact is recognised is yours; the Examples step's rows can become checks, §7.)*

Speed of a recipe on a trivial task does not matter (author: "speed isn't in the list").

## 5. The attempt ladder (author's decision)

```
your attempt
   ├─ typo / syntax error ──▶ LazyVim already shows it; the tutor stays quiet
   │                          (the learner asks with the right-click entry, §9)
   └─ logic / meaning / design: each failed attempt on the SAME spot climbs one step
        attempt 1 ▶ one small hint that points at the spot
        attempt 2 ▶ clearly why it is wrong and what KIND of change fixes it; no code for their task
        attempt 3 ▶ "what were you thinking when you wrote this — or was it a guess?";
                    explain only after the answer, addressing that thinking
        attempt 4+ ▶ the fix for only the stuck part (that line), with why; the rest stays theirs
```

Level changes the pace (author confirmed the guess): about this ladder at beginner; more attempts before
the fix at intermediate; at pro the fix comes only when the learner asks.

**Counting is code.** An attempt is: a failed check on a task (the spot is the task plus the failing
check), or, for a task with no check, a failed `:TutorRun` inside the same stuck episode (the existing
`run` episode keeps its place across reruns, `index.ts:281`). *(Builder: what counts as "the same spot"
for runs without checks; the error line and message are the obvious key.)*

Only graded tries count (author's decision, 2026-10-21, after comparing established tutors: Cognitive
Tutor, ASSISTments, autograders all count a submission judged against a known answer). A chat message is a
question: it is answered at the current step and never moves help forward, even when the learner says it is
still wrong or their code changed, because nothing grades it.

Which runs count (author's decision, 2026-10-21; **changed later that day**, see below):

```
run fails with a syntax error in its own output   ──▶ not an attempt (a typo)
run fails any other way                           ──▶ an attempt
run succeeds but the answer is wrong              ──▶ caught only by the task's checks
```

The first version keyed on "the editor shows an error in the learner's file". The phase 1 live check and
review showed editor marks are unreliable three ways: no Python language server was installed (typos never
marked, so each counted as a try); pyright, if added, also marks misspelled names and wrong types (real
mistakes would go silent); and lua_ls set up for LuaJIT marks valid Lua 5.4 `//` as an error. So the author
chose (2026-10-21): the tutor reads the run's own output, and only a true syntax error (Python `SyntaxError`
or `IndentationError`, Lua `'…' expected near` or `unexpected symbol`, JS/TS `SyntaxError`, the compilers'
syntax/parse errors) makes a typo run. Editor marks no longer silence a run. Lua projects the tutor creates
also get a `.luarc.json` naming the Lua version they run, so lua_ls checks the right language.

This replaces today's rule that the hint level rises only when the model judges the learner `correct`
(`ladder.ts` `nextRung`); that rule never fired with a weak model.

## 6. Every teaching turn is enforced in code (author's decision, 2026-10-21)

A long list of rules does not steer a weak model; the spike showed the strongest existing format wins
and narrow instructions work better. So:

```
code knows the moment: recipe step N / attempt K on spot S / a question
        │
        ▼
this turn's ONE instruction, narrow and concrete
  e.g. attempt 1: "one small hint pointing at the spot; at most 2 sentences; no code"
        │
        ▼
model writes the reply ──▶ HELD off screen ("tutor is checking…")
        │
        ▼
code checks the reply against this turn's limits
  · uses the learner's own task names or the hidden reference's distinctive pieces before the fix is allowed?
  · longer / shaped differently than this turn allows?
  · machinery words, planning before the first heading, a visible judgment block?
        │
   passes ──▶ shown          fails ──▶ asked again with the reason (bounded), else a safe fallback
```

- **The model's thinking** (author's decision, 2026-10-21): while the fix is not yet allowed on the
  current spot, the thinking is hidden on teaching turns whatever `/tutor-thinking` says (in the spike,
  the thinking is where both models worked out the fix). After the fix (attempt 4+) and outside teaching
  turns, the learner's `/tutor-thinking` setting (2026-10-14) applies again.
- **Teaching format** for a construct (author's, adapted from their own example; plain short words at
  beginner, more technical as the level rises): the pattern with every slot named → why it works →
  the simplest example, unrelated to their task → a combined example with other constructs they know,
  every part labelled with what it does and why → mistakes to avoid → their turn. This replaces the old
  five headings for teaching turns, it is not appended next to them.
- **Optional model checker** (author: an option, for a learner who has the machine for a local model or
  an API provider of their choice): a second model answers one narrow question, "does this reply give
  away the fix for this task?", seeing the reply, the task and the hidden reference. It catches fixes
  paraphrased in words, which code cannot. Without it, the code checks above still run. Pi connects local
  models (llama.cpp router, or an OpenAI-compatible endpoint such as Ollama in `models.json`).
- *(Builder: the exact per-turn instructions, the length limits, how many re-asks before the fallback,
  and the fallback's wording are yours; the fallback must never contain the fix.)*

## 7. Checks: how tasks get proven and ticked (E)

By level (author's decisions):

| Band | What proves a task | The tutor's job |
|---|---|---|
| beginner (0–33) | the task's checks | show the checks when they are made |
| intermediate (34–66) | the learner's own test for the task when it exists; the task's checks when the learner has not written one yet, so learning to test never blocks the project (author's decision, 2026-10-21). A failing own test is an attempt | teach test writing the §6 way: rules, structure (arrange → act → check), formats, naming, good practice |
| pro (67–100) | the learner's own tests | a score for the tests and the code (§8) |

How checks are made (designer's calls from the spike):
- **Written per milestone, in the background**, while the learner is in that milestone's lessons, not in
  the plan request (the plan request was just budgeted so weak models finish it).
- **Strict form**, validated by code: a function value (`tip_amount(40, 0.2) == 8.0`) or typed input →
  output (`stdin "48\nn\n" → stdout contains "17.60"`).
- **Cross-checked against a reference solution written in a separate request** that never sees the
  checks. Agree → the check counts. Disagree → the check is shown marked **unverified** and never blocks
  a tick.
- **No check ever blocks a beginner without a way out**, because agreement can hide a shared mistake
  (spike: both references were wrong the same way). *(Builder: the shape of the way out.)*
- **Decimals compare with a tolerance**, never exactly.
- **Checks belong to a milestone**: a later task that changes a function (`tip_rate` returns 0.15 in
  milestone 1, then 0.2/0.1 in milestone 2) retires the earlier check.
- Tasks with nothing to check (a welcome line) are ticked when the learner confirms, labelled
  self-checked.

The reference solution is hidden from the learner; it is also what §6's leak check compares replies
against.

## 8. The pro score: only facts code can check

```
score (no debate: every point re-runs the same way)      notes (no points, no level effect)
· the task's checks pass                                 · the model's views on design and naming,
· the learner's own tests pass                             each pointing at a line,
· their tests fail on a broken stub of their function      dismissed with one key, no reason needed
· the "done when" edge cases are covered
```

If several scores in a row sit well above or below the learner's level, the tutor suggests a level
change; the learner decides. The model never moves the level.

## 9. Asking about an error (author's idea)

Neovim's right-click menu (`PopUp`, `:h PopUp`, Neovim 0.12) gets "Ask tutor about this error" next to
the existing "Show Diagnostics", plus a key for keyboard users. It puts the error message, the line and
the code on it into the tutor pane. The tutor no longer nudges on its own for an error that just sits
there; the learner asks. (The quiet part is the designer's reading of "typos are LazyVim's job".)

## 10. C and D

- **C:** text before the reply's first heading is folded away like thinking; the internals scrubber's
  partial rewrite ("rung 3/5" → "this stage/5") is a bug to fix; replies never refer to "the learner".
- **D:** with ticks, attempts and spots decided by code, the judgment block carries only concept tags
  (and whatever the profile's concept ease still needs). It is never shown.

## 11. Constraints

- Project rules (CLAUDE.md): nothing writes to stdout/stderr inside Pi; every new Pi or Neovim API is
  verified in Pi's types and recorded in `pi-tutor/PI_SURFACE.md`; editor paths stay inside the project
  root; Pi's `bash` tool stays off; tests first.
- Pi 1.3.0 surfaces this needs (verified 2026-10-20): `message_end` (awaited, may replace the message),
  `registerMarkdownTransformer` (`isStreaming`), `before_provider_request`.
- The laptop (cloud models only) must keep working with no local checker.
- Thinking settings: Pi sends no thinking or effort field for nemotron or glm on NVIDIA (catalog:
  `supportsReasoningEffort: false`, no thinking format); NVIDIA thinks by default for both and ignored a
  forced `reasoning_effort`. Tested 2026-10-21 by rewriting the request (`before_provider_request`):
  nemotron honours `chat_template_kwargs: {enable_thinking: false}` (thinking 0) and `reasoning_budget: N`
  (128 cut thinking to a third; 4096 = default) and rejects `max_thinking_tokens`/`thinking_budget`; glm
  ignored every switch tried. Less thinking made both models answer a small puzzle wrongly, so the tutor
  keeps thinking on. Mapping Pi's levels onto nemotron's two fields is a separate, optional change.

## 11a. Settled after the builder check (designer's calls, 2026-10-21)

- **Projects without milestones** (build now, all concepts known, every intermediate/pro plan: a flat list
  of at most 8 tasks) get their checks and reference in the background right after the plan is written;
  a project made before this change gets them in the background when it is opened.
- **What runs checks:** an explicit action (`:TutorDone`, or `:TutorRun test` where the project has
  tests), never saving. Running code that has not changed since the last failed attempt on that spot is
  not a new attempt.
- **Sandbox:** the reference and the checks are model-written, so they run in the exam sandbox
  (bubblewrap), as the author chose for exams (option C). If the sandbox cannot start, nothing
  model-written runs: checks are not cross-checked, so they all show as unverified and never block.
- **Short replies and the fold (C):** only turn shapes that start with a heading get the fold; a short
  shape (attempt 1's hint, attempt 3's question) is held to its length limit, so a planning preamble
  fails the check and the reply is asked again.
- **Where the attempt ladder applies:** project tasks and lessons. Exams keep their cap: only attempt
  steps 1–2, never the fix, during an exam. The recipe's frozen rung goes away. Concept ease
  (`episodeScore`, FSRS) is computed from attempts used before success instead of rungs. Idle and churn
  nudges stay; only the error nudge goes (§9). The architect role has no ladder and is unchanged. Held
  replies and the leak check cover tasks, lessons (against the lesson's exemplar) and exams.
- **Pro score parts code cannot make:** the broken stub and the edge-case list come from the strict-form
  checks (§7), already cross-checked; a part that cannot be made is left out of the score, and the score
  says so.

## 12. Left to the builder

The per-turn instruction texts, limits and fallback wording; recognising recipe artifacts; the "same
spot" key for runs without checks; where checks and the reference live on disk (the reference must stay
out of the learner's reach and out of the tutor's read tools); the build order inside each phase.

## 13. Suggested order

Phases 1 and 2 are built on one branch and merged to main together (author, 2026-10-21): without phase 2's
checks, code that runs but gives the wrong answer is never a graded try. Each phase gets its own live check.

1. Held replies + code checks + C/D fixes + attempt counting from runs (the foundation; helps every model
   at once).
2. Checks per milestone with the reference cross-check, ticking, attempts from checks (E for beginners).
3. Recipe as the beginner default + the teaching format.
4. The right-click "Ask tutor about this error".
5. Intermediate test teaching and the pro score.
6. The optional model checker.
