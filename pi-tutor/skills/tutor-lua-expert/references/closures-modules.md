# Closures, scope and modules

## local versus global

A variable without `local` is a field of the global table `_G`: every file and function can see and change it. A typo in a name silently creates a new global (reading it gives `nil`), which is why linters flag globals.

```lua
local function count()
  total = (total or 0) + 1 -- no `local`: this is _G.total
  return total
end
count(); count()
print(total, _G.total) -- 2 2: it leaked out of the function
```

Teach: declare everything `local`, at the top of the smallest scope that needs it.

## Closures and upvalues

A function keeps the local variables it uses from the enclosing scope (its upvalues), even after that scope ends. Each call of the outer function makes fresh upvalues.

```lua
local function make_counter()
  local n = 0
  return function()
    n = n + 1
    return n
  end
end

local a, b = make_counter(), make_counter()
print(a(), a(), b()) -- 1 2 1: a and b each have their own n
```

In a numeric or generic `for`, each iteration has its own copy of the loop variable, so closures made in the loop remember their own value:

```lua
local fns = {}
for i = 1, 3 do fns[i] = function() return i end end
print(fns[1](), fns[3]()) -- 1 3
```

## Modules and require

A module is a file that returns a value, usually a table of functions. `require("name")` finds the file on `package.path`, runs it once, caches the result in `package.loaded`, and returns it; later `require` calls return the same table.

```lua
package.preload["greeter"] = function() -- stands in for a greeter.lua file
  local M = {}
  local count = 0 -- private: not in M, so callers cannot touch it
  function M.hello(name)
    count = count + 1
    return "hello " .. name .. " #" .. count
  end
  return M
end

local g1 = require("greeter")
local g2 = require("greeter")
print(g1.hello("ada"), g1 == g2) -- hello ada #1 true
```

In Neovim, `require("foo.bar")` looks for `lua/foo/bar.lua` (or `lua/foo/bar/init.lua`) on the runtime path; editing the file does not reload it until `package.loaded["foo.bar"] = nil` or a restart.

## Varargs

`...` holds the extra arguments; `select("#", ...)` counts them including `nil`s, and `{...}` packs them (losing trailing `nil`s).

```lua
local function show(...)
  return select("#", ...), table.concat({ ... }, ",")
end
print(show("a", "b", "c")) -- 3 a,b,c
```
