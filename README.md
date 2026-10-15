# lazycourse

An AI tutor inside [LazyVim](https://github.com/LazyVim/LazyVim) that teaches you to code by making *you* write the code.

It picks a project matched to your skill in a language you choose, scaffolds a spec folder for it, gathers that language's idioms and best practices, and then coaches you from a side panel while you build it. A level slider sets how much it says: beginner gets structure and explanations, pro gets hints and knowledge only, never code. Hints get more concrete only as you reason correctly.

```
┌───────────── Neovim (LazyVim) ─────────────────────────────┐
│ nvim-tutor (Lua): panel · level slider · editor signals     │
│ spawns:  pi --mode rpc --tools read,grep,find,ls       │
└────────────┬───────────────────────────────────────────────┘
             │ Pi RPC: JSONL on stdin/stdout
             ▼
┌───────────── Pi (unmodified) ──────────────────────────────┐
│ providers · sessions · skills · prompt templates           │
│ ┌──── pi-tutor package (TypeScript extension, ours) ─────┐ │
│ │ level policy · hint ladder · stuck detector            │ │
│ │ profile · project suggester · spec scaffold            │ │
│ └────────────────────────────────────────────────────────┘ │
│ skills/  ← knowledge base: fetched docs, notes, learned    │
└────────────────────────────────────────────────────────────┘
```

## Status

Milestone 1b done: Pi's own TUI runs in a Neovim split; the extension watches the
editor over Neovim's RPC and shows tutor state in a Pi widget.

Milestone 2 done (2026-10-12): band system prompts (beginner / intermediate / pro)
selected per turn from the level slider; each turn carries the current buffer
(beginner) or ±20 lines (others) plus diagnostics as a hidden message;
`/tutor-level` / `:TutorLevel` persists across session resume; the model's trailing
`tutor-judgment` block is parsed and shown in the widget (`judged correct`).

Milestone 3 done (2026-10-12): a persisting error, a long pause, or rewriting the same
lines opens a stuck episode (widget shows `stuck: …`, Pi gets one `[tutor]` nudge); your
chat questions open one too. Hints climb a five-rung ladder (question → concept → pointer
→ pseudocode → reveal) only when the tutor judges your reasoning correct; pro stops at 4.
A `tool_call` guard keeps the tutor to read-only tools inside the project folder.
The tutor only exists in the Pi that `:Tutor` starts (`PI_TUTOR=1`); a plain `pi`
elsewhere is untouched.

Milestone 4 done (2026-10-12): `:TutorStart` (or `/tutor-start [language]`) runs a short
interview the first time you pick a language, suggests three projects aimed at your weak
concepts, and scaffolds the one you pick into `~/lazycourse/<language>-<project>` (or a folder
you choose): `README.md`, `AGENTS.md`, `spec/design.md`, `spec/tasks.md`,
`spec/requirements.md`, `src/<entry>`. Neovim then switches into that folder and restarts the
tutor there. Your levels, projects and finished stuck episodes (with per-concept ease) live in
`~/.local/share/nvim-tutor/profile.sqlite`.

Milestone 5 done (2026-10-12): starting a project in Python, Rust, Go, TypeScript or Lua also
fetches that language's full reference from DevDocs at the version installed on your machine,
as a searchable Pi skill (`~/.pi/agent/skills/tutor-<lang>-ref`); `:TutorDocs [lang]` re-fetches. When the tutor points
you at a reference (rung 3) it names the skill. After a stuck episode, `:TutorLearn` drafts a
skill from it in Pi's editor — edit and submit to keep, Esc to discard. Concepts you've shown
you know start one hint rung lower. Pin a docs version: `~/.config/nvim-tutor/sources.json` (`{ "python": "python~3.12" }`). See:

- Design spec: [`docs/superpowers/specs/2026-10-07-nvim-tutor-design.md`](docs/superpowers/specs/2026-10-07-nvim-tutor-design.md)
- Plans: [`docs/superpowers/plans/`](docs/superpowers/plans/) (M1 bootstrap, M1b terminal pane, M2 band prompts, M3 stuck/ladder/guard, M4 profile/start, M5 knowledge/learn, M6a roles & rules)

Milestone 6a (2026-10-13): every tutor reply follows one structure: **What's happening**
(a narrow diagram), **Why**, **Example**, **What to try**, **In short**. The extension checks
each reply (code above the hint rung, diagrams wider than 40 columns, missing judgment) and
tells the model what to fix on the next turn; a `correct` judgment needs your reasoning.

- `:TutorPlan <task id>` walks a task from `spec/tasks.md` through the six-step design recipe
  (Find, Shape, Examples, Steps, Map, Build); the widget shows `plan k/6`. The tutor moves to
  the next step when your artifact is done; `:TutorPlan next` moves on yourself, `:TutorPlan off`
  stops the recipe. During the recipe the hint rung stays where it started.
- `:TutorArchitect [question|off]` switches to the architecture professor (components, data
  flow, trade-offs, no code) until `off` or `:TutorPlan`.

Milestone 6b (2026-10-13): the tutor remembers you across sessions. When you say how you learn,
what you know or how you want to be taught, it saves one short fact with its `tutor_remember` tool
(never secrets: keys and tokens are refused). From the next session on it sees those facts and can
search them with `tutor_recall`. Everything lives in your profile (`profile.sqlite`).

- `/tutor-memory` lists what the tutor remembers; pick an entry to forget it.
- A failing `:TutorRun` opens a stuck episode carrying the end of the error output; the tutor
  teaches you to read the trace (`tutor-stack-traces` skill).
- `:TutorFeedback too-long|too-vague|too-much-help|good` tells the tutor how it is doing; it
  adjusts its style (and the hint level for `too-much-help` / `too-vague`). Inside a project it
  keeps that per language until you say `good`; outside a project it lasts for the session.
- `:TutorThinking auto|show|hide` shows or hides the model's thinking in the pane. `auto` (the
  default) hides it at the pro level only; the choice is kept across sessions. It changes only
  what is drawn: the model still thinks. While the tutor hides it, Pi's own click-to-expand on a
  thinking block does nothing; run `:TutorThinking show` to read it.

