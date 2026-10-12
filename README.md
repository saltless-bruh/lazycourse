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
fetches that language's official style, idiom and stdlib docs into Pi skills
(`~/.pi/agent/skills/tutor-<lang>-*`); `:TutorDocs [lang]` re-fetches. When the tutor points
you at a reference (rung 3) it names the skill. After a stuck episode, `:TutorLearn` drafts a
skill from it in Pi's editor — edit and submit to keep, Esc to discard. Concepts you've shown
you know start one hint rung lower. Custom doc sources: `~/.config/nvim-tutor/sources.json`. See:

- Design spec: [`docs/superpowers/specs/2026-10-07-nvim-tutor-design.md`](docs/superpowers/specs/2026-10-07-nvim-tutor-design.md)
- Plans: [`docs/superpowers/plans/`](docs/superpowers/plans/) (M1 bootstrap, M1b terminal pane, M2 band prompts, M3 stuck/ladder/guard, M4 profile/start, M5 knowledge/learn)

## How it works

- **Level slider (0–100)** per language. Beginner (0–33) streams buffer snapshots, diagnostics, idle time and run output to the tutor and explains how code is structured. Intermediate (34–66) names concepts and points at docs. Pro (67–100) sends diagnostics, idle time and run output only, and gives hints, never code.
- **Hint ladder.** When you're stuck, the tutor starts with a question. Each reply where you reason correctly unlocks a more concrete rung: concept, pointer to docs, pseudocode, and finally the line itself. Pro never reaches the last rung.
- **Project suggestion.** A short interview per language builds a profile. The tutor proposes three projects targeting your weak or unknown concepts and scaffolds `spec/design.md`, `spec/tasks.md`, `spec/requirements.md` with stable task ids.
- **Knowledge base.** Instructions, skills, and workflows map onto Pi's `AGENTS.md`, `SKILL.md`, and prompt templates. Official docs are fetched into skills per language; you can edit them, and `/tutor-learn` drafts a new skill from a finished stuck episode.

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
    cmd = { "Tutor", "TutorRestart", "TutorRun", "TutorStart", "TutorLevel", "TutorLearn" },
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
