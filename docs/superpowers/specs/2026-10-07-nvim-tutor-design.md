# nvim-tutor: an AI that teaches you to code, inside LazyVim

**Date:** 2026-10-07
**Status:** draft for review

## 1. Purpose

A LazyVim-based Neovim setup with a side panel in which an AI acts as a
tutor, not a code generator. It suggests a project matched to the user's
skill in a chosen language, scaffolds a spec folder for it, gathers the
language's best practices and idioms, and then coaches the user while
they write the code themselves. Coaching intensity is set by a level
slider from beginner (explains how code works and is structured) to pro
(knowledge and hints only, never code). Hints get more concrete only as
the user reasons correctly.

Single user, personal tool. Goal: breadth across many languages and
small projects, with a tutor that adapts per language.

Non-goals: shipping the projects, multi-user support, writing code for
the user, cloud sync.

## 2. Architecture

```
┌───────────────────────── Neovim (LazyVim) ─────────────────────────┐
│  tutor panel (right split)     signal collector                    │
│   • chat / hint ladder          • LSP diagnostics                  │
│   • level slider (0–100)        • idle / churn timer               │
│   • project picker              • :TutorRun captures run output    │
│   • profile interview           • buffer snapshots (beginner only) │
└──────────────┬──────────────────────────────┬──────────────────────┘
               │ JSON-RPC over unix socket    │ events
               ▼                              ▼
┌──────────────────────── tutord (Python sidecar) ───────────────────┐
│  session state   hint ladder   level policy   stuck detector       │
│  profile store (sqlite)        project suggester + spec scaffold   │
│  knowledge: fetch → chunk → cache → retrieve (per language)        │
│  provider interface ──▶ claude │ ollama (later) │ openai (later)   │
└────────────────────────────────────────────────────────────────────┘
```

Two units:

- **Lua plugin** (`lua/tutor/`): panel UI, keymaps, commands, signal
  collection, sidecar lifecycle. Thin; no AI logic.
- **tutord** (Python 3.12, `uv`): all tutor logic, providers, knowledge,
  profile. One asyncio process per Neovim instance, one unix socket.

Protocol: JSON-RPC 2.0 over a unix socket at
`$XDG_RUNTIME_DIR/nvim-tutor-<nvim-pid>.sock`. Neovim → tutord:
requests (`chat`, `start`, `set_level`, `run_output`, `explain`) and
notifications (`diagnostics`, `idle`, `churn`, `snapshot`). tutord →
Neovim: notifications `stream_chunk {text}`, `stream_end {meta}`,
`status {language, level, rung, task_id}`, `jump {file, line}`,
`tasks_updated {ids}`.

## 3. Level policy

The slider is one integer 0–100 stored per language in the profile. It
maps to bands that control what the tutor observes, how it speaks, and
when it intervenes.

| Band | Range | Observes | Voice | Intervenes |
|---|---|---|---|---|
| Beginner | 0–33 | snapshots + diagnostics + idle + run output | explains structure, syntax, why each part exists | on every new error, or 2 min idle |
| Intermediate | 34–66 | diagnostics + idle + run output | names the concept, points at docs | error after 1 min, or 5 min idle |
| Pro | 67–100 | diagnostics + idle + run output | hints and knowledge only, never code | error after 3 min, or 10 min idle |

Within a band the number scales idle thresholds linearly between the
band's neighbours and sets the starting rung: beginner starts at rung 3,
intermediate at 2, pro at 1. The slider can change mid-session; it takes
effect on the next tutor turn. Snapshot sending is gated in Lua: outside
the beginner band the `snapshot` event is never emitted.

## 4. Hint ladder and stuck episodes

A **stuck episode** opens when the stuck detector fires (a diagnostic
persisting past the band's error threshold, or idle/churn past the idle
threshold) or when the user sends a chat message. It closes when the
triggering diagnostic clears, a run passes, or the user says they have
it (model-judged intent, e.g. "got it").

Rungs:

```
rung 1  question      "What does the compiler think the type of `x` is?"
rung 2  concept       names the idea, e.g. "ownership moves on assignment"
rung 3  pointer       cites a cached doc chunk + where in the code to look
rung 4  pseudocode    the shape of the fix, no real syntax
rung 5  reveal        the actual line(s) with a one-sentence why
```

Rules:

- Each user reply is judged by the model against a hidden rubric in the
  same call that produces the tutor's text. `correct` advances one rung,
  `partial` holds with a reframed question, `wrong` holds with a gentle
  correction. No second API call.
- Rung 5 is never reached from a `wrong` or empty reply. Pro band caps
  at rung 4. No manual override.
- Each episode is logged: language, concept tags, rungs used, turns
  taken. Concepts cleared quickly before start one rung lower next time
  (ease score ≥ 0.7 lowers the start rung by one, floor 1).
- Beginner band may also send proactive explanations of code just
  written, outside any episode, at most once per 2 minutes.

## 5. Profile, interview, project suggestion, scaffold

Profile: `~/.local/share/nvim-tutor/profile.sqlite`.

Tables: `languages(name, level, interview_json, created)`,
`concepts(language, tag, ease REAL, episodes INT)`,
`episodes(id, language, project, concept_tags, rungs_used, turns, opened, closed)`,
`projects(id, language, path, title, status, created)`.

Flow:

```
pick language ──▶ profile row exists? ──no──▶ interview (4–6 questions)
                       │ yes                          │
                       ▼                              ▼
             suggest 3 projects ◀──────── write row, initial level
                       │
       each: title, goal, concepts exercised, size, why it fits
                       │
       user picks one ──▶ scaffold into a user-chosen directory
                          and fetch language knowledge if not cached
```

