# nvim-tutor: an AI that teaches you to code, inside LazyVim

**Date:** 2026-10-07
**Status:** living document (rev 7, 2026-10-12: M5 skill reads in the guard, JSON source
overrides, learned skills global, ease applied at first judgment; rev 6, 2026-10-12: M4 interview choices, switch into the
project after scaffold, ease formula; rev 5, 2026-10-12: M3 stuck rules, chat episodes,
one nudge per episode, guard blocks bash, tutor mode only under `PI_TUTOR=1`;
rev 4: M2 editor context as a hidden
message, level persistence; rev 3: Pi's own TUI in a terminal split, extension
is a Neovim RPC client). Personal tool; expect frequent revision.

## 1. Purpose

A LazyVim-based Neovim setup with a side panel in which an AI acts as a
tutor, not a code generator. It suggests a project matched to the user's
skill in a chosen language, scaffolds a spec folder for it, gathers the
language's best practices and idioms, and coaches the user while they
write the code themselves. Coaching intensity is set by a level slider
from beginner (explains how code works and is structured) to pro
(knowledge and hints only, never code). Hints get more concrete only as
the user reasons correctly.

Single user, personal tool. Goal: breadth across many languages and
small projects, with a tutor that adapts per language.

Non-goals: shipping the projects, multi-user support, writing code for
the user, cloud sync, building our own agent runtime.

## 2. Architecture

The agent runtime is **Pi** (`@earendil-works/pi-coding-agent`, 1.x,
requires Node ≥ 22.19). Pi's own interactive TUI *is* the tutor pane: it
runs inside a Neovim terminal split. Our code is a Pi package and a thin
Neovim plugin.

```
┌──────── editor (55%) ────────┬──────── :terminal  pi (45%) ───────────┐
│ buffers, LSP, your code      │  Pi TUI: logo · conversation · prompt  │
│                              │  ┌ tutor widget: lang · lvl · rung ·   │
│                              │  │ task · state                        │
│  Neovim RPC server ($NVIM) ◀─┼──┤ pi-tutor extension (Neovim client)  │
│   push: diagnostics, idle,   │  │  policy · stuck · ladder · profile  │
│         churn, run output    │  │  suggester · scaffold · knowledge   │
│   pull: buffer, cursor,      │  └─────────────────────────────────────┘
│         diagnostics (on turn)│  footer: model · thinking · tutor lvl  │
└──────────────────────────────┴────────────────────────────────────────┘
```

Units:

- **nvim-tutor** (`nvim-tutor/lua/tutor/`): opens, hides, and respawns
  the terminal split; `:Tutor`, `:TutorRestart`, `:TutorRun`; thin
  `:Tutor*` wrappers that type Pi slash commands into the terminal.
  No tutor logic, no protocol.
- **pi-tutor** (`pi-tutor/`): a Pi package. Its extension connects to
  Neovim over `$NVIM` (set automatically for terminal children) with the
  official `neovim` Node client, installs a few autocmds that notify it,
  pulls editor state on demand, and renders tutor state with Pi's
  extension UI. All tutor logic lives here.
- **Pi**: unmodified upstream.

## 3. Integration contract and upgrade strategy

This section exists so Pi, Neovim, and our two pieces can each be
upgraded without touching the others.

### 3.1 What we depend on in Pi

Only the documented supported surface:

- **Interactive mode** (`pi`), run inside a Neovim `:terminal`. RPC
  mode is no longer used.
- **Extension API**: `pi.on("before_agent_start" | "tool_call" |
  "turn_end" | "session_start" | "session_shutdown")`,
  `pi.registerCommand`, `pi.appendEntry`, `pi.sendUserMessage`,
  `ctx.ui.setWidget/setStatus/setWorkingMessage/select/confirm/input/
  editor/notify`.
- **Neovim API** (from the extension, via the `neovim` npm client over
  `$NVIM`): `nvim_exec_lua`, `nvim_buf_get_lines`,
  `nvim_get_current_buf`, `nvim_buf_get_name`, `nvim_win_get_cursor`,
  `nvim_subscribe`, and `vim.rpcnotify` from autocmds installed with
  `nvim_exec_lua`.
- **Packages**: `package.json` with a `pi` key listing `extensions`,
  `skills`, `prompts`; registered in `~/.pi/agent/settings.json`
  `packages` as a local path (dev) or git URL (install).
