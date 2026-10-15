# Tables and metatables

A table is Lua's only data structure: one table can act as an array (keys 1..n), a map (any other key), or both at once.

## Arrays and the length operator

`#t` is the "border" of the array part: an index `n` where `t[n]` is non-nil and `t[n + 1]` is nil. With no holes it is the number of elements. With a hole, any border is a valid answer, so the result depends on how the table was built.

```lua
local fruits = { "apple", "pear", "plum" }
print(#fruits)            -- 3
fruits[#fruits + 1] = "fig"
print(#fruits, fruits[4]) -- 4 fig

local holey = { 1, 2, nil, 4 }
print(#holey == 4 or #holey == 2) -- true: either border is allowed
```

Teach: keep arrays free of `nil`; to "remove", use `table.remove(t, i)`, which shifts the rest down.

## Maps and iteration

`pairs` visits every key in no defined order; `ipairs` visits 1, 2, 3… and stops at the first `nil`.

```lua
local ages = { ada = 36, alan = 41 }
local names = {}
for name in pairs(ages) do names[#names + 1] = name end
table.sort(names) -- sort to get a stable order
print(table.concat(names, ","))
```

## Metatables and `__index`

A metatable changes how a table behaves. `__index` is consulted when a key is missing: if it is a table, the lookup continues there. That is how Lua does defaults and classes.

```lua
local defaults = { colour = "grey", size = 1 }
local shirt = setmetatable({ size = 3 }, { __index = defaults })
print(shirt.size, shirt.colour) -- 3 grey (colour came from defaults)
```

## A simple class

A "class" is a table used as the metatable `__index` of its instances; methods take `self` and are called with `:`.

```lua
local Counter = {}
Counter.__index = Counter

function Counter.new(start)
  return setmetatable({ value = start or 0 }, Counter)
end

function Counter:add(n)
  self.value = self.value + n
  return self
end

local c = Counter.new(5):add(2)
print(c.value) -- 7
```

Teach: `obj:add(2)` is `obj.add(obj, 2)`. Calling `obj.add(2)` passes `2` as `self`, a common bug.

## Other metamethods worth knowing

`__tostring` (used by `print`/`tostring`), `__eq`, `__lt`, `__le` (comparisons), `__add` and the other arithmetic ones, `__call` (call a table like a function), `__newindex` (catch assignments to missing keys), `__len` (`#`).

```lua
local Point = {}
Point.__index = Point
Point.__tostring = function(p) return "(" .. p.x .. ", " .. p.y .. ")" end
Point.__add = function(a, b) return setmetatable({ x = a.x + b.x, y = a.y + b.y }, Point) end
local p = setmetatable({ x = 1, y = 2 }, Point) + setmetatable({ x = 3, y = 4 }, Point)
print(tostring(p)) -- (4, 6)
```
