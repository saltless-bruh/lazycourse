# lazycourse: onboarding as a conversation, learn-first lessons

**Date:** 2026-10-19
**Status:** design, settled with the user in a question-by-question session on 2026-10-19 (answers Q1–Q27 below; a builder check raised Q20–Q23).
**Extends:** `2026-10-07-nvim-tutor-design.md` §6 (profile, interview, project suggestion, scaffold) and
`2026-10-13-tutor-roles-packs-exams-design.md` (packs, exams, sandbox). Replaces the fixed `/tutor-start`
interview (`start.ts` `runStart`, `interview.ts` `runInterview`).

## 1. Why

On 2026-10-19 the author took the course as a beginner (real Neovim, Pi 1.3.0, the deliberately weak
`nemotron-3.5-lightning` model). The user's verdict on onboarding: "it does not fit my taste yet". Today
`/tutor-start <lang>` is a form:
1. five fixed menu questions;
2. three model-suggested projects;
3. a folder prompt whose default is invisible;
4. about 8 minutes of spinner while the spec and docs are written.

It never explains its choices, never asks what the learner wants to do first, and has no way to learn a
concept before building.

The user wants it to feel like the first meeting with a real tutor: "I'm not filling out a form for it to
learn. I want to have that talk with an IRL tutor, for it to know my level, my skill, etc."

The user tests with a weak model on purpose (GPT-6 is available but hides system flaws), so everything
here must hold with a weak model. The checks and limits live in code; the model only writes the
conversation.

## 2. Goals

- `/tutor-start` is a conversation in the normal Pi chat. The tutor asks, the learner answers in their own
  words, and the tutor follows up.
- The tutor finds out, in conversation:
  - **experience:** none, under a year, 1–3 years, over 3 years;
  - **languages already known;**
  - **target language:** recommended by the tutor if the learner knows none, otherwise the learner's choice;
  - **level in the target language;**
  - **whether the learner has an idea to build;**
  - **build now, or learn first.**
- It explains its choices in plain words, at minimum "why this language" and "why this project".
- **Learn first** exists: short lessons on the concepts the project needs, each with small exercises that
  real tests check, interleaved with building small milestones.
- No dead waiting: the spec is written in the background.

## 3. Non-goals

- Fixing answer-leaking at every hint level (finding A) and the tutor never asking questions back
  (finding B) during normal tutoring. Finished tasks never being ticked (finding E) is out too. These
  three are a second project, designed straight after this one (Q18).
- The minors sweep (~60 deferred items) happens after both projects. Items in code this design replaces
  are dropped, not fixed (Q19).
- Lessons written live by the model. Lessons are prepared and checked in advance (Q8).
- A general language tour, or exercises unrelated to the chosen project (Q3 chose project-tied lessons
  plus exercises).

## 4. Anti-goals (a failure even if it technically works)

- It still feels like a form: menu after menu, or questions asked without a reason given.
- A weak model wanders and the conversation never ends, or ends without the facts it needed.
- The learner is buried in lessons before writing any project code.
- The level check feels like an exam.
- A wrong example in a lesson (a model invention) teaches the learner something false.
- Connecting context7 opens a way around the read-only rule. Today Pi's `--tools` list does not filter MCP
  tools unless an entry starts with `mcp__`, and adding an MCP server auto-enables `codemode`, Pi's
  script-running tool.

## 5. The flow (decided)

```
/tutor-start [language?]
  │
  ▼ conversation in the Pi chat (Q2, Q6)
  │   checklist tracked in code: experience · languages known · target language
  │                              · level in it · idea? · build or learn?
  │   each reply carries a hidden note of what was learned; code tracks what is still missing
  │   ≈6 exchanges at most, then the tutor asks only the missing items directly
  │
  ├─ knows no language ──▶ tutor recommends one with reasons; learner may override (Q1)
  ├─ language named ─────▶ self-score 1–10 and confidence (Q1); then (Q7):
  │                          score < 5  → 1–2 short technical questions
  │                          score ≥ 5  → a small task ("write a function that …"), checked by
  │                                       real tests in the exam sandbox; no timer, no grade (Q13);
  │                                       a prepared task in a scratch file opened in Neovim (Q20)
  │                        naming a hard first language gets one honest line, not an argument (Q1)
  ▼
  "here's my read of you": level, what it is based on; the learner can correct it (Q6, Q7)
  ▼
  idea?  yes → learner describes it
         no  → ONE easy project, with why it suits them, plus "show me something else" (Q4)
  ▼
  build now, or learn first?
  ├ build ─▶ project folder (the default is shown) ─▶ spec
  └ learn ─▶ lessons (§7) interleaved with building milestones (Q15)
```

