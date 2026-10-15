---
name: tutor-python-cookbook
description: "Plain-words step → Python idiom, each shown on a small unrelated example, with the minimum Python version and bridge lines from Rust, Go, TypeScript and Lua. Use whenever the learner knows what they want to do but not how to say it in Python (how do I count words, read a file, sort by a field, handle a bad number…), when the design recipe reaches Map (step 5) or a [workflow] line says Map, even if nobody says 'cookbook'."
---

# Python cookbook

How to use: find the learner's plain step below and show the idiom on the example here, not on their task. Seeing the construct work somewhere neutral and then applying it to their own code is where the learning happens; writing their line takes that away. The hint ladder still decides how much to give, so below rung 5 name the idiom and point at it.

## read-args: read the command-line arguments
since: 3.0
index: `sys.argv[1:]`
`sys.argv` is the list of words on the command line; `sys.argv[0]` is the script, so the arguments start at index 1.
```python
import sys

words = sys.argv[1:] or ["mercury", "venus"]
print(f"{len(words)} planets:", ", ".join(words))
```
Bridge: Rust `std::env::args().skip(1)` · Go `os.Args[1:]` · TypeScript `process.argv.slice(2)` · Lua `arg[1]`

## parse-number: turn text into a number, handling bad input
since: 3.0
index: `int(s)` with `except ValueError`
`int(text)` raises `ValueError` on bad input; catch exactly that error and decide what a bad value means.
```python
for raw in ["21", "oops", "-4"]:
    try:
        celsius = int(raw)
    except ValueError:
        print(f"{raw!r} is not a whole number")
        continue
    print(celsius, "C is", celsius * 9 / 5 + 32, "F")
```
Bridge: Rust `s.parse::<i64>()` returns a `Result` · Go `strconv.Atoi(s)` returns `(n, err)` · TypeScript `Number(s)` then `Number.isNaN` · Lua `tonumber(s)` returns `nil`

## loop-index: loop over items with their position
since: 3.0
index: `for i, x in enumerate(xs)`
`enumerate` hands out (position, item) pairs, so there is no `range(len(...))` to get wrong.
```python
rivers = ["Nile", "Amazon", "Yangtze"]
for rank, river in enumerate(rivers, start=1):
    print(rank, river)
```
Bridge: Rust `for (i, x) in xs.iter().enumerate()` · Go `for i, x := range xs` · TypeScript `for (const [i, x] of xs.entries())` · Lua `for i, x in ipairs(xs)`

## lookup-default: look up a key with a fallback value
since: 3.0
index: `d.get(k, 0)`
`dict.get(key, default)` returns the default instead of raising `KeyError` when the key is missing.
```python
stock = {"apples": 3, "pears": 0}
for fruit in ["apples", "plums"]:
    print(fruit, stock.get(fruit, 0))
```
Bridge: Rust `m.get(k).copied().unwrap_or(0)` · Go `v, ok := m[k]` · TypeScript `m.get(k) ?? 0` · Lua `t[k] or 0`

## count-items: count how often each item appears
since: 3.1
index: `Counter(xs)`
`collections.Counter` counts anything you can iterate; `most_common(n)` gives the top entries.
```python
from collections import Counter

colours = ["red", "blue", "red", "green", "red", "blue"]
counts = Counter(colours)
print(counts["red"], counts["pink"])
print(counts.most_common(2))
```
Bridge: Rust `*counts.entry(x).or_insert(0) += 1` · Go `counts[x]++` · TypeScript `m.set(x, (m.get(x) ?? 0) + 1)` · Lua `t[x] = (t[x] or 0) + 1`

## group-by: group items by a key
since: 3.0
index: `d.setdefault(k, []).append(x)`
`dict.setdefault(key, [])` returns the list for that key, creating it the first time.
```python
animals = ["cat", "cow", "dog", "duck", "crow"]
by_letter: dict[str, list[str]] = {}
for name in animals:
    by_letter.setdefault(name[0], []).append(name)
print(by_letter)
```
Bridge: Rust `m.entry(k).or_default().push(x)` · Go `g[k] = append(g[k], x)` · TypeScript `Map.groupBy(xs, f)` · Lua `t[k] = t[k] or {}; table.insert(t[k], x)`

## sort-by: sort records by a field
since: 3.0
index: `sorted(xs, key=lambda r: r.year)`
`sorted(items, key=...)` sorts by whatever the key function returns; `reverse=True` flips it.
```python
books = [("Dune", 1965), ("Emma", 1815), ("Ulysses", 1922)]
for title, year in sorted(books, key=lambda book: book[1]):
    print(year, title)
```
Bridge: Rust `xs.sort_by_key(|r| r.year)` · Go `slices.SortFunc(xs, func(a, b T) int { return cmp.Compare(a.Year, b.Year) })` · TypeScript `xs.toSorted((a, b) => a.year - b.year)` · Lua `table.sort(xs, function(a, b) return a.year < b.year end)`

## filter-map: keep some items and transform them
since: 3.0
index: `[f(x) for x in xs if p(x)]`
A list comprehension reads "this, for each item, if that"; it keeps and transforms in one line.
```python
temps = [12, 25, 31, 8, 28]
warm_f = [t * 9 / 5 + 32 for t in temps if t > 20]
print(warm_f)
```
Bridge: Rust `xs.iter().filter(p).map(f).collect()` · Go a `for` loop with `append` · TypeScript `xs.filter(p).map(f)` · Lua a `for` loop with `table.insert`