- **Tool selection**: `--tools` flag or `defaultTools` setting.

Everything above is referenced by name in `pi-tutor/PI_SURFACE.md` with
the Pi version it was verified against, so an upgrade review is a
checklist, not a search.

### 3.2 Ownership and update paths

| Component | Lives in | Updated by |
|---|---|---|
| Pi runtime | global npm or install script | `npm install -g @earendil-works/pi-coding-agent` |
| pi-tutor package | `pi-tutor/` in this repo, registered in Pi `packages` | `git pull`, then `pi update --extensions` or `/reload` |
| nvim-tutor plugin | `nvim-tutor/` in this repo, a lazy.nvim `dir=` or git plugin | `:Lazy update` |
| `neovim` npm client | `pi-tutor/package.json` dependency | `npm update` inside `pi-tutor/` |
| Knowledge base | `~/.pi/agent/skills/tutor-*/` and project `.pi/skills/` | editing files; Pi rescans on `/reload` |
| Profile | `~/.local/share/nvim-tutor/profile.sqlite` | the extension; `schema_version` table, migrations in code |

### 3.3 Version pinning

- `pi-tutor/package.json` declares `peerDependencies` on the Pi package
  with the verified range (`^1.0`). On `session_start` the extension
  reads Pi's version and emits a `tutor_status` warning if outside the
  range. It does not refuse to run.
- The Lua plugin checks `pi --version` on spawn and shows the same
  warning in the panel.
- Upgrading Pi: read its CHANGELOG "Breaking Changes" entries since the
  pinned version, update `PI_SURFACE.md`, bump the range, run the
  pi-tutor test suite, which exercises every hook through Pi's SDK.

### 3.4 The contract between our two pieces

There is no protocol of ours. Neovim → extension traffic is Neovim's own
`rpcnotify` from autocmds the extension installs; extension → Neovim
traffic is ordinary Neovim API calls. The only shared names are the
notification method `tutor` and its payload shapes:

```
{ kind: "diagnostics", buf, path, errors, warnings, first: {line, msg} }
{ kind: "idle",        buf, path, line, since_ms }
{ kind: "churn",       buf, path, region: [l1, l2], edits }
{ kind: "run_output",  cmd, code, stdout, stderr }
```

If `$NVIM` is absent (Pi started outside Neovim) the extension runs
detached: chat works, editor signals are off, the widget says
`detached`.

### 3.5 Why not pi.nvim

`adragomir/pi.nvim` has a terminal mode similar to ours but adds a TCP
RPC layer we do not need. Our terminal wrapper is about 40 lines of Lua.

## 4. Level policy

The slider is one integer 0–100 stored per language in the profile.

| Band | Range | Observes | Voice | Intervenes |
|---|---|---|---|---|
| Beginner | 0–33 | snapshots + diagnostics + idle + run output | explains structure, syntax, why each part exists | on every new error, or 2 min idle |
| Intermediate | 34–66 | diagnostics + idle + run output | names the concept, points at docs | error after 1 min, or 5 min idle |
| Pro | 67–100 | diagnostics + idle + run output | hints and knowledge only, never code | error after 3 min, or 10 min idle |

Within a band the number scales idle thresholds linearly between the
band's neighbours and sets the starting rung: beginner 3, intermediate
2, pro 1. The slider can change mid-session and takes effect on the
next turn.

Implementation: `before_agent_start` selects the band prompt section
from `pi-tutor/prompts/system/<band>.md` (plus the shared
`judgment.md` turn protocol) and sets `systemPromptOptions` sections;
it never replaces Pi's whole prompt, so Pi's own skill and instruction
loading keeps working. It also *pulls* editor context for the turn by
band and returns it from `before_agent_start` as a hidden custom
message (`tutor_editor`, `display: false`): beginner gets the whole
current buffer (capped at 400 lines) plus diagnostics; intermediate and
pro get diagnostics and the 40 lines around the cursor. Nothing is
pulled while Pi is idle. Only buffers whose path is inside the project
root are ever read. The level defaults to 50 until `/tutor-level` or
the profile sets it, and is persisted as a `tutor_level` session entry
that `session_start` restores. Idle and error thresholds interpolate
linearly between band midpoints (17, 50, 83) and clamp outside.

## 5. Hint ladder and stuck episodes

