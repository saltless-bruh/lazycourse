---
name: tutor-javascript-cookbook
description: "Plain-words step → JavaScript idiom, each shown on a small unrelated example, with the minimum ECMAScript or Node version and bridge lines from Python, Rust, Go and Lua. Use whenever the learner knows what they want to do but not how to say it in JavaScript (how do I count words, read a file, sort by a field, handle a bad number…), when the design recipe reaches Map (step 5) or a [workflow] line says Map, even if nobody says 'cookbook'."
---

# JavaScript cookbook

How to use: find the learner's plain step below and show the idiom on the example here, not on their task. Seeing the construct work somewhere neutral and then applying it to their own code is where the learning happens; writing their line takes that away. The hint ladder still decides how much to give, so below rung 5 name the idiom and point at it.

Every example is an ES module and runs as `node file.mjs` (or `node file.js` in a package with `"type": "module"`).

## read-args: read the command-line arguments
since: Node 0.x
index: `process.argv.slice(2)`
`process.argv` holds the node binary and the script path first, so the arguments start at index 2.
```js
const given = process.argv.slice(2);
const words = given.length > 0 ? given : ["mercury", "venus"];
console.log(`${words.length} planets: ${words.join(", ")}`);
```
Bridge: Python `sys.argv[1:]` · Rust `std::env::args().skip(1)` · Go `os.Args[1:]` · Lua `arg[1]`

## parse-number: turn text into a number, handling bad input
since: ES2015 (`Number.isInteger`)
index: `Number(s)` then `Number.isNaN`
`Number(text)` never throws; bad input becomes `NaN`, so check the result before using it. `parseInt("12px")` gives 12, which hides bad input: prefer `Number`.
```js
for (const raw of ["21", "oops", "-4"]) {
  const celsius = Number(raw);
  if (!Number.isInteger(celsius)) {
    console.log(`${JSON.stringify(raw)} is not a whole number`);
    continue;
  }
  console.log(celsius, "C is", (celsius * 9) / 5 + 32, "F");
}
```
Bridge: Python `int(s)` with `except ValueError` · Rust `s.parse::<i64>()` returns a `Result` · Go `strconv.Atoi(s)` returns `(n, err)` · Lua `tonumber(s)` returns `nil`

## loop-index: loop over items with their position
since: ES2015
index: `for (const [i, x] of xs.entries())`
`array.entries()` yields `[index, item]` pairs; destructure them in a `for…of`.
```js
const rivers = ["Nile", "Amazon", "Yangtze"];
for (const [i, river] of rivers.entries()) {
  console.log(i + 1, river);
}
```
Bridge: Python `for i, x in enumerate(xs)` · Rust `for (i, x) in xs.iter().enumerate()` · Go `for i, x := range xs` · Lua `for i, x in ipairs(xs)`

## lookup-default: look up a key with a fallback value
since: ES2020 (`??`)
index: `m.get(k) ?? 0`
`Map.get` returns `undefined` for a missing key; `??` replaces only `null`/`undefined`, so a stored 0 survives (`||` would replace it).
```js
const stock = new Map([["apples", 3], ["pears", 0]]);
for (const fruit of ["apples", "pears", "plums"]) {
  console.log(fruit, stock.get(fruit) ?? 0);
}
```
Bridge: Python `d.get(k, 0)` · Rust `m.get(k).copied().unwrap_or(0)` · Go `v, ok := m[k]` · Lua `t[k] or 0`

## count-items: count how often each item appears
since: ES2020
index: `m.get(x) ?? 0` then `m.set`
Read the current count with a fallback of 0, add one, and store it back. A `Map` keeps any key safely; a plain object also has inherited keys like `constructor`.
```js
const colours = ["red", "blue", "red", "green", "red", "blue"];
const counts = new Map();
for (const c of colours) {
  counts.set(c, (counts.get(c) ?? 0) + 1);
}
console.log(counts);
```
Bridge: Python `Counter(xs)` · Rust `*counts.entry(x).or_insert(0) += 1` · Go `counts[x]++` · Lua `t[x] = (t[x] or 0) + 1`

