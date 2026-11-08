# Wayfinding and first-run tour — design

Date: 2026-11-08. Source: the learner re-run after the learner-session fixes (merged 5a72f94, minors efb4b24) and
the brainstorm that followed. "Author" below is the project owner; "my call" marks a choice the spec writer made
that the author has not ruled on.

## 1. Intent

The author could not use the tutor without knowing what is where and which flow to follow — fresh, mid-onboarding,
or a new session on an established profile. There are 20 Pi commands, 19 Neovim commands and 3 keys, described in
four places that drift apart (Pi command descriptions, `nvim-tutor/lua/tutor/init.lua`, `COMMANDS_NOTE` in
`pi-tutor/extensions/tutor/commands-note.ts`, the README). Nothing on screen says where you are or what to do next,
and the machinery talks in the learner's voice (`[tutor] onboarding: …` shown as if the learner typed it).

The fix, in the author's words: the tool should always tell you where you are and the one next thing to do; you
should not have to remember where things are. Plus a tour for someone new to Neovim itself, and four smaller
re-run findings.

## 2. Goals

1. **Next-step line** (author's choice of the main fix): always on screen, says the one next thing to do for the
   current state. Code computes it, never the model.
2. **One command list** in the code that feeds every place commands are described.
3. **Session card**: on every session open (fresh, mid-onboarding, established), a short card — where you are,
   next step, where help is. Changes with where you are (author).
4. **Help key**: one key opens the full list, split into "type in the editor" vs "type in the tutor pane".
5. **One tour**, `:TutorTour`, teaching Neovim basics and then the tutor, in one go (author). Optional: offered on
   first run, skippable, startable any time (author: a command is enough to find it again).
6. **Opening Neovim opens the tutor too** (author: "the moment I type nvim … not only it open up nvim but the Pi
   tutor as well").
7. **No fake learner lines**: the extension's `[tutor] …` messages to the model are no longer shown as the learner's
   messages.
8. Re-run topics 2–5 (§9).

## 3. Non-goals

- Teaching Neovim in depth. The author: enough to use it; the rest they look up when they hit it.
- Teaching Pi skills. Skills are reading material for the model; the learner never needs to track them. They
  appear in none of the wayfinding surfaces.
- New commands beyond `:TutorTour`, `:TutorHelp`, `/tutor-help` and `<leader>t?`. No renaming of existing commands.
- A help panel that runs commands. It only shows them.

## 4. Anti-goals (failure even if it "works")

- The model decides the next step, passes a tour step, or picks the project title against the learner's idea.
- A newbie types a `/tutor-…` command into their code (or `:Tutor…` into the pane) because a surface did not say
  where it goes.
- The command list drifts again: a command registered in Pi or Neovim but missing from the list, or the reverse.
- Opening Neovim as git's commit editor (or any `nvim <file>` one-off) starts a Pi session.
- The suggestion swaps the learner's idea for an unrelated project.

## 5. Constraints (project rules that bind this work)

- Nothing writes to stdout/stderr inside Pi.
- Every new Pi API or Neovim RPC call is verified in
  `pi-tutor/node_modules/@earendil-works/pi-coding-agent/dist/core/extensions/types.d.ts` and recorded in
  `pi-tutor/PI_SURFACE.md` (the `pi-surface-check` skill).
- Pi never reads a path outside the project root. Tour checks that look at a practice file run in Lua; Pi receives
  only the result (step done), never file contents.
- `bash` stays off for the tutor model. The model never moves the level, passes a test, ticks a task or passes a
  tour step.
- TDD for both suites; live check with nemotron in the real editor config; `~/.pi/agent/settings.json` unchanged.

## 6. The command list (single source)

One data file lists every learner-facing command and key. Per entry: name, where it is typed
(`editor` | `pane` | `key`), its Neovim twin if any (`:TutorDone` ↔ `/tutor-done`), a one-line "what it's for",
arguments, a group (start · coding · paths and tests · record and settings), and **when it is relevant** (states
from §7). It must be readable by both TypeScript and Lua — my call: a JSON file in the repo that both load.

It feeds: the next-step line (§7), the session card (§8.1), the help panel (§8.2), the model's command note
(replacing the hand-written `COMMANDS_NOTE`; the model's note becomes state-aware the same way), and Pi's own
command descriptions. The README table: generated or checked — builder's choice.

A drift test fails when a command registered with `pi.registerCommand` or `nvim_create_user_command`, or a tutor
keymap, is missing from the list, or the list names one that is not registered.

The current inventory (2026-11-08) is in the brainstorm transcript and reproducible from `index.ts`
(`registerCommand`) and `init.lua` (`nvim_create_user_command`); five Pi commands have no Neovim twin
(status, improve, notes, memory, checker) — leave as is.

## 7. Next-step line

A third widget line (my call; today the widget has two: identity · level, and state), e.g. `next: :TutorRun test,
then :TutorDone P1.T2`. A pure function of the extension's known state, tested as a table. The states, at minimum:

| State | Next step (wording is the builder's; meaning is fixed) |
|---|---|
| fresh (first run) | type what you'd like to learn, or `:TutorTour` first |
| tour running | the current tour step's one-line instruction |
| onboarding talk | answer the tutor |
| level task given | do the task in `~/lazycourse/.checks`, then `/tutor-start check` |
| level read / project offer | answer the dialog |
| project waiting in another folder | open `<dir>` |
| onboarding paused | `/tutor-start` to pick up |
| plan job writing / failed | wait for the plan / `/tutor-start spec` |
| project, no task in progress | pick a task in `spec/tasks.md`, `/tutor-plan <task>` |
| recipe step N | the step's action, or "skip" / `/tutor-plan off` |
| coding a task, run failed / stuck | `:TutorRun test`; ask: type a question or `<leader>te` |
| checks pass | `:TutorDone <task>` |
| lesson / exam / step-up running | that mode's next command |

Every command it names comes from the list (§6), so the line always says where to type it. It repaints whenever
`paint()` runs today.

## 8. Session card, help, tour

### 8.1 Session card

Shown once when a session opens (Pi start, `/new`, `/resume`, the restart after the folder switch), for every
state. Three lines: **Where you are** (project · task · level, or "new here" / "onboarding: <stage>"), **Next**
(same function as §7), **Help** (the help key and `:TutorTour`). It never reaches the model (filtered from context
like `tutor_welcome` today) and renders as plain text, not under a `[customType]` label — my call: Pi's
`registerMessageRenderer` (types.d.ts ~1250; verify and record). On first run it replaces the `[tutor_welcome]` box
and carries the tour offer.

### 8.2 Help panel

From the editor: `:TutorHelp` and `<leader>t?` (my call on the key), in the which-key `<leader>t` group. From the
tutor pane: a new Pi command **`/tutor-help`** (author), which asks Neovim over RPC to open the same panel (new
RPC call: verify and record in `PI_SURFACE.md`). The leader key can't work in the pane because Space must reach Pi
as text. It opens in **its own Neovim tab** (author 2026-11-08: a separate window with room to show every command
with a clear explanation, not a floating window; tab rather than split is my call), and `q` closes the tab and
returns to where the learner was. Each entry gets its full explanation and arguments, not only a one-liner. Two columns or sections: **in the editor** and
**in the tutor pane**, plus a **moving around** row (`<Esc><Esc>` leave the pane, `<C-w>h` back to the code,
`<leader>tt` open/close). Top: what is relevant now (from §6 "when"); below: everything, by group. Read-only.

### 8.3 The tour (`:TutorTour`)

**Who and when.** Offered on first run in the session card; skipping is free; `:TutorTour` starts it any time,
including mid-onboarding (author). Someone with a profile never gets the offer, only the command. A skip, or a tour
quit halfway, is remembered in the profile (a setting, my call), so the offer does not come back on the next fresh
session; `:TutorTour` still works. A question typed during the tour is answered as a tour question, not taken as the
onboarding's first answer (today `before_agent_start` treats a first-run first message that way, index.ts ~578). It ends by handing
over to onboarding: "type what you'd like to learn" (onboarding then starts as today). My call: progress is saved,
so `:TutorTour` resumes; `:TutorTour restart` starts over; `:TutorTour off` stops.

**Length.** Long enough to use the tool, not to master Neovim (author). Target ~10–15 minutes, roughly 15–20 steps
(my call).

**Content.** Part 1, Neovim — cut down and reworded from Neovim's own `vim-01-beginner` / `vim-02-beginner` lessons
(`/usr/share/nvim/runtime/tutor/en/`, Vim license: keep its notice): normal vs insert mode, moving, deleting and
changing, undo/redo, save and quit, search, opening a file (`:e` and LazyVim's file picker), windows and splits.
Part 2, the tutor — what the author found hardest: leaving terminal mode and getting back to the code, opening a
file, editing, running and compiling (`:TutorRun`, test mode, `q` closes the run split), what to type in the tutor
(a question; the commands that matter), asking about an error (`<leader>te`, right-click), and that the next-step
line and the help key exist.

**How a step works** (author: our tutor delivers it instead of Neovim's static lesson; mechanics are my call):

```
practice buffer (~/lazycourse/.tour/, a copy shipped with nvim-tutor)      tutor pane
 ┌───────────────────────────────────────┐                     ┌──────────────────────────┐
 │ step 4/18  Delete with x               │                     │ tour 4/18: delete with x │ ◀ code-written card
 │ The ccow jumpedd ovverr thhe mooon. ✗  │                     │ learner asks "what is    │
 └───────────────────┬───────────────────┘                     │ normal mode?" → model    │
                     │ Lua checks the step (expected line,      │ answers, with a tour     │
                     │ mode change, window focus, file opened,  │ section in its prompt    │
                     │ :TutorRun finished…) → ✓                 └──────────────────────────┘
                     └── push "tour step 4 done" ──▶ extension saves progress, next step
```

- Text-editing steps check expected lines like Neovim's `.tutor.json` (`expect`), with ✓/✗ signs. Our own small
  check, not Neovim's internal `nvim.tutor` module (my call).
- Steps about the pane and the run split check editor events (entered/left terminal mode, focused the editor window,
  the run split opened and closed, a file opened).
- Code passes every step. The model only explains and answers questions during the tour.
- Our `:Tutor` keeps overriding Neovim's built-in `:Tutor` (my call; the tour replaces the need for it).

### 8.4 Opening Neovim opens the tutor

When Neovim starts for normal editing, the tutor pane opens too (author). **Where** (author, 2026-11-08): only when
Neovim's start folder is a known tutor project (`profile.projectAt`) or `~/lazycourse` (or inside it). Anywhere else
Neovim opens normally and `:Tutor` still works by hand — so plain `nvim` from `~` never roots Pi at home. A first-run
learner (no profile yet) starts from `~/lazycourse`, which the README's first steps say to `cd` into (my call: the
plugin creates the folder if missing when `:TutorTour` or `:Tutor` first runs).

**First-ever start outside** (my call, after the folder rule left a gap): when no profile exists yet (the profile
file `~/.local/share/nvim-tutor/profile.sqlite` is absent) and Neovim starts outside those folders, the tutor does
not open, but one line says: "New to lazycourse? :TutorTour teaches Neovim and the tutor". `:TutorTour` moves Neovim
into `~/lazycourse/.tour` (created if missing) through the existing project switch, so Pi is never rooted at `~`.

Also guarded (my call): not with file arguments, not headless, not as git's `$EDITOR`; a plugin option turns
auto-open off. The plugin can't ask the profile database cheaply from Lua — my call: the extension writes the list of
project folders to a small file the plugin reads at start-up, or the plugin checks for the project marker files the
scaffold writes; builder picks, but it must not start Pi just to ask.

**Neovim config** (author: yes, move keys in): `<leader>tt`, `<leader>tr` move from
`~/.config/nvim/lua/plugins/tutor.lua` into the plugin's `setup()` next to `<leader>te`, with `<leader>t?` added, so
the drift test (§6) sees every key. The author's `tutor.lua` shrinks to load-at-start (`lazy = false` or a
`VimEnter` event) plus `opts`; show the author the diff before writing that file. Update the README setup snippet to
match.

## 9. Hidden `[tutor]` lines and re-run topics

### 9.1 No fake learner lines (topic 1)

Today ~15 places call `pi.sendUserMessage("[tutor] …", { deliverAs: "followUp" })` (`sendWhenIdle`, `kick`, the
stuck signal, recipe start and step moves, lesson, project). Each shows as a learner bubble and in Pi's
"Follow-up:" queue line. Change: send them as hidden custom messages —
`pi.sendMessage({ customType, content, display: false }, { triggerTurn: true, deliverAs: "followUp" })`. Pi turns a
custom message into a user-role message for the model (`dist/core/messages.js`, `case "custom"`), so the model still
hears it; the session format documents `display: false` as hidden.

The 13 `startsWith(TUTOR_PREFIX)` checks in `index.ts` (and 3 in `compliance.ts`) that keep nudges from opening a
chat episode, moving the recipe or counting as a learner question must keep that behaviour once nudges arrive as
custom messages (`before_agent_start` gets `messageType: "custom"` and an empty prompt). The new custom type must
not be in `LEARNER_ONLY`. Live check: whether Pi's "Follow-up:" line still shows queued hidden messages; if it does,
report it rather than work around it.

### 9.2 The suggestion keeps the learner's idea (topic 2)

Author: exactly that project, at their level; if it is far beyond their level, say so and offer a smaller version.

- Idea given and it fits the level: the project is the idea (code keeps it as the title); the model writes only the
  summary and concepts for the level. The title is the learner's own words, trimmed by code, never reworded by the
  model (my call): drop lead-ins like "I want to make", cut to a short length at a word boundary, since the title
  also names the project folder (`start.ts`, `~/lazycourse/<lang>-<slug>`). The "stays tied" check compares against
  the learner's full idea text.
- Idea far beyond the level: the tutor says it is too big for level N and offers a smaller version of the same idea
  ("a 3D game engine" → a text-mode version). The model judges fit (my call); code checks that every offer stays tied
  to the idea (my call: shares the idea's key words; one re-ask, then an honest notice instead of an unrelated
  project).
- "Show me something else": the model is free; the idea is no longer forced.
- No idea: as today.

### 9.3 Level shows as soon as it is accepted (topic 3)

In the onboarding read step, "Yes" (or a typed level) sets the level and repaints right then; today it is only saved
when the project folder is created, so the widget says "level not set". Also check `levelKnown` at session start:
`newOnboarding` sets `level: null`, and the check compares `=== undefined`.

### 9.4 Open buffers follow the plan job (topic 4)

After the plan job's `writeScaffold(…, { existing: true })` rewrites `README.md` (adding `run:`) and `spec/tasks.md`,
reload any open, unmodified buffer of those files (`link.reloadFile` exists). A modified buffer is not reloaded; the
learner gets a notice. No W11/W12 prompt may appear.

### 9.5 Pane text cut off after the folder switch (topic 5)

After `require("tutor").switch(dir, file)` restarts Pi in the new folder, the pane briefly showed text cut off on the
left. First reproduce it with screen-replay (`sr`); fix the cause found. Current guess: Pi's first frame draws before
the pane has its final width; a redraw once the size settles fixes it. If the replay shows another cause, fix that
instead.

## 10. Left to the builder

- Exact wording of every line, card and tour step (plain, short, beginner-pitched).
- The command list's file location and format, provided TS and Lua both read it and the drift test exists.
- Widget layout details within the existing width limit.
- How tour steps are stored and how Lua reports events.
- Order of work. Suggested: command list + drift test → next-step line → session card → hidden lines → topics 3, 4,
  2 → help panel → tour → auto-open → topic 5.

## 11. Done when

- Both suites and the typecheck pass; drift test in place.
- `nvim` from `~` (outside any project) opens Neovim only; `nvim` in a project or `~/lazycourse` opens the pane.
- Live run with nemotron in the real config, from an empty profile, in `~/lazycourse`: `nvim` opens the pane; the card offers the tour;
  the tour runs end to end and hands over to onboarding; no `[tutor] …` line appears as a learner message; the idea
  is kept (and a too-big idea gets a smaller version); the level shows on "Yes"; the README buffer shows `run:` after
  the plan; the pane is not cut off after the folder switch.
- A second live run on an established profile: the card and next-step line match the state; the help key shows both
  columns.
- pane-reviewer reviews before merge.