Exams (Milestone 8):

- `:TutorRun` runs the project's `run:` command and `:TutorRun test` its `test:` command, both
  from the front matter at the top of `README.md` (`/tutor-start` writes them; older projects can
  add a `test:` line). When the tutor saw you finish a task, the next passing run ticks it in
  `spec/tasks.md` (never while the file has unsaved edits in Neovim).
- `:TutorExam [small|medium] [topic]` writes a timed exam into `exam/<nn>-<name>/`: `brief.md`
  (task, requirements R1…, examples, grading), a starter file and example tests. The tests are run
  once before you see them, so a broken exam is replaced. The widget shows the time left
  (`exam 01 18:55 left`); going over is recorded as late and still graded. Until you submit,
  hints stay at a question or a concept, never code.
- `:TutorExam check` runs the example tests; `:TutorExam off` abandons the exam.
- `:TutorSubmit` runs the tests, has the model check each requirement against your code
  (`file:line` evidence), and writes `grade.md`: score /100 (80 requirements, 20 idiomatic code),
  the test output, three next fixes and an "In short". The score goes into your profile.
- `:TutorProgress [language]` shows hints used per episode over time, recent exam scores and which
  concepts are strong, shaky or weak.

The widget's second line says `outside nvim` when Pi runs without Neovim and `nvim closed` when
the editor exited; either way it still shows the tutor's state and last judgment.

## How it works