A **stuck episode** opens when the stuck detector fires (a diagnostic
persisting past the band's error threshold, or idle/churn past the idle
threshold) or when the user sends a chat message. It closes when the
triggering diagnostic clears, a run passes, or the model judges the
user's message as "got it".

```
rung 1  question      "What does the compiler think the type of `x` is?"
rung 2  concept       names the idea
rung 3  pointer       cites a skill/doc reference + where in the code to look
rung 4  pseudocode    the shape of the fix, no real syntax
rung 5  reveal        the actual line(s) with a one-sentence why
```

Rules:

- The system prompt asks the model to end every turn with a fenced
  `tutor-judgment` JSON block: `{judgment: correct|partial|wrong|none,
  concept_tags: [], task_done_ids: [], episode_closed: bool}`. The
  `turn_end` hook parses it, strips it from what Neovim displays (Lua
  hides the block), and applies: `correct` advances one rung, `partial`
  and `wrong` hold.
- Rung 5 is never reached from `wrong` or empty. Pro band caps at 4.
  No manual override.
- Episode state lives in `pi.appendEntry("tutor_episode", ...)` so it
  survives session resume, and is mirrored to the profile on close.
- Concepts with ease ≥ 0.7 start one rung lower next time (floor 1).
- Beginner band may send proactive explanations outside an episode, at
  most once per 2 minutes.
- Detector rules (M3): an error is its file plus first-error message and fires once; idle
  fires once per idle stretch; churn fires when the same 20-line region of a file that has
  an error churns twice within the idle threshold (churn alone is just typing). A trigger
  refused because an episode is open is not consumed. Only error episodes hold their place;
  an editor trigger replaces an open chat, idle or churn episode (`superseded`). An
  editor-triggered episode sends one `[tutor]` nudge, only if Pi is idle and no nudge was
  sent in the last 2 minutes. Only replies with `stopReason: "stop"` are judged.

## 6. Profile, interview, project suggestion, scaffold

Profile: `~/.local/share/nvim-tutor/profile.sqlite`, opened by the
extension with `node:sqlite` (Node 22+ built-in, no native deps).

Tables: `schema_version(v)`, `languages(name, level, interview_json,
created)`, `concepts(language, tag, ease REAL, episodes INT)`,
`episodes(id, language, project, concept_tags, rungs_used, turns,
opened, closed)`, `projects(id, language, path, title, status,
created)`.

Flow (`/tutor-start`, triggered from Neovim `:TutorStart`):

```
pick language ──▶ profile row exists? ──no──▶ interview via ctx.ui.input
                       │ yes                   (4–6 questions)   │
                       ▼                                          ▼
             suggest 3 projects (ctx.ui.select) ◀──── write row, initial level
                       │
       user picks one ──▶ scaffold into a user-chosen directory
                          and fetch language knowledge if not cached
```

- Interview and selection use Pi's extension UI (`ctx.ui.input`,
  `ctx.ui.select`), rendered by Pi's TUI in the terminal split.
- Suggester receives profile, concept scores, completed projects and
  must return structured JSON. It biases toward low or missing concept
  scores. Sizes: small (1–2 h), medium (half day), large (1–2 days).

Scaffold, written by the extension only inside the chosen directory:

```
<project>/
├── README.md            goal, run command, how to talk to the tutor
├── AGENTS.md            project-level tutor instructions (Pi reads these)
├── .pi/skills/          project-local knowledge (empty at start)
├── spec/
│   ├── design.md        blueprint: ASCII architecture diagram, components,
│   │                    data flow, list of functions/features/services
│   ├── tasks.md         phases → tasks → subtasks with stable ids
│   │                    (P1.T2.S3), what to build, files, done-when, [ ]
│   └── requirements.md  per task id: inputs, outputs, constraints,
│                        concepts needed, acceptance criteria
└── src/<entry file>     empty except a comment pointing at tasks.md
```

- Detail scales with level: beginner gets subtasks down to "define a
  function that takes X and returns Y"; pro gets tasks and requirements
  only.
- `tasks.md` is the progress source. The extension ticks boxes from
  `task_done_ids`; it never edits `src/`.
- The three spec files come from one structured call so they stay
  consistent.
