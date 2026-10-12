# lazycourse: tutor roles, language packs, exams

**Date:** 2026-10-13
**Status:** design, approved section by section in conversation (2026-10-12/13). It extends `2026-10-07-nvim-tutor-design.md` (rev 7) and replaces its old M6 row with the milestones in §9.
**Scope:** how the tutor teaches (structure and style), which roles it plays, how it turns written context into code with the learner, where language knowledge comes from (version-exact), and timed exams with grading.

## 1. Purpose and intent

The learner (solo, LazyVim newcomer, wants breadth across languages) needs a tutor that:

- **teaches clearly**: complete answers, structured so they never confuse; visuals and concrete examples over abstract wording;
- **plays distinct roles**: coding tutor, architecture professor, exam-maker, examiner. These are language-agnostic, and language knowledge comes from packs;
- **teaches context-to-code**: how to get from "task P1.T2 with requirements R1, R2, see the blueprint" to working code, step by step, with the learner doing each step;
- **knows each language as installed**: format, style, idioms and the whole core at the learner's actual versions;
- **tests the learner**: short timed challenges, graded on evidence.

Hard rules carried over: Pi stays read-only for the model (the M3 tool guard); the tutor never writes the learner's solution (the hint ladder, pro never sees code); everything is active only in tutor mode (`PI_TUTOR=1`).

## 2. Teaching style (all roles)

Delivered as a short always-on prompt section plus a `tutor-teaching-style` skill holding the full rules and examples.

Every teaching reply follows this structure. A part is left out only when it does not apply:

```
1 What's happening   diagram of the real mechanism, when it has a shape
2 Why                the concept in plain words, with all needed detail
3 Example            concrete: the learner's code or a small one-off
4 What to try        the next step, at the current rung
5 In short           one or two plain sentences
```

