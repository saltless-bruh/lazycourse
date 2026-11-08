# lazycourse

An AI tutor inside [LazyVim](https://github.com/LazyVim/LazyVim) that teaches you to code by making *you* write the code.

You pick a language and say what you'd like to build. The tutor finds your level, turns your idea into a project with a
plan, and coaches you from a pane next to your code. It gives hints, questions and small unrelated examples, and
hands over the stuck line only after real tries. Code, not the model, decides everything that counts: whether a task is
done, how much help you get, and when your level moves.

```
┌──────────────── Neovim (LazyVim) ───────────────────────────────────────────────┐
│  your code                          │  tutor pane: Pi's own TUI (`pi`, PI_TUTOR=1) │
│  nvim-tutor (Lua): commands, keys,  │  ┌── pi-tutor extension (TypeScript) ─────┐  │
│  run split, help tab, :TutorTour,   │  │ levels · help ladder · checks/sandbox │  │
│  editor signals ──── Neovim RPC ────┼─▶│ onboarding · recipe · habits · exams  │  │
│                 ◀── open files, ────┼──│ next-step line · session card         │  │
│                     reload, help    │  └───────────────────────────────────────┘  │
└─────────────────────────────────────┴───────────────────────────────────────────┘
        profile: ~/.local/share/nvim-tutor/profile.sqlite   ·   projects: ~/lazycourse/<language>-<project>
```

The tutor exists only in the Pi that the plugin starts (`PI_TUTOR=1`); a plain `pi` elsewhere is untouched. The
model gets read-only tools (`read`, `grep`, `find`, `ls`, its two memory tools and context7's two docs tools)
inside the project folder; `bash` stays off.

## Requirements

- Neovim ≥ 0.11 with LazyVim
- Node ≥ 22.19
- Pi 1.x (verified on 1.3): `npm install -g --ignore-scripts @earendil-works/pi-coding-agent`
- A provider configured in Pi (`pi` then `/login`)
- Optional: [bubblewrap](https://github.com/containers/bubblewrap) for the checks and exam sandbox (Linux; Arch:
  `pacman -S bubblewrap`)

## Setup

1. Install Pi and log in to a provider: `pi` then `/login`. Set `defaultModel` in `~/.pi/agent/settings.json` to a
   model that provider serves.
2. `cd pi-tutor && npm install && pi install "$(pwd)"`
3. Add to your LazyVim config (`lua/plugins/tutor.lua`):

```lua
return {
  {
    dir = "<repo>/nvim-tutor",
    name = "nvim-tutor",
    lazy = false, -- loads at start: in a tutor project or ~/lazycourse, nvim opens the tutor by itself
    opts = {},    -- auto_open = false turns that off
    config = function(_, o) require("tutor").setup(o) end,
  },
}
```

The plugin sets its own keys: `<leader>tt` (open/close the tutor), `<leader>tr` (`:TutorRun`), `<leader>te` (ask about
the error under the cursor) and `<leader>t?` (help: every command, in its own tab). Other options: `width` (the
pane's share of the screen, default 0.45), `run_cmd` / `test_cmd` (instead of the README front matter),
`test_timeout_ms` (default 60000), `pi_cmd`.

## First steps

1. `mkdir -p ~/lazycourse && cd ~/lazycourse && nvim`. In `~/lazycourse` or a tutor project, Neovim opens the tutor
   by itself (rooted at the project even from a subfolder); anywhere else it opens plain Neovim, and a brand-new
   learner gets a one-line hint about `:TutorTour`. `:Tutor` opens the pane anywhere.
2. New to Neovim? `:TutorTour` is one guided tour in 18 steps: the Neovim basics you need (cut down from Neovim's own
   tutor), then the tutor (the pane, `<Esc><Esc>`, `<C-w>h`, `:TutorRun`, `<leader>te`, help). Code checks each step
   in the editor; the tutor only answers your questions about it. It remembers where you stopped:
   `:TutorTour restart` starts over, `:TutorTour off` stops.
3. Tell the tutor what you'd like to learn (or type `/tutor-start`): a short talk, a level, then your own project
   idea — exactly that idea at your level, or a smaller version of it when it is too big.

**Where am I, what next?** Every session opens with a three-line card (where you are, the next step, where help is),
and the tutor's box always ends with a `next: …` line. Both come from code, never from the model. `<leader>t?`,
`:TutorHelp` or `/tutor-help` opens every command, fully explained, in its own tab (`q` closes it). Inside the pane
you type to the tutor; `<Esc><Esc>` gives Neovim back, and `<C-w>h` moves to your code. A new line in Pi's input is
**Ctrl+J** (or Shift+Enter).

## A course, start to finish

```
:TutorTour (optional) ─▶ getting started ─▶ your project ─▶ build now ──▶ tasks: recipe ─▶ run ─▶ :TutorDone
                         talk · level       spec/ plan        or                  ▲                    │
                                                            learn first ─▶ lessons ┘      habits ─▶ step-up ─▶ next band
                                                                                         exams any time (:TutorExam)
```

### Getting started

- `/tutor-start [language]` is a conversation, not a form. It asks how long you have been coding and what you know,
  recommends Python (with its reasons) if you know no language, or asks you to rate yourself 1–10 in the one you
  named: below 5 it asks a couple of short technical questions; 5 and above it gives a small task
  (`~/lazycourse/.checks/<language>/…`, open it with `:e`, then `/tutor-start check`) whose real tests set your
  starting level, with no grade. The model talks; code keeps the checklist, asks anything still missing itself after a
  few exchanges, and makes the decisions.
- It gives its read of you; you accept or type another level, and the level shows at once.
- **Your idea is the project.** If you named one, the project is exactly that idea (your words as the title), sized
  to your level; an idea too big for your level gets a smaller version of the same idea, and "Show me something
  else" frees the tutor to suggest another. Without an idea it suggests one project aimed at your weak or unknown
  concepts.
- It makes the folder (`~/lazycourse/<language>-<project>`, or one you choose), moves the editor and tutor there, and
  asks: build now, or learn the ideas first? Meanwhile the plan is written in the background: `spec/design.md`,
  `spec/requirements.md`, `spec/tasks.md` with stable task ids (`P1.T1`), grouped into milestones when you learn
  first, plus the README front matter (`run:`, `test:`) — the README you have open updates by itself (with unsaved
  edits, you are told how to see the new one instead). New Rust and Go projects get a `Cargo.toml` / `go.mod` and an
  empty `main` so they build from the start; Lua projects get a `.luarc.json` naming the Lua you run.
- A second `/tutor-start` is a short check-in. `/tutor-start off` pauses; the next one picks up where you left off;
  `/tutor-start spec` writes the plan again if it failed.

### Learn first: lessons

- `/tutor-lesson next|check|skip|review|off` drives the learn-first path: at most three concepts per round, then a
  milestone of your project that uses only those, then the next round. `next` writes the exercise into
  `learn/<concept>/`, `check` runs its tests in the sandbox (two failures and the tutor takes a smaller step), `skip`
  marks a concept you know, `review` brings back one that is due. What you learn is scheduled with spaced repetition
  (FSRS), so concepts come back for a quick review when you are about to forget them.
- Lessons come from established, openly licensed courses, never written by the model: Exercism (MIT) for every
  language, rustlings (MIT) for Rust, and for reading input and files, excerpts from the Python tutorial (PSF), Go by
  Example (CC BY 3.0), the Node.js docs, the Rust Book and the Lua manual, with our own tested exercises. Each
  `pi-tutor/lessons/<language>/SOURCES.md` lists sources, pinned commits, licences and anything dropped or fixed.
  TypeScript and Lua lessons are **thin**: neither has a beginner syllabus upstream (TypeScript reuses the JavaScript
  exercises, run as `.ts`; Lua has three concept lessons plus input and files).

### Working on a task

- **The design recipe is the beginner default.** At level 0–33 every task starts the six-step recipe by itself (Find →
  Shape → Examples → Steps → Map → Build); at any level `/tutor-plan P1.T1` starts it. Saying "skip" (or "just let me
  code", or `/tutor-plan next`) moves on; `/tutor-plan off` ends it for this task; neither counts as a try. "I don't
  understand" gets the step explained in one sentence. A step moves on when your own message has its artifact, in
  plain words or code form: the task named, what goes in and what comes back, two or more cases with an edge case, the
  steps in order, then each step matched to its construct. The tutor shows each step on an unrelated example and never
  fills yours in; your Examples rows become checks for the task.
- **Running.** `:TutorRun` (`<leader>tr`) runs the README's `run:` command in a split below the editor: you see the
  output and type its input there; `q` closes the split once it has ended; `:TutorRun stop`, closing the split or
  Ctrl+C stops it and says "run stopped" (never a failed try). `:TutorRun test` runs the `test:` command hidden, with
  no input, stopped after 60 s; a stopped test says it timed out, the tutor is told, and it is never a failed try.
  When the tutor saw you finish a task, the next passing run ticks it in `spec/tasks.md` (never while the file has
  unsaved edits).
- **Checks prove a task; the tutor never ticks one.** In the background the model writes checks in two strict forms,
  `check P1.T1: split_amount(50, 3) == 16.666666666666668` and `run P1.T2: stdin "52.8" -> stdout contains "17.60"`,
  and, in a separate request that never sees them, a hidden reference solution. A check the reference passes is
  trusted; one it fails is shown as *unverified* and never blocks you. They are listed in `spec/checks.md`.
  `/tutor-done P1.T1` (`:TutorDone`) runs them against your code in a throwaway sandbox (your files are never
  changed, 20 s per check) and ticks the task with its open subtasks when they pass; a failing check says what it got
  and expected and counts as a try. A task with no checks, or no sandbox here, ticks as self-checked;
  `/tutor-done P1.T1 anyway` ticks it as yours. In Rust and Go your function is also called through a hidden test
  (only in the sandbox copy). A **near-miss guard** tries rounded and one-character-slip answers against the checks
  and asks for one more check when they would pass.
- **Help climbs with your tries.** Only graded tries count: a failed check from `/tutor-done`, or a `:TutorRun` that
  fails with anything but a syntax error. A typo run, running unchanged code again, or chatting never moves help. The
  steps: teach (an unrelated example) → a small hint → why it is wrong → "what were you thinking?" → only the stuck
  line. Beginners get the line on try 4, intermediate on try 6; at pro it comes only when you ask with `/tutor-fix`.
  The widget shows `try N`.
- **Ask about an error.** Right-click a line with an error and pick "Ask tutor about this error", or press
  `<leader>te`: the message, the line and its code go to the tutor as your question. The tutor does not nudge on its
  own about an error that just sits there; it does speak up after a failed run, a long pause, or rewriting the same
  lines.
- **Every teaching reply is checked before you see it.** While it is written you see "tutor is checking this reply…";
  code holds it to this step's rules (no code with your task's names before the fix, short enough, a question when it
  must ask, no talk about the tutor's machinery). A reply that fails is written again (at most twice), else you get a
  short safe note. A reply with nothing for you to read (the answer stayed in the model's hidden thinking) is asked
  once more ("tutor is writing its answer…"), then you get an honest "I lost my answer — please ask again". Every
  reply follows one shape: **What's happening** (a narrow diagram), **Why**, **Example**, **What to try**, **In short**.
- The model's thinking stays hidden (`/tutor-thinking show` to read it; Pi's click-to-expand does nothing while it is
  hidden). The tutor's own messages to the model are hidden too: you never see them as yours.

### Your level and habits

- **The level (0–100)** is per language and sets the band: beginner (0–33) explains structure and sees your whole
  buffer; intermediate (34–66) names concepts and points at docs; pro (67–100) gives hints only, never code.
  `/tutor-level` sets it by hand.
- **Habits move it.** Code records habits from what it sees, never from the model's opinion: tries that get closer,
  questions after which your next try improves, reading an error before asking (right-click after it has been on
  screen 5 s), small edits between runs, fixing a bug before the tutor hands you the line, your own recipe steps
  turning into passing code. Each habit goes not yet → showing → solid (5 good across 2 projects). As your band's
  habits turn solid the level rises inside the band and says why ("level 10 → 14: you ran small pieces often"); it
  never crosses a band edge by itself, and drops 3 only on a streak of tasks that needed the handed line.
  `/tutor-progress` lists your habits, hint use over time, exam scores and strong/shaky/weak concepts.
- **The step-up** to the next band, once your band's habits are solid (offered at most once a day). `/tutor-step-up`
  starts it. Part 1, the talking test: talk the problem through in your own words, then numbered steps and one
  `pieces:` line compared with a hidden solution. Part 2, the coding test in `stepup/`: solve a problem that needs a
  module you have not used, fix a program with one planted bug, and build your own plan; the intermediate step-up adds
  your own tests for the solve problem (they must catch a broken version of a hidden solution) and clumsy working code
  to improve. `/tutor-step-up check` shows each part's checks, `/tutor-step-up submit` decides. A pass tells you to
  type the next band's level yourself; the tutor never moves you. Python, Lua, Rust and Go.
- **Your own tests** (from 34). The tutor teaches arrange → act → check with the language's test tool. Name a task's
  test after it (`test_p1_t1_uneven`, `p1_t1_uneven`, `TestP1T1Uneven`) and `/tutor-done` runs it after the checks
  pass; a test that still passes when code plants a small bug in a throwaway copy of your file does not tick.
- **The pro score** (from 67): a task ticked from its checks scores out of 100 from facts code checks (checks pass,
  your tests pass, they catch a broken version, they cover the task's `done when` calls), and three scores in a row
  can suggest a level change — you decide. After a pro tick the tutor gives at most three design and naming notes
  (`/tutor-notes off` stops them).
- **Improve it.** `/tutor-improve P1.T2` on a ticked Python task: edge-case and timed checks (kept only when the hidden
  solution passes them) and measurements of your code now; `/tutor-improve done` measures again and names what got
  better and worse.

### Exams

- `/tutor-exam [small|medium] [topic]` writes a timed exam into `exam/<nn>-<name>/`: `brief.md` (task, requirements,
  examples, grading), a starter file and example tests, run once before you see them so a broken exam is replaced.
  The widget shows the time left; going over is recorded as late and still graded. Until you submit, hints stay at a
  question or a concept. `/tutor-exam check` runs the examples; `/tutor-exam off` abandons it.
- `/tutor-submit` runs the tests, checks each requirement against your code (`file:line` evidence) and writes
  `grade.md`: score /100 (80 requirements, 20 idiomatic code), the test output, three next fixes and an "In short".

### The sandbox

Every run of model-written tests (task checks, lessons, exam tests, step-up checks) happens in a bubblewrap sandbox:
the filesystem is read-only and the tests work on a throwaway copy; your home, `/tmp`, `/run` (Neovim, agent, Docker
and system-bus sockets), `/mnt`, `/media` and `/srv` are hidden; there is no network; only `PATH`, `HOME` and `LANG`
pass through; toolchains in your home (rustup, nvm, pyenv) stay visible read-only. With a systemd user session each run
also gets kernel limits (4 GB of memory, 1024 processes and threads). Rust keeps one build folder per project in the
tutor's cache. `/tutor-exam sandbox` shows whether it can start; `/tutor-exam sandbox off` runs exam tests as you.
`:TutorRun` runs your own commands, so it is never sandboxed.

### What the tutor knows and remembers

- **Language packs** (Python, Rust, Go, TypeScript, Lua, JavaScript, plus the editor): every turn carries a short card —
  the version installed here and the project's constraint, formatter, naming, error style, layout, test command,
  pitfalls and the concept tags the tutor may record. Skills per language: `tutor-<lang>-cookbook` (a plain step →
  the idiom, on an unrelated example), `tutor-<lang>-expert` (patterns and review checklists; Python, Rust, Go and
  TypeScript adapted from [fullstack-dev-skills](https://github.com/Jeffallan/claude-skills) by Jeffallan, MIT) and
  `tutor-<lang>-ref`: the official docs from DevDocs at your installed version (`/tutor-docs` re-fetches; pin a
  version in `~/.config/nvim-tutor/sources.json`, e.g. `{ "python": "python~3.12" }`).
- **Memory.** When you say how you learn, what you know or how you want to be taught, the tutor saves one short fact
  (never secrets); later sessions see them. `/tutor-memory` lists them; pick one to forget it.
- **Feedback.** `/tutor-feedback too-long|too-vague|too-much-help|good` adjusts its style (and help level), per
  language inside a project until you say `good`.
- `/tutor-learn` drafts a skill from your last finished stuck episode; edit and submit to keep it, Esc to discard.
- `/tutor-architect [question]` switches to an architecture professor (components, data flow, trade-offs, no code)
  until `off`. `/tutor-checker <provider/model>` adds an optional second model that reads each held reply after
  code's checks passed; it can only make replies stricter.

The widget's second line says `outside nvim` when Pi runs without Neovim and `nvim closed` when the editor exited;
it still shows the tutor's state.

## Commands

`:Tutor…` is typed in the editor, `/tutor-…` in the tutor pane. The one list behind this section, the help tab, the
next-step line and the model's own note is `pi-tutor/commands.json`; a test fails when a command is missing from it,
or from here.

**Start and help**

- `/tutor-start [language | check | off | spec]` (tutor pane) or `:TutorStart [language | check | off | spec]` (editor): begin or continue the course
- `/tutor-help` (tutor pane): open the help tab with every command
- `/tutor-level <0-100>` (tutor pane) or `:TutorLevel <0-100>` (editor): set your level by hand
- `:TutorHelp` (editor, same as `/tutor-help`): open the help tab with every command
- `:TutorTour [restart | off]` (editor): the tour: Neovim and the tutor, step by step
- `<leader>t?` (key, same as `:TutorHelp`): open the help tab with every command

**Moving around**

- `:Tutor` (editor): open or close the tutor pane
- `:TutorRestart` (editor): restart the tutor in its pane
- `<leader>tt` (key, same as `:Tutor`): open or close the tutor pane
- `<Esc><Esc>` (tutor pane): leave the tutor pane's typing mode
- `<C-w>h` (key): move to the window on the left (your code)
- `q` (run split): close the run split (after the program ends)

**Coding a task**

- `/tutor-plan <task id> | next | off` (tutor pane) or `:TutorPlan <task id> | next | off` (editor): walk a task from idea to code in six steps
- `/tutor-done [task id] [anyway]` (tutor pane) or `:TutorDone [task id] [anyway]` (editor): check a task and tick it
- `/tutor-fix` (tutor pane) or `:TutorFix` (editor): pro only: show the fix for where you are stuck
- `/tutor-improve <task id> | done | off` (tutor pane): make a ticked task's code better, measured
- `:TutorRun [run | test | stop]` (editor): run your program in a split below
- `<leader>tr` (key, same as `:TutorRun`): run your program in a split below
- `<leader>te` (key): ask the tutor about the error under the cursor

**Learning paths and tests**

- `/tutor-lesson next | check | skip | review | off` (tutor pane) or `:TutorLesson next | check | skip | review | off` (editor): learn-first lessons with small exercises
- `/tutor-exam [small | medium] [topic] | check | off | sandbox on|off` (tutor pane) or `:TutorExam [small | medium] [topic] | check | off | sandbox on|off` (editor): a timed exam in this project
- `/tutor-submit` (tutor pane) or `:TutorSubmit` (editor): hand in the exam and get it graded
- `/tutor-step-up [check | submit]` (tutor pane) or `:TutorStepUp [check | submit]` (editor): step up to the next band
- `/tutor-architect [question] | off` (tutor pane) or `:TutorArchitect [question] | off` (editor): talk architecture: parts, data flow, trade-offs

**Your record and settings**

- `/tutor-status` (tutor pane): show the tutor's current state
- `/tutor-notes on | off` (tutor pane): design and naming notes after a pro tick
- `/tutor-progress [language]` (tutor pane) or `:TutorProgress [language]` (editor): your habits, hint use, exams and concepts
- `/tutor-memory` (tutor pane): what the tutor remembers about you
- `/tutor-feedback too-long | too-vague | too-much-help | good` (tutor pane) or `:TutorFeedback too-long | too-vague | too-much-help | good` (editor): tell the tutor how it is teaching
- `/tutor-thinking auto | show | hide` (tutor pane) or `:TutorThinking auto | show | hide` (editor): show or hide the model's thinking
- `/tutor-learn` (tutor pane) or `:TutorLearn` (editor): keep what you learned from being stuck
- `/tutor-docs [language]` (tutor pane) or `:TutorDocs [language]` (editor): fetch official docs for a language
- `/tutor-checker <provider/model> | off` (tutor pane): a second model checks each reply
- `/reload` (tutor pane) or `:TutorReload` (editor): reload the tutor extension

## Files and data

| Where | What |
|---|---|
| `~/.local/share/nvim-tutor/profile.sqlite` | your profile: levels, habits, projects, memories, exam scores, settings (`PI_TUTOR_PROFILE` overrides) |
| `~/.local/share/nvim-tutor/projects.json` | your project folders, read by Neovim at start to decide whether to open the tutor |
| `~/lazycourse/<language>-<project>/` | a project: `README.md` (front matter `run:` / `test:`), `AGENTS.md`, `spec/`, `src/`, `learn/`, `exam/`, `stepup/` |
| `~/lazycourse/.checks/` | the getting-started level tasks |
| `~/lazycourse/.tour/` | the tour's practice files and progress (`state.json`) |
| `~/.pi/agent/skills/tutor-<lang>-ref` | fetched official docs |

## Tests

- `cd pi-tutor && npm test` (unit tests, plus a real headless Neovim for the link tests) and `npm run typecheck`.
  Each run keeps its temp folders under one `lazycourse-test-<pid>` folder in `/tmp` and removes it at the end.
- `cd nvim-tutor && nvim --headless -u tests/minimal_init.lua -c "PlenaryBustedDirectory tests/ {minimal_init='tests/minimal_init.lua'}"`
- `cd pi-tutor && npm run golden`: golden transcripts through the real `pi -p` and your configured model (network;
  `GOLDEN_MODEL=provider/id` to try another, `GOLDEN_COLS=n` for your pane width, default 67). Evidence of how well a
  model follows the rules; not part of `npm test`.
- `cd pi-tutor && npm run cookbooks`: runs every cookbook example with the toolchains installed here.
- `cd pi-tutor && npm run lessons`: every lesson exercise and level task runs (in the sandbox when it can start): its
  reference must pass and its starter must fail; lesson texts are checked for leftover markup and broken links.
- `cd pi-tutor && node scripts/vendor-lessons.ts <language>` re-vendors a language's lessons from the pinned upstream
  commits (network); `python3 scripts/gap-lessons.py <sources> lessons` rewrites the input and files lessons.
- `cd pi-tutor && npm run upstream-diff`: compares the adapted expert skills with a fullstack-dev-skills checkout.
- `cd pi-tutor && SKILL_EVAL_WORKSPACE=<dir>/iteration-N SKILL_EVAL_BASELINE=<checkout without the packs> npm run skill-evals`:
  skill-creator test runs, each request with and without the pack skills.

## Layout

| Path | What |
|---|---|
| `pi-tutor/` | Pi package: the extension (`extensions/tutor/`), skills, prompts, packs, lessons, `commands.json`. `PI_SURFACE.md` lists every Pi and Neovim API it depends on. |
| `nvim-tutor/` | Neovim plugin: the pane (`term.lua`), commands and start-up (`init.lua`), run split (`runpane.lua`), help tab (`help.lua`), tour (`tour.lua`, `tour/steps.lua`). |
| `docs/superpowers/specs/` | Design specs, from the first design ([`2026-10-07-nvim-tutor-design.md`](docs/superpowers/specs/2026-10-07-nvim-tutor-design.md)) to the tour and wayfinding ([`2026-11-08-wayfinding-and-tour-design.md`](docs/superpowers/specs/2026-11-08-wayfinding-and-tour-design.md)). |
| `docs/superpowers/plans/` | Implementation plans, one per milestone. |

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

## Credits

- The tour's Neovim part is cut down and reworded from Neovim's own tutor (`vim-01/02-beginner`, by Michael C. Pierce
  and Robert K. Ware, modified by Bram Moolenaar, Felipe Morales and Rory Nesbitt), under the Vim license:
  `nvim-tutor/tour/LICENSE-vim.txt`.
- Lessons: Exercism, rustlings, the Python tutorial, Go by Example, the Node.js docs, the Rust Book and the Lua manual
  (see each `pi-tutor/lessons/<language>/SOURCES.md`). Expert skills adapted from fullstack-dev-skills (MIT).
