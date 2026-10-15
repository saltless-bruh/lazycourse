---
name: tutor-lua-cookbook
description: "Plain-words step → Lua idiom, each shown on a small unrelated example, with the minimum Lua version (and what changes under Neovim's LuaJIT) plus bridge lines from Python, Rust, Go and TypeScript. Use whenever the learner knows what they want to do but not how to say it in Lua (how do I count words, read a file, sort by a field, handle a bad number…), when the design recipe reaches Map (step 5) or a [workflow] line says Map, even if nobody says 'cookbook'."
---

# Lua cookbook

How to use: find the learner's plain step below and show the idiom on the example here, not on their task. Seeing the construct work somewhere neutral and then applying it to their own code is where the learning happens; writing their line takes that away. The hint ladder still decides how much to give, so below rung 5 name the idiom and point at it.

Every example runs with the standalone `lua` and uses only Lua 5.1 features unless its `since:` line says otherwise, so it also works in Neovim's LuaJIT.

## read-args: read the command-line arguments
since: 5.1
The standalone interpreter puts the arguments in the global table `arg`: `arg[1]` is the first, `#arg` the count. (Inside Neovim there is no `arg`; commands get their own arguments.)
```lua
local words = {}
for i = 1, #arg do
  words[#words + 1] = arg[i]
end
if #words == 0 then words = { "mercury", "venus" } end
print(#words .. " planets: " .. table.concat(words, ", "))
```
Bridge: Python `sys.argv[1:]` · Rust `std::env::args().skip(1)` · Go `os.Args[1:]` · TypeScript `process.argv.slice(2)`

## parse-number: turn text into a number, handling bad input
since: 5.1
`tonumber(text)` returns `nil` when the text is not a number, so test for `nil` before using it.
```lua
for _, raw in ipairs({ "21", "oops", "-4" }) do
  local celsius = tonumber(raw)
  if celsius == nil or celsius % 1 ~= 0 then
    print(string.format("%q is not a whole number", raw))
  else
    print(celsius, "C is", celsius * 9 / 5 + 32, "F")
  end
end
```
Bridge: Python `int(s)` with `except ValueError` · Rust `s.parse::<i64>()` returns a `Result` · Go `strconv.Atoi(s)` returns `(n, err)` · TypeScript `Number(s)` then `Number.isNaN`

## loop-index: loop over items with their position
since: 5.1
`ipairs(t)` walks the array part from index 1 and stops at the first `nil`, handing out index and value.
```lua
local rivers = { "Nile", "Amazon", "Yangtze" }
for i, river in ipairs(rivers) do
  print(i, river)
end
```
Bridge: Python `for i, x in enumerate(xs)` · Rust `for (i, x) in xs.iter().enumerate()` · Go `for i, x := range xs` · TypeScript `for (const [i, x] of xs.entries())`

## lookup-default: look up a key with a fallback value
since: 5.1
A missing key reads as `nil`, and `x or default` picks the default when `x` is `nil` (or `false`).
```lua
local stock = { apples = 3, pears = 0 }
for _, fruit in ipairs({ "apples", "pears", "plums" }) do
  print(fruit, stock[fruit] or 0)
end
```
Bridge: Python `d.get(k, 0)` · Rust `m.get(k).copied().unwrap_or(0)` · Go `v, ok := m[k]` · TypeScript `m.get(k) ?? 0`

## count-items: count how often each item appears
since: 5.1
Read the count with `or 0`, add one, store it back; `pairs` then walks the result in no fixed order.
```lua
local colours = { "red", "blue", "red", "green", "red", "blue" }
local counts = {}
for _, c in ipairs(colours) do
  counts[c] = (counts[c] or 0) + 1
end
print(counts.red, counts.blue, counts.green, counts.pink)
```
Bridge: Python `Counter(xs)` · Rust `*counts.entry(x).or_insert(0) += 1` · Go `counts[x]++` · TypeScript `m.set(x, (m.get(x) ?? 0) + 1)`