- M4 rulings: the interview asks experience, familiarity and size as choices (they set the
  starting level: familiarity 15/45/80, experience −10/0/+5/+10) and languages known and goal as
  free text. After scaffolding, `require("tutor").switch(dir, "spec/tasks.md")` cds Neovim into
  the project and restarts Pi there, so the tool guard, `AGENTS.md`, and the editor root all
  follow. Ease per concept is the mean of episode scores `1 − (rung − start)/(cap − start + 1)`.
  The scaffold does not create `.pi/skills/` yet: any `.pi/skills` makes Pi ask "trust this
  folder?" on first open; M5 creates it when it writes the first skill. Profile writes use the
  project's language (from the profile), never the open buffer's filetype.

## 7. Knowledge base: skills, instructions, workflows

All three map onto Pi primitives; we add no retrieval engine.

| Concept | Pi primitive | Location | Loaded |
|---|---|---|---|
| Instructions | agent instruction files (`AGENTS.md`) | `~/.pi/agent/AGENTS.md` (global), `<project>/AGENTS.md` | every turn |
| Skills | `SKILL.md` directories | `~/.pi/agent/skills/tutor-<lang>-*/`, `<project>/.pi/skills/` | on demand by name/description |
| Workflows | prompt templates | `~/.pi/agent/prompts/tutor-*.md`, pi-tutor package `prompts/` | as `/` commands |

How they are **used**:

- Pi advertises every skill's name and description in the system prompt
  and loads the body when the model asks. The band prompt tells the
  model to consult `tutor-<lang>-*` skills before giving a rung 3
  pointer and to cite the skill name.
- Workflows are prompt templates with ordered steps; the extension
  tracks the active step in a `tutor_workflow` entry and shows
  `step k/n` in the status line.

How they are **added**:

- **Fetched docs**: `/tutor-start` for a new language runs
  `knowledge/fetch.ts`, which pulls the language's source list (official
  style guide, idiom guide, stdlib overview) and writes one skill per
  topic: `SKILL.md` with a model-written description plus
  `references/*.md` holding the raw text. v1 ships source lists for
  Python, Rust, Go, TypeScript, Lua; other languages get a visible "no
  cached docs" status and rely on model knowledge.
- **User notes**: edit any skill folder directly; Pi rescans on
  `/reload`, which the Lua plugin triggers with `:TutorReload`.
- **Learned skills**: `/tutor-learn` after a closed episode drafts a
  skill from the episode (concept, misconception, fix pattern) and shows
  it via `ctx.ui.editor` for accept, edit, or discard. Never auto-saved.
- M5 rulings: the tool guard also allows reads inside every skill folder Pi loaded
  (`pi.getCommands()` skill paths), since skills load through `read`. Source overrides live in
  `~/.config/nvim-tutor/sources.json` (`{ "<lang>": [{ "slug", "title", "urls" }] }`; a listed
  language replaces the built-in list). Learned skills are saved globally as
  `tutor-<lang>-learned-<slug>` (project `.pi/skills` would trigger Pi's trust prompt). The
  ease start rung is applied at an episode's first judgment, when its concept tags are known.
- Project-local `.pi/skills/` and `AGENTS.md` override global ones by
  Pi's normal precedence.

## 8. Neovim plugin

LazyVim spec in `lua/plugins/tutor.lua`; module in
`nvim-tutor/lua/tutor/`. No plugin dependencies.

```
nvim-tutor/lua/tutor/
├── init.lua   setup(), :Tutor, :TutorRestart, :TutorRun,
│              :TutorStart/:TutorLevel/:TutorLearn → type "/tutor-…" into Pi
└── term.lua   open a right split (45%) running
│              `pi --tools read,grep,find,ls` with cwd = project root;
│              hide/show without killing the job; respawn; send text
```

- The split is created once per Neovim session and hidden/shown after
  that, so Pi's session and scroll-back survive toggling.
- Entering the split starts terminal-insert mode; `<Esc><Esc>` leaves it
  so Pi's single `Esc` (abort) keeps working.
- `:TutorRun` runs the project's run command (from `README.md` front
  matter or `config.toml`) as a background job and sends
  `{kind:"run_output"}` to the extension with `vim.rpcnotify`.
- The push autocmds (diagnostics, idle, churn) are installed *by the
  extension* through `nvim_exec_lua` when it connects, so the Lua
  plugin has nothing to keep in sync with the extension.