- **Moving into the project (Q23):** as soon as the project is chosen, the folder is created (its default
  shown) and Pi restarts there. The conversation continues in the new session from saved state, and the
  spec and lessons happen inside the project. The restart is announced as a natural break ("let's set up
  your project folder…").
- **The level task (Q20):** written in a scratch file the tutor opens in Neovim
  (`~/lazycourse/.checks/<language>/`), checked by the sandbox. The tasks are prepared, not
  model-written: Exercism practice exercises that exist in all six tracks with shared test data, on one
  difficulty ladder for every language, `leap` → `raindrops` → `isogram` → `luhn`.

- **Questions that no longer apply are dropped (Q5).** "How familiar are you with <language>" is asked
  only when the learner named the language. "Time per project" is not asked of beginners (always small).
- **The spec is written in the background (Q10, Q22).** Generation starts after the build/learn choice
  (and, for learn first, the concept selection), while the first lesson or the project talk runs. If the
  learner builds right away, the tutor talks about what the project involves while the spec is written,
  instead of showing a bare spinner.
- **Second `/tutor-start` (Q9).** With a profile row for the language, the tutor checks in instead of
  repeating the whole conversation: last project, what was hard, what has changed. Then it suggests a
  project.
- **Correcting the read.** The learner can correct "here's my read of you". The level the tutor sets is
  shown with its reason. For example: "you said 6 and your function passed both tests, so I'll start you
  at intermediate".

## 6. The conversation mechanism (decided in outline)

- The conversation runs as ordinary chat turns while an onboarding state is active. It uses the same
  pattern as the existing `tutor-judgment` block: each tutor reply ends with a hidden, fenced note
  (`tutor-intake`, JSON) recording the checklist items it learned. The extension parses it, updates the
  state, and tells the model next turn what is still missing.
- The note is never shown to the learner. (Today the judgment fence is visible, finding D. This design
  must not repeat that for the intake note.)
- **Safety net:** after about 6 exchanges, or when a note is missing or malformed twice, the extension
  asks the remaining items itself, one plain question each (the existing `ctx.ui` dialogs are allowed as
  this fallback). The conversation always ends with the checklist complete.
- **Stopping:** the learner can stop at any time (`/tutor-start off`, or Esc in a fallback dialog). The
  partial state is kept, so the next `/tutor-start` resumes it.
- **Model-written explanation, code-owned decisions:** the model writes "why this language" and "why this
  project". The code chooses the language, the level number and the next step, from the checklist.

## 7. Learn-first lessons (decided)

- **What a lesson is (Q3, Q8):** one concept the project needs, built from:
  - the language cookbook entry (`skills/tutor-<lang>-cookbook`);
  - a link into the language's own docs;
  - 1–2 small exercises with real tests, run in the exam sandbox.

  Lessons and exercises are prepared once per language and checked by the cookbook runner
  (`npm run cookbooks`), starting with Python.
- **Which concepts (Q14):** only those the learner is weak in, judged from the conversation and the
  profile's concept ease. Every lesson offers "skip, I know this". A skipped concept counts as known
  until the learner gets stuck on it.
  A beginner also gets what those lessons build on: each lesson's `requires` (Exercism's
  `prerequisites`; ours from what the exemplar uses), followed through, and nothing else. A lesson that
  states none (rustlings) needs every earlier one. Prerequisites always come first. (Changed 2026-10-20:
  "every lesson before the last needed one" planned 13 lessons for a three-concept project.)
- **Plan size (2026-10-20):** the plan request carries a budget (at most 3 tasks per milestone, 8
  without milestones, 3 subtasks per task for beginners, design at most 30 lines) and requirements per
  task, not per subtask. The weak model failed the unbudgeted 45-task plan five times in a row.
- **Pacing (Q15, Q22):** at most 3 concepts per round, then a tiny build milestone that uses only those
  concepts. Milestones are slices of the project's own `spec/tasks.md`: the spec writer receives the
  lesson rounds and groups the tasks so that each milestone needs only concepts already taught. The rhythm is learn → build → learn → build. A learner new to everything sees running code
  within roughly the first half hour.
