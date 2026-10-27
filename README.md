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
Teaching turns, phase 1 (2026-10-21, branch `teaching-turns`): help climbs with failed tries instead of
the tutor's judgment, and each reply is held and checked before you see it (see "How it works"). Design:
[`docs/superpowers/specs/2026-10-21-teaching-turns-design.md`](docs/superpowers/specs/2026-10-21-teaching-turns-design.md).
Phase 2 (2026-10-22, same branch): each milestone gets checks written in the background and
cross-checked against a hidden reference; `:TutorDone <task>` runs them in a sandbox and ticks the
task, and a failed check is a try. A run is a typo when its own output is a syntax error, and Lua
projects get a `.luarc.json` naming the Lua you run.

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

Getting started and learn-first lessons (2026-10-19, spec `docs/superpowers/specs/2026-10-19-onboarding-conversation-design.md`):

- `:TutorStart [language]` is a conversation with the tutor, not a form. It asks how long you have
  been coding and what you know, recommends Python (with its reasons) if you know no language, or
  asks you to rate yourself 1–10 in the language you named: below 5 it asks a couple of short
  technical questions; 5 and above it gives a small task (`~/lazycourse/.checks/<language>/…`, open
  it with `:e`, then `:TutorStart check`) whose real tests set your starting level, with no grade.
  It tells you its read of you (you can correct the level), suggests one project (or something
  else), makes the folder and moves the editor and tutor there, then asks: build now, or learn the
  ideas first? The project plan (`spec/`) is written in the background meanwhile. A second
  `:TutorStart` is a short check-in. `:TutorStart off` pauses; the next `:TutorStart` picks up
  where you left off. If the model's replies go off track, the tutor asks the missing questions
  itself after a few exchanges.
- `:TutorLesson next|check|skip|review|off` drives the learn-first lessons: at most three concepts
  per round, then a milestone of your project that uses only those, then the next round. `next`
  writes the exercise into `learn/<concept>/`, `check` runs its tests in the sandbox (two failures
  and the tutor takes a smaller step), `skip` marks a concept you know, `review` brings back a
  concept that is due. What you learn is remembered with spaced repetition (FSRS), so concepts come
  back for a quick review when you are about to forget them.