- Interview asks prior languages, things built, comfort with 3–4 marker
  concepts of the language. Answers stored verbatim; the model proposes
  an initial slider value the user can override.
- Suggester receives profile, concept scores, completed projects, and
  must return structured JSON. It biases toward low or missing concept
  scores. Size options: small (1–2 h), medium (half day), large (1–2
  days).

Scaffold written by tutord, only inside the chosen directory:

```
<project>/
├── README.md            goal, run command, how to talk to the tutor
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
  with no subtasks.
- `tasks.md` is the progress source. tutord ticks boxes when the
  structured turn block reports `task_done_ids`; it never edits `src/`.
- The three spec files are generated in one structured call so they
  stay consistent.

## 6. Neovim plugin

LazyVim spec in `lua/plugins/tutor.lua`; module in `lua/tutor/`.
Dependency: `nui.nvim`. Sidecar spawned with `vim.system` on first use;
socket client via `vim.uv`.

```
lua/tutor/
├── init.lua     setup(), commands, keymaps, sidecar lifecycle
├── rpc.lua      socket client, request/notify, stream handling
├── panel.lua    right split: chat log, input box, status line
│                (language · level · rung · task id)
├── signals.lua  autocmds → events, throttling, band gating
└── slider.lua   :TutorLevel N, <leader>t+ / <leader>t-
```

Events (debounced 500 ms unless noted):

| Event | Source | Bands |
|---|---|---|
| `diagnostics` | `DiagnosticChanged`, current buffer, severity ≤ WARN | all |
| `idle` | timer tick every 30 s with cursor region when no edits | all |
| `churn` | same 20-line region edited ≥ 10 times with diagnostics unchanged | all |
| `run_output` | `:TutorRun` runs the project's run command, sends stdout+stderr+exit code | all |
| `snapshot` | `TextChanged`, debounce 2 s, full buffer | beginner only |

Commands: `:Tutor` toggle panel, `:TutorStart` language picker →
interview/suggest flow, `:TutorRun`, `:TutorLevel [N]`, `:TutorExplain`
(beginner only, explains the visual selection). Panel streams tokens;
a hint carrying `jump` is shown as `file:line` and `gf` follows it.

Privacy: only the current buffer's content and diagnostics leave the
editor, and only for files inside the active project directory.

## 7. tutord internals

```
tutord/
├── server.py        JSON-RPC dispatch, streaming
├── session.py       per-project state: language, level, episode, task id
├── policy.py        band table, thresholds, start rung
├── stuck.py         events → open/close episodes
├── ladder.py        rung logic, applies judgment
├── prompts/         system prompts per band, suggester, scaffold, interview
├── profile.py       sqlite access
├── knowledge/
│   ├── fetch.py     per-language source list → markdown (Context7 or HTTP)
│   ├── store.py     ~/.local/share/nvim-tutor/knowledge/<lang>/ + FTS5
│   └── retrieve.py  BM25 top-k chunks by query
└── providers/
    ├── base.py      Provider.complete(messages, schema) -> async stream
    ├── claude.py    Anthropic SDK, structured trailing block
    └── ollama.py    stub, same interface
```

- Every tutor turn is one provider call: a text stream plus a trailing
  structured block `{judgment, rung_delta, concept_tags, task_done_ids,
  episode_closed}`. Ladder and task ticking act on the block.
- Retrieval query per turn: error text + current task id's requirement +
  concept tags. Top 5 chunks, 500 tokens each, injected into the system
  prompt.
- No embeddings in v1; `retrieve.py` is the seam for adding them.
- Config `~/.config/nvim-tutor/config.toml`: provider, model, API key
  env var name, knowledge source overrides per language.
- Provider errors surface in the panel status line; tutord never exits
  on a provider error. If the socket drops, Lua respawns once and
  reports if that fails.

## 8. Milestones

| Phase | Deliverable | Done when |
|---|---|---|
| M1 | LazyVim bootstrap + panel + socket + echo sidecar | typing in the panel round-trips through tutord |
| M2 | Claude provider, chat with band system prompts, slider | a conversation changes voice when the slider crosses a band |
| M3 | Signals + stuck detector + ladder | a persisting error opens an episode and rungs advance only on correct replies |
| M4 | Profile + interview + suggester + scaffold | `:TutorStart` on a new language produces the spec folder |
| M5 | Knowledge fetch/store/retrieve | a hint at rung 3 cites a cached doc chunk |
| M6 | Task ticking, run output, `:TutorExplain`, polish | a passing run ticks the right task id |

## 9. Testing

- **tutord unit tests** (pytest): policy band math, ladder transitions
  from each judgment, stuck detector thresholds, FTS5 retrieval ranking,
  scaffold id consistency across the three spec files, profile ease
  updates. Provider is replaced by a fake that returns scripted streams
  and blocks; this is test infrastructure, not production behavior.
- **Protocol tests**: a Python client drives the socket end to end.
- **Lua tests** (plenary busted): signal gating per band, debounce,
  panel rendering of stream chunks and jumps.
- **Manual acceptance** per milestone as in the table above, with a
  real provider.

## 10. Open risks

- Model judgment of "correct reasoning" may be lenient; mitigated by the
  rubric in the prompt and by logging judgments for later tuning.
- Knowledge sources differ per language; v1 ships a source list for
  Python, Rust, Go, TypeScript, Lua and falls back to model knowledge
  with a visible "no cached docs" status for others.
