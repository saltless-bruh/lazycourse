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
editor over Neovim's RPC and shows tutor state in a Pi widget. See:

- Design spec: [`docs/superpowers/specs/2026-10-07-nvim-tutor-design.md`](docs/superpowers/specs/2026-10-07-nvim-tutor-design.md)
- Milestone 1 plan: [`docs/superpowers/plans/2026-10-07-m1-bootstrap.md`](docs/superpowers/plans/2026-10-07-m1-bootstrap.md)

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
