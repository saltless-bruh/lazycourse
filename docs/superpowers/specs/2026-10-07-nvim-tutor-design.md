# nvim-tutor: an AI that teaches you to code, inside LazyVim

**Date:** 2026-10-07
**Status:** draft for review (rev 2: Pi-based architecture)

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

The agent runtime is **Pi** (`@earendil-works/pi-coding-agent`, 1.0.x,
requires Node ≥ 22.19).
Pi supplies providers, sessions, streaming, skills, prompt templates,
instruction files, and an extension API. We write two small pieces:

```
┌───────────── Neovim (LazyVim) ─────────────────────────────────────┐
│ nvim-tutor (Lua): panel · slider · signal collector · rpc client   │
│ spawns:  pi --mode rpc --tools read,grep,find,ls              │
└────────────┬───────────────────────────────────────────────────────┘
             │ Pi RPC: JSONL on stdin/stdout (supported surface)
             ▼
┌───────────── Pi (installed, unmodified) ───────────────────────────┐
│ providers · sessions · skills · prompt templates · instructions    │
│ ┌──── pi-tutor package (TypeScript extension, ours) ─────────────┐ │
│ │ before_agent_start → band system prompt + rung + retrieved KB  │ │
│ │ tool_call          → block edit/write, path guard              │ │
│ │ registerTool       → tutor_signal (diagnostics/idle/run/snap)  │ │
│ │ turn_end           → parse judgment block, advance rung,       │ │
│ │                      tick tasks.md, persist via appendEntry    │ │
│ │ registerCommand    → /tutor-start /tutor-level /tutor-learn    │ │
│ │ profile.sqlite · stuck detector · suggester + scaffold         │ │
│ └────────────────────────────────────────────────────────────────┘ │
│ skills/   (knowledge base: fetched docs, notes, learned skills)    │
└────────────────────────────────────────────────────────────────────┘
```

Units:

- **nvim-tutor** (`nvim-tutor/lua/tutor/`): panel UI, keymaps,
  commands, signal collection, Pi process lifecycle, RPC client. No
  tutor logic.
- **pi-tutor** (`pi-tutor/`): a Pi package with one extension, bundled
  skills, and prompt templates. All tutor logic lives here.
- **Pi**: unmodified upstream.

## 3. Integration contract and upgrade strategy

This section exists so Pi, Neovim, and our two pieces can each be
upgraded without touching the others.

### 3.1 What we depend on in Pi

Only the documented supported surface:

- **RPC mode** (`pi --mode rpc`): commands `prompt`, `steer`,
  `follow_up`, `abort`, `new_session`, `switch_session`, `set_model`,
  `get_state`, `get_last_assistant_text`; events `message_update`
  (`text_delta`), `message_end`, `tool_execution_start/end`,
  `agent_end`, `agent_settled`, `entry_appended`,
  `extension_ui_request` / `extension_ui_response`. Pi's 0.85.1
  changelog states the stdio RPC API and local SDK are the supported
  integration points; the experimental client/server subpaths are not,
  and we do not use them.
- **Extension API**: `pi.on("input" | "before_agent_start" | "tool_call"
  | "turn_end" | "session_start")`, `pi.registerTool`,
  `pi.registerCommand`, `pi.appendEntry`, `pi.sendMessage`,
  `ctx.ui.select/confirm/input/notify`.
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

Beyond Pi's standard RPC, exactly two custom shapes cross the boundary:

- Neovim → Pi: the Lua client sends an RPC `prompt` whose message is a
  single-line JSON envelope prefixed `@@tutor-signal `. The extension's
  `input` handler parses it and returns `{ action: "handled" }` when no
  tutor turn is needed (the RPC response then carries
  `disposition: "handled"`, so Lua knows no run started) or
  `{ action: "transform", text }` to turn the signal into a tutor
  prompt. The model never sees raw envelopes.
- Pi → Neovim: the extension writes `tutor_status` entries with
  `pi.appendEntry("tutor_status", {...})`; RPC emits them as
  `entry_appended` events whose `entry.customType` is `tutor_status`,
  which the Lua side reads for the status line, jumps, and task ticks.

If Pi ever changes these two mechanisms, only `rpc.lua` and
`signals.ts` change.

### 3.5 Why not pi.nvim

`adragomir/pi.nvim` exists but has 5 stars, last push 2026-02-02, and
connects over TCP rather than Pi's stdio RPC. We write our own stdio
JSONL client (about 150 lines of Lua) and may borrow its extension-UI
rendering ideas.

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
next turn. Snapshot sending is gated in Lua: outside the beginner band
the `snapshot` signal is never emitted.

Implementation: `before_agent_start` selects the band prompt section
from `pi-tutor/prompts/system/<band>.md` and sets
`systemPromptOptions` sections; it never replaces Pi's whole prompt, so
Pi's own skill and instruction loading keeps working.

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

- Interview and selection use Pi's extension UI, which RPC forwards as
  `extension_ui_request`; Neovim renders them with `vim.ui.select` and
  `vim.ui.input`.
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
- Project-local `.pi/skills/` and `AGENTS.md` override global ones by
  Pi's normal precedence.

## 8. Neovim plugin

LazyVim spec in `lua/plugins/tutor.lua`; module in
`nvim-tutor/lua/tutor/`. Dependency: `nui.nvim`.