- **Level slider (0–100)** per language. Beginner (0–33) streams buffer snapshots, diagnostics, idle time and run output to the tutor and explains how code is structured. Intermediate (34–66) names concepts and points at docs. Pro (67–100) sends diagnostics, idle time and run output only, and gives hints, never code.
- **Hint ladder.** When you're stuck, the tutor starts with a question. Each reply where you reason correctly unlocks a more concrete rung: concept, pointer to docs, pseudocode, and finally the line itself. Pro never reaches the last rung.
- **Project suggestion.** A short interview per language builds a profile. The tutor proposes three projects targeting your weak or unknown concepts and scaffolds `spec/design.md`, `spec/tasks.md`, `spec/requirements.md` with stable task ids.
- **Knowledge base.** Instructions, skills, and workflows map onto Pi's `AGENTS.md`, `SKILL.md`, and prompt templates. Official docs are fetched into skills per language; you can edit them, and `/tutor-learn` drafts a new skill from a finished stuck episode.
- **Language packs** (Python, Rust, Go, TypeScript, Lua, JavaScript, plus the editor). Every turn carries a short
  language card: the version installed here and the project's constraint (`pyproject.toml`,
  `Cargo.toml`, `go.mod`, `package.json`, rockspec), formatter, naming, error style, layout, test
  command, pitfalls, and the concept tags the tutor may record. An editor card covers the LazyVim
  keys you need. JavaScript's version is Node's, so its card and its DevDocs reference are
  Node's; `.jsx` buffers use it too, and `.tsx` buffers the TypeScript card. Skills per language: `tutor-<lang>-cookbook` (a plain step such as "count how often
  each item appears" → the idiom, on an unrelated example, with bridge lines from the other
  languages), `tutor-<lang>-expert` (patterns and review checklists; Python, Rust, Go and TypeScript
  are adapted from [fullstack-dev-skills](https://github.com/Jeffallan/claude-skills) by Jeffallan,
  MIT, licence kept in each folder) and `tutor-<lang>-ref` (`:TutorDocs`). The design recipe's Map
  step uses the cookbook.

## Layout

| Path | What |
|---|---|
| `pi-tutor/` | Pi package: extension, bundled skills, prompt templates. Install with `pi install ./pi-tutor`. |
| `nvim-tutor/` | Neovim plugin. Load with lazy.nvim `dir = "<repo>/nvim-tutor"`. |
| `docs/superpowers/specs/` | Design specs. |
| `docs/superpowers/plans/` | Implementation plans, one per milestone. |

## Requirements

- Neovim ≥ 0.11 with LazyVim
- Node ≥ 22.19
- Pi ≥ 1.0: `npm install -g --ignore-scripts @earendil-works/pi-coding-agent`
- A provider configured in Pi (`pi` then `/login`)

## Tests

- `cd pi-tutor && npm test` (unit + a real headless Neovim for the link tests)
- `cd pi-tutor && npm run golden`: golden transcripts through the real `pi -p` and your configured
  model (network; `GOLDEN_MODEL=provider/id` to try another, `GOLDEN_COLS=n` for the diagram width
  your pane fits, default 67). Evidence of how well a model follows
  the style, ladder and judgment rules; not part of `npm test`.
- `cd pi-tutor && npm run cookbooks`: runs every cookbook example with the toolchains installed here
  (TypeScript examples are also type-checked, Lua ones also run on LuaJIT); a missing toolchain is
  skipped.
- `cd pi-tutor && npm run upstream-diff`: compares the adapted expert skills with a
  fullstack-dev-skills checkout (default `~/.claude/plugins/marketplaces/fullstack-dev-skills`).
- `cd pi-tutor && SKILL_EVAL_WORKSPACE=<dir>/iteration-N SKILL_EVAL_BASELINE=<checkout without the
  packs> npm run skill-evals`: skill-creator test runs, each request with and without the pack
  skills through the real `pi -p`, written in skill-creator's layout for its benchmark and review
  page.
- `cd nvim-tutor && nvim --headless -u tests/minimal_init.lua -c "PlenaryBustedDirectory tests/ {minimal_init='tests/minimal_init.lua'}"`

## Setup

1. Install Pi and log in to a provider: `pi` then `/login`. Set `defaultModel` in
   `~/.pi/agent/settings.json` to a model that provider serves.
2. `cd pi-tutor && npm install && pi install "$(pwd)"`
3. Add to your LazyVim config (`lua/plugins/tutor.lua`):

```lua
return {
  {
    dir = "<repo>/nvim-tutor",
    name = "nvim-tutor",
    cmd = { "Tutor", "TutorRestart", "TutorRun", "TutorStart", "TutorLevel", "TutorLearn",
            "TutorDocs", "TutorReload", "TutorPlan", "TutorArchitect", "TutorFeedback", "TutorThinking",
            "TutorExam", "TutorSubmit", "TutorProgress" },
    keys = {
      { "<leader>tt", "<cmd>Tutor<cr>", desc = "Toggle tutor (pi)" },
      { "<leader>tr", "<cmd>TutorRun<cr>", desc = "Run project and tell tutor" },
    },
    init = function()
      local ok, wk = pcall(require, "which-key")
      if ok then wk.add({ { "<leader>t", group = "tutor" } }) end
    end,
    opts = {},
    config = function(_, o) require("tutor").setup(o) end,
  },
}
```

4. `:Tutor` (or `<leader>tt`) opens Pi in a right split; type at Pi's prompt. `<Esc><Esc>` leaves terminal mode.

## Upgrading Pi

`pi-tutor/PI_SURFACE.md` lists every Pi API this project touches and the version it was verified against. To upgrade: read Pi's CHANGELOG "Breaking Changes" since that version, update the file, bump `peerDependencies` in `pi-tutor/package.json`, and run `npm run test:contract`.