- Lessons come from established, openly licensed courses, never written by the model: Exercism
  (MIT) for every language, rustlings (MIT) for Rust, and for reading input and files, excerpts from
  the Python tutorial (PSF), Go by Example (CC BY 3.0), the Node.js docs, the Rust Book and the Lua
  manual, with our own tested exercises. Each `pi-tutor/lessons/<language>/SOURCES.md` lists the
  sources, pinned commits, licences, and anything dropped or fixed. TypeScript and Lua lessons are
  **thin**: neither has a beginner syllabus upstream (TypeScript reuses the JavaScript exercises,
  which run as `.ts`; Lua has three concept lessons plus input and files).

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
- The model writes the example tests, so every run of them (the one before you see the exam,
  `check` and `:TutorSubmit`) happens in a [bubblewrap](https://github.com/containers/bubblewrap)
  sandbox. Inside it the filesystem is read-only; the tests work on a throwaway copy of the exam
  folder, so nothing they write or link reaches your files; your home, `/tmp`, `/run` (Neovim,
  agent, Docker and system-bus sockets), `/mnt`, `/media` and `/srv` are hidden; there is no
  network; and only `PATH`, `HOME` and `LANG` are passed through. Toolchains installed in your home
  (rustup, nvm, pyenv) stay visible read-only. `:TutorExam sandbox` shows whether it can start. If bubblewrap is missing, install it
  (Arch: `pacman -S bubblewrap`) or run `:TutorExam sandbox off` to run exam tests as you; the
  choice is saved in your profile. `:TutorRun` runs your own commands, so it is never sandboxed.
- `:TutorSubmit` runs the tests, has the model check each requirement against your code
  (`file:line` evidence), and writes `grade.md`: score /100 (80 requirements, 20 idiomatic code),
  the test output, three next fixes and an "In short". The score goes into your profile.
- `:TutorProgress [language]` shows hints used per episode over time, recent exam scores and which
  concepts are strong, shaky or weak.

The widget's second line says `outside nvim` when Pi runs without Neovim and `nvim closed` when
the editor exited; either way it still shows the tutor's state and last judgment.

## How it works

- **Level slider (0–100)** per language. Beginner (0–33) streams buffer snapshots, diagnostics, idle time and run output to the tutor and explains how code is structured. Intermediate (34–66) names concepts and points at docs. Pro (67–100) sends diagnostics, idle time and run output only, and gives hints, never code.
- **Help climbs with your tries** (2026-10-21). Only graded tries count: a failed check from `:TutorDone`, or a `:TutorRun` that fails with anything but a syntax error. A run that stops on a syntax error (a typo: the output names the line), running unchanged code again, or chatting never moves help. The steps: teach (an unrelated example) → a small hint → why it is wrong → "what were you thinking?" → only the stuck line. Beginners get the line on try 4, intermediate on try 6; at pro it comes only when you ask with `/tutor-fix`. The widget shows `try N`. Coming back to a spot after a different error keeps its count until a run passes.
- **Checks prove a task; the tutor never ticks one** (phase 2). While you are in a milestone, a background job asks the model for checks in two strict forms, `check P1.T1: split_amount(50, 3) == 16.666666666666668` (Python, Lua, Rust, Go) and `run P1.T2: stdin "52.8" -> stdout contains "17.60"` (every language), and, in a separate request that never sees them, for a reference solution. A check the reference passes is trusted; one it fails is shown as *unverified* and never blocks you. They are listed in `spec/checks.md` (rewritten by the tutor; edits there are not kept). `:TutorDone P1.T1` runs the task's checks against your code in a throwaway sandbox (bubblewrap; your files are never changed, 20 s per check) and ticks the task with its open subtasks when they pass. A check that fails tells you what it got and expected and counts as a try; a file that does not load because of a syntax error says so and counts as nothing. A task with no checks, or no sandbox on this machine, ticks as self-checked; `:TutorDone P1.T1 anyway` ticks it as yours. The hidden reference never enters your project, and a reply that shows one of its lines before you wrote it counts as a leak.
- **The design recipe is the beginner default** (2026-10-26, habits phase 1). At level 0–33 every task starts the six-step recipe by itself (Find → Shape → Examples → Steps → Map → Build); `/tutor-plan skip` moves to the next step and `/tutor-plan off` ends it for this task (the next task starts it again); neither counts as a try. A step moves on when your own message has its artifact — the task named, a typed signature (`total: float, people: int → float`), two or more `call → value` rows with one marked `edge`, numbered plain steps, then each step `→` its construct. Type a new line in Pi's input with **Ctrl+J** (or Shift+Enter). Your Examples rows become checks for the task, confirmed against the hidden solution. The tutor shows each step on an unrelated example and never fills yours in.
- **Habits move your level** (habits phase 2). The tutor records habits from what code sees, never from the model's opinion: tries that get closer, questions after which your next try improves, reading an error before asking (right-click after it has been on screen 5 s), small edits between runs, fixing a bug before the tutor hands you the line, and your own recipe steps turning into passing code. Each habit goes not yet → showing → solid (5 good across 2 projects); it carries to a new language once shown there. As your band's habits turn solid the level rises inside the band and says why ("level 10 → 14: you ran small pieces often"); it never crosses a band edge by itself, and drops 3 only on a streak of tasks that needed the handed line. `/tutor-progress` lists your habits with their latest evidence. Idle nudges pause while a recipe runs.
- **Ask the tutor about an error** (habits phase 1). Right-click a line with an error and pick "Ask tutor about this error", or press `<leader>te`: the message, the line and its code go to the tutor as your question. The tutor no longer nudges on its own about an error that just sits there; you ask when you want help.
- **Rust and Go checks** (2026-10-23). New Rust and Go projects get a `Cargo.toml` / `go.mod` and an empty `main`, so they build from the start, and task lines name each function's exact signature. `:TutorDone` calls your function through a hidden test (a `#[cfg(test)]` module or a `_test.go` file, only in the sandbox's throwaway copy) as well as running the program. A function not written yet says so; a parse error is a typo; a compile error inside the checked function is a try; a test that cannot call your function as written, or a compile error elsewhere, is no try but does not tick. In every language a **near-miss guard** tries rounded and one-character-slip answers against the checks and asks the model once for one more check when they would pass; a task still weak is marked in `spec/checks.md`.
- **Every teaching reply is checked before you see it.** It shows "tutor is checking this reply…" while it is written; code checks it against this step (no code with your task's names before the fix, short enough, a question when it must ask, no talk about the tutor's machinery). A reply that fails is written again (at most twice), else you get a short safe note. The model's thinking stays hidden until the fix is allowed.
- **Getting started.** A short conversation builds your profile (the model talks; the code keeps the checklist and makes the decisions). The tutor proposes one project targeting your weak or unknown concepts and writes `spec/design.md`, `spec/tasks.md`, `spec/requirements.md` with stable task ids, grouped into milestones when you learn first.
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
- `cd pi-tutor && npm run lessons`: every lesson exercise and level task runs with the toolchains
  installed here (in the sandbox when bubblewrap can start): its reference solution must pass and
  its starter file must fail. Every lesson's text is checked for leftover markup and broken links,
  and the Python excerpts we cut by hand run as doctests. Not part of `npm test`.
- `cd pi-tutor && node scripts/vendor-lessons.ts <language>` re-vendors a language's lessons from
  the pinned upstream commits (network); `python3 scripts/gap-lessons.py <sources> lessons` rewrites
  the input and files lessons.
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
            "TutorExam", "TutorSubmit", "TutorProgress", "TutorLesson" },
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

## Docs lookup with context7 (optional)

The tutor answers from the offline DevDocs copy of your language's docs first. To let it also look up
docs DevDocs lacks (third-party libraries such as `requests` or `serde`), add context7 to Pi once, in
`~/.pi/agent/mcp.json`:

```json
{
  "autoEnableCodemode": false,
  "mcpServers": {
    "context7": {
      "url": "https://mcp.context7.com/mcp",
      "exposure": "direct",
      "description": "Up-to-date library documentation"
    }
  }
}
```

- context7 is an outside service: the model's search queries (library names, topics) are sent to it.
- The tutor's Pi starts with an explicit tool list that names only context7's two tools
  (`mcp__context7__resolve_library_id`, `mcp__context7__query_docs`), so no other MCP server you add,
  and no `codemode`, can reach the model; the tutor's tool guard blocks them as well.

## Upgrading Pi

`pi-tutor/PI_SURFACE.md` lists every Pi API this project touches and the version it was verified against. To upgrade: read Pi's CHANGELOG "Breaking Changes" since that version, update the file, bump `peerDependencies` in `pi-tutor/package.json`, and run `npm run test:contract`.