## group-by: group items by a key
since: 5.1
Create the group table the first time a key is seen, then `table.insert` into it.
```lua
local animals = { "cat", "cow", "dog", "duck", "crow" }
local by_letter = {}
for _, name in ipairs(animals) do
  local first = name:sub(1, 1)
  by_letter[first] = by_letter[first] or {}
  table.insert(by_letter[first], name)
end
print(table.concat(by_letter.c, " "), table.concat(by_letter.d, " "))
```
Bridge: Python `d.setdefault(k, []).append(x)` · Rust `m.entry(k).or_default().push(x)` · Go `g[k] = append(g[k], x)` · TypeScript `Map.groupBy(xs, f)`

## sort-by: sort records by a field
since: 5.1
`table.sort(t, less)` sorts in place; `less(a, b)` must return true when `a` goes first (and false for equal items).
```lua
local books = {
  { title = "Dune", year = 1965 },
  { title = "Emma", year = 1815 },
  { title = "Ulysses", year = 1922 },
}
table.sort(books, function(a, b) return a.year < b.year end)
for _, b in ipairs(books) do
  print(b.year, b.title)
end
```
Bridge: Python `sorted(xs, key=lambda r: r.year)` · Rust `xs.sort_by_key(|r| r.year)` · Go `slices.SortFunc(xs, func(a, b T) int { return cmp.Compare(a.Year, b.Year) })` · TypeScript `xs.toSorted((a, b) => a.year - b.year)`

## filter-map: keep some items and transform them
since: 5.1
Lua has no built-in map/filter: loop, test, and `table.insert` into a new table.
```lua
local temps = { 12, 25, 31, 8, 28 }
local warm_f = {}
for _, t in ipairs(temps) do
  if t > 20 then
    table.insert(warm_f, t * 9 / 5 + 32)
  end
end
print(table.concat(warm_f, ", "))
```
Bridge: Python `[f(x) for x in xs if p(x)]` · Rust `xs.iter().filter(p).map(f).collect()` · Go a `for` loop with `append` · TypeScript `xs.filter(p).map(f)`

## record-type: define a small record type with named fields
since: 5.1
A record is a table with string keys; a constructor function keeps every record the same shape.
```lua
local function Planet(name, moons)
  return { name = name, moons = moons }
end

local earth = Planet("Earth", 1)
local copy = Planet(earth.name, earth.moons)
print(earth.name, earth.moons, earth == copy, earth.name == copy.name)
```
Bridge: Python `@dataclass` · Rust `struct` · Go `type T struct { … }` · TypeScript `type T = { … }`

## maybe-value: represent "maybe there is no value"
since: 5.1
Return `nil` for "nothing"; the caller tests with `if x == nil` (or `if not x`).
```lua
local function first_long(words)
  for _, w in ipairs(words) do
    if #w > 6 then return w end
  end
  return nil
end

local found = first_long({ "fig", "kiwi" })
print(found == nil and "none found" or found)
```
Bridge: Python `X | None` · Rust `Option<T>` · Go `(v, ok)` or a pointer · TypeScript `T | undefined`

## errors: report a failure and handle it
since: 5.1
`error(msg, 2)` raises an error blamed on the caller; `pcall(f, ...)` runs `f` and returns `false, msg` instead of crashing.
```lua
local function withdraw(balance, amount)
  if amount > balance then
    error(string.format("cannot take %d, only %d left", amount, balance), 2)
  end
  return balance - amount
end

local ok, err = pcall(withdraw, 10, 25)
print(ok, err)
```
Bridge: Python `raise` with `try`/`except` · Rust `Result<T, E>` with `?` · Go `return fmt.Errorf("...: %w", err)` · TypeScript `throw new Error(...)` with `try`/`catch`