| Rule | Meaning |
|---|---|
| Complete | include every detail and piece of context needed to understand; never truncate to hit a length |
| Organized | the headings above keep a long answer scannable |
| Plain | define a term the first time it is used; no jargon as decoration |
| No padding | no repetition, no restating the question |
| Narrow diagrams | ≤ 40 columns, laid out vertically (Pi's pane is ~45 columns; gap #1) |

The bands still apply: pro gets no code in Example (words or a contrast with another language); beginner gets the fullest Why.

## 3. Roles (agents)

Pi has no native agents or subagents, and the community persona packages are built for manual switching, so roles live in pi-tutor. Each role is a file `pi-tutor/agents/<role>.md` (frontmatter `name`, `command`, `skills`, plus a short role prompt). The extension injects the active role along with the style section, the band, the ladder, the judgment protocol and the language card.

| Role | Command | Behaviour | Writes |
|---|---|---|---|
| coding tutor (default) | chat | hint ladder, judgment block, teaching style | nothing |
| coding tutor + design recipe | `:TutorPlan <task id>` | the workflow in §4; widget `plan k/6` | nothing |
| architecture professor | `:TutorArchitect [question]` | components, data flow and trade-offs with diagrams; no code; stays active until `:TutorArchitect off` or another `:Tutor*` role command | nothing |
| exam-maker | `:TutorExam [topic\|small\|medium]` | §6 | `exam/<id>/` only |
| examiner | `:TutorSubmit` | §6 | `exam/<id>/grade.md` only |

The active role is stored as a `tutor_role` session entry and restored on resume. The guard is unchanged; the exam roles write through the extension, like `/tutor-start` writes `spec/`.

## 4. Context-to-code: the design recipe workflow

`/tutor-plan <task id>` (`:TutorPlan`) is a prompt template plus a `tutor_workflow` entry (spec §7 "workflows"). The `tutor-design-recipe` skill holds the method so any role can use it.

```
1 Find      task + its requirements + its blueprint box  → small map diagram
2 Shape     inputs and outputs (types)                   → "argv: list[str] → Command"
3 Examples  2–3 concrete cases the learner writes        → become runnable checks
4 Steps     the job in plain words, numbered
5 Map       each step → the language construct (cookbook, §5)
6 Build     one step at a time; run; compare with the examples
```

The learner produces every artifact; the tutor asks, checks and hints.

| Band | Tutor | Learner |
|---|---|---|
| beginner | half-fills each artifact as a model; shows an unrelated mini example per construct in step 5 | completes each artifact |
| intermediate | asks one question per step and checks the answer | each artifact in full |
| pro | names the steps only | everything; the tutor reviews |

## 5. Language packs

Per language (v1: Python, Rust, Go, TypeScript, Lua), plus an **editor** pack for LazyVim itself (gap #9).

```
card        always on, ~1 page: detected version, formatter, naming, error style,
            project layout, test command, top pitfalls, controlled concept tags
cookbook    skill tutor-<lang>-cookbook: plain step → idiom (on an unrelated example),
            min-version tags, "bridge" rows from languages the learner knows,
            "read a stack trace" recipe
expert      skill tutor-<lang>-expert: adapted from fullstack-dev-skills (MIT) —
            knowledge, patterns, review checklists, rewritten to explain, never implement
reference   skill tutor-<lang>-ref: whole core from DevDocs at the installed version
```

### 5.1 Version detection

The extension, not the model, runs the language's version command once per session (`python3 --version`, `rustc --version`, `go version`, `node --version`, `lua -v`) with Pi's `pi.exec(command, args)` (types.d.ts, ExtensionAPI). That works with or without Neovim, and the model's tool guard is unaffected. A missing toolchain gives "not installed" on the card, and the reference falls back to the newest bundle. Project constraints (`pyproject.toml` `requires-python`, `Cargo.toml` `edition`/`rust-version`, `go.mod` `go`, `package.json` `engines`) are read from files. The card states both.

### 5.2 Reference from DevDocs (replaces M5's fixed source lists)

- Pick the bundle matching the detected version (`python~3.14`, `go`, `lua~5.5`, `typescript`, `node`, `rust`); if there is no exact match, take the nearest lower version, else the newest. The card warns about any mismatch (Rust: bundle 1.98 vs installed 1.90).
- Download `https://documents.devdocs.io/<slug>/index.json` and `db.json` once per version, in the background with progress (gap #10). Convert HTML to text in chunks without blocking Pi. Write `~/.pi/agent/skills/tutor-<lang>-ref/` containing `SKILL.md` (version, how to look things up), `INDEX.md` (one line per entry → file) and `references/<type>.md` (one file per DevDocs type).
- Keep the M5 pieces that still fit: the cancellable loader, atomic folder swap, `cachedSkills`, `/tutor-docs`. The fixed `SOURCES` lists are retired, and `sources.json` overrides become a DevDocs slug override.
- Later, frameworks use the same fetcher (Django, React, Flask…), loaded when dependency files mention them.

### 5.3 Adapted expert skills (option A)

Built with `/skill-creator` from `fullstack-dev-skills` (`python-pro`, `rust-engineer`, `golang-pro`, `typescript-pro`; a Lua one written fresh) and from the teaching skills (`mattpocock-skills:teach`, `learn`). Each adapted skill:

- keeps knowledge, patterns, pitfalls and `references/`;
- turns "write/implement X" into "explain, point at, check the learner's X";
- carries the upstream LICENSE text and a credit line, and records `upstream: <package>@<version>` in frontmatter (gaps #11, #12).

Pi-tutor's own skills, also built with `/skill-creator`: `tutor-teaching-style`, `tutor-design-recipe`, `tutor-exam-rubric`, `tutor-stack-traces`.

### 5.4 Loading

The project language (from the profile) selects the card (injected) and tells the model which of `tutor-<lang>-cookbook|expert|ref` exist. Pi lists all skills, and the role prompt names the ones to prefer. The concept-tag list in the card is the only vocabulary the judgment block may use; unknown tags are mapped or dropped (gap #5).

## 6. Exams

```
:TutorExam [topic|small|medium]
  exam-maker (one JSON call: level, band, weak concepts, language card)
  → exam/<id>/brief.md     task · requirements R1..Rn · examples · time limit · rubric
  → exam/<id>/examples.*   the examples as language-native tests (pytest, cargo test, go test…)
  widget "exam <id> ⏱ mm:ss"   (session entry tutor_exam {id, started, limit})
  during the exam: hints capped at rung 2
:TutorSubmit
  Neovim runs the card's test command on the project (via :TutorRun machinery, gap #3)
  examiner (one JSON call: brief, learner's files, test output, card checklist)
  → exam/<id>/grade.md     score /100 · per requirement ✔/✘ with evidence (file:line)
                           · idiom checks · late? · three next fixes · "In short"
  → profile: exams(id, language, topic, score, minutes, late, concepts) → concept ease
```

The timer is soft: going over is recorded as late and still graded. The example tests are exam material, not the learner's solution. `:TutorProgress` (gap #8) reports exam trends, rungs used over time and a concept map from the profile.

## 7. Cross-cutting fixes (from the gap review)

| Gap | Design |
|---|---|
| #2 prompt weight | a per-turn token budget: card and role ≤ ~600 tokens each; details live in skills; a "golden transcript" check verifies a given model follows the style, ladder and judgment rules |
| #4 runtime errors | a failing `:TutorRun` / test run opens an episode carrying the trace; the cookbook's stack-trace recipe teaches reading it |
| #6 memory across sessions | see §7.1 |
| #7 feedback | `/tutor-feedback too-long\|too-vague\|too-much-help\|good` adjusts style and rung and is logged in the profile |
| #13 deferred minors | M3–M5 minors fixed in M6 |

### 7.1 Memory (decision C, 2026-10-13)

Five Pi memory packages were reviewed from source (scores /40): `@pify/memory` 31, `@henryqw/pi-memory` 25, `@samfp/pi-memory` 24, `pi-memory` 24, `pi-hermes-memory` 24. None can be limited to tutor sessions. Two discard learner progress by design. Three write to stderr or the console, or add hidden model calls.

**Tutor sessions: our own learner memory**, borrowing tested MIT parts:

```
extension writes (deterministic): episodes · exams · ease           ─┐
model writes via ONE tool `tutor_remember` (guard allows by name):   ├─▶ profile.sqlite
  types learner · feedback · project · reference; secret-scanned     │   memory table + FTS5
model reads via `tutor_recall` (read-only search)                   ─┘
session_start ──▶ frozen, capped snapshot ──▶ inside the `tutor` section
```

- From `@pify/memory`: the secret scanner (`secrets.ts`, with an added `nvapi-` pattern) and the full-text search approach.
- From `@henryqw/pi-memory`: the frozen snapshot rendered into a system-prompt section at session start.
- From `/claude-memory:structured-memory`: the four memory types and the "what not to save" rules, in a `tutor-memory` skill.
- Each borrowed file keeps its LICENSE text and a credit line.
- No hidden model calls. Writes happen only when the model calls `tutor_remember`, or when the extension records facts.

**Plain `pi` sessions:** `@pify/memory` may be installed separately for general memory. Its tools are not on the tutor guard's allowlist, so it is inert inside tutor sessions.

**Fallback: switch the tutor to `@pify/memory` if ours gets too complex.** That means any of:
- the memory task grows past ~400 lines of production code;
- it needs more than 2 new tools;
- it misses its milestone's done-when check twice.

If any of these trips, the tutor uses `@pify/memory` instead (allowlisting its 5 tool names), and our profile keeps only the numbers.

## 8. Data and files

```
pi-tutor/agents/{coding-tutor,architect,exam-maker,examiner}.md
pi-tutor/packs/<lang>/card.md   (+ concept-tags list)
pi-tutor/skills/                tutor-teaching-style, tutor-design-recipe, tutor-exam-rubric,
                                tutor-stack-traces, tutor-<lang>-cookbook, tutor-<lang>-expert
                                (bundled with the package; LICENSE + credits for adapted ones)
~/.pi/agent/skills/tutor-<lang>-ref/   generated from DevDocs per installed version
<project>/exam/<id>/{brief.md, examples.*, grade.md}
profile.sqlite v2: exams, feedback, memory (+ FTS5) tables; concept tags normalized per pack
session entries: tutor_role, tutor_workflow, tutor_exam
```

## 9. Milestones

| Phase | Deliverable | Done when |
|---|---|---|
| M5-finish | DevDocs reference + version detection (+ background download and progress) replaces the fixed source lists; then merge M5 | `:TutorDocs python` on this machine writes `tutor-python-ref` for 3.14 and a rung 3 hint cites it |
| M6 roles | teaching-style section + skill (narrow diagrams), role files and injection, `:TutorPlan` workflow, `:TutorArchitect`, prompt budget + golden transcript, runtime-error episodes, tutor memory (§7.1: `tutor_remember`/`tutor_recall` + frozen snapshot), `/tutor-feedback`, M3–M5 minors | a beginner `:TutorPlan P1.T1` walks all six steps in the tmux check, with replies in the structure |
| M7 packs | cards and cookbooks for 5 languages + editor pack; adapted expert skills via skill-creator with licenses and upstream versions; concept-tag vocabulary | a Python project's first turn shows the 3.14 card and a cookbook recipe is used at step 5 |
| M8 exams | `:TutorRun` from README `run:`/`test:` + per-language test runners, exam-maker, examiner, soft timer, grades, profile v2, `:TutorProgress` | `:TutorExam small` → solve → `:TutorSubmit` produces `grade.md` with test evidence |

The old M6 items (task ticking from `task_done_ids`, `:TutorRun` reading the README, workflow `step k/n`) are absorbed: workflow steps go to M6, `:TutorRun` to M8, and task ticking to M8, where it shares the grading code.

## 10. Risks

- Free-tier latency (9–60 s per call): exams make at least 2 calls. Mitigation: the loaders can be cancelled, there is a token budget, and the default model is fast.
- DevDocs format or URL changes: the fetcher is one module with its own tests against a local fixture server; a failure only warns.
- Adapted skills drift from upstream: the version is recorded, and a diff command is planned in M7.
- Model compliance with the structure: golden-transcript checks per model; `/tutor-feedback` catches drift in use.