## record-type: define a small record type with named fields
since: 3.7 (`slots=True` 3.10)
index: `@dataclass`
`@dataclass` writes `__init__`, `__repr__` and `==` for you from the field list.
```python
from dataclasses import dataclass

@dataclass(slots=True)
class Planet:
    name: str
    moons: int

earth = Planet("Earth", 1)
print(earth, earth == Planet("Earth", 1))
```
Bridge: Rust `struct` · Go `type T struct { … }` · TypeScript `type T = { … }` · Lua a table `{ name = …, moons = … }`

## maybe-value: represent "maybe there is no value"
since: 3.10 (the `X | None` hint)
index: `X | None`
Return `None` for "nothing found" and say so in the hint; the caller must check before using it.
```python
def first_long(words: list[str]) -> str | None:
    for w in words:
        if len(w) > 6:
            return w
    return None

found = first_long(["fig", "kiwi"])
print("none found" if found is None else found)
```
Bridge: Rust `Option<T>` · Go `(v, ok)` or a pointer · TypeScript `T | undefined` · Lua `nil`

## errors: report a failure and handle it
since: 3.0
index: `raise` with `try`/`except`
`raise` a specific exception with a message; the caller catches that type and nothing broader.
```python
def withdraw(balance: int, amount: int) -> int:
    if amount > balance:
        raise ValueError(f"cannot take {amount}, only {balance} left")
    return balance - amount

try:
    withdraw(10, 25)
except ValueError as err:
    print("refused:", err)
```
Bridge: Rust `Result<T, E>` with `?` · Go `return fmt.Errorf("...: %w", err)` · TypeScript `throw new Error(...)` with `try`/`catch` · Lua `error(msg)` with `pcall`

## read-file: read a text file line by line
since: 3.0
index: `for line in open(p)`
`with open(...)` closes the file for you; iterating the file gives one line at a time, newline included.
```python
import tempfile
from pathlib import Path

path = Path(tempfile.mkdtemp()) / "poem.txt"
path.write_text("roses are red\nviolets are blue\n")
with open(path, encoding="utf-8") as f:
    for number, line in enumerate(f, start=1):
        print(number, line.rstrip("\n"))
```
Bridge: Rust `BufReader::new(File::open(p)?).lines()` · Go `bufio.NewScanner(f)` · TypeScript `readFileSync(p, "utf8").split("\n")` · Lua `for line in io.lines(p)`

## write-file: write text to a file
since: 3.5
index: `Path(p).write_text(s)`
`Path.write_text` opens, writes and closes in one call; use `open(path, "a")` to append instead.
```python
import tempfile
from pathlib import Path

path = Path(tempfile.mkdtemp()) / "shopping.txt"
path.write_text("\n".join(["bread", "milk", "eggs"]) + "\n", encoding="utf-8")
print(path.read_text(encoding="utf-8"), end="")
```
Bridge: Rust `std::fs::write(p, s)?` · Go `os.WriteFile(p, b, 0o644)` · TypeScript `writeFileSync(p, s)` · Lua `io.open(p, "w"):write(s)`

## format-string: build a string from values
since: 3.6 (`{x=}` 3.8)
index: `f"{name}: {n:.2f}"`
An f-string puts expressions in `{}`; after `:` comes the format, such as `.2f` for two decimals.
```python
item, price, qty = "tea", 3.5, 4
print(f"{qty} x {item} = {price * qty:.2f} EUR")
print(f"{qty=}")
```
Bridge: Rust `format!("{name}: {n:.2}")` · Go `fmt.Sprintf("%s: %.2f", name, n)` · TypeScript `` `${name}: ${n.toFixed(2)}` `` · Lua `string.format("%s: %.2f", name, n)`

## split-join: split a string and join parts
since: 3.0
index: `s.split(",")` and `",".join(xs)`
`text.split(sep)` gives a list; `sep.join(list)` glues strings back together (the separator is the object).
```python
csv_line = "oak,pine,birch"
trees = csv_line.split(",")
print(trees)
print(" | ".join(t.upper() for t in trees))
```
Bridge: Rust `s.split(',')` and `xs.join(",")` · Go `strings.Split(s, ",")` and `strings.Join(xs, ",")` · TypeScript `s.split(",")` and `xs.join(",")` · Lua `s:gmatch("[^,]+")` and `table.concat(xs, ",")`

## test-function: write a unit test for a function
since: 3.0
index: `unittest` or `pytest`
A `unittest.TestCase` method per behaviour; `assertEqual(got, expected)` reports both values on failure. pytest runs the same file and also plain `assert`.
```python
import unittest

def initials(name: str) -> str:
    return "".join(part[0].upper() for part in name.split())

class InitialsTest(unittest.TestCase):
    def test_two_words(self):
        self.assertEqual(initials("ada lovelace"), "AL")

    def test_empty(self):
        self.assertEqual(initials(""), "")

unittest.main(argv=["cookbook"], exit=False)
```
Bridge: Rust `#[test]` in a `mod tests` · Go `func TestX(t *testing.T)` · TypeScript `test()` from `node:test` · Lua `assert(...)` or busted

## read-trace: read a stack trace (point to `tutor-stack-traces`)
since: -
index: `tutor-stack-traces`
A Python traceback reads bottom-up: the last line names the exception and its message, the frame just above it is where it happened, and frames higher up are the calls that led there. For the full walk-through, load `tutor-stack-traces` (section Python) and ask the learner which line of their own code appears lowest in the trace.
Bridge: Rust panic message plus `RUST_BACKTRACE=1` · Go `panic:` and the goroutine trace · TypeScript the stack, read top-down · Lua `stack traceback:`