- **Bridges (Q16):** if the profile shows another language, lessons use the cookbook's bridge lines ("in
  Python you wrote `def`; here it's `function` plus types"). A concept known from elsewhere gets one
  example and one exercise instead of a full lesson.
- **Stepping back (Q17):** failing the same exercise twice, or the learner saying they are lost, makes the
  tutor step back on its own (a smaller piece, another example, an easier exercise). It says so in one
  line.
- **Fully new learners (Q14 follow-up):** a learner new to programming who picks a hard first language
  (TypeScript, Rust) is taught programming ideas through that language, at the slower pace.

## 7a. Lesson sources: established curricula only (Q21, Q25–Q27)

The user requires lesson content backed by real evidence, not generated. Lessons are vendored from
established, openly licensed sources, verified 2026-10-19 (licence files read, sample tests run offline):

| Language | Lesson text | Exercises with real tests |
|---|---|---|
| Python | Exercism concept docs + the Python tutorial (PSF License v2) | Exercism concept exercises (17 active) |
| Go | Exercism concept docs | Exercism concept exercises (27), plain `go test`, offline |
| JavaScript | Exercism concept docs | Exercism concept exercises (29), converted from Jest |
| Rust | The Rust Book (MIT/Apache-2.0) | rustlings (MIT) + Exercism concept exercises |
| TypeScript | TS Handbook (CC BY 4.0) + Exercism JS concept docs | Exercism practice exercises (no concept syllabus exists) |
| Lua | Lua 5.4 manual | Exercism practice exercises (no concept syllabus exists) |

- **Order (Q27):** Python → Go → JavaScript → Rust → TypeScript → Lua, one plan task per language, so a
  thin language never holds up the others.
- **Converted tests (Q26):** Jest tests become `node --test` + `node:assert`; busted tests become plain
  `lua` with the existing Lua harness; Python concept tests drop their `pytest` imports and markers and
  run under `unittest`. A converted test is trusted only when the source's own exemplar solution passes it,
  and the stub fails it, in the sandbox. Nothing new is installed.
- **Gaps (Q25):** no established source tests reading input or files. Lessons for those are written by
  us, with their explanation text cited from the official docs (Python tutorial, Go by Example under
  CC BY 3.0 with attribution, the Rust Book), and their tests are trusted only after a reference solution
  passes them. TypeScript and Lua lessons are practice exercises plus the official docs, and the README
  marks them as thin.
- **Python gaps inside Exercism:** `functions` has docs but no exercise, and the `errors`/`files` docs are
  empty stubs. These are covered by the Python tutorial text and our own tested exercises, as above.
- **Licences:** each vendored source keeps its licence text and copyright line and a NOTICE naming the
  repo and commit (Exercism: MIT "Copyright (c) 2021 Exercism"; rustlings: MIT; Python docs: PSF notice
  and licence; Rust Book: MIT or Apache). CC BY sources (Go by Example, TS Handbook) get an attribution
  line with author, licence link and "changes made". Non-commercial or share-alike sources (javascript.info,
  Think Python, learnxinyminutes) and all-rights-reserved ones (Programming in Lua, the freeCodeCamp
  curriculum) are not used.
- **Remaining research artefacts:** the researched clones are in the session scratchpad; the plan re-fetches
  pinned commits rather than relying on them.

## 7b. Remembering what was learned: spaced repetition (Q24)

- `ts-fsrs` (MIT, TypeScript) keeps one FSRS card per `(language, concept)` next to today's `ease`, a
  running mean that never fades (`profile.ts`). Episode outcomes, lesson exercises and exam requirements
  become FSRS ratings. The code decides which concepts are due for a short review; the model does not.
- A profile schema bump (v5) adds the cards; old rows start as new cards seeded from `ease`.
- Reviews appear as a short "quick review" before a lesson or at `/tutor-start` check-in, never mid-exam.

## 7c. Tools considered and not adopted (research 2026-10-19)

Checked against their repos and licences: agentmemory and xerj (duplicate the SQLite memory and add
daemons), khoj (a competing product, AGPL-3.0), WeKnora (a team-scale Docker stack), codegraph (needless
tools for small projects, telemetry on by default), OmniRoute (a model router, not teaching). Later, if
needed: book-to-skill (once a specific licensed book is chosen), sqlite-vec with a local embedding model
(only if FTS5 recall measurably misses memories).