## group-by: group items by a key
since: ES2024 / Node 21 (`Map.groupBy`)
index: `Map.groupBy(xs, f)`
`Map.groupBy(items, keyFn)` builds a `Map` from key to the array of items with that key.
```js
const animals = ["cat", "cow", "dog", "duck", "crow"];
const byLetter = Map.groupBy(animals, (name) => name[0]);
console.log(byLetter);
```
Bridge: Python `d.setdefault(k, []).append(x)` · Rust `m.entry(k).or_default().push(x)` · Go `g[k] = append(g[k], x)` · Lua `t[k] = t[k] or {}; table.insert(t[k], x)`

## sort-by: sort records by a field
since: ES2023 (`toSorted`)
index: `toSorted(compare)`
`toSorted(compare)` returns a sorted copy; the compare function returns negative, zero or positive. Without one, numbers sort as text (`10` before `9`).
```js
const books = [
  { title: "Dune", year: 1965 },
  { title: "Emma", year: 1815 },
  { title: "Ulysses", year: 1922 },
];
for (const b of books.toSorted((a, b) => a.year - b.year)) {
  console.log(b.year, b.title);
}
```
Bridge: Python `sorted(xs, key=lambda r: r.year)` · Rust `xs.sort_by_key(|r| r.year)` · Go `slices.SortFunc(xs, func(a, b T) int { return cmp.Compare(a.Year, b.Year) })` · Lua `table.sort(xs, function(a, b) return a.year < b.year end)`

## filter-map: keep some items and transform them
since: ES5
index: `xs.filter(p).map(f)`
`filter` keeps the items whose callback returns true; `map` turns each kept item into a new value.
```js
const temps = [12, 25, 31, 8, 28];
const warmF = temps.filter((t) => t > 20).map((t) => (t * 9) / 5 + 32);
console.log(warmF);
```
Bridge: Python `[f(x) for x in xs if p(x)]` · Rust `xs.iter().filter(p).map(f).collect()` · Go a `for` loop with `append` · Lua a `for` loop with `table.insert`

## record-type: define a small record type with named fields
since: ES2015 (shorthand properties, spread ES2018)
index: `{ name, moons }` object literal
A plain object literal is the record; a function that builds it names the fields in one place. `Object.freeze` makes it read-only.
```js
function planet(name, moons) {
  return Object.freeze({ name, moons });
}

const earth = planet("Earth", 1);
const copy = { ...earth };
console.log(earth, copy.name === earth.name && copy.moons === earth.moons);
```
Bridge: Python `@dataclass` · Rust `struct` · Go `type T struct { … }` · Lua a table `{ name = …, moons = … }`

## maybe-value: represent "maybe there is no value"
since: ES2020 (`?.`, `??`)
index: `undefined` checked with `===`
Return `undefined` when there is nothing; the caller checks before using it. `?.` reads through a missing value, `??` supplies a default.
```js
function firstLong(words) {
  return words.find((w) => w.length > 6);
}

const found = firstLong(["fig", "kiwi"]);
console.log(found === undefined ? "none found" : found.toUpperCase());
console.log(firstLong(["fig"])?.length ?? 0);
```
Bridge: Python `None` · Rust `Option<T>` · Go `(v, ok)` or a pointer · Lua `nil`

## errors: report a failure and handle it
since: ES2022 (`cause`)
index: `throw new Error(...)` with `try`/`catch`
`throw new Error(message)`; in `catch`, the value can be anything that was thrown, so check it is an `Error` first.
```js
function withdraw(balance, amount) {
  if (amount > balance) {
    throw new Error(`cannot take ${amount}, only ${balance} left`);
  }
  return balance - amount;
}

try {
  withdraw(10, 25);
} catch (e) {
  console.log("refused:", e instanceof Error ? e.message : String(e));
}
```
Bridge: Python `raise` with `try`/`except` · Rust `Result<T, E>` with `?` · Go `return fmt.Errorf("...: %w", err)` · Lua `error(msg)` with `pcall`