Tool fence: Pi runs with `--tools read,grep,find,ls`, and the `tool_call` guard (M3) blocks
every other tool, including `bash` (no read-only shell filter: the learner runs code with
`:TutorRun`), and any read/grep/find/ls path whose realpath is outside the project root.

Tutor mode: pi-tutor is installed in Pi's global `packages`, so it loads in every Pi
session. The split starts Pi with `PI_TUTOR=1`; without it the extension registers
nothing, so a plain `pi` elsewhere is untouched.

## 9. pi-tutor package internals

```
pi-tutor/
├── package.json         "pi": { extensions, skills, prompts }; deps: neovim
├── PI_SURFACE.md        every Pi and Neovim API we touch + verified version
├── extensions/tutor/
│   ├── index.ts         registers hooks, commands, widget
│   ├── nvim.ts          connect($NVIM), install push autocmds, pull helpers,
│   │                    open file:line in the editor
│   ├── ui.ts            setWidget / setStatus / setWorkingMessage rendering
│   ├── policy.ts        band table, thresholds, start rung
│   ├── stuck.ts         push events → open/close episodes
│   ├── ladder.ts        rung logic, judgment application
│   ├── judgment.ts      parses tutor-judgment block from turn_end
│   ├── profile.ts       node:sqlite access + migrations
│   ├── suggest.ts       interview, suggester, scaffold writer
│   └── knowledge/fetch.ts   source lists → skill folders
├── prompts/system/{beginner,intermediate,pro}.md, workflows
├── skills/              bundled generic skills
└── test/                vitest; nvim.ts tested against a real headless nvim
```

- Every tutor turn is one Pi turn; the model ends it with a fenced
  `tutor-judgment` block `{judgment, concept_tags, task_done_ids,
  episode_closed}` that `turn_end` parses. Pi's TUI shows the block;
  a message renderer may fold it later.
- Tutor state is shown only through Pi's UI: a two-line widget above
  the prompt (`lang · lvl · rung · task` / episode state), a short
  footer status, and a labelled working message during turns.
- Proactive tutor messages use `pi.sendUserMessage(text,
  {deliverAs: "followUp"})`, prefixed `[tutor]`.
- Rung ≥ 3 hints with a `file:line` open that location in the editor
  via `nvim_exec_lua`.
- Config `~/.config/nvim-tutor/config.toml`: idle overrides, run
  command, knowledge source overrides. Model and provider are Pi's.

## 10. Milestones

| Phase | Deliverable | Done when |
|---|---|---|
| M1b | Terminal split + extension as Neovim client + widget; delete RPC panel | `:Tutor` shows Pi; opening a file with an error updates the widget |
| M2 | Band prompts, `/tutor-level`, judgment block parsing | voice changes across a band; judgment shows in the widget |
| M3 | Stuck detector, ladder, tool guard | a persisting error opens an episode; rung advances only on `correct`; `read` outside root refused |
| M4 | Profile, interview, suggester, scaffold | `/tutor-start` on a new language produces the spec folder and `AGENTS.md` |
| M5 | Knowledge fetch → skills, `/tutor-learn` | a rung 3 hint cites a `tutor-<lang>-*` skill |
| M6 | Task ticking, `:TutorRun`, workflows, polish | a passing run ticks the right task id; widget shows workflow step |

## 11. Testing

- **pi-tutor** (vitest): policy, ladder, stuck, judgment parsing,
  scaffold consistency, profile migrations stay pure. `nvim.ts` runs
  against a real `nvim --headless --listen <sock>` spawned by the test:
  install autocmds, edit a buffer, assert a `tutor` notification
  arrives; pull text and diagnostics. No fake Neovim.
- **nvim-tutor** (plenary): `term.lua` opens a split running a stub
  command, hides and shows it without killing the job, `:TutorRun`
  captures output and notifies.
- **Live acceptance** per milestone inside the real LazyVim config.

## 12. Open risks

- Pi's extension API has had breaking changes roughly every few months;
  mitigated by `PI_SURFACE.md`, the version range check, and the
  contract test.
- Pi's TUI in a 45%-wide terminal: narrow widths may wrap its footer;
  if so, widen the split or let the user configure the width.
- The `neovim` Node client is a runtime dependency inside the Pi package;
  Pi packages carry their own `node_modules`, so `npm install` in
  `pi-tutor/` is part of setup.
- Model judgment of "correct reasoning" may be lenient; mitigated by
  the rubric and by logging judgments for tuning.
