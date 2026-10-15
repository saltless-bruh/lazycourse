---
name: tutor-editor-cookbook
description: "How to do everyday things in the learner's LazyVim (16.0.1, keys checked against their config): open a file, search the project, jump to a definition and back, see and fix errors, rename, split windows, undo, run the project and talk to the tutor. Use whenever the learner asks how to do something in the editor, seems lost in Neovim (stuck in a mode, can't find a file, doesn't know a key), or when a fix needs an editor action they may not know, even if they don't say 'Neovim' or 'LazyVim'."
---

# Editor cookbook (LazyVim)

How to use: give the learner the key sequence for the one thing they are trying to do, then let them press it. Muscle memory comes from doing it, so name the keys rather than doing it for them, and mention the `Also:` command when keys feel like too much at once. Leader is Space: pressing it and waiting shows the which-key menu, a good way to rediscover any key here. Keys marked "language server" only exist once one is attached to the file (the language's server must be installed, for example through `:Mason`).

## open-file: open a file by name
since: LazyVim 16
1. Press `<leader><space>` (Space, then Space).
2. Type part of the file name; the list narrows as you type.
3. Move with the arrow keys or `<C-j>`/`<C-k>`, then `<Enter>` opens it.
4. `<leader>e` instead shows the file tree; `<Enter>` opens, `q` closes it.
Also: `:e path/to/file`

## search-project: find text in the whole project
since: LazyVim 16
1. Press `<leader>/`.
2. Type the text; every matching line in the project is listed.
3. `<Enter>` jumps to the selected match.
4. In the current file only, `/text` then `<Enter>` searches; `n`/`N` go to the next/previous hit.
Also: `:grep text` (then `:copen`)

## jump-definition: go to where a name is defined and back
since: LazyVim 16 (language server)
1. Put the cursor on the name.
2. Press `gd` to jump to its definition; `gr` lists every place that uses it.
3. Press `K` to see its type or documentation in a float.
4. Press `<C-o>` to jump back to where you were (`<C-i>` goes forward again).
Also: `:lua vim.lsp.buf.definition()`

## see-errors: see this file's errors and jump between them
since: LazyVim 16
1. Errors show as signs in the left column and text at the line end.
2. Press `]d` for the next problem, `[d` for the previous one.
3. Press `<leader>cd` to read the full message of the problem on this line.
4. Press `<leader>xx` for a list of every problem; `<Enter>` jumps, `q` closes.
Also: `:lua vim.diagnostic.setloclist()`

## fix-suggestion: apply the language server's suggested fix
since: LazyVim 16 (language server)
1. Put the cursor on the underlined problem.
2. Press `<leader>ca` to see the available code actions.
3. Pick one with the arrow keys and `<Enter>`; read the change before saving.
Also: `:lua vim.lsp.buf.code_action()`

## rename-symbol: rename a name everywhere
since: LazyVim 16 (language server)
1. Put the cursor on the name.
2. Press `<leader>cr`, type the new name, press `<Enter>`.
3. Every use in the project changes; `:wa` saves all changed files.
Also: `:lua vim.lsp.buf.rename()`

## split-windows: work on two files side by side
since: LazyVim 16
1. Press `<leader>|` to split right, or `<leader>-` to split below.
2. Open the second file in the new window (`<leader><space>`).
3. Move between windows with `<C-h>`, `<C-j>`, `<C-k>`, `<C-l>`.
4. `:q` closes the current window (the file stays open as a buffer).
Also: `:vsplit` and `:split`

## undo-redo: undo and redo
since: -
1. In normal mode (press `<Esc>` first), press `u` to undo the last change.
2. Press `<C-r>` to redo it.
3. Undo works per change, so a whole insert-mode session undoes in one step.
Also: `:undo` and `:redo`

## run-project: run the project and send the result to the tutor
since: lazycourse
1. Save with `:w` (or `:wa` for every file).
2. Press `<leader>tr` (or `:TutorRun`); the project's run command starts in a terminal.
3. When it fails, the tutor gets the error output and opens a stuck episode to help read it.
Also: `:TutorRun`

## talk-to-tutor: open the tutor, type, leave the terminal
since: lazycourse
1. Press `<leader>tt` (or `:Tutor`) to show the tutor pane.
2. Type the question and press `<Enter>`; the pane is a terminal in insert mode.
3. Press `<C-\><C-n>` to leave terminal input, then `<C-h>` to go back to the code window.
4. `<leader>tt` again hides the pane; the conversation stays.
Also: `:Tutor`
