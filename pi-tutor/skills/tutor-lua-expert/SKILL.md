---
name: tutor-lua-expert
description: "Lua patterns, pitfalls and review checklists for teaching: tables and metatables, closures and modules, errors and pcall, coroutines, and the differences between standalone Lua 5.5 and Neovim's LuaJIT, with what to check in the learner's code and why. Use whenever the learner asks how tables, metatables, closures or modules work, writes Lua that behaves oddly (globals, nil holes, 0 being true), writes Neovim config or plugin Lua, or shares Lua for review, even if they don't ask for a review. Explains and checks; never writes the learner's solution."
license: MIT
---

# Lua expert (teaching)

Written for lazycourse (not adapted from another package). Every code sample in `references/` runs with the standalone `lua` 5.5; samples that also need LuaJIT say so.

## How to use it as a tutor
- Explain the idea on a small unrelated example, point at the learner's line, then ask one question that makes them see the gap. Lua is small enough that the learner can hold the whole model in their head once they build it themselves, so never write their line: until this turn's instruction allows the fix, name the idea and point.
- First settle which Lua the code targets: a standalone script (5.5 here) or Neovim (LuaJIT, 5.1-based). Several answers differ between them; `references/luajit-vs-5.5.md` has the list.
- Pro band: words, or a contrast with a language they know, and no code.

## Knowledge map
Read the one file that matches the question.

| File | What is in it | Read it when |
|---|---|---|
| `references/tables-metatables.md` | arrays vs maps, `#` and nil holes, metatables, `__index`, simple objects | tables behave oddly, or they want classes |
| `references/closures-modules.md` | upvalues, closures in loops, `require` and module tables, globals | state between calls, modules, a "global is nil" bug |
| `references/errors-coroutines.md` | `error`/`pcall`/`xpcall`, `nil, err` returns, coroutines | failure handling, tracebacks, generators |
| `references/luajit-vs-5.5.md` | what works where: `//`, integers, `<const>`, `<close>`, utf8, unpack | code moves between Neovim and a script |

## Review checklist (ask, don't fix)
Turn each item into a question about their code, one at a time, most important first:
- Is every variable declared `local`? Ask what else in the program can now see and change it.
- Does the code use `#t` on a table that can contain `nil`? Ask what `#` means when there is a hole.
- Does a condition rely on `0` or `""` being false? In Lua only `nil` and `false` are.
- Are methods called with `:` where they use `self`, and defined with `:` too?
- Does a function that can fail say so, by raising with `error` or returning `nil, err`, and does the caller check?
- Is string matching using Lua patterns where the learner expected regular expressions (`%d` not `\d`, `-` is lazy repetition)?
- For Neovim code: does it use 5.2+ features LuaJIT lacks?

## Pitfalls to watch for
- Arrays start at 1; `for i = 0, #t` reads one slot too many.
- `~=` is not-equal; `!=` is a syntax error.
- `..` joins strings; `+` on two strings converts them to numbers (or errors).
- A closure created in a loop captures that iteration's variable (unlike some languages), which is usually what they want.
- `table.insert(t, pos, v)` shifts elements; inserting into a sparse table is undefined.
