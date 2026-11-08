-- The lazycourse tour (wayfinding spec 2026-11-08 §8.3). Part 1 is cut down and reworded from Neovim's own
-- vim-01/vim-02-beginner lessons (see LICENSE-vim.txt next to this file); Part 2 is the tutor.
-- A step: title, text (lines shown in tour.txt), and a check code runs:
--   { kind = "lines", expect = {…} } — the practice lines (between >>> and <<<) must read exactly so;
--   { kind = "event", name = "…" }   — the editor did it (tour.lua and the plugin send the event).
return {
  {
    title = "Two modes: typing and commands",
    text = {
      "Neovim starts in NORMAL mode: keys are commands, not text. To type, enter INSERT mode;",
      "press <Esc> to go back to NORMAL mode. When unsure where you are, press <Esc>.",
      "",
      "Do it: move the cursor onto the practice line below (use the arrow keys for now),",
      "press A (append at the end of the line), type  world  and press <Esc>.",
    },
    practice = { "Hello" },
    check = { kind = "lines", expect = { "Hello world" } },
  },
  {
    title = "Moving, and deleting a letter with x",
    text = {
      "In NORMAL mode: h left, j down, k up, l right. w jumps to the next word, b back a word.",
      "x deletes the letter under the cursor.",
      "",
      "Do it: move onto each doubled letter below and press x until the line reads",
      "The cow jumped over the moon.",
    },
    practice = { "The ccow jumpedd ovverr the mooon." },
    check = { kind = "lines", expect = { "The cow jumped over the moon." } },
  },
  {
    title = "Deleting a word with dw",
    text = {
      "d is delete; it waits for what to delete. dw deletes from the cursor to the next word.",
      "",
      "Do it: put the cursor on the first letter of the extra  big  and press dw.",
    },
    practice = { "The big big dog sleeps." },
    check = { kind = "lines", expect = { "The big dog sleeps." } },
  },
  {
    title = "Deleting a line with dd",
    text = {
      "dd deletes the whole line the cursor is on.",
      "",
      "Do it: delete the middle line below with dd.",
    },
    practice = { "keep me", "delete me", "keep me too" },
    check = { kind = "lines", expect = { "keep me", "keep me too" } },
  },
  {
    title = "Undo with u, redo with Ctrl-r",
    text = {
      "u undoes your last change; Ctrl-r (hold Ctrl, press r) redoes it. Mistakes are cheap.",
      "",
      "Do it: delete any letter below with x, then press u to bring it back.",
    },
    practice = { "Nothing here can break." },
    check = { kind = "event", name = "undo" },
  },
  {
    title = "Changing a word with cw",
    text = {
      "c is change: cw deletes to the end of the word and leaves you in INSERT mode to type.",
      "",
      "Do it: put the cursor on  tea , press cw, type  code  and press <Esc>.",
    },
    practice = { "I like tea." },
    check = { kind = "lines", expect = { "I like code." } },
  },
  {
    title = "A new line with o",
    text = {
      "o opens a new line below the cursor and puts you in INSERT mode (O opens one above).",
      "",
      "Do it: on the practice line press o, type  second line  and press <Esc>.",
    },
    practice = { "first line" },
    check = { kind = "lines", expect = { "first line", "second line" } },
  },
  {
    title = "Saving with :w",
    text = {
      "Commands that start with : are typed at the bottom of the screen. :w writes (saves) the file;",
      ":q quits, :wq does both. Press <Esc> first so you are in NORMAL mode.",
      "",
      "Do it: type :w and press <Enter>.",
    },
    check = { kind = "event", name = "written" },
  },
  {
    title = "Searching with /",
    text = {
      "/ searches: type /word and press <Enter>. n goes to the next match, N to the one before.",
      "",
      "Do it: search for  moon  — type /moon and press <Enter>.",
    },
    check = { kind = "event", name = "searched" },
  },
  {
    title = "Opening a file",
    text = {
      ":e <file> opens a file (Tab completes the name). In LazyVim, <Space><Space> opens a file picker:",
      "type part of the name, press <Enter>. Ctrl-o jumps back to where you were.",
      "",
      "Do it: open notes.txt — type :e notes.txt and press <Enter>, then press Ctrl-o to come back.",
    },
    check = { kind = "event", name = "opened" },
  },
  -- Part 2: the tutor.
  {
    part = 2,
    title = "Open the tutor pane",
    text = {
      "The tutor lives in a pane on the right. <leader>tt opens or closes it (<leader> is the Space key:",
      "press Space, then t, then t). Inside it you are in TERMINAL mode: what you type goes to the tutor.",
      "",
      "Do it: press <leader>tt (or type :Tutor), then click or move into the pane so you can type.",
    },
    check = { kind = "event", name = "pane_open" },
  },
  {
    part = 2,
    title = "Ask the tutor something",
    text = {
      "Type a question at the tutor's prompt and press <Enter>, for example: what is normal mode?",
      "It answers with hints and questions, not finished code. Commands for it start with / (like /tutor-start).",
    },
    check = { kind = "event", name = "asked" },
  },
  {
    part = 2,
    title = "Leave the pane: <Esc><Esc>",
    text = {
      "To stop typing into the tutor, press <Esc> twice. That gives you Neovim's NORMAL mode back in the pane.",
    },
    check = { kind = "event", name = "pane_left" },
  },
  {
    part = 2,
    title = "Back to your code: Ctrl-w h",
    text = {
      "Ctrl-w then h moves to the window on the left (your code); Ctrl-w then l moves right, to the tutor.",
      "",
      "Do it: after <Esc><Esc>, press Ctrl-w then h.",
    },
    check = { kind = "event", name = "editor_back" },
  },
  {
    part = 2,
    title = "Run a program: :TutorRun",
    text = {
      ":TutorRun runs your project's program in a split below (<leader>tr does the same). You see its output",
      "there and type its input there. This folder's program is hello.lua; it asks your name.",
      "",
      "Do it: type :TutorRun and press <Enter>, then type your name in the split and press <Enter>.",
    },
    check = { kind = "event", name = "run_done" },
  },
  {
    part = 2,
    title = "Close the run split: q",
    text = {
      "When the program has ended, press q in the run split to close it.",
      "(:TutorRun test runs your project's tests instead; :TutorRun stop stops a program that runs too long.)",
    },
    check = { kind = "event", name = "run_closed" },
  },
  {
    part = 2,
    title = "Ask about an error: <leader>te",
    text = {
      "On a line with an error, <leader>te (or right-click, \"Ask tutor about this error\") sends the error and",
      "the line to the tutor as your question.",
      "",
      "Do it: open hello.lua (:e hello.lua). Line 2 has a practice error mark: put the cursor on line 2 and",
      "press <leader>te. Then Ctrl-o comes back here.",
    },
    check = { kind = "event", name = "asked_error" },
  },
  {
    part = 2,
    title = "Help, and the next step",
    text = {
      "The tutor's box at the top of its pane always says what to do next (\"next: …\").",
      "<leader>t? (or :TutorHelp, or /tutor-help in the pane) opens every command, explained, in its own tab;",
      "q closes it. :TutorTour comes back to this tour any time.",
      "",
      "Do it: press <leader>t? and then q. That ends the tour: then tell the tutor what you'd like to learn.",
    },
    check = { kind = "event", name = "help_opened" },
  },
}
