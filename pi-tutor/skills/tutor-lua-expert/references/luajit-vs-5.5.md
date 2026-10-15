# Standalone Lua 5.5 versus Neovim's LuaJIT

Checked on this machine (2026-10-15): `lua` reports `Lua 5.5`; `luajit` and Neovim both report `LuaJIT 2.1.1791890110`, whose `_VERSION` is `Lua 5.1`. When a learner's code moves between a script and their Neovim config, these are the differences that bite.

| Feature | Lua 5.5 | LuaJIT (Neovim) | What to use in code for both |
|---|---|---|---|
| integer division `//` | yes (5.3+) | no: syntax error | `math.floor(a / b)` |
| integer and float subtypes, `math.type` | yes (5.3+) | no: all numbers are doubles | don't rely on `1` vs `1.0` |
| bitwise `& \| ~ << >>` | yes (5.3+) | yes in this build; older LuaJIT: no | `bit.band` etc. is LuaJIT-only; pick per target |
| `bit` library | no | yes | — |
| `goto` and labels | yes (5.2+) | yes | either |
| `<const>`, `<close>` locals | yes (5.4+) | no: syntax error | plain `local` |
| `utf8` library | yes (5.3+) | no | `vim.str_utfindex` etc. in Neovim |
| `table.unpack`, `table.pack` | yes | no (`unpack` is a global) | `local unpack = table.unpack or unpack` |
| `load(string)` | yes | yes (`loadstring` too) | `load` |
| `setfenv` / `getfenv` | no (`_ENV` instead) | yes | avoid; pass tables explicitly |

The portable unpack shim, which runs on both:

```lua
local unpack = table.unpack or unpack
print(unpack({ "a", "b" })) -- a b
```

A version check, when code really must branch:

```lua
local is_jit = type(jit) == "table"
print(is_jit and "LuaJIT" or _VERSION)
```

Teach: Neovim plugins and config should be written for LuaJIT; a standalone script can use everything in 5.5. When an error says "unexpected symbol near '/'" in Neovim, look for `//`.
