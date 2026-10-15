# Lua card

- **Format:** `stylua`; lint with `luacheck` or `selene`.
- **Names:** `snake_case`; declare everything `local` (a missing `local` makes a global); a module is a file that returns a table.
- **Errors:** `error(msg)` raises, `pcall(f, ...)` catches and returns `false, msg`; many functions instead return `nil, err`. A traceback lists the newest call first.
- **Layout:** `main.lua` or `init.lua`, modules under `lua/<name>/` (Neovim) or beside the script, a `*.rockspec` for a published package.
- **Test:** `busted` when installed, else a script of `assert(...)` run with `lua`.
- **Versions:** standalone `lua` here is 5.5: integer division `//` and integer/float subtypes (5.3), `<const>` and `<close>` (5.4). Neovim runs LuaJIT, which is 5.1 plus a few 5.2 additions: none of those. Say which one the learner's code targets.
- **Pitfalls:** arrays start at 1; `#t` is unreliable when the table has `nil` holes; only `nil` and `false` are false (0 and "" are true); not-equal is `~=`; `..` joins strings; `obj:method()` passes `self`, `obj.method()` does not; string patterns are not regular expressions.

## Concept tags
- `tables`: tables, arrays (aliases: table, arrays, indexing)
- `metatables`: metatables, `__index` (aliases: metatable, metamethods)
- `closures`: closures, upvalues (aliases: closure, upvalues)
- `functions`: functions, returns (aliases: function, multiple-returns)
- `strings`: strings, `..` (aliases: string, concatenation)
- `patterns`: string patterns (aliases: pattern, gsub, gmatch)
- `iteration`: pairs, ipairs, for (aliases: loops, pairs, ipairs, for-loop)
- `modules`: require, returns (aliases: require, module)
- `errors`: error, pcall (aliases: error-handling, pcall)
- `coroutines`: coroutines (aliases: coroutine, yield)
- `oop`: objects, `:` methods (aliases: classes, self, methods)
- `varargs`: `...` (aliases: vararg)
- `scope`: local, globals (aliases: local, globals)
- `numbers`: integer, float, `//` (aliases: integer-division, floats)