## 8. Docs and context7 (decided)

- **Docs lookup order (Q11):** the offline DevDocs reference already downloaded per language
  (`tutor-<lang>-ref`, version-exact, built from e.g. docs.python.org) first; context7 second, for
  anything DevDocs lacks, including third-party libraries.
- **Who calls context7 (Q12):** the model, as a read-only lookup like `read`. Only context7's two tools
  (`resolve-library-id`, `query-docs`) are allowed. `codemode` stays off and the `tool_call` guard
  rejects every other MCP tool.
- **Independent hardening (Q12):** the tutor's Pi launch (`nvim-tutor/lua/tutor/init.lua`, the `--tools`
  list) must block all MCP tools except the allowed ones. A server added to `~/.pi/agent/mcp.json` later
  must not get past the read-only rule. This is a fix to the current code as well as part of this design.
- **Facts (2026-10-19):** Pi 1.3.0 supports MCP (`~/.pi/agent/mcp.json` or `.pi/mcp.json`; stdio or
  HTTP; `pi mcp list`; docs in `node_modules/@earendil-works/pi-coding-agent/docs/mcp.md`). No MCP server
  is configured for Pi on this machine; context7 is configured only for Claude Code.

## 9. Constraints

- All project rules in `CLAUDE.md` hold:
  - no stdout/stderr inside Pi;
  - every new Pi API is verified in `types.d.ts` and recorded in `PI_SURFACE.md` (now Pi 1.3.0);
  - editor paths stay inside the project root;
  - `bash` stays off;
  - TDD.
- It must work with `nemotron-3.5-lightning`. Every model output the code depends on (the intake note,
  the exercise results) is parsed defensively, with a code-owned fallback.
- Exercise code runs only in the exam sandbox (bubblewrap, on by default).
- The six pack languages: python, rust, go, typescript, lua, javascript. Prepared lessons start with
  Python; other languages fall back to building straight away (or cookbook-only lessons, the builder's
  call) until their lessons exist.

## 10. Left to the builder (my calls, marked as such)

- **Lesson storage (guess, confirmed by the user in playback):** a lesson's exercises live in a folder
  inside the project (for example `learn/<concept>/`), like `exam/<id>/`. Passing an exercise's tests marks
  the concept known in the profile (concept ease).
- **Lesson content location (guess, confirmed):** vendored per language next to the packs, with each
  source's licence and NOTICE, checked by a runner like the cookbook runner (exemplar passes, stub fails).
- The exact checklist field names, the `tutor-intake` JSON shape, the profile schema bump, the background
  spec job's mechanics, and how the learn/build rhythm is shown in the widget.
- How "here's my read of you" maps the self-score, confidence and check result to the 0–100 level.
- Which ~6 exchanges limit, and the fallback dialog wording.
- **Language for a learner who knows none (my call, from Q1):** always Python. The tutor's explanation
  ties the reasons to what the learner said they want to build.
- **context7 setup (my call):** the user adds context7 to Pi once by hand (`~/.pi/agent/mcp.json`), with
  `direct` exposure and `autoEnableCodemode: false`; the README documents it. The tutor works without
  it, using DevDocs only. The `--tools` list names the exact Pi tool names
  `mcp__context7__resolve_library_id` and `mcp__context7__query_docs`. context7 sends the model's search
  queries to an outside service; the README says so.

## 11. Order of work

1. This design: onboarding conversation, learn-first lessons from established sources (Python first),
   spaced repetition, context7 with the MCP lock-down.
2. Next project (design straight after): A, the answer given at every hint level, enforced in code;
   B, the tutor asks the learner a question before explaining; E, tasks ticked from real test results.
3. Minors sweep, of whatever survives the two projects.

## 12. Evidence (learner session 2026-10-19)

- Onboarding: 5 menus, 3 projects, a folder box with an invisible default, ~8 min of spec + docs.
- The scaffolded plan duplicated tasks (P1.T1 = P1.T1.S1) and contradicted itself ("project root" vs
  `src/`).
- Fast typing into Pi's autocomplete turned `/tutor-start python` into the language "pytutor-architect",
  which `/tutor-start` accepted. The new flow validates the language against the six pack languages.