## read-file: read a text file line by line
since: 5.1
`io.lines(path)` opens the file, yields one line at a time without the newline, and closes it at the end.
```lua
local path = os.tmpname()
local f = assert(io.open(path, "w"))
f:write("roses are red\nviolets are blue\n")
f:close()
local n = 0
for line in io.lines(path) do
  n = n + 1
  print(n, line)
end
os.remove(path)
```
Bridge: Python `for line in open(p)` · Rust `BufReader::new(File::open(p)?).lines()` · Go `bufio.NewScanner(f)` · TypeScript `readFileSync(p, "utf8").split("\n")`

## write-file: write text to a file
since: 5.1
`io.open(path, "w")` returns a file handle (or `nil, err`); write, then `close` so the text is flushed.
```lua
local path = os.tmpname()
local f = assert(io.open(path, "w"))
f:write(table.concat({ "bread", "milk", "eggs" }, "\n"), "\n")
f:close()
local back = assert(io.open(path, "r"))
io.write(back:read("*a"))
back:close()
os.remove(path)
```
Bridge: Python `Path(p).write_text(s)` · Rust `std::fs::write(p, s)?` · Go `os.WriteFile(p, b, 0o644)` · TypeScript `writeFileSync(p, s)`

## format-string: build a string from values
since: 5.1
`string.format` works like C's printf: `%s` text, `%d` integer, `%.2f` two decimals.
```lua
local item, price, qty = "tea", 3.5, 4
print(string.format("%d x %s = %.2f EUR", qty, item, price * qty))
```
Bridge: Python `f"{name}: {n:.2f}"` · Rust `format!("{name}: {n:.2}")` · Go `fmt.Sprintf("%s: %.2f", name, n)` · TypeScript `` `${name}: ${n.toFixed(2)}` ``

## split-join: split a string and join parts
since: 5.1
There is no `split`: `gmatch` with the pattern `[^,]+` ("one or more non-commas") yields each piece; `table.concat` joins.
```lua
local trees = {}
for piece in ("oak,pine,birch"):gmatch("[^,]+") do
  trees[#trees + 1] = piece:upper()
end
print(#trees, table.concat(trees, " | "))
```
Bridge: Python `s.split(",")` and `",".join(xs)` · Rust `s.split(',')` and `xs.join(",")` · Go `strings.Split(s, ",")` and `strings.Join(xs, ",")` · TypeScript `s.split(",")` and `xs.join(",")`

## test-function: write a unit test for a function
since: 5.1
Without a framework, a test is a function of `assert(got == expected, message)` calls run through `pcall`, so one failure reports and the rest still run. busted (`describe`/`it`) does the same with nicer output.
```lua
local function initials(name)
  local out = {}
  for word in name:gmatch("%S+") do
    out[#out + 1] = word:sub(1, 1):upper()
  end
  return table.concat(out)
end

local tests = {
  two_words = function() assert(initials("ada lovelace") == "AL", "two words") end,
  empty = function() assert(initials("") == "", "empty") end,
}
local failed = 0
for name, t in pairs(tests) do
  local ok, err = pcall(t)
  if not ok then failed = failed + 1; print("FAIL", name, err) end
end
print(failed == 0 and "all passed" or failed .. " failed")
os.exit(failed == 0 and 0 or 1)
```
Bridge: Python `unittest` or `pytest` · Rust `#[test]` in a `mod tests` · Go `func TestX(t *testing.T)` · TypeScript `test()` from `node:test`

## read-trace: read a stack trace (point to `tutor-stack-traces`)
since: -
A Lua error prints `file.lua:line: message`, then `stack traceback:` with the newest call first; the first line in the learner's own file is where to look. In Neovim, errors from a plugin show the same shape in `:messages`. For the full walk-through, load `tutor-stack-traces` (section Lua).
Bridge: Python the traceback, read bottom-up · Rust panic message plus `RUST_BACKTRACE=1` · Go `panic:` and the goroutine trace · TypeScript the stack, read top-down