## read-file: read a text file line by line
since: Node 0.x (`fs`)
index: `readFileSync(p, "utf8")` then `split`
For small files, read the whole text and split on newlines; for big ones use `node:readline`.
```js
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const path = join(mkdtempSync(join(tmpdir(), "cb-")), "poem.txt");
writeFileSync(path, "roses are red\nviolets are blue\n");
const lines = readFileSync(path, "utf8").split("\n").filter((l) => l !== "");
lines.forEach((line, i) => console.log(i + 1, line));
```
Bridge: Python `for line in open(p)` · Rust `BufReader::new(File::open(p)?).lines()` · Go `bufio.NewScanner(f)` · Lua `for line in io.lines(p)`

## write-file: write text to a file
since: Node 0.x (`fs`)
index: `writeFileSync(p, s)`
`writeFileSync` creates or replaces the file; `appendFileSync` adds to the end instead.
```js
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const path = join(mkdtempSync(join(tmpdir(), "cb-")), "shopping.txt");
writeFileSync(path, ["bread", "milk", "eggs"].join("\n") + "\n");
process.stdout.write(readFileSync(path, "utf8"));
```
Bridge: Python `Path(p).write_text(s)` · Rust `std::fs::write(p, s)?` · Go `os.WriteFile(p, b, 0o644)` · Lua `io.open(p, "w"):write(s)`

## format-string: build a string from values
since: ES2015 (template literals)
index: `n.toFixed(2)` in a template literal
A template literal puts expressions in `${}`; `toFixed(2)` gives two decimals as a string.
```js
const item = "tea", price = 3.5, qty = 4;
console.log(`${qty} x ${item} = ${(price * qty).toFixed(2)} EUR`);
```
Bridge: Python `f"{name}: {n:.2f}"` · Rust `format!("{name}: {n:.2}")` · Go `fmt.Sprintf("%s: %.2f", name, n)` · Lua `string.format("%s: %.2f", name, n)`

## split-join: split a string and join parts
since: ES1
index: `s.split(",")` and `xs.join(",")`
`split(sep)` returns an array of strings; `join(sep)` glues an array back into one string.
```js
const trees = "oak,pine,birch".split(",");
console.log(trees, trees.length);
console.log(trees.map((t) => t.toUpperCase()).join(" | "));
```
Bridge: Python `s.split(",")` and `",".join(xs)` · Rust `s.split(',')` and `xs.join(",")` · Go `strings.Split(s, ",")` and `strings.Join(xs, ",")` · Lua `s:gmatch("[^,]+")` and `table.concat(xs, ",")`

## test-function: write a unit test for a function
since: Node 18 (`node:test`)
index: `test()` from `node:test`
`test(name, fn)` from `node:test` registers a test; `assert.equal(actual, expected)` from `node:assert/strict` reports both on failure. Run a test file with `node --test` (or the project's `npm test`).
```js
import { test } from "node:test";
import assert from "node:assert/strict";

function initials(name) {
  return name.split(" ").filter((p) => p !== "").map((p) => p[0].toUpperCase()).join("");
}

test("two words", () => {
  assert.equal(initials("ada lovelace"), "AL");
});

test("empty", () => {
  assert.equal(initials(""), "");
});
```
Bridge: Python `unittest` or `pytest` · Rust `#[test]` in a `mod tests` · Go `func TestX(t *testing.T)` · Lua `assert(...)` or busted

## read-trace: read a stack trace (point to `tutor-stack-traces`)
since: -
index: `tutor-stack-traces`
A Node error prints the message first, then `at function (file:line:col)` lines, newest call first; the first line that points into the learner's own files is usually where to look. For the full walk-through, load `tutor-stack-traces` (section JavaScript).
Bridge: Python the traceback, read bottom-up · Rust panic message plus `RUST_BACKTRACE=1` · Go `panic:` and the goroutine trace · Lua `stack traceback:`