```
nvim-tutor/lua/tutor/
├── init.lua     setup(), commands, keymaps, Pi process lifecycle
├── rpc.lua      stdio JSONL client: ids, responses, events, UI requests
├── panel.lua    right split: chat log, input box, status line
│                (language · level · rung · task id · workflow step)
├── signals.lua  autocmds → @@tutor-signal envelopes, throttling, gating
├── ui.lua       extension_ui_request → vim.ui.select/input/confirm
└── slider.lua   :TutorLevel N, <leader>t+ / <leader>t-
```

Spawn: `pi --mode rpc --tools read,grep,find,ls` with cwd set to
the project directory, via `vim.system` with stdin/stdout pipes.

Signals (debounced 500 ms unless noted):

| Signal | Source | Bands |
|---|---|---|
| `diagnostics` | `DiagnosticChanged`, current buffer, severity ≤ WARN | all |
| `idle` | timer every 30 s with cursor region when no edits | all |
| `churn` | same 20-line region edited ≥ 10 times, diagnostics unchanged | all |
| `run_output` | `:TutorRun` runs the project's run command, sends stdout+stderr+exit | all |
| `snapshot` | `TextChanged`, debounce 2 s, full buffer | beginner only |

Commands: `:Tutor` toggle, `:TutorStart`, `:TutorRun`, `:TutorLevel
[N]`, `:TutorExplain` (beginner only, visual selection), `:TutorLearn`,
`:TutorReload`. Hints carrying `file:line` in a `tutor_status` jump
entry are rendered as links; `gf` follows them.

Privacy: only the current buffer's content and diagnostics leave the
editor, and only for files inside the active project directory. Pi's
`read` tool is fenced to the project directory by the `tool_call` guard.
`bash` is not in the allowlist: it can write files, so M1 excludes it;
M3 may re-enable it behind a read-only command filter in the guard.

## 9. pi-tutor package internals

```
pi-tutor/
├── package.json         "pi": { extensions, skills, prompts }, peerDeps pi ^1.0
├── PI_SURFACE.md        every Pi API we touch + verified version
├── src/
│   ├── extension.ts     registers hooks, tools, commands
│   ├── signals.ts       parses @@tutor-signal envelopes
│   ├── policy.ts        band table, thresholds, start rung
│   ├── stuck.ts         signals → open/close episodes
│   ├── ladder.ts        rung logic, judgment application
│   ├── judgment.ts      parses tutor-judgment block from turn_end
│   ├── profile.ts       node:sqlite access + migrations
│   ├── suggest.ts       interview, suggester, scaffold writer
│   ├── knowledge/fetch.ts   source lists → skill folders
│   └── status.ts        appendEntry("tutor_status", ...)
├── prompts/
│   ├── system/{beginner,intermediate,pro}.md
│   ├── tutor-review.md  example workflow template
│   └── ...
├── skills/              bundled generic skills (tutor-method, spec-format)
└── test/                vitest, runs hooks through Pi's SDK
```

- Provider choice is Pi's: `set_model` via RPC, configured by the
  Lua side from `~/.config/nvim-tutor/config.toml` (`model`, idle
  overrides, knowledge source overrides). Pluggability is free.
- Provider errors are Pi's; the Lua side surfaces `agent_end` with an
  error in the status line. If the Pi process exits, Lua respawns once
  and reports if that fails.

## 10. Milestones

| Phase | Deliverable | Done when |
|---|---|---|
| M1 | LazyVim bootstrap, Pi installed, `rpc.lua`, panel, empty extension loaded as local package | typing in the panel streams a Pi reply; `PI_SURFACE.md` written |
| M2 | Band prompts, slider, judgment block parsing | voice changes across a band; judgment appears in `tutor_status` |
| M3 | Signals, stuck detector, ladder, tool guard | a persisting error opens an episode; rung advances only on `correct`; `edit` is refused |
| M4 | Profile, interview, suggester, scaffold | `:TutorStart` on a new language produces the spec folder and `AGENTS.md` |
| M5 | Knowledge fetch → skills, `/tutor-learn`, `:TutorReload` | a rung 3 hint cites a `tutor-<lang>-*` skill |
| M6 | Task ticking, run output, `:TutorExplain`, workflows, polish | a passing run ticks the right task id; status shows workflow step |

## 11. Testing

- **pi-tutor** (vitest): policy band math, ladder transitions per
  judgment, stuck thresholds, judgment-block parsing, scaffold id
  consistency across the three spec files, profile migrations. Hooks
  are exercised through Pi's SDK `createAgentSession` with a scripted
  provider registered via `pi.registerProvider`; this fake exists only
  under `test/`.
- **Contract test**: a Node script drives `pi --mode rpc` with the
  package loaded, sends envelopes, asserts `tutor_status` events. This
  is the test to rerun after any Pi upgrade.
- **nvim-tutor** (plenary busted): signal gating per band, debounce,
  JSONL framing, extension-UI mapping, panel rendering.
- **Manual acceptance** per milestone with a real provider.

## 12. Open risks

- Pi's extension API has had breaking changes roughly every few months;
  mitigated by `PI_SURFACE.md`, the version range check, and the
  contract test.
- The installed Pi (0.73.0, old npm name `@mariozechner/pi-coding-agent`)
  must be replaced by 1.0.x; M1 does this and keeps `~/.pi/agent`
  settings and auth.
- Model judgment of "correct reasoning" may be lenient; mitigated by
  the rubric and by logging judgments for tuning.
